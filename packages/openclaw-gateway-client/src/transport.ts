import {
  createSignedGatewayDevice,
  loadOrCreateGatewayDeviceIdentity,
} from "./device-auth.js";
import type {
  ConnectErrorRecoveryAdvice,
  GatewayClientDescriptor,
  GatewayConnectOptions,
  GatewayConnectionState,
  GatewayErrorShape,
  GatewayDeviceIdentity,
  GatewayEventFrame,
  GatewayEventGap,
  GatewayHelloOk,
  GatewayInboundFrame,
  GatewayPhasedRequest,
  GatewayRequestFrame,
  GatewayResponseFrame,
  GatewayWaitOptions,
} from "./types.js";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type PendingSingle = {
  mode: "single";
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type PendingPhased = {
  mode: "phased";
  ackSeen: boolean;
  acceptedResolve: (value: unknown) => void;
  finalResolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type PendingRequest = PendingSingle | PendingPhased;

export class GatewayRequestError extends Error {
  readonly gatewayCode: string;
  readonly details?: unknown;

  constructor(error: GatewayErrorShape) {
    super(error.message ?? "gateway request failed");
    this.name = "GatewayRequestError";
    this.gatewayCode = error.code ?? "UNAVAILABLE";
    this.details = error.details;
  }
}

const CONNECT_ERROR_DETAIL_CODES = {
  AUTH_TOKEN_MISSING: "AUTH_TOKEN_MISSING",
  AUTH_TOKEN_MISMATCH: "AUTH_TOKEN_MISMATCH",
  AUTH_PASSWORD_MISSING: "AUTH_PASSWORD_MISSING",
  AUTH_PASSWORD_MISMATCH: "AUTH_PASSWORD_MISMATCH",
  AUTH_DEVICE_TOKEN_MISMATCH: "AUTH_DEVICE_TOKEN_MISMATCH",
  AUTH_RATE_LIMITED: "AUTH_RATE_LIMITED",
  CONTROL_UI_DEVICE_IDENTITY_REQUIRED: "CONTROL_UI_DEVICE_IDENTITY_REQUIRED",
  DEVICE_IDENTITY_REQUIRED: "DEVICE_IDENTITY_REQUIRED",
  PAIRING_REQUIRED: "PAIRING_REQUIRED",
} as const;

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isResponseFrame(value: unknown): value is GatewayResponseFrame {
  return (
    isRecord(value) &&
    value.type === "res" &&
    typeof value.id === "string" &&
    typeof value.ok === "boolean"
  );
}

function isEventFrame(value: unknown): value is GatewayEventFrame {
  return (
    isRecord(value) &&
    value.type === "event" &&
    typeof value.event === "string"
  );
}

function readStatus(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  return typeof payload.status === "string" ? payload.status : undefined;
}

async function readMessageData(data: unknown): Promise<string | null> {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  if (data instanceof Blob) {
    return data.text();
  }
  return null;
}

function guessPlatform(): string {
  const globalRecord = globalThis as Record<string, unknown>;
  const processLike = isRecord(globalRecord.process) ? globalRecord.process : null;
  if (processLike && isRecord(processLike.versions) && typeof processLike.versions.node === "string") {
    return "node";
  }
  if (typeof navigator !== "undefined" && typeof navigator.platform === "string") {
    return navigator.platform || "unknown";
  }
  return "unknown";
}

function buildClientDescriptor(options: GatewayConnectOptions): GatewayClientDescriptor {
  return {
    id: options.client?.id ?? "gateway-client",
    version: options.client?.version ?? "0.1.0",
    platform: options.client?.platform ?? guessPlatform(),
    mode: options.client?.mode ?? "backend",
    displayName: options.client?.displayName,
    deviceFamily: options.client?.deviceFamily,
    modelIdentifier: options.client?.modelIdentifier,
    instanceId: options.client?.instanceId,
  };
}

const DEFAULT_CONNECT_CAPS = ["tool-events"] as const;

function buildConnectCaps(options: GatewayConnectOptions): string[] {
  const requestedCaps = options.caps
    ?.map((value) => value.trim())
    .filter(Boolean) ?? [];
  return Array.from(new Set([...DEFAULT_CONNECT_CAPS, ...requestedCaps]));
}

function normalizeAuthToken(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeDeviceIdentity(
  value: GatewayDeviceIdentity | null | undefined,
): GatewayDeviceIdentity | undefined {
  if (!value) {
    return undefined;
  }
  const deviceId = value.deviceId?.trim();
  const publicKeyPem = value.publicKeyPem?.trim();
  const privateKeyPem = value.privateKeyPem?.trim();
  if (!deviceId || !publicKeyPem || !privateKeyPem) {
    return undefined;
  }
  return {
    deviceId,
    publicKeyPem,
    privateKeyPem,
  };
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const unbracketed =
    normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;
  return (
    unbracketed === "localhost" ||
    unbracketed === "::1" ||
    /^127(?:\.\d{1,3}){3}$/u.test(unbracketed) ||
    /^::ffff:127(?:\.\d{1,3}){3}$/u.test(unbracketed)
  );
}

function isSecureGatewayUrl(url: string, allowInsecureWs: boolean): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol === "wss:") {
    return true;
  }

  if (parsed.protocol !== "ws:") {
    return false;
  }

  return allowInsecureWs || isLoopbackHost(parsed.hostname);
}

function readConnectErrorDetailCode(details: unknown): string | null {
  if (!isRecord(details)) {
    return null;
  }
  return typeof details.code === "string" && details.code.trim().length > 0
    ? details.code.trim()
    : null;
}

function readConnectErrorRecoveryAdvice(details: unknown): ConnectErrorRecoveryAdvice {
  if (!isRecord(details)) {
    return {};
  }
  const nextStep =
    typeof details.recommendedNextStep === "string" ? details.recommendedNextStep.trim() : "";
  return {
    canRetryWithDeviceToken:
      typeof details.canRetryWithDeviceToken === "boolean"
        ? details.canRetryWithDeviceToken
        : undefined,
    recommendedNextStep:
      nextStep === "retry_with_device_token" ||
      nextStep === "update_auth_configuration" ||
      nextStep === "update_auth_credentials" ||
      nextStep === "wait_then_retry" ||
      nextStep === "review_auth_configuration"
        ? nextStep
        : undefined,
  };
}

function isHelloOkPayload(value: unknown): value is GatewayHelloOk {
  return isRecord(value) && typeof value.protocol === "number";
}

export class GatewayTransport {
  private readonly options: Required<
    Pick<
      GatewayConnectOptions,
      | "connectChallengeTimeoutMs"
      | "maxReconnectDelayMs"
      | "reconnect"
      | "reconnectDelayMs"
      | "tickWatchMinIntervalMs"
    >
  > &
    Omit<
      GatewayConnectOptions,
      | "connectChallengeTimeoutMs"
      | "maxReconnectDelayMs"
      | "reconnect"
      | "reconnectDelayMs"
      | "tickWatchMinIntervalMs"
    >;

  private socket: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private connectDeferred: Deferred<GatewayHelloOk> | null = null;
  private connectRequestId: string | null = null;
  private challengeNonce: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private challengeTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectDelayMs: number;
  private lastTickAt: number | null = null;
  private lastSeq: number | null = null;
  private explicitClose = false;
  private pendingDeviceTokenRetry = false;
  private deviceTokenRetryBudgetUsed = false;
  private pendingConnectErrorDetailCode: string | null = null;
  private lastConnectUsedStoredDeviceToken = false;

  private state: GatewayConnectionState = "idle";
  private helloValue: GatewayHelloOk | null = null;

  private readonly statusListeners = new Set<(state: GatewayConnectionState) => void>();
  private readonly helloListeners = new Set<(hello: GatewayHelloOk) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private readonly gapListeners = new Set<(gap: GatewayEventGap) => void>();
  private readonly anyEventListeners = new Set<(frame: GatewayEventFrame) => void>();
  private readonly inboundFrameListeners = new Set<(frame: GatewayInboundFrame) => void>();
  private readonly namedEventListeners = new Map<
    string,
    Set<(frame: GatewayEventFrame) => void>
  >();

  constructor(options: GatewayConnectOptions) {
    this.options = {
      ...options,
      connectChallengeTimeoutMs: options.connectChallengeTimeoutMs ?? 2_000,
      maxReconnectDelayMs: options.maxReconnectDelayMs ?? 30_000,
      reconnect: options.reconnect ?? true,
      reconnectDelayMs: options.reconnectDelayMs ?? 1_000,
      tickWatchMinIntervalMs: options.tickWatchMinIntervalMs ?? 1_000,
    };
    this.reconnectDelayMs = this.options.reconnectDelayMs;
  }

  get hello(): GatewayHelloOk | null {
    return this.helloValue;
  }

  get features(): GatewayHelloOk["features"] | undefined {
    return this.helloValue?.features;
  }

  get connectionState(): GatewayConnectionState {
    return this.state;
  }

  isMethodAvailable(method: string): boolean {
    const methods = this.helloValue?.features?.methods;
    return Array.isArray(methods) ? methods.includes(method) : false;
  }

  isEventAvailable(eventName: string): boolean {
    const events = this.helloValue?.features?.events;
    return Array.isArray(events) ? events.includes(eventName) : false;
  }

  onStatus(listener: (state: GatewayConnectionState) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onHello(listener: (hello: GatewayHelloOk) => void): () => void {
    this.helloListeners.add(listener);
    return () => this.helloListeners.delete(listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onGap(listener: (gap: GatewayEventGap) => void): () => void {
    this.gapListeners.add(listener);
    return () => this.gapListeners.delete(listener);
  }

  onAnyEvent(listener: (frame: GatewayEventFrame) => void): () => void {
    this.anyEventListeners.add(listener);
    return () => this.anyEventListeners.delete(listener);
  }

  onInboundFrame(listener: (frame: GatewayInboundFrame) => void): () => void {
    this.inboundFrameListeners.add(listener);
    return () => this.inboundFrameListeners.delete(listener);
  }

  onEvent<TPayload = unknown>(
    eventName: string,
    listener: (frame: GatewayEventFrame<TPayload>) => void,
  ): () => void {
    const current = this.namedEventListeners.get(eventName) ?? new Set();
    current.add(listener as (frame: GatewayEventFrame) => void);
    this.namedEventListeners.set(eventName, current);
    return () => {
      const listeners = this.namedEventListeners.get(eventName);
      if (!listeners) {
        return;
      }
      listeners.delete(listener as (frame: GatewayEventFrame) => void);
      if (listeners.size === 0) {
        this.namedEventListeners.delete(eventName);
      }
    };
  }

  async connect(): Promise<GatewayHelloOk> {
    if (this.helloValue) {
      return this.helloValue;
    }
    if (this.connectDeferred) {
      return this.connectDeferred.promise;
    }

    this.explicitClose = false;
    this.connectDeferred = createDeferred<GatewayHelloOk>();
    const deferred = this.connectDeferred;
    this.openSocket(this.state === "connected" ? "reconnecting" : "connecting");
    return deferred.promise;
  }

  close(code = 1000, reason = "client closed"): void {
    this.explicitClose = true;
    this.pendingDeviceTokenRetry = false;
    this.deviceTokenRetryBudgetUsed = false;
    this.pendingConnectErrorDetailCode = null;
    this.lastConnectUsedStoredDeviceToken = false;
    this.clearReconnectTimer();
    this.clearChallengeTimer();
    this.stopTickWatch();
    this.setState("closed");
    this.socket?.close(code, reason);
    this.socket = null;
    this.rejectPending(new Error(`gateway closed (${code}): ${reason}`));
    this.rejectConnectIfPending(new Error(`gateway closed (${code}): ${reason}`));
  }

  async request<TResponse = unknown>(method: string, params?: unknown): Promise<TResponse> {
    await this.connect();
    const deferred = createDeferred<TResponse>();
    this.sendRequest(method, params, {
      mode: "single",
      resolve: (value) => deferred.resolve(value as TResponse),
      reject: (reason) => deferred.reject(reason),
    });
    return deferred.promise;
  }

  async requestPhased<TAccepted = unknown, TFinal = unknown>(
    method: string,
    params?: unknown,
  ): Promise<GatewayPhasedRequest<TAccepted, TFinal>> {
    await this.connect();
    const accepted = createDeferred<TAccepted>();
    const final = createDeferred<TFinal>();
    this.sendRequest(method, params, {
      mode: "phased",
      ackSeen: false,
      acceptedResolve: (value) => accepted.resolve(value as TAccepted),
      finalResolve: (value) => final.resolve(value as TFinal),
      reject: (reason) => {
        accepted.reject(reason);
        final.reject(reason);
      },
    });
    return { accepted: accepted.promise, final: final.promise };
  }

  waitForEvent<TPayload = unknown>(
    eventName: string,
    predicate?: (payload: TPayload, frame: GatewayEventFrame<TPayload>) => boolean,
    options: GatewayWaitOptions = {},
  ): Promise<GatewayEventFrame<TPayload>> {
    return new Promise<GatewayEventFrame<TPayload>>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let removeAbort: (() => void) | null = null;

      const unsubscribe = this.onEvent<TPayload>(eventName, (frame) => {
        const payload = frame.payload as TPayload;
        if (predicate && !predicate(payload, frame)) {
          return;
        }
        cleanup();
        resolve(frame);
      });

      const cleanup = () => {
        unsubscribe();
        if (timer) {
          clearTimeout(timer);
        }
        if (removeAbort) {
          removeAbort();
        }
      };

      if (typeof options.timeoutMs === "number" && options.timeoutMs > 0) {
        timer = setTimeout(() => {
          cleanup();
          reject(new Error(`timed out waiting for ${eventName}`));
        }, options.timeoutMs);
      }

      if (options.signal) {
        const onAbort = () => {
          cleanup();
          reject(options.signal?.reason ?? new Error("aborted"));
        };
        options.signal.addEventListener("abort", onAbort, { once: true });
        removeAbort = () => options.signal?.removeEventListener("abort", onAbort);
      }
    });
  }

  private openSocket(nextState: GatewayConnectionState): void {
    this.clearReconnectTimer();
    this.clearChallengeTimer();
    this.stopTickWatch();

    const url = this.options.url ?? "ws://127.0.0.1:18789";
    if (!isSecureGatewayUrl(url, this.options.allowInsecureWs ?? false)) {
      let displayHost = url;
      try {
        displayHost = new URL(url).hostname || url;
      } catch {
        // Keep the raw URL if parsing fails.
      }
      const error = new Error(
        `cannot connect to "${displayHost}" over insecure ws://; use wss:// or a loopback URL`,
      );
      this.emitError(error);
      this.rejectConnectIfPending(error);
      this.setState("idle");
      return;
    }
    this.setState(nextState);
    this.socket = new WebSocket(url);
    this.socket.addEventListener("open", () => this.handleOpen());
    this.socket.addEventListener("message", (event) => {
      void this.handleSocketMessage(event.data);
    });
    this.socket.addEventListener("close", (event) => this.handleClose(event));
    this.socket.addEventListener("error", () => {
      this.emitError(new Error("gateway websocket error"));
    });
  }

  private handleOpen(): void {
    this.challengeNonce = null;
    this.connectRequestId = null;
    this.startChallengeTimer();
  }

  private async handleSocketMessage(data: unknown): Promise<void> {
    const raw = await readMessageData(data);
    if (!raw) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      this.emitError(
        error instanceof Error ? error : new Error(`failed to parse frame: ${String(error)}`),
      );
      return;
    }

    if (isEventFrame(parsed)) {
      this.emitInboundFrame(parsed);
      this.handleEventFrame(parsed);
      return;
    }
    if (isResponseFrame(parsed)) {
      this.emitInboundFrame(parsed);
      this.handleResponseFrame(parsed);
    }
  }

  private handleEventFrame(frame: GatewayEventFrame): void {
    if (frame.event === "connect.challenge") {
      const payload = isRecord(frame.payload) ? frame.payload : null;
      const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
      if (!nonce) {
        const error = new Error("gateway connect challenge missing nonce");
        this.emitError(error);
        this.socket?.close(1008, error.message);
        return;
      }
      this.challengeNonce = nonce;
      this.clearChallengeTimer();
      void this.sendConnectRequest(nonce);
      return;
    }

    if (typeof frame.seq === "number") {
      if (this.lastSeq !== null && frame.seq > this.lastSeq + 1) {
        const gap = { expected: this.lastSeq + 1, received: frame.seq };
        for (const listener of this.gapListeners) {
          listener(gap);
        }
      }
      this.lastSeq = frame.seq;
    }

    if (frame.event === "tick") {
      this.lastTickAt = Date.now();
    }

    for (const listener of this.anyEventListeners) {
      listener(frame);
    }

    const listeners = this.namedEventListeners.get(frame.event);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(frame);
    }
  }

  private handleResponseFrame(frame: GatewayResponseFrame): void {
    const pending = this.pending.get(frame.id);
    if (!pending) {
      return;
    }

    if (!frame.ok) {
      this.pending.delete(frame.id);
      pending.reject(new GatewayRequestError(frame.error ?? {}));
      return;
    }

    if (pending.mode === "phased") {
      const status = readStatus(frame.payload);
      if (status === "accepted") {
        pending.ackSeen = true;
        pending.acceptedResolve(frame.payload);
        return;
      }
      if (!pending.ackSeen) {
        pending.ackSeen = true;
        pending.acceptedResolve(frame.payload);
      }
      this.pending.delete(frame.id);
      pending.finalResolve(frame.payload);
      return;
    }

    this.pending.delete(frame.id);
    pending.resolve(frame.payload);
  }

  private async sendConnectRequest(nonce: string): Promise<void> {
    if (this.connectRequestId) {
      return;
    }

    const id = crypto.randomUUID();
    this.connectRequestId = id;
    const protocolVersion = this.options.protocolVersion ?? 3;
    const role = this.options.role ?? "operator";
    const url = this.options.url ?? "ws://127.0.0.1:18789";
    const explicitGatewayToken = normalizeAuthToken(this.options.auth?.token);
    const explicitPassword = normalizeAuthToken(this.options.auth?.password);
    const explicitDeviceToken = normalizeAuthToken(this.options.auth?.deviceToken);
    const clientDescriptor = buildClientDescriptor(this.options);
    let storedDeviceToken: string | undefined;
    let deviceIdentity: GatewayDeviceIdentity | undefined;
    try {
      storedDeviceToken = normalizeAuthToken(
        await this.options.loadDeviceToken?.({
          url,
          role,
        }),
      );
      const loadedIdentity =
        this.options.deviceIdentity === null
          ? undefined
          : normalizeDeviceIdentity(
              this.options.deviceIdentity ??
                (await this.options.loadDeviceIdentity?.({
                  url,
                  role,
                  path: this.options.deviceIdentityPath,
                })) ??
                loadOrCreateGatewayDeviceIdentity(this.options.deviceIdentityPath),
            );
      deviceIdentity = loadedIdentity;
    } catch (error) {
      this.connectRequestId = null;
      const wrapped =
        error instanceof Error
          ? error
          : new Error(`failed to prepare connect auth state: ${String(error)}`);
      this.emitError(wrapped);
      this.rejectConnectIfPending(wrapped);
      this.socket?.close(1008, "connect setup failed");
      return;
    }
    const shouldUseRetryToken =
      this.pendingDeviceTokenRetry &&
      !explicitDeviceToken &&
      Boolean(explicitGatewayToken) &&
      Boolean(storedDeviceToken) &&
      this.isTrustedDeviceRetryEndpoint();
    if (shouldUseRetryToken) {
      this.pendingDeviceTokenRetry = false;
    }
    const resolvedDeviceToken =
      explicitDeviceToken ??
      (shouldUseRetryToken || !(explicitGatewayToken || explicitPassword)
        ? storedDeviceToken
        : undefined);
    const authToken = explicitGatewayToken ?? resolvedDeviceToken;
    const auth =
      authToken || explicitPassword || resolvedDeviceToken
        ? {
            token: authToken,
            password: explicitPassword,
            deviceToken: resolvedDeviceToken,
          }
        : undefined;
    const scopes = this.options.scopes ?? ["operator.admin"];
    const caps = buildConnectCaps(this.options);
    const signedAtMs = Date.now();
    const signatureToken = explicitGatewayToken ?? resolvedDeviceToken ?? null;
    const device =
      deviceIdentity === undefined
        ? undefined
        : createSignedGatewayDevice({
            identity: deviceIdentity,
            clientId: clientDescriptor.id,
            clientMode: clientDescriptor.mode,
            role,
            scopes,
            signedAtMs,
            token: signatureToken,
            nonce,
            platform: clientDescriptor.platform,
            deviceFamily: clientDescriptor.deviceFamily,
          });
    this.lastConnectUsedStoredDeviceToken =
      Boolean(resolvedDeviceToken) &&
      !explicitDeviceToken &&
      resolvedDeviceToken === storedDeviceToken;
    const frame: GatewayRequestFrame = {
      type: "req",
      id,
      method: "connect",
      params: {
        minProtocol: protocolVersion,
        maxProtocol: protocolVersion,
        client: clientDescriptor,
        role,
        scopes,
        caps,
        auth,
        device,
        pathEnv: this.options.pathEnv,
        locale: this.options.locale,
        userAgent: this.options.userAgent,
      },
    };

    this.pending.set(id, {
      mode: "single",
      resolve: (value) => {
        if (!isHelloOkPayload(value)) {
          const error = new Error("gateway connect returned an invalid hello payload");
          this.connectRequestId = null;
          this.rejectConnectIfPending(error);
          this.socket?.close(1008, error.message);
          return;
        }
        const hello = value;
        this.connectRequestId = null;
        this.pendingConnectErrorDetailCode = null;
        this.pendingDeviceTokenRetry = false;
        this.deviceTokenRetryBudgetUsed = false;
        this.helloValue = hello;
        this.lastTickAt = Date.now();
        this.reconnectDelayMs = this.options.reconnectDelayMs;
        this.startTickWatch();
        this.setState("connected");
        const deviceToken = hello.auth?.deviceToken;
        if (deviceToken) {
          this.options.onDeviceToken?.(deviceToken, hello);
          void this.options.storeDeviceToken?.({
            url,
            role,
            token: deviceToken,
            hello,
          });
        }
        this.connectDeferred?.resolve(hello);
        this.connectDeferred = null;
        for (const listener of this.helloListeners) {
          listener(hello);
        }
      },
      reject: (reason) => {
        this.connectRequestId = null;
        if (reason instanceof GatewayRequestError) {
          this.pendingConnectErrorDetailCode = readConnectErrorDetailCode(reason.details);
          if (
            this.shouldRetryWithStoredDeviceToken({
              detailCode: this.pendingConnectErrorDetailCode,
              recoveryAdvice: readConnectErrorRecoveryAdvice(reason.details),
              explicitGatewayToken,
              resolvedDeviceToken,
              storedDeviceToken,
            })
          ) {
            this.pendingDeviceTokenRetry = true;
            this.deviceTokenRetryBudgetUsed = true;
            this.reconnectDelayMs = Math.min(this.reconnectDelayMs, 250);
          }
        } else {
          this.pendingConnectErrorDetailCode = null;
        }
        this.rejectConnectIfPending(reason);
        this.socket?.close(1008, "connect failed");
      },
    });

    this.socket?.send(JSON.stringify(frame));
  }

  private sendRequest(method: string, params: unknown, pending: PendingRequest): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      pending.reject(new Error("gateway not connected"));
      return;
    }
    const id = crypto.randomUUID();
    const frame: GatewayRequestFrame = {
      type: "req",
      id,
      method,
      params,
    };
    this.pending.set(id, pending);
    this.socket.send(JSON.stringify(frame));
  }

  private handleClose(event: CloseEvent): void {
    const reason = event.reason || "socket closed";
    this.socket = null;
    this.helloValue = null;
    this.connectRequestId = null;
    this.challengeNonce = null;
    this.clearChallengeTimer();
    this.stopTickWatch();
    if (
      this.pendingConnectErrorDetailCode === CONNECT_ERROR_DETAIL_CODES.AUTH_DEVICE_TOKEN_MISMATCH &&
      this.lastConnectUsedStoredDeviceToken
    ) {
      const url = this.options.url ?? "ws://127.0.0.1:18789";
      const role = this.options.role ?? "operator";
      void this.options.clearDeviceToken?.({ url, role });
    }
    this.lastConnectUsedStoredDeviceToken = false;
    this.rejectPending(new Error(`gateway closed (${event.code}): ${reason}`));
    this.rejectConnectIfPending(new Error(`gateway closed (${event.code}): ${reason}`));

    if (this.explicitClose) {
      this.setState("closed");
      return;
    }

    this.setState("idle");
    if (this.shouldPauseReconnectAfterAuthFailure(this.pendingConnectErrorDetailCode)) {
      return;
    }
    if (!this.options.reconnect) {
      return;
    }

    const nextDelay = Math.min(this.reconnectDelayMs * 2, this.options.maxReconnectDelayMs);
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = nextDelay;
    this.reconnectTimer = setTimeout(() => {
      this.openSocket("reconnecting");
    }, delay);
  }

  private startChallengeTimer(): void {
    this.clearChallengeTimer();
    this.challengeTimer = setTimeout(() => {
      if (!this.connectRequestId) {
        const error = new Error("gateway connect challenge timeout");
        this.emitError(error);
        this.socket?.close(1008, error.message);
      }
    }, this.options.connectChallengeTimeoutMs);
  }

  private clearChallengeTimer(): void {
    if (this.challengeTimer) {
      clearTimeout(this.challengeTimer);
      this.challengeTimer = null;
    }
  }

  private startTickWatch(): void {
    this.stopTickWatch();
    const serverInterval = this.helloValue?.policy?.tickIntervalMs;
    const tickIntervalMs =
      typeof serverInterval === "number" && serverInterval > 0 ? serverInterval : 30_000;
    const interval = Math.max(tickIntervalMs, this.options.tickWatchMinIntervalMs);
    this.tickTimer = setInterval(() => {
      if (this.lastTickAt === null) {
        return;
      }
      const gapMs = Date.now() - this.lastTickAt;
      if (gapMs > tickIntervalMs * 2) {
        this.socket?.close(4000, "tick timeout");
      }
    }, interval);
  }

  private stopTickWatch(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.lastTickAt = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private rejectPending(reason: unknown): void {
    for (const pending of this.pending.values()) {
      pending.reject(reason);
    }
    this.pending.clear();
  }

  private rejectConnectIfPending(reason: unknown): void {
    if (!this.connectDeferred) {
      return;
    }
    this.connectDeferred.reject(reason);
    this.connectDeferred = null;
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  private emitInboundFrame(frame: GatewayInboundFrame): void {
    for (const listener of this.inboundFrameListeners) {
      listener(frame);
    }
  }

  private setState(state: GatewayConnectionState): void {
    this.state = state;
    for (const listener of this.statusListeners) {
      listener(state);
    }
  }

  private shouldPauseReconnectAfterAuthFailure(detailCode: string | null): boolean {
    if (!detailCode) {
      return false;
    }
    if (
      detailCode === CONNECT_ERROR_DETAIL_CODES.AUTH_TOKEN_MISSING ||
      detailCode === CONNECT_ERROR_DETAIL_CODES.AUTH_PASSWORD_MISSING ||
      detailCode === CONNECT_ERROR_DETAIL_CODES.AUTH_PASSWORD_MISMATCH ||
      detailCode === CONNECT_ERROR_DETAIL_CODES.AUTH_RATE_LIMITED ||
      detailCode === CONNECT_ERROR_DETAIL_CODES.PAIRING_REQUIRED ||
      detailCode === CONNECT_ERROR_DETAIL_CODES.CONTROL_UI_DEVICE_IDENTITY_REQUIRED ||
      detailCode === CONNECT_ERROR_DETAIL_CODES.DEVICE_IDENTITY_REQUIRED
    ) {
      return true;
    }
    if (detailCode !== CONNECT_ERROR_DETAIL_CODES.AUTH_TOKEN_MISMATCH) {
      return false;
    }
    if (this.pendingDeviceTokenRetry) {
      return false;
    }
    return this.deviceTokenRetryBudgetUsed || !this.isTrustedDeviceRetryEndpoint();
  }

  private shouldRetryWithStoredDeviceToken(params: {
    detailCode: string | null;
    recoveryAdvice: ConnectErrorRecoveryAdvice;
    explicitGatewayToken?: string;
    storedDeviceToken?: string;
    resolvedDeviceToken?: string;
  }): boolean {
    if (this.deviceTokenRetryBudgetUsed) {
      return false;
    }
    if (params.resolvedDeviceToken) {
      return false;
    }
    if (!params.explicitGatewayToken || !params.storedDeviceToken) {
      return false;
    }
    if (!this.isTrustedDeviceRetryEndpoint()) {
      return false;
    }
    return (
      params.recoveryAdvice.canRetryWithDeviceToken === true ||
      params.recoveryAdvice.recommendedNextStep === "retry_with_device_token" ||
      params.detailCode === CONNECT_ERROR_DETAIL_CODES.AUTH_TOKEN_MISMATCH
    );
  }

  private isTrustedDeviceRetryEndpoint(): boolean {
    const rawUrl = this.options.url ?? "ws://127.0.0.1:18789";
    try {
      const parsed = new URL(rawUrl);
      return isLoopbackHost(parsed.hostname) || parsed.protocol === "wss:";
    } catch {
      return false;
    }
  }
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import type { Duplex } from "node:stream";

import { OpenClawGatewayClient } from "../src/client.js";
import { GatewayRequestError, GatewayTransport } from "../src/transport.js";
import type { GatewayHelloOk, GatewayInboundFrame, GatewayRequestFrame } from "../src/types.js";

type DeviceTokenStoreCall = {
  url: string;
  role: string;
  token: string;
  hello: GatewayHelloOk;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type Closeable = {
  close: (code?: number, reason?: string) => void;
};

type LocalGatewayHandler = (
  frame: GatewayRequestFrame,
  connection: LocalGatewayConnection,
) => void | Promise<void>;

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitFor<T>(predicate: () => T | undefined, timeoutMs = 250): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = predicate();
    if (value !== undefined) {
      return value;
    }
    await sleep(1);
  }
  throw new Error("timed out waiting for condition");
}

function isEventListenerObject(
  value: EventListenerOrEventListenerObject,
): value is EventListenerObject {
  return typeof value === "object" && value !== null && "handleEvent" in value;
}

function encodeServerFrame(payload: string): Buffer {
  const body = Buffer.from(payload, "utf8");
  if (body.length < 126) {
    return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  }
  if (body.length < 65_536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([header, body]);
}

function decodeMaskedPayload(payload: Buffer, mask: Buffer): Buffer {
  const decoded = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    decoded[index] = payload[index] ^ mask[index % 4];
  }
  return decoded;
}

class LocalGatewayConnection {
  private buffer = Buffer.alloc(0);
  private nextSeq = 0;

  constructor(
    private readonly socket: Duplex,
    private readonly onFrame: (frame: GatewayRequestFrame, connection: LocalGatewayConnection) => void,
  ) {
    socket.on("data", (chunk) => this.handleData(chunk));
  }

  sendFrame(frame: unknown): void {
    this.socket.write(encodeServerFrame(JSON.stringify(frame)));
  }

  sendResponse(id: string, payload: unknown, ok = true): void {
    this.sendFrame({
      type: "res",
      id,
      ok,
      payload: ok ? payload : undefined,
      error: ok ? undefined : payload,
    });
  }

  sendEvent(event: string, payload: unknown, seq = ++this.nextSeq): void {
    this.sendFrame({
      type: "event",
      event,
      seq,
      payload,
    });
  }

  close(): void {
    this.socket.end();
    this.socket.destroy();
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < 4) {
          return;
        }
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) {
          return;
        }
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskBytes = masked ? 4 : 0;
      const frameLength = offset + maskBytes + length;
      if (this.buffer.length < frameLength) {
        return;
      }

      const payloadStart = offset + maskBytes;
      const payloadEnd = payloadStart + length;
      const rawPayload = this.buffer.subarray(payloadStart, payloadEnd);
      const payload =
        masked && maskBytes === 4
          ? decodeMaskedPayload(rawPayload, this.buffer.subarray(offset, offset + 4))
          : rawPayload;
      this.buffer = this.buffer.subarray(frameLength);

      if (opcode === 0x8) {
        this.close();
        return;
      }
      if (opcode !== 0x1) {
        continue;
      }

      const parsed = JSON.parse(payload.toString("utf8")) as GatewayRequestFrame;
      this.onFrame(parsed, this);
    }
  }
}

class LocalGatewayServer {
  private readonly server: Server;
  private readonly sockets = new Set<Duplex>();
  connectFrame: GatewayRequestFrame | null = null;

  private constructor(
    private readonly hello: GatewayHelloOk,
    private readonly handlers: Record<string, LocalGatewayHandler>,
  ) {
    this.server = createServer();
    this.server.on("upgrade", (request, socket) => this.handleUpgrade(request, socket));
  }

  static async start(options: {
    hello?: GatewayHelloOk;
    handlers?: Record<string, LocalGatewayHandler>;
  } = {}): Promise<LocalGatewayServer> {
    const server = new LocalGatewayServer(
      options.hello ?? {
        protocol: 3,
        features: {
          methods: ["models.list", "chat.send", "wizard.start", "wizard.cancel"],
          events: ["chat"],
        },
        auth: {
          role: "operator",
          scopes: ["operator.admin"],
        },
        policy: {
          tickIntervalMs: 5_000,
        },
      },
      options.handlers ?? {},
    );
    await new Promise<void>((resolve) => server.server.listen(0, "localhost", resolve));
    return server;
  }

  get url(): string {
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("local gateway server is not listening");
    }
    return `ws://localhost:${address.port}`;
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private handleUpgrade(request: IncomingMessage, socket: Duplex): void {
    const key = request.headers["sec-websocket-key"];
    if (typeof key !== "string" || !key) {
      socket.destroy();
      return;
    }

    const accept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");

    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "",
        "",
      ].join("\r\n"),
    );

    this.sockets.add(socket);
    socket.on("close", () => this.sockets.delete(socket));

    const connection = new LocalGatewayConnection(socket, (frame, activeConnection) => {
      void this.handleFrame(frame, activeConnection);
    });
    connection.sendEvent("connect.challenge", { nonce: "nonce-1" }, 1);
  }

  private async handleFrame(
    frame: GatewayRequestFrame,
    connection: LocalGatewayConnection,
  ): Promise<void> {
    if (frame.method === "connect") {
      this.connectFrame = frame;
      connection.sendResponse(frame.id, this.hello);
      return;
    }

    const handler = this.handlers[frame.method];
    if (!handler) {
      connection.sendFrame({
        type: "res",
        id: frame.id,
        ok: false,
        error: {
          code: "METHOD_NOT_FOUND",
          message: `Unhandled method: ${frame.method}`,
        },
      });
      return;
    }

    await handler(frame, connection);
  }
}

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  static reset(): void {
    MockWebSocket.instances = [];
  }

  readonly url: string;
  readonly sent: string[] = [];
  readyState = MockWebSocket.CONNECTING;

  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const current = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    current.add(listener);
    this.listeners.set(type, current);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const current = this.listeners.get(type);
    current?.delete(listener);
    if (current && current.size === 0) {
      this.listeners.delete(type);
    }
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === MockWebSocket.CLOSED) {
      return;
    }
    this.readyState = MockWebSocket.CLOSING;
    this.emit("close", {
      code,
      reason,
    });
    this.readyState = MockWebSocket.CLOSED;
  }

  emitOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open");
  }

  emitMessage(frame: unknown): void {
    this.emit("message", {
      data: JSON.stringify(frame),
    });
  }

  emitError(): void {
    this.emit("error");
  }

  private emit(type: string, extra?: Record<string, unknown>): void {
    const event = Object.assign(new Event(type), extra);
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      if (isEventListenerObject(listener)) {
        listener.handleEvent(event);
        continue;
      }
      listener(event);
    }
  }
}

const originalWebSocket = globalThis.WebSocket;
const activeCloseables = new Set<Closeable>();

function installMockWebSocket(): void {
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: MockWebSocket,
  });
  MockWebSocket.reset();
}

function restoreWebSocket(): void {
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: originalWebSocket,
  });
  MockWebSocket.reset();
}

function trackCloseable<T extends Closeable>(value: T): T {
  activeCloseables.add(value);
  return value;
}

function lastSentFrame(socket: MockWebSocket): GatewayRequestFrame {
  const raw = socket.sent.at(-1);
  assert.ok(raw, "expected a sent request frame");
  return JSON.parse(raw) as GatewayRequestFrame;
}

async function establishConnection(
  transport: GatewayTransport,
  hello: GatewayHelloOk = {
    protocol: 3,
    features: {
      methods: ["chat.send", "models.list", "agent"],
      events: ["chat"],
    },
    auth: {
      role: "operator",
      scopes: ["operator.admin"],
    },
    policy: {
      tickIntervalMs: 20,
    },
  },
): Promise<{
  connectFrame: GatewayRequestFrame;
  hello: GatewayHelloOk;
  socket: MockWebSocket;
}> {
  const connectPromise = transport.connect();
  const socket = await waitFor(() => MockWebSocket.instances[0]);
  socket.emitOpen();
  socket.emitMessage({
    type: "event",
    event: "connect.challenge",
    payload: { nonce: "nonce-1" },
  });
  await flushMicrotasks();

  const connectFrame = lastSentFrame(socket);
  socket.emitMessage({
    type: "res",
    id: connectFrame.id,
    ok: true,
    payload: hello,
  });

  return {
    connectFrame,
    hello: await connectPromise,
    socket,
  };
}

afterEach(() => {
  for (const closeable of activeCloseables) {
    closeable.close();
  }
  activeCloseables.clear();
  restoreWebSocket();
});

function createTempDeviceIdentityPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-gateway-client-"));
  return path.join(dir, "device.json");
}

test("connects, sends expected connect defaults, and handles single-response requests", async () => {
  installMockWebSocket();
  const transport = trackCloseable(new GatewayTransport({
    url: "ws://localhost:18789",
    auth: { token: "shared-token" },
    deviceIdentityPath: createTempDeviceIdentityPath(),
  }));

  const { connectFrame, hello, socket } = await establishConnection(transport);
  const params = connectFrame.params as Record<string, unknown>;
  const client = params.client as Record<string, unknown>;
  const auth = params.auth as Record<string, unknown>;

  assert.equal(connectFrame.method, "connect");
  assert.equal(params.role, "operator");
  assert.deepEqual(params.scopes, ["operator.admin"]);
  assert.deepEqual(params.caps, ["tool-events"]);
  assert.equal(client.id, "gateway-client");
  assert.equal(client.mode, "backend");
  assert.equal(client.platform, "node");
  assert.equal(auth.token, "shared-token");
  assert.equal(auth.deviceToken, undefined);
  assert.equal(typeof params.device, "object");
  assert.equal(typeof (params.device as Record<string, unknown>).id, "string");
  assert.equal((params.device as Record<string, unknown>).nonce, "nonce-1");
  assert.equal(hello.protocol, 3);

  const responsePromise = transport.request<{ models: string[] }>("models.list");
  await flushMicrotasks();
  const requestFrame = lastSentFrame(socket);
  assert.equal(requestFrame.method, "models.list");
  socket.emitMessage({
    type: "res",
    id: requestFrame.id,
    ok: true,
    payload: { models: ["gpt-5"] },
  });
  const response = await responsePromise;
  assert.deepEqual(response, { models: ["gpt-5"] });
});

test("allows explicitly disabling device identity on connect", async () => {
  installMockWebSocket();
  const transport = trackCloseable(new GatewayTransport({
    url: "ws://localhost:18789",
    auth: { token: "shared-token" },
    deviceIdentity: null,
  }));

  const { connectFrame } = await establishConnection(transport);
  const params = connectFrame.params as Record<string, unknown>;
  assert.equal(params.device, undefined);
});

test("handles accepted-plus-final phased responses", async () => {
  installMockWebSocket();
  const transport = trackCloseable(new GatewayTransport({
    url: "ws://localhost:18789",
  }));
  const { socket } = await establishConnection(transport);

  const phased = await transport.requestPhased<{ status: string }, { status: string; runId: string }>(
    "agent",
    { message: "run task" },
  );
  const requestFrame = lastSentFrame(socket);

  socket.emitMessage({
    type: "res",
    id: requestFrame.id,
    ok: true,
    payload: { status: "accepted" },
  });
  assert.deepEqual(await phased.accepted, { status: "accepted" });

  socket.emitMessage({
    type: "res",
    id: requestFrame.id,
    ok: true,
    payload: { status: "completed", runId: "run-1" },
  });
  assert.deepEqual(await phased.final, { status: "completed", runId: "run-1" });
});

test("treats a single final phased response as both accepted and final", async () => {
  installMockWebSocket();
  const transport = trackCloseable(new GatewayTransport({
    url: "ws://localhost:18789",
  }));
  const { socket } = await establishConnection(transport);

  const phased = await transport.requestPhased<{ status: string }, { status: string; runId: string }>(
    "agent",
    { message: "run task" },
  );
  const requestFrame = lastSentFrame(socket);

  socket.emitMessage({
    type: "res",
    id: requestFrame.id,
    ok: true,
    payload: { status: "completed", runId: "run-2" },
  });

  assert.deepEqual(await phased.accepted, { status: "completed", runId: "run-2" });
  assert.deepEqual(await phased.final, { status: "completed", runId: "run-2" });
});

test("client chat helper waits for the final chat event and reports sequence gaps", async () => {
  installMockWebSocket();
  const client = trackCloseable(new OpenClawGatewayClient({
    url: "ws://localhost:18789",
  }));
  const gaps: Array<{ expected: number; received: number }> = [];
  client.onGap((gap) => gaps.push(gap));

  const { socket } = await establishConnection(client.transport);
  const resultPromise = client.chat.sendAndWaitFinal({
    sessionKey: "session-1",
    message: "hello",
  });
  await flushMicrotasks();

  const requestFrame = lastSentFrame(socket);
  assert.equal(requestFrame.method, "chat.send");
  socket.emitMessage({
    type: "res",
    id: requestFrame.id,
    ok: true,
    payload: { runId: "run-1", status: "accepted" },
  });
  await flushMicrotasks();
  socket.emitMessage({
    type: "event",
    event: "chat",
    seq: 1,
    payload: { runId: "run-1", state: "delta" },
  });
  socket.emitMessage({
    type: "event",
    event: "chat",
    seq: 3,
    payload: { runId: "run-1", state: "final", message: "done" },
  });

  const result = await resultPromise;
  assert.equal(result.ack.runId, "run-1");
  assert.equal(result.final.state, "final");
  assert.equal(result.final.message, "done");
  assert.deepEqual(gaps, [{ expected: 2, received: 3 }]);
});

test("exposes inbound frames without changing connect challenge handling", async () => {
  installMockWebSocket();
  const client = trackCloseable(new OpenClawGatewayClient({
    url: "ws://localhost:18789",
  }));
  const inboundFrames: GatewayInboundFrame[] = [];
  client.onInboundFrame((frame) => inboundFrames.push(frame));

  const connectPromise = client.connect();
  const socket = await waitFor(() => MockWebSocket.instances[0]);
  socket.emitOpen();
  socket.emitMessage({
    type: "event",
    event: "connect.challenge",
    payload: { nonce: "nonce-1" },
  });
  await flushMicrotasks();

  const connectFrame = lastSentFrame(socket);
  socket.emitMessage({
    type: "res",
    id: connectFrame.id,
    ok: true,
    payload: {
      protocol: 3,
      features: {
        methods: ["health"],
        events: ["chat"],
      },
      policy: {
        tickIntervalMs: 20,
      },
    },
  });

  await connectPromise;
  assert.deepEqual(
    inboundFrames.map((frame) => frame.type === "event" ? frame.event : frame.id),
    ["connect.challenge", connectFrame.id],
  );
});

test("rejects insecure remote ws endpoints before opening a socket", async () => {
  installMockWebSocket();
  const transport = trackCloseable(new GatewayTransport({
    url: "ws://10.0.0.5:18789",
  }));

  await assert.rejects(transport.connect(), /insecure ws:\/\//);
  assert.equal(MockWebSocket.instances.length, 0);
  assert.equal(transport.connectionState, "idle");
});

test("pauses reconnect after terminal auth failures", async () => {
  installMockWebSocket();
  const transport = trackCloseable(new GatewayTransport({
    url: "ws://localhost:18789",
    reconnect: true,
    reconnectDelayMs: 1,
    maxReconnectDelayMs: 5,
  }));

  const connectPromise = transport.connect();
  const socket = await waitFor(() => MockWebSocket.instances[0]);
  socket.emitOpen();
  socket.emitMessage({
    type: "event",
    event: "connect.challenge",
    payload: { nonce: "nonce-1" },
  });
  await flushMicrotasks();

  const connectFrame = lastSentFrame(socket);
  socket.emitMessage({
    type: "res",
    id: connectFrame.id,
    ok: false,
    error: {
      code: "UNAUTHORIZED",
      message: "missing token",
      details: { code: "AUTH_TOKEN_MISSING" },
    },
  });

  await assert.rejects(connectPromise, GatewayRequestError);
  await sleep(10);
  assert.equal(MockWebSocket.instances.length, 1);
  assert.equal(transport.connectionState, "idle");
});

test("retries once with a stored device token and persists the refreshed token", async () => {
  installMockWebSocket();
  const helloSeen = createDeferred<GatewayHelloOk>();
  const storeCalls: DeviceTokenStoreCall[] = [];
  const transport = trackCloseable(new GatewayTransport({
    url: "ws://localhost:18789",
    auth: { token: "shared-token" },
    reconnect: true,
    reconnectDelayMs: 1,
    maxReconnectDelayMs: 5,
    loadDeviceToken: () => "stored-device-token",
    storeDeviceToken: (params) => {
      storeCalls.push({
        url: params.url,
        role: params.role,
        token: params.token,
        hello: params.hello,
      });
    },
  }));
  transport.onHello((hello) => helloSeen.resolve(hello));

  const firstConnect = transport.connect();
  const firstSocket = await waitFor(() => MockWebSocket.instances[0]);
  firstSocket.emitOpen();
  firstSocket.emitMessage({
    type: "event",
    event: "connect.challenge",
    payload: { nonce: "nonce-1" },
  });
  await flushMicrotasks();

  const firstConnectFrame = lastSentFrame(firstSocket);
  const firstAuth = (firstConnectFrame.params as { auth?: Record<string, unknown> }).auth;
  assert.equal(firstAuth?.token, "shared-token");
  assert.equal(firstAuth?.deviceToken, undefined);

  firstSocket.emitMessage({
    type: "res",
    id: firstConnectFrame.id,
    ok: false,
    error: {
      code: "UNAUTHORIZED",
      message: "shared token mismatch",
      details: {
        code: "AUTH_TOKEN_MISMATCH",
        canRetryWithDeviceToken: true,
      },
    },
  });

  await assert.rejects(firstConnect, GatewayRequestError);

  const secondSocket = await waitFor(() => MockWebSocket.instances[1]);
  secondSocket.emitOpen();
  secondSocket.emitMessage({
    type: "event",
    event: "connect.challenge",
    payload: { nonce: "nonce-2" },
  });
  await flushMicrotasks();

  const secondConnectFrame = lastSentFrame(secondSocket);
  const secondAuth = (secondConnectFrame.params as { auth?: Record<string, unknown> }).auth;
  assert.equal(secondAuth?.token, "shared-token");
  assert.equal(secondAuth?.deviceToken, "stored-device-token");

  const helloPayload: GatewayHelloOk = {
    protocol: 3,
    auth: {
      role: "operator",
      scopes: ["operator.admin"],
      deviceToken: "fresh-device-token",
    },
    policy: {
      tickIntervalMs: 20,
    },
  };
  secondSocket.emitMessage({
    type: "res",
    id: secondConnectFrame.id,
    ok: true,
    payload: helloPayload,
  });

  const hello = await helloSeen.promise;
  assert.equal(hello.auth?.deviceToken, "fresh-device-token");
  await waitFor(() => (storeCalls.length > 0 ? storeCalls[0] : undefined));
  assert.equal(storeCalls[0]?.token, "fresh-device-token");
});

test("clears a stale stored device token after device-token mismatch", async () => {
  installMockWebSocket();
  const cleared: Array<{ url: string; role: string }> = [];
  const transport = trackCloseable(new GatewayTransport({
    url: "ws://localhost:18789",
    reconnect: false,
    loadDeviceToken: () => "stale-device-token",
    clearDeviceToken: (params) => {
      cleared.push({ url: params.url, role: params.role });
    },
  }));

  const connectPromise = transport.connect();
  const socket = await waitFor(() => MockWebSocket.instances[0]);
  socket.emitOpen();
  socket.emitMessage({
    type: "event",
    event: "connect.challenge",
    payload: { nonce: "nonce-1" },
  });
  await flushMicrotasks();

  const connectFrame = lastSentFrame(socket);
  const auth = (connectFrame.params as { auth?: Record<string, unknown> }).auth;
  assert.equal(auth?.token, "stale-device-token");
  assert.equal(auth?.deviceToken, "stale-device-token");

  socket.emitMessage({
    type: "res",
    id: connectFrame.id,
    ok: false,
    error: {
      code: "UNAUTHORIZED",
      message: "device token mismatch",
      details: { code: "AUTH_DEVICE_TOKEN_MISMATCH" },
    },
  });

  await assert.rejects(connectPromise, GatewayRequestError);
  await waitFor(() => (cleared.length > 0 ? cleared[0] : undefined));
  assert.deepEqual(cleared[0], {
    url: "ws://localhost:18789",
    role: "operator",
  });
});

test("rejects invalid hello payloads from connect", async () => {
  installMockWebSocket();
  const transport = trackCloseable(new GatewayTransport({
    url: "ws://localhost:18789",
    reconnect: false,
  }));

  const connectPromise = transport.connect();
  const socket = await waitFor(() => MockWebSocket.instances[0]);
  socket.emitOpen();
  socket.emitMessage({
    type: "event",
    event: "connect.challenge",
    payload: { nonce: "nonce-1" },
  });
  await flushMicrotasks();

  const connectFrame = lastSentFrame(socket);
  socket.emitMessage({
    type: "res",
    id: connectFrame.id,
    ok: true,
    payload: { type: "hello-ok" },
  });

  await assert.rejects(connectPromise, /invalid hello payload/);
});

test("waitForEvent supports timeout and abort", async () => {
  installMockWebSocket();
  const transport = trackCloseable(new GatewayTransport({
    url: "ws://localhost:18789",
  }));
  await establishConnection(transport);

  await assert.rejects(
    transport.waitForEvent("chat", undefined, { timeoutMs: 5 }),
    /timed out waiting for chat/,
  );

  const controller = new AbortController();
  const waitPromise = transport.waitForEvent("chat", undefined, {
    signal: controller.signal,
  });
  controller.abort(new Error("stop waiting"));
  await assert.rejects(waitPromise, /stop waiting/);
});

test("talks to a standalone local gateway server over a real websocket", async () => {
  const gateway = await LocalGatewayServer.start({
    handlers: {
      "models.list": (frame, connection) => {
        connection.sendResponse(frame.id, {
          models: [
            {
              id: "fake-model",
              name: "Fake Model",
              provider: "local-test",
            },
          ],
        });
      },
      "chat.send": (frame, connection) => {
        connection.sendResponse(frame.id, {
          runId: "run-local-1",
          status: "accepted",
        });
        setTimeout(() => {
          connection.sendEvent("chat", {
            runId: "run-local-1",
            state: "final",
            message: "done",
          });
        }, 0);
      },
    },
  });

  try {
    const client = trackCloseable(new OpenClawGatewayClient({
      url: gateway.url,
      auth: { token: "shared-token" },
      client: {
        id: "gateway-client",
        version: "test",
        mode: "backend",
        platform: "node",
      },
    }));

    const hello = await client.connect();
    assert.equal(hello.protocol, 3);
    assert.equal(client.connectionState, "connected");
    assert.equal(client.isMethodAvailable("models.list"), true);

    const connectFrame = gateway.connectFrame;
    assert.ok(connectFrame);
    assert.equal(connectFrame.method, "connect");
    const connectParams = connectFrame.params as Record<string, unknown>;
    const connectClient = connectParams.client as Record<string, unknown>;
    const connectAuth = connectParams.auth as Record<string, unknown>;
    assert.equal(connectClient.id, "gateway-client");
    assert.equal(connectClient.mode, "backend");
    assert.equal(connectClient.platform, "node");
    assert.equal(connectAuth.token, "shared-token");

    const models = await client.models.list();
    assert.deepEqual(models.models, [
      {
        id: "fake-model",
        name: "Fake Model",
        provider: "local-test",
      },
    ]);

    const chatResult = await client.chat.sendAndWaitFinal({
      sessionKey: "session-1",
      message: "hello from socket test",
    });
    assert.equal(chatResult.ack.runId, "run-local-1");
    assert.equal(chatResult.final.state, "final");
    assert.equal(chatResult.final.message, "done");
  } finally {
    await gateway.close();
  }
});

test("uses only standalone test fixtures for wizard flows over a real websocket", async () => {
  const gateway = await LocalGatewayServer.start({
    handlers: {
      "wizard.start": (frame, connection) => {
        connection.sendResponse(frame.id, {
          sessionId: "wiz-1",
          done: false,
          status: "running",
          step: {
            id: "step-1",
            type: "text",
            message: "Enter a value",
          },
        });
      },
      "wizard.cancel": (frame, connection) => {
        connection.sendResponse(frame.id, {
          status: "cancelled",
          error: "cancelled",
        });
      },
    },
  });

  try {
    const client = trackCloseable(new OpenClawGatewayClient({
      url: gateway.url,
      auth: { token: "shared-token" },
    }));

    const started = await client.wizard.start({ mode: "local" });
    assert.equal(started.sessionId, "wiz-1");
    assert.equal(started.done, false);
    assert.equal(started.status, "running");
    assert.equal(started.step?.type, "text");

    const cancelled = await client.wizard.cancel({ sessionId: started.sessionId });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.error, "cancelled");
  } finally {
    await gateway.close();
  }
});

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type GatewayAuth = {
  token?: string;
  deviceToken?: string;
};

export type GatewayDeviceIdentity = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
};

export type GatewayClientId =
  | "webchat-ui"
  | "openclaw-control-ui"
  | "webchat"
  | "cli"
  | "gateway-client"
  | "openclaw-macos"
  | "openclaw-ios"
  | "openclaw-android"
  | "node-host"
  | "test"
  | "fingerprint"
  | "openclaw-probe";

export type GatewayClientMode =
  | "webchat"
  | "cli"
  | "ui"
  | "backend"
  | "node"
  | "probe"
  | "test";

export type GatewayRole = "operator" | "node" | (string & {});

export type GatewayClientDescriptor = {
  id: GatewayClientId;
  version: string;
  platform: string;
  mode: GatewayClientMode;
  displayName?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  instanceId?: string;
};

export type GatewayConnectOptions = {
  url?: string;
  auth?: GatewayAuth;
  role?: GatewayRole;
  scopes?: string[];
  caps?: string[];
  protocolVersion?: number;
  client?: Partial<GatewayClientDescriptor> & Pick<GatewayClientDescriptor, "id">;
  pathEnv?: string;
  locale?: string;
  userAgent?: string;
  allowInsecureWs?: boolean;
  reconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  connectChallengeTimeoutMs?: number;
  tickWatchMinIntervalMs?: number;
  onDeviceToken?: (token: string, hello: GatewayHelloOk) => void;
  deviceIdentity?: GatewayDeviceIdentity | null;
  deviceIdentityPath?: string;
  loadDeviceIdentity?: (
    params: Readonly<{ url: string; role: GatewayRole; path?: string }>,
  ) => GatewayDeviceIdentity | null | undefined | Promise<GatewayDeviceIdentity | null | undefined>;
  loadDeviceToken?: (
    params: Readonly<{ url: string; role: GatewayRole }>,
  ) => string | null | undefined | Promise<string | null | undefined>;
  storeDeviceToken?: (
    params: Readonly<{
      url: string;
      role: GatewayRole;
      token: string;
      hello: GatewayHelloOk;
    }>,
  ) => void | Promise<void>;
  clearDeviceToken?: (
    params: Readonly<{ url: string; role: GatewayRole }>,
  ) => void | Promise<void>;
};

export type GatewayRequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

export type GatewayErrorShape = {
  code?: string;
  message?: string;
  details?: JsonValue;
};

export type ConnectErrorRecoveryNextStep =
  | "retry_with_device_token"
  | "update_auth_configuration"
  | "update_auth_credentials"
  | "wait_then_retry"
  | "review_auth_configuration";

export type ConnectErrorRecoveryAdvice = {
  canRetryWithDeviceToken?: boolean;
  recommendedNextStep?: ConnectErrorRecoveryNextStep;
};

export type GatewayResponseFrame<TPayload = unknown> = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: TPayload;
  error?: GatewayErrorShape;
};

export type GatewayEventFrame<TPayload = unknown> = {
  type: "event";
  event: string;
  payload?: TPayload;
  seq?: number;
  stateVersion?: Record<string, number>;
};

export type GatewayInboundFrame = GatewayResponseFrame | GatewayEventFrame;

export type GatewayFrame =
  | GatewayRequestFrame
  | GatewayResponseFrame
  | GatewayEventFrame;

export type GatewayHelloOk = {
  type?: "hello-ok";
  protocol: number;
  server?: {
    version?: string;
    connId?: string;
    [key: string]: unknown;
  };
  features?: {
    methods?: string[];
    events?: string[];
    [key: string]: unknown;
  };
  snapshot?: Record<string, unknown>;
  policy?: {
    maxPayload?: number;
    maxBufferedBytes?: number;
    tickIntervalMs?: number;
    [key: string]: unknown;
  };
  auth?: {
    role?: string;
    scopes?: string[];
    deviceToken?: string;
    [key: string]: unknown;
  };
  canvasHostUrl?: string;
  [key: string]: unknown;
};

export type GatewayConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed";

export type GatewayEventGap = {
  expected: number;
  received: number;
};

export type GatewayWaitOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type GatewayPhasedRequest<TAccepted, TFinal> = {
  accepted: Promise<TAccepted>;
  final: Promise<TFinal>;
};

export type InputProvenance = {
  kind: string;
  originSessionId?: string;
  sourceSessionKey?: string;
  sourceChannel?: string;
  sourceTool?: string;
};

export type TokenUsageSummary = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
};

export type ChatAttachment = {
  type: "image";
  mimeType: string;
  content: string;
};

export type ChatMessageRole =
  | "user"
  | "assistant"
  | "tool"
  | "system"
  | "other"
  | (string & {});

export type ChatMessageContentBlock =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      mimeType?: string;
      content?: string;
      source?: {
        type?: string;
        media_type?: string;
        data?: string;
      };
    }
  | {
      type: "toolcall";
      name: string;
      arguments?: JsonValue;
    }
  | {
      type: "toolresult";
      name: string;
      text?: string;
    }
  | ({
      type?: string;
    } & Record<string, JsonValue>);

export type ChatMessage = {
  role: ChatMessageRole;
  content?: ChatMessageContentBlock[];
  text?: string;
  timestamp?: number;
  runId?: string;
  toolCallId?: string;
} & Record<string, JsonValue>;

export type SessionOrigin = {
  label?: string;
  provider?: string;
  surface?: string;
  chatType?: string;
  from?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
};

export type DeliveryContext = {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
};

export type GatewaySessionsDefaults = {
  modelProvider: string | null;
  model: string | null;
  contextTokens: number | null;
};

export type GatewaySessionRow = {
  key: string;
  spawnedBy?: string;
  kind: "direct" | "group" | "global" | "unknown";
  label?: string;
  displayName?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  channel?: string;
  subject?: string;
  groupChannel?: string;
  space?: string;
  chatType?: "direct" | "group" | "channel";
  origin?: SessionOrigin;
  updatedAt: number | null;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  sendPolicy?: "allow" | "deny";
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalTokensFresh?: boolean;
  responseUsage?: "on" | "off" | "tokens" | "full";
  modelProvider?: string;
  model?: string;
  contextTokens?: number;
  deliveryContext?: DeliveryContext;
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
};

export type SessionPreviewItem = {
  role: ChatMessageRole;
  text: string;
};

export type SessionsPreviewEntry = {
  key: string;
  status: "ok" | "empty" | "missing" | "error";
  items: SessionPreviewItem[];
};

export type SessionPatchEntry = Record<string, JsonValue> & {
  sessionId?: string;
  updatedAt?: number;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
};

export type ModelInputType = "text" | "image" | "document";

export type ModelCatalogEntry = {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: ModelInputType[];
};

export type PresenceEntry = {
  instanceId?: string | null;
  host?: string | null;
  ip?: string | null;
  version?: string | null;
  platform?: string | null;
  deviceFamily?: string | null;
  modelIdentifier?: string | null;
  roles?: string[] | null;
  scopes?: string[] | null;
  mode?: string | null;
  lastInputSeconds?: number | null;
  reason?: string | null;
  tags?: string[] | null;
  text?: string | null;
  ts?: number | null;
  deviceId?: string | null;
};

export type HealthSummary = {
  ok: true;
  ts: number;
  durationMs: number;
  channels: Record<string, Record<string, JsonValue>>;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  heartbeatSeconds: number;
  defaultAgentId: string;
  agents: Array<{
    agentId: string;
    name?: string;
    isDefault: boolean;
    heartbeat: Record<string, JsonValue>;
    sessions: {
      path: string;
      count: number;
      recent: Array<{
        key: string;
        updatedAt: number | null;
        age: number | null;
      }>;
    };
  }>;
  sessions: {
    path: string;
    count: number;
    recent: Array<{
      key: string;
      updatedAt: number | null;
      age: number | null;
    }>;
  };
};

export type ChannelUiMetaEntry = {
  id: string;
  label: string;
  detailLabel: string;
  systemImage?: string;
};

export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string | null;
  enabled?: boolean | null;
  configured?: boolean | null;
  linked?: boolean | null;
  running?: boolean | null;
  connected?: boolean | null;
  reconnectAttempts?: number | null;
  lastConnectedAt?: number | null;
  lastError?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastProbeAt?: number | null;
  mode?: string | null;
  dmPolicy?: string | null;
  allowFrom?: string[] | null;
  tokenSource?: string | null;
  botTokenSource?: string | null;
  appTokenSource?: string | null;
  credentialSource?: string | null;
  audienceType?: string | null;
  audience?: string | null;
  webhookPath?: string | null;
  webhookUrl?: string | null;
  baseUrl?: string | null;
  allowUnmentionedGroups?: boolean | null;
  cliPath?: string | null;
  dbPath?: string | null;
  port?: number | null;
  probe?: JsonValue;
  audit?: JsonValue;
  application?: JsonValue;
};

export type NodeSessionInfo = {
  nodeId: string;
  connId?: string;
  displayName?: string;
  platform?: string;
  version?: string;
  coreVersion?: string;
  uiVersion?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  remoteIp?: string;
  caps?: string[];
  commands?: string[];
  permissions?: Record<string, boolean>;
  pathEnv?: string;
  connectedAtMs?: number;
} & Record<string, JsonValue>;

export type NodePendingWorkItem = {
  id: string;
  type: "status.request" | "location.request";
  priority: "default" | "normal" | "high";
  createdAtMs: number;
  expiresAtMs: number | null;
  payload?: Record<string, JsonValue>;
};

export type DeviceTokenSummary = {
  role: string;
  scopes?: string[];
  createdAtMs?: number;
  rotatedAtMs?: number;
  revokedAtMs?: number;
  lastUsedAtMs?: number;
};

export type PendingDevice = {
  requestId: string;
  deviceId: string;
  publicKey?: string;
  displayName?: string;
  platform?: string;
  deviceFamily?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  remoteIp?: string;
  silent?: boolean;
  isRepair?: boolean;
  ts?: number;
};

export type PairedDevice = {
  deviceId: string;
  publicKey?: string;
  displayName?: string;
  platform?: string;
  deviceFamily?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  approvedScopes?: string[];
  remoteIp?: string;
  tokens?: DeviceTokenSummary[];
  createdAtMs?: number;
  approvedAtMs?: number;
};

export type ConfigSnapshotIssue = {
  path: string;
  message: string;
};

export type ConfigSnapshot = {
  path?: string | null;
  exists?: boolean | null;
  raw?: string | null;
  hash?: string | null;
  parsed?: JsonValue;
  valid?: boolean | null;
  config?: Record<string, JsonValue> | null;
  issues?: ConfigSnapshotIssue[] | null;
};

export type SessionUsageEntry = {
  key: string;
  label?: string;
  sessionId?: string;
  updatedAt?: number;
  agentId?: string;
  channel?: string;
  chatType?: string;
  origin?: SessionOrigin;
  modelOverride?: string;
  providerOverride?: string;
  modelProvider?: string;
  model?: string;
  usage: Record<string, JsonValue> | null;
  contextWeight?: JsonValue | null;
};

export type SessionsUsageResult = {
  updatedAt: number;
  startDate: string;
  endDate: string;
  sessions: SessionUsageEntry[];
  totals: Record<string, JsonValue>;
  aggregates: Record<string, JsonValue>;
};

export type CostUsageSummary = {
  updatedAt: number;
  days: number;
  daily: Array<Record<string, JsonValue> & { date: string }>;
  totals: Record<string, JsonValue>;
};

export type SessionUsageTimePoint = {
  timestamp: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  cumulativeTokens: number;
  cumulativeCost: number;
};

export type SessionUsageTimeSeries = {
  sessionId?: string;
  points: SessionUsageTimePoint[];
};

export type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string; staggerMs?: number };

export type CronSessionTarget = "main" | "isolated";
export type CronWakeMode = "next-heartbeat" | "now";
export type CronDeliveryStatus = "delivered" | "not-delivered" | "unknown" | "not-requested";
export type CronRunStatus = "ok" | "error" | "skipped";
export type CronFailoverReason =
  | "missing-target"
  | "missing-account"
  | "disabled"
  | "rate-limited"
  | (string & {});

export type CronPayload = Record<string, JsonValue>;
export type CronDelivery = {
  channel?: string;
  to?: string;
  mode?: "announce" | "webhook";
  accountId?: string;
};

export type CronFailureAlert = {
  after?: number;
  channel?: string;
  to?: string;
  cooldownMs?: number;
  mode?: "announce" | "webhook";
  accountId?: string;
};

export type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastRunStatus?: CronRunStatus;
  lastStatus?: CronRunStatus;
  lastError?: string;
  lastErrorReason?: CronFailoverReason;
  lastDurationMs?: number;
  consecutiveErrors?: number;
  lastDelivered?: boolean;
  lastDeliveryStatus?: CronDeliveryStatus;
  lastDeliveryError?: string;
  lastFailureAlertAtMs?: number;
};

export type CronJob = {
  id: string;
  agentId?: string;
  sessionKey?: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  payload: CronPayload;
  delivery?: CronDelivery;
  failureAlert?: false | CronFailureAlert;
  state?: CronJobState;
};

export type CronRunLogEntry = {
  ts: number;
  jobId: string;
  action?: "finished";
  jobName?: string;
  status?: CronRunStatus;
  durationMs?: number;
  error?: string;
  summary?: string;
  deliveryStatus?: CronDeliveryStatus;
  deliveryError?: string;
  delivered?: boolean;
  runAtMs?: number;
  nextRunAtMs?: number;
  model?: string;
  provider?: string;
  usage?: TokenUsageSummary;
  sessionId?: string;
  sessionKey?: string;
};

export type ExecApprovalRequestPayload = {
  command: string;
  cwd?: string | null;
  host?: string | null;
  security?: string | null;
  ask?: string | null;
  agentId?: string | null;
  resolvedPath?: string | null;
  sessionKey?: string | null;
};

export type SkillsStatusConfigCheck = {
  path: string;
  satisfied: boolean;
};

export type SkillInstallOption = {
  id: string;
  kind: "brew" | "node" | "go" | "uv";
  label: string;
  bins: string[];
};

export type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  filePath: string;
  baseDir: string;
  skillKey: string;
  bundled?: boolean;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  configChecks: SkillsStatusConfigCheck[];
  install: SkillInstallOption[];
};

export type SkillStatusReport = {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: SkillStatusEntry[];
};

export type ChatSendParams = {
  sessionKey: string;
  message: string;
  thinking?: string;
  deliver?: boolean;
  attachments?: ChatAttachment[];
  timeoutMs?: number;
  systemInputProvenance?: InputProvenance;
  systemProvenanceReceipt?: string;
  idempotencyKey?: string;
};

export type ChatSendAck = {
  runId: string;
  status: string;
  [key: string]: unknown;
};

export type ChatHistoryParams = {
  sessionKey: string;
  limit?: number;
};

export type ChatHistoryResult = {
  sessionKey: string;
  sessionId?: string;
  messages: ChatMessage[];
  thinkingLevel?: string;
  verboseLevel?: string;
  [key: string]: unknown;
};

export type ChatAbortParams = {
  sessionKey: string;
  runId?: string;
};

export type ChatAbortResult = {
  ok: boolean;
  aborted?: boolean;
  runIds?: string[];
  [key: string]: unknown;
};

export type ChatEventState = "delta" | "final" | "aborted" | "error" | (string & {});

export type ChatEventPayload = {
  runId: string;
  sessionKey?: string;
  seq?: number;
  state: ChatEventState;
  message?: ChatMessage;
  errorMessage?: string | null;
  usage?: TokenUsageSummary;
  stopReason?: string | null;
  [key: string]: unknown;
};

export type AgentRunParams = {
  message: string;
  idempotencyKey?: string;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  to?: string;
  replyTo?: string;
  channel?: string;
  replyChannel?: string;
  accountId?: string;
  replyAccountId?: string;
  threadId?: string;
  groupId?: string;
  groupChannel?: string;
  groupSpace?: string;
  thinking?: string;
  deliver?: boolean;
  timeout?: number;
  bestEffortDeliver?: boolean;
  lane?: string;
  extraSystemPrompt?: string;
  attachments?: ChatAttachment[];
  inputProvenance?: InputProvenance;
  internalEvents?: AgentInternalEvent[];
  label?: string;
};

export type AgentInternalEvent = {
  type: "task_completion";
  source: "subagent" | "cron";
  childSessionKey: string;
  childSessionId?: string;
  announceType: string;
  taskLabel: string;
  status: "ok" | "timeout" | "error" | "unknown";
  statusLabel: string;
  result: string;
  statsLine?: string;
  replyInstruction: string;
};

export type AgentAccepted = {
  status: "accepted" | string;
  runId?: string;
  createdAtMs?: number;
  expiresAtMs?: number;
  [key: string]: unknown;
};

export type AgentFinal = {
  runId?: string;
  status?: string;
  startedAt?: number;
  endedAt?: number;
  error?: GatewayErrorShape | string | JsonValue;
  [key: string]: unknown;
};

export type AgentWaitParams = {
  runId: string;
  timeoutMs?: number;
};

export type AgentIdentityParams = {
  agentId?: string;
  sessionKey?: string;
};

export type AgentIdentityResult = {
  agentId: string;
  name?: string;
  avatar?: string;
  emoji?: string;
  [key: string]: unknown;
};

export type AgentEventPayload = {
  runId?: string;
  seq?: number;
  stream?: string;
  ts?: number;
  data?: Record<string, JsonValue>;
  [key: string]: unknown;
};

export type SessionsListParams = Record<string, JsonValue>;

export type SessionsListResult = {
  ts: number;
  path: string;
  count: number;
  defaults: GatewaySessionsDefaults;
  sessions: GatewaySessionRow[];
};

export type SessionsPreviewParams = {
  keys: string[];
  limit?: number;
  maxChars?: number;
};

export type SessionsPreviewResult = {
  ts: number;
  previews: SessionsPreviewEntry[];
  [key: string]: unknown;
};

export type SessionsPatchParams = Record<string, JsonValue>;

export type SessionsPatchResult = {
  ok: true;
  path: string;
  key: string;
  entry: SessionPatchEntry;
  resolved?: {
    modelProvider?: string;
    model?: string;
  };
};

export type SessionsResetParams = {
  key: string;
  reason?: "new" | "reset" | (string & {});
};

export type SessionsResetResult = {
  ok: boolean;
  key: string;
  entry?: SessionPatchEntry;
  [key: string]: unknown;
};

export type SessionsDeleteParams = {
  key: string;
  deleteTranscript?: boolean;
  emitLifecycleHooks?: boolean;
};

export type SessionsDeleteResult = {
  ok: boolean;
  key: string;
  deleted?: boolean;
  archived?: boolean;
  [key: string]: unknown;
};

export type SessionsCompactParams = {
  key: string;
  reason?: string;
};

export type SessionsCompactResult = {
  ok: boolean;
  key: string;
  compacted?: boolean;
  reason?: string;
  [key: string]: unknown;
};

export type ModelsListResult = {
  models: ModelCatalogEntry[];
  [key: string]: unknown;
};

export type UsageStatusResult = Record<string, JsonValue>;

export type UsageCostParams = {
  start: string;
  end: string;
};

export type UsageCostResult = CostUsageSummary;

export type SendMessageParams = {
  to: string;
  message?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  gifPlayback?: boolean;
  channel?: string;
  accountId?: string;
  agentId?: string;
  threadId?: string;
  sessionKey?: string;
  idempotencyKey?: string;
};

export type SendMessageResult = {
  runId?: string;
  messageId?: string;
  channel?: string;
  chatId?: string;
  channelId?: string;
  toJid?: string;
  conversationId?: string;
  [key: string]: unknown;
};

export type ChannelsStatusParams = {
  probe?: boolean;
  timeoutMs?: number;
};

export type ChannelsStatusResult = {
  ts: number;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  channelDetailLabels?: Record<string, string>;
  channelSystemImages?: Record<string, string>;
  channelMeta?: ChannelUiMetaEntry[];
  channels: Record<string, Record<string, JsonValue>>;
  channelAccounts: Record<string, ChannelAccountSnapshot[]>;
  channelDefaultAccountId: Record<string, string>;
  [key: string]: unknown;
};

export type ChannelsLogoutParams = {
  channel: string;
  accountId?: string;
};

export type ChannelsLogoutResult = {
  channel: string;
  accountId: string;
  cleared: boolean;
  loggedOut?: boolean;
  [key: string]: JsonValue | undefined;
};

export type BrowserRequestMethod = "GET" | "POST" | "DELETE";

export type BrowserRequestParams = {
  method: BrowserRequestMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: JsonValue;
  timeoutMs?: number;
};

export type BrowserRequestResult = Record<string, JsonValue>;

export type WebLoginStartParams = {
  force?: boolean;
  timeoutMs?: number;
  verbose?: boolean;
  accountId?: string;
};

export type WebLoginStartResult = {
  qrDataUrl?: string;
  message?: string;
  [key: string]: unknown;
};

export type WebLoginWaitParams = {
  timeoutMs?: number;
  accountId?: string;
};

export type WebLoginWaitResult = {
  connected?: boolean;
  message?: string;
  [key: string]: unknown;
};

export type NodeListResult = {
  ts?: number;
  nodes: NodeSessionInfo[];
  [key: string]: unknown;
};

export type NodeDescribeParams = {
  nodeId: string;
};

export type NodeDescribeResult = {
  ts?: number;
  nodeId: string;
  [key: string]: unknown;
};

export type NodeInvokeParams = {
  nodeId: string;
  command: string;
  params?: JsonValue;
  timeoutMs?: number;
  idempotencyKey?: string;
};

export type NodeInvokeResult = {
  ok: boolean;
  nodeId: string;
  command: string;
  payload?: JsonValue;
  payloadJSON?: string | null;
  [key: string]: unknown;
};

export type NodePendingEnqueueParams = {
  nodeId: string;
  type: "status.request" | "location.request" | (string & {});
  priority?: "normal" | "high" | (string & {});
  expiresInMs?: number;
  wake?: boolean;
};

export type NodePendingEnqueueResult = {
  nodeId: string;
  revision: number;
  queued: NodePendingWorkItem;
  wakeTriggered: boolean;
  [key: string]: unknown;
};

export type DevicePairListResult = {
  pending: PendingDevice[];
  paired: PairedDevice[];
  [key: string]: unknown;
};

export type DevicePairDecisionParams = {
  requestId: string;
};

export type DevicePairRemoveParams = {
  deviceId: string;
};

export type DevicePairDecisionResult = Record<string, JsonValue>;

export type DeviceTokenRotateParams = {
  deviceId: string;
  role: string;
  scopes?: string[];
};

export type DeviceTokenRotateResult = {
  deviceId: string;
  role: string;
  token: string;
  scopes: string[];
  rotatedAtMs: number;
  [key: string]: unknown;
};

export type DeviceTokenRevokeParams = {
  deviceId: string;
  role: string;
};

export type DeviceTokenRevokeResult = {
  deviceId: string;
  role: string;
  revokedAtMs: number;
  [key: string]: unknown;
};

export type ConfigGetResult = ConfigSnapshot;

export type ConfigSetParams = {
  raw: string;
  baseHash?: string;
};

export type ConfigApplyLikeParams = {
  raw: string;
  baseHash?: string;
  sessionKey?: string;
  note?: string;
  restartDelayMs?: number;
};

export type ConfigWriteResult = {
  ok: boolean;
  path?: string;
  config?: JsonValue;
  restart?: JsonValue;
  sentinel?: JsonValue;
  [key: string]: unknown;
};

export type ConfigSchemaResult = {
  schema: JsonValue;
  uiHints: Record<string, JsonValue>;
  version: string;
  generatedAt: string;
  [key: string]: unknown;
};

export type ConfigSchemaLookupParams = {
  path: string;
};

export type ConfigSchemaLookupResult = {
  path: string;
  schema: JsonValue;
  hint?: JsonValue;
  hintPath?: string;
  children: JsonValue[];
  [key: string]: unknown;
};

export type SecretsReloadResult = {
  ok: boolean;
  warningCount?: number;
  [key: string]: unknown;
};

export type SecretsResolveParams = {
  commandName: string;
  targetIds: string[];
};

export type SecretsResolveResult = {
  ok?: boolean;
  assignments?: JsonValue[];
  diagnostics?: string[];
  inactiveRefPaths?: string[];
  [key: string]: unknown;
};

export type LogsTailParams = {
  cursor?: number;
  limit?: number;
  maxBytes?: number;
};

export type LogsTailResult = {
  file: string;
  cursor: number;
  size: number;
  lines: string[];
  truncated?: boolean;
  reset?: boolean;
  [key: string]: unknown;
};

export type UpdateRunParams = {
  sessionKey?: string;
  note?: string;
  restartDelayMs?: number;
  timeoutMs?: number;
};

export type UpdateRunResult = {
  ok?: boolean;
  result?: JsonValue;
  restart?: JsonValue;
  sentinel?: JsonValue;
  [key: string]: unknown;
};

export type HealthParams = {
  probe?: boolean;
};

export type HealthResult = HealthSummary;

export type StatusResult = Record<string, JsonValue>;

export type LastHeartbeatResult = Record<string, JsonValue>;

export type SystemPresenceResult = PresenceEntry[];

export type SetHeartbeatsParams = {
  enabled: boolean;
};

export type SetHeartbeatsResult = {
  ok: true;
  enabled: boolean;
};

export type SystemEventParams = {
  text: string;
  deviceId?: string;
  instanceId?: string;
  host?: string;
  ip?: string;
  mode?: string;
  version?: string;
  platform?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  lastInputSeconds?: number;
  reason?: string;
  roles?: string[];
  scopes?: string[];
  tags?: string[];
};

export type SystemEventResult = {
  ok: true;
};

export type DoctorMemoryStatusResult = {
  agentId: string;
  provider?: string;
  embedding: {
    ok: boolean;
    error?: string;
  };
  [key: string]: unknown;
};

export type WakeParams = {
  mode: "now" | "next-heartbeat";
  text: string;
};

export type WakeResult = Record<string, JsonValue>;

export type AgentsListResult = {
  defaultId: string;
  mainKey: string;
  scope: "per-sender" | "global";
  agents: Array<{
    id: string;
    name?: string;
    identity?: {
      name?: string;
      theme?: string;
      emoji?: string;
      avatar?: string;
      avatarUrl?: string;
    };
  }>;
};

export type AgentsCreateParams = {
  name: string;
  workspace: string;
  emoji?: string;
  avatar?: string;
};

export type AgentsCreateResult = {
  ok: true;
  agentId: string;
  name: string;
  workspace: string;
};

export type AgentsUpdateParams = {
  agentId: string;
  name?: string;
  workspace?: string;
  model?: string;
  avatar?: string;
};

export type AgentsUpdateResult = {
  ok: true;
  agentId: string;
};

export type AgentsDeleteParams = {
  agentId: string;
  deleteFiles?: boolean;
};

export type AgentsDeleteResult = {
  ok: true;
  agentId: string;
  removedBindings: number;
};

export type AgentsFileEntry = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
  content?: string;
};

export type AgentsFilesListParams = {
  agentId: string;
};

export type AgentsFilesListResult = {
  agentId: string;
  workspace: string;
  files: AgentsFileEntry[];
};

export type AgentsFilesGetParams = {
  agentId: string;
  name: string;
};

export type AgentsFilesGetResult = {
  agentId: string;
  workspace: string;
  file: AgentsFileEntry;
};

export type AgentsFilesSetParams = {
  agentId: string;
  name: string;
  content: string;
};

export type AgentsFilesSetResult = {
  ok: true;
  agentId: string;
  workspace: string;
  file: AgentsFileEntry;
};

export type TalkConfigParams = {
  includeSecrets?: boolean;
};

export type TalkConfigResult = {
  config: {
    talk?: JsonValue;
    session?: { mainKey?: string };
    ui?: { seamColor?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type TalkModeParams = {
  enabled: boolean;
  phase?: string;
};

export type TalkModeResult = {
  enabled: boolean;
  phase: string | null;
  ts: number;
};

export type VoiceWakeTriggersResult = {
  triggers: string[];
  [key: string]: unknown;
};

export type VoiceWakeSetParams = {
  triggers: string[];
};

export type TtsStatusResult = {
  enabled: boolean;
  auto?: boolean;
  provider?: string;
  fallbackProvider?: string | null;
  fallbackProviders?: string[];
  prefsPath?: string;
  hasOpenAIKey?: boolean;
  hasElevenLabsKey?: boolean;
  edgeEnabled?: boolean;
  [key: string]: unknown;
};

export type TtsProvidersResult = {
  providers: Array<Record<string, JsonValue>>;
  active: string;
  [key: string]: unknown;
};

export type TtsSetProviderParams = {
  provider: "openai" | "elevenlabs" | "edge";
};

export type TtsSetProviderResult = {
  provider: string;
};

export type TtsConvertParams = {
  text: string;
  channel?: string;
};

export type TtsConvertResult = {
  audioPath: string;
  provider: string;
  outputFormat: string;
  voiceCompatible: boolean;
  [key: string]: unknown;
};

export type SkillsStatusParams = {
  agentId?: string;
};

export type SkillsStatusResult = SkillStatusReport;

export type SkillsBinsResult = {
  bins: string[];
};

export type SkillsInstallParams = {
  name: string;
  installId: string;
  timeoutMs?: number;
};

export type SkillsInstallResult = Record<string, JsonValue>;

export type SkillsUpdateParams = {
  skillKey: string;
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
};

export type SkillsUpdateResult = {
  ok: true;
  skillKey: string;
  config: JsonValue;
  [key: string]: unknown;
};

export type ToolsCatalogParams = {
  agentId?: string;
  includePlugins?: boolean;
};

export type ToolsCatalogResult = {
  agentId: string;
  profiles: Array<{ id: string; label: string }>;
  groups: Array<{
    id: string;
    label: string;
    source: "core" | "plugin";
    pluginId?: string;
    tools: Array<{
      id: string;
      label: string;
      description: string;
      source: "core" | "plugin";
      pluginId?: string;
      optional?: boolean;
      defaultProfiles: string[];
    }>;
  }>;
};

export type NodePairRequestParams = {
  nodeId: string;
  displayName?: string;
  platform?: string;
  version?: string;
  coreVersion?: string;
  uiVersion?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  caps?: string[];
  commands?: string[];
  remoteIp?: string;
  silent?: boolean;
};

export type NodePairDecisionParams = {
  requestId: string;
};

export type NodePairVerifyParams = {
  nodeId: string;
  token: string;
};

export type NodeRenameParams = {
  nodeId: string;
  displayName: string;
};

export type NodeRenameResult = {
  nodeId: string;
  displayName: string;
};

export type NodePairResult = Record<string, JsonValue>;

export type NodePendingDrainParams = {
  maxItems?: number;
};

export type NodePendingDrainResult = {
  nodeId: string;
  revision: number;
  items: NodePendingWorkItem[];
  hasMore: boolean;
  [key: string]: unknown;
};

export type NodePendingPullResult = {
  nodeId: string;
  actions: Array<{
    id: string;
    command: string;
    paramsJSON: string | null;
    enqueuedAtMs: number;
  }>;
};

export type NodePendingAckParams = {
  ids: string[];
};

export type NodePendingAckResult = {
  nodeId: string;
  ackedIds: string[];
  remainingCount: number;
};

export type NodeInvokeResultParams = {
  id: string;
  nodeId: string;
  ok: boolean;
  payload?: JsonValue;
  payloadJSON?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

export type NodeInvokeResultAck = {
  ok: true;
  ignored?: boolean;
};

export type NodeEventParams = {
  event: string;
  payload?: JsonValue;
  payloadJSON?: string | null;
};

export type NodeEventResult = {
  ok: true;
};

export type NodeCanvasCapabilityRefreshResult = {
  canvasCapability: string;
  canvasCapabilityExpiresAtMs: number;
  canvasHostUrl?: string;
};

export type CronListParams = {
  includeDisabled?: boolean;
  limit?: number;
  offset?: number;
  query?: string;
  enabled?: "all" | "enabled" | "disabled";
  sortBy?: "nextRunAtMs" | "updatedAtMs" | "name";
  sortDir?: "asc" | "desc";
};

export type CronListResult = {
  jobs?: CronJob[];
  total?: number;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  nextOffset?: number | null;
};

export type CronStatusResult = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number | null;
};

export type CronAddParams = {
  name: string;
  schedule: CronSchedule;
  sessionTarget: "main" | "isolated";
  wakeMode: "next-heartbeat" | "now";
  payload: CronPayload;
  agentId?: string | null;
  sessionKey?: string | null;
  description?: string;
  enabled?: boolean;
  deleteAfterRun?: boolean;
  delivery?: CronDelivery;
  failureAlert?: false | CronFailureAlert;
};

export type CronJobResult = CronJob;

export type CronUpdateParams =
  | {
      id: string;
      patch: Partial<CronJob>;
    }
  | {
      jobId: string;
      patch: Partial<CronJob>;
    };

export type CronRemoveParams = { id: string } | { jobId: string };

export type CronRemoveResult = Record<string, JsonValue>;

export type CronRunParams =
  | {
      id: string;
      mode?: "due" | "force";
    }
  | {
      jobId: string;
      mode?: "due" | "force";
    };

export type CronRunResult = Record<string, JsonValue>;

export type CronRunsParams = {
  scope?: "job" | "all";
  id?: string;
  jobId?: string;
  limit?: number;
  offset?: number;
  statuses?: Array<"ok" | "error" | "skipped">;
  status?: "all" | "ok" | "error" | "skipped";
  deliveryStatuses?: Array<"delivered" | "not-delivered" | "unknown" | "not-requested">;
  deliveryStatus?: "delivered" | "not-delivered" | "unknown" | "not-requested";
  query?: string;
  sortDir?: "asc" | "desc";
};

export type CronRunsResult = {
  entries?: CronRunLogEntry[];
  total?: number;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  nextOffset?: number | null;
};

export type ExecApprovalsSnapshot = {
  path: string;
  exists: boolean;
  hash: string;
  file: Record<string, JsonValue>;
  [key: string]: unknown;
};

export type ExecApprovalsSetParams = {
  file: Record<string, JsonValue>;
  baseHash?: string;
};

export type ExecApprovalsNodeGetParams = {
  nodeId: string;
};

export type ExecApprovalsNodeSetParams = {
  nodeId: string;
  file: Record<string, JsonValue>;
  baseHash?: string;
};

export type ExecApprovalRequestParams = {
  id?: string;
  command?: string;
  commandArgv?: string[];
  systemRunPlan?: JsonValue;
  env?: Record<string, string>;
  cwd?: string | null;
  nodeId?: string | null;
  host?: string | null;
  security?: string | null;
  ask?: string | null;
  agentId?: string | null;
  resolvedPath?: string | null;
  sessionKey?: string | null;
  turnSourceChannel?: string | null;
  turnSourceTo?: string | null;
  turnSourceAccountId?: string | null;
  turnSourceThreadId?: string | number | null;
  timeoutMs?: number;
  twoPhase?: boolean;
};

export type ExecApprovalAccepted = {
  status: "accepted";
  id: string;
  createdAtMs?: number;
  expiresAtMs?: number;
  [key: string]: unknown;
};

export type ExecApprovalDecisionResult = {
  id: string;
  decision: string | null;
  createdAtMs?: number;
  expiresAtMs?: number;
  [key: string]: unknown;
};

export type ExecApprovalWaitDecisionParams = {
  id: string;
};

export type ExecApprovalResolveParams = {
  id: string;
  decision: "allow-once" | "allow-always" | "deny";
};

export type ExecApprovalResolveResult = {
  ok: true;
};

export type WizardStartParams = {
  mode?: "local" | "remote";
  workspace?: string;
};

export type WizardAnswer = {
  stepId: string;
  value?: JsonValue;
};

export type WizardNextParams = {
  sessionId: string;
  answer?: WizardAnswer;
};

export type WizardStatusParams = {
  sessionId: string;
};

export type WizardCancelParams = {
  sessionId: string;
};

export type WizardStep = {
  id: string;
  type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress" | "action";
  title?: string;
  message?: string;
  options?: Array<{ value: JsonValue; label: string; hint?: string }>;
  initialValue?: JsonValue;
  placeholder?: string;
  sensitive?: boolean;
  executor?: "gateway" | "client";
};

export type WizardStartResult = {
  sessionId: string;
  done: boolean;
  step?: WizardStep;
  status?: "running" | "done" | "cancelled" | "error";
  error?: string;
};

export type WizardNextResult = {
  done: boolean;
  step?: WizardStep;
  status?: "running" | "done" | "cancelled" | "error";
  error?: string;
};

export type WizardStatusResult = {
  status: "running" | "done" | "cancelled" | "error";
  error?: string;
};

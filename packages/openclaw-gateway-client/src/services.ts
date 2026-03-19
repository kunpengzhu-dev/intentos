import { GatewayTransport } from "./transport.js";
import type {
  AgentAccepted,
  AgentsCreateParams,
  AgentsCreateResult,
  AgentsDeleteParams,
  AgentsDeleteResult,
  AgentEventPayload,
  AgentFinal,
  AgentsFilesGetParams,
  AgentsFilesGetResult,
  AgentsFilesListParams,
  AgentsFilesListResult,
  AgentsFilesSetParams,
  AgentsFilesSetResult,
  AgentIdentityParams,
  AgentIdentityResult,
  AgentsListResult,
  AgentRunParams,
  AgentWaitParams,
  AgentsUpdateParams,
  AgentsUpdateResult,
  BrowserRequestParams,
  BrowserRequestResult,
  ChatAbortParams,
  ChatAbortResult,
  ChatEventPayload,
  ChatHistoryParams,
  ChatHistoryResult,
  ChatSendAck,
  ChatSendParams,
  ChannelsLogoutParams,
  ChannelsLogoutResult,
  ChannelsStatusParams,
  ChannelsStatusResult,
  ConfigApplyLikeParams,
  ConfigGetResult,
  ConfigSchemaLookupParams,
  ConfigSchemaLookupResult,
  ConfigSchemaResult,
  ConfigSetParams,
  ConfigWriteResult,
  CronAddParams,
  CronJobResult,
  CronListParams,
  CronListResult,
  CronRemoveParams,
  CronRemoveResult,
  CronRunParams,
  CronRunsParams,
  CronRunsResult,
  CronRunResult,
  CronStatusResult,
  CronUpdateParams,
  DevicePairDecisionParams,
  DevicePairDecisionResult,
  DevicePairListResult,
  DevicePairRemoveParams,
  DeviceTokenRevokeParams,
  DeviceTokenRevokeResult,
  DeviceTokenRotateParams,
  DeviceTokenRotateResult,
  DoctorMemoryStatusResult,
  ExecApprovalAccepted,
  ExecApprovalDecisionResult,
  ExecApprovalRequestParams,
  ExecApprovalResolveParams,
  ExecApprovalResolveResult,
  ExecApprovalsNodeGetParams,
  ExecApprovalsNodeSetParams,
  ExecApprovalsSetParams,
  ExecApprovalsSnapshot,
  ExecApprovalWaitDecisionParams,
  GatewayEventFrame,
  GatewayPhasedRequest,
  GatewayWaitOptions,
  HealthParams,
  HealthResult,
  LastHeartbeatResult,
  LogsTailParams,
  LogsTailResult,
  ModelsListResult,
  NodeCanvasCapabilityRefreshResult,
  NodeDescribeParams,
  NodeDescribeResult,
  NodeEventParams,
  NodeEventResult,
  NodeInvokeParams,
  NodeInvokeResult,
  NodeInvokeResultAck,
  NodeInvokeResultParams,
  NodeListResult,
  NodePairDecisionParams,
  NodePairRequestParams,
  NodePairResult,
  NodePairVerifyParams,
  NodePendingAckParams,
  NodePendingAckResult,
  NodePendingDrainParams,
  NodePendingDrainResult,
  NodePendingEnqueueParams,
  NodePendingEnqueueResult,
  NodePendingPullResult,
  NodeRenameParams,
  NodeRenameResult,
  SecretsReloadResult,
  SecretsResolveParams,
  SecretsResolveResult,
  SetHeartbeatsParams,
  SetHeartbeatsResult,
  SendMessageParams,
  SendMessageResult,
  SessionsCompactParams,
  SessionsCompactResult,
  SessionsDeleteParams,
  SessionsDeleteResult,
  SessionsListParams,
  SessionsListResult,
  SessionsPatchParams,
  SessionsPatchResult,
  SessionsPreviewParams,
  SessionsPreviewResult,
  SessionsResetParams,
  SessionsResetResult,
  SkillsBinsResult,
  SkillsInstallParams,
  SkillsInstallResult,
  SkillsStatusParams,
  SkillsStatusResult,
  SkillsUpdateParams,
  SkillsUpdateResult,
  StatusResult,
  SystemEventParams,
  SystemEventResult,
  SystemPresenceResult,
  TalkConfigParams,
  TalkConfigResult,
  TalkModeParams,
  TalkModeResult,
  ToolsCatalogParams,
  ToolsCatalogResult,
  TtsConvertParams,
  TtsConvertResult,
  TtsProvidersResult,
  TtsSetProviderParams,
  TtsSetProviderResult,
  TtsStatusResult,
  UpdateRunParams,
  UpdateRunResult,
  UsageCostParams,
  UsageCostResult,
  UsageStatusResult,
  VoiceWakeSetParams,
  VoiceWakeTriggersResult,
  WakeParams,
  WakeResult,
  WebLoginStartParams,
  WebLoginStartResult,
  WebLoginWaitParams,
  WebLoginWaitResult,
  WizardCancelParams,
  WizardNextParams,
  WizardNextResult,
  WizardStartParams,
  WizardStartResult,
  WizardStatusParams,
  WizardStatusResult,
} from "./types.js";

function ensureIdempotencyKey<T extends { idempotencyKey?: string }>(params: T): T {
  if (params.idempotencyKey) {
    return params;
  }
  return {
    ...params,
    idempotencyKey: crypto.randomUUID(),
  };
}

export class ChatService {
  constructor(private readonly transport: GatewayTransport) {}

  history(params: ChatHistoryParams): Promise<ChatHistoryResult> {
    return this.transport.request<ChatHistoryResult>("chat.history", params);
  }

  send(params: ChatSendParams): Promise<ChatSendAck> {
    return this.transport.request<ChatSendAck>("chat.send", ensureIdempotencyKey(params));
  }

  abort(params: ChatAbortParams): Promise<ChatAbortResult> {
    return this.transport.request<ChatAbortResult>("chat.abort", params);
  }

  onEvent(listener: (frame: GatewayEventFrame<ChatEventPayload>) => void): () => void {
    return this.transport.onEvent<ChatEventPayload>("chat", listener);
  }

  waitForFinal(runId: string, options: GatewayWaitOptions = {}): Promise<ChatEventPayload> {
    return this.transport
      .waitForEvent<ChatEventPayload>(
        "chat",
        (payload) =>
          payload.runId === runId &&
          (payload.state === "final" ||
            payload.state === "aborted" ||
            payload.state === "error"),
        options,
      )
      .then((frame) => frame.payload as ChatEventPayload);
  }

  async sendAndWaitFinal(
    params: ChatSendParams,
    options: GatewayWaitOptions = {},
  ): Promise<{ ack: ChatSendAck; final: ChatEventPayload }> {
    const ack = await this.send(params);
    if (!ack.runId) {
      throw new Error("chat.send ack did not include runId");
    }
    const final = await this.waitForFinal(ack.runId, options);
    return { ack, final };
  }
}

export class AgentService {
  constructor(private readonly transport: GatewayTransport) {}

  run(params: AgentRunParams): Promise<GatewayPhasedRequest<AgentAccepted, AgentFinal>> {
    return this.transport.requestPhased<AgentAccepted, AgentFinal>(
      "agent",
      ensureIdempotencyKey(params),
    );
  }

  async runAndWait(
    params: AgentRunParams,
  ): Promise<{ accepted: AgentAccepted; final: AgentFinal }> {
    const phased = await this.run(params);
    const accepted = await phased.accepted;
    const final = await phased.final;
    return { accepted, final };
  }

  wait(params: AgentWaitParams): Promise<AgentFinal> {
    return this.transport.request<AgentFinal>("agent.wait", params);
  }

  identity(params: AgentIdentityParams = {}): Promise<AgentIdentityResult> {
    return this.transport.request<AgentIdentityResult>("agent.identity.get", params);
  }

  wake(params: WakeParams): Promise<WakeResult> {
    return this.transport.request<WakeResult>("wake", params);
  }

  onEvent(listener: (frame: GatewayEventFrame<AgentEventPayload>) => void): () => void {
    return this.transport.onEvent<AgentEventPayload>("agent", listener);
  }
}

export class SessionsService {
  constructor(private readonly transport: GatewayTransport) {}

  list(params: SessionsListParams = {}): Promise<SessionsListResult> {
    return this.transport.request<SessionsListResult>("sessions.list", params);
  }

  preview(params: SessionsPreviewParams): Promise<SessionsPreviewResult> {
    return this.transport.request<SessionsPreviewResult>("sessions.preview", params);
  }

  patch(params: SessionsPatchParams): Promise<SessionsPatchResult> {
    return this.transport.request<SessionsPatchResult>("sessions.patch", params);
  }

  reset(params: SessionsResetParams): Promise<SessionsResetResult> {
    return this.transport.request<SessionsResetResult>("sessions.reset", params);
  }

  delete(params: SessionsDeleteParams): Promise<SessionsDeleteResult> {
    return this.transport.request<SessionsDeleteResult>("sessions.delete", params);
  }

  compact(params: SessionsCompactParams): Promise<SessionsCompactResult> {
    return this.transport.request<SessionsCompactResult>("sessions.compact", params);
  }
}

export class ModelsService {
  constructor(private readonly transport: GatewayTransport) {}

  list(): Promise<ModelsListResult> {
    return this.transport.request<ModelsListResult>("models.list", {});
  }
}

export class UsageService {
  constructor(private readonly transport: GatewayTransport) {}

  status(): Promise<UsageStatusResult> {
    return this.transport.request<UsageStatusResult>("usage.status", {});
  }

  cost(params: UsageCostParams): Promise<UsageCostResult> {
    return this.transport.request<UsageCostResult>("usage.cost", params);
  }
}

export class RuntimeService {
  constructor(private readonly transport: GatewayTransport) {}

  health(params: HealthParams = {}): Promise<HealthResult> {
    return this.transport.request<HealthResult>("health", params);
  }

  status(): Promise<StatusResult> {
    return this.transport.request<StatusResult>("status", {});
  }

  lastHeartbeat(): Promise<LastHeartbeatResult> {
    return this.transport.request<LastHeartbeatResult>("last-heartbeat", {});
  }

  systemPresence(): Promise<SystemPresenceResult> {
    return this.transport.request<SystemPresenceResult>("system-presence", {});
  }

  setHeartbeats(params: SetHeartbeatsParams): Promise<SetHeartbeatsResult> {
    return this.transport.request<SetHeartbeatsResult>("set-heartbeats", params);
  }

  systemEvent(params: SystemEventParams): Promise<SystemEventResult> {
    return this.transport.request<SystemEventResult>("system-event", params);
  }

  doctorMemoryStatus(): Promise<DoctorMemoryStatusResult> {
    return this.transport.request<DoctorMemoryStatusResult>("doctor.memory.status", {});
  }
}

export class AgentsService {
  constructor(private readonly transport: GatewayTransport) {}

  list(): Promise<AgentsListResult> {
    return this.transport.request<AgentsListResult>("agents.list", {});
  }

  create(params: AgentsCreateParams): Promise<AgentsCreateResult> {
    return this.transport.request<AgentsCreateResult>("agents.create", params);
  }

  update(params: AgentsUpdateParams): Promise<AgentsUpdateResult> {
    return this.transport.request<AgentsUpdateResult>("agents.update", params);
  }

  delete(params: AgentsDeleteParams): Promise<AgentsDeleteResult> {
    return this.transport.request<AgentsDeleteResult>("agents.delete", params);
  }

  filesList(params: AgentsFilesListParams): Promise<AgentsFilesListResult> {
    return this.transport.request<AgentsFilesListResult>("agents.files.list", params);
  }

  filesGet(params: AgentsFilesGetParams): Promise<AgentsFilesGetResult> {
    return this.transport.request<AgentsFilesGetResult>("agents.files.get", params);
  }

  filesSet(params: AgentsFilesSetParams): Promise<AgentsFilesSetResult> {
    return this.transport.request<AgentsFilesSetResult>("agents.files.set", params);
  }
}

export class ChannelsService {
  constructor(private readonly transport: GatewayTransport) {}

  send(params: SendMessageParams): Promise<SendMessageResult> {
    return this.transport.request<SendMessageResult>("send", ensureIdempotencyKey(params));
  }

  status(params: ChannelsStatusParams = {}): Promise<ChannelsStatusResult> {
    return this.transport.request<ChannelsStatusResult>("channels.status", params);
  }

  logout(params: ChannelsLogoutParams): Promise<Record<string, unknown>> {
    return this.transport.request<ChannelsLogoutResult>("channels.logout", params);
  }

  webLoginStart(params: WebLoginStartParams = {}): Promise<WebLoginStartResult> {
    return this.transport.request<WebLoginStartResult>("web.login.start", params);
  }

  webLoginWait(params: WebLoginWaitParams = {}): Promise<WebLoginWaitResult> {
    return this.transport.request<WebLoginWaitResult>("web.login.wait", params);
  }
}

export class BrowserService {
  constructor(private readonly transport: GatewayTransport) {}

  request(params: BrowserRequestParams): Promise<BrowserRequestResult> {
    return this.transport.request<BrowserRequestResult>("browser.request", params);
  }
}

export class NodesService {
  constructor(private readonly transport: GatewayTransport) {}

  pairRequest(params: NodePairRequestParams): Promise<NodePairResult> {
    return this.transport.request<NodePairResult>("node.pair.request", params);
  }

  pairList(): Promise<NodePairResult> {
    return this.transport.request<NodePairResult>("node.pair.list", {});
  }

  pairApprove(params: NodePairDecisionParams): Promise<NodePairResult> {
    return this.transport.request<NodePairResult>("node.pair.approve", params);
  }

  pairReject(params: NodePairDecisionParams): Promise<NodePairResult> {
    return this.transport.request<NodePairResult>("node.pair.reject", params);
  }

  pairVerify(params: NodePairVerifyParams): Promise<NodePairResult> {
    return this.transport.request<NodePairResult>("node.pair.verify", params);
  }

  rename(params: NodeRenameParams): Promise<NodeRenameResult> {
    return this.transport.request<NodeRenameResult>("node.rename", params);
  }

  list(): Promise<NodeListResult> {
    return this.transport.request<NodeListResult>("node.list", {});
  }

  describe(params: NodeDescribeParams): Promise<NodeDescribeResult> {
    return this.transport.request<NodeDescribeResult>("node.describe", params);
  }

  invoke(params: NodeInvokeParams): Promise<NodeInvokeResult> {
    return this.transport.request<NodeInvokeResult>("node.invoke", ensureIdempotencyKey(params));
  }

  enqueuePending(params: NodePendingEnqueueParams): Promise<NodePendingEnqueueResult> {
    return this.transport.request<NodePendingEnqueueResult>("node.pending.enqueue", params);
  }

  drainPending(params: NodePendingDrainParams = {}): Promise<NodePendingDrainResult> {
    return this.transport.request<NodePendingDrainResult>("node.pending.drain", params);
  }

  pullPending(): Promise<NodePendingPullResult> {
    return this.transport.request<NodePendingPullResult>("node.pending.pull", {});
  }

  ackPending(params: NodePendingAckParams): Promise<NodePendingAckResult> {
    return this.transport.request<NodePendingAckResult>("node.pending.ack", params);
  }

  invokeResult(params: NodeInvokeResultParams): Promise<NodeInvokeResultAck> {
    return this.transport.request<NodeInvokeResultAck>("node.invoke.result", params);
  }

  event(params: NodeEventParams): Promise<NodeEventResult> {
    return this.transport.request<NodeEventResult>("node.event", params);
  }

  refreshCanvasCapability(): Promise<NodeCanvasCapabilityRefreshResult> {
    return this.transport.request<NodeCanvasCapabilityRefreshResult>(
      "node.canvas.capability.refresh",
      {},
    );
  }
}

export class DevicesService {
  constructor(private readonly transport: GatewayTransport) {}

  pairList(): Promise<DevicePairListResult> {
    return this.transport.request<DevicePairListResult>("device.pair.list", {});
  }

  pairApprove(params: DevicePairDecisionParams): Promise<DevicePairDecisionResult> {
    return this.transport.request<DevicePairDecisionResult>("device.pair.approve", params);
  }

  pairReject(params: DevicePairDecisionParams): Promise<DevicePairDecisionResult> {
    return this.transport.request<DevicePairDecisionResult>("device.pair.reject", params);
  }

  pairRemove(params: DevicePairRemoveParams): Promise<DevicePairDecisionResult> {
    return this.transport.request<DevicePairDecisionResult>("device.pair.remove", params);
  }

  tokenRotate(params: DeviceTokenRotateParams): Promise<DeviceTokenRotateResult> {
    return this.transport.request<DeviceTokenRotateResult>("device.token.rotate", params);
  }

  tokenRevoke(params: DeviceTokenRevokeParams): Promise<DeviceTokenRevokeResult> {
    return this.transport.request<DeviceTokenRevokeResult>("device.token.revoke", params);
  }
}

export class ConfigService {
  constructor(private readonly transport: GatewayTransport) {}

  get(): Promise<ConfigGetResult> {
    return this.transport.request<ConfigGetResult>("config.get", {});
  }

  set(params: ConfigSetParams): Promise<ConfigWriteResult> {
    return this.transport.request<ConfigWriteResult>("config.set", params);
  }

  patch(params: ConfigApplyLikeParams): Promise<ConfigWriteResult> {
    return this.transport.request<ConfigWriteResult>("config.patch", params);
  }

  apply(params: ConfigApplyLikeParams): Promise<ConfigWriteResult> {
    return this.transport.request<ConfigWriteResult>("config.apply", params);
  }

  schema(): Promise<ConfigSchemaResult> {
    return this.transport.request<ConfigSchemaResult>("config.schema", {});
  }

  lookup(params: ConfigSchemaLookupParams): Promise<ConfigSchemaLookupResult> {
    return this.transport.request<ConfigSchemaLookupResult>("config.schema.lookup", params);
  }

  secretsReload(): Promise<SecretsReloadResult> {
    return this.transport.request<SecretsReloadResult>("secrets.reload", {});
  }

  secretsResolve(params: SecretsResolveParams): Promise<SecretsResolveResult> {
    return this.transport.request<SecretsResolveResult>("secrets.resolve", params);
  }

  logsTail(params: LogsTailParams = {}): Promise<LogsTailResult> {
    return this.transport.request<LogsTailResult>("logs.tail", params);
  }

  updateRun(params: UpdateRunParams = {}): Promise<UpdateRunResult> {
    return this.transport.request<UpdateRunResult>("update.run", params);
  }
}

export class CronService {
  constructor(private readonly transport: GatewayTransport) {}

  list(params: CronListParams = {}): Promise<CronListResult> {
    return this.transport.request<CronListResult>("cron.list", params);
  }

  status(): Promise<CronStatusResult> {
    return this.transport.request<CronStatusResult>("cron.status", {});
  }

  add(params: CronAddParams): Promise<CronJobResult> {
    return this.transport.request<CronJobResult>("cron.add", params);
  }

  update(params: CronUpdateParams): Promise<CronJobResult> {
    return this.transport.request<CronJobResult>("cron.update", params);
  }

  remove(params: CronRemoveParams): Promise<CronRemoveResult> {
    return this.transport.request<CronRemoveResult>("cron.remove", params);
  }

  run(params: CronRunParams): Promise<CronRunResult> {
    return this.transport.request<CronRunResult>("cron.run", params);
  }

  runs(params: CronRunsParams = {}): Promise<CronRunsResult> {
    return this.transport.request<CronRunsResult>("cron.runs", params);
  }
}

export class ApprovalsService {
  constructor(private readonly transport: GatewayTransport) {}

  get(): Promise<ExecApprovalsSnapshot> {
    return this.transport.request<ExecApprovalsSnapshot>("exec.approvals.get", {});
  }

  set(params: ExecApprovalsSetParams): Promise<ExecApprovalsSnapshot> {
    return this.transport.request<ExecApprovalsSnapshot>("exec.approvals.set", params);
  }

  nodeGet(params: ExecApprovalsNodeGetParams): Promise<ExecApprovalsSnapshot> {
    return this.transport.request<ExecApprovalsSnapshot>("exec.approvals.node.get", params);
  }

  nodeSet(params: ExecApprovalsNodeSetParams): Promise<ExecApprovalsSnapshot> {
    return this.transport.request<ExecApprovalsSnapshot>("exec.approvals.node.set", params);
  }

  request(params: ExecApprovalRequestParams): Promise<ExecApprovalDecisionResult> {
    return this.transport.request<ExecApprovalDecisionResult>("exec.approval.request", params);
  }

  requestPhased(
    params: ExecApprovalRequestParams,
  ): Promise<GatewayPhasedRequest<ExecApprovalAccepted, ExecApprovalDecisionResult>> {
    return this.transport.requestPhased<
      ExecApprovalAccepted,
      ExecApprovalDecisionResult
    >("exec.approval.request", {
      ...params,
      twoPhase: true,
    });
  }

  waitDecision(params: ExecApprovalWaitDecisionParams): Promise<ExecApprovalDecisionResult> {
    return this.transport.request<ExecApprovalDecisionResult>("exec.approval.waitDecision", params);
  }

  resolve(params: ExecApprovalResolveParams): Promise<ExecApprovalResolveResult> {
    return this.transport.request<ExecApprovalResolveResult>("exec.approval.resolve", params);
  }
}

export class WizardService {
  constructor(private readonly transport: GatewayTransport) {}

  start(params: WizardStartParams = {}): Promise<WizardStartResult> {
    return this.transport.request<WizardStartResult>("wizard.start", params);
  }

  next(params: WizardNextParams): Promise<WizardNextResult> {
    return this.transport.request<WizardNextResult>("wizard.next", params);
  }

  status(params: WizardStatusParams): Promise<WizardStatusResult> {
    return this.transport.request<WizardStatusResult>("wizard.status", params);
  }

  cancel(params: WizardCancelParams): Promise<WizardStatusResult> {
    return this.transport.request<WizardStatusResult>("wizard.cancel", params);
  }
}

export class TalkService {
  constructor(private readonly transport: GatewayTransport) {}

  config(params: TalkConfigParams = {}): Promise<TalkConfigResult> {
    return this.transport.request<TalkConfigResult>("talk.config", params);
  }

  mode(params: TalkModeParams): Promise<TalkModeResult> {
    return this.transport.request<TalkModeResult>("talk.mode", params);
  }
}

export class TtsService {
  constructor(private readonly transport: GatewayTransport) {}

  status(): Promise<TtsStatusResult> {
    return this.transport.request<TtsStatusResult>("tts.status", {});
  }

  providers(): Promise<TtsProvidersResult> {
    return this.transport.request<TtsProvidersResult>("tts.providers", {});
  }

  enable(): Promise<{ enabled: true }> {
    return this.transport.request<{ enabled: true }>("tts.enable", {});
  }

  disable(): Promise<{ enabled: false }> {
    return this.transport.request<{ enabled: false }>("tts.disable", {});
  }

  setProvider(params: TtsSetProviderParams): Promise<TtsSetProviderResult> {
    return this.transport.request<TtsSetProviderResult>("tts.setProvider", params);
  }

  convert(params: TtsConvertParams): Promise<TtsConvertResult> {
    return this.transport.request<TtsConvertResult>("tts.convert", params);
  }
}

export class VoiceWakeService {
  constructor(private readonly transport: GatewayTransport) {}

  get(): Promise<VoiceWakeTriggersResult> {
    return this.transport.request<VoiceWakeTriggersResult>("voicewake.get", {});
  }

  set(params: VoiceWakeSetParams): Promise<VoiceWakeTriggersResult> {
    return this.transport.request<VoiceWakeTriggersResult>("voicewake.set", params);
  }
}

export class SkillsService {
  constructor(private readonly transport: GatewayTransport) {}

  status(params: SkillsStatusParams = {}): Promise<SkillsStatusResult> {
    return this.transport.request<SkillsStatusResult>("skills.status", params);
  }

  bins(): Promise<SkillsBinsResult> {
    return this.transport.request<SkillsBinsResult>("skills.bins", {});
  }

  install(params: SkillsInstallParams): Promise<SkillsInstallResult> {
    return this.transport.request<SkillsInstallResult>("skills.install", params);
  }

  update(params: SkillsUpdateParams): Promise<SkillsUpdateResult> {
    return this.transport.request<SkillsUpdateResult>("skills.update", params);
  }
}

export class ToolsService {
  constructor(private readonly transport: GatewayTransport) {}

  catalog(params: ToolsCatalogParams = {}): Promise<ToolsCatalogResult> {
    return this.transport.request<ToolsCatalogResult>("tools.catalog", params);
  }
}

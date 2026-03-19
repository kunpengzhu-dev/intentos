import {
  AgentService,
  AgentsService,
  ApprovalsService,
  BrowserService,
  ChannelsService,
  ChatService,
  ConfigService,
  CronService,
  DevicesService,
  ModelsService,
  NodesService,
  RuntimeService,
  SessionsService,
  SkillsService,
  TalkService,
  ToolsService,
  TtsService,
  UsageService,
  VoiceWakeService,
  WizardService,
} from "./services.js";
import { GatewayTransport } from "./transport.js";
import type {
  GatewayConnectOptions,
  GatewayConnectionState,
  GatewayEventFrame,
  GatewayEventGap,
  GatewayHelloOk,
  GatewayInboundFrame,
  GatewayPhasedRequest,
  GatewayWaitOptions,
} from "./types.js";

export class OpenClawGatewayClient {
  readonly transport: GatewayTransport;
  readonly chat: ChatService;
  readonly agent: AgentService;
  readonly sessions: SessionsService;
  readonly models: ModelsService;
  readonly usage: UsageService;
  readonly runtime: RuntimeService;
  readonly agents: AgentsService;
  readonly channels: ChannelsService;
  readonly browser: BrowserService;
  readonly nodes: NodesService;
  readonly devices: DevicesService;
  readonly config: ConfigService;
  readonly cron: CronService;
  readonly approvals: ApprovalsService;
  readonly wizard: WizardService;
  readonly talk: TalkService;
  readonly tts: TtsService;
  readonly voiceWake: VoiceWakeService;
  readonly skills: SkillsService;
  readonly tools: ToolsService;

  constructor(options: GatewayConnectOptions) {
    this.transport = new GatewayTransport(options);
    this.chat = new ChatService(this.transport);
    this.agent = new AgentService(this.transport);
    this.sessions = new SessionsService(this.transport);
    this.models = new ModelsService(this.transport);
    this.usage = new UsageService(this.transport);
    this.runtime = new RuntimeService(this.transport);
    this.agents = new AgentsService(this.transport);
    this.channels = new ChannelsService(this.transport);
    this.browser = new BrowserService(this.transport);
    this.nodes = new NodesService(this.transport);
    this.devices = new DevicesService(this.transport);
    this.config = new ConfigService(this.transport);
    this.cron = new CronService(this.transport);
    this.approvals = new ApprovalsService(this.transport);
    this.wizard = new WizardService(this.transport);
    this.talk = new TalkService(this.transport);
    this.tts = new TtsService(this.transport);
    this.voiceWake = new VoiceWakeService(this.transport);
    this.skills = new SkillsService(this.transport);
    this.tools = new ToolsService(this.transport);
  }

  get hello(): GatewayHelloOk | null {
    return this.transport.hello;
  }

  get connectionState(): GatewayConnectionState {
    return this.transport.connectionState;
  }

  connect(): Promise<GatewayHelloOk> {
    return this.transport.connect();
  }

  close(code?: number, reason?: string): void {
    this.transport.close(code, reason);
  }

  request<TResponse = unknown>(method: string, params?: unknown): Promise<TResponse> {
    return this.transport.request<TResponse>(method, params);
  }

  requestPhased<TAccepted = unknown, TFinal = unknown>(
    method: string,
    params?: unknown,
  ): Promise<GatewayPhasedRequest<TAccepted, TFinal>> {
    return this.transport.requestPhased<TAccepted, TFinal>(method, params);
  }

  onStatus(listener: (state: GatewayConnectionState) => void): () => void {
    return this.transport.onStatus(listener);
  }

  onHello(listener: (hello: GatewayHelloOk) => void): () => void {
    return this.transport.onHello(listener);
  }

  onError(listener: (error: Error) => void): () => void {
    return this.transport.onError(listener);
  }

  onGap(listener: (gap: GatewayEventGap) => void): () => void {
    return this.transport.onGap(listener);
  }

  onAnyEvent(listener: (frame: GatewayEventFrame) => void): () => void {
    return this.transport.onAnyEvent(listener);
  }

  onInboundFrame(listener: (frame: GatewayInboundFrame) => void): () => void {
    return this.transport.onInboundFrame(listener);
  }

  onEvent<TPayload = unknown>(
    eventName: string,
    listener: (frame: GatewayEventFrame<TPayload>) => void,
  ): () => void {
    return this.transport.onEvent(eventName, listener);
  }

  waitForEvent<TPayload = unknown>(
    eventName: string,
    predicate?: (payload: TPayload, frame: GatewayEventFrame<TPayload>) => boolean,
    options?: GatewayWaitOptions,
  ): Promise<GatewayEventFrame<TPayload>> {
    return this.transport.waitForEvent(eventName, predicate, options);
  }

  isMethodAvailable(method: string): boolean {
    return this.transport.isMethodAvailable(method);
  }

  isEventAvailable(eventName: string): boolean {
    return this.transport.isEventAvailable(eventName);
  }
}

import type {
  AbortIntentMessageRequest,
  AbortIntentMessageResponse,
  CompactIntentRequest,
  CompactIntentResponse,
  DeleteIntentResponse,
  IntentDetail,
  IntentEvent,
  IntentListResponse,
  IntentMessagesResponse,
  IntentPreviewItem,
  IntentPreviewResponse,
  IntentSummary,
  IntentStreamEvent,
  IntentView,
  PatchIntentResponse,
  PatchIntentRequest,
  ResetIntentRequest,
  ResetIntentResponse,
  SendIntentMessageRequest,
  SendIntentMessageResponse,
} from "@intentos/shared";
import { IntentNotFoundError } from "./domain/errors.js";
import { IntentHistoryProjector } from "./domain/intent-history-projector.js";
import { IntentMapper } from "./domain/intent-mapper.js";
import { IntentStreamProjector } from "./domain/intent-stream-projector.js";
import type {
  IntentRuntimeGateway,
  RuntimeIntentCatalog,
  RuntimeIntentPreview,
  RuntimeIntentRecord,
} from "./ports/intent-runtime-gateway.js";

type IntentCoordinatorOptions = {
  gateway: IntentRuntimeGateway;
  orbIntentKey: string;
  defaultHistoryLimit: number;
  defaultPreviewLimit: number;
  defaultPreviewMaxChars: number;
};

export class IntentCoordinator {
  private readonly mapper: IntentMapper;
  private readonly historyProjector: IntentHistoryProjector;

  constructor(private readonly options: IntentCoordinatorOptions) {
    this.mapper = new IntentMapper({ orbIntentKey: options.orbIntentKey });
    this.historyProjector = new IntentHistoryProjector();
  }

  getConnectionState() {
    return this.options.gateway.getConnectionState();
  }

  async listIntents(params: {
    includePreview?: boolean;
    previewLimit?: number;
    previewMaxChars?: number;
  } = {}): Promise<IntentListResponse> {
    const catalog = await this.options.gateway.listIntents();
    const previewMap = params.includePreview
      ? await this.loadPreviewMap(
          catalog.intents.map((record) => record.key),
          params.previewLimit,
          params.previewMaxChars,
        )
      : new Map<string, IntentPreviewItem[] | undefined>();

    const intents = catalog.intents
      .map((record) => {
        const detail = this.mapper.toIntentDetail(record, catalog.defaults, {
          intentKey: record.key,
          status: "ok",
          items: previewMap.get(record.key) ?? [],
        });
        return detail as IntentSummary;
      })
      .sort((left, right) => this.compareIntentSummary(left, right));

    return {
      orbIntentKey: this.options.orbIntentKey,
      intents,
    };
  }

  async getOrbIntent(): Promise<IntentDetail> {
    return this.getIntent(this.options.orbIntentKey, { includePreview: true });
  }

  async getIntent(
    intentKey: string,
    params: {
      includePreview?: boolean;
      previewLimit?: number;
      previewMaxChars?: number;
    } = {},
  ): Promise<IntentDetail> {
    const catalog = await this.options.gateway.listIntents();
    return this.buildIntentDetail(catalog, intentKey, params);
  }

  async getIntentView(
    intentKey: string,
    params: {
      limit?: number;
      includePreview?: boolean;
      previewLimit?: number;
      previewMaxChars?: number;
    } = {},
  ): Promise<IntentView> {
    const catalog = await this.options.gateway.listIntents();
    const [intent, history] = await Promise.all([
      this.buildIntentDetail(catalog, intentKey, {
        includePreview: params.includePreview ?? true,
        previewLimit: params.previewLimit,
        previewMaxChars: params.previewMaxChars,
      }),
      this.options.gateway.readIntentMessages({
        intentKey,
        limit: params.limit ?? this.options.defaultHistoryLimit,
      }),
    ]);

    return {
      intent,
      messages: this.historyProjector.project(this.mapper.toIntentMessages(history.messages)),
    };
  }

  async getIntentMessages(
    intentKey: string,
    params: { limit?: number } = {},
  ): Promise<IntentMessagesResponse> {
    const catalog = await this.options.gateway.listIntents();
    const [intent, history] = await Promise.all([
      this.buildIntentDetail(catalog, intentKey),
      this.options.gateway.readIntentMessages({
        intentKey,
        limit: params.limit ?? this.options.defaultHistoryLimit,
      }),
    ]);

    return {
      intent,
      messages: this.historyProjector.project(this.mapper.toIntentMessages(history.messages)),
    };
  }

  async getIntentPreview(
    intentKey: string,
    params: {
      limit?: number;
      maxChars?: number;
    } = {},
  ): Promise<IntentPreviewResponse> {
    const catalog = await this.options.gateway.listIntents();
    const [intent, preview] = await Promise.all([
      this.buildIntentDetail(catalog, intentKey),
      this.options.gateway.previewIntents({
        intentKeys: [intentKey],
        limit: params.limit ?? this.options.defaultPreviewLimit,
        maxChars: params.maxChars ?? this.options.defaultPreviewMaxChars,
      }),
    ]);

    return {
      intent,
      preview: preview[0]?.items.map((item) => this.mapper.toIntentPreview(item)) ?? [],
    };
  }

  async sendMessage(
    intentKey: string,
    payload: SendIntentMessageRequest,
  ): Promise<SendIntentMessageResponse> {
    const intent = await this.getIntent(intentKey);
    if (payload.waitForFinal) {
      const result = await this.options.gateway.sendIntentMessageAndWait({
        intentKey,
        message: payload.text,
        thinking: payload.thinking,
        deliver: payload.deliver,
        timeoutMs: payload.timeoutMs,
      });

      const finalEvent = this.mapper.toIntentEvent(intentKey, result.final);
      return {
        intent,
        runId: result.ack.runId,
        accepted: true,
        finalState: result.final.state,
        finalMessage: finalEvent?.type === "message" ? finalEvent.message : undefined,
      };
    }

    const ack = await this.options.gateway.sendIntentMessage({
      intentKey,
      message: payload.text,
      thinking: payload.thinking,
      deliver: payload.deliver,
      timeoutMs: payload.timeoutMs,
    });

    return {
      intent,
      runId: ack.runId,
      accepted: true,
    };
  }

  async abortMessage(
    intentKey: string,
    payload: AbortIntentMessageRequest = {},
  ): Promise<AbortIntentMessageResponse> {
    await this.getIntent(intentKey);
    const result = await this.options.gateway.abortIntentRun({
      intentKey,
      runId: payload.runId,
    });
    return {
      ok: result.ok,
      intentKey,
      aborted: result.aborted,
      runIds: result.runIds,
    };
  }

  async patchIntent(intentKey: string, payload: PatchIntentRequest): Promise<PatchIntentResponse> {
    await this.getIntent(intentKey);
    await this.options.gateway.updateIntent({
      intentKey,
      changes: payload.changes,
    });
    return {
      intent: await this.getIntent(intentKey),
    };
  }

  async resetIntent(
    intentKey: string,
    payload: ResetIntentRequest = {},
  ): Promise<ResetIntentResponse> {
    const result = await this.options.gateway.resetIntent({
      intentKey,
      reason: payload.reason,
    });
    return {
      ok: result.ok,
      intentKey,
      intent: await this.getIntent(intentKey),
    };
  }

  async deleteIntent(
    intentKey: string,
    params: {
      deleteTranscript?: boolean;
      emitLifecycleHooks?: boolean;
    } = {},
  ): Promise<DeleteIntentResponse> {
    await this.getIntent(intentKey);
    const result = await this.options.gateway.deleteIntent({
      intentKey,
      deleteTranscript: params.deleteTranscript,
      emitLifecycleHooks: params.emitLifecycleHooks,
    });
    return {
      ok: result.ok,
      intentKey,
      deleted: result.deleted,
      archived: result.archived,
    };
  }

  async compactIntent(
    intentKey: string,
    payload: CompactIntentRequest = {},
  ): Promise<CompactIntentResponse> {
    await this.getIntent(intentKey);
    const result = await this.options.gateway.compactIntent({
      intentKey,
      reason: payload.reason,
    });
    return {
      ok: result.ok,
      intentKey,
      compacted: result.compacted,
      reason: result.reason,
    };
  }

  async subscribeToIntentEvents(
    intentKey: string,
    listener: (event: IntentStreamEvent) => void,
  ): Promise<() => void> {
    const catalog = await this.options.gateway.listIntents();
    this.findIntentRecord(catalog, intentKey);
    const projector = new IntentStreamProjector({
      intentKey,
      mapper: this.mapper,
    });
    return this.options.gateway.onIntentEvent((payload) => {
      for (const event of projector.project(payload)) {
        listener(event);
      }
    });
  }

  private async loadPreviewMap(
    intentKeys: string[],
    previewLimit?: number,
    previewMaxChars?: number,
  ): Promise<Map<string, IntentPreviewItem[] | undefined>> {
    if (intentKeys.length === 0) {
      return new Map();
    }

    const previews = await this.options.gateway.previewIntents({
      intentKeys,
      limit: previewLimit ?? this.options.defaultPreviewLimit,
      maxChars: previewMaxChars ?? this.options.defaultPreviewMaxChars,
    });

    return new Map(
      previews.map((preview) => [
        preview.intentKey,
        preview.items.map((item) => this.mapper.toIntentPreview(item)),
      ]),
    );
  }

  private async buildIntentDetail(
    catalog: RuntimeIntentCatalog,
    intentKey: string,
    params: {
      includePreview?: boolean;
      previewLimit?: number;
      previewMaxChars?: number;
    } = {},
  ): Promise<IntentDetail> {
    const record = this.findIntentRecord(catalog, intentKey);
    const preview = params.includePreview
      ? (
          await this.options.gateway.previewIntents({
            intentKeys: [intentKey],
            limit: params.previewLimit ?? this.options.defaultPreviewLimit,
            maxChars: params.previewMaxChars ?? this.options.defaultPreviewMaxChars,
          })
        )[0]
      : undefined;

    return this.mapper.toIntentDetail(record, catalog.defaults, preview);
  }

  private findIntentRecord(catalog: RuntimeIntentCatalog, intentKey: string): RuntimeIntentRecord {
    const record = catalog.intents.find((candidate) => candidate.key === intentKey);
    if (!record) {
      throw new IntentNotFoundError(intentKey);
    }
    return record;
  }

  private compareIntentSummary(left: IntentSummary, right: IntentSummary): number {
    if (left.kind !== right.kind) {
      return left.kind === "orb" ? -1 : 1;
    }
    return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
  }
}

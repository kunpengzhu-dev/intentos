type SchemaTarget = {
  addSchema: (schema: Record<string, unknown>) => unknown;
};

export const intentApiSchemaRef = {
  error: "IntentosErrorResponse",
  health: "IntentosHealthResponse",
  intentOrigin: "IntentOrigin",
  intentDelivery: "IntentDelivery",
  intentLineage: "IntentLineage",
  intentTokenUsage: "IntentTokenUsage",
  intentExecution: "IntentExecutionSnapshot",
  intentCapabilities: "IntentCapabilities",
  intentRuntime: "IntentRuntimeSnapshot",
  intentDefaults: "IntentDefaults",
  intentPreviewItem: "IntentPreviewItem",
  intentSummary: "IntentSummary",
  intentDetail: "IntentDetail",
  intentMessagePart: "IntentMessagePart",
  intentMessage: "IntentMessage",
  intentStreamEvent: "IntentStreamEvent",
  intentListResponse: "IntentListResponse",
  intentDetailResponse: "IntentDetailResponse",
  intentMessagesResponse: "IntentMessagesResponse",
  intentPreviewResponse: "IntentPreviewResponse",
  intentViewResponse: "IntentViewResponse",
  sendIntentMessageRequest: "SendIntentMessageRequest",
  sendIntentMessageResponse: "SendIntentMessageResponse",
  abortIntentMessageRequest: "AbortIntentMessageRequest",
  abortIntentMessageResponse: "AbortIntentMessageResponse",
  patchIntentRequest: "PatchIntentRequest",
  patchIntentResponse: "PatchIntentResponse",
  resetIntentRequest: "ResetIntentRequest",
  resetIntentResponse: "ResetIntentResponse",
  compactIntentRequest: "CompactIntentRequest",
  compactIntentResponse: "CompactIntentResponse",
  deleteIntentResponse: "DeleteIntentResponse",
} as const;

const intentApiSchemas: Record<string, unknown>[] = [
  {
    $id: intentApiSchemaRef.error,
    type: "object",
    required: ["error", "message"],
    properties: {
      error: { type: "string" },
      message: { type: "string" },
    },
  },
  {
    $id: intentApiSchemaRef.health,
    type: "object",
    required: ["ok", "gateway"],
    properties: {
      ok: { type: "boolean" },
      gateway: {
        type: "object",
        required: ["connectionState"],
        properties: {
          connectionState: { type: "string" },
        },
      },
    },
  },
  {
    $id: intentApiSchemaRef.intentOrigin,
    type: "object",
    properties: {
      label: { type: "string" },
      provider: { type: "string" },
      surface: { type: "string" },
      chatType: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      accountId: { type: "string" },
      threadId: {
        anyOf: [{ type: "string" }, { type: "number" }],
      },
    },
  },
  {
    $id: intentApiSchemaRef.intentDelivery,
    type: "object",
    properties: {
      channel: { type: "string" },
      to: { type: "string" },
      accountId: { type: "string" },
      threadId: {
        anyOf: [{ type: "string" }, { type: "number" }],
      },
    },
  },
  {
    $id: intentApiSchemaRef.intentLineage,
    type: "object",
    required: ["orbIntentKey", "depth"],
    properties: {
      orbIntentKey: { type: "string" },
      parentIntentKey: { type: "string" },
      spawnedByIntentKey: { type: "string" },
      depth: { type: "number" },
    },
  },
  {
    $id: intentApiSchemaRef.intentTokenUsage,
    type: "object",
    properties: {
      inputTokens: { type: "number" },
      outputTokens: { type: "number" },
      totalTokens: { type: "number" },
      totalTokensFresh: { type: "boolean" },
      contextTokens: { type: "number" },
    },
  },
  {
    $id: intentApiSchemaRef.intentExecution,
    type: "object",
    required: ["phase", "busy", "interruptible"],
    properties: {
      phase: { type: "string" },
      busy: { type: "boolean" },
      interruptible: { type: "boolean" },
      lastDisposition: { type: "string" },
    },
  },
  {
    $id: intentApiSchemaRef.intentCapabilities,
    type: "object",
    required: [
      "canSendMessages",
      "canAbortRuns",
      "canPatch",
      "canReset",
      "canDelete",
      "canCompact",
      "supportsHistory",
      "supportsPreview",
      "supportsStreaming",
    ],
    properties: {
      canSendMessages: { type: "boolean" },
      canAbortRuns: { type: "boolean" },
      canPatch: { type: "boolean" },
      canReset: { type: "boolean" },
      canDelete: { type: "boolean" },
      canCompact: { type: "boolean" },
      supportsHistory: { type: "boolean" },
      supportsPreview: { type: "boolean" },
      supportsStreaming: { type: "boolean" },
    },
  },
  {
    $id: intentApiSchemaRef.intentRuntime,
    type: "object",
    required: ["lineage"],
    properties: {
      backingId: { type: "string" },
      model: { type: "string" },
      modelProvider: { type: "string" },
      channel: { type: "string" },
      chatType: { type: "string" },
      spawnedBy: { type: "string" },
      deliveryTarget: { type: "string" },
      origin: { $ref: intentApiSchemaRef.intentOrigin },
      delivery: { $ref: intentApiSchemaRef.intentDelivery },
      lineage: { $ref: intentApiSchemaRef.intentLineage },
      tokens: { $ref: intentApiSchemaRef.intentTokenUsage },
    },
  },
  {
    $id: intentApiSchemaRef.intentDefaults,
    type: "object",
    required: ["modelProvider", "model", "contextTokens"],
    properties: {
      modelProvider: { anyOf: [{ type: "string" }, { type: "null" }] },
      model: { anyOf: [{ type: "string" }, { type: "null" }] },
      contextTokens: { anyOf: [{ type: "number" }, { type: "null" }] },
    },
  },
  {
    $id: intentApiSchemaRef.intentPreviewItem,
    type: "object",
    required: ["role", "text"],
    properties: {
      role: { type: "string" },
      text: { type: "string" },
    },
  },
  {
    $id: intentApiSchemaRef.intentSummary,
    type: "object",
    required: [
      "id",
      "key",
      "kind",
      "placement",
      "title",
      "status",
      "updatedAt",
      "execution",
      "capabilities",
      "runtime",
    ],
    properties: {
      id: { type: "string" },
      key: { type: "string" },
      kind: { type: "string", enum: ["orb", "intent"] },
      placement: { type: "string", enum: ["orb", "background"] },
      title: { type: "string" },
      status: { type: "string" },
      updatedAt: { anyOf: [{ type: "number" }, { type: "null" }] },
      previewText: { type: "string" },
      thinkingLevel: { type: "string" },
      verboseLevel: { type: "string" },
      reasoningLevel: { type: "string" },
      elevatedLevel: { type: "string" },
      execution: { $ref: intentApiSchemaRef.intentExecution },
      capabilities: { $ref: intentApiSchemaRef.intentCapabilities },
      runtime: { $ref: intentApiSchemaRef.intentRuntime },
    },
  },
  {
    $id: intentApiSchemaRef.intentDetail,
    type: "object",
    allOf: [
      { $ref: intentApiSchemaRef.intentSummary },
      {
        type: "object",
        required: ["defaults"],
        properties: {
          defaults: { $ref: intentApiSchemaRef.intentDefaults },
          preview: {
            type: "array",
            items: { $ref: intentApiSchemaRef.intentPreviewItem },
          },
        },
      },
    ],
  },
  {
    $id: intentApiSchemaRef.intentMessagePart,
    oneOf: [
      {
        type: "object",
        required: ["type", "text"],
        properties: {
          type: { const: "text" },
          text: { type: "string" },
        },
      },
      {
        type: "object",
        required: ["type"],
        properties: {
          type: { const: "image" },
          mimeType: { type: "string" },
          content: { type: "string" },
          source: { type: "object", additionalProperties: true },
        },
      },
      {
        type: "object",
        required: ["type", "name"],
        properties: {
          type: { const: "toolcall" },
          id: { type: "string" },
          name: { type: "string" },
          arguments: {},
          summary: { type: "string" },
        },
      },
      {
        type: "object",
        required: ["type", "name"],
        properties: {
          type: { const: "toolresult" },
          name: { type: "string" },
          text: { type: "string" },
          summary: { type: "string" },
          isError: { type: "boolean" },
        },
      },
      {
        type: "object",
        properties: {
          type: { type: "string" },
        },
        additionalProperties: true,
      },
    ],
  },
  {
    $id: intentApiSchemaRef.intentMessage,
    type: "object",
    required: ["id", "role", "parts", "text", "timestamp"],
    properties: {
      id: { type: "string" },
      role: { type: "string" },
      parts: { type: "array", items: { $ref: intentApiSchemaRef.intentMessagePart } },
      text: { type: "string" },
      timestamp: { anyOf: [{ type: "number" }, { type: "null" }] },
      runId: { type: "string" },
      toolCallId: { type: "string" },
      displayGroupId: { type: "string" },
      source: {
        type: "object",
        properties: {
          kind: { type: "string" },
          intentKey: { type: "string" },
          channel: { type: "string" },
          tool: { type: "string" },
        },
      },
    },
  },
  {
    $id: intentApiSchemaRef.intentStreamEvent,
    oneOf: [
      {
        type: "object",
        required: ["type", "intentKey", "runId", "phase", "timestamp"],
        properties: {
          type: { const: "run" },
          intentKey: { type: "string" },
          runId: { type: "string" },
          phase: { type: "string" },
          seq: { type: "number" },
          timestamp: { anyOf: [{ type: "number" }, { type: "null" }] },
        },
      },
      {
        type: "object",
        required: ["type", "intentKey", "runId", "state", "message", "timestamp"],
        properties: {
          type: { const: "message" },
          intentKey: { type: "string" },
          runId: { type: "string" },
          state: { type: "string" },
          message: { $ref: intentApiSchemaRef.intentMessage },
          seq: { type: "number" },
          timestamp: { anyOf: [{ type: "number" }, { type: "null" }] },
          usage: { type: "object", additionalProperties: true },
        },
      },
      {
        type: "object",
        required: ["type", "intentKey", "runId", "toolCallId", "phase", "timestamp"],
        properties: {
          type: { const: "tool" },
          intentKey: { type: "string" },
          runId: { type: "string" },
          toolCallId: { type: "string" },
          toolName: { type: "string" },
          phase: { type: "string" },
          seq: { type: "number" },
          timestamp: { anyOf: [{ type: "number" }, { type: "null" }] },
          args: {},
          meta: { type: "string" },
          summary: { type: "string" },
          isError: { type: "boolean" },
        },
      },
      {
        type: "object",
        required: ["type", "intentKey", "runId", "state", "timestamp"],
        properties: {
          type: { const: "status" },
          intentKey: { type: "string" },
          runId: { type: "string" },
          state: { type: "string" },
          seq: { type: "number" },
          timestamp: { anyOf: [{ type: "number" }, { type: "null" }] },
          errorMessage: { anyOf: [{ type: "string" }, { type: "null" }] },
          usage: { type: "object", additionalProperties: true },
        },
      },
    ],
  },
  {
    $id: intentApiSchemaRef.intentListResponse,
    type: "object",
    required: ["orbIntentKey", "intents"],
    properties: {
      orbIntentKey: { type: "string" },
      intents: { type: "array", items: { $ref: intentApiSchemaRef.intentSummary } },
    },
  },
  {
    $id: intentApiSchemaRef.intentDetailResponse,
    type: "object",
    required: ["intent"],
    properties: {
      intent: { $ref: intentApiSchemaRef.intentDetail },
    },
  },
  {
    $id: intentApiSchemaRef.intentMessagesResponse,
    type: "object",
    required: ["intent", "messages"],
    properties: {
      intent: { $ref: intentApiSchemaRef.intentSummary },
      messages: { type: "array", items: { $ref: intentApiSchemaRef.intentMessage } },
    },
  },
  {
    $id: intentApiSchemaRef.intentPreviewResponse,
    type: "object",
    required: ["intent", "preview"],
    properties: {
      intent: { $ref: intentApiSchemaRef.intentSummary },
      preview: { type: "array", items: { $ref: intentApiSchemaRef.intentPreviewItem } },
    },
  },
  {
    $id: intentApiSchemaRef.intentViewResponse,
    type: "object",
    required: ["intent", "messages"],
    properties: {
      intent: { $ref: intentApiSchemaRef.intentDetail },
      messages: { type: "array", items: { $ref: intentApiSchemaRef.intentMessage } },
    },
  },
  {
    $id: intentApiSchemaRef.sendIntentMessageRequest,
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string" },
      thinking: { type: "string" },
      deliver: { type: "boolean" },
      waitForFinal: { type: "boolean" },
      timeoutMs: { type: "number" },
    },
  },
  {
    $id: intentApiSchemaRef.sendIntentMessageResponse,
    type: "object",
    required: ["intent", "runId", "accepted"],
    properties: {
      intent: { $ref: intentApiSchemaRef.intentSummary },
      runId: { type: "string" },
      accepted: { type: "boolean" },
      finalState: { type: "string" },
      finalMessage: { $ref: intentApiSchemaRef.intentMessage },
    },
  },
  {
    $id: intentApiSchemaRef.abortIntentMessageRequest,
    type: "object",
    properties: {
      runId: { type: "string" },
    },
  },
  {
    $id: intentApiSchemaRef.abortIntentMessageResponse,
    type: "object",
    required: ["ok", "intentKey"],
    properties: {
      ok: { type: "boolean" },
      intentKey: { type: "string" },
      aborted: { type: "boolean" },
      runIds: { type: "array", items: { type: "string" } },
    },
  },
  {
    $id: intentApiSchemaRef.patchIntentRequest,
    type: "object",
    required: ["changes"],
    properties: {
      changes: { type: "object", additionalProperties: true },
    },
  },
  {
    $id: intentApiSchemaRef.patchIntentResponse,
    type: "object",
    required: ["intent"],
    properties: {
      intent: { $ref: intentApiSchemaRef.intentDetail },
    },
  },
  {
    $id: intentApiSchemaRef.resetIntentRequest,
    type: "object",
    properties: {
      reason: { type: "string" },
    },
  },
  {
    $id: intentApiSchemaRef.resetIntentResponse,
    type: "object",
    required: ["ok", "intentKey", "intent"],
    properties: {
      ok: { type: "boolean" },
      intentKey: { type: "string" },
      intent: { $ref: intentApiSchemaRef.intentDetail },
    },
  },
  {
    $id: intentApiSchemaRef.compactIntentRequest,
    type: "object",
    properties: {
      reason: { type: "string" },
    },
  },
  {
    $id: intentApiSchemaRef.compactIntentResponse,
    type: "object",
    required: ["ok", "intentKey"],
    properties: {
      ok: { type: "boolean" },
      intentKey: { type: "string" },
      compacted: { type: "boolean" },
      reason: { type: "string" },
    },
  },
  {
    $id: intentApiSchemaRef.deleteIntentResponse,
    type: "object",
    required: ["ok", "intentKey"],
    properties: {
      ok: { type: "boolean" },
      intentKey: { type: "string" },
      deleted: { type: "boolean" },
      archived: { type: "boolean" },
    },
  },
];

export function registerIntentApiSchemas(target: SchemaTarget): void {
  for (const schema of intentApiSchemas) {
    target.addSchema(schema);
  }
}

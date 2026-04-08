import type {
  AbortIntentMessageRequest,
  CompactIntentRequest,
  PatchIntentRequest,
  ResetIntentRequest,
  SendIntentMessageRequest,
} from "@intentos/shared";
import { intentApiSchemaRef } from "@intentos/shared";
import type { FastifyInstance } from "fastify";
import type { IntentCoordinator } from "../intent-coordinator.js";

type IntentKeyParams = {
  intentKey: string;
};

type ListQuery = {
  includePreview?: string;
  previewLimit?: string;
  previewMaxChars?: string;
};

type MessagesQuery = {
  limit?: string;
};

type PreviewQuery = {
  limit?: string;
  maxChars?: string;
};

type ViewQuery = {
  limit?: string;
  previewLimit?: string;
  previewMaxChars?: string;
};

type DeleteQuery = {
  deleteTranscript?: string;
  emitLifecycleHooks?: string;
};

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "1" || value === "true") {
    return true;
  }
  if (value === "0" || value === "false") {
    return false;
  }
  return undefined;
}

export async function registerIntentRoutes(
  app: FastifyInstance,
  coordinator: IntentCoordinator,
): Promise<void> {
  const intentKeyParamsSchema = {
    type: "object",
    required: ["intentKey"],
    properties: {
      intentKey: { type: "string" },
    },
  } as const;

  app.get<{ Querystring: ListQuery }>(
    "/api/intents",
    {
      schema: {
        tags: ["intents"],
        summary: "List intents",
        querystring: {
          type: "object",
          properties: {
            includePreview: { type: "string", enum: ["true", "false", "1", "0"] },
            previewLimit: { type: "string" },
            previewMaxChars: { type: "string" },
          },
        },
        response: {
          200: { $ref: intentApiSchemaRef.intentListResponse },
          500: { $ref: intentApiSchemaRef.error },
        },
      },
    },
    async (request) =>
      coordinator.listIntents({
        includePreview: parseBoolean(request.query.includePreview),
        previewLimit: parseNumber(request.query.previewLimit),
        previewMaxChars: parseNumber(request.query.previewMaxChars),
      }),
  );

  app.get(
    "/api/orb",
    {
      schema: {
        tags: ["intents"],
        summary: "Read orb intent",
        response: {
          200: { $ref: intentApiSchemaRef.intentDetailResponse },
          500: { $ref: intentApiSchemaRef.error },
        },
      },
    },
    async () => ({
      intent: await coordinator.getOrbIntent(),
    }),
  );

  app.get<{ Params: IntentKeyParams; Querystring: PreviewQuery }>(
    "/api/intents/:intentKey",
    {
      schema: {
        tags: ["intents"],
        summary: "Read intent detail",
        params: intentKeyParamsSchema,
        querystring: {
          type: "object",
          properties: {
            limit: { type: "string" },
            maxChars: { type: "string" },
          },
        },
        response: {
          200: { $ref: intentApiSchemaRef.intentDetailResponse },
          404: { $ref: intentApiSchemaRef.error },
          500: { $ref: intentApiSchemaRef.error },
        },
      },
    },
    async (request) => ({
      intent: await coordinator.getIntent(request.params.intentKey, {
        includePreview: true,
        previewLimit: parseNumber(request.query.limit),
        previewMaxChars: parseNumber(request.query.maxChars),
      }),
    }),
  );

  app.get<{ Params: IntentKeyParams; Querystring: MessagesQuery }>(
    "/api/intents/:intentKey/messages",
    {
      schema: {
        tags: ["messages"],
        summary: "Read intent messages",
        params: intentKeyParamsSchema,
        querystring: {
          type: "object",
          properties: {
            limit: { type: "string" },
          },
        },
        response: {
          200: { $ref: intentApiSchemaRef.intentMessagesResponse },
          404: { $ref: intentApiSchemaRef.error },
          500: { $ref: intentApiSchemaRef.error },
        },
      },
    },
    async (request) =>
      coordinator.getIntentMessages(request.params.intentKey, {
        limit: parseNumber(request.query.limit),
      }),
  );

  app.get<{ Params: IntentKeyParams; Querystring: PreviewQuery }>(
    "/api/intents/:intentKey/preview",
    {
      schema: {
        tags: ["intents"],
        summary: "Read intent preview",
        params: intentKeyParamsSchema,
        querystring: {
          type: "object",
          properties: {
            limit: { type: "string" },
            maxChars: { type: "string" },
          },
        },
        response: {
          200: { $ref: intentApiSchemaRef.intentPreviewResponse },
          404: { $ref: intentApiSchemaRef.error },
          500: { $ref: intentApiSchemaRef.error },
        },
      },
    },
    async (request) =>
      coordinator.getIntentPreview(request.params.intentKey, {
        limit: parseNumber(request.query.limit),
        maxChars: parseNumber(request.query.maxChars),
      }),
  );

  app.get<{ Params: IntentKeyParams; Querystring: ViewQuery }>(
    "/api/intents/:intentKey/view",
    {
      schema: {
        tags: ["intents"],
        summary: "Read intent detail with message history",
        params: intentKeyParamsSchema,
        querystring: {
          type: "object",
          properties: {
            limit: { type: "string" },
            previewLimit: { type: "string" },
            previewMaxChars: { type: "string" },
          },
        },
        response: {
          200: { $ref: intentApiSchemaRef.intentViewResponse },
          404: { $ref: intentApiSchemaRef.error },
          500: { $ref: intentApiSchemaRef.error },
        },
      },
    },
    async (request) =>
      coordinator.getIntentView(request.params.intentKey, {
        limit: parseNumber(request.query.limit),
        previewLimit: parseNumber(request.query.previewLimit),
        previewMaxChars: parseNumber(request.query.previewMaxChars),
      }),
  );

  app.post<{ Params: IntentKeyParams; Body: SendIntentMessageRequest }>(
    "/api/intents/:intentKey/messages",
    {
      schema: {
        tags: ["messages"],
        summary: "Send a message to an intent",
        params: intentKeyParamsSchema,
        body: { $ref: intentApiSchemaRef.sendIntentMessageRequest },
        response: {
          200: { $ref: intentApiSchemaRef.sendIntentMessageResponse },
          404: { $ref: intentApiSchemaRef.error },
          500: { $ref: intentApiSchemaRef.error },
        },
      },
    },
    async (request) => coordinator.sendMessage(request.params.intentKey, request.body),
  );

  app.post<{ Params: IntentKeyParams; Body: AbortIntentMessageRequest }>(
    "/api/intents/:intentKey/messages/abort",
    {
      schema: {
        tags: ["messages"],
        summary: "Abort an in-flight intent run",
        params: intentKeyParamsSchema,
        body: { $ref: intentApiSchemaRef.abortIntentMessageRequest },
        response: {
          200: { $ref: intentApiSchemaRef.abortIntentMessageResponse },
          404: { $ref: intentApiSchemaRef.error },
          500: { $ref: intentApiSchemaRef.error },
        },
      },
    },
    async (request) => coordinator.abortMessage(request.params.intentKey, request.body),
  );

  app.patch<{ Params: IntentKeyParams; Body: PatchIntentRequest }>(
    "/api/intents/:intentKey",
    {
      schema: {
        tags: ["intents"],
        summary: "Patch intent metadata",
        params: intentKeyParamsSchema,
        body: { $ref: intentApiSchemaRef.patchIntentRequest },
        response: {
          200: { $ref: intentApiSchemaRef.patchIntentResponse },
          404: { $ref: intentApiSchemaRef.error },
          500: { $ref: intentApiSchemaRef.error },
        },
      },
    },
    async (request) => coordinator.patchIntent(request.params.intentKey, request.body),
  );

  app.post<{ Params: IntentKeyParams; Body: ResetIntentRequest }>(
    "/api/intents/:intentKey/reset",
    {
      schema: {
        tags: ["intents"],
        summary: "Reset an intent",
        params: intentKeyParamsSchema,
        body: { $ref: intentApiSchemaRef.resetIntentRequest },
        response: {
          200: { $ref: intentApiSchemaRef.resetIntentResponse },
          404: { $ref: intentApiSchemaRef.error },
          500: { $ref: intentApiSchemaRef.error },
        },
      },
    },
    async (request) => coordinator.resetIntent(request.params.intentKey, request.body),
  );

  app.delete<{ Params: IntentKeyParams; Querystring: DeleteQuery }>(
    "/api/intents/:intentKey",
    {
      schema: {
        tags: ["intents"],
        summary: "Delete an intent",
        params: intentKeyParamsSchema,
        querystring: {
          type: "object",
          properties: {
            deleteTranscript: { type: "string", enum: ["true", "false", "1", "0"] },
            emitLifecycleHooks: { type: "string", enum: ["true", "false", "1", "0"] },
          },
        },
        response: {
          200: { $ref: intentApiSchemaRef.deleteIntentResponse },
          404: { $ref: intentApiSchemaRef.error },
          500: { $ref: intentApiSchemaRef.error },
        },
      },
    },
    async (request) =>
      coordinator.deleteIntent(request.params.intentKey, {
        deleteTranscript: parseBoolean(request.query.deleteTranscript),
        emitLifecycleHooks: parseBoolean(request.query.emitLifecycleHooks),
      }),
  );

  app.post<{ Params: IntentKeyParams; Body: CompactIntentRequest }>(
    "/api/intents/:intentKey/compact",
    {
      schema: {
        tags: ["intents"],
        summary: "Compact an intent transcript",
        params: intentKeyParamsSchema,
        body: { $ref: intentApiSchemaRef.compactIntentRequest },
        response: {
          200: { $ref: intentApiSchemaRef.compactIntentResponse },
          404: { $ref: intentApiSchemaRef.error },
          500: { $ref: intentApiSchemaRef.error },
        },
      },
    },
    async (request) => coordinator.compactIntent(request.params.intentKey, request.body),
  );

  app.get<{ Params: IntentKeyParams }>(
    "/api/intents/:intentKey/events",
    {
      schema: {
        tags: ["messages"],
        summary: "Subscribe to intent SSE events",
        description: "Streams `message` and `status` events over Server-Sent Events.",
        hide: true,
        params: intentKeyParamsSchema,
      },
    },
    async (request, reply) => {
      const origin = request.headers.origin;
      reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("Access-Control-Allow-Origin", origin ?? "*");
      reply.raw.setHeader("Vary", "Origin");
      reply.raw.flushHeaders();

      const unsubscribe = await coordinator.subscribeToIntentEvents(
        request.params.intentKey,
        (event) => {
          reply.raw.write(`event: ${event.type}\n`);
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        },
      );

      const heartbeat = setInterval(() => {
        reply.raw.write(": keep-alive\n\n");
      }, 15_000);

      request.raw.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
        reply.raw.end();
      });

      await new Promise<void>(() => {});
    },
  );
}

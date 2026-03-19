import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { IntentCoordinator } from "../src/intent-coordinator.js";
import type {
  IntentRuntimeConnectionState,
  IntentRuntimeGateway,
  RuntimeIntentStreamEvent,
} from "../src/ports/intent-runtime-gateway.js";

class MinimalGateway implements IntentRuntimeGateway {
  constructor(
    private readonly history: {
      intentKey: string;
      messages: Array<Record<string, unknown>>;
    } = {
      intentKey: "agent:main:main",
      messages: [],
    },
  ) {}

  getConnectionState(): IntentRuntimeConnectionState {
    return "connected";
  }

  async listIntents() {
    return {
      defaults: {
        modelProvider: null,
        model: null,
        contextTokens: null,
      },
      intents: [
        {
          key: "agent:main:main",
          updatedAt: 1,
          backingId: "orb",
        },
      ],
    };
  }

  async previewIntents() {
    return [];
  }

  async readIntentMessages() {
    return this.history as Awaited<ReturnType<IntentRuntimeGateway["readIntentMessages"]>>;
  }

  async sendIntentMessage() {
    return { runId: "run-1", status: "accepted" };
  }

  async sendIntentMessageAndWait() {
    return {
      ack: { runId: "run-1", status: "accepted" },
      final: { runId: "run-1", state: "final" as const },
    };
  }

  async abortIntentRun() {
    return { ok: true };
  }

  async updateIntent() {
    return { ok: true };
  }

  async resetIntent() {
    return { ok: true };
  }

  async deleteIntent() {
    return { ok: true, deleted: true };
  }

  async compactIntent() {
    return { ok: true, compacted: true };
  }

  async onIntentEvent(_listener: (payload: RuntimeIntentStreamEvent) => void) {
    return () => {};
  }
}

test("health route exposes gateway state", async () => {
  const coordinator = new IntentCoordinator({
    gateway: new MinimalGateway(),
    orbIntentKey: "agent:main:main",
    defaultHistoryLimit: 50,
    defaultPreviewLimit: 5,
    defaultPreviewMaxChars: 500,
  });

  const app = await createApp({
    config: {
      host: "127.0.0.1",
      port: 3030,
      corsOrigin: true,
      gatewayUrl: "ws://127.0.0.1:18789",
      orbIntentKey: "agent:main:main",
      defaultHistoryLimit: 50,
      defaultPreviewLimit: 5,
      defaultPreviewMaxChars: 500,
      rootDir: process.cwd(),
    },
    coordinator,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    gateway: {
      connectionState: "connected",
    },
  });

  await app.close();
});

test("swagger json route exposes openapi document", async () => {
  const coordinator = new IntentCoordinator({
    gateway: new MinimalGateway(),
    orbIntentKey: "agent:main:main",
    defaultHistoryLimit: 50,
    defaultPreviewLimit: 5,
    defaultPreviewMaxChars: 500,
  });

  const app = await createApp({
    config: {
      host: "127.0.0.1",
      port: 3030,
      corsOrigin: true,
      gatewayUrl: "ws://127.0.0.1:18789",
      orbIntentKey: "agent:main:main",
      defaultHistoryLimit: 50,
      defaultPreviewLimit: 5,
      defaultPreviewMaxChars: 500,
      rootDir: process.cwd(),
    },
    coordinator,
  });

  const response = await app.inject({
    method: "GET",
    url: "/docs/json",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as { openapi?: string; info?: { title?: string } };
  assert.equal(body.openapi, "3.0.3");
  assert.equal(body.info?.title, "IntentOS Backend API");

  await app.close();
});

test("root route serves the orb chat frontend", async () => {
  const coordinator = new IntentCoordinator({
    gateway: new MinimalGateway(),
    orbIntentKey: "agent:main:main",
    defaultHistoryLimit: 50,
    defaultPreviewLimit: 5,
    defaultPreviewMaxChars: 500,
  });

  const app = await createApp({
    config: {
      host: "127.0.0.1",
      port: 3030,
      corsOrigin: true,
      gatewayUrl: "ws://127.0.0.1:18789",
      orbIntentKey: "agent:main:main",
      defaultHistoryLimit: 50,
      defaultPreviewLimit: 5,
      defaultPreviewMaxChars: 500,
      rootDir: process.cwd(),
    },
    coordinator,
  });

  const response = await app.inject({
    method: "GET",
    url: "/",
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/html/);
  assert.match(response.body, /Orb Chat/);

  await app.close();
});

test("view route preserves toolcall ids in serialized history", async () => {
  const coordinator = new IntentCoordinator({
    gateway: new MinimalGateway({
      intentKey: "agent:main:main",
      messages: [
        {
          role: "assistant",
          parts: [{ type: "text", text: "我放到后台写，写好后通知你。" }],
          text: "我放到后台写，写好后通知你。",
          timestamp: 0,
        },
        {
          role: "assistant",
          parts: [
            {
              type: "toolcall",
              id: "call-history-1",
              name: "sessions_spawn",
              arguments: { label: "bg" },
            },
          ],
          timestamp: 1,
          toolCallId: "call-history-1",
        },
      ],
    }),
    orbIntentKey: "agent:main:main",
    defaultHistoryLimit: 50,
    defaultPreviewLimit: 5,
    defaultPreviewMaxChars: 500,
  });

  const app = await createApp({
    config: {
      host: "127.0.0.1",
      port: 3030,
      corsOrigin: true,
      gatewayUrl: "ws://127.0.0.1:18789",
      orbIntentKey: "agent:main:main",
      defaultHistoryLimit: 50,
      defaultPreviewLimit: 5,
      defaultPreviewMaxChars: 500,
      rootDir: process.cwd(),
    },
    coordinator,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/intents/agent:main:main/view",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    messages?: Array<{
      displayGroupId?: string;
      parts?: Array<{ id?: string }>;
    }>;
  };
  const toolCallMessage = body.messages?.find((message) => message?.parts?.some((part) => part?.id === "call-history-1"));
  assert.equal(toolCallMessage?.parts?.find((part) => part?.id === "call-history-1")?.id, "call-history-1");
  assert.equal(body.messages?.[0]?.displayGroupId, toolCallMessage?.displayGroupId);

  await app.close();
});

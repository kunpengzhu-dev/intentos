import assert from "node:assert/strict";
import test from "node:test";
import type { IntentStreamEvent, SendIntentMessageRequest } from "@intentos/shared";
import type {
  IntentRuntimeConnectionState,
  IntentRuntimeGateway,
  RuntimeIntentCatalog,
  RuntimeIntentHistory,
  RuntimeIntentPreview,
  RuntimeIntentRecord,
  RuntimeIntentStreamEvent,
} from "../src/ports/intent-runtime-gateway.js";
import { IntentCoordinator } from "../src/intent-coordinator.js";

class FakeIntentGateway implements IntentRuntimeGateway {
  listCalls = 0;
  readCalls = 0;
  sendCalls = 0;
  private streamListener: ((payload: RuntimeIntentStreamEvent) => void) | null = null;

  constructor(
    private readonly catalog: RuntimeIntentCatalog,
    private readonly history: RuntimeIntentHistory,
    private readonly previews: RuntimeIntentPreview[],
  ) {}

  getConnectionState(): IntentRuntimeConnectionState {
    return "connected";
  }

  async listIntents() {
    this.listCalls += 1;
    return this.catalog;
  }

  async previewIntents(): Promise<RuntimeIntentPreview[]> {
    return this.previews;
  }

  async readIntentMessages(): Promise<RuntimeIntentHistory> {
    this.readCalls += 1;
    return this.history;
  }

  async sendIntentMessage() {
    this.sendCalls += 1;
    return { runId: "run-1", status: "accepted" };
  }

  async sendIntentMessageAndWait() {
    return {
      ack: { runId: "run-1", status: "accepted" },
      final: {
        runId: "run-1",
        intentKey: "agent:main:main",
        state: "final",
        message: {
          role: "assistant",
          parts: [{ type: "text", text: "done" }],
          text: "done",
          timestamp: 5,
          runId: "run-1",
        },
      },
    };
  }

  async abortIntentRun() {
    return { ok: true, aborted: true };
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

  async onIntentEvent(listener: (payload: RuntimeIntentStreamEvent) => void) {
    this.streamListener = listener;
    return () => {
      this.streamListener = null;
    };
  }

  emit(event: RuntimeIntentStreamEvent) {
    this.streamListener?.(event);
  }
}

function createCoordinator() {
  const intents: RuntimeIntentRecord[] = [
    {
      key: "agent:main:subagent:poem",
      updatedAt: 100,
      title: "poem-bg",
      backingId: "session-task",
      previewText: "writing",
    },
    {
      key: "agent:main:main",
      updatedAt: 200,
      title: "main",
      backingId: "session-orb",
      previewText: "hello",
    },
  ];

  const history: RuntimeIntentHistory = {
    intentKey: "agent:main:main",
    messages: [
      {
        role: "user",
        text: "hello orb",
        timestamp: 1,
      },
      {
        role: "user",
        parts: [{ type: "text", text: "OpenClaw runtime context (internal): hidden" }],
        text: "OpenClaw runtime context (internal): hidden",
        timestamp: 2,
      },
      {
        role: "assistant",
        text: "all set",
        timestamp: 3,
      },
      {
        role: "assistant",
        text: "background done",
        timestamp: 4,
        source: {
          kind: "inter_session",
          sourceTool: "subagent_announce",
        },
      },
    ],
  };

  const previews: RuntimeIntentPreview[] = [
    {
      intentKey: "agent:main:main",
      status: "ok",
      items: [{ role: "assistant", text: "hello" }],
    },
    {
      intentKey: "agent:main:subagent:poem",
      status: "ok",
      items: [{ role: "assistant", text: "writing" }],
    },
  ];

  const catalog: RuntimeIntentCatalog = {
    defaults: {
      modelProvider: "openai",
      model: "gpt-5.4",
      contextTokens: 200_000,
    },
    intents,
  };

  const gateway = new FakeIntentGateway(catalog, history, previews);
  const coordinator = new IntentCoordinator({
    gateway,
    orbIntentKey: "agent:main:main",
    defaultHistoryLimit: 50,
    defaultPreviewLimit: 5,
    defaultPreviewMaxChars: 500,
  });
  return { coordinator, gateway };
}

test("lists orb first and maps sessions into intents", async () => {
  const { coordinator } = createCoordinator();
  const result = await coordinator.listIntents();

  assert.equal(result.orbIntentKey, "agent:main:main");
  assert.equal(result.intents[0]?.kind, "orb");
  assert.equal(result.intents[0]?.title, "Orb");
  assert.equal(result.intents[1]?.key, "agent:main:subagent:poem");
});

test("filters internal runtime history into intent messages", async () => {
  const { coordinator } = createCoordinator();
  const result = await coordinator.getIntentMessages("agent:main:main");

  assert.equal(result.messages.length, 3);
  assert.deepEqual(
    result.messages.map((message) => message.text),
    ["hello orb", "all set", "background done"],
  );
});

test("can wait for final intent message", async () => {
  const { coordinator } = createCoordinator();
  const payload: SendIntentMessageRequest = {
    text: "please continue",
    waitForFinal: true,
  };

  const result = await coordinator.sendMessage("agent:main:main", payload);
  assert.equal(result.runId, "run-1");
  assert.equal(result.finalState, "final");
  assert.equal(result.finalMessage?.text, "done");
});

test("reuses one catalog read for getIntentView", async () => {
  const { coordinator, gateway } = createCoordinator();

  const result = await coordinator.getIntentView("agent:main:main");

  assert.equal(result.intent.key, "agent:main:main");
  assert.equal(gateway.listCalls, 1);
});

test("returns a synthetic orb detail when the configured orb intent is missing", async () => {
  const gateway = new FakeIntentGateway(
    {
      defaults: {
        modelProvider: "openai",
        model: "gpt-5.4",
        contextTokens: 200_000,
      },
      intents: [],
    },
    {
      intentKey: "agent:main:main",
      messages: [],
    },
    [],
  );
  const coordinator = new IntentCoordinator({
    gateway,
    orbIntentKey: "agent:main:main",
    defaultHistoryLimit: 50,
    defaultPreviewLimit: 5,
    defaultPreviewMaxChars: 500,
  });

  const result = await coordinator.getIntentView("agent:main:main");

  assert.equal(result.intent.key, "agent:main:main");
  assert.equal(result.intent.kind, "orb");
  assert.equal(result.intent.title, "Orb");
  assert.deepEqual(result.messages, []);
  assert.equal(gateway.readCalls, 0);
});

test("allows sending the first message to a missing orb intent", async () => {
  const gateway = new FakeIntentGateway(
    {
      defaults: {
        modelProvider: "openai",
        model: "gpt-5.4",
        contextTokens: 200_000,
      },
      intents: [],
    },
    {
      intentKey: "agent:main:main",
      messages: [],
    },
    [],
  );
  const coordinator = new IntentCoordinator({
    gateway,
    orbIntentKey: "agent:main:main",
    defaultHistoryLimit: 50,
    defaultPreviewLimit: 5,
    defaultPreviewMaxChars: 500,
  });

  const result = await coordinator.sendMessage("agent:main:main", { text: "hello" });

  assert.equal(result.accepted, true);
  assert.equal(result.intent.key, "agent:main:main");
  assert.equal(result.intent.kind, "orb");
  assert.equal(gateway.sendCalls, 1);
});

test("projects normalized stream events for a visible main-session run", async () => {
  const { coordinator, gateway } = createCoordinator();
  const events: IntentStreamEvent[] = [];
  const unsubscribe = await coordinator.subscribeToIntentEvents("agent:main:main", (event) => {
    events.push(event);
  });

  gateway.emit({
    type: "run",
    intentKey: "agent:main:main",
    runId: "run-42",
    phase: "start",
    seq: 1,
    timestamp: 100,
  });
  gateway.emit({
    type: "message",
    intentKey: "agent:main:main",
    runId: "run-42",
    state: "delta",
    seq: 2,
    timestamp: 101,
    message: {
      role: "assistant",
      parts: [{ type: "text", text: "我放后台写，写好后通知你。NO" }],
      text: "我放后台写，写好后通知你。NO",
      timestamp: 101,
      runId: "run-42",
    },
  });
  gateway.emit({
    type: "tool",
    intentKey: "agent:main:main",
    runId: "run-42",
    toolCallId: "tool-1",
    toolName: "sessions_spawn",
    phase: "start",
    seq: 3,
    timestamp: 102,
    args: {
      label: "background-poem-200",
      task: "写一首小诗",
      timeoutSeconds: 300,
      cleanup: "delete",
    },
    summary: "label background-poem-200, task 写一首小诗, timeout 300, cleanup delete",
  });
  gateway.emit({
    type: "tool",
    intentKey: "agent:main:main",
    runId: "run-42",
    toolCallId: "tool-1",
    toolName: "sessions_spawn",
    phase: "result",
    seq: 4,
    timestamp: 103,
    meta: "done",
    isError: false,
  });
  gateway.emit({
    type: "run",
    intentKey: "agent:main:main",
    runId: "run-42",
    phase: "end",
    seq: 5,
    timestamp: 104,
  });

  unsubscribe();

  assert.deepEqual(
    events.map((event) => event.type),
    ["run", "message", "tool", "tool", "run"],
  );
  const messageEvent = events[1];
  const toolStartEvent = events[2];
  const toolResultEvent = events[3];
  assert.equal(messageEvent?.type, "message");
  assert.equal(messageEvent?.type === "message" ? messageEvent.message.text : undefined, "我放后台写，写好后通知你。");
  assert.equal(toolStartEvent?.type, "tool");
  assert.equal(toolStartEvent?.type === "tool" ? toolStartEvent.toolCallId : undefined, "tool-1");
  assert.equal(toolResultEvent?.type, "tool");
  assert.equal(toolResultEvent?.type === "tool" ? toolResultEvent.phase : undefined, "result");
  assert.equal(
    toolResultEvent?.type === "tool" ? toolResultEvent.summary : undefined,
    "label background-poem-200, task 写一首小诗, timeout 300, cleanup delete",
  );
});

test("suppresses silent reply runs and ignores non-target sessions", async () => {
  const { coordinator, gateway } = createCoordinator();
  const events: IntentStreamEvent[] = [];
  const unsubscribe = await coordinator.subscribeToIntentEvents("agent:main:main", (event) => {
    events.push(event);
  });

  gateway.emit({
    type: "run",
    intentKey: "agent:main:subagent:poem",
    runId: "run-sub",
    phase: "start",
    seq: 1,
    timestamp: 200,
  });
  gateway.emit({
    type: "message",
    intentKey: "agent:main:subagent:poem",
    runId: "run-sub",
    state: "delta",
    seq: 2,
    timestamp: 201,
    message: {
      role: "assistant",
      text: "清晨",
      parts: [{ type: "text", text: "清晨" }],
      timestamp: 201,
      runId: "run-sub",
    },
  });
  gateway.emit({
    type: "run",
    intentKey: "agent:main:main",
    runId: "run-silent",
    phase: "start",
    seq: 3,
    timestamp: 202,
  });
  gateway.emit({
    type: "message",
    intentKey: "agent:main:main",
    runId: "run-silent",
    state: "delta",
    seq: 4,
    timestamp: 203,
    message: {
      role: "assistant",
      text: "NO",
      parts: [{ type: "text", text: "NO" }],
      timestamp: 203,
      runId: "run-silent",
    },
  });
  gateway.emit({
    type: "run",
    intentKey: "agent:main:main",
    runId: "announce:v1:agent:main:subagent:poem:run-7",
    phase: "start",
    seq: 5,
    timestamp: 204,
  });
  gateway.emit({
    type: "message",
    intentKey: "agent:main:main",
    runId: "announce:v1:agent:main:subagent:poem:run-7",
    state: "delta",
    seq: 6,
    timestamp: 205,
    message: {
      role: "assistant",
      text: "写好了，已经通知你。",
      parts: [{ type: "text", text: "写好了，已经通知你。" }],
      timestamp: 205,
      runId: "announce:v1:agent:main:subagent:poem:run-7",
    },
  });

  unsubscribe();

  assert.equal(events.length, 2);
  assert.equal(events[0]?.type, "run");
  assert.equal(events[1]?.type, "message");
  assert.equal(events[1]?.runId, "announce:v1:agent:main:subagent:poem:run-7");
});

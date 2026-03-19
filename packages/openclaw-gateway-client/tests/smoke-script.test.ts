import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSmokeMethodDefinitions,
  parseArgs,
  runSmoke,
  runSmokeMethodDefinitions,
} from "../scripts/smoke-test.js";
import { parseDotEnv } from "../../shared/src/index.js";

function createLogger() {
  return {
    lines: [] as string[],
    log(message: string) {
      this.lines.push(message);
    },
    error(message: string) {
      this.lines.push(message);
    },
  };
}

test("parseDotEnv reads simple key-value pairs", () => {
  const parsed = parseDotEnv(`
OPENCLAW_GATEWAY_URL=ws://localhost:18789
OPENCLAW_TOKEN="secret"
# comment
`);

  assert.deepEqual(parsed, {
    OPENCLAW_GATEWAY_URL: "ws://localhost:18789",
    OPENCLAW_TOKEN: "secret",
  });
});

test("parseArgs prefers CLI over process env over file env", () => {
  const logger = createLogger();
  const parsed = parseArgs(
    ["--url", "ws://cli-host:1111", "--token", "cli-token", "--scopes", "operator.read"],
    {
      OPENCLAW_GATEWAY_URL: "ws://env-host:2222",
      OPENCLAW_TOKEN: "env-token",
    },
    {
      OPENCLAW_GATEWAY_URL: "ws://file-host:3333",
      OPENCLAW_TOKEN: "file-token",
    },
    logger,
  );

  assert.ok(parsed);
  assert.equal(parsed.url, "ws://cli-host:1111");
  assert.equal(parsed.token, "cli-token");
  assert.deepEqual(parsed.scopes, ["operator.read"]);
});

test("runSmoke fails early when auth is missing", async () => {
  await assert.rejects(
    runSmoke([], createLogger(), {
      env: {},
      fileEnv: {},
    }),
    /gateway auth is not configured/i,
  );
});

test("smoke method registry contains readonly and mutation entries", () => {
  const definitions = buildSmokeMethodDefinitions();
  assert.equal(definitions.find((definition) => definition.name === "health")?.mode, "readonly");
  assert.equal(definitions.find((definition) => definition.name === "config.set")?.mode, "mutation");
});

test("runSmokeMethodDefinitions skips mutation methods and fixture-dependent readonly methods", async () => {
  const logger = createLogger();
  const fakeClient = {
    isMethodAvailable: () => true,
    runtime: {
      health: async () => ({ ok: true }),
      status: async () => ({ status: "ok" }),
      lastHeartbeat: async () => ({ ok: true }),
      systemPresence: async () => [],
    },
    config: {
      logsTail: async () => ({ lines: [], cursor: 0, size: 0, file: "test.log" }),
      get: async () => ({ gateway: {} }),
      schema: async () => ({ schema: {}, uiHints: {}, version: "1", generatedAt: "now" }),
      lookup: async () => ({ path: "gateway.auth", schema: {}, children: [] }),
    },
    tools: {
      catalog: async () => ({ agentId: "main", profiles: [], groups: [] }),
    },
    agents: {
      list: async () => ({ defaultId: "main", mainKey: "main", scope: "per-sender", agents: [] }),
      filesList: async () => ({ agentId: "missing", workspace: "/tmp", files: [] }),
      filesGet: async () => ({ agentId: "missing", workspace: "/tmp", file: { name: "x", path: "x", missing: true } }),
    },
    skills: {
      status: async () => ({ agentId: "main", workspaceDir: "/tmp", managedSkillsDir: "/tmp", skills: [] }),
      bins: async () => ({ bins: [] }),
    },
    sessions: {
      list: async () => ({
        ts: Date.now(),
        path: "/tmp/sessions.json",
        count: 0,
        defaults: { defaultAgentId: "main", mainKey: "main", mainSessionKey: "main", scope: "per-sender" },
        sessions: [],
      }),
      preview: async () => ({ ts: Date.now(), previews: [] }),
    },
    cron: {
      list: async () => ({ jobs: [], total: 0, offset: 0, limit: 0, hasMore: false, nextOffset: null }),
      status: async () => ({ enabled: true, jobs: 0 }),
      runs: async () => ({ entries: [], total: 0, offset: 0, limit: 0, hasMore: false, nextOffset: null }),
    },
    agent: {
      identity: async () => ({ agentId: "main" }),
    },
    chat: {
      history: async () => ({ sessionKey: "main", messages: [] }),
      sendAndWaitFinal: async () => ({
        ack: { runId: "run-1", status: "accepted" },
        final: { runId: "run-1", state: "final" },
      }),
    },
  } as const;

  const results = await runSmokeMethodDefinitions(fakeClient as never, logger, 30_000);

  assert.equal(results.find((result) => result.name === "health")?.status, "pass");
  assert.equal(results.find((result) => result.name === "config.set")?.status, "skip");
  assert.equal(results.find((result) => result.name === "agents.files.list")?.status, "skip");
  assert.equal(results.find((result) => result.name === "chat.history")?.status, "skip");
  assert.equal(results.find((result) => result.name === "chat.send")?.status, "skip");
});

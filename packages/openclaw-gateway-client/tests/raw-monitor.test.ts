import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs } from "../scripts/raw-monitor.js";

test("raw monitor parseArgs prefers cli token over file env", () => {
  const args = parseArgs(
    [
      "--token",
      "cli-token",
      "--chat",
      "hello",
      "--session-key",
      "agent:main:main",
      "--events",
      "agent,chat",
    ],
    {},
    {
      OPENCLAW_GATEWAY_URL: "ws://localhost:18789",
      OPENCLAW_TOKEN: "env-token",
    },
  );
  assert.ok(args);
  assert.equal(args.token, "cli-token");
  assert.equal(args.url, "ws://localhost:18789");
  assert.deepEqual(args.scopes, ["operator.admin"]);
  assert.deepEqual(args.events, ["agent", "chat"]);
  assert.equal(args.chat, "hello");
  assert.equal(args.sessionKey, "agent:main:main");
});

test("raw monitor parseArgs validates role", () => {
  assert.throws(
    () => parseArgs(["--role", "bad-role"], {}, { OPENCLAW_TOKEN: "token" }),
    /invalid --role/u,
  );
});

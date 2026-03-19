import assert from "node:assert/strict";
import test from "node:test";
import { __testOnly } from "../src/adapters/openclaw/openclaw-intent-runtime-gateway.js";

test("normalizes chat.history toolCall blocks into intent toolcall parts", () => {
  const message = __testOnly.mapGatewayMessage({
    role: "assistant",
    content: [
      {
        type: "text",
        text: "我放到后台写，写好后直接来通知你。",
      },
      {
        type: "toolCall",
        id: "call_123",
        name: "sessions_yield",
        arguments: {
          message: "已在后台开始写诗，等待完成后通知用户。",
        },
        partialJson: "{\"message\":\"已在后台开始写诗，等待完成后通知用户。\"}",
      },
    ],
    timestamp: 123,
  });

  assert.equal(message.role, "assistant");
  assert.equal(message.toolCallId, "call_123");
  assert.equal(message.text, "我放到后台写，写好后直接来通知你。\nsessions_yield()");
  assert.deepEqual(message.parts, [
    {
      type: "text",
      text: "我放到后台写，写好后直接来通知你。",
    },
    {
      type: "toolcall",
      id: "call_123",
      name: "sessions_yield",
      arguments: {
        message: "已在后台开始写诗，等待完成后通知用户。",
      },
      summary: "已在后台开始写诗，等待完成后通知用户。",
    },
  ]);
});

test("normalizes chat.history toolResult messages into tool role records", () => {
  const message = __testOnly.mapGatewayMessage({
    role: "toolResult",
    toolCallId: "call_456",
    toolName: "sessions_yield",
    content: [
      {
        type: "text",
        text: "{\n  \"status\": \"yielded\",\n  \"message\": \"已在后台开始写诗，等待完成后通知用户。\"\n}",
      },
    ],
    timestamp: 456,
  });

  assert.equal(message.role, "tool");
  assert.equal(message.toolCallId, "call_456");
  assert.equal(
    message.text,
    "{\n  \"status\": \"yielded\",\n  \"message\": \"已在后台开始写诗，等待完成后通知用户。\"\n}",
  );
  assert.deepEqual(message.parts, [
    {
      type: "toolresult",
      name: "sessions_yield",
      text: "{\n  \"status\": \"yielded\",\n  \"message\": \"已在后台开始写诗，等待完成后通知用户。\"\n}",
      isError: false,
    },
  ]);
});

test("falls back to parsing partialJson when toolCall arguments are omitted", () => {
  const part = __testOnly.mapContentBlock({
    type: "toolCall",
    name: "sessions_spawn",
    partialJson: "{\"label\":\"poem-background\",\"timeoutSeconds\":300}",
  });

  assert.deepEqual(part, {
    type: "toolcall",
    name: "sessions_spawn",
    arguments: {
      label: "poem-background",
      timeoutSeconds: 300,
    },
    summary: "label poem-background, timeout 300",
  });
});

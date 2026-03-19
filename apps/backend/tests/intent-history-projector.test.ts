import assert from "node:assert/strict";
import test from "node:test";
import type { IntentMessage } from "@intentos/shared";
import { IntentHistoryProjector } from "../src/domain/intent-history-projector.js";

test("groups assistant tool-only followups and tool results with the prior assistant message", () => {
  const projector = new IntentHistoryProjector();
  const messages: IntentMessage[] = [
    {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "好，我放到后台写，写好后通知你哈。" }],
      text: "好，我放到后台写，写好后通知你哈。",
      timestamp: 1,
    },
    {
      id: "assistant-2",
      role: "assistant",
      parts: [
        {
          type: "toolcall",
          id: "tool-1",
          name: "sessions_spawn",
          summary: "label poem-background, task 写诗, timeout 300, cleanup delete",
        },
      ],
      text: "sessions_spawn()",
      timestamp: 2,
    },
    {
      id: "tool-result-1",
      role: "tool",
      parts: [
        {
          type: "toolresult",
          name: "sessions_spawn",
          isError: false,
        },
      ],
      text: "",
      timestamp: 3,
      toolCallId: "tool-1",
    },
    {
      id: "assistant-3",
      role: "assistant",
      parts: [
        {
          type: "toolcall",
          id: "tool-2",
          name: "sessions_yield",
          summary: "已在后台开始写诗，等待完成后通知用户。",
        },
      ],
      text: "sessions_yield()",
      timestamp: 4,
    },
    {
      id: "tool-result-2",
      role: "tool",
      parts: [
        {
          type: "toolresult",
          name: "sessions_yield",
          isError: false,
        },
      ],
      text: "",
      timestamp: 5,
      toolCallId: "tool-2",
    },
  ];

  const projected = projector.project(messages);

  assert.equal(projected[0]?.displayGroupId, "assistant-1");
  assert.equal(projected[1]?.displayGroupId, "assistant-1");
  assert.equal(projected[2]?.displayGroupId, "assistant-1");
  assert.equal(projected[3]?.displayGroupId, "assistant-1");
  assert.equal(projected[4]?.displayGroupId, "assistant-1");
});

test("resets assistant grouping after a user turn", () => {
  const projector = new IntentHistoryProjector();
  const messages: IntentMessage[] = [
    {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "前一轮回复" }],
      text: "前一轮回复",
      timestamp: 1,
    },
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "下一轮问题" }],
      text: "下一轮问题",
      timestamp: 2,
    },
    {
      id: "assistant-2",
      role: "assistant",
      parts: [
        {
          type: "toolcall",
          id: "tool-3",
          name: "sessions_spawn",
          summary: "label poem-background",
        },
      ],
      text: "sessions_spawn()",
      timestamp: 3,
    },
  ];

  const projected = projector.project(messages);

  assert.equal(projected[0]?.displayGroupId, "assistant-1");
  assert.equal(projected[1]?.displayGroupId, "user-1");
  assert.equal(projected[2]?.displayGroupId, "assistant-2");
});

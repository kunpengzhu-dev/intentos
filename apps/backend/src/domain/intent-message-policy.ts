import type { IntentMessagePart } from "@intentos/shared";
import type { RuntimeIntentMessageRecord } from "../ports/intent-runtime-gateway.js";

function collectTextFromParts(parts: IntentMessagePart[] | undefined): string {
  const blocks = Array.isArray(parts) ? parts : [];
  return blocks
    .map((block) => {
      if (block?.type === "text" && typeof block.text === "string") {
        return block.text;
      }
      if (block?.type === "toolresult" && typeof block.text === "string") {
        return block.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function collectMessageText(message: RuntimeIntentMessageRecord): string {
  if (typeof message.text === "string" && message.text.length > 0) {
    return message.text;
  }
  return collectTextFromParts(message.parts);
}

export function isRenderableIntentMessage(message: RuntimeIntentMessageRecord): boolean {
  const text = collectMessageText(message);
  if (!text) {
    return true;
  }

  if (text.includes("OpenClaw runtime context (internal):")) {
    return false;
  }

  if (text.includes("<<<BEGIN_UNTRUSTED_CHILD_RESULT>>>")) {
    return false;
  }

  return true;
}

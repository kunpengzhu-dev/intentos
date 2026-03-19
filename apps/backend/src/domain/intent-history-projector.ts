import type { IntentMessage } from "@intentos/shared";

function hasRenderableAssistantText(message: IntentMessage): boolean {
  return message.parts.some((part) => {
    if (part.type === "text") {
      return typeof part.text === "string" && part.text.trim().length > 0;
    }
    if (part.type === "image") {
      return true;
    }
    return false;
  });
}

function listToolCallIds(message: IntentMessage): string[] {
  const toolCallParts = message.parts.filter((part) => part.type === "toolcall");
  const ids: string[] = [];
  for (const [index, part] of message.parts.entries()) {
    if (part.type !== "toolcall") {
      continue;
    }
    if (typeof part.id === "string" && part.id.length > 0) {
      ids.push(part.id);
      continue;
    }
    if (toolCallParts.length === 1 && message.toolCallId) {
      ids.push(message.toolCallId);
      continue;
    }
    ids.push(`${message.id}:tool:${index}`);
  }
  return ids;
}

export class IntentHistoryProjector {
  project(messages: IntentMessage[]): IntentMessage[] {
    const toolCallGroups = new Map<string, string>();
    let currentAssistantGroupId: string | undefined;

    return messages.map((message) => {
      let displayGroupId = message.displayGroupId ?? message.id;

      if (message.role === "assistant") {
        const hasRenderableText = hasRenderableAssistantText(message);
        const toolCallIds = listToolCallIds(message);

        if (!hasRenderableText && toolCallIds.length > 0 && currentAssistantGroupId) {
          displayGroupId = currentAssistantGroupId;
        } else {
          displayGroupId = message.id;
          if (hasRenderableText || toolCallIds.length > 0) {
            currentAssistantGroupId = displayGroupId;
          }
        }

        for (const toolCallId of toolCallIds) {
          toolCallGroups.set(toolCallId, displayGroupId);
        }
      } else if (message.role === "tool" && message.toolCallId) {
        displayGroupId = toolCallGroups.get(message.toolCallId) ?? message.id;
      } else {
        displayGroupId = message.id;
        if (message.role === "user") {
          currentAssistantGroupId = undefined;
        }
      }

      return {
        ...message,
        displayGroupId,
      };
    });
  }
}

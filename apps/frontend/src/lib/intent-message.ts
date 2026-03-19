import type { IntentMessage, IntentMessagePart } from '@intentos/shared';

function partToText(part: IntentMessagePart): string {
  if (part.type === 'text') {
    return typeof part.text === 'string' ? part.text : String(part.text ?? '');
  }

  if (part.type === 'toolcall') {
    return part.summary ? `${part.name}: ${part.summary}` : `${part.name}()`;
  }

  if (part.type === 'toolresult') {
    if (part.summary) {
      return String(part.summary);
    }
    if (part.text) {
      return String(part.text);
    }
    return `${part.name} result`;
  }

  if (part.type === 'image') {
    return '[image]';
  }

  return JSON.stringify(part);
}

export function intentMessageToText(message: IntentMessage): string {
  if (message.parts.length === 0) {
    return message.text;
  }

  return message.parts.map(partToText).filter(Boolean).join('\n').trim() || message.text;
}

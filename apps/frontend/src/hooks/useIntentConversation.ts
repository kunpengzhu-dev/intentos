import type { IntentDetail, IntentMessage, IntentStreamEvent } from '@intentos/shared';
import { useEffect, useState } from 'react';
import { fetchIntentView, sendIntentMessage, subscribeToIntentEvents } from '../lib/api';

function mergeMessageList(current: IntentMessage[], incoming: IntentMessage): IntentMessage[] {
  const next = [...current];
  const index = next.findIndex((message) => message.id === incoming.id);
  if (index >= 0) {
    next[index] = incoming;
    return next;
  }
  next.push(incoming);
  return next;
}

function applyStreamEvent(current: IntentMessage[], event: IntentStreamEvent): IntentMessage[] {
  if (event.type !== 'message') {
    return current;
  }

  return mergeMessageList(current, event.message);
}

type UseIntentConversationOptions = {
  streamMessagesInHistory?: boolean;
  includeMessageEventsInActivity?: boolean;
  optimisticMessagesInActivity?: boolean;
};

function eventIdentity(event: IntentStreamEvent): string {
  if (typeof event.seq === 'number') {
    return `${event.type}:${event.runId}:${event.seq}`;
  }

  if (event.type === 'message') {
    return [
      event.type,
      event.runId,
      event.state,
      event.message.id ?? 'message',
      event.timestamp ?? event.message.timestamp ?? 'na',
    ].join(':');
  }

  if (event.type === 'tool') {
    return [
      event.type,
      event.runId,
      event.toolCallId,
      event.phase,
      event.timestamp ?? 'na',
      event.summary ?? event.meta ?? '',
    ].join(':');
  }

  if (event.type === 'run') {
    return [event.type, event.runId, event.phase, event.timestamp ?? 'na'].join(':');
  }

  return [event.type, event.runId, event.state, event.timestamp ?? 'na'].join(':');
}

function mergeActivityEvent(
  current: IntentStreamEvent[],
  incoming: IntentStreamEvent,
): IntentStreamEvent[] {
  const next = [...current];
  const identity = eventIdentity(incoming);
  const index = next.findIndex((event) => eventIdentity(event) === identity);
  if (index >= 0) {
    next[index] = incoming;
    return next;
  }
  next.push(incoming);
  return next.slice(-200);
}

export function useIntentConversation(
  intentKey: string | null,
  enabled = true,
  options: UseIntentConversationOptions = {},
) {
  const [intent, setIntent] = useState<IntentDetail | null>(null);
  const [messages, setMessages] = useState<IntentMessage[]>([]);
  const [activityEvents, setActivityEvents] = useState<IntentStreamEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const streamMessagesInHistory = options.streamMessagesInHistory ?? true;
  const includeMessageEventsInActivity = options.includeMessageEventsInActivity ?? false;
  const optimisticMessagesInActivity = options.optimisticMessagesInActivity ?? false;

  useEffect(() => {
    if (!intentKey || !enabled) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const view = await fetchIntentView(intentKey);
        if (cancelled) {
          return;
        }

        setIntent(view.intent);
        setMessages(view.messages);
        setIsLoading(false);
        setError(null);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load conversation');
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    setMessages([]);
    setActivityEvents([]);
    setIntent(null);
    setLastStatus(null);
    void load();

    const unsubscribe = subscribeToIntentEvents(
      intentKey,
      (event) => {
        if (cancelled) {
          return;
        }

        if (event.type === 'message') {
          if (streamMessagesInHistory) {
            setMessages((current) => applyStreamEvent(current, event));
          }
          if (includeMessageEventsInActivity) {
            setActivityEvents((current) => mergeActivityEvent(current, event));
          }
        } else {
          setActivityEvents((current) => mergeActivityEvent(current, event));
        }
        if (event.type === 'status') {
          setLastStatus(event.state);
        }
        if (event.type === 'run') {
          setLastStatus(event.phase);
        }
      },
      () => {
        if (!cancelled) {
          setLastStatus('disconnected');
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    enabled,
    includeMessageEventsInActivity,
    intentKey,
    optimisticMessagesInActivity,
    streamMessagesInHistory,
  ]);

  const sendMessage = async (text: string) => {
    if (!intentKey) {
      return;
    }

    setIsSending(true);
    setError(null);
    try {
      const optimisticMessage: IntentMessage = {
        id: `optimistic:${Date.now()}`,
        role: 'user',
        parts: [{ type: 'text', text }],
        text,
        timestamp: Date.now(),
      };
      if (optimisticMessagesInActivity) {
        setActivityEvents((current) =>
          mergeActivityEvent(current, {
            type: 'message',
            intentKey,
            runId: optimisticMessage.id,
            state: 'final',
            message: optimisticMessage,
            timestamp: optimisticMessage.timestamp,
          }),
        );
      } else {
        setMessages((current) => mergeMessageList(current, optimisticMessage));
      }

      const response = await sendIntentMessage(intentKey, { text });
      setLastStatus(response.accepted ? 'accepted' : 'pending');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send message');
      throw sendError;
    } finally {
      setIsSending(false);
    }
  };

  return {
    intent,
    messages,
    activityEvents,
    isLoading,
    isSending,
    error,
    lastStatus,
    sendMessage,
  };
}

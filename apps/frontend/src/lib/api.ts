import type {
  BootSetupEvent,
  BootSetupStatus,
  HealthResponse,
  IntentDetailResponse,
  IntentListResponse,
  IntentStreamEvent,
  IntentViewResponse,
  SendIntentMessageRequest,
  SendIntentMessageResponse,
} from '@intentos/shared';
import { resolveBackendUrl } from './runtimeConfig';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveBackendUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const fallback = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      throw new Error(payload.message ?? fallback);
    } catch (error) {
      if (error instanceof Error && error.message !== 'Unexpected end of JSON input') {
        throw error;
      }
      throw new Error(fallback);
    }
  }

  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health');
}

export async function fetchBootSetupStatus(): Promise<BootSetupStatus> {
  return requestJson<BootSetupStatus>('/api/boot/status');
}

export function subscribeToBootSetupEvents(
  listener: (event: BootSetupEvent) => void,
  onError?: (error: Event) => void,
): () => void {
  const source = new EventSource(resolveBackendUrl('/api/boot/events'));

  const handleMessage = (rawEvent: MessageEvent<string>) => {
    const payload = JSON.parse(rawEvent.data) as BootSetupEvent;
    listener(payload);
  };

  source.addEventListener('boot-status', handleMessage as EventListener);
  source.onerror = (event) => {
    onError?.(event);
  };

  return () => {
    source.close();
  };
}

export async function fetchOrbIntent() {
  return requestJson<IntentDetailResponse>('/api/orb');
}

export async function fetchIntentCatalog() {
  return requestJson<IntentListResponse>('/api/intents?includePreview=true');
}

export async function fetchIntentView(intentKey: string, limit = 120) {
  const encodedKey = encodeURIComponent(intentKey);
  return requestJson<IntentViewResponse>(`/api/intents/${encodedKey}/view?limit=${limit}`);
}

export async function sendIntentMessage(
  intentKey: string,
  payload: SendIntentMessageRequest,
): Promise<SendIntentMessageResponse> {
  const encodedKey = encodeURIComponent(intentKey);
  return requestJson<SendIntentMessageResponse>(`/api/intents/${encodedKey}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function subscribeToIntentEvents(
  intentKey: string,
  listener: (event: IntentStreamEvent) => void,
  onError?: (error: Event) => void,
): () => void {
  const encodedKey = encodeURIComponent(intentKey);
  const source = new EventSource(resolveBackendUrl(`/api/intents/${encodedKey}/events`));

  const handleMessage = (rawEvent: MessageEvent<string>) => {
    const payload = JSON.parse(rawEvent.data) as IntentStreamEvent;
    listener(payload);
  };

  source.addEventListener('message', handleMessage as EventListener);
  source.addEventListener('run', handleMessage as EventListener);
  source.addEventListener('tool', handleMessage as EventListener);
  source.addEventListener('status', handleMessage as EventListener);
  source.onerror = (event) => {
    onError?.(event);
  };

  return () => {
    source.close();
  };
}

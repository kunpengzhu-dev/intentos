export const STREAM_ID_PATTERN = /^(global|run:[a-zA-Z0-9_-]+)$/;

export type StreamIdPrefix = 'global' | 'run';

export function isValidStreamId(id: string): boolean {
  return STREAM_ID_PATTERN.test(id);
}

export function parseStreamId(id: string): { prefix: StreamIdPrefix; resourceId?: string } | null {
  if (id === 'global') return { prefix: 'global' };
  const match = id.match(/^run:([a-zA-Z0-9_-]+)$/);
  if (match) return { prefix: 'run', resourceId: match[1] };
  return null;
}

export function makeRunStreamId(runId: string): string {
  return `run:${runId}`;
}

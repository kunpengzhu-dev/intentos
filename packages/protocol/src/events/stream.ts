import type { Cursor } from '../dto/cursor.js';

export type StreamSubscribePayload = {
  streams: string[];
  cursor?: Cursor;
};

export type StreamSubscribeOkPayload = {
  accepted: boolean;
  reset?: boolean;
  cursor?: Cursor;
  resolvedMode?: Record<string, 'snapshot_then_delta' | 'delta' | 'full'>;
};

export type StreamUnsubscribePayload = {
  streams: string[];
};

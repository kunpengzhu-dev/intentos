export type SeqGap = {
  streamId: string;
  expected: number;
  received: number;
};

export class SeqTracker {
  private streams = new Map<string, number>();
  private retries = new Map<string, number>();
  private maxRetries: number;

  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
  }

  check(streamId: string, serverSeq: number): 'ok' | 'duplicate' | 'gap' | 'force_reset' {
    const last = this.streams.get(streamId) ?? 0;
    const expected = last + 1;

    if (serverSeq === expected) {
      this.streams.set(streamId, serverSeq);
      this.retries.delete(streamId);
      return 'ok';
    }

    if (serverSeq < expected) {
      return 'duplicate';
    }

    const attempts = (this.retries.get(streamId) ?? 0) + 1;
    this.retries.set(streamId, attempts);
    if (attempts > this.maxRetries) {
      this.streams.delete(streamId);
      this.retries.delete(streamId);
      return 'force_reset';
    }
    return 'gap';
  }

  getLastSeq(streamId: string): number {
    return this.streams.get(streamId) ?? 0;
  }

  setLastSeq(streamId: string, seq: number) {
    this.streams.set(streamId, seq);
  }

  reset(streamId: string) {
    this.streams.delete(streamId);
    this.retries.delete(streamId);
  }

  resetAll() {
    this.streams.clear();
    this.retries.clear();
  }
}

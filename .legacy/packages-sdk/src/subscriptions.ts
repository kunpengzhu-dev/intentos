import type { Envelope } from '@intentos/protocol';

export type SubscriptionHandler = (envelope: Envelope) => void;

export class SubscriptionManager {
  private handlers = new Map<string, Set<SubscriptionHandler>>();

  subscribe(eventType: string, handler: SubscriptionHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
    return () => this.unsubscribe(eventType, handler);
  }

  unsubscribe(eventType: string, handler: SubscriptionHandler) {
    this.handlers.get(eventType)?.delete(handler);
  }

  emit(eventType: string, envelope: Envelope) {
    this.handlers.get(eventType)?.forEach((h) => h(envelope));
    this.handlers.get('*')?.forEach((h) => h(envelope));
  }

  clear() {
    this.handlers.clear();
  }
}

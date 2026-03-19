import { create } from 'zustand';

export type IntentCard = {
  intentId: string;
  title: string;
  summary?: string;
  status: string;
  currentRunId?: string;
  updatedAt: number;
  needsAttention: boolean;
  progress?: number;
  artifactCount?: number;
  subagentSessionKey?: string;
  runtimeContextText?: string;
};

type IntentStore = {
  intents: Map<string, IntentCard>;
  upsertIntent: (card: IntentCard) => void;
  removeIntent: (id: string) => void;
  getActiveIntents: () => IntentCard[];
  getCompletedIntents: () => IntentCard[];
};

export const useIntentStore = create<IntentStore>((set, get) => ({
  intents: new Map(),
  upsertIntent: (card) =>
    set((s) => {
      const next = new Map(s.intents);
      next.set(card.intentId, card);
      return { intents: next };
    }),
  removeIntent: (id) =>
    set((s) => {
      const next = new Map(s.intents);
      next.delete(id);
      return { intents: next };
    }),
  getActiveIntents: () =>
    [...get().intents.values()]
      .filter((i) => i.status !== 'completed' && i.status !== 'cancelled')
      .sort((a, b) => b.updatedAt - a.updatedAt),
  getCompletedIntents: () =>
    [...get().intents.values()]
      .filter((i) => i.status === 'completed')
      .sort((a, b) => b.updatedAt - a.updatedAt),
}));

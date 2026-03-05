import { create } from 'zustand';

export type ChatBubble = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  streaming?: boolean;
};

type ChatStore = {
  messages: ChatBubble[];
  isStreaming: boolean;
  addMessage: (msg: ChatBubble) => void;
  updateLastAssistant: (delta: string, done: boolean) => void;
  setStreaming: (v: boolean) => void;
  clear: () => void;
};

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isStreaming: false,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateLastAssistant: (delta, done) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + delta, streaming: !done };
      }
      return { messages: msgs, isStreaming: !done };
    }),
  setStreaming: (v) => set({ isStreaming: v }),
  clear: () => set({ messages: [], isStreaming: false }),
}));

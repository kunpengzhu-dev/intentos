import { useCallback, useEffect, useRef, useState } from 'react';
import { Surface } from '@intentos/ui/react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Envelope } from '@intentos/protocol';
import { useChatStore } from '../../store/chat';
import { useConnectionStore } from '../../store/connection';

export function Orb() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const { getClient, state } = useConnectionStore();
  const { messages, addMessage, updateLastAssistant, isStreaming } = useChatStore();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state !== 'connected') return;
    const client = getClient();
    const off = client.on('chat/delta', (env: Envelope) => {
      const p = env.payload as { delta: string; done: boolean };
      const store = useChatStore.getState();
      const last = store.messages[store.messages.length - 1];
      if (last?.role === 'assistant' && last.streaming) {
        updateLastAssistant(p.delta, p.done);
      } else {
        addMessage({ id: env.id, role: 'assistant', content: p.delta, ts: env.ts, streaming: !p.done });
      }
    });
    return off;
  }, [state]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || state !== 'connected') return;
    addMessage({ id: crypto.randomUUID(), role: 'user', content: text, ts: Date.now() });
    setInput('');
    getClient().sendFire('chat/send', { message: text, contextId: 'global' });
  }, [input, state]);

  return (
    <>
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0.08}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        className="fixed bottom-8 right-8 z-50 cursor-grab active:cursor-grabbing"
      >
        <motion.button
          onClick={() => setIsOpen((value) => !value)}
          animate={{
            scale: [1, 1.04, 1],
            boxShadow: isOpen ? '0 25px 60px rgba(69,109,255,0.26)' : '0 18px 40px rgba(69,109,255,0.18)',
          }}
          transition={{ scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' }, boxShadow: { duration: 0.25 } }}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-linear-to-br from-violet-400 via-blue-500 to-indigo-600 text-white shadow-lg"
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} className="text-2xl">
                ×
              </motion.span>
            ) : (
              <motion.span key="chat" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="text-xl">
                ◌
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <Surface
            as={motion.div}
            variant="panel"
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 22, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed bottom-28 right-8 z-40 flex w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[1.8rem]"
          >
            <div className="flex items-center gap-3 border-b border-white/50 px-5 py-4">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <div>
                <p className="text-sm font-medium text-slate-800">IntentOS Assistant</p>
                <p className="text-xs text-slate-400">{state === 'connected' ? 'Ready for a quick ask' : 'Waiting for connection'}</p>
              </div>
            </div>

            <div className="max-h-[21rem] min-h-[16rem] flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {messages.length === 0 && (
                <p className="mt-10 text-center text-sm leading-6 text-slate-400">
                  Ask for a quick action, a draft, or a summary. IntentOS will route it into the current workspace.
                </p>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-[1.2rem] px-4 py-3 text-sm leading-6 shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-linear-to-br from-blue-500 to-indigo-600 text-white'
                        : 'bg-white/70 text-slate-700'
                    }`}
                  >
                    {msg.content}
                    {msg.streaming && (
                      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1, repeat: Infinity }} className="ml-1 inline-block">
                        |
                      </motion.span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-white/50 px-4 py-4">
              <Surface variant="pill" className="flex items-center gap-2 rounded-full px-3 py-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Type a message..."
                  disabled={isStreaming}
                  className="min-w-0 flex-1 bg-transparent px-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↗
                </button>
              </Surface>
            </div>
          </Surface>
        )}
      </AnimatePresence>
    </>
  );
}

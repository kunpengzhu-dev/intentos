import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConnectionStore } from '../store/connection';
import { useChatStore } from '../store/chat';
import type { Envelope } from '@intentos/protocol';

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
      <motion.div drag dragMomentum={false} dragElastic={0.1} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} className="fixed bottom-8 right-8 z-50 cursor-grab active:cursor-grabbing">
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          animate={{
            scale: [1, 1.05, 1],
            boxShadow: isOpen ? '0 0 40px 12px rgba(99,102,241,0.4)' : '0 0 20px 6px rgba(99,102,241,0.2)',
          }}
          transition={{ scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' }, boxShadow: { duration: 0.3 } }}
          className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg hover:shadow-indigo-500/30 transition-shadow"
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.svg key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </motion.svg>
            ) : (
              <motion.svg key="chat" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 10-9-9c0 1.488.36 2.891 1 4.127L3 21l4.873-1C9.109 20.64 10.512 21 12 21z" />
              </motion.svg>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-28 right-8 z-40 w-96 max-h-[500px] rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-gray-700/50 shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm font-medium text-gray-200">IntentOS Assistant</span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[350px]">
              {messages.length === 0 && <p className="text-sm text-gray-600 text-center mt-8">Ask me anything or tell me what you need done.</p>}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
                    {msg.content}
                    {msg.streaming && (
                      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1, repeat: Infinity }} className="inline-block ml-1">
                        |
                      </motion.span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="px-4 py-3 border-t border-gray-800">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Type a message..."
                  disabled={isStreaming}
                  className="flex-1 bg-gray-800 text-gray-200 text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-600 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming}
                  className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

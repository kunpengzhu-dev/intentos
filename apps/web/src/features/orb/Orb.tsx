import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue } from 'framer-motion';
import type { Envelope } from '@intentos/protocol';
import type { OrbTransitionState } from '../../App';
import { useChatStore } from '../../store/chat';
import { useConnectionStore } from '../../store/connection';

export function Orb({ transition }: { transition: OrbTransitionState }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const { getClient, state } = useConnectionStore();
  const { messages, addMessage, updateLastAssistant, isStreaming } = useChatStore();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isReady = transition.mode === 'ready';
  const visibleOpacity = transition.cornered ? 1 : transition.opacity;
  const stageScale = transition.cornered ? 1 : 0.92 + transition.opacity * 0.08;
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const [dragBounds, setDragBounds] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const getViewportBounds = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const radius = 25;
    const baseX = vw - Math.min(70, Math.max(44, vw * 0.07));
    const baseY = Math.min(58, Math.max(34, vh * 0.06));
    return {
      minX: radius - baseX,
      maxX: vw - radius - baseX,
      minY: radius - baseY,
      maxY: vh - radius - baseY,
    };
  }, []);
  const clampToViewport = useCallback(() => {
    if (!isReady || !transition.cornered) return;
    const { minX, maxX, minY, maxY } = getViewportBounds();
    dragX.set(Math.min(maxX, Math.max(minX, dragX.get())));
    dragY.set(Math.min(maxY, Math.max(minY, dragY.get())));
  }, [dragX, dragY, getViewportBounds, isReady, transition.cornered]);

  useEffect(() => {
    if (!isReady) {
      setIsOpen(false);
      dragX.set(0);
      dragY.set(0);
    }
  }, [dragX, dragY, isReady]);

  useEffect(() => {
    if (!isReady || !transition.cornered) return;
    const syncBounds = () => {
      const { minX, maxX, minY, maxY } = getViewportBounds();
      setDragBounds({ left: minX, right: maxX, top: minY, bottom: maxY });
      clampToViewport();
    };
    syncBounds();
    const onResize = () => syncBounds();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampToViewport, getViewportBounds, isReady, transition.cornered]);

  useEffect(() => {
    if (state !== 'connected') return;
    const client = getClient();
    const off = client.on('chat/delta', (env: Envelope) => {
      const payload = env.payload as { delta: string; done: boolean };
      const store = useChatStore.getState();
      const last = store.messages[store.messages.length - 1];
      if (last?.role === 'assistant' && last.streaming) {
        updateLastAssistant(payload.delta, payload.done);
      } else {
        addMessage({ id: env.id, role: 'assistant', content: payload.delta, ts: env.ts, streaming: !payload.done });
      }
    });
    return off;
  }, [addMessage, getClient, state, updateLastAssistant]);

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
  }, [addMessage, getClient, input, state]);

  return (
    <>
      <div
        className={`ai-sphere-stage active ${transition.cornered ? 'to-corner' : ''} ${isReady ? 'ai-sphere-stage--interactive' : ''}`}
        style={{ opacity: visibleOpacity, transform: `scale(${stageScale})` }}
      >
        <div className="ai-sphere-shell">
          <motion.button
            type="button"
            aria-label="Toggle assistant"
            drag={isReady}
            dragMomentum={false}
            dragElastic={0.06}
            dragConstraints={dragBounds}
            dragListener={isReady}
            dragPropagation={false}
            style={{ x: dragX, y: dragY }}
            onDragEnd={clampToViewport}
            onClick={() => {
              if (isReady) {
                setIsOpen((value) => !value);
              }
            }}
            whileHover={isReady ? { scale: 1.1, filter: 'brightness(1.1) saturate(1.12)' } : undefined}
            whileTap={isReady ? { scale: 0.9, filter: 'brightness(1.06) saturate(1.06)' } : undefined}
            whileDrag={isReady ? { scale: 0.9, filter: 'brightness(1.06) saturate(1.06)' } : undefined}
            className={`ai-sphere ${isReady ? 'ai-sphere--button' : ''}`}
          >
            <div className="ring" />
            <div className="core" />
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {isReady && isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="orb-panel"
          >
            <div className="orb-panel__header">
              <div className="orb-panel__header-copy">
                <p className="orb-panel__eyebrow">IntentOS Assistant</p>
                <p className="orb-panel__status">{state === 'connected' ? 'Ready for a quick ask' : 'Waiting for connection'}</p>
              </div>
              <button type="button" className="orb-panel__close" onClick={() => setIsOpen(false)} aria-label="Close assistant">
                ×
              </button>
            </div>

            <div className="orb-panel__messages">
              {messages.length === 0 && (
                <p className="orb-panel__empty">
                  Ask for a quick action, a draft, or a summary. IntentOS will route it into the current workspace.
                </p>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`orb-panel__row ${msg.role === 'user' ? 'orb-panel__row--user' : ''}`}>
                  <div className={`orb-panel__bubble ${msg.role === 'user' ? 'orb-panel__bubble--user' : 'orb-panel__bubble--assistant'}`}>
                    {msg.content}
                    {msg.streaming && (
                      <motion.span
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="orb-panel__caret"
                      >
                        |
                      </motion.span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="orb-panel__composer">
              <div className="orb-panel__composer-shell">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Type a message..."
                  disabled={isStreaming}
                  className="orb-panel__input"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming}
                  className="orb-panel__send"
                >
                  ↗
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { Envelope } from '@intentos/protocol';
import { useChatStore } from '../../store/chat';
import { useConnectionStore } from '../../store/connection';
import type { OrbTransitionState } from './types';
import { OrbPanel, OrbSphere } from './components';
import { useOrbDrag } from './useOrbDrag';

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
  const { dragX, dragY, dragBounds, onDragEnd } = useOrbDrag({
    isReady,
    cornered: transition.cornered,
  });

  useEffect(() => {
    if (!isReady) {
      setIsOpen(false);
    }
  }, [isReady]);

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
      <OrbSphere
        isReady={isReady}
        cornered={transition.cornered}
        visibleOpacity={visibleOpacity}
        stageScale={stageScale}
        dragX={dragX}
        dragY={dragY}
        dragBounds={dragBounds}
        onDragEnd={onDragEnd}
        onToggle={() => {
          if (isReady) {
            setIsOpen((value) => !value);
          }
        }}
      />

      <AnimatePresence>
        {isReady && isOpen && (
          <OrbPanel
            connected={state === 'connected'}
            messages={messages}
            isStreaming={isStreaming}
            input={input}
            onInputChange={setInput}
            onInputEnter={handleSend}
            onSend={handleSend}
            onClose={() => setIsOpen(false)}
            inputRef={inputRef}
            chatEndRef={chatEndRef}
          />
        )}
      </AnimatePresence>
    </>
  );
}

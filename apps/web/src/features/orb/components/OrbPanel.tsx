import { motion } from 'framer-motion';
import type { RefObject } from 'react';
import type { ChatBubble } from '../../../store/chat';

export function OrbPanel({
  connected,
  messages,
  isStreaming,
  input,
  onInputChange,
  onInputEnter,
  onSend,
  onClose,
  inputRef,
  chatEndRef,
}: {
  connected: boolean;
  messages: ChatBubble[];
  isStreaming: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onInputEnter: () => void;
  onSend: () => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  chatEndRef: RefObject<HTMLDivElement | null>;
}) {
  return (
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
          <p className="orb-panel__status">{connected ? 'Ready for a quick ask' : 'Waiting for connection'}</p>
        </div>
        <button type="button" className="orb-panel__close" onClick={onClose} aria-label="Close assistant">
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
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onInputEnter()}
            placeholder="Type a message..."
            disabled={isStreaming}
            className="orb-panel__input"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!input.trim() || isStreaming}
            className="orb-panel__send"
          >
            ↗
          </button>
        </div>
      </div>
    </motion.div>
  );
}

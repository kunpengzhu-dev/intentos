import { motion, type MotionValue } from 'framer-motion';
import type { RefObject } from 'react';
import { formatOrbToolPill } from '../orb-transcript';
import type { OrbChatEntry } from '../types';

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp);
  } catch {
    return '';
  }
}

export function OrbPanel({
  connected,
  messages,
  isStreaming,
  input,
  onInputChange,
  onInputEnter,
  onSend,
  onClose,
  onMessagesScroll,
  placement,
  panelMotionStyle,
  panelRef,
  inputRef,
  chatEndRef,
}: {
  connected: boolean;
  messages: OrbChatEntry[];
  isStreaming: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onInputEnter: () => void;
  onSend: () => void;
  onClose: () => void;
  onMessagesScroll?: (scrollTop: number) => void;
  placement: 'top' | 'bottom';
  panelMotionStyle: { x: MotionValue<number>; y: MotionValue<number> };
  panelRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  chatEndRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'linear' }}
      className="orb-panel"
      data-placement={placement}
      style={panelMotionStyle}
      onPointerDown={(event) => event.stopPropagation()}
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

      <div
        className="orb-panel__messages"
        onScroll={(event) => onMessagesScroll?.(event.currentTarget.scrollTop)}
      >
        {messages.length === 0 && (
          <p className="orb-panel__empty">
            Ask for a quick action, a draft, or a summary. IntentOS will route it into the current workspace.
          </p>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`orb-panel__entry orb-panel__entry--${msg.role}`}>
            <article
              className={`orb-panel__card ${msg.role === 'user' ? 'orb-panel__card--user' : 'orb-panel__card--assistant'} ${msg.pending ? 'orb-panel__card--pending' : ''}`}
            >
              <div className="orb-panel__meta">
                <span className="orb-panel__author">{msg.role === 'user' ? 'You' : 'Orb'}</span>
                <span className="orb-panel__time">{formatTimestamp(msg.ts)}</span>
              </div>

              {msg.content ? (
                <p className="orb-panel__text">
                  {msg.content}
                  {msg.pending && (
                    <motion.span
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="orb-panel__caret"
                    >
                      |
                    </motion.span>
                  )}
                </p>
              ) : msg.pending && msg.tools.length === 0 ? (
                <p className="orb-panel__text orb-panel__text--pending">IntentOS is thinking...</p>
              ) : null}

              {msg.tools.length > 0 && (
                <div className="orb-panel__tools">
                  {msg.tools.map((tool) => (
                    <span
                      key={tool.id}
                      className={`orb-panel__tool-pill orb-panel__tool-pill--${tool.status}`}
                    >
                      {formatOrbToolPill(tool)}
                    </span>
                  ))}
                </div>
              )}
            </article>
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

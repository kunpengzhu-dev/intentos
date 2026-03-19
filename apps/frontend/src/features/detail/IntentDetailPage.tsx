import type { IntentSummary } from '@intentos/shared';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useIntentConversation } from '../../hooks/useIntentConversation';
import { intentMessageToText } from '../../lib/intent-message';
import { Surface } from '../../ui/react';

function formatTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return 'Pending';
  }
  return new Date(timestamp).toLocaleString();
}

export function IntentDetailPage({
  intentKey,
  intentSummary,
  onBack,
}: {
  intentKey: string;
  intentSummary: IntentSummary | null;
  onBack: () => void;
}) {
  const [input, setInput] = useState('');
  const { intent, messages, isLoading, isSending, error, lastStatus, sendMessage } =
    useIntentConversation(intentKey);

  const title = intent?.title ?? intentSummary?.title ?? 'Intent detail';

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-10 md:px-12">
        <div className="mb-8 flex items-center justify-between">
          <Surface
            as="button"
            variant="pill"
            onClick={onBack}
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white/70"
          >
            ← Back
          </Surface>
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            {lastStatus ?? intent?.status ?? intentSummary?.status ?? 'loading'}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.4fr)_20rem]">
          <section className="space-y-8">
            <Surface variant="panel" className="rounded-[2rem] p-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Intent view
              </p>
              <h1 className="mt-3 text-4xl font-light leading-none text-slate-800">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">{intentKey}</p>
              {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
            </Surface>

            <section>
              <div className="mb-5 flex items-end gap-3">
                <h2 className="text-3xl font-semibold tracking-tight text-slate-800">Conversation</h2>
                <span className="text-sm text-slate-400">Intent timeline</span>
              </div>

              <Surface variant="panel" className="rounded-[1.8rem] p-5">
                {isLoading ? (
                  <p className="text-sm text-slate-500">Loading conversation...</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-slate-500">No messages yet for this intent.</p>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-[1.5rem] border border-white/60 bg-white/50 px-5 py-4"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {message.role}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatTimestamp(message.timestamp)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {intentMessageToText(message)}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                )}
              </Surface>
            </section>

            {intent?.capabilities.canSendMessages && (
              <Surface variant="panel" className="rounded-[1.8rem] p-5">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Send message
                </div>
                <div className="flex flex-col gap-4">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    rows={4}
                    placeholder="Continue the current intent..."
                    className="min-h-28 rounded-[1.25rem] border border-white/70 bg-white/60 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                  <div className="flex justify-end">
                    <Surface
                      as="button"
                      variant="pill"
                      disabled={!input.trim() || isSending}
                      onClick={async () => {
                        const message = input.trim();
                        if (!message) {
                          return;
                        }
                        await sendMessage(message);
                        setInput('');
                      }}
                      className="rounded-full px-5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                    >
                      {isSending ? 'Sending...' : 'Send'}
                    </Surface>
                  </div>
                </div>
              </Surface>
            )}
          </section>

          <aside className="space-y-6">
            <Surface variant="soft" className="rounded-[1.75rem] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Runtime
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex justify-between gap-4">
                  <span>Status</span>
                  <span>{intent?.status ?? intentSummary?.status ?? 'unknown'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Model</span>
                  <span>{intent?.runtime.model ?? intentSummary?.runtime.model ?? 'n/a'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Provider</span>
                  <span>
                    {intent?.runtime.modelProvider ?? intentSummary?.runtime.modelProvider ?? 'n/a'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Messages</span>
                  <span>{messages.length}</span>
                </div>
              </div>
            </Surface>

            {intent?.preview && intent.preview.length > 0 && (
              <Surface variant="soft" className="rounded-[1.75rem] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Preview
                </p>
                <div className="mt-4 space-y-3">
                  {intent.preview.map((item, index) => (
                    <p key={`${item.role}-${index}`} className="text-sm leading-6 text-slate-600">
                      <span className="mr-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                        {item.role}
                      </span>
                      {item.text}
                    </p>
                  ))}
                </div>
              </Surface>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

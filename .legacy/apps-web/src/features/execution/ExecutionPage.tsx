import { useEffect } from 'react';
import { Surface } from '@intentos/ui/react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Envelope } from '@intentos/protocol';
import { useConnectionStore } from '../../store/connection';
import { useRunStore, type RunArtifact, type RunStep } from '../../store/run';
import { useIntentStore } from '../../store/intents';
import { ArtifactCard } from './components/ArtifactCard';
import { ExecutionStepItem } from './components/ExecutionStepItem';

export function ExecutionPage({ intentId, runId, onBack }: { intentId: string; runId: string; onBack: () => void }) {
  const { getClient, state } = useConnectionStore();
  const { steps, artifacts, progress, progressMessage, runStatus, setActiveRun, upsertStep, setArtifacts, setProgress, setRunStatus, reset } = useRunStore();
  const intentCard = useIntentStore((s) => s.intents.get(intentId));

  useEffect(() => {
    setActiveRun(intentId, runId);
    if (state !== 'connected') return;

    const client = getClient();
    const streamId = `run:${runId}`;
    client.subscribe([streamId]);

    const offStepUpserted = client.on('run/step_upserted', (env: Envelope) => {
      const p = env.payload as { runId: string; step: RunStep };
      if (p.runId === runId) upsertStep(p.step);
    });

    const offProgress = client.on('run/progress', (env: Envelope) => {
      const p = env.payload as { runId: string; progress: number; message: string };
      if (p.runId === runId) setProgress(p.progress, p.message);
    });

    const offCompleted = client.on('run/completed', (env: Envelope) => {
      const p = env.payload as { runId: string; artifacts: RunArtifact[] };
      if (p.runId === runId) {
        setRunStatus('completed');
        setArtifacts(p.artifacts ?? []);
      }
    });

    const offFailed = client.on('run/failed', (env: Envelope) => {
      const p = env.payload as { runId: string };
      if (p.runId === runId) setRunStatus('failed');
    });

    const offSnapshot = client.on('run/snapshot', (env: Envelope) => {
      const p = env.payload as { runId: string; steps: RunStep[]; artifacts: RunArtifact[] };
      if (p.runId !== runId) return;
      for (const step of p.steps ?? []) upsertStep(step);
      if (p.artifacts?.length) setArtifacts(p.artifacts);
    });

    return () => {
      offStepUpserted();
      offProgress();
      offCompleted();
      offFailed();
      offSnapshot();
      client.unsubscribe([streamId]);
      reset();
    };
  }, [intentId, runId, state]);

  const effectiveRunStatus = intentCard?.subagentSessionKey
    ? (intentCard.status === 'completed' ? 'completed' : intentCard.status === 'failed' ? 'failed' : 'running')
    : runStatus;
  const statusTone =
    effectiveRunStatus === 'completed' ? 'text-emerald-700' : effectiveRunStatus === 'failed' ? 'text-rose-700' : 'text-blue-700';
  const statusLabel = effectiveRunStatus === 'completed' ? 'Completed' : effectiveRunStatus === 'failed' ? 'Failed' : 'Running';

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-10 md:px-12">
        <div className="mb-8 flex items-center justify-between">
          <Surface as="button" variant="pill" onClick={onBack} className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white/70">
            ← Back
          </Surface>
          <div className={`text-sm font-semibold uppercase tracking-[0.2em] ${statusTone}`}>{statusLabel}</div>
        </div>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.4fr)_20rem]">
          <section className="space-y-8">
            <Surface variant="panel" className="rounded-[2rem] p-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Execution run</p>
              <h1 className="mt-3 text-4xl font-light leading-none text-slate-800">Intent execution detail</h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Intent {intentId.slice(0, 8)}... / Run {runId.slice(0, 8)}...
              </p>

              {effectiveRunStatus === 'running' && (
                <div className="mt-8">
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
                    <span>{progressMessage || 'Processing active stream...'}</span>
                    <span>{Math.round(progress * 100)}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                    <motion.div
                      className="h-full rounded-full bg-linear-to-r from-blue-500 via-indigo-500 to-violet-500"
                      animate={{ width: `${Math.round(progress * 100)}%` }}
                      transition={{ duration: 0.45 }}
                    />
                  </div>
                </div>
              )}
            </Surface>

            <section>
              <div className="mb-5 flex items-end gap-3">
                <h2 className="text-3xl font-semibold tracking-tight text-slate-800">Timeline</h2>
                <span className="text-sm text-slate-400">Run steps</span>
              </div>

              {steps.length === 0 ? (
                <Surface variant="soft" className="rounded-[1.75rem] px-6 py-8 text-sm text-slate-500">
                  Waiting for execution steps to stream in.
                </Surface>
              ) : (
                <div className="space-y-4">
                  {steps.map((step, index) => (
                    <ExecutionStepItem key={step.id} step={step} index={index} />
                  ))}
                </div>
              )}
            </section>
          </section>

          <aside className="space-y-6">
            <Surface variant="soft" className="rounded-[1.75rem] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Run summary</p>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex justify-between"><span>Status</span><span className={statusTone}>{statusLabel}</span></div>
                <div className="flex justify-between"><span>Steps</span><span>{steps.length}</span></div>
                <div className="flex justify-between"><span>Artifacts</span><span>{artifacts.length}</span></div>
              </div>
            </Surface>

            {intentCard?.runtimeContextText && (
              <Surface variant="soft" className="rounded-[1.75rem] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Task Result Context</p>
                <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                  {intentCard.runtimeContextText}
                </pre>
              </Surface>
            )}

            <AnimatePresence>
              {artifacts.length > 0 && (
                <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="mb-1 flex items-end gap-3">
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-800">Artifacts</h2>
                    <span className="text-sm text-slate-400">Outputs</span>
                  </div>
                  {artifacts.map((artifact) => (
                    <ArtifactCard key={artifact.id} artifact={artifact} />
                  ))}
                </motion.section>
              )}
            </AnimatePresence>
          </aside>
        </div>
      </div>
    </div>
  );
}

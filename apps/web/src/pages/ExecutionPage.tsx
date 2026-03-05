import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConnectionStore } from '../store/connection';
import { useRunStore, type RunStep, type RunArtifact } from '../store/run';
import type { Envelope } from '@intentos/protocol';

const stepStatusIcon: Record<string, { color: string; icon: string }> = {
  queued: { color: 'text-gray-500', icon: '○' },
  running: { color: 'text-indigo-400', icon: '◉' },
  done: { color: 'text-green-400', icon: '●' },
  failed: { color: 'text-red-400', icon: '✕' },
};

function StepItem({ step, index }: { step: RunStep; index: number }) {
  const { color, icon } = stepStatusIcon[step.status] ?? stepStatusIcon.queued;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1, duration: 0.25 }}
      className="flex items-start gap-3 relative"
    >
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <span className={`text-lg ${color}`}>{icon}</span>
        {step.status === 'running' && (
          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-0.5 h-8 bg-indigo-500/50 mt-1" />
        )}
      </div>

      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">{step.title}</span>
          <span className="text-xs text-gray-600 uppercase">{step.kind}</span>
        </div>
        {step.progress != null && step.status === 'running' && (
          <div className="mt-1 h-1 w-32 bg-gray-700 rounded-full overflow-hidden">
            <motion.div className="h-full bg-indigo-500 rounded-full" animate={{ width: `${Math.round(step.progress * 100)}%` }} transition={{ duration: 0.3 }} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ArtifactCard({ artifact }: { artifact: RunArtifact }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-gray-800/60 border border-gray-700/50">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <span className="text-sm font-medium text-gray-200">{artifact.title}</span>
        <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">{artifact.kind}</span>
      </div>
      {artifact.content && <p className="text-sm text-gray-400 whitespace-pre-wrap">{artifact.content}</p>}
      {artifact.url && (
        <a href={artifact.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 hover:underline">
          {artifact.url}
        </a>
      )}
    </motion.div>
  );
}

export function ExecutionPage({ intentId, runId, onBack }: { intentId: string; runId: string; onBack: () => void }) {
  const { getClient, state } = useConnectionStore();
  const { steps, artifacts, progress, progressMessage, runStatus, setActiveRun, upsertStep, setArtifacts, setProgress, setRunStatus, reset } = useRunStore();

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
      if (p.runId === runId) {
        for (const step of p.steps ?? []) upsertStep(step);
        if (p.artifacts?.length) setArtifacts(p.artifacts);
      }
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

  const statusColor = runStatus === 'completed' ? 'text-green-400' : runStatus === 'failed' ? 'text-red-400' : 'text-indigo-400';
  const statusLabel = runStatus === 'completed' ? 'Completed' : runStatus === 'failed' ? 'Failed' : 'Running';

  return (
    <div className="h-full overflow-y-auto px-6 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-200">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-gray-200">Execution Details</h1>
          <p className="text-xs text-gray-500 mt-0.5">Intent {intentId.slice(0, 8)}... / Run {runId.slice(0, 8)}...</p>
        </div>
        <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
      </div>

      {/* Progress bar */}
      {runStatus === 'running' && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">{progressMessage || 'Processing...'}</span>
            <span className="text-xs text-gray-500">{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" animate={{ width: `${Math.round(progress * 100)}%` }} transition={{ duration: 0.5 }} />
          </div>
        </div>
      )}

      {/* Steps timeline */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">Steps</h2>
        {steps.length === 0 ? (
          <p className="text-sm text-gray-600">Waiting for execution steps...</p>
        ) : (
          <div className="flex flex-col">
            {steps.map((step, i) => (
              <StepItem key={step.id} step={step} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* Artifacts */}
      <AnimatePresence>
        {artifacts.length > 0 && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">Artifacts</h2>
            <div className="flex flex-col gap-3">
              {artifacts.map((a) => (
                <ArtifactCard key={a.id} artifact={a} />
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

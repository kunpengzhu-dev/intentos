import { create } from 'zustand';

export type RunStep = {
  id: string;
  kind: string;
  title: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress?: number;
  startedAt?: number;
  endedAt?: number;
};

export type RunArtifact = {
  id: string;
  kind: string;
  title: string;
  content?: string;
  url?: string;
};

type RunStore = {
  activeIntentId: string | null;
  activeRunId: string | null;
  runStatus: string;
  steps: RunStep[];
  artifacts: RunArtifact[];
  progress: number;
  progressMessage: string;
  setActiveRun: (intentId: string, runId: string) => void;
  setRunStatus: (status: string) => void;
  upsertStep: (step: RunStep) => void;
  setArtifacts: (artifacts: RunArtifact[]) => void;
  setProgress: (progress: number, message: string) => void;
  reset: () => void;
};

export const useRunStore = create<RunStore>((set) => ({
  activeIntentId: null,
  activeRunId: null,
  runStatus: 'queued',
  steps: [],
  artifacts: [],
  progress: 0,
  progressMessage: '',
  setActiveRun: (intentId, runId) => set({ activeIntentId: intentId, activeRunId: runId, steps: [], artifacts: [], progress: 0, runStatus: 'running' }),
  setRunStatus: (status) => set({ runStatus: status }),
  upsertStep: (step) =>
    set((s) => {
      const idx = s.steps.findIndex((st) => st.id === step.id);
      if (idx >= 0) {
        const next = [...s.steps];
        next[idx] = step;
        return { steps: next };
      }
      return { steps: [...s.steps, step] };
    }),
  setArtifacts: (artifacts) => set({ artifacts }),
  setProgress: (progress, message) => set({ progress, progressMessage: message }),
  reset: () => set({ activeIntentId: null, activeRunId: null, runStatus: 'queued', steps: [], artifacts: [], progress: 0, progressMessage: '' }),
}));

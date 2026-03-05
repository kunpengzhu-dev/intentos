import { create } from 'zustand';

export type BootCheck = {
  checkId: string;
  label: string;
  state: 'pending' | 'running' | 'ok' | 'fail';
  error?: string;
};

type BootStore = {
  phase: 'checking' | 'ready' | 'failed';
  checks: BootCheck[];
  currentStep: number;
  totalSteps: number;
  setPhase: (phase: 'checking' | 'ready' | 'failed') => void;
  updateCheck: (check: BootCheck) => void;
  setProgress: (step: number, total: number) => void;
  reset: () => void;
};

const defaultChecks: BootCheck[] = [
  { checkId: 'server_ready', label: 'Server', state: 'pending' },
  { checkId: 'agent_ready', label: 'AI Agent', state: 'pending' },
  { checkId: 'storage_ready', label: 'Storage', state: 'pending' },
];

export const useBootStore = create<BootStore>((set) => ({
  phase: 'checking',
  checks: [...defaultChecks],
  currentStep: 0,
  totalSteps: 3,
  setPhase: (phase) => set({ phase }),
  updateCheck: (check) =>
    set((s) => ({
      checks: s.checks.map((c) => (c.checkId === check.checkId ? { ...c, ...check } : c)),
    })),
  setProgress: (step, total) => set({ currentStep: step, totalSteps: total }),
  reset: () => set({ phase: 'checking', checks: [...defaultChecks], currentStep: 0 }),
}));

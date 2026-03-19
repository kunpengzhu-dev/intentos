export type RunStepDTO = {
  id: string;
  runId: string;
  kind: string;
  title: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress?: number;
  startedAt?: number;
  endedAt?: number;
  data?: unknown;
};

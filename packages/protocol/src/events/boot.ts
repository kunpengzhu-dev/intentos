export type BootCheckPayload = Record<string, never>;

export type BootProgressPayload = {
  checkId: string;
  label: string;
  state: 'running' | 'ok' | 'fail';
  error?: string;
  step: number;
  total: number;
};

export type BootReadyPayload = Record<string, never>;

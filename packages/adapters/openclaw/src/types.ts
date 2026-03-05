export type OpenClawConfig = {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
};

export type AgentRequest = {
  intentId: string;
  runId: string;
  task: string;
  context?: Record<string, unknown>;
};

export type AgentStepUpdate = {
  stepId: string;
  kind: string;
  title: string;
  status: 'running' | 'done' | 'failed';
  progress?: number;
  data?: unknown;
};

export type AgentResult = {
  success: boolean;
  artifacts?: Array<{
    kind: string;
    title: string;
    content?: string;
    url?: string;
    mimeType?: string;
  }>;
  error?: { code: string; message: string };
};

export type AgentEventHandler = {
  onStepUpdate: (update: AgentStepUpdate) => void;
  onNeedsApproval: (approval: {
    id: string;
    kind: string;
    title: string;
    description?: string;
    blocking: boolean;
  }) => void;
  onProgress: (progress: number, message: string) => void;
  onComplete: (result: AgentResult) => void;
  onError: (error: { code: string; message: string }) => void;
};

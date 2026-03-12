import type { OpenClawConfig, AgentRequest, AgentResult, AgentEventHandler } from './types.js';

export class OpenClawClient {
  readonly config: Required<OpenClawConfig>;

  constructor(config: OpenClawConfig) {
    this.config = {
      apiKey: '',
      timeout: 30000,
      ...config,
    };
  }

  async executeTask(request: AgentRequest, handler: AgentEventHandler): Promise<AgentResult> {
    // Mock implementation — simulate agent execution
    handler.onProgress(0.1, 'Starting task analysis...');

    await this.delay(500);
    handler.onStepUpdate({
      stepId: `step-1`,
      kind: 'plan',
      title: 'Analyzing task requirements',
      status: 'done',
      progress: 0.3,
    });

    await this.delay(800);
    handler.onProgress(0.5, 'Executing task...');
    handler.onStepUpdate({
      stepId: `step-2`,
      kind: 'tool',
      title: 'Running agent tools',
      status: 'done',
      progress: 0.7,
    });

    await this.delay(600);
    handler.onStepUpdate({
      stepId: `step-3`,
      kind: 'synthesis',
      title: 'Generating results',
      status: 'done',
      progress: 1.0,
    });

    const result: AgentResult = {
      success: true,
      artifacts: [
        {
          kind: 'text',
          title: 'Task Result',
          content: `Completed task: "${request.task}". This is a mock result from the OpenClaw adapter.`,
        },
      ],
    };

    handler.onComplete(result);
    return result;
  }

  async checkHealth(): Promise<boolean> {
    // Mock: always healthy
    return true;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

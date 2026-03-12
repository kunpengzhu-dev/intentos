import { OpenClawClient } from '../adapters/openclaw/client.js';
import { env } from '../config/env.js';
import type { AgentAdapter } from './types.js';

export function createAgentAdapter(): AgentAdapter {
  const provider = env.AGENT_PROVIDER;

  switch (provider) {
    case 'openclaw':
    default: {
      const client = new OpenClawClient({
        baseUrl: env.OPENCLAW_BASE_URL,
        apiKey: env.OPENCLAW_API_KEY,
        timeout: env.OPENCLAW_TIMEOUT_MS,
      });
      return {
        provider: 'openclaw',
        executeTask: client.executeTask.bind(client),
        checkHealth: client.checkHealth.bind(client),
      };
    }
  }
}

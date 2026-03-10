import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createDatabase } from './db/index.js';
import { registerWebSocket } from './ws/server.js';
import { registerHealthRoutes } from './http/health.js';
import { registerBootRoutes } from './http/boot.js';
import { registerDebugRoutes } from './http/debug.js';
import { registerArtifactRoutes } from './http/artifacts.js';
import { createMessageHandler } from './ws/handlers/index.js';
import type { AppContext } from './context.js';
import { BootService } from './boot/service.js';
import { createScriptBootProvider } from './boot/script-provider.js';
import { createAgentAdapter } from './agent/index.js';
import { ChatService } from './chat/service.js';

async function main() {
  const app = Fastify({ logger: false });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyWebsocket);

  const database = createDatabase();
  logger.info(`Database initialized at ${env.DATABASE_URL}`);
  const agentAdapter = createAgentAdapter();
  logger.info(`Agent adapter initialized: ${agentAdapter.provider}`);
  const chatService = new ChatService(env);

  const bootService = new BootService(createScriptBootProvider());
  const handler = createMessageHandler({ database, bootService, agentAdapter, chatService } as AppContext);
  const ctx: AppContext = { database, bootService, agentAdapter, chatService, handleMessage: handler };

  registerHealthRoutes(app);
  registerBootRoutes(app, bootService);
  registerArtifactRoutes(app, database);
  registerDebugRoutes(app, database);
  registerWebSocket(app, ctx);

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info(`Server running on http://localhost:${env.PORT}`);
}

main().catch((err) => {
  logger.error('Server failed to start:', err);
  process.exit(1);
});

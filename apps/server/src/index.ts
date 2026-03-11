import Fastify, { type FastifyInstance } from 'fastify';
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
import { pathToFileURL } from 'node:url';

export type ServerStartOptions = {
  host?: string;
  port?: number;
};

export type StartedServer = {
  app: FastifyInstance;
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
};

async function createServerApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyWebsocket);

  const database = createDatabase();
  logger.info(`Database initialized at ${env.DATABASE_URL} (mode=${database.mode})`);
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

  return app;
}

function readListeningPort(app: FastifyInstance): number {
  const address = app.server.address();
  if (typeof address === 'string' || !address) {
    throw new Error('Failed to resolve server port from Fastify address');
  }
  return address.port;
}

export async function startIntentosServer(options: ServerStartOptions = {}): Promise<StartedServer> {
  const app = await createServerApp();
  const host = options.host ?? '0.0.0.0';
  const requestedPort = options.port ?? env.PORT;

  await app.listen({ port: requestedPort, host });
  const port = readListeningPort(app);
  const urlHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const url = `http://${urlHost}:${port}`;

  logger.info(`Server running on ${url} (listen host: ${host})`);

  return {
    app,
    host,
    port,
    url,
    close: () => app.close(),
  };
}

function isDirectExecution(): boolean {
  const entryArg = process.argv[1];
  if (!entryArg) return false;
  return import.meta.url === pathToFileURL(entryArg).href;
}

if (isDirectExecution()) {
  startIntentosServer()
    .then(() => undefined)
    .catch((err) => {
      logger.error('Server failed to start:', err);
      process.exit(1);
    });
}

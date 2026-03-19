import { registerIntentApiSchemas } from "@intentos/shared";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { OpenClawGatewayClient } from "openclaw-gateway-client";
import { OpenClawIntentRuntimeGateway } from "./adapters/openclaw/openclaw-intent-runtime-gateway.js";
import type { BackendConfig } from "./config/env.js";
import { IntentNotFoundError } from "./domain/errors.js";
import { IntentCoordinator } from "./intent-coordinator.js";
import { registerFrontendRoutes } from "./routes/frontend.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIntentRoutes } from "./routes/intents.js";

export type CreateAppOptions = {
  config: BackendConfig;
  coordinator?: IntentCoordinator;
};

function createDefaultCoordinator(config: BackendConfig): IntentCoordinator {
  const client = new OpenClawGatewayClient({
    url: config.gatewayUrl,
    auth: {
      token: config.gatewayToken,
    },
    role: "operator",
    scopes: ["operator.admin"],
    client: {
      id: "gateway-client",
      version: "0.1.0",
      platform: "node",
      mode: "backend",
      displayName: "IntentOS backend",
    },
  });

  const gateway = new OpenClawIntentRuntimeGateway({ client });
  return new IntentCoordinator({
    gateway,
    orbIntentKey: config.orbIntentKey,
    defaultHistoryLimit: config.defaultHistoryLimit,
    defaultPreviewLimit: config.defaultPreviewLimit,
    defaultPreviewMaxChars: config.defaultPreviewMaxChars,
  });
}

export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  const coordinator = options.coordinator ?? createDefaultCoordinator(options.config);

  await app.register(cors, {
    origin: options.config.corsOrigin,
  });

  registerIntentApiSchemas(app);

  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "IntentOS Backend API",
        description:
          "Intent-oriented HTTP API on top of OpenClaw Gateway. Business-facing routes expose orb, intents, and messages instead of raw sessions.",
        version: "0.1.0",
      },
      servers: [
        {
          url: `http://${options.config.host}:${options.config.port}`,
          description: "Local backend",
        },
      ],
      tags: [
        { name: "system", description: "Backend health and runtime diagnostics" },
        { name: "intents", description: "Intent and orb read/write operations" },
        { name: "messages", description: "Intent message history and sending" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });

  await registerHealthRoutes(app, coordinator);
  await registerIntentRoutes(app, coordinator);
  await registerFrontendRoutes(app, { rootDir: options.config.rootDir });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof IntentNotFoundError) {
      reply.status(404).send({
        error: error.name,
        message: error.message,
      });
      return;
    }

    if (typeof error === "object" && error !== null && "validation" in error) {
      reply.status(400).send({
        error: "BadRequest",
        message:
          "message" in error && typeof error.message === "string"
            ? error.message
            : "Request validation failed",
      });
      return;
    }

    reply.status(500).send({
      error:
        typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
          ? error.name
          : "InternalServerError",
      message:
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "Unexpected error",
    });
  });

  return app;
}

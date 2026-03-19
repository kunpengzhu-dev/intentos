import { intentApiSchemaRef } from "@intentos/shared";
import type { FastifyInstance } from "fastify";
import type { IntentCoordinator } from "../intent-coordinator.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  coordinator: IntentCoordinator,
): Promise<void> {
  app.get(
    "/api/health",
    {
      schema: {
        tags: ["system"],
        summary: "Read backend health",
        response: {
          200: { $ref: intentApiSchemaRef.health },
        },
      },
    },
    async () => ({
      ok: true,
      gateway: {
        connectionState: coordinator.getConnectionState(),
      },
    }),
  );
}

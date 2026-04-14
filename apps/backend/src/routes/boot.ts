import { intentApiSchemaRef, type BootSetupEvent } from "@intentos/shared";
import type { FastifyInstance } from "fastify";
import type { BootSetupManager } from "../domain/boot-setup.js";

export async function registerBootRoutes(
  app: FastifyInstance,
  bootSetupManager: BootSetupManager,
): Promise<void> {
  app.get(
    "/api/boot/status",
    {
      schema: {
        tags: ["system"],
        summary: "Read boot setup status",
        response: {
          200: { $ref: intentApiSchemaRef.bootSetupStatus },
        },
      },
    },
    async () => bootSetupManager.getStatus(),
  );

  app.get(
    "/api/boot/events",
    {
      schema: {
        tags: ["system"],
        summary: "Subscribe to boot setup SSE events",
        description: "Streams `boot-status` events over Server-Sent Events.",
        hide: true,
        response: {
          200: { $ref: intentApiSchemaRef.bootSetupEvent },
        },
      },
    },
    async (request, reply) => {
      const origin = request.headers.origin;
      reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("Access-Control-Allow-Origin", origin ?? "*");
      reply.raw.setHeader("Vary", "Origin");
      reply.raw.flushHeaders();

      const writeEvent = (event: BootSetupEvent) => {
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      writeEvent({
        type: "boot-status",
        bootSetup: bootSetupManager.getStatus(),
      });

      const unsubscribe = bootSetupManager.subscribe(writeEvent);

      const heartbeat = setInterval(() => {
        reply.raw.write(": keep-alive\n\n");
      }, 15_000);

      request.raw.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
        reply.raw.end();
      });

      await new Promise<void>(() => {});
    },
  );
}

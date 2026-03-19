import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

function resolveFrontendDir(rootDir: string): string {
  const candidates = [
    path.join(rootDir, "apps", "frontend", "dist"),
    path.join(rootDir, "apps", "frontend", "public"),
    path.join(rootDir, "frontend", "dist"),
    path.join(rootDir, "frontend", "public"),
    path.join(rootDir, "..", "frontend", "dist"),
    path.join(rootDir, "..", "frontend", "public"),
    path.join(rootDir, "..", "..", "apps", "frontend", "dist"),
    path.join(rootDir, "..", "..", "apps", "frontend", "public"),
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  return found ?? candidates[0];
}

export async function registerFrontendRoutes(
  app: FastifyInstance,
  options: { rootDir: string },
): Promise<void> {
  const frontendDir = resolveFrontendDir(options.rootDir);

  await app.register(fastifyStatic, {
    root: frontendDir,
    prefix: "/assets/",
    wildcard: false,
    index: false,
  });

  app.get("/", async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  app.get<{ Params: { "*": string } }>("/assets/*", async (request, reply) => {
    return reply.sendFile(`assets/${request.params["*"]}`);
  });
}

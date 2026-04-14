import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import type { BackendConfig } from "./config/env.js";
import { BootSetupManager } from "./domain/boot-setup.js";

export type BackendRuntime = {
  app: FastifyInstance;
  bootSetupManager: BootSetupManager;
};

export async function createBackendRuntime(config: BackendConfig): Promise<BackendRuntime> {
  const bootSetupManager = new BootSetupManager();
  bootSetupManager.start();

  const app = await createApp({
    config,
    bootSetupManager,
  });

  return {
    app,
    bootSetupManager,
  };
}

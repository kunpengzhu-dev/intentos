import { createLocalArtifactLogger } from "@intentos/shared";
import { createApp } from "./app.js";
import { loadBackendConfig } from "./config/env.js";

async function main(): Promise<void> {
  const config = loadBackendConfig();
  const logger = createLocalArtifactLogger({
    rootDir: config.rootDir,
    name: "intentos-backend",
  });

  const app = await createApp({ config });

  try {
    await app.listen({
      host: config.host,
      port: config.port,
    });
    logger.log(
      "IntentOS backend listening",
      JSON.stringify({
        host: config.host,
        port: config.port,
        orbIntentKey: config.orbIntentKey,
        gatewayUrl: config.gatewayUrl,
      }),
    );
  } catch (error) {
    logger.error("Failed to start IntentOS backend", error);
    process.exitCode = 1;
  }
}

void main();

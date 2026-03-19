import {
  readDotEnvFile,
  resolveIntentosEnvPath,
  resolveIntentosRootDir,
} from "@intentos/shared";

export type BackendConfig = {
  host: string;
  port: number;
  corsOrigin: true | string | string[];
  gatewayUrl: string;
  gatewayToken?: string;
  orbIntentKey: string;
  defaultHistoryLimit: number;
  defaultPreviewLimit: number;
  defaultPreviewMaxChars: number;
  rootDir: string;
};

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCorsOrigin(value: string | undefined): true | string | string[] {
  if (!value || value === "*") {
    return true;
  }
  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length <= 1 ? parts[0] ?? true : parts;
}

export function loadBackendConfig(): BackendConfig {
  const rootDir = resolveIntentosRootDir(import.meta.url);
  const fileEnv = readDotEnvFile(resolveIntentosEnvPath(import.meta.url));
  const env = {
    ...fileEnv,
    ...process.env,
  };

  return {
    host: env.INTENTOS_BACKEND_HOST ?? "localhost",
    port: parseNumber(env.INTENTOS_BACKEND_PORT, 3030),
    corsOrigin: parseCorsOrigin(env.INTENTOS_BACKEND_CORS_ORIGIN),
    gatewayUrl: env.OPENCLAW_GATEWAY_URL ?? "ws://localhost:18789",
    gatewayToken: env.OPENCLAW_TOKEN,
    orbIntentKey: env.INTENTOS_ORB_INTENT_KEY ?? "agent:main:intentos:global",
    defaultHistoryLimit: parseNumber(env.INTENTOS_HISTORY_LIMIT, 100),
    defaultPreviewLimit: parseNumber(env.INTENTOS_PREVIEW_LIMIT, 6),
    defaultPreviewMaxChars: parseNumber(env.INTENTOS_PREVIEW_MAX_CHARS, 1_200),
    rootDir,
  };
}

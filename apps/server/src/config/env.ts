import './load-env.js';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().default('./data/intentos.db'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('debug'),
  BOOT_PROVIDER_COMMAND: z.string().default('node'),
  BOOT_PROVIDER_ARGS_JSON: z.string().default('["./scripts/mock-boot-provider.mjs"]'),
  BOOT_CALLBACK_BASE_URL: z.string().optional(),
  BOOT_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AGENT_PROVIDER: z.enum(['openclaw']).default('openclaw'),
  OPENCLAW_BASE_URL: z.string().default('http://localhost:8787'),
  OPENCLAW_API_KEY: z.string().optional(),
  OPENCLAW_TIMEOUT_MS: z.coerce.number().int().positive().default(300000),
  OPENCLAW_GATEWAY_URL: z.string().default('ws://127.0.0.1:18789'),
  OPENCLAW_GATEWAY_TOKEN: z.string().optional(),
  OPENCLAW_CHAT_SESSION_KEY: z.string().default('intentos:global'),
  OPENCLAW_CHAT_TIMEOUT_MS: z.coerce.number().int().positive().default(300000),
  ARTIFACT_STORAGE_DIR: z.string().default('./data/artifacts'),
  ARTIFACT_PREVIEW_MAX_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;

import { spawn } from 'node:child_process';
import type { BootProvider } from './types.js';
import { env } from '../config/env.js';

function getBootProviderArgs(): string[] {
  const parsed = JSON.parse(env.BOOT_PROVIDER_ARGS_JSON) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('BOOT_PROVIDER_ARGS_JSON must be a JSON string array');
  }
  return parsed;
}

export function createScriptBootProvider(): BootProvider {
  return {
    run({ sessionId, callbackToken, callbackBaseUrl }) {
      return new Promise<void>((resolvePromise, rejectPromise) => {
        const child = spawn(env.BOOT_PROVIDER_COMMAND, getBootProviderArgs(), {
          env: {
            ...process.env,
            BOOT_SESSION_ID: sessionId,
            BOOT_CALLBACK_URL: env.BOOT_CALLBACK_BASE_URL ?? callbackBaseUrl,
            BOOT_TOKEN: callbackToken,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stderrBuffer = '';
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          child.kill('SIGTERM');
          rejectPromise(new Error(`Boot script timed out after ${env.BOOT_PROVIDER_TIMEOUT_MS}ms`));
        }, env.BOOT_PROVIDER_TIMEOUT_MS);

        child.stdout.on('data', () => {});

        child.stderr.on('data', (chunk: Buffer | string) => {
          stderrBuffer += chunk.toString();
        });

        child.on('error', (error) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeout);
          rejectPromise(error);
        });

        child.on('close', (code) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeout);
          if (code === 0) {
            resolvePromise();
            return;
          }

          rejectPromise(new Error(stderrBuffer.trim() || `Boot script exited with code ${code ?? 'unknown'}`));
        });
      });
    },
  };
}

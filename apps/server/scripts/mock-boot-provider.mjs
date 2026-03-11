#!/usr/bin/env node
import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';

function readArg(args, name, fallback) {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) {
    return args[index + 1];
  }
  return fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(callbackUrl, bootToken, path, payload) {
  const targetUrl = new URL(`${callbackUrl}${path}`);
  const client = targetUrl.protocol === 'https:' ? https : http;
  const requestBody = JSON.stringify(payload);

  const attemptOnce = async () => {
    await new Promise((resolve, reject) => {
      const req = client.request(
        targetUrl,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${bootToken}`,
            'content-length': Buffer.byteLength(requestBody).toString(),
          },
          timeout: 5000,
        },
        (res) => {
          let responseBody = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            responseBody += chunk;
          });
          res.on('end', () => {
            const statusCode = res.statusCode ?? 0;
            if (statusCode >= 200 && statusCode < 300) {
              resolve(undefined);
              return;
            }
            reject(new Error(`POST ${path} failed: ${statusCode} ${responseBody}`));
          });
        },
      );

      req.on('timeout', () => {
        req.destroy(new Error(`POST ${path} timeout`));
      });
      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });
  };

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await attemptOnce();
      return;
    } catch (error) {
      if (attempt >= maxRetries) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`POST ${path} failed after ${maxRetries} attempts: ${message}`);
      }
      await sleep(120 * attempt);
    }
  }
}

export async function runBootProvider(options = {}) {
  const args = Array.isArray(options.args) ? options.args : process.argv.slice(2);
  const delayMs = Number(readArg(args, '--delay', '500'));
  const mode = readArg(args, '--mode', 'success');
  const callbackUrl = options.callbackUrl ?? process.env.BOOT_CALLBACK_URL ?? 'http://localhost:3001';
  const bootToken = options.bootToken ?? process.env.BOOT_TOKEN ?? '';
  if (!bootToken) {
    throw new Error('Missing BOOT_TOKEN');
  }

  const steps = [
    { id: 'server_ready', label: 'Server', weight: 1 },
    { id: 'storage_ready', label: 'Storage', weight: 1 },
    { id: 'agent_ready', label: 'AI Agent', weight: 2 },
  ];

  await post(callbackUrl, bootToken, '/internal/boot/steps', {
    steps,
  });

  for (const step of steps) {
    await post(callbackUrl, bootToken, '/internal/boot/step', {
      stepId: step.id,
      state: 'running',
      message: `${step.label} is starting`,
      updatedAt: new Date().toISOString(),
    });
    await sleep(delayMs);

    if (mode === 'fail' && step.id === 'agent_ready') {
      await post(callbackUrl, bootToken, '/internal/boot/failed', {
        stepId: step.id,
        reason: 'Mock agent bootstrap failed',
        failedAt: new Date().toISOString(),
      });
      return;
    }

    await post(callbackUrl, bootToken, '/internal/boot/step', {
      stepId: step.id,
      state: 'ok',
      message: `${step.label} ready`,
      updatedAt: new Date().toISOString(),
    });
    await sleep(delayMs);
  }

  await post(callbackUrl, bootToken, '/internal/boot/completed', {
    completedAt: new Date().toISOString(),
  });
}

const isCliEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCliEntry) {
  runBootProvider().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

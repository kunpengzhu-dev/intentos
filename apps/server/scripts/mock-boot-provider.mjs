#!/usr/bin/env node

const args = process.argv.slice(2);

function readArg(name, fallback) {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) {
    return args[index + 1];
  }
  return fallback;
}

const delayMs = Number(readArg('--delay', '500'));
const mode = readArg('--mode', 'success');
const callbackUrl = process.env.BOOT_CALLBACK_URL ?? 'http://127.0.0.1:3001';
const bootToken = process.env.BOOT_TOKEN ?? '';

if (!bootToken) {
  console.error('Missing BOOT_TOKEN');
  process.exit(1);
}

const steps = [
  { id: 'server_ready', label: 'Server', weight: 1 },
  { id: 'storage_ready', label: 'Storage', weight: 1 },
  { id: 'agent_ready', label: 'AI Agent', weight: 2 },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(path, payload) {
  const response = await fetch(`${callbackUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${bootToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${path} failed: ${response.status} ${text}`);
  }
}

async function run() {
  await post('/internal/boot/steps', {
    steps,
  });

  for (const step of steps) {
    await post('/internal/boot/step', {
      stepId: step.id,
      state: 'running',
      message: `${step.label} is starting`,
      updatedAt: new Date().toISOString(),
    });
    await sleep(delayMs);

    if (mode === 'fail' && step.id === 'agent_ready') {
      await post('/internal/boot/failed', {
        stepId: step.id,
        reason: 'Mock agent bootstrap failed',
        failedAt: new Date().toISOString(),
      });
      return;
    }

    await post('/internal/boot/step', {
      stepId: step.id,
      state: 'ok',
      message: `${step.label} ready`,
      updatedAt: new Date().toISOString(),
    });
    await sleep(delayMs);
  }

  await post('/internal/boot/completed', {
    completedAt: new Date().toISOString(),
  });
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

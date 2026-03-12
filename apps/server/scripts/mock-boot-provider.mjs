#!/usr/bin/env node
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function readNonEmptyEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function parseGatewayConfig(raw, configPath) {
  const parsed = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error(`Invalid OpenClaw config format: ${configPath}`);
  }

  const gateway = isRecord(parsed.gateway) ? parsed.gateway : null;
  if (!gateway) {
    throw new Error(`Missing gateway config in ${configPath}`);
  }

  const auth = isRecord(gateway.auth) ? gateway.auth : null;
  const token = typeof auth?.token === 'string' ? auth.token.trim() : '';
  if (!token) {
    throw new Error(`Missing gateway.auth.token in ${configPath}`);
  }

  const portRaw = gateway.port;
  const port = typeof portRaw === 'number' && Number.isFinite(portRaw) ? Math.trunc(portRaw) : null;
  if (!port || port <= 0) {
    throw new Error(`Missing or invalid gateway.port in ${configPath}`);
  }

  return { token, port };
}

function resolveStateDir(homeDir) {
  return path.join(homeDir, '.openclaw');
}

function readOpenclawGatewayDefaults(homeDir, urlBuilder, sourceLabel) {
  const configPath = path.join(resolveStateDir(homeDir), 'openclaw.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`OpenClaw config not found: ${sourceLabel}:${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = parseGatewayConfig(raw, configPath);
  return {
    url: urlBuilder(parsed.port),
    token: parsed.token,
    port: parsed.port,
    configPath,
  };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  const code =
    result.error && typeof result.error === 'object' && 'code' in result.error
      ? result.error.code
      : null;
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    errorCode: typeof code === 'string' ? code : null,
  };
}

function hasCommand(command, args = ['--version']) {
  const result = runCommand(command, args, { stdio: 'ignore' });
  if (result.errorCode === 'ENOENT') {
    return false;
  }
  return true;
}

function hasWsl() {
  const result = runCommand('wsl.exe', ['--status'], { stdio: 'ignore' });
  if (result.errorCode === 'ENOENT') {
    return false;
  }
  return true;
}

function runWsl(script, options = {}) {
  const shellArgs = options.loginBash
    ? ['bash', '-lic', script]
    : ['sh', '-lc', script];
  return runCommand('wsl.exe', shellArgs);
}

function hasWslOpenclawConfig() {
  const result = runWsl('test -f ~/.openclaw/openclaw.json');
  return result.status === 0;
}

function hasWslOpenclaw() {
  if (hasWslOpenclawConfig()) {
    return true;
  }

  const defaultShellLookup = runWsl('command -v openclaw >/dev/null 2>&1');
  if (defaultShellLookup.status === 0) {
    return true;
  }

  const loginShellLookup = runWsl('command -v openclaw >/dev/null 2>&1', { loginBash: true });
  return loginShellLookup.status === 0;
}

function readWslOpenclawGatewayDefaults() {
  const result = runWsl('cat ~/.openclaw/openclaw.json');
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(
      stderr
        ? `Failed to read WSL OpenClaw config: ${stderr}`
        : 'Failed to read WSL OpenClaw config: ~/.openclaw/openclaw.json',
    );
  }

  const parsed = parseGatewayConfig(result.stdout, 'wsl:~/.openclaw/openclaw.json');
  return {
    url: `ws://[::1]:${parsed.port}`,
    token: parsed.token,
    port: parsed.port,
    configPath: 'wsl:~/.openclaw/openclaw.json',
  };
}

function inferPlatformFromUrl(url, runtimePlatform) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
      if (runtimePlatform === 'darwin') return 'local:mac';
      if (runtimePlatform === 'win32') return 'local:windows';
      return 'remote:linux';
    }
    if (host === '::1') {
      return runtimePlatform === 'win32' ? 'local:windows(wsl)' : 'remote:linux';
    }
    return 'remote:linux';
  } catch {
    return 'remote:linux';
  }
}

function resolveGatewayFromEnv(runtimePlatform) {
  const url = readNonEmptyEnv('OPENCLAW_GATEWAY_URL');
  const token = readNonEmptyEnv('OPENCLAW_GATEWAY_TOKEN') || readNonEmptyEnv('OPENCLAW_API_KEY');
  const hasExplicitUrl = url.length > 0;
  const hasExplicitToken = token.length > 0;

  if (!hasExplicitUrl && !hasExplicitToken) {
    return null;
  }
  if (!hasExplicitUrl || !hasExplicitToken) {
    throw new Error(
      'OPENCLAW_GATEWAY_URL and OPENCLAW_GATEWAY_TOKEN (or OPENCLAW_API_KEY) must both be set when overriding defaults.',
    );
  }

  return {
    url,
    token,
    connectionPlatform: inferPlatformFromUrl(url, runtimePlatform),
    source: 'env',
    detail: 'resolved from environment override',
  };
}

function resolveGatewayForMac() {
  if (!hasCommand('openclaw')) {
    throw new Error('OpenClaw is not installed on macOS. TODO: run automatic installer script.');
  }

  const resolved = readOpenclawGatewayDefaults(os.homedir(), (port) => `ws://localhost:${port}`, 'local');
  return {
    url: resolved.url,
    token: resolved.token,
    connectionPlatform: 'local:mac',
    source: 'auto',
    detail: `resolved from ${resolved.configPath}`,
  };
}

function resolveGatewayForLinux() {
  if (!hasCommand('openclaw')) {
    throw new Error('OpenClaw is not installed on Linux. TODO: run automatic installer script.');
  }

  const resolved = readOpenclawGatewayDefaults(os.homedir(), (port) => `ws://localhost:${port}`, 'local');
  return {
    url: resolved.url,
    token: resolved.token,
    connectionPlatform: 'remote:linux',
    source: 'auto',
    detail: `resolved from ${resolved.configPath}`,
  };
}

function resolveGatewayForWindows() {
  const windowsHasOpenclaw = hasCommand('openclaw');
  const wslInstalled = hasWsl();
  const wslHasOpenclaw = wslInstalled ? hasWslOpenclaw() : false;

  if (!windowsHasOpenclaw && !wslHasOpenclaw) {
    if (!wslInstalled) {
      throw new Error('WSL is not installed and OpenClaw is not installed on Windows. TODO: run automatic installer script.');
    }
    throw new Error('OpenClaw is not installed on Windows or WSL. TODO: run automatic installer script.');
  }

  if (windowsHasOpenclaw) {
    const resolved = readOpenclawGatewayDefaults(os.homedir(), (port) => `ws://localhost:${port}`, 'local');
    return {
      url: resolved.url,
      token: resolved.token,
      connectionPlatform: 'local:windows',
      source: 'auto',
      detail: `resolved from ${resolved.configPath}`,
    };
  }

  const resolved = readWslOpenclawGatewayDefaults();
  return {
    url: resolved.url,
    token: resolved.token,
    connectionPlatform: 'local:windows(wsl)',
    source: 'auto',
    detail: `resolved from ${resolved.configPath}`,
  };
}

function detectRuntimePlatform() {
  const current = process.platform;
  const resolvers = {
    darwin: {
      label: 'macOS',
      resolve: resolveGatewayForMac,
    },
    linux: {
      label: 'Linux',
      resolve: resolveGatewayForLinux,
    },
    win32: {
      label: 'Windows',
      resolve: resolveGatewayForWindows,
    },
  };

  const handler = resolvers[current];
  if (!handler) {
    throw new Error(`Unsupported platform: ${current}. TODO: add resolver for this platform (e.g. HarmonyOS).`);
  }

  return {
    runtimePlatform: current,
    runtimeLabel: handler.label,
    resolveGateway: handler.resolve,
  };
}

class BootStepError extends Error {
  constructor(stepId, message) {
    super(message);
    this.name = 'BootStepError';
    this.stepId = stepId;
  }
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

async function updateStep(callbackUrl, bootToken, stepId, state, message, error) {
  const payload = {
    stepId,
    state,
    updatedAt: new Date().toISOString(),
  };
  if (message) payload.message = message;
  if (error) payload.error = error;
  await post(callbackUrl, bootToken, '/internal/boot/step', payload);
}

async function runStep(callbackUrl, bootToken, step, runner) {
  await updateStep(callbackUrl, bootToken, step.id, 'running', `${step.label} is running`);
  try {
    const okMessage = await runner();
    await updateStep(callbackUrl, bootToken, step.id, 'ok', okMessage || `${step.label} ready`);
  } catch (error) {
    const reason = toErrorMessage(error);
    await updateStep(callbackUrl, bootToken, step.id, 'failed', `${step.label} failed`, reason);
    throw new BootStepError(step.id, reason);
  }
}

export async function runBootProvider(options = {}) {
  const args = Array.isArray(options.args) ? options.args : process.argv.slice(2);
  const delayMs = Math.max(0, Number(readArg(args, '--delay', '120')));
  const callbackUrl = options.callbackUrl ?? process.env.BOOT_CALLBACK_URL ?? 'http://localhost:3001';
  const bootToken = options.bootToken ?? process.env.BOOT_TOKEN ?? '';
  if (!bootToken) {
    throw new Error('Missing BOOT_TOKEN');
  }

  const steps = [
    { id: 'platform_detected', label: 'Platform', weight: 1 },
    { id: 'gateway_resolved', label: 'OpenClaw Gateway', weight: 2 },
    { id: 'gateway_applied', label: 'Gateway Runtime Config', weight: 1 },
  ];

  await post(callbackUrl, bootToken, '/internal/boot/steps', {
    steps,
  });
  await sleep(delayMs);

  let failedStepId;
  try {
    let platformContext = null;
    let gatewayConfig = null;

    await runStep(callbackUrl, bootToken, steps[0], async () => {
      platformContext = detectRuntimePlatform();
      return `Detected ${platformContext.runtimeLabel} (${platformContext.runtimePlatform})`;
    });
    await sleep(delayMs);

    await runStep(callbackUrl, bootToken, steps[1], async () => {
      if (!platformContext) {
        throw new Error('Platform context is missing');
      }

      const envOverride = resolveGatewayFromEnv(platformContext.runtimePlatform);
      if (envOverride) {
        gatewayConfig = envOverride;
        return `Using env override: ${gatewayConfig.connectionPlatform}`;
      }

      gatewayConfig = platformContext.resolveGateway();
      return `Resolved ${gatewayConfig.connectionPlatform} (${gatewayConfig.detail})`;
    });
    await sleep(delayMs);

    await runStep(callbackUrl, bootToken, steps[2], async () => {
      if (!gatewayConfig) {
        throw new Error('Gateway config is missing');
      }

      await post(callbackUrl, bootToken, '/internal/boot/openclaw-gateway', {
        url: gatewayConfig.url,
        token: gatewayConfig.token,
        connectionPlatform: gatewayConfig.connectionPlatform,
        source: gatewayConfig.source,
        updatedAt: new Date().toISOString(),
      });
      return `Connected platform: ${gatewayConfig.connectionPlatform}`;
    });
    await sleep(delayMs);

    await post(callbackUrl, bootToken, '/internal/boot/completed', {
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof BootStepError) {
      failedStepId = error.stepId;
    }
    await post(callbackUrl, bootToken, '/internal/boot/failed', {
      stepId: failedStepId,
      reason: toErrorMessage(error),
      failedAt: new Date().toISOString(),
    });
    throw error;
  }
}

const isCliEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCliEntry) {
  runBootProvider().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

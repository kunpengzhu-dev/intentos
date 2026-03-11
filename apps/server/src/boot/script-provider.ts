import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BootProvider } from './types.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const serverRootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function getBootProviderArgs(): string[] {
  const parsed = JSON.parse(env.BOOT_PROVIDER_ARGS_JSON) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('BOOT_PROVIDER_ARGS_JSON must be a JSON string array');
  }

  if (parsed.length === 0) {
    return parsed;
  }

  const [firstArg, ...restArgs] = parsed;
  if (!firstArg || isAbsolute(firstArg)) {
    return parsed;
  }

  const absoluteFirstArg = resolve(serverRootDir, firstArg);
  if (!existsSync(absoluteFirstArg)) {
    return parsed;
  }

  return [absoluteFirstArg, ...restArgs];
}

function getBootProviderCommandCandidates(): string[] {
  const candidates = [
    env.BOOT_PROVIDER_COMMAND,
    process.argv0,
    process.execPath,
    'node',
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  const unique: string[] = [];
  for (const candidate of candidates) {
    if (unique.includes(candidate)) {
      continue;
    }
    unique.push(candidate);
  }

  return unique;
}

type BootScriptRunnerContext = {
  args: string[];
  sessionId: string;
  callbackToken: string;
  callbackBaseUrl: string;
  callbackUrl: string;
  env: Record<string, string | undefined>;
};

type BootScriptRunner = (context: BootScriptRunnerContext) => unknown | Promise<unknown>;

type InProcessScriptTarget = {
  scriptPath: string;
  scriptArgs: string[];
};

function getInProcessScriptTarget(args: string[]): InProcessScriptTarget | null {
  if (args.length === 0) {
    return null;
  }

  const [scriptArg, ...scriptArgs] = args;
  if (!scriptArg || scriptArg.startsWith('-')) {
    return null;
  }

  if (isAbsolute(scriptArg) && existsSync(scriptArg)) {
    return { scriptPath: scriptArg, scriptArgs };
  }

  const resolvedScriptPath = resolve(serverRootDir, scriptArg);
  if (existsSync(resolvedScriptPath)) {
    return { scriptPath: resolvedScriptPath, scriptArgs };
  }

  return null;
}

async function withTemporaryProcessEnv<T>(
  overrides: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const originalValues = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    originalValues.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of originalValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }
      process.env[key] = value;
    }
  }
}

async function withTemporaryArgv<T>(argv: string[], run: () => Promise<T>): Promise<T> {
  const originalArgv = process.argv;
  process.argv = argv;
  try {
    return await run();
  } finally {
    process.argv = originalArgv;
  }
}

function resolveBootScriptRunner(moduleNamespace: Record<string, unknown>): BootScriptRunner | null {
  const candidates = [
    moduleNamespace.runBootProvider,
    moduleNamespace.run,
    moduleNamespace.default,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      return candidate as BootScriptRunner;
    }
  }
  return null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function runBootScriptInProcess(
  target: InProcessScriptTarget,
  context: Omit<BootScriptRunnerContext, 'args'>,
): Promise<void> {
  const moduleUrl = pathToFileURL(target.scriptPath).href;
  const moduleNamespace = (await import(moduleUrl)) as Record<string, unknown>;
  const runner = resolveBootScriptRunner(moduleNamespace);
  if (!runner) {
    throw new Error(
      `Boot script module does not export a callable runner (expected one of runBootProvider/run/default): ${target.scriptPath}`,
    );
  }

  const argv = [process.execPath, target.scriptPath, ...target.scriptArgs];
  await withTemporaryProcessEnv(context.env, async () => {
    await withTemporaryArgv(argv, async () => {
      await runner({
        ...context,
        args: target.scriptArgs,
      });
    });
  });
}

function buildCommandDiagnosticMessage(command: string, attemptedCommands: string[], commands: string[]): string {
  return [
    `Boot provider command not found: ${command}`,
    `attempted=${JSON.stringify(attemptedCommands)}`,
    `candidates=${JSON.stringify(commands)}`,
    `argv0=${process.argv0}`,
    `execPath=${process.execPath}`,
    `cwd=${serverRootDir}`,
  ].join(' | ');
}

export function createScriptBootProvider(): BootProvider {
  return {
    run({ sessionId, callbackToken, callbackBaseUrl }) {
      return new Promise<void>((resolvePromise, rejectPromise) => {
        const childEnv: Record<string, string | undefined> = {
          ...process.env,
          BOOT_SESSION_ID: sessionId,
          BOOT_CALLBACK_URL: env.BOOT_CALLBACK_BASE_URL ?? callbackBaseUrl,
          BOOT_TOKEN: callbackToken,
        };
        if (process.versions.electron && !childEnv.ELECTRON_RUN_AS_NODE) {
          childEnv.ELECTRON_RUN_AS_NODE = '1';
        }
        const args = getBootProviderArgs();
        const inProcessTarget = getInProcessScriptTarget(args);
        const commands = getBootProviderCommandCandidates();
        if (commands.length === 0 && !inProcessTarget) {
          rejectPromise(new Error('No valid BOOT_PROVIDER_COMMAND candidate found.'));
          return;
        }

        let settled = false;
        let commandIndex = 0;
        const attemptedCommands: string[] = [];
        let lastCommandFailure = '';
        const timeout = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          rejectPromise(new Error(`Boot script timed out after ${env.BOOT_PROVIDER_TIMEOUT_MS}ms`));
        }, env.BOOT_PROVIDER_TIMEOUT_MS);

        const launch = () => {
          const command = commands[commandIndex];
          if (!command) {
            if (settled) return;
            if (inProcessTarget) {
              logger.warn(`Boot provider spawn unavailable. Falling back to in-process runner: ${inProcessTarget.scriptPath}`);
              void runBootScriptInProcess(inProcessTarget, {
                sessionId,
                callbackToken,
                callbackBaseUrl,
                callbackUrl: childEnv.BOOT_CALLBACK_URL ?? callbackBaseUrl,
                env: childEnv,
              }).then(() => {
                if (settled) {
                  return;
                }
                settled = true;
                clearTimeout(timeout);
                resolvePromise();
              }).catch((error) => {
                if (settled) {
                  return;
                }
                settled = true;
                clearTimeout(timeout);
                rejectPromise(new Error(`Boot provider in-process runner failed: ${toErrorMessage(error)}`));
              });
              return;
            }

            settled = true;
            clearTimeout(timeout);
            const attempts = attemptedCommands.join(', ');
            rejectPromise(new Error(`Boot provider command not found. attempted=[${attempts}]`));
            return;
          }

          attemptedCommands.push(command);
          logger.info(`Boot provider spawn command=${command} args=${JSON.stringify(args)}`);
          let attemptStderrBuffer = '';

          const child = spawn(command, args, {
            cwd: serverRootDir,
            env: childEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
          });

          child.stdout.on('data', () => {});

          child.stderr.on('data', (chunk: Buffer | string) => {
            attemptStderrBuffer += chunk.toString();
          });

          child.on('error', (error) => {
            if (settled) {
              return;
            }
            const code = (error as NodeJS.ErrnoException).code;
            if (commandIndex + 1 < commands.length) {
              logger.warn(
                `${buildCommandDiagnosticMessage(command, attemptedCommands, commands)} | errorCode=${code ?? 'unknown'} | fallback=next`,
              );
              commandIndex += 1;
              launch();
              return;
            }
            if (inProcessTarget) {
              logger.warn(
                `${buildCommandDiagnosticMessage(command, attemptedCommands, commands)} | errorCode=${code ?? 'unknown'} | fallback=in-process`,
              );
              commandIndex += 1;
              launch();
              return;
            }
            lastCommandFailure = `spawn error: code=${code ?? 'unknown'} message=${error.message}`;
            settled = true;
            clearTimeout(timeout);
            rejectPromise(new Error(`Boot provider spawn failed: command=${command} ${lastCommandFailure}`));
          });

          child.on('close', (code) => {
            if (settled) {
              return;
            }
            if (code === 0) {
              settled = true;
              clearTimeout(timeout);
              resolvePromise();
              return;
            }
            const exitCode = code ?? 'unknown';
            const trimmedStderr = attemptStderrBuffer.trim();
            lastCommandFailure = trimmedStderr || `Boot script exited with code ${exitCode}`;
            if (commandIndex + 1 < commands.length) {
              logger.warn(
                `Boot provider command exited non-zero: command=${command} code=${exitCode} stderr=${JSON.stringify(trimmedStderr)} | fallback=next`,
              );
              commandIndex += 1;
              launch();
              return;
            }
            if (inProcessTarget) {
              logger.warn(
                `Boot provider command exited non-zero: command=${command} code=${exitCode} stderr=${JSON.stringify(trimmedStderr)} | fallback=in-process`,
              );
              commandIndex += 1;
              launch();
              return;
            }
            settled = true;
            clearTimeout(timeout);
            rejectPromise(new Error(lastCommandFailure));
          });
        };

        launch();
      });
    },
  };
}

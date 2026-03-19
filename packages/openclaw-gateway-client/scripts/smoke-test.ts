import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  createLocalArtifactLogger,
  readDotEnvFile,
  resolveIntentosEnvPath,
  resolveIntentosRootDir,
} from "../../shared/src/index.js";
import { OpenClawGatewayClient } from "../src/index.js";
import type {
  AgentsFilesListResult,
  AgentsListResult,
  GatewayHelloOk,
  GatewayInboundFrame,
  GatewayRequestError,
  SessionsListResult,
} from "../src/index.js";

export type ParsedArgs = {
  url: string;
  token?: string;
  password?: string;
  role: "operator" | "node";
  scopes: string[];
  timeoutMs: number;
  allowInsecureWs: boolean;
  envPath: string;
};

type Logger = Pick<Console, "log" | "error">;

type EventName =
  | "connect.challenge"
  | "agent"
  | "chat"
  | "presence"
  | "tick"
  | "health"
  | "heartbeat"
  | "cron";

type EventObservation = {
  count: number;
  frames: unknown[];
};

type SmokeContext = {
  client: OpenClawGatewayClient;
  fixtures: SmokeFixtures;
  timeoutMs: number;
};

type SmokeFixtures = {
  sessionsList?: SessionsListResult;
  firstSessionKey?: string;
  agentsList?: AgentsListResult;
  firstAgentId?: string;
  agentFilesList?: AgentsFilesListResult;
  firstAgentFileName?: string;
};

type SmokeMethodDefinition = {
  name: string;
  mode: "readonly" | "mutation";
  run?: (context: SmokeContext) => Promise<unknown>;
  skipReason?: string;
};

type SmokeMethodResult = {
  name: string;
  status: "pass" | "skip" | "fail";
  payload: unknown;
};

type SmokeReport = {
  envPath: string;
  url: string;
  connected: boolean;
  hello?: GatewayHelloOk;
  methods: SmokeMethodResult[];
  events: Record<EventName, EventObservation>;
};

export type SmokeRunResult = {
  exitCode: number;
  report: SmokeReport;
};

type SmokeRunOverrides = {
  env?: NodeJS.ProcessEnv;
  fileEnv?: Record<string, string>;
};

const OBSERVED_EVENTS: EventName[] = [
  "connect.challenge",
  "agent",
  "chat",
  "presence",
  "tick",
  "health",
  "heartbeat",
  "cron",
];

class SmokeSkipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmokeSkipError";
  }
}

function printUsage(logger: Logger): void {
  logger.log(
    [
      "Usage:",
      "  pnpm run smoke",
      "  pnpm run smoke -- --url ws://127.0.0.1:18789 --token <token>",
      "",
      "Defaults:",
      "  Reads intentos/.env before falling back to built-in defaults.",
      "",
      "Options:",
      "  --url <ws-url>                Gateway WebSocket URL",
      "  --token <token>               Shared gateway token",
      "  --password <password>         Shared gateway password",
      '  --role <operator|node>        Client role (default: "operator")',
      '  --scopes <csv>                Requested scopes (default: "operator.admin")',
      "  --timeout-ms <number>         Wait timeout for passive observation (default: 30000)",
      "  --allow-insecure-ws           Allow remote plaintext ws://",
      "  --help                        Show this help",
    ].join("\n"),
  );
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function parseScopes(raw: string | undefined): string[] {
  const values = raw
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values && values.length > 0 ? values : ["operator.admin"];
}

export function parseArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  fileEnv: Record<string, string> = readDotEnvFile(resolveIntentosEnvPath()),
  logger: Logger = console,
): ParsedArgs | null {
  if (hasFlag(argv, "--help")) {
    printUsage(logger);
    return null;
  }

  const getValue = (flag: string, envKey: string): string | undefined =>
    readFlagValue(argv, flag) ?? env[envKey] ?? fileEnv[envKey] ?? undefined;

  const url = getValue("--url", "OPENCLAW_GATEWAY_URL") ?? "ws://127.0.0.1:18789";
  const token = getValue("--token", "OPENCLAW_TOKEN");
  const password = getValue("--password", "OPENCLAW_PASSWORD");
  const roleRaw = getValue("--role", "OPENCLAW_GATEWAY_ROLE") ?? "operator";
  if (roleRaw !== "operator" && roleRaw !== "node") {
    throw new Error(`invalid --role: ${roleRaw}`);
  }

  const timeoutMsRaw = getValue("--timeout-ms", "OPENCLAW_SMOKE_TIMEOUT_MS");
  const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`invalid --timeout-ms: ${String(timeoutMsRaw)}`);
  }

  return {
    url,
    token,
    password,
    role: roleRaw,
    scopes: parseScopes(getValue("--scopes", "OPENCLAW_GATEWAY_SCOPES")),
    timeoutMs,
    allowInsecureWs: hasFlag(argv, "--allow-insecure-ws"),
    envPath: resolveIntentosEnvPath(),
  };
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    const gatewayError = error as GatewayRequestError & { gatewayCode?: string; details?: unknown };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      gatewayCode: gatewayError.gatewayCode,
      details: gatewayError.details,
    };
  }
  return { message: String(error) };
}

function printSection(
  logger: Logger,
  kind: "METHOD" | "EVENT",
  name: string,
  status: "PASS" | "SKIP" | "FAIL" | "OBSERVED",
  payload: unknown,
): void {
  logger.log(`${kind} ${name}: ${status}`);
  logger.log(formatJson(payload));
}

async function getSessionsList(context: SmokeContext): Promise<SessionsListResult> {
  if (!context.fixtures.sessionsList) {
    const result = await context.client.sessions.list();
    context.fixtures.sessionsList = result;
    context.fixtures.firstSessionKey = result.sessions[0]?.key;
  }
  return context.fixtures.sessionsList;
}

async function requireSessionKey(context: SmokeContext): Promise<string> {
  const sessions = await getSessionsList(context);
  const key = context.fixtures.firstSessionKey ?? sessions.sessions[0]?.key;
  if (!key) {
    throw new SmokeSkipError("no session available");
  }
  context.fixtures.firstSessionKey = key;
  return key;
}

async function getAgentsList(context: SmokeContext): Promise<AgentsListResult> {
  if (!context.fixtures.agentsList) {
    const result = await context.client.agents.list();
    context.fixtures.agentsList = result;
    context.fixtures.firstAgentId = result.agents[0]?.id;
  }
  return context.fixtures.agentsList;
}

async function requireAgentId(context: SmokeContext): Promise<string> {
  const agents = await getAgentsList(context);
  const agentId = context.fixtures.firstAgentId ?? agents.agents[0]?.id;
  if (!agentId) {
    throw new SmokeSkipError("no agent available");
  }
  context.fixtures.firstAgentId = agentId;
  return agentId;
}

async function getAgentFilesList(context: SmokeContext): Promise<AgentsFilesListResult> {
  if (!context.fixtures.agentFilesList) {
    const agentId = await requireAgentId(context);
    const result = await context.client.agents.filesList({ agentId });
    context.fixtures.agentFilesList = result;
    context.fixtures.firstAgentFileName = result.files[0]?.name;
  }
  return context.fixtures.agentFilesList;
}

async function requireAgentFile(context: SmokeContext): Promise<{ agentId: string; name: string }> {
  const agentId = await requireAgentId(context);
  const files = await getAgentFilesList(context);
  const name = context.fixtures.firstAgentFileName ?? files.files[0]?.name;
  if (!name) {
    throw new SmokeSkipError("agent has no files");
  }
  context.fixtures.firstAgentFileName = name;
  return { agentId, name };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRunId(value: unknown): string | undefined {
  return isRecord(value) && typeof value.runId === "string" ? value.runId : undefined;
}

function frameMatchesRunId(frame: GatewayInboundFrame, runId: string): boolean {
  return readRunId(frame.payload) === runId;
}

export function buildSmokeMethodDefinitions(): SmokeMethodDefinition[] {
  return [
    { name: "health", mode: "readonly", run: ({ client }) => client.runtime.health() },
    {
      name: "logs.tail",
      mode: "readonly",
      run: ({ client }) => client.config.logsTail({ limit: 20, maxBytes: 8_192 }),
    },
    { name: "status", mode: "readonly", run: ({ client }) => client.runtime.status() },
    { name: "config.get", mode: "readonly", run: ({ client }) => client.config.get() },
    {
      name: "config.set",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    {
      name: "config.apply",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    {
      name: "config.patch",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    { name: "config.schema", mode: "readonly", run: ({ client }) => client.config.schema() },
    {
      name: "config.schema.lookup",
      mode: "readonly",
      run: ({ client }) => client.config.lookup({ path: "gateway.auth" }),
    },
    {
      name: "tools.catalog",
      mode: "readonly",
      run: ({ client }) => client.tools.catalog({ includePlugins: true }),
    },
    { name: "agents.list", mode: "readonly", run: async (context) => getAgentsList(context) },
    {
      name: "agents.create",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    {
      name: "agents.update",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    {
      name: "agents.delete",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    {
      name: "agents.files.list",
      mode: "readonly",
      run: async (context) => getAgentFilesList(context),
    },
    {
      name: "agents.files.get",
      mode: "readonly",
      run: async (context) => {
        const fixture = await requireAgentFile(context);
        return context.client.agents.filesGet(fixture);
      },
    },
    {
      name: "agents.files.set",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    { name: "skills.status", mode: "readonly", run: ({ client }) => client.skills.status() },
    {
      name: "skills.install",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    {
      name: "skills.update",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    {
      name: "update.run",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    { name: "sessions.list", mode: "readonly", run: async (context) => getSessionsList(context) },
    {
      name: "sessions.preview",
      mode: "readonly",
      run: async (context) => {
        const key = await requireSessionKey(context);
        return context.client.sessions.preview({ keys: [key], limit: 20, maxChars: 2_000 });
      },
    },
    {
      name: "sessions.patch",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    {
      name: "sessions.reset",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    {
      name: "sessions.delete",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    {
      name: "sessions.compact",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    { name: "last-heartbeat", mode: "readonly", run: ({ client }) => client.runtime.lastHeartbeat() },
    {
      name: "set-heartbeats",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    { name: "wake", mode: "mutation", skipReason: "mutating method disabled in read-only smoke mode" },
    { name: "cron.list", mode: "readonly", run: ({ client }) => client.cron.list() },
    { name: "cron.status", mode: "readonly", run: ({ client }) => client.cron.status() },
    { name: "cron.add", mode: "mutation", skipReason: "mutating method disabled in read-only smoke mode" },
    {
      name: "cron.update",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    {
      name: "cron.remove",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    { name: "cron.run", mode: "mutation", skipReason: "mutating method disabled in read-only smoke mode" },
    { name: "cron.runs", mode: "readonly", run: ({ client }) => client.cron.runs({ limit: 20 }) },
    { name: "system-presence", mode: "readonly", run: ({ client }) => client.runtime.systemPresence() },
    {
      name: "system-event",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    { name: "send", mode: "mutation", skipReason: "mutating method disabled in read-only smoke mode" },
    { name: "agent", mode: "mutation", skipReason: "mutating method disabled in read-only smoke mode" },
    {
      name: "agent.identity.get",
      mode: "readonly",
      run: async (context) =>
        context.client.agent.identity({ agentId: await requireAgentId(context) }),
    },
    {
      name: "agent.wait",
      mode: "readonly",
      run: async () => {
        throw new SmokeSkipError("no runId fixture available in read-only smoke mode");
      },
    },
    {
      name: "chat.history",
      mode: "readonly",
      run: async (context) => {
        const key = await requireSessionKey(context);
        return context.client.chat.history({ sessionKey: key, limit: 20 });
      },
    },
    {
      name: "chat.abort",
      mode: "mutation",
      skipReason: "mutating method disabled in read-only smoke mode",
    },
    {
      name: "chat.send",
      mode: "readonly",
      run: async (context) => {
        const sessionKey = await requireSessionKey(context);
        const inboundFrames: GatewayInboundFrame[] = [];
        const unsubscribe = context.client.onInboundFrame((frame) => {
          inboundFrames.push(frame);
        });
        try {
          const ackPayload = await context.client.chat.send(
            {
              sessionKey,
              message: "smoke test: please reply briefly so event structure can be observed",
            },
          );
          const runId = ackPayload.runId;
          await context.client.chat.waitForFinal(runId, {
            timeoutMs: context.timeoutMs,
          });
          return {
            responseFrames: inboundFrames.filter(
              (frame) => frame.type === "res" && frameMatchesRunId(frame, runId),
            ),
            eventFrames: inboundFrames.filter(
              (frame) => frame.type === "event" && frame.event === "chat" && frameMatchesRunId(frame, runId),
            ),
          };
        } finally {
          unsubscribe();
        }
      },
    },
  ];
}

export async function runSmokeMethodDefinitions(
  client: OpenClawGatewayClient,
  logger: Logger,
  timeoutMs: number,
): Promise<SmokeMethodResult[]> {
  const context: SmokeContext = {
    client,
    fixtures: {},
    timeoutMs,
  };
  const results: SmokeMethodResult[] = [];

  for (const definition of buildSmokeMethodDefinitions()) {
    if (!client.isMethodAvailable(definition.name)) {
      const result = {
        name: definition.name,
        status: "skip" as const,
        payload: { reason: "method not advertised by gateway hello.features.methods" },
      };
      results.push(result);
      printSection(logger, "METHOD", definition.name, "SKIP", result.payload);
      continue;
    }

    if (definition.mode === "mutation") {
      const result = {
        name: definition.name,
        status: "skip" as const,
        payload: {
          reason: definition.skipReason ?? "mutating method disabled in read-only smoke mode",
        },
      };
      results.push(result);
      printSection(logger, "METHOD", definition.name, "SKIP", result.payload);
      continue;
    }

    try {
      const payload = definition.run ? await definition.run(context) : null;
      const result = { name: definition.name, status: "pass" as const, payload };
      results.push(result);
      printSection(logger, "METHOD", definition.name, "PASS", payload);
    } catch (error) {
      if (error instanceof SmokeSkipError) {
        const result = {
          name: definition.name,
          status: "skip" as const,
          payload: { reason: error.message },
        };
        results.push(result);
        printSection(logger, "METHOD", definition.name, "SKIP", result.payload);
        continue;
      }
      const payload = serializeError(error);
      const result = { name: definition.name, status: "fail" as const, payload };
      results.push(result);
      printSection(logger, "METHOD", definition.name, "FAIL", payload);
    }
  }

  return results;
}

export function createEventObservations(): Record<EventName, EventObservation> {
  return Object.fromEntries(
    OBSERVED_EVENTS.map((eventName) => [eventName, { count: 0, frames: [] }]),
  ) as Record<EventName, EventObservation>;
}

export function observeEvent(
  observations: Record<EventName, EventObservation>,
  eventName: EventName,
  frame: unknown,
): void {
  const current = observations[eventName];
  current.count += 1;
  current.frames.push(frame);
}

export function printEventObservations(
  logger: Logger,
  observations: Record<EventName, EventObservation>,
): void {
  for (const eventName of OBSERVED_EVENTS) {
    const observation = observations[eventName];
    if (observation.count === 0) {
      printSection(logger, "EVENT", eventName, "SKIP", {
        reason: "not observed during smoke window",
      });
      continue;
    }
    printSection(logger, "EVENT", eventName, "OBSERVED", {
      count: observation.count,
      frames: observation.frames,
    });
  }
}

function getEventObservationWaitMs(timeoutMs: number): number {
  return Math.max(1_000, timeoutMs);
}

function assertAuthConfigured(parsed: ParsedArgs): void {
  if (parsed.token || parsed.password) {
    return;
  }
  throw new Error(
    `gateway auth is not configured. Set OPENCLAW_TOKEN or OPENCLAW_PASSWORD in ${parsed.envPath}, your environment, or CLI flags.`,
  );
}

export async function runSmoke(
  argv: string[],
  logger: Logger = console,
  overrides: SmokeRunOverrides = {},
): Promise<SmokeRunResult> {
  const fileEnv = overrides.fileEnv ?? readDotEnvFile(resolveIntentosEnvPath());
  const parsed = parseArgs(argv, overrides.env ?? process.env, fileEnv, logger);
  if (!parsed) {
    return {
      exitCode: 0,
      report: {
        envPath: resolveIntentosEnvPath(),
        url: "",
        connected: false,
        methods: [],
        events: createEventObservations(),
      },
    };
  }

  assertAuthConfigured(parsed);

  const client = new OpenClawGatewayClient({
    url: parsed.url,
    role: parsed.role,
    scopes: parsed.scopes,
    allowInsecureWs: parsed.allowInsecureWs,
    auth: {
      token: parsed.token,
      password: parsed.password,
    },
    client: {
      id: "gateway-client",
      version: "smoke-test",
      mode: "backend",
      platform: "node",
    },
  });

  const observations = createEventObservations();
  const unsubscribers: Array<() => void> = [];
  const report: SmokeReport = {
    envPath: parsed.envPath,
    url: parsed.url,
    connected: false,
    methods: [],
    events: observations,
  };

  unsubscribers.push(
    client.onInboundFrame((frame: GatewayInboundFrame) => {
      if (frame.type === "event" && frame.event === "connect.challenge") {
        observeEvent(observations, "connect.challenge", frame);
      }
    }),
  );

  for (const eventName of OBSERVED_EVENTS) {
    if (eventName === "connect.challenge") {
      continue;
    }
    unsubscribers.push(
      client.onEvent(eventName, (frame) => {
        observeEvent(observations, eventName, frame);
      }),
    );
  }

  let exitCode = 0;
  try {
    const hello = await client.connect();
    report.connected = true;
    report.hello = hello;
    logger.log("connect: ok");
    logger.log(formatJson(hello));

    const methodResults = await runSmokeMethodDefinitions(client, logger, parsed.timeoutMs);
    report.methods = methodResults;
    if (methodResults.some((result) => result.status === "fail")) {
      exitCode = 1;
    }

    await new Promise((resolve) => setTimeout(resolve, getEventObservationWaitMs(parsed.timeoutMs)));
    printEventObservations(logger, observations);
    return { exitCode, report };
  } finally {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
    client.close();
  }
}

async function main(): Promise<void> {
  const preview = parseArgs(
    process.argv.slice(2),
    process.env,
    readDotEnvFile(resolveIntentosEnvPath()),
    console,
  );
  if (!preview) {
    process.exitCode = 0;
    return;
  }

  const scriptLogger = createLocalArtifactLogger({
    rootDir: resolveIntentosRootDir(),
    name: "openclaw-gateway-smoke",
  });
  const { exitCode, report } = await runSmoke(process.argv.slice(2), scriptLogger);
  scriptLogger.writeReport({
    ...report,
    status: exitCode === 0 ? "ok" : "fail",
    exitCode,
    logPath: scriptLogger.logPath,
  } as never);
  scriptLogger.log(`Smoke log saved to ${scriptLogger.logPath}`);
  scriptLogger.log(`Smoke summary saved to ${scriptLogger.reportPath}`);
  process.exitCode = exitCode;
}

const isMainModule =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  void main().catch((error) => {
    const scriptLogger = createLocalArtifactLogger({
      rootDir: resolveIntentosRootDir(),
      name: "openclaw-gateway-smoke",
    });
    scriptLogger.writeReport({
      status: "fail",
      error: serializeError(error) as never,
      logPath: scriptLogger.logPath,
    });
    const payload = serializeError(error);
    scriptLogger.error(formatJson(payload));
    scriptLogger.error(`Smoke log saved to ${scriptLogger.logPath}`);
    scriptLogger.error(`Smoke summary saved to ${scriptLogger.reportPath}`);
    process.exitCode = 1;
  });
}

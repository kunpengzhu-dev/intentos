import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  readDotEnvFile,
  resolveIntentosEnvPath,
  resolveIntentosRootDir,
} from "../../shared/src/index.js";
import { createSignedGatewayDevice, loadOrCreateGatewayDeviceIdentity } from "../src/device-auth.js";

type Logger = Pick<Console, "log" | "error">;

export type ParsedArgs = {
  url: string;
  token?: string;
  password?: string;
  role: "operator" | "node";
  scopes: string[];
  events?: string[];
  chat?: string;
  sessionKey?: string;
  allowInsecureWs: boolean;
  envPath: string;
  outPath?: string;
  deviceIdentityPath?: string;
};

function printUsage(logger: Logger): void {
  logger.log(
    [
      "Usage:",
      "  pnpm tsx scripts/raw-monitor.ts",
      "  pnpm tsx scripts/raw-monitor.ts -- --out ./tmp/ws.log",
      "",
      "Options:",
      "  --url <ws-url>                Gateway WebSocket URL",
      "  --token <token>               Shared gateway token",
      "  --password <password>         Shared gateway password",
      '  --role <operator|node>        Default: "operator"',
      '  --scopes <csv>                Default: "operator.admin"',
      "  --events <csv>                Only log selected inbound event frames",
      "  --chat <message>              Send one chat.run after hello-ok to observe tool events",
      '  --session-key <key>           Chat session key for --chat (default: "agent:main:main")',
      "  --device-identity-path <path> Optional persistent device identity path",
      "  --out <path>                  Optional output file path",
      "  --allow-insecure-ws           Allow remote plaintext ws://",
      "  --help                        Show this help",
    ].join("\n"),
  );
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function parseScopes(raw: string | undefined): string[] {
  const values = raw
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values && values.length > 0 ? values : ["operator.admin"];
}

function parseEvents(raw: string | undefined): string[] | undefined {
  const values = raw
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values && values.length > 0 ? Array.from(new Set(values)) : undefined;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  const unbracketed =
    normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;
  return (
    unbracketed === "localhost" ||
    unbracketed === "::1" ||
    /^127(?:\.\d{1,3}){3}$/u.test(unbracketed) ||
    /^::ffff:127(?:\.\d{1,3}){3}$/u.test(unbracketed)
  );
}

function isSecureGatewayUrl(url: string, allowInsecureWs: boolean): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "wss:") {
    return true;
  }
  if (parsed.protocol !== "ws:") {
    return false;
  }
  return allowInsecureWs || isLoopbackHost(parsed.hostname);
}

function defaultOutputPath(rootDir: string): string {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return path.join(rootDir, ".artifacts", "logs", `openclaw-gateway-raw-${stamp}.log`);
}

function ensureOutputDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendRawFrame(
  filePath: string,
  direction: "IN" | "OUT" | "SYS",
  raw: string,
): void {
  let rendered = raw;
  try {
    rendered = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // Keep non-JSON payloads exactly as received.
  }
  const lines = [
    `----- ${new Date().toISOString()} ${direction} -----`,
    rendered,
    "",
  ].join("\n");
  fs.appendFileSync(filePath, lines);
}

async function readMessageData(data: unknown): Promise<string | null> {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  if (data instanceof Blob) {
    return data.text();
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

  return {
    url,
    token,
    password,
    role: roleRaw,
    scopes: parseScopes(getValue("--scopes", "OPENCLAW_GATEWAY_SCOPES")),
    events: parseEvents(getValue("--events", "OPENCLAW_RAW_MONITOR_EVENTS")),
    chat: getValue("--chat", "OPENCLAW_RAW_MONITOR_CHAT"),
    sessionKey: getValue("--session-key", "OPENCLAW_RAW_MONITOR_SESSION_KEY") ?? "agent:main:main",
    allowInsecureWs: hasFlag(argv, "--allow-insecure-ws"),
    envPath: resolveIntentosEnvPath(),
    outPath: readFlagValue(argv, "--out"),
    deviceIdentityPath: readFlagValue(argv, "--device-identity-path"),
  };
}

export async function startRawMonitor(
  args: ParsedArgs,
  logger: Logger = console,
): Promise<{ outPath: string }> {
  if (!args.token && !args.password) {
    throw new Error(
      "gateway auth is not configured. Set OPENCLAW_TOKEN or OPENCLAW_PASSWORD, or pass --token/--password.",
    );
  }
  if (!isSecureGatewayUrl(args.url, args.allowInsecureWs)) {
    throw new Error(
      `cannot connect to ${args.url} over insecure ws://; use wss://, a loopback URL, or --allow-insecure-ws`,
    );
  }

  const rootDir = resolveIntentosRootDir();
  const outPath = args.outPath ?? defaultOutputPath(rootDir);
  ensureOutputDir(outPath);
  appendRawFrame(
    outPath,
    "SYS",
    `starting raw monitor\nurl=${args.url}\nenv=${args.envPath}\nevents=${args.events?.join(",") ?? "all"}`,
  );

  const socket = new WebSocket(args.url);
  const client = {
    id: "gateway-client",
    version: "raw-monitor",
    platform: "node",
    mode: "backend",
  } as const;
  const identity = loadOrCreateGatewayDeviceIdentity(args.deviceIdentityPath);
  const caps = ["tool-events"] as const;
  let connectSent = false;
  let chatSent = false;

  socket.addEventListener("open", () => {
    logger.log(`raw monitor connected: ${args.url}`);
  });

  socket.addEventListener("message", (event) => {
    void (async () => {
      const raw = await readMessageData(event.data);
      if (!raw) {
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        appendRawFrame(outPath, "IN", raw);
        return;
      }

      const shouldLogInbound =
        !args.events ||
        !isRecord(parsed) ||
        parsed.type !== "event" ||
        (typeof parsed.event === "string" && args.events.includes(parsed.event));
      if (shouldLogInbound) {
        appendRawFrame(outPath, "IN", raw);
      }

      if (!isRecord(parsed) || parsed.type !== "event" || parsed.event !== "connect.challenge") {
        if (
          isRecord(parsed) &&
          parsed.type === "res" &&
          parsed.id === "connect-1" &&
          parsed.ok === true &&
          args.chat &&
          !chatSent
        ) {
          chatSent = true;
          const chatFrame = {
            type: "req",
            id: "chat-send-1",
            method: "chat.send",
            params: {
              sessionKey: args.sessionKey,
              message: args.chat,
              idempotencyKey: crypto.randomUUID(),
            },
          };
          const rawChat = JSON.stringify(chatFrame);
          appendRawFrame(outPath, "OUT", rawChat);
          socket.send(rawChat);
          appendRawFrame(
            outPath,
            "SYS",
            `sent chat.send for sessionKey=${args.sessionKey ?? "agent:main:main"}`,
          );
        }
        return;
      }

      const payload = isRecord(parsed.payload) ? parsed.payload : null;
      const nonce = payload && typeof payload.nonce === "string" ? payload.nonce.trim() : "";
      if (!nonce || connectSent) {
        return;
      }

      connectSent = true;
      const signedAtMs = Date.now();
      const connectFrame = {
        type: "req",
        id: "connect-1",
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client,
          role: args.role,
          scopes: args.scopes,
          caps,
          auth:
            args.token || args.password
              ? {
                  ...(args.token ? { token: args.token } : {}),
                  ...(args.password ? { password: args.password } : {}),
                }
              : undefined,
          device: createSignedGatewayDevice({
            identity,
            clientId: client.id,
            clientMode: client.mode,
            role: args.role,
            scopes: args.scopes,
            signedAtMs,
            token: args.token ?? null,
            nonce,
            platform: client.platform,
          }),
        },
      };
      const rawConnect = JSON.stringify(connectFrame);
      appendRawFrame(outPath, "OUT", rawConnect);
      socket.send(rawConnect);
    })().catch((error) => {
      appendRawFrame(
        outPath,
        "SYS",
        `message handler error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      );
    });
  });

  socket.addEventListener("close", (event) => {
    appendRawFrame(outPath, "SYS", `socket closed code=${event.code} reason=${event.reason || "n/a"}`);
    logger.log(`raw monitor closed: ${event.code} ${event.reason || "n/a"}`);
  });

  socket.addEventListener("error", () => {
    appendRawFrame(outPath, "SYS", "websocket error");
    logger.error("raw monitor websocket error");
  });

  const shutdown = (signal: string) => {
    appendRawFrame(outPath, "SYS", `received ${signal}; closing socket`);
    socket.close(1000, signal);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.log(`writing raw frames to ${outPath}`);
  return { outPath };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    return;
  }
  await startRawMonitor(args);
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

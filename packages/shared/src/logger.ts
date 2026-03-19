import fs from "node:fs";
import path from "node:path";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type LoggerOptions = {
  rootDir: string;
  name: string;
};

function toLine(parts: unknown[]): string {
  return parts
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      try {
        return JSON.stringify(part);
      } catch {
        return String(part);
      }
    })
    .join(" ");
}

export type LocalArtifactLogger = {
  readonly logPath: string;
  readonly reportPath: string;
  log: (...parts: unknown[]) => void;
  error: (...parts: unknown[]) => void;
  writeReport: (value: JsonValue) => void;
};

export function createLocalArtifactLogger(options: LoggerOptions): LocalArtifactLogger {
  const artifactsDir = path.join(options.rootDir, ".artifacts");
  const logsDir = path.join(artifactsDir, "logs");
  const reportsDir = path.join(artifactsDir, "reports");
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });

  const stamp = new Date().toISOString().replaceAll(":", "-");
  const baseName = `${options.name}-${stamp}`;
  const logPath = path.join(logsDir, `${baseName}.log`);
  const reportPath = path.join(reportsDir, `${baseName}.json`);

  const append = (level: "INFO" | "ERROR", parts: unknown[]) => {
    const line = `[${new Date().toISOString()}] [${level}] ${toLine(parts)}\n`;
    fs.appendFileSync(logPath, line);
  };

  return {
    logPath,
    reportPath,
    log: (...parts: unknown[]) => {
      console.log(...parts);
      append("INFO", parts);
    },
    error: (...parts: unknown[]) => {
      console.error(...parts);
      append("ERROR", parts);
    },
    writeReport: (value: JsonValue) => {
      fs.writeFileSync(reportPath, `${JSON.stringify(value, null, 2)}\n`);
    },
  };
}

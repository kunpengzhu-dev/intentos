import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveIntentosRootDir(metaUrl = import.meta.url): string {
  let current = path.dirname(fileURLToPath(metaUrl));

  while (true) {
    const workspaceMarker = path.join(current, "pnpm-workspace.yaml");
    const envPath = path.join(current, ".env");
    if (fs.existsSync(workspaceMarker) || fs.existsSync(envPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(path.dirname(fileURLToPath(metaUrl)), "../../..");
    }
    current = parent;
  }
}

export function resolveIntentosEnvPath(metaUrl = import.meta.url): string {
  return path.join(resolveIntentosRootDir(metaUrl), ".env");
}

export function parseDotEnv(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const index = line.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = line.slice(0, index).trim();
    if (!key) {
      continue;
    }
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function readDotEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    return {};
  }
  return parseDotEnv(fs.readFileSync(envPath, "utf8"));
}

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { resolveIntentosEnvPath, resolveIntentosRootDir } from "@intentos/shared";

test("resolveIntentosRootDir walks upward to the intentos workspace root", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "intentos-env-"));
  const intentosRoot = path.join(tempRoot, "intentos");
  const backendConfigDir = path.join(intentosRoot, "apps", "backend", "src", "config");
  fs.mkdirSync(backendConfigDir, { recursive: true });
  fs.writeFileSync(path.join(intentosRoot, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  fs.writeFileSync(path.join(intentosRoot, ".env"), "OPENCLAW_TOKEN=test-token\n");

  const metaUrl = pathToFileURL(path.join(backendConfigDir, "env.ts")).href;

  assert.equal(resolveIntentosRootDir(metaUrl), intentosRoot);
  assert.equal(resolveIntentosEnvPath(metaUrl), path.join(intentosRoot, ".env"));
});

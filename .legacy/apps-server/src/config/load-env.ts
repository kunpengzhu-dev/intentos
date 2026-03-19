import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(configDir, '../..');
const repoRootDir = resolve(serverDir, '../..');
const rootEnvFile = resolve(repoRootDir, '.env');

if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

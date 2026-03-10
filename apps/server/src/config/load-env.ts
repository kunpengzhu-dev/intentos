import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(configDir, '../..');
const serverEnvFile = resolve(serverDir, '.env');

if (existsSync(serverEnvFile)) {
  process.loadEnvFile(serverEnvFile);
}

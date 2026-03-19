import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, '');
  const backendPort = env.INTENTOS_BACKEND_PORT?.trim() || '3030';
  const backendProxyTarget = `http://localhost:${backendPort}`;

  return {
    envDir: workspaceRoot,
    plugins: [react(), tailwindcss()],
    base: './',
    build: { outDir: 'dist' },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: backendProxyTarget },
      },
    },
  };
});

import { app, BrowserWindow, shell } from 'electron';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const backendUrlFromEnv = process.env.INTENTOS_BACKEND_URL;
const preloadPath = path.resolve(__dirname, 'preload.mjs');
let embeddedBackend = null;
let embeddedBackendUrl = null;
let isQuitting = false;

function stringifyError(error) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim();
  }
  return String(error);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function writeStartupErrorLog(error) {
  const logsDir = path.join(app.getPath('userData'), 'logs');
  mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, 'startup-error.log');
  const body = [
    `time=${new Date().toISOString()}`,
    `platform=${process.platform}`,
    `arch=${process.arch}`,
    `electron=${process.versions.electron ?? 'unknown'}`,
    stringifyError(error),
    '',
  ].join('\n');
  appendFileSync(logPath, body, 'utf8');
  return logPath;
}

function createStartupErrorWindow(error, logPath) {
  const details = stringifyError(error);
  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Startup Failed</title></head>
  <body style="font-family: sans-serif; padding: 16px; background: #0b1020; color: #e5e7eb;">
    <h2>IntentOS failed to start</h2>
    <p>Log file: <code>${escapeHtml(logPath)}</code></p>
    <pre style="white-space: pre-wrap; background: #111827; padding: 12px; border-radius: 8px;">${escapeHtml(details)}</pre>
  </body>
</html>`;

  const errorWindow = new BrowserWindow({
    width: 980,
    height: 720,
    backgroundColor: '#0b1020',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void errorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function findFirstExistingPath(paths) {
  for (const candidate of paths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveWorkspaceRoot() {
  return path.resolve(__dirname, '../../..');
}

function resolveRendererEntry() {
  return findFirstExistingPath([
    path.resolve(__dirname, '../../frontend/dist/index.html'),
    path.resolve(app.getAppPath(), 'frontend/dist/index.html'),
  ]);
}

function reserveLocalPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (typeof address === 'string' || !address) {
        probe.close(() => reject(new Error('Failed to allocate a localhost port')));
        return;
      }
      probe.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function waitForPort(port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const tryConnect = () => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for backend on port ${port}`));
          return;
        }
        setTimeout(tryConnect, 250);
      });
    };

    tryConnect();
  });
}

async function startEmbeddedBackend() {
  if (backendUrlFromEnv) {
    return backendUrlFromEnv;
  }

  if (rendererUrl) {
    return 'http://127.0.0.1:3030';
  }

  const workspaceRoot = resolveWorkspaceRoot();
  const port = await reserveLocalPort();
  const backendUrl = `http://127.0.0.1:${port}`;

  embeddedBackend = spawn(
    'pnpm',
    ['--dir', workspaceRoot, '--filter', '@intentos/backend', 'start'],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        INTENTOS_BACKEND_HOST: '127.0.0.1',
        INTENTOS_BACKEND_PORT: String(port),
      },
      stdio: 'inherit',
    },
  );

  embeddedBackend.once('exit', (code) => {
    if (!isQuitting && code !== 0) {
      console.error(`[desktop] embedded backend exited early with code ${code ?? 'unknown'}`);
    }
  });

  await waitForPort(port);
  embeddedBackendUrl = backendUrl;
  return backendUrl;
}

function stopEmbeddedBackend() {
  if (!embeddedBackend || embeddedBackend.killed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    embeddedBackend.once('exit', () => resolve());
    embeddedBackend.kill('SIGTERM');
    setTimeout(() => {
      if (embeddedBackend && !embeddedBackend.killed) {
        embeddedBackend.kill('SIGKILL');
      }
    }, 5000);
  });
}

function createMainWindow(backendUrl) {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--intentos-backend-url=${backendUrl}`],
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  const rendererEntry = resolveRendererEntry();
  if (!rendererEntry) {
    throw new Error('Cannot find renderer build output. Build @intentos/frontend first.');
  }

  void mainWindow.loadFile(rendererEntry);
}

app.whenReady().then(async () => {
  const backendUrl = await startEmbeddedBackend();
  embeddedBackendUrl = backendUrl;
  createMainWindow(backendUrl);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && embeddedBackendUrl) {
      createMainWindow(embeddedBackendUrl);
    }
  });
}).catch((error) => {
  const logPath = writeStartupErrorLog(error);
  console.error('[desktop] failed to initialize app', error);
  createStartupErrorWindow(error, logPath);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (isQuitting) {
    return;
  }

  if (!embeddedBackend) {
    return;
  }

  event.preventDefault();
  isQuitting = true;
  stopEmbeddedBackend()
    .catch((error) => {
      console.error('[desktop] failed to stop embedded backend', error);
    })
    .finally(() => {
      app.quit();
    });
});

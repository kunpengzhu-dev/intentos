import { app, BrowserWindow, shell } from 'electron';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const serverBaseUrlFromEnv = process.env.INTENTOS_SERVER_URL;
const preloadPath = path.resolve(__dirname, 'preload.mjs');
let embeddedServer = null;
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

function resolveRendererEntry() {
  return findFirstExistingPath([
    path.resolve(__dirname, '../../web/dist/index.html'),
    path.resolve(__dirname, '../web/dist/index.html'),
    path.resolve(app.getAppPath(), 'web/dist/index.html'),
  ]);
}

function resolveServerEntry() {
  return findFirstExistingPath([
    path.resolve(__dirname, '../../server/dist/index.js'),
    path.resolve(__dirname, '../server/dist/index.js'),
    path.resolve(app.getAppPath(), 'server/dist/index.js'),
  ]);
}

async function reserveLocalPort() {
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
      probe.close((err) => (err ? reject(err) : resolve(address.port)));
    });
  });
}

async function startEmbeddedServer() {
  if (serverBaseUrlFromEnv) {
    return serverBaseUrlFromEnv;
  }

  if (rendererUrl) {
    return 'http://localhost:3001';
  }

  const serverEntry = resolveServerEntry();
  if (!serverEntry) {
    throw new Error('Cannot find bundled server entry. Build @intentos/server before starting desktop.');
  }

  const port = await reserveLocalPort();
  const userDataDir = app.getPath('userData');
  process.env.PORT = String(port);
  process.env.BOOT_CALLBACK_BASE_URL = `http://127.0.0.1:${port}`;
  const runtimeNodeCommand = process.argv0 || process.execPath;
  if (!process.env.BOOT_PROVIDER_COMMAND || process.env.BOOT_PROVIDER_COMMAND === 'node') {
    process.env.BOOT_PROVIDER_COMMAND = runtimeNodeCommand;
  }
  process.env.DATABASE_URL ??= path.join(userDataDir, 'data', 'intentos.db');
  process.env.ARTIFACT_STORAGE_DIR ??= path.join(userDataDir, 'artifacts');

  const moduleUrl = pathToFileURL(serverEntry).href;
  const { startIntentosServer } = await import(moduleUrl);
  embeddedServer = await startIntentosServer({ host: '127.0.0.1', port });

  return embeddedServer.url;
}

function createMainWindow(serverBaseUrl) {
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
      additionalArguments: [`--intentos-server-url=${serverBaseUrl}`],
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
    throw new Error('Cannot find renderer build output. Build @intentos/web first.');
  }

  void mainWindow.loadFile(rendererEntry);
}

app.whenReady().then(async () => {
  const serverBaseUrl = await startEmbeddedServer();
  createMainWindow(serverBaseUrl);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(serverBaseUrl);
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
  if (!embeddedServer || isQuitting) {
    return;
  }

  event.preventDefault();
  isQuitting = true;
  embeddedServer
    .close()
    .catch((error) => {
      console.error('[desktop] failed to stop embedded server', error);
    })
    .finally(() => {
      app.quit();
    });
});

import { app, BrowserWindow, shell } from 'electron';
import { existsSync } from 'node:fs';
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
  process.env.BOOT_PROVIDER_COMMAND ??= process.execPath;
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
  console.error('[desktop] failed to initialize app', error);
  app.quit();
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

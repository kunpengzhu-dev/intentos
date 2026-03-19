import { contextBridge } from 'electron';

const BACKEND_URL_ARG_PREFIX = '--intentos-backend-url=';
const backendUrlArg = process.argv.find((arg) => arg.startsWith(BACKEND_URL_ARG_PREFIX));
const apiBaseUrl = backendUrlArg
  ? backendUrlArg.slice(BACKEND_URL_ARG_PREFIX.length)
  : 'http://127.0.0.1:3030';

contextBridge.exposeInMainWorld('__INTENTOS_DESKTOP__', { apiBaseUrl });

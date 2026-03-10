import { contextBridge } from 'electron';

const SERVER_URL_ARG_PREFIX = '--intentos-server-url=';
const serverUrlArg = process.argv.find((arg) => arg.startsWith(SERVER_URL_ARG_PREFIX));
const apiBaseUrl = serverUrlArg
  ? serverUrlArg.slice(SERVER_URL_ARG_PREFIX.length)
  : 'http://localhost:3001';

contextBridge.exposeInMainWorld('__INTENTOS_DESKTOP__', { apiBaseUrl });

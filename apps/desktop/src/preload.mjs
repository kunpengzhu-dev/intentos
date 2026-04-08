import { contextBridge } from 'electron';

const BACKEND_URL_ARG_PREFIX = '--intentos-backend-url=';
const RELATIVE_API_ARG = '--intentos-use-relative-api=1';
const backendUrlArg = process.argv.find((arg) => arg.startsWith(BACKEND_URL_ARG_PREFIX));
const useRelativeApi = process.argv.includes(RELATIVE_API_ARG);
const apiBaseUrl = backendUrlArg
  ? backendUrlArg.slice(BACKEND_URL_ARG_PREFIX.length)
  : 'http://localhost:3030';

contextBridge.exposeInMainWorld('__INTENTOS_DESKTOP__', {
  apiBaseUrl,
  useRelativeApi,
});

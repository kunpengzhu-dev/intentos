type DesktopBridge = {
  apiBaseUrl?: string;
};

function readDesktopBridge(): DesktopBridge | undefined {
  return (window as typeof window & { __INTENTOS_DESKTOP__?: DesktopBridge }).__INTENTOS_DESKTOP__;
}

function readEnvApiBaseUrl(): string | undefined {
  return import.meta.env.VITE_API_BASE_URL;
}

function readEnvBootAlwaysShow(): string | undefined {
  return import.meta.env.VITE_BOOT_ALWAYS_SHOW;
}

function isTruthyFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getBackendBaseUrl(): string | null {
  const candidate = readDesktopBridge()?.apiBaseUrl ?? readEnvApiBaseUrl();
  if (!candidate) return null;

  const normalized = trimTrailingSlash(candidate);
  return normalized.length > 0 ? normalized : null;
}

export function shouldAlwaysShowBootFromEnv(): boolean {
  return isTruthyFlag(readEnvBootAlwaysShow());
}

export function getWebSocketUrl(): string {
  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/ws`;
  }

  const url = new URL(backendBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function resolveBackendUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(?:https?|wss?):\/\//.test(url)) return url;

  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) return url;

  return url.startsWith('/')
    ? `${backendBaseUrl}${url}`
    : `${backendBaseUrl}/${url}`;
}

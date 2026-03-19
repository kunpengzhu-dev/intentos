type DesktopBridge = {
  apiBaseUrl?: string;
};

function readDesktopBridge(): DesktopBridge | undefined {
  return (window as typeof window & { __INTENTOS_DESKTOP__?: DesktopBridge }).__INTENTOS_DESKTOP__;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getBackendBaseUrl(): string | null {
  const candidate = readDesktopBridge()?.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL;
  if (!candidate) {
    return null;
  }

  const normalized = trimTrailingSlash(candidate);
  return normalized.length > 0 ? normalized : null;
}

export function resolveBackendUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    return path;
  }

  return path.startsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
}

export function shouldAlwaysShowBootFromEnv(): boolean {
  const value = import.meta.env.VITE_BOOT_ALWAYS_SHOW;
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

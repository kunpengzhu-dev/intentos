const BOOT_GATE_VERSION = '2026-03-boot-v1';
const BOOT_GATE_KEY = `intentos:boot-seen:${BOOT_GATE_VERSION}`;

export function shouldForceBootFromUrl(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get('boot') === '1';
}

export function shouldShowBoot(search: string): boolean {
  if (shouldForceBootFromUrl(search)) return true;
  try {
    return window.localStorage.getItem(BOOT_GATE_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markBootSeen() {
  try {
    window.localStorage.setItem(BOOT_GATE_KEY, '1');
  } catch {
    // ignore storage failures; boot will reappear on next load.
  }
}

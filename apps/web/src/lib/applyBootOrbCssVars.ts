import { bootOrbCssVars } from '@intentos/ui/tokens';

export function applyBootOrbCssVars() {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(bootOrbCssVars)) {
    root.style.setProperty(key, value);
  }
}

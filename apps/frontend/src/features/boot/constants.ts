import { bootOrbTokens } from '../../ui/tokens';

export const INTRO_TEXT = '你好，我是小艺。';
export const WELCOME_TEXT = '欢迎来到AIOS';
export const BOOT_SEQUENCE = bootOrbTokens.boot;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

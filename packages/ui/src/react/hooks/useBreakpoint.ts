import { useMediaQuery } from './useMediaQuery.js';

const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
} as const;

export function useBreakpoint() {
  const sm = useMediaQuery(`(min-width: ${breakpoints.sm})`);
  const md = useMediaQuery(`(min-width: ${breakpoints.md})`);
  const lg = useMediaQuery(`(min-width: ${breakpoints.lg})`);
  const xl = useMediaQuery(`(min-width: ${breakpoints.xl})`);
  return { sm, md, lg, xl };
}

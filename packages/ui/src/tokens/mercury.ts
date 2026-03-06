export const mercury = {
  canvas: {
    base: '#e8ebef',
    topGlow: 'rgba(255, 255, 255, 0.35)',
    roseGlow: 'rgba(255, 211, 220, 0.55)',
    skyGlow: 'rgba(191, 226, 255, 0.55)',
    violetGlow: 'rgba(214, 201, 255, 0.45)',
  },
  surface: {
    panel: {
      background: 'rgba(255, 255, 255, 0.52)',
      border: 'rgba(255, 255, 255, 0.7)',
      shadow: '0 24px 60px rgba(148, 163, 184, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.55)',
      blur: '24px',
    },
    soft: {
      background: 'rgba(255, 255, 255, 0.38)',
      border: 'rgba(255, 255, 255, 0.62)',
      shadow: '0 18px 40px rgba(148, 163, 184, 0.14)',
      blur: '18px',
    },
    pill: {
      background: 'rgba(255, 255, 255, 0.46)',
      border: 'rgba(255, 255, 255, 0.72)',
      shadow: '0 10px 30px rgba(148, 163, 184, 0.12)',
      blur: '16px',
    },
  },
  text: {
    primary: '#1f2a37',
    secondary: '#64748b',
    muted: '#94a3b8',
  },
  border: {
    soft: 'rgba(100, 116, 139, 0.24)',
  },
} as const;

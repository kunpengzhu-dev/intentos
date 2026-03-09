export const bootOrbTokens = {
  boot: {
    text: {
      introDelayMs: 1000,
      introVisibleMs: 3250,
      gapMs: 560,
      welcomeVisibleMs: 3250,
    },
    transition: {
      panelFadeDelayMs: 260,
      backgroundRevealDelayMs: 2000,
      cornerDelayMs: 260,
      readyDelayMs: 800,
    },
  },
  orb: {
    size: {
      centerPx: 100,
      cornerPx: 50,
      radiusPx: 25,
    },
    corner: {
      minRightPx: 44,
      maxRightPx: 70,
      rightViewportRatio: 0.07,
      minTopPx: 34,
      maxTopPx: 58,
      topViewportRatio: 0.06,
    },
    interactive: {
      hoverScale: 1.1,
      activeScale: 0.9,
    },
    drag: {
      elastic: 0.06,
      inertiaFactor: 0.08,
      spring: {
        stiffness: 260,
        damping: 32,
        mass: 0.9,
      },
    },
  },
} as const;

export const bootOrbCssVars = {
  '--orb-size-center': `${bootOrbTokens.orb.size.centerPx}px`,
  '--orb-size-corner': `${bootOrbTokens.orb.size.cornerPx}px`,
  '--orb-corner-right-min': `${bootOrbTokens.orb.corner.minRightPx}px`,
  '--orb-corner-right-max': `${bootOrbTokens.orb.corner.maxRightPx}px`,
  '--orb-corner-right-vw': `${bootOrbTokens.orb.corner.rightViewportRatio * 100}vw`,
  '--orb-corner-top-min': `${bootOrbTokens.orb.corner.minTopPx}px`,
  '--orb-corner-top-max': `${bootOrbTokens.orb.corner.maxTopPx}px`,
  '--orb-corner-top-vh': `${bootOrbTokens.orb.corner.topViewportRatio * 100}vh`,
} as const;

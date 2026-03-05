export const motion = {
  orb: {
    breathe: { scale: [1, 1.05, 1], duration: 3000 },
    pulse: { scale: [1, 1.15, 1], duration: 600 },
    idle: { rotate: [0, 2, -2, 0], duration: 4000 },
    snap: { type: 'spring' as const, stiffness: 300, damping: 25 },
    drag: { type: 'spring' as const, stiffness: 200, damping: 20 },
  },
  card: {
    enter: { opacity: [0, 1], y: [20, 0], duration: 300 },
    exit: { opacity: [1, 0], y: [0, -10], duration: 200 },
    hover: { scale: 1.02, duration: 150 },
  },
  page: {
    fadeIn: { opacity: [0, 1], duration: 200 },
    slideUp: { opacity: [0, 1], y: [30, 0], duration: 300 },
  },
} as const;

import { animate, useMotionValue } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { bootOrbTokens } from '@intentos/ui/tokens';

type Bounds = { left: number; right: number; top: number; bottom: number };

export function useOrbDrag({ isReady, cornered }: { isReady: boolean; cornered: boolean }) {
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const [dragBounds, setDragBounds] = useState<Bounds>({ left: 0, right: 0, top: 0, bottom: 0 });

  const getViewportBounds = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const radius = bootOrbTokens.orb.size.radiusPx;
    const baseX = vw - Math.min(
      bootOrbTokens.orb.corner.maxRightPx,
      Math.max(bootOrbTokens.orb.corner.minRightPx, vw * bootOrbTokens.orb.corner.rightViewportRatio),
    );
    const baseY = Math.min(
      bootOrbTokens.orb.corner.maxTopPx,
      Math.max(bootOrbTokens.orb.corner.minTopPx, vh * bootOrbTokens.orb.corner.topViewportRatio),
    );
    return {
      minX: radius - baseX,
      maxX: vw - radius - baseX,
      minY: radius - baseY,
      maxY: vh - radius - baseY,
    };
  }, []);

  const clampToViewport = useCallback(() => {
    if (!isReady || !cornered) return;
    const { minX, maxX, minY, maxY } = getViewportBounds();
    dragX.set(Math.min(maxX, Math.max(minX, dragX.get())));
    dragY.set(Math.min(maxY, Math.max(minY, dragY.get())));
  }, [cornered, dragX, dragY, getViewportBounds, isReady]);

  useEffect(() => {
    if (!isReady) {
      dragX.set(0);
      dragY.set(0);
    }
  }, [dragX, dragY, isReady]);

  useEffect(() => {
    if (!isReady || !cornered) return;
    const syncBounds = () => {
      const { minX, maxX, minY, maxY } = getViewportBounds();
      setDragBounds({ left: minX, right: maxX, top: minY, bottom: maxY });
      clampToViewport();
    };
    syncBounds();
    window.addEventListener('resize', syncBounds);
    return () => window.removeEventListener('resize', syncBounds);
  }, [clampToViewport, cornered, getViewportBounds, isReady]);

  const onDragEnd = useCallback((_: PointerEvent | MouseEvent | TouchEvent, info: { velocity: { x: number; y: number } }) => {
    if (!isReady || !cornered) return;
    const { minX, maxX, minY, maxY } = getViewportBounds();
    const inertiaFactor = bootOrbTokens.orb.drag.inertiaFactor;
    const nextX = Math.min(maxX, Math.max(minX, dragX.get() + info.velocity.x * inertiaFactor));
    const nextY = Math.min(maxY, Math.max(minY, dragY.get() + info.velocity.y * inertiaFactor));

    animate(dragX, nextX, {
      type: 'spring',
      stiffness: bootOrbTokens.orb.drag.spring.stiffness,
      damping: bootOrbTokens.orb.drag.spring.damping,
      mass: bootOrbTokens.orb.drag.spring.mass,
      velocity: info.velocity.x,
    });
    animate(dragY, nextY, {
      type: 'spring',
      stiffness: bootOrbTokens.orb.drag.spring.stiffness,
      damping: bootOrbTokens.orb.drag.spring.damping,
      mass: bootOrbTokens.orb.drag.spring.mass,
      velocity: info.velocity.y,
    });
  }, [cornered, dragX, dragY, getViewportBounds, isReady]);

  return {
    dragX,
    dragY,
    dragBounds,
    onDragEnd,
  };
}

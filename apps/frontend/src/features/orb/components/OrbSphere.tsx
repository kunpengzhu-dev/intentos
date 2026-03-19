import { motion, type MotionValue } from 'framer-motion';
import { bootOrbTokens } from '../../../ui/tokens';
import { useRef } from 'react';
import type { ReactNode, RefObject } from 'react';

type Bounds = { left: number; right: number; top: number; bottom: number };

export function OrbSphere({
  isReady,
  cornered,
  visibleOpacity,
  stageScale,
  dragX,
  dragY,
  dragBounds,
  onDragEnd,
  onToggle,
  orbButtonRef,
  children,
}: {
  isReady: boolean;
  cornered: boolean;
  visibleOpacity: number;
  stageScale: number;
  dragX: MotionValue<number>;
  dragY: MotionValue<number>;
  dragBounds: Bounds;
  onDragEnd: (_: PointerEvent | MouseEvent | TouchEvent, info: { velocity: { x: number; y: number } }) => void;
  onToggle: () => void;
  orbButtonRef: RefObject<HTMLButtonElement | null>;
  children?: ReactNode;
}) {
  const dragSuppressClickRef = useRef(false);

  return (
    <div
      className={`ai-sphere-stage active ${cornered ? 'to-corner' : ''} ${isReady ? 'ai-sphere-stage--interactive' : ''}`}
      style={{ opacity: visibleOpacity, transform: `scale(${stageScale})` }}
    >
      <div className="ai-sphere-shell">
        <motion.div
          className="ai-sphere-anchor"
          drag={isReady}
          dragMomentum={false}
          dragElastic={bootOrbTokens.orb.drag.elastic}
          dragConstraints={dragBounds}
          dragListener={isReady}
          dragPropagation={false}
          style={{ x: dragX, y: dragY }}
          onDragStart={() => {
            dragSuppressClickRef.current = true;
          }}
          onDragEnd={onDragEnd}
        >
          <motion.button
            ref={orbButtonRef}
            type="button"
            aria-label="Toggle assistant"
            onPointerDown={() => {
              dragSuppressClickRef.current = false;
            }}
            onClick={(event) => {
              if (dragSuppressClickRef.current) {
                event.preventDefault();
                event.stopPropagation();
                dragSuppressClickRef.current = false;
                return;
              }
              onToggle();
            }}
            whileHover={isReady ? { scale: bootOrbTokens.orb.interactive.hoverScale, filter: 'brightness(1.1) saturate(1.12)' } : undefined}
            whileTap={isReady ? { scale: bootOrbTokens.orb.interactive.activeScale, filter: 'brightness(1.06) saturate(1.06)' } : undefined}
            whileDrag={isReady ? { scale: bootOrbTokens.orb.interactive.activeScale, filter: 'brightness(1.06) saturate(1.06)' } : undefined}
            className={`ai-sphere ${isReady ? 'ai-sphere--button' : ''}`}
          >
            <div className="ring" />
            <div className="core" />
          </motion.button>
          {children}
        </motion.div>
      </div>
    </div>
  );
}

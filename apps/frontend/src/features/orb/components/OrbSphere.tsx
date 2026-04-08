import { motion, type MotionValue } from 'framer-motion';
import { bootOrbTokens } from '../../../ui/tokens';
import { useRef } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';

type Bounds = { left: number; right: number; top: number; bottom: number };

export function OrbSphere({
  isReady,
  cornered,
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
  dragX: MotionValue<number>;
  dragY: MotionValue<number>;
  dragBounds: Bounds;
  onDragEnd: (_: PointerEvent | MouseEvent | TouchEvent, info: { velocity: { x: number; y: number } }) => void;
  onToggle: () => void;
  orbButtonRef: RefObject<HTMLButtonElement | null>;
  children?: ReactNode;
}) {
  const dragSuppressClickRef = useRef(false);
  const stageStyle: CSSProperties = cornered
    ? { opacity: 1, transform: 'scale(1)' }
    : {
        opacity: 'var(--boot-ai-opacity, 0)',
        transform: 'scale(calc(0.92 + var(--boot-ai-opacity, 0) * 0.08))',
      };

  return (
    <div
      className={`ai-sphere-stage active ${cornered ? 'to-corner' : ''} ${isReady ? 'ai-sphere-stage--interactive' : ''}`}
      style={stageStyle}
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

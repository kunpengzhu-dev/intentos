import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { AnimationController, TransitionState } from '../os1-animation';

export function useOs1Animation({
  wrapRef,
  transformed,
}: {
  wrapRef: RefObject<HTMLDivElement | null>;
  transformed: boolean;
}) {
  const animationController = useRef<AnimationController | null>(null);
  const lastTransitionRef = useRef<TransitionState>({ glowOpacity: 0, aiOpacity: 0 });
  const [transitionState, setTransitionState] = useState<TransitionState>({
    glowOpacity: 0,
    aiOpacity: 0,
  });

  useEffect(() => {
    if (!wrapRef.current) return;
    let cancelled = false;

    void import('../os1-animation').then(({ createOs1Animation }) => {
      if (cancelled || !wrapRef.current) return;

      const controller = createOs1Animation(wrapRef.current, (next) => {
        const last = lastTransitionRef.current;
        if (
          Math.abs(last.glowOpacity - next.glowOpacity) < 0.001 &&
          Math.abs(last.aiOpacity - next.aiOpacity) < 0.001
        ) {
          return;
        }
        lastTransitionRef.current = next;
        setTransitionState(next);
      });

      animationController.current = controller;
      controller.setTransformation(transformed);
    });

    return () => {
      cancelled = true;
      animationController.current?.dispose();
      animationController.current = null;
      lastTransitionRef.current = { glowOpacity: 0, aiOpacity: 0 };
    };
  }, [wrapRef]);

  useEffect(() => {
    animationController.current?.setTransformation(transformed);
  }, [transformed]);

  return { transitionState };
}

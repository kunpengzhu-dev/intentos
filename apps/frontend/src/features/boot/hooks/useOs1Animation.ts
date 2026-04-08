import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { AnimationController, TransitionState } from '../os1-animation';

function applyBootTransitionCssVars(host: HTMLElement, state: TransitionState) {
  host.style.setProperty('--boot-glow-opacity', state.glowOpacity.toFixed(3));
  host.style.setProperty('--boot-ai-opacity', state.aiOpacity.toFixed(3));
}

export function useOs1Animation({
  wrapRef,
  transitionHostRef,
  transformed,
}: {
  wrapRef: RefObject<HTMLDivElement | null>;
  transitionHostRef: RefObject<HTMLElement | null>;
  transformed: boolean;
}) {
  const animationController = useRef<AnimationController | null>(null);
  const transitionStateRef = useRef<TransitionState>({
    glowOpacity: 0,
    aiOpacity: 0,
  });

  useEffect(() => {
    if (!wrapRef.current || !transitionHostRef.current) return;
    let cancelled = false;
    applyBootTransitionCssVars(transitionHostRef.current, transitionStateRef.current);

    void import('../os1-animation').then(({ createOs1Animation }) => {
      if (cancelled || !wrapRef.current || !transitionHostRef.current) return;

      const controller = createOs1Animation(wrapRef.current, (next) => {
        transitionStateRef.current = next;
        applyBootTransitionCssVars(transitionHostRef.current!, next);
      });

      animationController.current = controller;
      controller.setTransformation(transformed);
    });

    return () => {
      cancelled = true;
      animationController.current?.dispose();
      animationController.current = null;
      transitionStateRef.current = { glowOpacity: 0, aiOpacity: 0 };
      if (transitionHostRef.current) {
        applyBootTransitionCssVars(transitionHostRef.current, transitionStateRef.current);
      }
    };
  }, [transitionHostRef, wrapRef]);

  useEffect(() => {
    animationController.current?.setTransformation(transformed);
  }, [transformed]);

  return { transitionStateRef };
}

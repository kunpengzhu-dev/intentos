import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { OrbTransitionState } from '../../orb/types';
import { BOOT_SEQUENCE, INTRO_TEXT, WELCOME_TEXT } from '../constants';
import type { TransitionState } from '../os1-animation';

type BootPhase = 'checking' | 'ready' | 'failed';

export function useBootVisualSequence({
  phase,
  transitionStateRef,
  onReady,
  onOrbTransitionChange,
}: {
  phase: BootPhase;
  transitionStateRef: MutableRefObject<TransitionState>;
  onReady: () => void;
  onOrbTransitionChange: (next: Partial<OrbTransitionState>) => void;
}) {
  const sequenceStarted = useRef(false);
  const orbCorneredRef = useRef(false);

  const [loadingPanelHidden, setLoadingPanelHidden] = useState(false);
  const [welcomeText, setWelcomeText] = useState('');
  const [welcomeTone, setWelcomeTone] = useState<'hidden' | 'show' | 'hide'>('hidden');
  const [backgroundRevealed, setBackgroundRevealed] = useState(false);
  const [orbCornered, setOrbCornered] = useState(false);

  const resetSequenceVisuals = () => {
    sequenceStarted.current = false;
    setLoadingPanelHidden(false);
    setWelcomeText('');
    setWelcomeTone('hidden');
    setBackgroundRevealed(false);
    setOrbCornered(false);
  };

  useEffect(() => {
    orbCorneredRef.current = orbCornered;
  }, [orbCornered]);

  useEffect(() => {
    onOrbTransitionChange({
      mode: 'boot',
      opacity: orbCornered ? 1 : 0,
      cornered: orbCornered,
    });
  }, [onOrbTransitionChange, orbCornered]);

  useEffect(() => {
    if (phase === 'failed') {
      resetSequenceVisuals();
      return;
    }

    if (phase !== 'ready' || sequenceStarted.current) return;
    sequenceStarted.current = true;

    const sleep = (ms: number) => new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });
    const waitFor = async (predicate: () => boolean, timeoutMs = 2200, intervalMs = 60) => {
      const start = performance.now();
      while (!predicate()) {
        if (performance.now() - start > timeoutMs) break;
        await sleep(intervalMs);
      }
    };

    let cancelled = false;

    void (async () => {
      await sleep(BOOT_SEQUENCE.transition.panelFadeDelayMs);
      if (cancelled) return;
      setLoadingPanelHidden(true);

      await waitFor(() => transitionStateRef.current.aiOpacity >= 0.9 && !orbCorneredRef.current);
      if (cancelled) return;

      await sleep(BOOT_SEQUENCE.text.introDelayMs);
      if (cancelled) return;
      setWelcomeText(INTRO_TEXT);
      setWelcomeTone('show');

      await sleep(BOOT_SEQUENCE.text.introVisibleMs);
      if (cancelled) return;
      setWelcomeTone('hide');

      await sleep(BOOT_SEQUENCE.text.gapMs);
      if (cancelled) return;
      setWelcomeText(WELCOME_TEXT);
      setWelcomeTone('show');

      await sleep(BOOT_SEQUENCE.text.welcomeVisibleMs);
      if (cancelled) return;
      setWelcomeTone('hide');

      await sleep(BOOT_SEQUENCE.text.gapMs);
      if (cancelled) return;
      setWelcomeText('');

      await waitFor(() => transitionStateRef.current.aiOpacity >= 0.9 && !orbCorneredRef.current);
      if (cancelled) return;
      setBackgroundRevealed(true);

      await sleep(BOOT_SEQUENCE.transition.backgroundRevealDelayMs);
      if (cancelled) return;

      await sleep(BOOT_SEQUENCE.transition.cornerDelayMs);
      if (cancelled) return;
      setOrbCornered(true);

      await sleep(BOOT_SEQUENCE.transition.readyDelayMs);
      if (cancelled) return;
      onReady();
    })();

    return () => {
      cancelled = true;
    };
  }, [onReady, phase, transitionStateRef]);

  return {
    loadingPanelHidden,
    welcomeText,
    welcomeTone,
    backgroundRevealed,
    orbCornered,
  };
}

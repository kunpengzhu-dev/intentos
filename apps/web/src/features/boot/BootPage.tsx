import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BootCompletedPayload,
  BootFailedPayload,
  BootStartAckPayload,
  BootStepUpdatedPayload,
  Envelope,
} from '@intentos/protocol';
import mercuryBackground from '../../assets/backgrounds/mercury-background.jpg';
import { useBootStore } from '../../store/boot';
import { useConnectionStore } from '../../store/connection';
import type { AnimationController, TransitionState } from './os1-animation';
import type { OrbTransitionState } from '../../App';

const INTRO_TEXT = '你好，我是小艺。';
const WELCOME_TEXT = '欢迎来到AIOS';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function BootPage({
  onReady,
  onOrbTransitionChange,
}: {
  onReady: () => void;
  onOrbTransitionChange: (next: Partial<OrbTransitionState>) => void;
}) {
  const { phase, checks, progress, setPhase, startBoot, updateCheck, failBoot, reset } = useBootStore();
  const { init, getClient, state } = useConnectionStore();
  const bootSent = useRef(false);
  const sequenceStarted = useRef(false);
  const animationController = useRef<AnimationController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const aiOpacityRef = useRef(0);
  const orbCorneredRef = useRef(false);

  const [transitionState, setTransitionState] = useState<TransitionState>({ glowOpacity: 0, aiOpacity: 0 });
  const [loadingPanelHidden, setLoadingPanelHidden] = useState(false);
  const [welcomeText, setWelcomeText] = useState('');
  const [welcomeTone, setWelcomeTone] = useState<'hidden' | 'show' | 'hide'>('hidden');
  const [backgroundRevealed, setBackgroundRevealed] = useState(false);
  const [orbCornered, setOrbCornered] = useState(false);

  const effectiveProgress = phase === 'ready' ? 1 : progress;
  const percentageLabel = `${(effectiveProgress * 100).toFixed(1)}%`;
  const loadingLabel = phase === 'failed' ? 'Failed' : effectiveProgress >= 1 ? 'Ready' : 'Loading';

  const failureText = useMemo(() => {
    const failedCheck = checks.find((check) => check.state === 'failed');
    return failedCheck?.error ?? 'Startup checks failed. Please inspect the failed subsystem and retry.';
  }, [checks]);

  const resetSequenceVisuals = () => {
    sequenceStarted.current = false;
    setLoadingPanelHidden(false);
    setTransitionState({ glowOpacity: 0, aiOpacity: 0 });
    setWelcomeText('');
    setWelcomeTone('hidden');
    setBackgroundRevealed(false);
    setOrbCornered(false);
  };

  useEffect(() => {
    if (!wrapRef.current) return;
    let cancelled = false;

    void import('./os1-animation').then(({ createOs1Animation }) => {
      if (cancelled || !wrapRef.current) return;

      const controller = createOs1Animation(wrapRef.current, (next) => {
        setTransitionState(next);
      });

      animationController.current = controller;
      controller.setTransformation(effectiveProgress >= 1);
    });

    return () => {
      cancelled = true;
      animationController.current?.dispose();
      animationController.current = null;
    };
  }, []);

  useEffect(() => {
    animationController.current?.setTransformation(effectiveProgress >= 1 && phase !== 'failed');
  }, [effectiveProgress, phase]);

  useEffect(() => {
    aiOpacityRef.current = transitionState.aiOpacity;
  }, [transitionState.aiOpacity]);

  useEffect(() => {
    orbCorneredRef.current = orbCornered;
  }, [orbCornered]);

  useEffect(() => {
    onOrbTransitionChange({
      mode: 'boot',
      opacity: orbCornered ? 1 : transitionState.aiOpacity,
      cornered: orbCornered,
    });
  }, [onOrbTransitionChange, orbCornered, transitionState.aiOpacity]);

  useEffect(() => {
    init();
    const client = getClient();
    client.connect();
  }, [getClient, init]);

  useEffect(() => {
    if (state !== 'connected' || bootSent.current) return;
    bootSent.current = true;

    const client = getClient();

    const offStepUpdated = client.on('boot/step.updated', (env: Envelope) => {
      updateCheck(env.payload as BootStepUpdatedPayload);
    });

    const offCompleted = client.on('boot/completed', (env: Envelope) => {
      void (env.payload as BootCompletedPayload);
      setPhase('ready');
    });

    const offFailed = client.on('boot/failed', (env: Envelope) => {
      void (env.payload as BootFailedPayload);
      failBoot();
    });

    client.send('boot/start', {}).then((env) => {
      startBoot(env.payload as BootStartAckPayload);
    }).catch(() => {
      failBoot();
    });

    return () => {
      offStepUpdated();
      offCompleted();
      offFailed();
      bootSent.current = false;
      reset();
    };
  }, [failBoot, getClient, reset, setPhase, startBoot, state, updateCheck]);

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
      await sleep(260);
      if (cancelled) return;
      setLoadingPanelHidden(true);

      await waitFor(() => aiOpacityRef.current >= 0.9 && !orbCorneredRef.current);
      if (cancelled) return;

      await sleep(1000);
      if (cancelled) return;
      setWelcomeText(INTRO_TEXT);
      setWelcomeTone('show');

      await sleep(3250);
      if (cancelled) return;
      setWelcomeTone('hide');

      await sleep(560);
      if (cancelled) return;
      setWelcomeText(WELCOME_TEXT);
      setWelcomeTone('show');

      await sleep(3250);
      if (cancelled) return;
      setWelcomeTone('hide');

      await sleep(560);
      if (cancelled) return;
      setWelcomeText('');

      await waitFor(() => aiOpacityRef.current >= 0.9 && !orbCorneredRef.current);
      if (cancelled) return;
      setBackgroundRevealed(true);

      await sleep(2000);
      if (cancelled) return;

      await sleep(260);
      if (cancelled) return;
      setOrbCornered(true);

      await sleep(800);
      if (cancelled) return;
      onReady();
    })();

    return () => {
      cancelled = true;
    };
  }, [onReady, phase]);

  return (
    <div className="os1-container">
      <div className="boot-screen__backdrop" />
      <div ref={wrapRef} id="wrap" />
      <img
        src={mercuryBackground}
        alt=""
        className={`final-background ${backgroundRevealed ? 'reveal' : ''}`}
      />

      <div
        className="transition-glow-stage"
        aria-hidden="true"
        style={{ opacity: transitionState.glowOpacity }}
      >
        <div className="transition-glow-sphere" />
      </div>

      <div className={`welcome-text ${welcomeTone === 'show' ? 'show' : ''} ${welcomeTone === 'hide' ? 'hide' : ''}`}>
        {welcomeText}
      </div>

      <div className={`loading-panel ${loadingPanelHidden ? 'fade-out' : ''}`}>
        <div className="loading-meta">
          <span id="loadingLabel">{loadingLabel}</span>
          <span id="countdown">{percentageLabel}</span>
        </div>
        <div className="loading-bar-container" aria-label="Loading progress">
          <div
            id="loadingBar"
            className="loading-bar"
            style={{ width: `${clamp(effectiveProgress * 100, 0, 100)}%` }}
          />
        </div>
        {phase === 'failed' && <div className="loading-error">{failureText}</div>}
        {state !== 'connected' && phase !== 'failed' && <div className="loading-hint">Connecting to server…</div>}
      </div>
    </div>
  );
}

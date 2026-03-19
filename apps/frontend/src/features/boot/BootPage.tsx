import { useRef } from 'react';
import mercuryBackground from '../../assets/backgrounds/mercury-background.jpg';
import type { OrbTransitionState } from '../orb/types';
import { BootLoadingPanel } from './components/BootLoadingPanel';
import { useBootVisualSequence } from './hooks/useBootVisualSequence';
import { useOs1Animation } from './hooks/useOs1Animation';

export function BootPage({
  phase,
  progress,
  gatewayState,
  failureText,
  currentStepLabel,
  onReady,
  onOrbTransitionChange,
}: {
  phase: 'checking' | 'ready' | 'failed';
  progress: number;
  gatewayState: string;
  failureText: string;
  currentStepLabel: string;
  onReady: () => void;
  onOrbTransitionChange: (next: Partial<OrbTransitionState>) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const effectiveProgress = phase === 'ready' ? 1 : progress;
  const { transitionState } = useOs1Animation({
    wrapRef,
    transformed: effectiveProgress >= 1 && phase !== 'failed',
  });
  const { loadingPanelHidden, welcomeText, welcomeTone, backgroundRevealed } =
    useBootVisualSequence({
      phase,
      transitionState,
      onReady,
      onOrbTransitionChange,
    });
  const percentageLabel = `${(effectiveProgress * 100).toFixed(1)}%`;
  const loadingLabel =
    phase === 'failed'
      ? currentStepLabel
        ? `${currentStepLabel} failed`
        : 'Failed'
      : effectiveProgress >= 1
        ? 'Ready'
        : currentStepLabel ?? 'Loading';

  return (
    <div className="boot-screen">
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

      <div
        className={`welcome-text ${welcomeTone === 'show' ? 'show' : ''} ${welcomeTone === 'hide' ? 'hide' : ''}`}
      >
        {welcomeText}
      </div>

      <BootLoadingPanel
        hidden={loadingPanelHidden}
        loadingLabel={loadingLabel}
        percentageLabel={percentageLabel}
        progress={effectiveProgress}
        failureText={failureText}
        isFailed={phase === 'failed'}
        isConnected={gatewayState === 'connected'}
      />
    </div>
  );
}

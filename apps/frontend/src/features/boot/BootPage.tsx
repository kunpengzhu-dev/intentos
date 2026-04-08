import { useRef } from 'react';
import type { RefObject } from 'react';
import mercuryBackground from '../../assets/backgrounds/mercury-background.jpg';
import type { OrbTransitionState } from '../orb/types';
import { BootLoadingPanel } from './components/BootLoadingPanel';
import { useBootVisualSequence } from './hooks/useBootVisualSequence';
import { useOs1Animation } from './hooks/useOs1Animation';

export function BootPage({
  phase,
  progress,
  gatewayState,
  deploymentSummary,
  failureText,
  currentStepLabel,
  onReady,
  onOrbTransitionChange,
  transitionHostRef,
}: {
  phase: 'checking' | 'ready' | 'failed';
  progress: number;
  gatewayState: string;
  deploymentSummary: string;
  failureText: string;
  currentStepLabel: string;
  onReady: () => void;
  onOrbTransitionChange: (next: Partial<OrbTransitionState>) => void;
  transitionHostRef: RefObject<HTMLElement | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const effectiveProgress = phase === 'ready' ? 1 : progress;
  const { transitionStateRef } = useOs1Animation({
    wrapRef,
    transitionHostRef,
    transformed: effectiveProgress >= 1 && phase !== 'failed',
  });
  const { loadingPanelHidden, welcomeText, welcomeTone, backgroundRevealed } =
    useBootVisualSequence({
      phase,
      transitionStateRef,
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

      <div className="transition-glow-stage" aria-hidden="true">
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
        deploymentSummary={deploymentSummary}
        failureText={failureText}
        isFailed={phase === 'failed'}
        isConnected={gatewayState === 'connected'}
      />
    </div>
  );
}

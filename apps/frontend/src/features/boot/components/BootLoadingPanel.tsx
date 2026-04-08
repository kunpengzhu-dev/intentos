import { clamp } from '../constants';

export function BootLoadingPanel({
  hidden,
  loadingLabel,
  percentageLabel,
  progress,
  deploymentSummary,
  failureText,
  isFailed,
  isConnected,
}: {
  hidden: boolean;
  loadingLabel: string;
  percentageLabel: string;
  progress: number;
  deploymentSummary: string;
  failureText: string;
  isFailed: boolean;
  isConnected: boolean;
}) {
  return (
    <div className={`loading-panel ${hidden ? 'fade-out' : ''}`}>
      <div className="loading-meta">
        <span id="loadingLabel">{loadingLabel}</span>
        <span id="countdown">{percentageLabel}</span>
      </div>
      <div className="loading-bar-container" aria-label="Loading progress">
        <div
          id="loadingBar"
          className="loading-bar"
          style={{ width: `${clamp(progress * 100, 0, 100)}%` }}
        />
      </div>
      {isFailed && <div className="loading-error">{failureText}</div>}
      {!isFailed && deploymentSummary && <div className="loading-hint">{deploymentSummary}</div>}
      {!isConnected && !isFailed && !deploymentSummary && (
        <div className="loading-hint">Connecting to server...</div>
      )}
    </div>
  );
}

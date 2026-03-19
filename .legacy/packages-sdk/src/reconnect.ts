export type ReconnectConfig = {
  initialDelay: number;
  maxDelay: number;
  factor: number;
  jitter: boolean;
};

export const DEFAULT_RECONNECT: ReconnectConfig = {
  initialDelay: 1000,
  maxDelay: 30000,
  factor: 2,
  jitter: true,
};

export function getReconnectDelay(attempt: number, config: ReconnectConfig = DEFAULT_RECONNECT): number {
  const delay = Math.min(config.initialDelay * Math.pow(config.factor, attempt), config.maxDelay);
  if (config.jitter) {
    return delay * (0.5 + Math.random() * 0.5);
  }
  return delay;
}

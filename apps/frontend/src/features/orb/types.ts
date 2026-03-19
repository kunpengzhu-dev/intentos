export type OrbTransitionState = {
  mode: 'boot' | 'ready';
  opacity: number;
  cornered: boolean;
};

export type OrbToolStatus = 'called' | 'running' | 'completed' | 'error';

export type OrbToolPill = {
  id: string;
  name: string;
  status: OrbToolStatus;
  meta: string;
};

export type OrbChatEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number | null;
  pending: boolean;
  tools: OrbToolPill[];
};

export const initialOrbTransitionState: OrbTransitionState = {
  mode: 'boot',
  opacity: 0,
  cornered: false,
};

export const readyOrbTransitionState: OrbTransitionState = {
  mode: 'ready',
  opacity: 1,
  cornered: true,
};

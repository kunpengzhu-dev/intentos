export type OrbTransitionState = {
  mode: 'boot' | 'ready';
  opacity: number;
  cornered: boolean;
};

export const initialOrbTransitionState: OrbTransitionState = {
  mode: 'boot',
  opacity: 0,
  cornered: false,
};

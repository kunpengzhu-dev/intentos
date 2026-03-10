import { create } from 'zustand';
import { AIOSClient, type ConnectionState } from '@intentos/sdk';
import { getWebSocketUrl } from '../lib/runtimeConfig';

type ConnectionStore = {
  client: AIOSClient | null;
  state: ConnectionState;
  init: () => void;
  getClient: () => AIOSClient;
};

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  client: null,
  state: 'disconnected',
  init: () => {
    if (get().client) return;
    const wsUrl = getWebSocketUrl();
    const client = new AIOSClient({
      url: wsUrl,
      onStateChange: (state) => set({ state }),
      onEnvelope: () => {},
      onError: (err) => console.error('[WS Error]', err),
    });
    set({ client });
  },
  getClient: () => {
    const c = get().client;
    if (!c) throw new Error('Client not initialized');
    return c;
  },
}));

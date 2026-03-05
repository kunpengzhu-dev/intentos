import type { Envelope } from '@intentos/protocol';
import type { WsSession } from './ws/server.js';
import type { AppDatabase } from './db/index.js';

export type AppContext = {
  database: AppDatabase;
  handleMessage: (session: WsSession, envelope: Envelope) => void;
};

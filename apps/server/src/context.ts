import type { Envelope } from '@intentos/protocol';
import type { WsSession } from './ws/server.js';
import type { AppDatabase } from './db/index.js';
import type { BootService } from './boot/service.js';
import type { AgentAdapter } from './agent/index.js';

export type AppContext = {
  database: AppDatabase;
  bootService: BootService;
  agentAdapter: AgentAdapter;
  handleMessage: (session: WsSession, envelope: Envelope) => void;
};

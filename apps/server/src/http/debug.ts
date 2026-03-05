import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/index.js';

export function registerDebugRoutes(app: FastifyInstance, database: AppDatabase) {
  app.get('/debug/intents', async () => {
    return database.sqlite.prepare('SELECT * FROM intents').all();
  });

  app.get<{ Params: { runId: string } }>('/debug/runs/:runId/events', async (req) => {
    const { runId } = req.params;
    return database.sqlite
      .prepare('SELECT * FROM events WHERE stream_id = ? ORDER BY server_seq ASC')
      .all(`run:${runId}`);
  });
}

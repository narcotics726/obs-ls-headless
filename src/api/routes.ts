import { FastifyInstance } from 'fastify';
import { SyncService } from '../services/sync-service.js';
import { AppConfig } from '../types/index.js';

export async function registerRoutes(
  app: FastifyInstance,
  syncService: SyncService,
  config: AppConfig
) {
  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Get sync status
  app.get('/sync/status', async () => {
    return syncService.getStatus();
  });

  // Trigger manual sync
  app.post('/sync/trigger', async () => {
    await syncService.sync();
    return { message: 'Sync triggered successfully' };
  });

  // Get all notes
  app.get('/notes', async () => {
    return syncService.getNotes();
  });

  // Get specific note
  app.get<{ Params: { id: string } }>('/notes/:id', async (request, reply) => {
    const note = await syncService.getNote(request.params.id);
    if (!note) {
      reply.code(404);
      return { error: 'Note not found' };
    }
    return note;
  });

  // Search notes
  app.get<{ Querystring: { q: string } }>('/notes/search', async (request, reply) => {
    const query = request.query.q;
    if (!query) {
      reply.code(400);
      return { error: 'Query parameter "q" is required' };
    }
    return syncService.searchNotes(query);
  });

  // Get current configuration (excluding sensitive data)
  app.get('/config', async () => {
    return {
      sync: config.sync,
      server: {
        port: config.server.port,
        host: config.server.host,
      },
      couchdb: {
        url: config.couchdb.url,
        database: config.couchdb.database,
      },
    };
  });

  // Update sync configuration
  app.put<{ Body: { interval?: number; autoSyncEnabled?: boolean } }>(
    '/config/sync',
    async (request) => {
      const { interval, autoSyncEnabled } = request.body;

      if (interval !== undefined) {
        config.sync.interval = interval;
        syncService.stopAutoSync();
        if (config.sync.autoSyncEnabled) {
          syncService.startAutoSync(interval);
        }
      }

      if (autoSyncEnabled !== undefined) {
        config.sync.autoSyncEnabled = autoSyncEnabled;
        if (autoSyncEnabled) {
          syncService.startAutoSync(config.sync.interval);
        } else {
          syncService.stopAutoSync();
        }
      }

      return { message: 'Configuration updated', sync: config.sync };
    }
  );
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFile } from 'node:fs/promises';
import { loadConfig } from './utils/config.js';
import { CouchDBClient } from './core/couchdb-client.js';
import { ChunkAssembler } from './core/chunk-assembler.js';
import { SyncService } from './services/sync-service.js';
import { JsonFileStorage } from './storage/json-file-storage.js';
import { registerRoutes } from './api/routes.js';
import { DiskNoteRepository } from './repositories/disk-note-repository.js';
import { PluginManager } from './plugins/plugin-manager.js';
import type { NotifyPayload, PluginConfig } from './plugins/types.js';
import type { LiveSyncEvent } from './types/index.js';
import { createEventBus } from './core/event-bus.js';
import logger from './utils/logger.js';

async function loadPluginConfigs(configPath?: string): Promise<PluginConfig[]> {
  if (!configPath) {
    return [];
  }

  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed?.plugins)) {
      return parsed.plugins;
    }
    logger.warn({ configPath }, 'Plugin config must be an array or { plugins: [] }');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      logger.info({ configPath }, 'Plugin config not found, skipping plugin startup');
    } else {
      logger.error({ error, configPath }, 'Failed to load plugin config');
    }
  }

  return [];
}

function toNotifyPayload(event: LiveSyncEvent): NotifyPayload {
  return {
    eventType: event.type,
    eventId: `${event.type}-${event.timestamp.getTime()}`,
    timestamp: event.timestamp.getTime(),
    payload: {
      payload: event.payload ?? {},
      metadata: event.metadata ?? {},
      source: event.source,
    },
  };
}

async function main() {
  // Load configuration
  const config = loadConfig();

  // Initialize CouchDB client
  const couchdbClient = new CouchDBClient(config.couchdb);

  // Test connection
  const connected = await couchdbClient.testConnection();
  if (!connected) {
    logger.error('Failed to connect to CouchDB. Exiting...');
    process.exit(1);
  }

  // Initialize state storage
  const stateStorage = new JsonFileStorage();
  await stateStorage.initialize();

  // Initialize sync service
  const assembler = new ChunkAssembler(couchdbClient, config.couchdb.passphrase);
  const noteRepository = new DiskNoteRepository(config.vaultPath);
  logger.info({ vaultPath: config.vaultPath }, 'Initialized disk note repository');
  const eventBus = createEventBus();
  eventBus.subscribe('*', (event) => {
    logger.debug(
      { eventType: event.type, payload: event.payload, metadata: event.metadata, source: event.source },
      'Event emitted'
    );
  });

  const pluginConfigs = await loadPluginConfigs(config.plugins?.configPath);
  const pluginManager = pluginConfigs.length > 0 ? new PluginManager(pluginConfigs) : null;

  if (pluginManager) {
    pluginManager.onPluginNotification((plugin, method, params) => {
      logger.info({ plugin, method, params }, 'Plugin notification received');
    });

    eventBus.subscribe('*', async (event) => {
      const notify = toNotifyPayload(event);
      try {
        await pluginManager.broadcast(notify);
      } catch (error) {
        logger.error({ error, eventType: event.type }, 'Plugin broadcast failed');
      }
    });

    await pluginManager.startAll();
    logger.info({ plugins: pluginConfigs.length }, 'Plugin manager started');
  } else {
    logger.info('No plugins configured; plugin manager not started');
  }

  const syncService = new SyncService(
    couchdbClient,
    stateStorage,
    assembler,
    noteRepository,
    eventBus
  );
  await syncService.initialize();

  // Start auto-sync if enabled
  if (config.sync.autoSyncEnabled) {
    syncService.startAutoSync(config.sync.interval);
  }

  // Initialize Fastify server
  const app = Fastify({
    logger: false, // Using pino logger directly
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
  });

  // Register routes
  await registerRoutes(app, syncService, config);

  // Start server
  try {
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });
    logger.info(
      { port: config.server.port, host: config.server.host },
      'Server started successfully'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    syncService.stopAutoSync();
    await app.close();
    if (pluginManager) {
      await pluginManager.stopAll();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});

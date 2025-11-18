import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './utils/config.js';
import { CouchDBClient } from './core/couchdb-client.js';
import { ChunkAssembler } from './core/chunk-assembler.js';
import { SyncService } from './services/sync-service.js';
import { JsonFileStorage } from './storage/json-file-storage.js';
import { registerRoutes } from './api/routes.js';
import logger from './utils/logger.js';
import { DiskNoteRepository } from './repositories/disk-note-repository.js';
import { createEventBus } from './core/event-bus.js';

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
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});

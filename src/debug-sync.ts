#!/usr/bin/env tsx
/**
 * Debug script for testing single sync operation
 * Usage: npm run debug-sync
 * Or: tsx src/debug-sync.ts
 */

import { loadConfig } from './utils/config.js';
import { CouchDBClient } from './core/couchdb-client.js';
import { SyncService } from './services/sync-service.js';
import { ChunkAssembler } from './core/chunk-assembler.js';
import { JsonFileStorage } from './storage/json-file-storage.js';
import logger from './utils/logger.js';
import { MemoryNoteRepository } from './repositories/memory-note-repository.js';

logger.level = 'debug';

async function debugSync() {
  logger.info('=== Starting Debug Sync ===');

  try {
    // Load configuration
    const config = loadConfig();
    logger.info({
      url: config.couchdb.url,
      database: config.couchdb.database,
      hasPassphrase: !!config.couchdb.passphrase,
    }, 'Configuration loaded');

    // Initialize CouchDB client
    const couchdbClient = new CouchDBClient(config.couchdb);

    // Test connection
    logger.info('Testing CouchDB connection...');
    const connected = await couchdbClient.testConnection();
    if (!connected) {
      logger.error('Failed to connect to CouchDB');
      process.exit(1);
    }

    // Get database info
    const dbInfo = await couchdbClient.getDatabaseInfo();
    logger.info({
      docCount: dbInfo.doc_count,
      updateSeq: dbInfo.update_seq,
      dbName: dbInfo.db_name,
    }, 'Database info');

    // Debug: Check milestone document
    logger.info('Checking milestone document...');
    const milestone = await couchdbClient.getDocument('_local/obsydian_livesync_milestone');
    if (milestone) {
      logger.info({
        milestoneKeys: Object.keys(milestone),
        hasPbkdf2Salt: 'pbkdf2Salt' in milestone,
        milestonePreview: JSON.stringify(milestone).substring(0, 500)
      }, 'Milestone document found');
    } else {
      logger.warn('Milestone document not found');
    }

    // Initialize state storage
    const stateStorage = new JsonFileStorage();
    await stateStorage.initialize();

    // Initialize sync service
    const assembler = new ChunkAssembler(couchdbClient, config.couchdb.passphrase);
    const noteRepository = new MemoryNoteRepository();
    const syncService = new SyncService(
      couchdbClient,
      stateStorage,
      assembler,
      noteRepository
    );
    await syncService.initialize();

    // Perform sync
    logger.info('Starting sync operation...');
    await syncService.sync();

    // Get sync status
    const status = syncService.getStatus();
    logger.info({
      lastSyncTime: status.lastSyncTime,
      lastSyncSuccess: status.lastSyncSuccess,
      documentsCount: status.documentsCount,
      error: status.error,
    }, 'Sync status');

    // Get notes
    const notes = await syncService.getNotes();
    logger.info({ notesCount: notes.length }, 'Notes retrieved');

    // Display sample notes
    if (notes.length > 0) {
      logger.info('=== Sample Notes (First 5) ===');
      notes.slice(0, 5).forEach((note, index) => {
        logger.info({
          index: index + 1,
          id: note.id,
          path: note.path,
          size: note.size,
          contentPreview: note.content.substring(0, 100) + (note.content.length > 100 ? '...' : ''),
          mtime: note.mtime,
        }, 'Note');
      });

      if (notes.length > 5) {
        logger.info(`... and ${notes.length - 5} more notes`);
      }

      // Display random note with random paragraphs
      logger.info('\n=== Random Note Content Sample ===');
      const randomNote = notes[Math.floor(Math.random() * notes.length)];

      logger.info({
        path: randomNote.path,
        id: randomNote.id,
        size: randomNote.size,
        totalLength: randomNote.content.length,
        contentType: typeof randomNote.content,
        contentIsEmpty: randomNote.content === '',
        contentFirstBytes: randomNote.content.substring(0, 50),
      }, 'Selected random note');

      // If content is empty, try to fetch the raw document to debug
      if (randomNote.content.length === 0) {
        logger.warn('Content is empty! Fetching raw document for debugging...');
        const rawDoc = await couchdbClient.getDocument(randomNote.id);
        if (rawDoc) {
          logger.info({
            docId: rawDoc._id,
            docType: rawDoc.type,
            hasData: !!rawDoc.data,
            dataLength: rawDoc.data?.length || 0,
            hasChildren: !!rawDoc.children,
            childrenCount: rawDoc.children?.length || 0,
            hasEden: !!rawDoc.eden,
            edenCount: rawDoc.eden ? Object.keys(rawDoc.eden).length : 0,
          }, 'Raw document structure');

          if (rawDoc.data) {
            logger.info(`Raw data (first 100 chars): ${rawDoc.data.substring(0, 100)}`);
          }
          if (rawDoc.children && rawDoc.children.length > 0) {
            logger.info(`Children IDs: ${rawDoc.children.slice(0, 3).join(', ')}${rawDoc.children.length > 3 ? '...' : ''}`);

            // Try to fetch the first chunk to see what's in it
            logger.info('Attempting to fetch first chunk...');
            const firstChunkId = rawDoc.children[0];
            const firstChunk = await couchdbClient.getDocument(firstChunkId);
            if (firstChunk) {
              logger.info({
                chunkId: firstChunkId,
                chunkType: firstChunk.type,
                hasData: !!firstChunk.data,
                dataLength: firstChunk.data?.length || 0,
                dataPreview: firstChunk.data?.substring(0, 100),
                startsWithPrefix: firstChunk.data?.substring(0, 10),
              }, 'First chunk details');

              // Check if it's base64
              try {
                const decoded = Buffer.from(firstChunk.data || '', 'base64');
                logger.info({
                  decodedLength: decoded.length,
                  decodedPreview: decoded.toString('utf-8', 0, Math.min(50, decoded.length)),
                }, 'Base64 decoded preview');
              } catch (e: any) {
                logger.error(`Failed to decode base64: ${e.message}`);
              }
            } else {
              logger.error(`Chunk ${firstChunkId} not found!`);
            }
          }
        }
      }

      // Split content into paragraphs (by double newline or single newline)
      const paragraphs = randomNote.content
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

      logger.info(`Total paragraphs: ${paragraphs.length}`);

      if (paragraphs.length > 0) {
        // Show up to 3 random paragraphs
        const numParagraphsToShow = Math.min(3, paragraphs.length);
        const selectedIndices = new Set<number>();

        while (selectedIndices.size < numParagraphsToShow) {
          selectedIndices.add(Math.floor(Math.random() * paragraphs.length));
        }

        const sortedIndices = Array.from(selectedIndices).sort((a, b) => a - b);

        logger.info('\n--- Random Paragraphs ---');
        sortedIndices.forEach((idx) => {
          const paragraph = paragraphs[idx];
          const preview = paragraph.length > 200
            ? paragraph.substring(0, 200) + '...'
            : paragraph;

          logger.info(`\n[Paragraph ${idx + 1}/${paragraphs.length}]`);
          logger.info(preview);
        });
        logger.info('--- End of Random Paragraphs ---\n');
      } else {
        logger.info('Note has no paragraphs (might be empty or single line)');
        logger.info(`Full content: ${randomNote.content.substring(0, 500)}${randomNote.content.length > 500 ? '...' : ''}`);
      }
    } else {
      logger.warn('No notes found. Check if:');
      logger.warn('1. CouchDB database contains documents with type="newnote" or "plain"');
      logger.warn('2. Documents are not marked as deleted');
      logger.warn('3. Passphrase is correct (if encryption is enabled)');
      logger.warn('4. Documents have valid path and data/children fields');
    }

    logger.info('\n=== Debug Sync Completed Successfully ===');
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Debug sync failed');
    process.exit(1);
  }
}

// Run debug sync
debugSync();

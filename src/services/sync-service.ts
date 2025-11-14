import { CouchDBClient } from '../core/couchdb-client.js';
import type { IDocumentAssembler, IStateStorage } from '../core/interfaces.js';
import { SyncStatus, LiveSyncDocument, Note } from '../types/index.js';
import type { NoteRepository } from '../repositories/note-repository.js';
import logger from '../utils/logger.js';

/**
 * Service for managing synchronization with CouchDB
 * Uses IDocumentAssembler for flexible document assembly strategies
 */
export class SyncService {
  private client: CouchDBClient;
  private assembler: IDocumentAssembler;
  private stateStorage: IStateStorage;
  private status: SyncStatus;
  private syncInterval?: NodeJS.Timeout;
  private repository: NoteRepository;

  constructor(
    client: CouchDBClient,
    stateStorage: IStateStorage,
    assembler: IDocumentAssembler,
    repository: NoteRepository
  ) {
    this.client = client;
    this.stateStorage = stateStorage;
    this.assembler = assembler;
    this.repository = repository;
    this.status = {
      isRunning: false,
      lastSyncTime: null,
      lastSyncSuccess: false,
      documentsCount: 0,
    };
  }

  /**
   * Initialize the sync service by loading persisted state
   * Should be called after construction
   */
  async initialize(): Promise<void> {
    const state = await this.stateStorage.getState();
    if (state.lastSeq) {
      this.status.lastSeq = state.lastSeq;
      logger.info({ lastSeq: state.lastSeq }, 'Loaded persisted sync state');
    } else {
      logger.info('No persisted sync state found, will perform full sync');
    }
  }

  /**
   * Start automatic synchronization
   */
  startAutoSync(intervalMs: number): void {
    if (this.syncInterval) {
      logger.warn('Auto-sync already running');
      return;
    }

    logger.info({ intervalMs }, 'Starting auto-sync');
    this.syncInterval = setInterval(() => {
      this.sync().catch((error) => {
        logger.error({ error }, 'Auto-sync failed');
      });
    }, intervalMs);

    // Run initial sync
    this.sync().catch((error) => {
      logger.error({ error }, 'Initial sync failed');
    });
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
      logger.info('Auto-sync stopped');
    }
  }

  /**
   * Perform a single synchronization
   * Automatically chooses between full sync and incremental sync
   */
  async sync(): Promise<void> {
    if (this.status.isRunning) {
      logger.warn('Sync already in progress');
      return;
    }

    // Choose sync strategy based on lastSeq
    if (!this.status.lastSeq) {
      logger.info('No lastSeq found, performing full sync');
      await this.fullSync();
    } else {
      logger.info({ lastSeq: this.status.lastSeq }, 'Performing incremental sync');
      await this.incrementalSync();
    }
  }

  /**
   * Perform a full synchronization (fetch all documents)
   */
  private async fullSync(): Promise<void> {
    if (this.status.isRunning) {
      logger.warn('Sync already in progress');
      return;
    }

    this.status.isRunning = true;
    logger.info('Starting full sync');

    try {
      const documents = await this.client.getAllDocuments();
      const result = await this.processDocuments(documents);

      // Get current database update_seq for next incremental sync
      const dbInfo = await this.client.getDatabaseInfo();
      this.status.lastSeq = String(dbInfo.update_seq);

      const notesCount = await this.repository.count();

      this.status.lastSyncTime = new Date();
      this.status.lastSyncSuccess = true;
      this.status.documentsCount = result.processedCount;
      delete this.status.error;

      // Persist state for incremental sync
      await this.stateStorage.updateState({
        lastSeq: this.status.lastSeq,
        lastSyncTime: new Date().toISOString(),
      });

      logger.info(
        { count: documents.length, processed: result.processedCount, notesCount, lastSeq: this.status.lastSeq },
        'Full sync completed successfully'
      );
    } catch (error: any) {
      this.status.lastSyncSuccess = false;
      this.status.error = error.message;
      logger.error({ error }, 'Full sync failed');
      throw error;
    } finally {
      this.status.isRunning = false;
    }
  }

  /**
   * Perform an incremental synchronization (fetch only changes since lastSeq)
   */
  private async incrementalSync(): Promise<void> {
    if (this.status.isRunning) {
      logger.warn('Sync already in progress');
      return;
    }

    this.status.isRunning = true;
    logger.info({ lastSeq: this.status.lastSeq }, 'Starting incremental sync');

    try {
      // Get changes since last sync
      const changes = await this.client.getChanges(this.status.lastSeq);

      if (!changes.results || changes.results.length === 0) {
        logger.info('No changes detected');
        this.status.lastSyncTime = new Date();
        this.status.lastSyncSuccess = true;
        this.status.documentsCount = 0;
        delete this.status.error;
        return;
      }

      logger.info({ changesCount: changes.results.length }, 'Processing changes');

      // Separate changed documents and deleted documents
      const changedDocs: LiveSyncDocument[] = [];
      const deletedIds: string[] = [];

      for (const change of changes.results) {
        // Skip internal documents (containing ':')
        if (change.id.includes(':')) {
          continue;
        }

        // Type assertion: CouchDB changes API with include_docs=true returns a 'doc' field
        // containing the full document content. This is confirmed in the official CouchDB docs:
        // https://docs.couchdb.org/en/stable/api/database/changes.html#get--db-_changes
        // Quote: "Include the associated document with each result."
        // However, Nano's TypeScript types don't include this field, so we use 'as any'.
        const changeWithDoc = change as any;

        // Handle deleted documents
        if (change.deleted || changeWithDoc.doc?.deleted || changeWithDoc.doc?._deleted) {
          deletedIds.push(change.id);
          logger.debug({ id: change.id }, 'Document marked for deletion');
          continue;
        }

        // Collect changed documents
        if (changeWithDoc.doc) {
          changedDocs.push(changeWithDoc.doc as LiveSyncDocument);
        }
      }

      // Process changed documents
      let processedChanged = 0;
      if (changedDocs.length > 0) {
        const result = await this.processDocuments(changedDocs);
        processedChanged = result.processedCount;
        logger.info({ count: processedChanged }, 'Processed changed documents');
      }

      // Remove deleted notes from memory
      if (deletedIds.length > 0) {
        await this.repository.deleteMany(deletedIds);
        logger.info({ count: deletedIds.length }, 'Removed deleted documents');
      }

      // Update lastSeq to the latest
      this.status.lastSeq = String(changes.last_seq);
      this.status.lastSyncTime = new Date();
      this.status.lastSyncSuccess = true;
      this.status.documentsCount = processedChanged;
      delete this.status.error;

      // Persist state for next incremental sync
      await this.stateStorage.updateState({
        lastSeq: this.status.lastSeq,
        lastSyncTime: new Date().toISOString(),
      });

      const notesCount = await this.repository.count();

      logger.info(
        {
          changedCount: processedChanged,
          deletedCount: deletedIds.length,
          notesCount,
          lastSeq: this.status.lastSeq,
        },
        'Incremental sync completed successfully'
      );
    } catch (error: any) {
      this.status.lastSyncSuccess = false;
      this.status.error = error.message;
      logger.error({ error }, 'Incremental sync failed');
      throw error;
    } finally {
      this.status.isRunning = false;
    }
  }

  /**
   * Process LiveSync documents and convert to notes
   *
   * Filtering logic based on livesync-bridge:
   * 1. Skip chunk documents (h:, h:+) - these are assembled by ChunkAssembler
   * 2. Skip other internal documents (ps:, ix:, etc.)
   * 3. Skip deleted documents
   * 4. Process metadata documents (type="newnote" or "plain")
   */
  private async processDocuments(
    documents: LiveSyncDocument[]
  ): Promise<{ processedCount: number; skippedCount: number; errorCount: number }> {
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const notesToSave: Note[] = [];

    for (const doc of documents) {
      logger.debug({ docId: doc._id, docType: doc.type, docPath: doc.path }, 'Processing document');

      // Skip chunk documents - these are internal storage
      if (doc._id.startsWith('h:') || doc._id.startsWith('h:+')) {
        logger.debug({ docId: doc._id }, 'Skipping chunk document');
        skippedCount++;
        continue;
      }

      // Skip other internal documents (ps:, ix:, leaf:, etc.)
      if (doc._id.includes(':')) {
        logger.debug({ docId: doc._id }, 'Skipping internal document (contains ":")');
        skippedCount++;
        continue;
      }

      // Skip deleted documents
      if (doc.deleted || doc._deleted) {
        logger.debug({ docId: doc._id }, 'Skipping deleted document');
        skippedCount++;
        continue;
      }

      // Check for required fields
      if (!doc.path) {
        logger.warn({ docId: doc._id }, 'Document missing path field');
        skippedCount++;
        continue;
      }

      // Check document type
      if (!doc.type) {
        logger.warn({ docId: doc._id, path: doc.path }, 'Document missing type field');
        skippedCount++;
        continue;
      }

      if (doc.type !== 'newnote' && doc.type !== 'plain') {
        logger.debug({ docId: doc._id, path: doc.path, type: doc.type }, 'Skipping non-note document type');
        skippedCount++;
        continue;
      }

      try {
        // Use assembler to get document content
        // This handles direct data, children chunks, and eden cache
        const content = await this.assembler.assembleDocument(doc);

        if (content === null) {
          logger.warn({ docId: doc._id, path: doc.path }, 'Failed to assemble document content');
          errorCount++;
          continue;
        }

        const note: Note = {
          id: doc._id,
          path: doc.path,
          content,
          mtime: doc.mtime ? new Date(doc.mtime) : new Date(),
          ctime: doc.ctime ? new Date(doc.ctime) : new Date(),
          size: doc.size || 0,
        };

        notesToSave.push(note);
        processedCount++;
        logger.debug({ docId: doc._id, path: doc.path, contentLength: content.length }, 'Note processed successfully');
      } catch (error: any) {
        errorCount++;
        logger.error({ error: error.message, docId: doc._id, path: doc.path }, 'Failed to process document');
      }
    }

    if (notesToSave.length > 0) {
      await this.repository.saveMany(notesToSave);
    }

    logger.info({
      total: documents.length,
      processed: processedCount,
      skipped: skippedCount,
      errors: errorCount
    }, 'Document processing summary');

    return { processedCount, skippedCount, errorCount };
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Get all synchronized notes
   */
  async getNotes(): Promise<Note[]> {
    return this.repository.getAll();
  }

  /**
   * Get a specific note by ID
   */
  async getNote(id: string): Promise<Note | undefined> {
    return this.repository.get(id);
  }

  /**
   * Search notes by path or content
   */
  async searchNotes(query: string): Promise<Note[]> {
    return this.repository.search(query);
  }
}

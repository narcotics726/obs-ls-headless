import Nano from 'nano';
import { CouchDBConfig, LiveSyncDocument } from '../types/index.js';
import { IDocumentStorage } from './interfaces.js';
import logger from '../utils/logger.js';

/**
 * CouchDB client for interacting with Obsidian LiveSync database
 * Implements IDocumentStorage interface for abstraction
 */
export class CouchDBClient implements IDocumentStorage {
  private nano: Nano.ServerScope;
  private db: Nano.DocumentScope<LiveSyncDocument>;

  constructor(config: CouchDBConfig) {
    const auth = `${config.username}:${config.password}`;
    const url = config.url.replace('://', `://${auth}@`);

    this.nano = Nano(url);
    this.db = this.nano.db.use<LiveSyncDocument>(config.database);
  }

  /**
   * Test connection to CouchDB
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.nano.db.list();
      logger.info('CouchDB connection successful');
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to connect to CouchDB');
      return false;
    }
  }

  /**
   * Get all documents from the database
   */
  async getAllDocuments(): Promise<LiveSyncDocument[]> {
    try {
      const result = await this.db.list({ include_docs: true });
      return result.rows
        .filter((row) => row.doc && !row.id.startsWith('_design'))
        .map((row) => row.doc as LiveSyncDocument);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch documents');
      throw error;
    }
  }

  /**
   * Get a specific document by ID
   */
  async getDocument(id: string): Promise<LiveSyncDocument | null> {
    try {
      const doc = await this.db.get(id);
      return doc;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      logger.error({ error, id }, 'Failed to fetch document');
      throw error;
    }
  }

  /**
   * Get changes feed for continuous sync
   */
  async getChanges(since: string = 'now'): Promise<Nano.DatabaseChangesResponse> {
    try {
      return await this.db.changes({ since, include_docs: true });
    } catch (error) {
      logger.error({ error }, 'Failed to get changes feed');
      throw error;
    }
  }

  /**
   * Get multiple documents by IDs (bulk fetch)
   * This is more efficient than fetching documents one by one
   */
  async getDocuments(ids: string[]): Promise<Map<string, LiveSyncDocument>> {
    if (ids.length === 0) {
      return new Map();
    }

    try {
      // Use CouchDB's bulk fetch API with include_docs
      const result = await this.db.fetch(
        { keys: ids },
        { include_docs: true }
      );

      const docs = new Map<string, LiveSyncDocument>();
      for (const row of result.rows) {
        // Check if row has doc and no error
        if ('doc' in row && row.doc) {
          docs.set(row.id, row.doc as LiveSyncDocument);
        } else if ('error' in row) {
          logger.debug({ id: row.key, error: row.error }, 'Document not found in bulk fetch');
        }
      }

      logger.debug({ requested: ids.length, found: docs.size }, 'Bulk fetch completed');
      return docs;
    } catch (error) {
      logger.error({ error, idsCount: ids.length }, 'Failed to bulk fetch documents');
      throw error;
    }
  }

  /**
   * Get database info
   */
  async getDatabaseInfo(): Promise<Nano.DatabaseGetResponse> {
    try {
      return await this.db.info();
    } catch (error) {
      logger.error({ error }, 'Failed to get database info');
      throw error;
    }
  }
}

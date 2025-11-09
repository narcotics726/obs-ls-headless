/**
 * ChunkAssembler - Assembles LiveSync documents from chunks
 *
 * LiveSync stores large files as multiple chunks for efficiency.
 * This class handles the assembly of these chunks into complete documents.
 *
 * Document storage formats:
 * 1. Direct data: Small files or legacy format with 'data' field
 * 2. Children chunks: Large files split into chunks referenced by 'children' array
 * 3. Eden cache: Optimized cache containing recent chunks
 */

import { IDocumentAssembler, IDocumentStorage, AssemblyStats } from './interfaces.js';
import { LiveSyncDocument } from '../types/index.js';
import { LiveSyncCrypto } from '../utils/livesync-crypto.js';
import logger from '../utils/logger.js';

export class ChunkAssembler implements IDocumentAssembler {
  private crypto?: LiveSyncCrypto;

  constructor(
    private storage: IDocumentStorage,
    passphrase?: string
  ) {
    if (passphrase) {
      this.crypto = new LiveSyncCrypto(storage, passphrase);
    }
  }

  /**
   * Assemble a complete document from its metadata and chunks
   *
   * Tries multiple strategies in order:
   * 1. Direct data field (for small files or legacy format)
   * 2. Eden cache (optimized recent chunks)
   * 3. Children chunks (standard chunked storage)
   */
  async assembleDocument(doc: LiveSyncDocument): Promise<string | null> {
    logger.debug({ docId: doc._id, type: doc.type }, 'Assembling document');

    try {
      // Strategy 1: Direct data field
      if (doc.data) {
        logger.debug({ docId: doc._id }, 'Using direct data field');
        if (this.crypto) {
          return await this.crypto.decrypt(doc.data);
        } else {
          // No encryption, decode base64
          return Buffer.from(doc.data, 'base64').toString('utf-8');
        }
      }

      // Strategy 2: Eden cache (if available)
      if (doc.eden && Object.keys(doc.eden).length > 0) {
        logger.debug({ docId: doc._id, edenChunks: Object.keys(doc.eden).length }, 'Using Eden cache');
        return await this.assembleFromEden(doc.eden);
      }

      // Strategy 3: Children chunks
      if (doc.children && doc.children.length > 0) {
        logger.debug({ docId: doc._id, childrenCount: doc.children.length }, 'Using children chunks');
        return await this.assembleFromChildren(doc.children);
      }

      // No data source available
      logger.warn({ docId: doc._id }, 'Document has no data, children, or eden');
      return null;
    } catch (error: any) {
      logger.error({ error: error.message, docId: doc._id }, 'Failed to assemble document');
      throw error;
    }
  }

  /**
   * Assemble document from children chunks
   *
   * Children are chunk IDs (typically starting with 'h:' or 'h:+')
   * that need to be fetched and combined in order.
   */
  private async assembleFromChildren(children: string[]): Promise<string> {
    const stats: AssemblyStats = {
      totalChunks: children.length,
      successfulChunks: 0,
      failedChunks: 0,
      usedEden: false,
    };

    // Bulk fetch all chunks for efficiency
    const chunkDocs = await this.storage.getDocuments(children);

    const chunks: string[] = [];

    for (const chunkId of children) {
      const chunk = chunkDocs.get(chunkId);

      if (!chunk) {
        stats.failedChunks++;
        logger.error({ chunkId }, 'Chunk not found');
        throw new Error(`Chunk not found: ${chunkId}`);
      }

      if (chunk.type !== 'leaf') {
        logger.warn({ chunkId, type: chunk.type }, 'Unexpected chunk type (expected "leaf")');
      }

      if (!chunk.data) {
        stats.failedChunks++;
        logger.error({ chunkId }, 'Chunk has no data field');
        throw new Error(`Chunk has no data: ${chunkId}`);
      }

      // Decrypt chunk data (may be encrypted)
      let decryptedChunk: string;
      if (this.crypto) {
        decryptedChunk = await this.crypto.decrypt(chunk.data);
      } else {
        // No encryption, decode base64
        decryptedChunk = Buffer.from(chunk.data, 'base64').toString('utf-8');
      }
      chunks.push(decryptedChunk);
      stats.successfulChunks++;
    }

    logger.debug(stats, 'Chunk assembly completed');

    // Combine all chunks in order
    return chunks.join('');
  }

  /**
   * Assemble document from Eden cache
   *
   * Eden is an optimization that stores recent chunks directly in the metadata document.
   * Chunks are stored with an epoch number for ordering.
   */
  private async assembleFromEden(
    eden: Record<string, { data: string; epoch: number }>
  ): Promise<string> {
    const stats: AssemblyStats = {
      totalChunks: Object.keys(eden).length,
      successfulChunks: 0,
      failedChunks: 0,
      usedEden: true,
    };

    try {
      // Sort chunks by epoch (order matters)
      const sortedEntries = Object.entries(eden)
        .sort(([, a], [, b]) => a.epoch - b.epoch);

      const decryptedChunks: string[] = [];

      for (const [chunkId, chunk] of sortedEntries) {
        try {
          let decrypted: string;
          if (this.crypto) {
            decrypted = await this.crypto.decrypt(chunk.data);
          } else {
            // No encryption, decode base64
            decrypted = Buffer.from(chunk.data, 'base64').toString('utf-8');
          }
          decryptedChunks.push(decrypted);
          stats.successfulChunks++;
        } catch (error: any) {
          stats.failedChunks++;
          logger.error({ error: error.message, chunkId }, 'Failed to decrypt Eden chunk');
          throw error;
        }
      }

      logger.debug(stats, 'Eden assembly completed');

      return decryptedChunks.join('');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to assemble from Eden');
      throw error;
    }
  }

  /**
   * Get assembly statistics for the last operation
   * (Could be extended to track stats per document)
   */
  getStats(): AssemblyStats {
    return {
      totalChunks: 0,
      successfulChunks: 0,
      failedChunks: 0,
      usedEden: false,
    };
  }
}

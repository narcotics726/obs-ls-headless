/**
 * Core interfaces for document assembly and storage
 * These interfaces allow for different implementations (e.g., custom vs livesync-commonlib)
 */

import { LiveSyncDocument } from '../types/index.js';

/**
 * Interface for assembling document content from CouchDB storage
 *
 * LiveSync stores documents in chunks for large files.
 * This interface abstracts the assembly logic to allow different implementations.
 */
export interface IDocumentAssembler {
  /**
   * Assemble a complete document from its metadata and chunks
   *
   * @param doc - The metadata document (with children, data, or eden fields)
   * @returns The assembled and decrypted content, or null if assembly fails
   */
  assembleDocument(doc: LiveSyncDocument): Promise<string | null>;
}

/**
 * Interface for CouchDB document storage operations
 *
 * This abstracts the CouchDB client to allow for different implementations
 * or mocking in tests.
 */
export interface IDocumentStorage {
  /**
   * Get a single document by ID
   */
  getDocument(id: string): Promise<LiveSyncDocument | null>;

  /**
   * Get multiple documents by IDs (bulk fetch)
   */
  getDocuments(ids: string[]): Promise<Map<string, LiveSyncDocument>>;

  /**
   * Get all documents from the database
   */
  getAllDocuments(): Promise<LiveSyncDocument[]>;
}

/**
 * Result of document assembly with metadata
 */
export interface AssembledDocument {
  id: string;
  path: string;
  content: string;
  mtime: Date;
  ctime: Date;
  size: number;
  assemblyMethod: 'direct' | 'children' | 'eden';
}

/**
 * Statistics about document assembly process
 */
export interface AssemblyStats {
  totalChunks: number;
  successfulChunks: number;
  failedChunks: number;
  usedEden: boolean;
}

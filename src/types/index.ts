/**
 * Core type definitions for obs-ls-headless
 */

export interface CouchDBConfig {
  url: string;
  username: string;
  password: string;
  database: string;
  passphrase?: string; // Encryption passphrase for LiveSync
}

export interface SyncConfig {
  interval: number;
  autoSyncEnabled: boolean;
}

export interface AppConfig {
  couchdb: CouchDBConfig;
  sync: SyncConfig;
  server: {
    port: number;
    host: string;
  };
  vaultPath: string;
}

export interface SyncStatus {
  isRunning: boolean;
  lastSyncTime: Date | null;
  lastSyncSuccess: boolean;
  documentsCount: number;
  lastSeq?: string;  // CouchDB sequence number for incremental sync
  error?: string;
}

/**
 * Obsidian LiveSync document structure
 * Based on obsidian-livesync's CouchDB document format
 *
 * LiveSync uses different document types:
 * - Documents with _id containing ":" are internal (h:, ps:, ix:, leaf:, etc.)
 * - Documents with type "plain" are plain text files
 * - Documents with type "newnote" are binary/markdown files (base64 encoded)
 * - Documents with type "leaf" are chunk documents
 *
 * Storage strategies:
 * 1. Direct data: Small files stored in 'data' field
 * 2. Chunked: Large files split into chunks referenced by 'children' array
 * 3. Eden cache: Recent chunks cached in 'eden' field for optimization
 */
export interface LiveSyncDocument {
  _id: string;
  _rev?: string;
  type?: 'newnote' | 'plain' | 'leaf' | 'chunkpack';
  path?: string;

  // Direct data storage (small files or chunk content)
  data?: string; // Base64 encoded (and possibly encrypted) content

  // Chunked storage (large files)
  children?: string[]; // Array of chunk IDs (e.g., ["h:abc123", "h:def456"])

  // Eden cache (optimization for recent chunks)
  eden?: Record<string, EdenChunk>;

  // Metadata
  mtime?: number;
  ctime?: number;
  size?: number;
  deleted?: boolean;
  _deleted?: boolean; // CouchDB deletion marker
}

/**
 * Eden chunk structure
 * Eden is an optimization that caches recent chunks directly in the metadata document
 */
export interface EdenChunk {
  data: string;  // Base64 encoded chunk data
  epoch: number; // Ordering number for chunk sequence
}

/**
 * Encryption-related types
 */
export interface EncryptionConfig {
  passphrase: string;
  useDynamicIterationCount?: boolean;
}

export interface DecryptedContent {
  content: string;
  isEncrypted: boolean;
}

export interface Note {
  id: string;
  path: string;
  content: string;
  mtime: Date;
  ctime: Date;
  size: number;
}

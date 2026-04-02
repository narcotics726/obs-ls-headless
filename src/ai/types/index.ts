/**
 * Core type definitions for the AI embedding and semantic search subsystem.
 * These types are framework-agnostic and self-contained.
 */

/** A semantic chunk produced by splitting a note's content */
export interface SemanticChunk {
  chunkId: string;
  noteId: string;
  order: number;
  text: string;
  start?: number;
  end?: number;
  headingContext?: string;
}

/** A single chunk's embedding data, stored as part of a note index */
export interface ChunkEmbedding {
  chunkId: string;
  order: number;
  text: string;
  start?: number;
  end?: number;
  embedding: number[];
}

/** Per-note embedding index stored as a JSON file */
export interface NoteEmbeddingIndex {
  schemaVersion: string;
  noteId: string;
  notePath: string;
  sourceMtime: number;
  indexedAt: number;
  embeddingModelId: string;
  chunkerVersion: string;
  contentHash: string;
  chunks: ChunkEmbedding[];
}

/** Request to perform a semantic search */
export interface SearchRequest {
  query: string;
  topK?: number;
  minScore?: number;
}

/** A single result from a semantic search */
export interface SearchResult {
  noteId: string;
  notePath: string;
  chunkId: string;
  chunkText: string;
  score: number;
  order: number;
}

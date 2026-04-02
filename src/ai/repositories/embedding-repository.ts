import type { NoteEmbeddingIndex } from "../types/index.js";

/**
 * Interface for persisting and retrieving embedding indices.
 * First version uses local JSON files; future versions may use SQLite or vector DB.
 */
export interface IEmbeddingRepository {
  /** Save or overwrite a note's embedding index */
  save(index: NoteEmbeddingIndex): Promise<void>;
  /** Load a note's embedding index, or null if not found */
  load(noteId: string): Promise<NoteEmbeddingIndex | null>;
  /** Delete a note's embedding index */
  delete(noteId: string): Promise<void>;
  /** List all stored embedding indices */
  listAll(): Promise<NoteEmbeddingIndex[]>;
}

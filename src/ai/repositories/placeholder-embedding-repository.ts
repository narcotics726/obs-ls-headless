import type { NoteEmbeddingIndex } from "../types/index.js";
import type { IEmbeddingRepository } from "./embedding-repository.js";

/**
 * In-memory placeholder implementation of EmbeddingRepository.
 * Used for testing and development; data is lost on process restart.
 */
export class PlaceholderEmbeddingRepository implements IEmbeddingRepository {
  private store: Map<string, NoteEmbeddingIndex> = new Map();

  async save(index: NoteEmbeddingIndex): Promise<void> {
    this.store.set(index.noteId, index);
  }

  async load(noteId: string): Promise<NoteEmbeddingIndex | null> {
    return this.store.get(noteId) ?? null;
  }

  async delete(noteId: string): Promise<void> {
    this.store.delete(noteId);
  }

  async listAll(): Promise<NoteEmbeddingIndex[]> {
    return Array.from(this.store.values());
  }
}

import { Note } from '../types/index.js';
import { NoteRepository } from './note-repository.js';

/**
 * In-memory NoteRepository implementation.
 * Mirrors the Map-based logic previously embedded in SyncService.
 */
export class MemoryNoteRepository implements NoteRepository {
  private notes = new Map<string, Note>();

  async save(note: Note): Promise<void> {
    this.notes.set(note.id, note);
  }

  async saveMany(notes: Note[]): Promise<void> {
    for (const note of notes) {
      this.notes.set(note.id, note);
    }
  }

  async delete(id: string): Promise<void> {
    this.notes.delete(id);
  }

  async deleteMany(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.notes.delete(id);
    }
  }

  async get(id: string): Promise<Note | undefined> {
    return this.notes.get(id);
  }

  async getAll(): Promise<Note[]> {
    return Array.from(this.notes.values());
  }

  async search(query: string): Promise<Note[]> {
    const lower = query.toLowerCase();
    return Array.from(this.notes.values()).filter(
      (note) =>
        note.path.toLowerCase().includes(lower) ||
        note.content.toLowerCase().includes(lower)
    );
  }

  async count(): Promise<number> {
    return this.notes.size;
  }
}

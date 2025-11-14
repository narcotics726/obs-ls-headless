import { Note } from '../types/index.js';

/**
 * Storage abstraction for assembled notes.
 * Implementations may keep data in memory or on disk.
 */
export interface NoteRepository {
  /**
   * Persist or update a single note.
   */
  save(note: Note): Promise<void>;

  /**
   * Persist or update many notes at once for efficiency.
   */
  saveMany(notes: Note[]): Promise<void>;

  /**
   * Remove a single note by id if it exists.
   */
  delete(id: string): Promise<void>;

  /**
   * Remove multiple notes.
   */
  deleteMany(ids: string[]): Promise<void>;

  /**
   * Return a single note by id.
   */
  get(id: string): Promise<Note | undefined>;

  /**
   * List all notes. Implementations may return a copy.
   */
  getAll(): Promise<Note[]>;

  /**
   * Case-insensitive search on note path/content.
   */
  search(query: string): Promise<Note[]>;

  /**
   * Number of notes currently stored.
   */
  count(): Promise<number>;
}

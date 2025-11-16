import { promises as fs } from 'node:fs';
import { dirname, posix, relative, resolve, sep } from 'node:path';

import type { Note } from '../types/index.js';
import type { NoteRepository } from './note-repository.js';

/**
 * Disk-backed NoteRepository implementation.
 * Writes notes to disk under a configured vault directory.
 */
export class DiskNoteRepository implements NoteRepository {
  private readonly root: string;
  private readonly ready: Promise<void>;
  private readonly maxParallel = 8;

  constructor(vaultPath: string) {
    this.root = resolve(vaultPath);
    this.ready = fs.mkdir(this.root, { recursive: true }).then(() => {});
  }

  async save(note: Note): Promise<void> {
    await this.ready;
    const target = this.resolveWithinVault(this.getRelativePathForNote(note));
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, note.content ?? '', 'utf-8');
  }

  async saveMany(notes: Note[]): Promise<void> {
    await this.ready;
    await this.runWithConcurrency(notes, (note) => this.save(note));
  }

  async delete(id: string): Promise<void> {
    await this.ready;
    const target = this.resolveWithinVault(id);
    await fs.rm(target, { force: true });
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.ready;
    await this.runWithConcurrency(ids, (id) => this.delete(id));
  }

  async get(id: string): Promise<Note | undefined> {
    await this.ready;
    const target = this.resolveWithinVault(id);
    if (!(await this.exists(target))) return undefined;
    return this.readNoteFrom(target);
  }

  async getAll(): Promise<Note[]> {
    await this.ready;
    const filePaths = await this.listFiles(this.root);
    return Promise.all(filePaths.map((path) => this.readNoteFrom(path)));
  }

  async search(query: string): Promise<Note[]> {
    if (!query.trim()) {
      return [];
    }
    const lower = query.toLowerCase();
    const notes = await this.getAll();
    return notes.filter(
      (note) =>
        note.path.toLowerCase().includes(lower) ||
        (note.content ?? '').toLowerCase().includes(lower)
    );
  }

  async count(): Promise<number> {
    await this.ready;
    const files = await this.listFiles(this.root);
    return files.length;
  }

  private getRelativePathForNote(note: Note): string {
    const relativePath = note.path || note.id;
    if (!relativePath) {
      throw new Error('Invalid note path');
    }
    return this.sanitizeRelativePath(relativePath);
  }

  private resolveWithinVault(relativePath: string): string {
    const sanitized = this.sanitizeRelativePath(relativePath);
    const fullPath = resolve(this.root, sanitized);
    if (!this.isWithinVault(fullPath)) {
      throw new Error('Invalid note path');
    }
    return fullPath;
  }

  private sanitizeRelativePath(rawPath: string): string {
    if (!rawPath || !rawPath.trim()) {
      throw new Error('Invalid note path');
    }

    const unixLike = rawPath.replace(/\\/g, '/');

    if (/^[A-Za-z]:/.test(unixLike)) {
      throw new Error('Invalid note path');
    }

    if (unixLike.startsWith('/')) {
      throw new Error('Invalid note path');
    }

    const normalized = posix.normalize(unixLike);

    if (!normalized || normalized === '.' || normalized.startsWith('../')) {
      throw new Error('Invalid note path');
    }

    return normalized;
  }

  private isWithinVault(path: string): boolean {
    const normalizedRoot = this.root.endsWith(sep) ? this.root : this.root + sep;
    return path === this.root || path.startsWith(normalizedRoot);
  }

  private async readNoteFrom(fullPath: string): Promise<Note> {
    const stats = await fs.stat(fullPath);
    const rel = relative(this.root, fullPath).split(sep).join('/');
    const content = await fs.readFile(fullPath, 'utf-8');
    return {
      id: rel,
      path: rel,
      content,
      size: stats.size,
      mtime: stats.mtime,
      ctime: stats.ctime,
    };
  }

  private async listFiles(directory: string): Promise<string[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = resolve(directory, entry.name);
      if (!this.isWithinVault(fullPath) && directory !== this.root) {
        continue;
      }
      if (entry.isDirectory()) {
        const nested = await this.listFiles(fullPath);
        files.push(...nested);
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async runWithConcurrency<T>(
    items: T[],
    worker: (item: T) => Promise<void>
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }
    let index = 0;
    const limit = Math.min(this.maxParallel, items.length);
    const runners = Array.from({ length: limit }, async () => {
      while (index < items.length) {
        const current = index++;
        await worker(items[current]);
      }
    });
    await Promise.all(runners);
  }
}

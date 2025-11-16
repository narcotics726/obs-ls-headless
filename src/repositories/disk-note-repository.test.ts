import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Note } from '../types/index.js';
import { DiskNoteRepository } from './disk-note-repository.js';

function createNote(partial?: Partial<Note>): Note {
  const base: Note = {
    id: 'folder/note.md',
    path: 'folder/note.md',
    content: 'hello world',
    mtime: new Date('2024-01-01T00:00:00Z'),
    ctime: new Date('2023-12-31T12:00:00Z'),
    size: 11,
  };
  return { ...base, ...partial };
}

describe('DiskNoteRepository', () => {
  let vaultDir: string;
  let repository: DiskNoteRepository;

  beforeEach(() => {
    vaultDir = mkdtempSync(join(tmpdir(), 'disk-note-repo-'));
    repository = new DiskNoteRepository(vaultDir);
  });

  afterEach(() => {
    rmSync(vaultDir, { recursive: true, force: true });
  });

  it('writes notes to disk and reads them back', async () => {
    const note = createNote();
    await repository.save(note);

    const stored = await repository.get(note.id);
    expect(stored?.content).toBe(note.content);
    expect(stored?.path).toBe(note.path);
  });

  it('prevents path traversal attacks', async () => {
    const note = createNote({ path: '../evil.txt', id: '../evil.txt' });
    await expect(repository.save(note)).rejects.toThrow('Invalid note path');
  });

  it('allows note names containing dots without rejection', async () => {
    const note = createNote({ path: 'folder/note..md', id: 'folder/note..md' });
    await repository.save(note);
    const stored = await repository.get(note.id);
    expect(stored).toBeDefined();
  });

  it('rejects Windows-style traversal attempts', async () => {
    const note = createNote({ path: '..\\evil.txt', id: '..\\evil.txt' });
    await expect(repository.save(note)).rejects.toThrow('Invalid note path');
  });

  it('rejects absolute paths', async () => {
    const note = createNote({ path: '/etc/passwd', id: '/etc/passwd' });
    await expect(repository.save(note)).rejects.toThrow('Invalid note path');
  });
});

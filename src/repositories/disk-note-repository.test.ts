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

  afterEach(async () => {
    const ready = (repository as unknown as { ready?: Promise<void> }).ready;
    if (ready) {
      await ready.catch(() => {});
    }
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

  it('rejects empty paths', async () => {
    const note = createNote({ path: '', id: '' });
    await expect(repository.save(note)).rejects.toThrow('Invalid note path');
  });

  it('returns undefined when file does not exist', async () => {
    const note = await repository.get('missing.md');
    expect(note).toBeUndefined();
  });

  it('deletes missing files without throwing', async () => {
    await expect(repository.delete('unknown.md')).resolves.toBeUndefined();
  });

  it('handles empty saveMany and deleteMany without work', async () => {
    await expect(repository.saveMany([])).resolves.toBeUndefined();
    await expect(repository.deleteMany([])).resolves.toBeUndefined();
  });

  it('saves multiple notes concurrently', async () => {
    const notes = Array.from({ length: 12 }).map((_, idx) =>
      createNote({ id: `note-${idx}.md`, path: `note-${idx}.md`, content: `#${idx}` })
    );
    await repository.saveMany(notes);
    const all = await repository.getAll();
    expect(all).toHaveLength(notes.length);
  });

  it('searches by content when query provided', async () => {
    await repository.save(createNote({ id: 'foo.md', path: 'foo.md', content: 'hello world' }));
    const results = await repository.search('world');
    expect(results.map((n) => n.id)).toContain('foo.md');
  });

  it('returns empty search results when query blank', async () => {
    const results = await repository.search('   ');
    expect(results).toEqual([]);
  });
});

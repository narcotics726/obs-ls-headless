import { beforeEach, describe, expect, it } from 'vitest';

import { Note } from '../types/index.js';
import { MemoryNoteRepository } from './memory-note-repository.js';

function createNote(partial?: Partial<Note>): Note {
  const base = {
    id: 'note-id',
    path: 'folder/note.md',
    content: 'Hello world',
    mtime: new Date('2024-01-01T00:00:00Z'),
    ctime: new Date('2023-12-31T12:00:00Z'),
    size: 42,
  };
  return { ...base, ...partial };
}

describe('MemoryNoteRepository', () => {
  let repository: MemoryNoteRepository;

  beforeEach(() => {
    repository = new MemoryNoteRepository();
  });

  it('persists notes via save and retrieves them', async () => {
    const note = createNote();
    await repository.save(note);

    expect(await repository.get(note.id)).toEqual(note);
    expect(await repository.count()).toBe(1);
    expect(await repository.getAll()).toEqual([note]);
  });

  it('overwrites notes with the same id', async () => {
    const original = createNote({ content: 'old' });
    const updated = createNote({ content: 'new' });

    await repository.save(original);
    await repository.save(updated);

    expect(await repository.get(original.id)).toEqual(updated);
    expect(await repository.count()).toBe(1);
  });

  it('supports bulk saves and deletions', async () => {
    const notes = [
      createNote({ id: 'a', path: 'a.md' }),
      createNote({ id: 'b', path: 'b.md' }),
      createNote({ id: 'c', path: 'c.md' }),
    ];

    await repository.saveMany(notes);
    expect(await repository.count()).toBe(3);

    await repository.delete('b');
    expect(await repository.get('b')).toBeUndefined();
    expect(await repository.count()).toBe(2);

    await repository.deleteMany(['a', 'missing']);
    expect(await repository.count()).toBe(1);
    expect(await repository.getAll()).toEqual([notes[2]]);
  });

  it('performs case-insensitive search on path and content', async () => {
    const notes = [
      createNote({ id: 'path', path: 'Folder/Path.md', content: 'hello' }),
      createNote({ id: 'content', path: 'another.md', content: 'Secret keyword inside' }),
      createNote({ id: 'other', path: 'misc.txt', content: 'nothing' }),
    ];
    await repository.saveMany(notes);

    const pathMatches = await repository.search('folder/path');
    expect(pathMatches.map((n) => n.id)).toEqual(['path']);

    const contentMatches = await repository.search('KEYWORD');
    expect(contentMatches.map((n) => n.id)).toEqual(['content']);
  });
});

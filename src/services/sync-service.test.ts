import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncService } from './sync-service.js';
import { CouchDBClient } from '../core/couchdb-client.js';
import type { IDocumentAssembler, IStateStorage } from '../core/interfaces.js';
import type { LiveSyncDocument } from '../types/index.js';

describe('SyncService', () => {
  let mockClient: CouchDBClient;
  let mockAssembler: IDocumentAssembler;
  let mockStateStorage: IStateStorage;
  let syncService: SyncService;

  beforeEach(() => {
    // Mock CouchDBClient
    mockClient = {
      getAllDocuments: vi.fn(),
      getDocument: vi.fn(),
      getDocuments: vi.fn(),
      getDatabaseInfo: vi.fn(async () => ({
        db_name: 'test-db',
        doc_count: 0,
        update_seq: '123-abc',
      })),
    } as any;

    // Mock StateStorage
    mockStateStorage = {
      initialize: vi.fn(),
      getState: vi.fn(async () => ({})),
      saveState: vi.fn(),
      updateState: vi.fn(),
      resetState: vi.fn(),
    } as any;

    // Create sync service
    syncService = new SyncService(mockClient, mockStateStorage);

    // Mock assembler
    mockAssembler = {
      assembleDocument: vi.fn(async (doc: LiveSyncDocument) => {
        // Default: return simple content based on path
        return `Content of ${doc.path}`;
      }),
    };

    // Set mock assembler
    syncService.setAssembler(mockAssembler);
  });

  afterEach(() => {
    // Clean up any running intervals
    syncService.stopAutoSync();
  });

  describe('Document filtering logic', () => {
    it('should skip chunk documents starting with h:', async () => {
      const documents: LiveSyncDocument[] = [
        {
          _id: 'h:chunk1',
          _rev: '1-abc',
          type: 'leaf',
        } as LiveSyncDocument,
        {
          _id: 'valid-note.md',
          _rev: '1-def',
          type: 'newnote',
          path: 'valid-note.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);

      await syncService.sync();

      // Should only process the valid note, not the chunk
      expect(mockAssembler.assembleDocument).toHaveBeenCalledTimes(1);
      expect(mockAssembler.assembleDocument).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'valid-note.md' })
      );
    });

    it('should skip encrypted chunk documents starting with h:+', async () => {
      const documents: LiveSyncDocument[] = [
        {
          _id: 'h:+encrypted-chunk',
          _rev: '1-abc',
          type: 'leaf',
        } as LiveSyncDocument,
        {
          _id: 'note.md',
          _rev: '1-def',
          type: 'newnote',
          path: 'note.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);

      await syncService.sync();

      expect(mockAssembler.assembleDocument).toHaveBeenCalledTimes(1);
      expect(mockAssembler.assembleDocument).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'note.md' })
      );
    });

    it('should skip internal documents containing colon', async () => {
      const documents: LiveSyncDocument[] = [
        {
          _id: 'ps:path-mapping',
          _rev: '1-abc',
          // Internal documents don't need type field
        },
        {
          _id: 'ix:index-doc',
          _rev: '1-def',
        },
        {
          _id: 'leaf:tree-node',
          _rev: '1-ghi',
        },
        {
          _id: 'normal-note.md',
          _rev: '1-jkl',
          type: 'newnote',
          path: 'normal-note.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);

      await syncService.sync();

      // Should only process the normal note
      expect(mockAssembler.assembleDocument).toHaveBeenCalledTimes(1);
      expect(mockAssembler.assembleDocument).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'normal-note.md' })
      );
    });

    it('should skip deleted documents with deleted flag', async () => {
      const documents: LiveSyncDocument[] = [
        {
          _id: 'deleted-note.md',
          _rev: '2-abc',
          type: 'newnote',
          path: 'deleted-note.md',
          deleted: true,
          mtime: Date.now(),
          ctime: Date.now(),
          size: 0,
        },
        {
          _id: 'active-note.md',
          _rev: '1-def',
          type: 'newnote',
          path: 'active-note.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);

      await syncService.sync();

      expect(mockAssembler.assembleDocument).toHaveBeenCalledTimes(1);
      expect(mockAssembler.assembleDocument).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'active-note.md' })
      );
    });

    it('should skip deleted documents with _deleted flag', async () => {
      const documents: LiveSyncDocument[] = [
        {
          _id: 'deleted-note.md',
          _rev: '2-abc',
          type: 'newnote',
          path: 'deleted-note.md',
          _deleted: true,
          mtime: Date.now(),
          ctime: Date.now(),
          size: 0,
        },
        {
          _id: 'active-note.md',
          _rev: '1-def',
          type: 'newnote',
          path: 'active-note.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);

      await syncService.sync();

      expect(mockAssembler.assembleDocument).toHaveBeenCalledTimes(1);
    });

    it('should skip documents without path field', async () => {
      const documents: LiveSyncDocument[] = [
        {
          _id: 'no-path-doc',
          _rev: '1-abc',
          type: 'newnote',
          // Missing path field
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        } as LiveSyncDocument,
        {
          _id: 'valid-note.md',
          _rev: '1-def',
          type: 'newnote',
          path: 'valid-note.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);

      await syncService.sync();

      expect(mockAssembler.assembleDocument).toHaveBeenCalledTimes(1);
      expect(mockAssembler.assembleDocument).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'valid-note.md' })
      );
    });

    it('should skip documents without type field', async () => {
      const documents: LiveSyncDocument[] = [
        {
          _id: 'no-type-doc.md',
          _rev: '1-abc',
          path: 'no-type-doc.md',
          // Missing type field
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        } as LiveSyncDocument,
        {
          _id: 'valid-note.md',
          _rev: '1-def',
          type: 'newnote',
          path: 'valid-note.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);

      await syncService.sync();

      expect(mockAssembler.assembleDocument).toHaveBeenCalledTimes(1);
    });

    it('should only process newnote and plain types', async () => {
      const documents: LiveSyncDocument[] = [
        {
          _id: 'newnote.md',
          _rev: '1-abc',
          type: 'newnote',
          path: 'newnote.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
        {
          _id: 'plain.txt',
          _rev: '1-def',
          type: 'plain',
          path: 'plain.txt',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
        {
          _id: 'other-type.md',
          _rev: '1-ghi',
          type: 'other' as any,
          path: 'other-type.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);

      await syncService.sync();

      // Should process newnote and plain, but not other
      expect(mockAssembler.assembleDocument).toHaveBeenCalledTimes(2);
      expect(mockAssembler.assembleDocument).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'newnote' })
      );
      expect(mockAssembler.assembleDocument).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'plain' })
      );
    });
  });

  describe('Sync process', () => {
    it('should successfully sync and update status', async () => {
      const documents: LiveSyncDocument[] = [
        {
          _id: 'note1.md',
          _rev: '1-abc',
          type: 'newnote',
          path: 'note1.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);

      await syncService.sync();

      const status = syncService.getStatus();
      expect(status.lastSyncSuccess).toBe(true);
      expect(status.lastSyncTime).toBeInstanceOf(Date);
      expect(status.documentsCount).toBe(1);
      expect(status.error).toBeUndefined();
    });

    it('should handle sync errors and update status', async () => {
      mockClient.getAllDocuments = vi.fn(async () => {
        throw new Error('Database connection failed');
      });

      await expect(syncService.sync()).rejects.toThrow('Database connection failed');

      const status = syncService.getStatus();
      expect(status.lastSyncSuccess).toBe(false);
      expect(status.error).toBe('Database connection failed');
    });

    it('should prevent concurrent syncs', async () => {
      const documents: LiveSyncDocument[] = [];
      mockClient.getAllDocuments = vi.fn(async () => {
        // Simulate slow sync
        await new Promise((resolve) => setTimeout(resolve, 100));
        return documents;
      });

      // Start first sync
      const sync1 = syncService.sync();
      // Try to start second sync immediately
      const sync2 = syncService.sync();

      await sync1;
      await sync2;

      // getAllDocuments should only be called once
      expect(mockClient.getAllDocuments).toHaveBeenCalledTimes(1);
    });

    it('should skip documents that fail to assemble', async () => {
      const documents: LiveSyncDocument[] = [
        {
          _id: 'note1.md',
          _rev: '1-abc',
          type: 'newnote',
          path: 'note1.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
        {
          _id: 'note2.md',
          _rev: '1-def',
          type: 'newnote',
          path: 'note2.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);
      mockAssembler.assembleDocument = vi.fn(async (doc) => {
        if (doc._id === 'note1.md') {
          return null; // Failed to assemble
        }
        return `Content of ${doc.path}`;
      });

      await syncService.sync();

      const notes = syncService.getNotes();
      // Should only have note2, not note1
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe('note2.md');
    });
  });

  describe('Note management', () => {
    beforeEach(async () => {
      const documents: LiveSyncDocument[] = [
        {
          _id: 'note1.md',
          _rev: '1-abc',
          type: 'newnote',
          path: 'folder/note1.md',
          data: 'content',
          mtime: 1000000,
          ctime: 900000,
          size: 100,
        },
        {
          _id: 'note2.md',
          _rev: '1-def',
          type: 'newnote',
          path: 'note2.md',
          data: 'content',
          mtime: 2000000,
          ctime: 1900000,
          size: 200,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);
      await syncService.sync();
    });

    it('should get all notes', () => {
      const notes = syncService.getNotes();
      expect(notes).toHaveLength(2);
      expect(notes[0].id).toBe('note1.md');
      expect(notes[1].id).toBe('note2.md');
    });

    it('should get a specific note by id', () => {
      const note = syncService.getNote('note1.md');
      expect(note).toBeDefined();
      expect(note?.path).toBe('folder/note1.md');
      expect(note?.content).toBe('Content of folder/note1.md');
    });

    it('should return undefined for non-existent note', () => {
      const note = syncService.getNote('non-existent.md');
      expect(note).toBeUndefined();
    });

    it('should search notes by path', () => {
      const results = syncService.searchNotes('folder');
      expect(results).toHaveLength(1);
      expect(results[0].path).toBe('folder/note1.md');
    });

    it('should search notes by content', () => {
      const results = syncService.searchNotes('Content of note2');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('note2.md');
    });

    it('should perform case-insensitive search', () => {
      const results = syncService.searchNotes('FOLDER');
      expect(results).toHaveLength(1);
      expect(results[0].path).toBe('folder/note1.md');
    });
  });

  describe('Auto-sync', () => {
    it('should start auto-sync and run initial sync', async () => {
      mockClient.getAllDocuments = vi.fn(async () => []);

      syncService.startAutoSync(1000);

      // Wait for initial sync
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockClient.getAllDocuments).toHaveBeenCalled();
    });

    it('should prevent starting auto-sync twice', () => {
      mockClient.getAllDocuments = vi.fn(async () => []);

      syncService.startAutoSync(1000);
      syncService.startAutoSync(1000);

      // Should only start once
      syncService.stopAutoSync();
    });

    it('should stop auto-sync', async () => {
      mockClient.getAllDocuments = vi.fn(async () => []);

      syncService.startAutoSync(100);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const callCountBefore = (mockClient.getAllDocuments as any).mock.calls.length;

      syncService.stopAutoSync();

      // Wait to ensure no more calls
      await new Promise((resolve) => setTimeout(resolve, 150));

      const callCountAfter = (mockClient.getAllDocuments as any).mock.calls.length;

      // Should not have increased significantly after stopping
      expect(callCountAfter - callCountBefore).toBeLessThan(2);
    });
  });

  describe('Custom assembler', () => {
    it('should allow setting custom assembler', async () => {
      const customAssembler: IDocumentAssembler = {
        assembleDocument: vi.fn(async () => 'Custom content'),
      };

      syncService.setAssembler(customAssembler);

      const documents: LiveSyncDocument[] = [
        {
          _id: 'note.md',
          _rev: '1-abc',
          type: 'newnote',
          path: 'note.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);
      await syncService.sync();

      expect(customAssembler.assembleDocument).toHaveBeenCalled();
      const note = syncService.getNote('note.md');
      expect(note?.content).toBe('Custom content');
    });
  });
});

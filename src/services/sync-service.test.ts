import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncService } from './sync-service.js';
import { CouchDBClient } from '../core/couchdb-client.js';
import type { IDocumentAssembler, IStateStorage } from '../core/interfaces.js';
import type { LiveSyncDocument } from '../types/index.js';
import { MemoryNoteRepository } from '../repositories/memory-note-repository.js';
import type { NoteRepository } from '../repositories/note-repository.js';

describe('SyncService', () => {
  let mockClient: CouchDBClient;
  let mockAssembler: IDocumentAssembler;
  let mockStateStorage: IStateStorage;
  let noteRepository: MemoryNoteRepository;
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
      getChanges: vi.fn(),
    } as any;

    // Mock StateStorage
    mockStateStorage = {
      initialize: vi.fn(),
      getState: vi.fn(async () => ({})),
      saveState: vi.fn(),
      updateState: vi.fn(),
      resetState: vi.fn(),
    } as any;

    // Mock assembler
    mockAssembler = {
      assembleDocument: vi.fn(async (doc: LiveSyncDocument) => {
        // Default: return simple content based on path
        return `Content of ${doc.path}`;
      }),
    };

    // Create repository
    noteRepository = new MemoryNoteRepository();

    // Create sync service with injected dependencies
    syncService = new SyncService(
      mockClient,
      mockStateStorage,
      mockAssembler,
      noteRepository
    );

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

      const notes = await syncService.getNotes();
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

    it('should get all notes', async () => {
      const notes = await syncService.getNotes();
      expect(notes).toHaveLength(2);
      expect(notes[0].id).toBe('note1.md');
      expect(notes[1].id).toBe('note2.md');
    });

    it('should get a specific note by id', async () => {
      const note = await syncService.getNote('note1.md');
      expect(note).toBeDefined();
      expect(note?.path).toBe('folder/note1.md');
      expect(note?.content).toBe('Content of folder/note1.md');
    });

    it('should return undefined for non-existent note', async () => {
      const note = await syncService.getNote('non-existent.md');
      expect(note).toBeUndefined();
    });

    it('should search notes by path', async () => {
      const results = await syncService.searchNotes('folder');
      expect(results).toHaveLength(1);
      expect(results[0].path).toBe('folder/note1.md');
    });

    it('should search notes by content', async () => {
      const results = await syncService.searchNotes('Content of note2');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('note2.md');
    });

    it('should perform case-insensitive search', async () => {
      const results = await syncService.searchNotes('FOLDER');
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
    it('should allow injecting custom assembler', async () => {
      const customAssembler: IDocumentAssembler = {
        assembleDocument: vi.fn(async () => 'Custom content'),
      };

      const customService = new SyncService(
        mockClient,
        mockStateStorage,
        customAssembler,
        noteRepository
      );

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
      await customService.sync();

      expect(customAssembler.assembleDocument).toHaveBeenCalled();
      const note = await customService.getNote('note.md');
      expect(note?.content).toBe('Custom content');
    });
  });

  describe('Incremental sync', () => {

    it('should perform full sync when lastSeq is not set', async () => {
      const documents: LiveSyncDocument[] = [
        {
          _id: 'note1.md',
          _rev: '1-abc',
          type: 'newnote',
          path: 'note1.md',
          data: 'content1',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];

      mockClient.getAllDocuments = vi.fn(async () => documents);

      await syncService.sync();

      // Should call getAllDocuments (full sync), not getChanges
      expect(mockClient.getAllDocuments).toHaveBeenCalled();
      expect(mockClient.getChanges).not.toHaveBeenCalled();
    });

    it('should perform incremental sync when lastSeq is set', async () => {
      // First, do a full sync to set lastSeq
      mockClient.getAllDocuments = vi.fn(async () => []);
      await syncService.sync();

      // Now mock getChanges for incremental sync
      const changes = {
        results: [
          {
            id: 'note2.md',
            seq: '124-def',
            changes: [{ rev: '1-xyz' }],
            deleted: false,
            doc: {
              _id: 'note2.md',
              _rev: '1-xyz',
              type: 'newnote',
              path: 'note2.md',
              data: 'content2',
              mtime: Date.now(),
              ctime: Date.now(),
              size: 100,
            },
          },
        ],
        last_seq: '124-def',
        pending: 0,
      };

      mockClient.getChanges = vi.fn(async () => changes);

      await syncService.sync();

      // Should call getChanges (incremental sync), not getAllDocuments
      expect(mockClient.getChanges).toHaveBeenCalledWith('123-abc');
      expect(mockClient.getAllDocuments).toHaveBeenCalledTimes(1); // Only from first sync
    });

    it('should process changed documents in incremental sync', async () => {
      // First, do a full sync to set lastSeq properly
      mockClient.getAllDocuments = vi.fn(async () => []);
      await syncService.sync();

      // Now mock getChanges for incremental sync
      const changes = {
        results: [
          {
            id: 'updated-note.md',
            seq: '124-new',
            changes: [{ rev: '2-updated' }],
            deleted: false,
            doc: {
              _id: 'updated-note.md',
              _rev: '2-updated',
              type: 'newnote',
              path: 'updated-note.md',
              data: 'updated content',
              mtime: Date.now(),
              ctime: Date.now(),
              size: 200,
            },
          },
        ],
        last_seq: '124-new',
        pending: 0,
      };

      mockClient.getChanges = vi.fn(async () => changes);

      await syncService.sync();

      // Should process the updated document
      expect(mockAssembler.assembleDocument).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'updated-note.md' })
      );

      // Should update lastSeq
      const updatedStatus = syncService.getStatus();
      expect(updatedStatus.lastSeq).toBe('124-new');
    });

    it('should handle deleted documents in incremental sync', async () => {
      // First, add a note
      const documents: LiveSyncDocument[] = [
        {
          _id: 'to-be-deleted.md',
          _rev: '1-abc',
          type: 'newnote',
          path: 'to-be-deleted.md',
          data: 'content',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
        },
      ];
      mockClient.getAllDocuments = vi.fn(async () => documents);
      await syncService.sync();

      // Verify note exists
      expect(await syncService.getNote('to-be-deleted.md')).toBeDefined();

      // Now simulate deletion via incremental sync
      const changes = {
        results: [
          {
            id: 'to-be-deleted.md',
            seq: '124-del',
            changes: [{ rev: '2-deleted' }],
            deleted: true,
          },
        ],
        last_seq: '124-del',
        pending: 0,
      };

      mockClient.getChanges = vi.fn(async () => changes);

      await syncService.sync();

      // Note should be removed
      expect(await syncService.getNote('to-be-deleted.md')).toBeUndefined();
    });

    it('should skip internal documents in incremental sync', async () => {
      // First, do a full sync to set lastSeq
      mockClient.getAllDocuments = vi.fn(async () => []);
      await syncService.sync();

      const changes = {
        results: [
          {
            id: 'h:chunk123',
            seq: '101-new',
            changes: [{ rev: '1-abc' }],
            deleted: false,
            doc: {
              _id: 'h:chunk123',
              _rev: '1-abc',
              type: 'leaf',
              data: 'chunk data',
            },
          },
          {
            id: 'ps:mapping',
            seq: '102-new',
            changes: [{ rev: '1-def' }],
            deleted: false,
            doc: {
              _id: 'ps:mapping',
              _rev: '1-def',
            },
          },
          {
            id: 'valid-note.md',
            seq: '103-new',
            changes: [{ rev: '1-ghi' }],
            deleted: false,
            doc: {
              _id: 'valid-note.md',
              _rev: '1-ghi',
              type: 'newnote',
              path: 'valid-note.md',
              data: 'content',
              mtime: Date.now(),
              ctime: Date.now(),
              size: 100,
            },
          },
        ],
        last_seq: '103-new',
        pending: 0,
      };

      mockClient.getChanges = vi.fn(async () => changes);

      await syncService.sync();

      // Should only process the valid note, not internal documents
      expect(mockAssembler.assembleDocument).toHaveBeenCalledTimes(1);
      expect(mockAssembler.assembleDocument).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'valid-note.md' })
      );
    });

    it('should handle empty changes in incremental sync', async () => {
      // First, do a full sync to set lastSeq
      mockClient.getAllDocuments = vi.fn(async () => []);
      await syncService.sync();

      const changes = {
        results: [],
        last_seq: '100-old',
        pending: 0,
      };

      mockClient.getChanges = vi.fn(async () => changes);

      await syncService.sync();

      // Should not process any documents
      expect(mockAssembler.assembleDocument).not.toHaveBeenCalled();

      // Should still update status
      const updatedStatus = syncService.getStatus();
      expect(updatedStatus.lastSyncSuccess).toBe(true);
    });

    it('should clear previous errors when incremental sync returns no changes', async () => {
      // Establish lastSeq through a successful full sync
      mockClient.getAllDocuments = vi.fn(async () => []);
      await syncService.sync();

      // Simulate a failed incremental sync to leave an error in status
      mockClient.getChanges = vi.fn(async () => {
        throw new Error('Temporary incremental failure');
      });
      await expect(syncService.sync()).rejects.toThrow('Temporary incremental failure');

      // Next incremental sync returns no changes and should clear the error
      mockClient.getChanges = vi.fn(async () => ({
        results: [],
        last_seq: '123-abc',
        pending: 0,
      }));
      await syncService.sync();

      const updatedStatus = syncService.getStatus();
      expect(updatedStatus.lastSyncSuccess).toBe(true);
      expect(updatedStatus.error).toBeUndefined();
    });

    it('should persist lastSeq after incremental sync', async () => {
      // First, do a full sync to set lastSeq
      mockClient.getAllDocuments = vi.fn(async () => []);
      await syncService.sync();

      const changes = {
        results: [
          {
            id: 'note.md',
            seq: '105-new',
            changes: [{ rev: '1-abc' }],
            deleted: false,
            doc: {
              _id: 'note.md',
              _rev: '1-abc',
              type: 'newnote',
              path: 'note.md',
              data: 'content',
              mtime: Date.now(),
              ctime: Date.now(),
              size: 100,
            },
          },
        ],
        last_seq: '105-new',
        pending: 0,
      };

      mockClient.getChanges = vi.fn(async () => changes);

      await syncService.sync();

      // Should persist the new lastSeq
      expect(mockStateStorage.updateState).toHaveBeenCalledWith(
        expect.objectContaining({
          lastSeq: '105-new',
        })
      );
    });
  });

  describe('NoteRepository integration', () => {
    it('should save assembled notes via repository', async () => {
      const repoMock = createRepositoryMock();
      syncService = new SyncService(
        mockClient,
        mockStateStorage,
        mockAssembler,
        repoMock
      );

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

      expect(repoMock.saveMany).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'note.md', path: 'note.md' }),
      ]);
    });

    it('should delete notes via repository during incremental sync', async () => {
      const repoMock = createRepositoryMock();
      syncService = new SyncService(
        mockClient,
        mockStateStorage,
        mockAssembler,
        repoMock
      );

      mockClient.getAllDocuments = vi.fn(async () => []);
      await syncService.sync();

      mockClient.getChanges = vi.fn(async () => ({
        results: [
          {
            id: 'obsolete.md',
            seq: '2-def',
            changes: [{ rev: '2-def' }],
            deleted: true,
          },
        ],
        last_seq: '2-def',
        pending: 0,
      }));

      await syncService.sync();

      expect(repoMock.deleteMany).toHaveBeenCalledWith(['obsolete.md']);
    });
  });
  describe('initialize', () => {
    it('forces full sync when repository empty but state has lastSeq', async () => {
      mockStateStorage.getState = vi.fn(async () => ({ lastSeq: '42-abc' }));
      vi.spyOn(noteRepository, 'count').mockResolvedValue(0);

      await syncService.initialize();

      expect(mockStateStorage.resetState).toHaveBeenCalled();
      expect(syncService.getStatus().lastSeq).toBeUndefined();
    });

    it('forces full sync when repository has data but lastSeq missing', async () => {
      mockStateStorage.getState = vi.fn(async () => ({}));
      vi.spyOn(noteRepository, 'count').mockResolvedValue(10);

      await syncService.initialize();

      expect(mockStateStorage.resetState).not.toHaveBeenCalled();
      expect(syncService.getStatus().lastSeq).toBeUndefined();
    });
  });
});

type NoteRepositoryMock = NoteRepository & {
  save: ReturnType<typeof vi.fn>;
  saveMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  getAll: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};

function createRepositoryMock(): NoteRepositoryMock {
  return {
    save: vi.fn(async () => {}),
    saveMany: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    deleteMany: vi.fn(async () => {}),
    get: vi.fn(async () => undefined),
    getAll: vi.fn(async () => []),
    search: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  };
}

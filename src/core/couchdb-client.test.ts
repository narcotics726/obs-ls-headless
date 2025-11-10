import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CouchDBClient } from './couchdb-client.js';
import type { CouchDBConfig, LiveSyncDocument } from '../types/index.js';

// Mock nano module
vi.mock('nano', () => {
  return {
    default: vi.fn(),
  };
});

describe('CouchDBClient', () => {
  let mockDb: any;
  let mockNano: any;
  let client: CouchDBClient;
  let config: CouchDBConfig;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup config
    config = {
      url: 'http://localhost:5984',
      username: 'admin',
      password: 'password',
      database: 'test-db',
    };

    // Mock database methods
    mockDb = {
      get: vi.fn(),
      list: vi.fn(),
      fetch: vi.fn(),
      info: vi.fn(),
      changes: vi.fn(),
    };

    // Mock nano instance
    mockNano = {
      db: {
        use: vi.fn(() => mockDb),
        list: vi.fn(),
      },
    };

    // Mock nano constructor
    const Nano = await import('nano');
    (Nano.default as any).mockReturnValue(mockNano);

    // Create client
    client = new CouchDBClient(config);
  });

  describe('constructor', () => {
    it('should create client with authentication in URL', async () => {
      const Nano = await import('nano');

      expect(Nano.default).toHaveBeenCalledWith(
        'http://admin:password@localhost:5984'
      );
    });

    it('should use the specified database', () => {
      expect(mockNano.db.use).toHaveBeenCalledWith('test-db');
    });
  });

  describe('getDocument', () => {
    it('should get a document by id', async () => {
      const mockDoc: LiveSyncDocument = {
        _id: 'test-note.md',
        _rev: '1-abc',
        type: 'newnote',
        path: 'test-note.md',
        data: 'content',
        mtime: Date.now(),
        ctime: Date.now(),
        size: 100,
      };

      mockDb.get.mockResolvedValue(mockDoc);

      const result = await client.getDocument('test-note.md');

      expect(result).toEqual(mockDoc);
      expect(mockDb.get).toHaveBeenCalledWith('test-note.md');
    });

    it('should return null for 404 errors', async () => {
      const error = new Error('Not found');
      (error as any).statusCode = 404;
      mockDb.get.mockRejectedValue(error);

      const result = await client.getDocument('non-existent.md');

      expect(result).toBeNull();
    });

    it('should throw error for non-404 errors', async () => {
      const error = new Error('Database error');
      (error as any).statusCode = 500;
      mockDb.get.mockRejectedValue(error);

      await expect(client.getDocument('test.md')).rejects.toThrow('Database error');
    });
  });

  describe('getDocuments', () => {
    it('should return empty map for empty array', async () => {
      const result = await client.getDocuments([]);

      expect(result.size).toBe(0);
      expect(mockDb.fetch).not.toHaveBeenCalled();
    });

    it('should bulk fetch multiple documents', async () => {
      const mockDocs: LiveSyncDocument[] = [
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
        {
          _id: 'note2.md',
          _rev: '1-def',
          type: 'newnote',
          path: 'note2.md',
          data: 'content2',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 200,
        },
      ];

      mockDb.fetch.mockResolvedValue({
        rows: [
          { id: 'note1.md', key: 'note1.md', doc: mockDocs[0] },
          { id: 'note2.md', key: 'note2.md', doc: mockDocs[1] },
        ],
      });

      const result = await client.getDocuments(['note1.md', 'note2.md']);

      expect(result.size).toBe(2);
      expect(result.get('note1.md')).toEqual(mockDocs[0]);
      expect(result.get('note2.md')).toEqual(mockDocs[1]);
      expect(mockDb.fetch).toHaveBeenCalledWith(
        { keys: ['note1.md', 'note2.md'] },
        { include_docs: true }
      );
    });

    it('should handle missing documents in bulk fetch', async () => {
      const mockDoc: LiveSyncDocument = {
        _id: 'note1.md',
        _rev: '1-abc',
        type: 'newnote',
        path: 'note1.md',
        data: 'content1',
        mtime: Date.now(),
        ctime: Date.now(),
        size: 100,
      };

      mockDb.fetch.mockResolvedValue({
        rows: [
          { id: 'note1.md', key: 'note1.md', doc: mockDoc },
          { id: 'note2.md', key: 'note2.md', error: 'not_found' },
        ],
      });

      const result = await client.getDocuments(['note1.md', 'note2.md']);

      expect(result.size).toBe(1);
      expect(result.get('note1.md')).toEqual(mockDoc);
      expect(result.get('note2.md')).toBeUndefined();
    });

    it('should throw error on fetch failure', async () => {
      mockDb.fetch.mockRejectedValue(new Error('Fetch failed'));

      await expect(client.getDocuments(['note1.md'])).rejects.toThrow('Fetch failed');
    });
  });

  describe('getAllDocuments', () => {
    it('should get all documents', async () => {
      const mockDocs: LiveSyncDocument[] = [
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
        {
          _id: 'note2.md',
          _rev: '1-def',
          type: 'newnote',
          path: 'note2.md',
          data: 'content2',
          mtime: Date.now(),
          ctime: Date.now(),
          size: 200,
        },
      ];

      mockDb.list.mockResolvedValue({
        rows: [
          { id: 'note1.md', doc: mockDocs[0] },
          { id: 'note2.md', doc: mockDocs[1] },
        ],
      });

      const result = await client.getAllDocuments();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockDocs[0]);
      expect(result[1]).toEqual(mockDocs[1]);
      expect(mockDb.list).toHaveBeenCalledWith({ include_docs: true });
    });

    it('should filter out _design documents', async () => {
      const mockDoc: LiveSyncDocument = {
        _id: 'note1.md',
        _rev: '1-abc',
        type: 'newnote',
        path: 'note1.md',
        data: 'content1',
        mtime: Date.now(),
        ctime: Date.now(),
        size: 100,
      };

      mockDb.list.mockResolvedValue({
        rows: [
          { id: '_design/views', doc: { _id: '_design/views' } },
          { id: 'note1.md', doc: mockDoc },
        ],
      });

      const result = await client.getAllDocuments();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockDoc);
    });

    it('should filter out rows without doc', async () => {
      const mockDoc: LiveSyncDocument = {
        _id: 'note1.md',
        _rev: '1-abc',
        type: 'newnote',
        path: 'note1.md',
        data: 'content1',
        mtime: Date.now(),
        ctime: Date.now(),
        size: 100,
      };

      mockDb.list.mockResolvedValue({
        rows: [
          { id: 'note1.md', doc: mockDoc },
          { id: 'note2.md', doc: null },
        ],
      });

      const result = await client.getAllDocuments();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockDoc);
    });

    it('should throw error on list failure', async () => {
      mockDb.list.mockRejectedValue(new Error('List failed'));

      await expect(client.getAllDocuments()).rejects.toThrow('List failed');
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      mockNano.db.list.mockResolvedValue(['db1', 'db2']);

      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(mockNano.db.list).toHaveBeenCalled();
    });

    it('should return false on connection failure', async () => {
      mockNano.db.list.mockRejectedValue(new Error('Connection failed'));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('getDatabaseInfo', () => {
    it('should get database info', async () => {
      const mockInfo = {
        db_name: 'test-db',
        doc_count: 100,
        update_seq: '1000',
      };

      mockDb.info.mockResolvedValue(mockInfo);

      const result = await client.getDatabaseInfo();

      expect(result).toEqual(mockInfo);
      expect(mockDb.info).toHaveBeenCalled();
    });

    it('should throw error on info failure', async () => {
      mockDb.info.mockRejectedValue(new Error('Info failed'));

      await expect(client.getDatabaseInfo()).rejects.toThrow('Info failed');
    });
  });
});

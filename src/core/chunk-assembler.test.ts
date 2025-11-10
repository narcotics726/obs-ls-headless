import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChunkAssembler } from './chunk-assembler.js';
import type { IDocumentStorage } from './interfaces.js';
import type { LiveSyncDocument } from '../types/index.js';

describe('ChunkAssembler', () => {
  let mockStorage: IDocumentStorage;
  let assembler: ChunkAssembler;

  beforeEach(() => {
    mockStorage = {
      getDocument: vi.fn(),
      getDocuments: vi.fn(),
      getAllDocuments: vi.fn(),
    };

    // Create assembler without encryption for basic tests
    assembler = new ChunkAssembler(mockStorage);
  });

  describe('assembleDocument - Direct data strategy', () => {
    it('should assemble document from direct data field (base64)', async () => {
      const plainText = 'Hello World';
      const base64Data = Buffer.from(plainText).toString('base64');

      const doc: LiveSyncDocument = {
        _id: 'test.md',
        _rev: '1-abc',
        type: 'newnote',
        path: 'test.md',
        data: base64Data,
        mtime: Date.now(),
        ctime: Date.now(),
        size: plainText.length,
      };

      const result = await assembler.assembleDocument(doc);

      expect(result).toBe(plainText);
    });

    it('should return null for empty data field', async () => {
      const doc: LiveSyncDocument = {
        _id: 'empty.md',
        _rev: '1-abc',
        type: 'newnote',
        path: 'empty.md',
        data: '', // Empty string is falsy, so it's skipped
        mtime: Date.now(),
        ctime: Date.now(),
        size: 0,
      };

      const result = await assembler.assembleDocument(doc);

      // Empty string data field is treated as no data source
      expect(result).toBeNull();
    });
  });

  describe('assembleDocument - Eden cache strategy', () => {
    it('should assemble document from eden cache', async () => {
      const chunk1 = 'First chunk';
      const chunk2 = 'Second chunk';

      const doc: LiveSyncDocument = {
        _id: 'eden-test.md',
        _rev: '1-def',
        type: 'newnote',
        path: 'eden-test.md',
        eden: {
          'chunk1': {
            data: Buffer.from(chunk1).toString('base64'),
            epoch: 1,
          },
          'chunk2': {
            data: Buffer.from(chunk2).toString('base64'),
            epoch: 2,
          },
        },
        mtime: Date.now(),
        ctime: Date.now(),
        size: chunk1.length + chunk2.length,
      };

      const result = await assembler.assembleDocument(doc);

      expect(result).toBe('First chunkSecond chunk');
    });

    it('should sort eden chunks by epoch', async () => {
      const doc: LiveSyncDocument = {
        _id: 'eden-order.md',
        _rev: '1-ghi',
        type: 'newnote',
        path: 'eden-order.md',
        eden: {
          'chunk3': {
            data: Buffer.from('Third').toString('base64'),
            epoch: 3,
          },
          'chunk1': {
            data: Buffer.from('First').toString('base64'),
            epoch: 1,
          },
          'chunk2': {
            data: Buffer.from('Second').toString('base64'),
            epoch: 2,
          },
        },
        mtime: Date.now(),
        ctime: Date.now(),
        size: 15,
      };

      const result = await assembler.assembleDocument(doc);

      expect(result).toBe('FirstSecondThird');
    });

    it('should handle empty eden object', async () => {
      const doc: LiveSyncDocument = {
        _id: 'empty-eden.md',
        _rev: '1-jkl',
        type: 'newnote',
        path: 'empty-eden.md',
        eden: {},
        mtime: Date.now(),
        ctime: Date.now(),
        size: 0,
      };

      const result = await assembler.assembleDocument(doc);

      // Empty eden should fall through to return null
      expect(result).toBeNull();
    });
  });

  describe('assembleDocument - Children chunks strategy', () => {
    it('should assemble document from children chunks', async () => {
      const chunk1Data = 'Chunk one content';
      const chunk2Data = 'Chunk two content';

      const doc: LiveSyncDocument = {
        _id: 'children-test.md',
        _rev: '1-mno',
        type: 'newnote',
        path: 'children-test.md',
        children: ['h:+chunk1', 'h:+chunk2'],
        mtime: Date.now(),
        ctime: Date.now(),
        size: chunk1Data.length + chunk2Data.length,
      };

      // Mock getDocuments to return chunk documents
      mockStorage.getDocuments = vi.fn(async () => {
        const chunks = new Map<string, LiveSyncDocument>();
        chunks.set('h:+chunk1', {
          _id: 'h:+chunk1',
          _rev: '1-c1',
          type: 'leaf',
          data: Buffer.from(chunk1Data).toString('base64'),
        } as LiveSyncDocument);
        chunks.set('h:+chunk2', {
          _id: 'h:+chunk2',
          _rev: '1-c2',
          type: 'leaf',
          data: Buffer.from(chunk2Data).toString('base64'),
        } as LiveSyncDocument);
        return chunks;
      });

      const result = await assembler.assembleDocument(doc);

      expect(result).toBe('Chunk one contentChunk two content');
      expect(mockStorage.getDocuments).toHaveBeenCalledWith(['h:+chunk1', 'h:+chunk2']);
    });

    it('should throw error if chunk is not found', async () => {
      const doc: LiveSyncDocument = {
        _id: 'missing-chunk.md',
        _rev: '1-pqr',
        type: 'newnote',
        path: 'missing-chunk.md',
        children: ['h:+chunk1', 'h:+missing'],
        mtime: Date.now(),
        ctime: Date.now(),
        size: 100,
      };

      // Mock getDocuments to return only one chunk
      mockStorage.getDocuments = vi.fn(async () => {
        const chunks = new Map<string, LiveSyncDocument>();
        chunks.set('h:+chunk1', {
          _id: 'h:+chunk1',
          _rev: '1-c1',
          type: 'leaf',
          data: Buffer.from('data').toString('base64'),
        } as LiveSyncDocument);
        // h:+missing is not in the map
        return chunks;
      });

      await expect(assembler.assembleDocument(doc)).rejects.toThrow('Chunk not found: h:+missing');
    });

    it('should throw error if chunk has no data field', async () => {
      const doc: LiveSyncDocument = {
        _id: 'no-data-chunk.md',
        _rev: '1-stu',
        type: 'newnote',
        path: 'no-data-chunk.md',
        children: ['h:+chunk1'],
        mtime: Date.now(),
        ctime: Date.now(),
        size: 100,
      };

      mockStorage.getDocuments = vi.fn(async () => {
        const chunks = new Map<string, LiveSyncDocument>();
        chunks.set('h:+chunk1', {
          _id: 'h:+chunk1',
          _rev: '1-c1',
          type: 'leaf',
          // No data field
        } as LiveSyncDocument);
        return chunks;
      });

      await expect(assembler.assembleDocument(doc)).rejects.toThrow('Chunk has no data: h:+chunk1');
    });
  });

  describe('assembleDocument - No data source', () => {
    it('should return null if document has no data source', async () => {
      const doc: LiveSyncDocument = {
        _id: 'no-data.md',
        _rev: '1-vwx',
        type: 'newnote',
        path: 'no-data.md',
        // No data, eden, or children
        mtime: Date.now(),
        ctime: Date.now(),
        size: 0,
      };

      const result = await assembler.assembleDocument(doc);

      expect(result).toBeNull();
    });
  });

  describe('Strategy priority', () => {
    it('should prefer direct data over eden', async () => {
      const directData = 'Direct data content';
      const edenData = 'Eden data content';

      const doc: LiveSyncDocument = {
        _id: 'priority-test.md',
        _rev: '1-xyz',
        type: 'newnote',
        path: 'priority-test.md',
        data: Buffer.from(directData).toString('base64'),
        eden: {
          'chunk1': {
            data: Buffer.from(edenData).toString('base64'),
            epoch: 1,
          },
        },
        mtime: Date.now(),
        ctime: Date.now(),
        size: directData.length,
      };

      const result = await assembler.assembleDocument(doc);

      // Should use direct data, not eden
      expect(result).toBe(directData);
    });

    it('should prefer eden over children', async () => {
      const edenData = 'Eden data content';

      const doc: LiveSyncDocument = {
        _id: 'priority-test2.md',
        _rev: '1-abc',
        type: 'newnote',
        path: 'priority-test2.md',
        eden: {
          'chunk1': {
            data: Buffer.from(edenData).toString('base64'),
            epoch: 1,
          },
        },
        children: ['h:+chunk1'],
        mtime: Date.now(),
        ctime: Date.now(),
        size: edenData.length,
      };

      const result = await assembler.assembleDocument(doc);

      // Should use eden, not children (getDocuments should not be called)
      expect(result).toBe(edenData);
      expect(mockStorage.getDocuments).not.toHaveBeenCalled();
    });
  });
});

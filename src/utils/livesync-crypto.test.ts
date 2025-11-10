import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LiveSyncCrypto } from './livesync-crypto.js';
import type { IDocumentStorage } from '../core/interfaces.js';
import type { LiveSyncDocument } from '../types/index.js';

describe('LiveSyncCrypto', () => {
  let mockStorage: IDocumentStorage;
  let crypto: LiveSyncCrypto;
  const testPassphrase = 'test-passphrase-123';
  const testSalt = Buffer.from('test-salt-for-pbkdf2').toString('base64');

  beforeEach(() => {
    // Mock storage that returns sync parameters
    mockStorage = {
      getDocument: vi.fn(async (id: string) => {
        if (id === '_local/obsidian_livesync_sync_parameters') {
          return {
            _id: id,
            pbkdf2salt: testSalt,
          } as unknown as LiveSyncDocument;
        }
        return null;
      }),
      getDocuments: vi.fn(),
      getAllDocuments: vi.fn(),
    };

    crypto = new LiveSyncCrypto(mockStorage, testPassphrase);
  });

  describe('isEncrypted', () => {
    it('should detect encrypted data with %= prefix', () => {
      expect(crypto.isEncrypted('%=encrypted_data')).toBe(true);
    });

    it('should detect non-encrypted data', () => {
      expect(crypto.isEncrypted('plain_data')).toBe(false);
      expect(crypto.isEncrypted('SGVsbG8gV29ybGQ=')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(crypto.isEncrypted('')).toBe(false);
    });
  });

  describe('getPBKDF2Salt', () => {
    it('should retrieve salt from sync parameters document', async () => {
      const salt = await (crypto as any).getPBKDF2Salt();

      expect(mockStorage.getDocument).toHaveBeenCalledWith(
        '_local/obsidian_livesync_sync_parameters'
      );
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(salt).toString('base64')).toBe(testSalt);
    });

    it('should cache salt after first retrieval', async () => {
      await (crypto as any).getPBKDF2Salt();
      await (crypto as any).getPBKDF2Salt();

      // Should only call getDocument once due to caching
      expect(mockStorage.getDocument).toHaveBeenCalledTimes(1);
    });

    it('should throw error if sync parameters document not found', async () => {
      mockStorage.getDocument = vi.fn(async () => null);

      await expect((crypto as any).getPBKDF2Salt()).rejects.toThrow(
        'Sync parameters document not found'
      );
    });

    it('should throw error if pbkdf2salt field is missing', async () => {
      mockStorage.getDocument = vi.fn(async () => ({
        _id: '_local/obsidian_livesync_sync_parameters',
      } as LiveSyncDocument));

      await expect((crypto as any).getPBKDF2Salt()).rejects.toThrow(
        'Failed to load encryption salt: pbkdf2salt not found in sync parameters document'
      );
    });
  });

  describe('decrypt', () => {
    it('should return plain text for non-encrypted data', async () => {
      const plainText = 'Hello World';
      const result = await crypto.decrypt(plainText);

      expect(result).toBe(plainText);
    });

    it('should handle base64 encoded plain text', async () => {
      const plainText = 'Hello World';
      const base64 = Buffer.from(plainText).toString('base64');
      const result = await crypto.decrypt(base64);

      // Should return as-is since it's not encrypted (no %= prefix)
      expect(result).toBe(base64);
    });
  });

  describe('decryptBatch', () => {
    it('should decrypt multiple plain text items', async () => {
      const dataItems = ['plain1', 'plain2', 'plain3'];

      const results = await crypto.decryptBatch(dataItems);

      expect(results).toHaveLength(3);
      expect(results[0]).toBe('plain1');
      expect(results[1]).toBe('plain2');
      expect(results[2]).toBe('plain3');
    });

    it('should handle empty array', async () => {
      const results = await crypto.decryptBatch([]);
      expect(results).toHaveLength(0);
    });
  });
});

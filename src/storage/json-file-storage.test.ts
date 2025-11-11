import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { JsonFileStorage } from './json-file-storage.js';
import type { SyncState } from '../core/interfaces.js';

describe('JsonFileStorage', () => {
  let storage: JsonFileStorage;
  let testDir: string;
  let testFilePath: string;

  beforeEach(() => {
    // Use a unique test directory for each test
    testDir = `.test-storage-${Date.now()}`;
    testFilePath = path.join(testDir, '.obs-ls-headless-state.json');
    storage = new JsonFileStorage(testDir);
  });

  afterEach(async () => {
    // Clean up test file and directory
    try {
      await fs.unlink(testFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
    try {
      await fs.rmdir(testDir);
    } catch {
      // Ignore if directory doesn't exist
    }
  });

  describe('constructor', () => {
    it('should create instance with default base directory', () => {
      const defaultStorage = new JsonFileStorage();
      expect(defaultStorage).toBeInstanceOf(JsonFileStorage);
    });

    it('should create instance with custom base directory', () => {
      const customStorage = new JsonFileStorage('/custom/data');
      expect(customStorage).toBeInstanceOf(JsonFileStorage);
    });
  });

  describe('initialize', () => {
    it('should throw "Not implemented" error', async () => {
      await expect(storage.initialize()).rejects.toThrow('Not implemented');
    });
  });

  describe('getState', () => {
    it('should throw "Not implemented" error', async () => {
      await expect(storage.getState()).rejects.toThrow('Not implemented');
    });
  });

  describe('saveState', () => {
    it('should throw "Not implemented" error', async () => {
      const state: SyncState = { lastSeq: '123' };
      await expect(storage.saveState(state)).rejects.toThrow('Not implemented');
    });
  });

  describe('updateState', () => {
    it('should throw "Not implemented" error', async () => {
      await expect(storage.updateState({ lastSeq: '123' })).rejects.toThrow(
        'Not implemented'
      );
    });
  });

  describe('resetState', () => {
    it('should throw "Not implemented" error', async () => {
      await expect(storage.resetState()).rejects.toThrow('Not implemented');
    });
  });
});

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
    it('should create base directory if it does not exist', async () => {
      await storage.initialize();

      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should succeed if directory already exists', async () => {
      await fs.mkdir(testDir, { recursive: true });
      await expect(storage.initialize()).resolves.not.toThrow();
    });

    it('should succeed multiple times', async () => {
      await storage.initialize();
      await storage.initialize();
      await storage.initialize();

      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return empty state when file does not exist', async () => {
      const state = await storage.getState();
      expect(state).toEqual({});
    });

    it('should load state from file', async () => {
      const expectedState: SyncState = {
        lastSeq: '789-ghi',
        lastSyncTime: '2025-11-11T14:00:00.000Z',
      };

      // First save the state
      await storage.saveState(expectedState);

      // Then load it
      const loadedState = await storage.getState();
      expect(loadedState).toEqual(expectedState);
    });

    it('should load empty state from file', async () => {
      const expectedState: SyncState = {};

      await storage.saveState(expectedState);
      const loadedState = await storage.getState();

      expect(loadedState).toEqual({});
    });

    it('should load state with only lastSeq', async () => {
      const expectedState: SyncState = { lastSeq: '999' };

      await storage.saveState(expectedState);
      const loadedState = await storage.getState();

      expect(loadedState).toEqual(expectedState);
    });

    it('should throw error for invalid JSON', async () => {
      // Create directory and write invalid JSON
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testFilePath, 'invalid json content', 'utf-8');

      await expect(storage.getState()).rejects.toThrow();
    });
  });

  describe('saveState', () => {
    it('should save state to file', async () => {
      const state: SyncState = {
        lastSeq: '123-abc',
        lastSyncTime: '2025-11-11T10:00:00.000Z',
      };

      await storage.saveState(state);

      // Verify file exists
      const fileContent = await fs.readFile(testFilePath, 'utf-8');
      const savedState = JSON.parse(fileContent);

      expect(savedState).toEqual(state);
    });

    it('should create directory if it does not exist', async () => {
      const state: SyncState = { lastSeq: '456-def' };

      await storage.saveState(state);

      // Verify directory was created
      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);

      // Verify file was created
      const fileContent = await fs.readFile(testFilePath, 'utf-8');
      const savedState = JSON.parse(fileContent);
      expect(savedState).toEqual(state);
    });

    it('should overwrite existing state', async () => {
      const state1: SyncState = { lastSeq: '100' };
      const state2: SyncState = { lastSeq: '200', lastSyncTime: '2025-11-11T12:00:00.000Z' };

      await storage.saveState(state1);
      await storage.saveState(state2);

      const fileContent = await fs.readFile(testFilePath, 'utf-8');
      const savedState = JSON.parse(fileContent);

      expect(savedState).toEqual(state2);
    });

    it('should save empty state', async () => {
      const state: SyncState = {};

      await storage.saveState(state);

      const fileContent = await fs.readFile(testFilePath, 'utf-8');
      const savedState = JSON.parse(fileContent);

      expect(savedState).toEqual({});
    });
  });

  describe('updateState', () => {
    it('should update partial state', async () => {
      const initialState: SyncState = {
        lastSeq: '100',
        lastSyncTime: '2025-11-11T10:00:00.000Z',
      };
      await storage.saveState(initialState);

      await storage.updateState({ lastSeq: '200' });

      const updatedState = await storage.getState();
      expect(updatedState).toEqual({
        lastSeq: '200',
        lastSyncTime: '2025-11-11T10:00:00.000Z',
      });
    });

    it('should add new fields to existing state', async () => {
      await storage.saveState({ lastSeq: '100' });

      await storage.updateState({ lastSyncTime: '2025-11-11T12:00:00.000Z' });

      const updatedState = await storage.getState();
      expect(updatedState).toEqual({
        lastSeq: '100',
        lastSyncTime: '2025-11-11T12:00:00.000Z',
      });
    });

    it('should create state if file does not exist', async () => {
      await storage.updateState({ lastSeq: '300' });

      const state = await storage.getState();
      expect(state).toEqual({ lastSeq: '300' });
    });

    it('should handle multiple updates', async () => {
      await storage.updateState({ lastSeq: '100' });
      await storage.updateState({ lastSyncTime: '2025-11-11T10:00:00.000Z' });
      await storage.updateState({ lastSeq: '200' });

      const state = await storage.getState();
      expect(state).toEqual({
        lastSeq: '200',
        lastSyncTime: '2025-11-11T10:00:00.000Z',
      });
    });
  });

  describe('resetState', () => {
    it('should delete state file', async () => {
      await storage.saveState({ lastSeq: '100' });

      await storage.resetState();

      // File should not exist
      await expect(fs.access(testFilePath)).rejects.toThrow();
    });

    it('should succeed if file does not exist', async () => {
      await expect(storage.resetState()).resolves.not.toThrow();
    });

    it('should return empty state after reset', async () => {
      await storage.saveState({ lastSeq: '100', lastSyncTime: '2025-11-11T10:00:00.000Z' });
      await storage.resetState();

      const state = await storage.getState();
      expect(state).toEqual({});
    });

    it('should allow saving new state after reset', async () => {
      await storage.saveState({ lastSeq: '100' });
      await storage.resetState();
      await storage.saveState({ lastSeq: '200' });

      const state = await storage.getState();
      expect(state).toEqual({ lastSeq: '200' });
    });
  });
});

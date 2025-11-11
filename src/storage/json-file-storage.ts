import { promises as fs } from 'fs';
import path from 'path';
import { IStateStorage, SyncState } from '../core/interfaces.js';
import logger from '../utils/logger.js';

/**
 * JSON file-based state storage implementation
 * Stores sync state in a local JSON file
 */
export class JsonFileStorage implements IStateStorage {
  private baseDir: string;
  private readonly fileName = '.obs-ls-headless-state.json';

  constructor(baseDir: string = '.') {
    this.baseDir = baseDir;
  }

  /**
   * Get the full file path for the state file
   */
  private getFilePath(): string {
    return path.join(this.baseDir, this.fileName);
  }

  async initialize(): Promise<void> {
    try {
      // Ensure base directory exists
      await fs.mkdir(this.baseDir, { recursive: true });
      logger.debug({ baseDir: this.baseDir }, 'Storage initialized');
    } catch (error) {
      logger.error({ error, baseDir: this.baseDir }, 'Failed to initialize storage');
      throw error;
    }
  }

  async getState(): Promise<SyncState> {
    const filePath = this.getFilePath();
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const state = JSON.parse(content) as SyncState;
      logger.debug({ filePath, state }, 'State loaded successfully');
      return state;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty state
        logger.debug({ filePath }, 'State file not found, returning empty state');
        return {};
      }
      logger.error({ error, filePath }, 'Failed to load state');
      throw error;
    }
  }

  async saveState(state: SyncState): Promise<void> {
    const filePath = this.getFilePath();
    try {
      // Ensure directory exists
      await fs.mkdir(this.baseDir, { recursive: true });

      // Write state to file
      const json = JSON.stringify(state, null, 2);
      await fs.writeFile(filePath, json, 'utf-8');

      logger.debug({ filePath, state }, 'State saved successfully');
    } catch (error) {
      logger.error({ error, filePath }, 'Failed to save state');
      throw error;
    }
  }

  async updateState(partial: Partial<SyncState>): Promise<void> {
    const currentState = await this.getState();
    const newState = { ...currentState, ...partial };
    await this.saveState(newState);
    logger.debug({ partial, newState }, 'State updated');
  }

  async resetState(): Promise<void> {
    const filePath = this.getFilePath();
    try {
      await fs.unlink(filePath);
      logger.debug({ filePath }, 'State reset (file deleted)');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, nothing to reset
        logger.debug({ filePath }, 'State file not found, nothing to reset');
        return;
      }
      logger.error({ error, filePath }, 'Failed to reset state');
      throw error;
    }
  }
}

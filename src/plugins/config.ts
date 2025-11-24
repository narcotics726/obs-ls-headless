import { existsSync, readFileSync } from 'node:fs';

import logger from '../utils/logger.js';
import type { PluginConfig } from './types.js';

/**
 * Load plugin configs from a JSON file, returning an array.
 * - Supports either a raw array of PluginConfig or an object with `plugins` array.
 * - On error, returns an empty array and logs the issue.
 */
export function loadPluginConfigsFromFile(configPath?: string): PluginConfig[] {
  if (!configPath) {
    return [];
  }

  try {
    if (!existsSync(configPath)) {
      logger.warn({ configPath }, 'Plugin config file does not exist, skipping.');
      return [];
    }

    const content = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content) as { plugins?: PluginConfig[] } | PluginConfig[];

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed.plugins && Array.isArray(parsed.plugins)) {
      return parsed.plugins;
    }

    logger.warn({ configPath }, 'Plugin config file does not contain a plugins array, skipping.');
    return [];
  } catch (error) {
    logger.error({ err: error, configPath }, 'Failed to load plugin config file.');
    return [];
  }
}

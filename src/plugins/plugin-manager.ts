/**
 * PluginManager orchestrates configured plugins.
 * Minimal skeleton: start/stop all plugins based on provided configs.
 */
import logger from '../utils/logger.js';
import type { PluginConfig, PluginEventPayload } from './types.js';
import { PluginProcess } from './plugin-process.js';
import { PluginEventBridge } from './event-bridge.js';

export class PluginManager {
  private readonly processes = new Map<string, PluginProcess>();
  private eventBridge?: PluginEventBridge;

  constructor(private readonly configs: PluginConfig[]) {}

  async startAll(): Promise<void> {
    for (const config of this.configs) {
      if (config.enabled === false) {
        logger.info({ plugin: config.name }, 'Plugin disabled; skipping start.');
        continue;
      }

      if (this.processes.has(config.name)) {
        logger.warn({ plugin: config.name }, 'Plugin already managed; skipping start.');
        continue;
      }

      const processWrapper = new PluginProcess(config);
      this.processes.set(config.name, processWrapper);
      await processWrapper.start();
    }

    this.eventBridge = new PluginEventBridge([...this.processes.values()]);
  }

  async stopAll(): Promise<void> {
    for (const [name, processWrapper] of this.processes) {
      logger.info({ plugin: name }, 'Stopping plugin.');
      await processWrapper.stop();
    }

    this.processes.clear();
    this.eventBridge = undefined;
  }

  async broadcastEvent(event: PluginEventPayload): Promise<void> {
    if (!this.eventBridge) {
      return;
    }
    await this.eventBridge.broadcast(event);
  }

  getProcess(name: string): PluginProcess | undefined {
    return this.processes.get(name);
  }
}

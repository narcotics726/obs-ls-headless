// PluginManager using simplified PluginProcess for cleaner lifecycle management.
import type { NotifyPayload, PluginConfig, PluginHandle } from './types.js';
import { PluginProcess } from './plugin-process.js';
import logger from '../utils/logger.js';
import { EventEmitter } from 'node:events';

export class PluginManager {
  private readonly processes = new Map<string, PluginProcess>();
  private readonly handles = new Map<string, PluginHandle>();
  private readonly hostVersion = '0.0.0'; // TODO: inject from package metadata/config.
  private readonly ev = new EventEmitter();

  constructor(
    private readonly configs: PluginConfig[],
  ) {}

  // Start all configured plugins and perform handshake.
  async startAll(): Promise<void> {
    for (const config of this.configs) {
      // Skip if already started
      if (this.handles.has(config.name)) {
        continue;
      }

      logger.info({ plugin: config.name }, 'Starting plugin');

      try {
        // Create and start plugin process
        const process = new PluginProcess(config, {
          hostVersion: this.hostVersion,
          onNotification: (method, params) => {
            this.ev.emit('notification', config.name, method, params);
          },
        });

        const handle = await process.start();

        // Store both process and handle
        this.processes.set(config.name, process);
        this.handles.set(config.name, handle);

        logger.info({ plugin: config.name }, 'Plugin started successfully');

      } catch (error) {
        // According to PLUGINS_PLAN.md: plugin failure should not affect other plugins
        logger.error({ plugin: config.name, error }, 'Failed to start plugin');
        // Clean up any partial state
        this.processes.delete(config.name);
        this.handles.delete(config.name);
        // Continue with other plugins
      }
    }
  }

  // Broadcast event to all plugins that subscribe to the event type.
  async broadcast(event: NotifyPayload): Promise<void> {
    const tasks: Promise<void>[] = [];

    this.handles.forEach((handle, name) => {
      const process = this.processes.get(name);
      if (!process) {
        return;
      }

      // Check subscription
      const subscribed = handle.subscribedEvents;
      if (!subscribed.has('*') && !subscribed.has(event.eventType)) {
        return;
      }

      // Send notification via PluginProcess
      tasks.push(
        process.sendNotification(event).catch(error => {
          logger.error({ plugin: name, error }, 'Failed to send plugin notification');
        })
      );
    });

    await Promise.all(tasks);
  }

  // Stop all plugins and dispose resources.
  async stopAll(): Promise<void> {
    const stopTasks: Promise<void>[] = [];

    this.processes.forEach((process, name) => {
      stopTasks.push(
        process.stop().catch(error => {
          logger.error({ plugin: name, error }, 'Error stopping plugin');
        })
      );
    });

    // Wait for all processes to stop
    await Promise.all(stopTasks);

    // Clear all state
    this.processes.clear();
    this.handles.clear();
  }

  onPluginNotification(callback: (plugin: string, method: string, params: unknown) => void): void {
    this.ev.on('notification', callback);
  }
}

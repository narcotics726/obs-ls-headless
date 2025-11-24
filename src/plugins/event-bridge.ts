import logger from '../utils/logger.js';
import type { PluginProcess } from './plugin-process.js';
import type { PluginEventPayload } from './types.js';

/**
 * Minimal event bridge: push events to plugins based on their subscriptions.
 * - Subscription list is derived from PluginProcess.handshake result.
 * - "*" means all events.
 */
export class PluginEventBridge {
  constructor(private readonly pluginProcesses: PluginProcess[]) {}

  async broadcast(event: PluginEventPayload): Promise<void> {
    const tasks: Promise<void>[] = [];

    for (const processWrapper of this.pluginProcesses) {
      const subscribed = processWrapper.getSubscribedEvents();
      if (!this.shouldSend(event.eventType, subscribed)) {
        continue;
      }

      const client = processWrapper.getRpcClient();
      if (!client) {
        continue;
      }

      tasks.push(
        client
          .sendNotification({
            jsonrpc: '2.0',
            method: 'plugin/onEvent',
            params: event,
          })
          .catch((err) => {
            logger.error(
              { err, plugin: processWrapper.constructor.name, eventType: event.eventType },
              'Failed to deliver event to plugin',
            );
          }),
      );
    }

    await Promise.all(tasks);
  }

  private shouldSend(eventType: string, subscribed: Set<string>): boolean {
    return subscribed.has('*') || subscribed.has(eventType);
  }
}

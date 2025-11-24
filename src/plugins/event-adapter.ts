import type { IEventBus } from '../core/event-bus.js';
import type { PluginManager } from './plugin-manager.js';
import type { LiveSyncEvent } from '../types/index.js';

/**
 * Create an adapter that forwards EventBus events to plugins via PluginManager.
 * Returns an unsubscribe function for clean teardown.
 */
export function createPluginEventAdapter(
  eventBus: IEventBus,
  pluginManager: PluginManager,
): () => void {
  const handler = async (event: LiveSyncEvent) => {
    await pluginManager.broadcastEvent({
      eventType: event.type,
      timestamp: event.timestamp.toISOString(),
      payload: event.payload,
      metadata: event.metadata,
    });
  };

  eventBus.subscribe('*', handler);

  return () => {
    eventBus.unsubscribe('*', handler);
  };
}

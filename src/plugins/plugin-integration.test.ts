import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';

import { createEventBus } from '../core/event-bus.js';
import { PluginManager } from './plugin-manager.js';
import { EventType } from '../types/index.js';

const echoPluginPath = resolve(
  process.cwd(),
  'src/plugins/examples/plugins/echo-plugin.js',
);

const echoConfig = {
  name: 'echo-plugin',
  command: 'node',
  args: [echoPluginPath],
  enabled: true,
  handshakeTimeoutMs: 3000,
  shutdownTimeoutMs: 2000,
  rpcTimeoutMs: 5000,
  events: { include: ['*'], exclude: [] },
  allowReverseRpc: false,
  routePrefix: '/api/plugins/echo',
};

describe(
  'Plugin integration (EventBus -> PluginManager -> plugin)',
  () => {
    let manager: PluginManager;

    beforeAll(async () => {
      manager = new PluginManager([echoConfig]);
      await manager.startAll();
    }, 10_000);

    afterAll(async () => {
      if (manager) {
        await manager.stopAll();
      }
    }, 10_000);

    it(
      'forwards EventBus events to plugin without throwing',
      async () => {
        const eventBus = createEventBus();
        const handler = async (event: any) => {
          await manager.broadcastEvent({
            eventType: event.type,
            timestamp: event.timestamp.toISOString(),
            payload: event.payload,
            metadata: event.metadata,
          });
        };
        eventBus.subscribe('*', handler);

        await eventBus.emit({
          type: EventType.SyncStarted,
          timestamp: new Date(),
          source: 'test',
          payload: { via: 'integration-test' },
        });

        eventBus.unsubscribe('*', handler);
        expect(manager).toBeDefined();
      },
      10_000,
    );
  },
);

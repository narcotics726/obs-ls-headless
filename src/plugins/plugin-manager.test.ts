import { afterAll, describe, expect, test } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PluginManager } from './plugin-manager.js';
import { EventType } from '../types/index.js';
import type { PluginConfig } from './types.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nodeBin = process.execPath;
const fixture = (name: string) => path.resolve(__dirname, 'test-fixtures', name);


describe('PluginManager (debug harness)', () => {
  afterAll(async () => {
    logger.info('PluginManager test harness complete');
    await new Promise(resolve => logger.flush(resolve));
  });
  test('start, broadcast, stop', async () => {
    const configs: PluginConfig[] = [
      {
        name: 'plugin-basic',
        command: nodeBin,
        args: [fixture('plugin-stable.js')],
        env: { PLUGIN_NAME: 'plugin-basic' },
      },
    ];
    const manager = new PluginManager(configs);
    await manager.startAll();
    await manager.broadcast({
      eventType: EventType.SyncCompleted,
      eventId: 'debug-1',
      timestamp: Date.now(),
      payload: { changedPaths: ['foo.md'] },
    });
    await manager.stopAll();
  });

  test('startAll should handle empty configs gracefully', async () => {
    const manager = new PluginManager([]);
    await manager.startAll();
    await manager.stopAll();
  });

  test('broadcast should be a no-op when no plugins are running', async () => {
    const manager = new PluginManager([]);
    await manager.startAll();
    await manager.broadcast({
      eventType: EventType.SyncCompleted,
      eventId: 'no-plugins',
      timestamp: Date.now(),
      payload: {},
    });
    await manager.stopAll();
  });

  test('startAll should spawn processes and complete handshake per config', async () => {
    const configs: PluginConfig[] = [
      {
        name: 'mock-plugin',
        command: 'bash',
        args: ['src/plugins/test-fixtures/mock-plugin.sh'],
        handshakeTimeoutMs: 2000,
      },
    ];
    const manager = new PluginManager(configs);

    await manager.startAll();
    await manager.broadcast({
      eventType: EventType.SyncCompleted,
      eventId: 'debug-2',
      timestamp: Date.now(),
      payload: { changedPaths: ['bar.md'] },
    });
    await manager.stopAll();
  });

  test('broadcast should deliver only to plugins that subscribe to the event type', async () => {
    const received: Record<string, string[]> = {};
    const configs: PluginConfig[] = [
      {
        name: 'plugin-a',
        command: nodeBin,
        args: [fixture('plugin-stable.js')],
        env: { EVENTS: EventType.SyncCompleted },
      },
      {
        name: 'plugin-b',
        command: nodeBin,
        args: [fixture('plugin-stable.js')],
        env: { EVENTS: EventType.NoteIndexed },
      },
    ];
    const manager = new PluginManager(configs);
    manager.onPluginNotification((plugin, _method, params) => {
      if (!received[plugin]) {
        received[plugin] = [];
      }
      received[plugin].push(params as string);
    });

    await manager.startAll();
    await manager.broadcast({
      eventType: EventType.SyncCompleted,
      eventId: 'subscribed-only',
      timestamp: Date.now(),
      payload: {},
    });

    // Wait briefly for notifications to round-trip.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await manager.stopAll();

    const parseEventType = (payload: string): string | undefined => {
      try {
        const parsed = JSON.parse(payload);
        return parsed?.params?.eventType;
      } catch {
        return undefined;
      }
    };

    const aEventTypes = received['plugin-a'].map(parseEventType).filter(Boolean);
    const bEventTypes = received['plugin-b']?.map(parseEventType).filter(Boolean) ?? [];

    expect(aEventTypes).toContain(EventType.SyncCompleted);
    expect(bEventTypes).toHaveLength(0);
  });

  test('broadcast should honor wildcard subscriptions', async () => {
    const received: Record<string, string[]> = {};
    const configs: PluginConfig[] = [
      {
        name: 'plugin-wildcard',
        command: nodeBin,
        args: [fixture('plugin-stable.js')],
        // EVENTS defaults to '*' in fixture.
      },
      {
        name: 'plugin-specific',
        command: nodeBin,
        args: [fixture('plugin-stable.js')],
        env: { EVENTS: EventType.NoteIndexed },
      },
    ];
    const manager = new PluginManager(configs);
    manager.onPluginNotification((plugin, method, params) => {
      if (method !== 'log') return;
      if (!received[plugin]) {
        received[plugin] = [];
      }
      received[plugin].push(params as string);
    });

    await manager.startAll();
    await manager.broadcast({
      eventType: EventType.SyncCompleted,
      eventId: 'wild-1',
      timestamp: Date.now(),
      payload: {},
    });
    await manager.broadcast({
      eventType: EventType.NoteIndexed,
      eventId: 'wild-2',
      timestamp: Date.now(),
      payload: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await manager.stopAll();

    const parseEventType = (payload: string): string | undefined => {
      try {
        const parsed = JSON.parse(payload);
        return parsed?.params?.eventType;
      } catch {
        return undefined;
      }
    };

    const wildcardEvents = received['plugin-wildcard']?.map(parseEventType).filter(Boolean) ?? [];
    const specificEvents = received['plugin-specific']?.map(parseEventType).filter(Boolean) ?? [];

    expect(wildcardEvents).toEqual(expect.arrayContaining([EventType.SyncCompleted, EventType.NoteIndexed]));
    expect(specificEvents).toEqual(expect.arrayContaining([EventType.NoteIndexed]));
    expect(specificEvents).not.toContain(EventType.SyncCompleted);
  });

  test('stopAll should be idempotent and clean up resources even after partial start', async () => {
    const configs: PluginConfig[] = [
      {
        name: 'plugin-ok',
        command: nodeBin,
        args: [fixture('plugin-stable.js')],
        env: { PLUGIN_NAME: 'plugin-ok' },
      },
      {
        name: 'plugin-hangs',
        command: nodeBin,
        args: [fixture('plugin-silent-handshake.js')],
        handshakeTimeoutMs: 100,
      },
    ];
    const manager = new PluginManager(configs);
    await expect(manager.startAll()).resolves.not.toThrow();
    await expect(manager.stopAll()).resolves.not.toThrow();
    await expect(manager.stopAll()).resolves.not.toThrow();
  });

  test('startAll should fail fast when handshake times out', async () => {
    const configs: PluginConfig[] = [
      {
        name: 'plugin-timeout',
        command: nodeBin,
        args: [fixture('plugin-silent-handshake.js')],
        handshakeTimeoutMs: 100,
      },
    ];
    const manager = new PluginManager(configs);
    const start = Date.now();
    await expect(manager.startAll()).resolves.not.toThrow();
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
    await manager.stopAll();
  });
});

describe('PluginManager failure isolation', () => {
  test('broadcast should continue delivering to healthy plugins when one crashes on notify', async () => {
    const received: Array<{ plugin: string; payload: unknown }> = [];
    const configs: PluginConfig[] = [
      {
        name: 'stable',
        command: nodeBin,
        args: [fixture('plugin-stable.js')],
        env: { PLUGIN_NAME: 'stable' },
      },
      {
        name: 'crashy',
        command: nodeBin,
        args: [fixture('plugin-fail-on-notify.js')],
        env: { PLUGIN_NAME: 'crashy' },
      },
    ];

    const manager = new PluginManager(configs);
    manager.onPluginNotification((plugin, method, params) => {
      if (method !== 'log') return;
      received.push({ plugin, payload: params });
    });

    await manager.startAll();
    await manager.broadcast({
      eventType: EventType.SyncCompleted,
      eventId: 'broadcast-1',
      timestamp: Date.now(),
      payload: { changedPaths: ['a.md'] },
    });
    // Allow logs to flush.
    await new Promise(resolve => setTimeout(resolve, 500));
    await manager.stopAll();

    const stableLogs = received.filter(r => r.plugin === 'stable');
    expect(stableLogs.length).toBeGreaterThan(0);

    const parsedPayloads = stableLogs
      .map(r => {
        try {
          return JSON.parse(r.payload as string);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const eventTypes = parsedPayloads.map(p => p?.params?.eventType);
    expect(eventTypes).toContain(EventType.SyncCompleted);
  });
});

describe('PluginManager exit handling', () => {
  test('plugin exit should not break subsequent broadcast or stop', async () => {
    const configs: PluginConfig[] = [
      {
        name: 'ephemeral',
        command: nodeBin,
        args: [fixture('plugin-exits-after-handshake.js')],
        env: { PLUGIN_NAME: 'ephemeral' },
      },
    ];

    const manager = new PluginManager(configs);
    await manager.startAll();

    // Wait for the plugin to exit on its own.
    await new Promise(resolve => setTimeout(resolve, 500));

    await expect(
      manager.broadcast({
        eventType: EventType.SyncCompleted,
        eventId: 'after-exit',
        timestamp: Date.now(),
        payload: {},
      })
    ).resolves.not.toThrow();

    await manager.stopAll();
  });
});

describe('PluginManager handshake failure handling', () => {
  test('startAll should log and clean state when handshake times out', async () => {
    const configs: PluginConfig[] = [
      {
        name: 'silent',
        command: nodeBin,
        args: [fixture('plugin-silent-handshake.js')],
        handshakeTimeoutMs: 200,
      },
    ];

    const manager = new PluginManager(configs);
    await manager.startAll();

    const processes = (manager as any).processes as Map<string, unknown>;
    const handles = (manager as any).handles as Map<string, unknown>;
    expect(processes.size).toBe(0);
    expect(handles.size).toBe(0);

    await expect(manager.stopAll()).resolves.not.toThrow();
  });
});

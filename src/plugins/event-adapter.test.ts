import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPluginEventAdapter } from './event-adapter.js';

const mockBroadcastEvent = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock('../core/event-bus.js', () => {
  return {
    // Not used directly; handlers are injected via the mock eventBus below.
  };
});

const mockEventBus = {
  subscribe: mockSubscribe,
  unsubscribe: mockUnsubscribe,
};

const mockPluginManager = {
  broadcastEvent: mockBroadcastEvent,
};

describe('createPluginEventAdapter', () => {
  beforeEach(() => {
    mockBroadcastEvent.mockReset();
    mockSubscribe.mockReset();
    mockUnsubscribe.mockReset();
  });

  it('subscribes to wildcard events and forwards payload', async () => {
    let handler: ((event: any) => Promise<void>) | undefined;
    mockSubscribe.mockImplementation((_type, fn) => {
      handler = fn;
    });

    const unsubscribe = createPluginEventAdapter(
      mockEventBus as any,
      mockPluginManager as any,
    );

    expect(mockSubscribe).toHaveBeenCalledWith('*', expect.any(Function));
    expect(typeof handler).toBe('function');

    const event = {
      type: 'SyncStarted',
      timestamp: new Date(),
      payload: { demo: true },
      metadata: { source: 'test' },
    };

    await handler?.(event);

    expect(mockBroadcastEvent).toHaveBeenCalledWith({
      eventType: event.type,
      timestamp: event.timestamp.toISOString(),
      payload: event.payload,
      metadata: event.metadata,
    });

    unsubscribe();
    expect(mockUnsubscribe).toHaveBeenCalledWith('*', expect.any(Function));
  });
});

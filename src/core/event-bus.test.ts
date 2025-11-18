import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './event-bus.js';
import { EventType } from '../types/index.js';

const createEvent = (type: EventType = EventType.SyncStarted) => ({
  type,
  timestamp: new Date(),
  source: 'test-suite',
});

describe('EventBus', () => {
  it('notifies subscribed listeners for specific event type', async () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.subscribe(EventType.SyncStarted, listener);
    await bus.emit(createEvent(EventType.SyncStarted));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports wildcard listeners for all event types', async () => {
    const bus = new EventBus();
    const wildcard = vi.fn();

    bus.subscribe('*', wildcard);
    await bus.emit(createEvent(EventType.SyncCompleted));
    await bus.emit(createEvent(EventType.SyncFailed));

    expect(wildcard).toHaveBeenCalledTimes(2);
  });

  it('allows unsubscribing listeners', async () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.subscribe(EventType.SyncCompleted, listener);
    bus.unsubscribe(EventType.SyncCompleted, listener);
    await bus.emit(createEvent(EventType.SyncCompleted));

    expect(listener).not.toHaveBeenCalled();
  });

  it('logs errors but continues notifying other listeners', async () => {
    const bus = new EventBus();
    const failingListener = vi.fn(() => {
      throw new Error('listener failure');
    });
    const succeedingListener = vi.fn();

    bus.subscribe(EventType.SyncFailed, failingListener);
    bus.subscribe(EventType.SyncFailed, succeedingListener);

    await expect(bus.emit(createEvent(EventType.SyncFailed))).resolves.toBeUndefined();
    expect(failingListener).toHaveBeenCalledTimes(1);
    expect(succeedingListener).toHaveBeenCalledTimes(1);
  });
});

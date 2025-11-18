import { EventListener, EventType, LiveSyncEvent } from '../types/index.js';
import logger from '../utils/logger.js';

/**
 * Event bus interface to decouple modules.
 */
export interface IEventBus {
  subscribe(type: EventType | '*', listener: EventListener): void;
  unsubscribe(type: EventType | '*', listener: EventListener): void;
  emit(event: LiveSyncEvent): Promise<void>;
}

/**
 * Basic in-memory event bus implementation.
 * Implementation will be filled in subsequent steps.
 */
export class EventBus implements IEventBus {
  private listeners: Map<EventType | '*', Set<EventListener>>;

  constructor() {
    this.listeners = new Map();
  }

  subscribe(type: EventType | '*', listener: EventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  unsubscribe(type: EventType | '*', listener: EventListener): void {
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }
    listeners.delete(listener);
    if (listeners.size === 0) {
      this.listeners.delete(type);
    }
  }

  async emit(event: LiveSyncEvent): Promise<void> {
    const listeners = new Set<EventListener>();
    const specific = this.listeners.get(event.type);
    const wildcard = this.listeners.get('*');

    if (specific) {
      specific.forEach((listener) => listeners.add(listener));
    }
    if (wildcard) {
      wildcard.forEach((listener) => listeners.add(listener));
    }

    await Promise.all(
      Array.from(listeners).map(async (listener) => {
        try {
          await listener(event);
        } catch (err) {
          logger.error({ err, eventType: event.type }, 'Event listener execution failed');
        }
      })
    );
  }
}

/**
 * Factory to create new event bus instances.
 */
export function createEventBus(): IEventBus {
  return new EventBus();
}

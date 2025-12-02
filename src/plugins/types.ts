// Shared types for PluginManager <-> Plugin communication.
import { NotificationType, RequestType } from 'vscode-jsonrpc/node';
import { EventType } from '../types/index.js';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { MessageConnection } from 'vscode-jsonrpc';

// Handshake (plugin -> host)
export interface HandshakePayload {
  pluginName?: string;
  pluginVersion?: string;
  events?: Array<EventType | '*'>;
}

// Handshake response (host -> plugin)
export interface HandshakeResult {
  hostVersion: string;
}

// Host -> Plugin event notify
export interface NotifyPayload {
  eventType: EventType;
  eventId: string;
  timestamp: number;
  payload: unknown;
}

// Wire protocol message types
export const handshakeRequest = new RequestType<HandshakePayload, HandshakeResult, void>('handshake');
export const notifyEvent = new NotificationType<NotifyPayload>('notify');

// Plugin process/config handles
export interface PluginConfig {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  handshakeTimeoutMs?: number;
}

export interface PluginHandle {
  name: string;
  subscribedEvents: Set<EventType | '*'>;
  handshake?: {
    pluginName: string;
    pluginVersion: string;
    events: Array<EventType | '*'>;
  };
  child?: ChildProcessWithoutNullStreams;
  connection?: MessageConnection;
}

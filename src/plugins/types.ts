/**
 * Shared plugin runtime types for process orchestration and RPC wiring.
 */
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export interface PluginEventsFilter {
  include?: string[];
  exclude?: string[];
}

export interface PluginRestartPolicy {
  enabled: boolean;
  maxRetries?: number;
  backoffMs?: number;
}

export interface PluginConfig {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  restart?: PluginRestartPolicy;
  rpcTimeoutMs?: number;
  handshakeTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  events?: PluginEventsFilter;
  allowReverseRpc?: boolean;
  routePrefix?: string;
  enabled?: boolean;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * Plugin-side interface contract (logical constraint, not enforced by TypeScript implementation)
 */
export interface PluginApi {
  /**
   * Initialize plugin, load configuration, perform handshake and return metadata (route declarations, event subscriptions, etc.).
   */
  init(params: { config: Record<string, unknown> }): Promise<{
    name: string;
    version: string;
    capabilities?: string[];
    routes?: PluginRouteDeclaration[];
    events?: string[];
    reverseRpc?: boolean;
  }>;

  /**
   * Handle HTTP requests forwarded from the main process.
   */
  handleRequest?(params: PluginHttpRequest): Promise<PluginHttpResponse>;

  /**
   * Callback when the main process broadcasts event notifications.
   */
  onEvent?(params: PluginEventPayload): Promise<void>;
}

export interface PluginInitResult {
  name: string;
  version: string;
  capabilities?: string[];
  routes?: PluginRouteDeclaration[];
  events?: string[];
  reverseRpc?: boolean;
}

export interface PluginRouteDeclaration {
  path: string;
  method: string;
  description?: string;
  auth?: boolean;
  schema?: Record<string, unknown>;
}

export interface PluginHttpRequest {
  path: string;
  method: string;
  headers?: Record<string, string>;
  query?: Record<string, string | string[]>;
  body?: unknown;
}

export interface PluginHttpResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface PluginEventPayload {
  eventType: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface PluginProcessHandle {
  process: ChildProcessWithoutNullStreams;
  stdoutClosed: boolean;
  stderrClosed: boolean;
}

export interface PluginRuntimeContext {
  config: PluginConfig;
  handle?: PluginProcessHandle;
  lastHandshakeError?: string;
}

/**
 * PluginProcess manages a single plugin process and its JSON-RPC channel.
 * This is a minimal skeleton; handshake/restart logic will be added incrementally.
 */
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';

import logger from '../utils/logger.js';
import { StdioJsonRpcClient } from './json-rpc.js';
import type { PluginConfig, PluginInitResult } from './types.js';

export class PluginProcess {
  private child?: ChildProcessWithoutNullStreams;
  private rpcClient?: StdioJsonRpcClient;
  private subscribedEvents: Set<string> = new Set();
  private handshakeResult?: PluginInitResult;
  private lastHandshakeError?: string;

  constructor(private readonly config: PluginConfig) {}

  async start(): Promise<void> {
    if (this.child) {
      logger.warn({ plugin: this.config.name }, 'Plugin process already started.');
      return;
    }

    this.child = this.spawnProcess();
    this.rpcClient = new StdioJsonRpcClient(this.child);
    await this.performHandshakeWithTimeout();
  }

  async stop(): Promise<void> {
    if (!this.child) {
      return;
    }

    // TODO: graceful shutdown via RPC before killing the process.
    this.rpcClient?.dispose();
    this.child.kill();
    this.child = undefined;
    this.rpcClient = undefined;
  }

  isRunning(): boolean {
    return Boolean(this.child && !this.child.killed);
  }

  getSubscribedEvents(): Set<string> {
    return this.subscribedEvents;
  }

  getLastHandshakeError(): string | undefined {
    return this.lastHandshakeError;
  }

  private async performHandshakeWithTimeout(): Promise<void> {
    if (!this.rpcClient) {
      throw new Error('RPC client not initialized.');
    }

    const timeoutMs = this.config.handshakeTimeoutMs ?? 5000;

    const handshakeId = `handshake-${Date.now()}`;

    const handshakePromise = this.rpcClient.sendRequest({
      jsonrpc: '2.0',
      id: handshakeId,
      method: 'plugin/handshake',
      params: {
        name: 'host',
        version: '0.0.0',
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Handshake timeout exceeded')), timeoutMs),
    );

    try {
      const response = await Promise.race([handshakePromise, timeoutPromise]);

      const result = (response as { result?: unknown }).result as PluginInitResult | undefined;
      if (!result) {
        this.lastHandshakeError = 'Handshake returned empty result.';
        throw new Error(this.lastHandshakeError);
      }

      this.handshakeResult = result;
      this.subscribedEvents = new Set(result.events ?? []);
      this.lastHandshakeError = undefined;

      logger.info(
        { plugin: this.config.name, events: [...this.subscribedEvents] },
        'Plugin handshake completed.',
      );
    } catch (error) {
      this.lastHandshakeError = error instanceof Error ? error.message : 'Handshake failed';
      throw error;
    }
  }

  getRpcClient(): StdioJsonRpcClient | undefined {
    return this.rpcClient;
  }

  private spawnProcess(): ChildProcessWithoutNullStreams {
    const child = spawn(this.config.command, this.config.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.config.cwd,
      env: { ...process.env, ...this.config.env },
    });

    child.on('exit', (code, signal) => {
      logger.warn({ plugin: this.config.name, code, signal }, 'Plugin process exited.');
    });

    child.stderr.on('data', (chunk) => {
      logger.info({ plugin: this.config.name, stream: 'stderr' }, chunk.toString());
    });

    return child;
  }
}

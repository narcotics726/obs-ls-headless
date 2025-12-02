/**
 * Simplified plugin process manager using AbortController for unified timeout handling.
 * Maintains the "plugin-initiated handshake" pattern but with cleaner state management.
 */
import type { HandshakePayload, NotifyPayload, PluginConfig, PluginHandle } from './types.js';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  MessageConnection,
} from 'vscode-jsonrpc/node';
import { handshakeRequest, notifyEvent } from './types.js';
import logger from '../utils/logger.js';
import { EventType } from '../types/index.js';

export interface PluginProcessOptions {
  hostVersion?: string;
  /** Callback for notifications received from the plugin */
  onNotification?: (method: string, params: unknown) => void;
}

export class PluginProcess {
  private childProcess: ChildProcessWithoutNullStreams | null = null;
  private connection: MessageConnection | null = null;
  private abortController: AbortController | null = null;

  constructor(
    private readonly config: PluginConfig,
    private readonly options: PluginProcessOptions = {}
  ) {}

  /**
   * Start the plugin process and wait for handshake.
   * Uses AbortController to unify timeout, process exit, and external cancellation.
   */
  async start(): Promise<PluginHandle> {
    // Create a unified abort controller for all cancellation sources
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    let started = false;

    try {
      // 1. Spawn process
      this.childProcess = this.spawnProcess();

      // 2. Create JSON-RPC connection
      this.connection = this.createConnection(this.childProcess);
      this.connection.listen();

      // 3. Wait for handshake from plugin with timeout
      const handshakeInfo = await this.waitForHandshake(signal);

      // 4. Create handle
      const handle = this.createHandle(this.childProcess, this.connection, handshakeInfo);
      started = true;
      return handle;

    } catch (error) {
      // Cleanup on any error
      await this.cleanup();
      throw error;
    } finally {
      // Clear abort controller after successful start
      if (started && !signal.aborted) {
        this.abortController = null;
      }
    }
  }

  /**
   * Stop the plugin process and clean up resources.
   */
  async stop(): Promise<void> {
    // Signal any pending operations to abort
    if (this.abortController) {
      this.abortController.abort();
    }

    await this.cleanup();
  }

  /**
   * Send notification to the plugin.
   */
  async sendNotification(event: NotifyPayload): Promise<void> {
    if (!this.connection) {
      throw new Error('Plugin not connected');
    }
    await this.connection.sendNotification(notifyEvent, event);
  }

  /**
   * Check if plugin is still running.
   */
  isRunning(): boolean {
    return this.childProcess !== null && !this.childProcess.killed;
  }

  // ========== Private Methods ==========

  private spawnProcess(): ChildProcessWithoutNullStreams {
    logger.info(
      { plugin: this.config.name, command: this.config.command, args: this.config.args },
      'Spawning plugin process'
    );

    const child = spawn(this.config.command, this.config.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.config.cwd,
      env: { ...process.env, ...this.config.env },
    }) as ChildProcessWithoutNullStreams;

    // Suppress EPIPE errors on stdin (expected when process exits unexpectedly)
    child.stdin.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') {
        logger.error({ plugin: this.config.name, error: err }, 'stdin error');
      }
    });

    return child;
  }

  private createConnection(child: ChildProcessWithoutNullStreams): MessageConnection {
    const connection = createMessageConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin)
    );

    // Forward plugin notifications
    connection.onNotification((method, params) => {
      logger.info({ plugin: this.config.name, method, params }, 'Received notification from plugin');
      // Forward to callback if provided
      this.options.onNotification?.(method, params);
    });

    return connection;
  }

  /**
   * Wait for handshake request from plugin with unified timeout handling.
   */
  private async waitForHandshake(signal: AbortSignal): Promise<{
    pluginVersion: string;
    events: Array<EventType | '*'>;
  }> {
    if (!this.childProcess || !this.connection) {
      throw new Error('Process or connection not initialized');
    }

    const timeoutMs = this.config.handshakeTimeoutMs ?? 5000;

    return new Promise((resolve, reject) => {
      // Reject if already aborted
      if (signal.aborted) {
        reject(new Error('Operation aborted'));
        return;
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`Plugin ${this.config.name} handshake timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Set up abort listener
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(new Error('Handshake cancelled'));
      };
      signal.addEventListener('abort', onAbort, { once: true });

      // Set up process exit handler
      const onExit = (code: number | null, signalName: NodeJS.Signals | null) => {
        clearTimeout(timeoutId);
        reject(new Error(
          `Plugin process ${this.config.name} exited before handshake (code: ${code}, signal: ${signalName})`
        ));
      };
      this.childProcess!.once('exit', onExit);

      // Set up handshake request handler
      this.connection!.onRequest(handshakeRequest, (params: HandshakePayload) => {
        logger.info({ plugin: this.config.name, params }, 'Received handshake request from plugin');

        // Clean up listeners
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', onAbort);
        this.childProcess!.off('exit', onExit);

        // Resolve with plugin info
        resolve({
          pluginVersion: params.pluginVersion ?? 'unknown',
          events: params.events ?? ['*'],
        });

        // Return response to plugin
        return { hostVersion: this.options.hostVersion ?? '0.0.0' };
      });
    });
  }

  private createHandle(
    child: ChildProcessWithoutNullStreams,
    connection: MessageConnection,
    handshakeInfo: { pluginVersion: string; events: Array<EventType | '*'> }
  ): PluginHandle {
    return {
      name: this.config.name,
      subscribedEvents: new Set(handshakeInfo.events),
      handshake: {
        pluginName: this.config.name,
        pluginVersion: handshakeInfo.pluginVersion,
        events: handshakeInfo.events,
      },
      child,
      connection,
    };
  }

  private async cleanup(): Promise<void> {
    // Dispose connection
    if (this.connection) {
      this.connection.dispose();
      this.connection = null;
    }

    // Kill process if still running
    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill();
      // Wait a moment for process to exit
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.childProcess = null;
    this.abortController = null;
  }
}

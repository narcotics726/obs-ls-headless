/**
 * Thin wrapper around vscode-jsonrpc to provide a stdio-based JSON-RPC client.
 * This is a skeleton; method wiring will be added incrementally.
 */
import { createMessageConnection, MessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node.js';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import logger from '../utils/logger.js';
import type { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse } from './types.js';

export class StdioJsonRpcClient {
  private connection: MessageConnection;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    const reader = new StreamMessageReader(child.stdout);
    const writer = new StreamMessageWriter(child.stdin);
    this.connection = createMessageConnection(reader, writer, {
      error: (msg) => logger.error(msg),
      warn: (msg) => logger.warn(msg),
      info: (msg) => logger.info(msg),
      log: (msg) => logger.debug?.(msg),
    });
    this.connection.listen();
  }

  sendRequest(payload: JsonRpcRequest): Promise<JsonRpcResponse> {
    return this.connection.sendRequest(payload.method, payload.params).then((result) => ({
      jsonrpc: '2.0',
      id: payload.id,
      result,
    }));
  }

  sendNotification(payload: JsonRpcNotification): Promise<void> {
    return this.connection.sendNotification(payload.method, payload.params);
  }

  onNotification(handler: (method: string, params: unknown) => void): void {
    this.connection.onNotification(handler);
  }

  dispose(): void {
    this.connection.dispose();
  }
}

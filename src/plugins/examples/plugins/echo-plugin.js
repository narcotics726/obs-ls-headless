#!/usr/bin/env node
/**
 * Simple test plugin using vscode-jsonrpc over stdio.
 * - Responds to plugin/handshake with basic metadata.
 * - Logs incoming plugin/onEvent notifications.
 */
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node.js';

const connection = createMessageConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
);

connection.onRequest('plugin/handshake', (_params) => {
  return {
    name: 'echo-plugin',
    version: '0.1.0',
    capabilities: ['echo'],
    routes: [
      {
        path: '/echo',
        method: 'POST',
        description: 'Echo request body',
      },
    ],
    events: ['*'],
    reverseRpc: false,
  };
});

connection.onRequest('plugin/handleRequest', (params) => {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: {
      echoed: params?.body ?? null,
      path: params?.path,
      method: params?.method,
    },
  };
});

connection.onNotification('plugin/onEvent', (params) => {
  // Emit a notification back to host so it can observe the event.
  connection.sendNotification('plugin/eventLog', { receivedEvent: params });
  // Log to stderr to avoid interfering with RPC framing on stdout.
  // eslint-disable-next-line no-console
  console.error('[echo-plugin] received event', JSON.stringify(params));
});

connection.listen();

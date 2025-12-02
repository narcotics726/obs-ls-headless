// Stable test plugin: completes handshake, echoes notify payloads back via "log" notifications, and stays alive.
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  NotificationType,
  RequestType,
} from 'vscode-jsonrpc/node.js';

const handshakeRequest = new RequestType('handshake');
const notifyEvent = new NotificationType('notify');
const logEvent = new NotificationType('log');

const connection = createMessageConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
);

const eventsEnv = process.env.EVENTS ? process.env.EVENTS.split(',') : ['*'];
const pluginName = process.env.PLUGIN_NAME ?? 'plugin-stable';
const pluginVersion = process.env.PLUGIN_VERSION ?? '1.0.0';

connection.onNotification(notifyEvent, params => {
  // Echo back what we received so the host test can assert delivery.
  connection.sendNotification(logEvent, JSON.stringify({ pluginName, params }));
});

// Send handshake once connected.
const sendHandshake = () =>
  connection.sendRequest(handshakeRequest, {
    pluginName,
    pluginVersion,
    events: eventsEnv,
  });

connection.listen();

// Give host a brief moment to attach onRequest before sending handshake.
setTimeout(() => {
  console.error(`[${pluginName}] sending handshake`);
  sendHandshake().catch(err => {
    // Bubble up handshake failure and exit.
    console.error(err);
    process.exit(1);
  });
}, 50);

// Keep the process alive for tests; host will terminate via PluginProcess.stop().
setInterval(() => {}, 1_000);

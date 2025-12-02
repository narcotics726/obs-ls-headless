// Plugin that handshakes, then exits with error on first notify to simulate downstream failure.
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

const pluginName = process.env.PLUGIN_NAME ?? 'plugin-fail-on-notify';
const pluginVersion = process.env.PLUGIN_VERSION ?? '1.0.0';
const eventsEnv = process.env.EVENTS ? process.env.EVENTS.split(',') : ['*'];

let notified = false;

connection.onNotification(notifyEvent, params => {
  notified = true;
  // Let the host know we received the notification before failing.
  connection.sendNotification(logEvent, JSON.stringify({ pluginName, params, failing: true }));
  // Simulate plugin crash/error right after receiving notify.
  process.exit(2);
});

const sendHandshake = () =>
  connection.sendRequest(handshakeRequest, {
    pluginName,
    pluginVersion,
    events: eventsEnv,
  });

connection.listen();

// Give host time to attach handlers.
setTimeout(() => {
  console.error(`[${pluginName}] sending handshake`);
  sendHandshake().catch(err => {
    console.error(err);
    process.exit(1);
  });
}, 50);

// Safety: if notify never arrives, keep process alive briefly so tests can time out.
setTimeout(() => {
  if (!notified) {
    process.exit(0);
  }
}, 5_000);

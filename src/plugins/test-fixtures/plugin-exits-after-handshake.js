// Plugin that handshakes then exits shortly after to simulate unexpected termination.
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  RequestType,
} from 'vscode-jsonrpc/node.js';

const handshakeRequest = new RequestType('handshake');

const connection = createMessageConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
);

const pluginName = process.env.PLUGIN_NAME ?? 'plugin-exits-after-handshake';
const pluginVersion = process.env.PLUGIN_VERSION ?? '1.0.0';
const eventsEnv = process.env.EVENTS ? process.env.EVENTS.split(',') : ['*'];

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
  sendHandshake()
    .then(() => {
      // Exit soon after handshake to mimic crash after startup.
      setTimeout(() => process.exit(0), 200);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}, 50);

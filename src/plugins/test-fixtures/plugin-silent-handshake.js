// Plugin that stays alive but never sends handshake, simulating a hung plugin during startup.
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node.js';

// Create connection but do not send handshake.
createMessageConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
).listen();

// Keep process alive; host should timeout/abort.
setInterval(() => {}, 1_000);

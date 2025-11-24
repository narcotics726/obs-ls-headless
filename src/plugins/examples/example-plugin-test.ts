import { resolve } from 'node:path';

import {
  loadPluginConfigsFromFile,
  PluginManager,
} from '../index.js';

/**
 * Simulate host process: start plugins via PluginManager, broadcast events, observe notifications.
 */
async function main() {
  const configPath = resolve(
    process.cwd(),
    'src/plugins/examples/plugins.config.example.json',
  );
  const [pluginConfig] = loadPluginConfigsFromFile(configPath);

  if (!pluginConfig) {
    throw new Error('No plugin config found in plugins.config.example.json');
  }

  const manager = new PluginManager([pluginConfig]);
  await manager.startAll();

  // Broadcast an event via manager (uses PluginEventBridge internally).
  await manager.broadcastEvent({
    eventType: 'SyncStarted',
    timestamp: new Date().toISOString(),
    payload: { via: 'manager' },
  });

  setTimeout(async () => {
    await manager.stopAll();
  }, 500);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

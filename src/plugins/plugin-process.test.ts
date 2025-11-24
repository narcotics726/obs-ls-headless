import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PluginProcess } from './plugin-process.js';
import type { PluginConfig } from './types.js';

const echoPluginPath = resolve(
  process.cwd(),
  'src/plugins/examples/plugins/echo-plugin.js',
);

function createConfig(partial: Partial<PluginConfig> = {}): PluginConfig {
  return {
    name: partial.name ?? 'echo-plugin',
    command: 'node',
    args: partial.args ?? [echoPluginPath],
    enabled: true,
    handshakeTimeoutMs: partial.handshakeTimeoutMs ?? 2000,
    shutdownTimeoutMs: partial.shutdownTimeoutMs ?? 2000,
    ...partial,
  };
}

describe(
  'PluginProcess (integration, no external config)',
  () => {
    it(
      'handshakes successfully with echo plugin and records subscriptions',
      async () => {
        const processWrapper = new PluginProcess(createConfig());
        await processWrapper.start();

        expect(processWrapper.isRunning()).toBe(true);
        expect(processWrapper.getSubscribedEvents().has('*')).toBe(true);
        expect(processWrapper.getLastHandshakeError()).toBeUndefined();

        await processWrapper.stop();
      },
      10_000,
    );

    it(
      'fails handshake on timeout with non-responding process',
      async () => {
        // This process never responds to handshake; expect timeout.
        const processWrapper = new PluginProcess(
          createConfig({
            name: 'hang-plugin',
            args: ['-e', 'setInterval(()=>{}, 1000)'],
            handshakeTimeoutMs: 100,
          }),
        );

        let error: unknown;
        try {
          await processWrapper.start();
        } catch (err) {
          error = err;
        } finally {
          await processWrapper.stop();
        }

        expect(error).toBeInstanceOf(Error);
        expect(processWrapper.getLastHandshakeError()).toMatch(/timeout/i);
      },
      10_000,
    );
  },
);

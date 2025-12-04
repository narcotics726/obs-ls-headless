import path from 'node:path';
import readline from 'node:readline';
import { readFile } from 'node:fs/promises';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import logger from '../utils/logger.js';
import { PluginManager } from './plugin-manager.js';
import type { NotifyPayload, PluginConfig } from './types.js';
import { EventType } from '../types/index.js';

interface Args {
  configPath: string;
}

interface ParsedLine {
  payload?: NotifyPayload;
  quit?: boolean;
  error?: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const configFlagIndex = argv.findIndex(arg => arg === '--config' || arg === '-c');
  const configPath =
    configFlagIndex !== -1 && argv[configFlagIndex + 1]
      ? argv[configFlagIndex + 1]
      : path.resolve(process.cwd(), 'src/plugins/test-fixtures/plugins.config.json');

  return { configPath };
}

async function loadPluginConfigs(configPath: string): Promise<PluginConfig[]> {
  const raw = await readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed?.plugins)) {
    return parsed.plugins;
  }

  throw new Error('Config must be an array of PluginConfig or { plugins: PluginConfig[] }');
}

function attachProcessLogs(manager: PluginManager): void {
  // Internal map is intentionally private; acceptable to tap for debugging CLI.
  const processes = (manager as any).processes as Map<string, any> | undefined;
  if (!processes) {
    return;
  }
  processes.forEach((proc, name) => {
    const child = proc.childProcess as ChildProcessWithoutNullStreams | null;
    if (!child) {
      return;
    }

    child.stdout?.on('data', chunk => {
      process.stdout.write(`[${name}:stdout] ${chunk}`);
    });
    child.stderr?.on('data', chunk => {
      process.stderr.write(`[${name}:stderr] ${chunk}`);
    });
    child.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      console.log(`[${name}] exited (code=${code}, signal=${signal})`);
    });
  });
}

function parseInputLine(line: string, seq: number): ParsedLine {
  const trimmed = line.trim();
  if (!trimmed) {
    return {};
  }

  const lower = trimmed.toLowerCase();
  if (lower === 'exit' || lower === 'quit') {
    return { quit: true };
  }

  // Allow full JSON line with eventType/payload/etc.
  try {
    const json = JSON.parse(trimmed);
    if (json && json.eventType) {
      const payload: NotifyPayload = {
        eventType: json.eventType as EventType,
        eventId: json.eventId ?? `cli-${seq}`,
        timestamp: json.timestamp ?? Date.now(),
        payload: json.payload ?? {},
      };
      return { payload };
    }
  } catch {
    // Fall through to tokenized parse.
  }

  const firstSpace = trimmed.indexOf(' ');
  const eventType = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  const rest = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1).trim();
  let payloadData: unknown = {};
  if (rest) {
    try {
      payloadData = JSON.parse(rest);
    } catch {
      return { error: 'Payload must be valid JSON' };
    }
  }

  if (!eventType) {
    return { error: 'Missing eventType' };
  }

  const payload: NotifyPayload = {
    eventType: eventType as EventType,
    eventId: `cli-${seq}`,
    timestamp: Date.now(),
    payload: payloadData,
  };

  return { payload };
}

async function runRepl(manager: PluginManager): Promise<void> {
  let seq = 1;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  console.log('Interactive mode. Type an event name and optional JSON payload.');
  console.log('Examples:');
  console.log('  SyncCompleted {"changedPaths":["foo.md"]}');
  console.log('  {"eventType":"SyncFailed","payload":{"reason":"timeout"}}');
  console.log('Type "exit" or "quit" to stop.');

  for await (const line of rl) {
    const parsed = parseInputLine(line, seq++);
    if (parsed.quit) {
      break;
    }
    if (parsed.error) {
      console.warn(parsed.error);
      continue;
    }
    if (!parsed.payload) {
      continue;
    }

    try {
      await manager.broadcast(parsed.payload);
      console.log(`Sent event ${parsed.payload.eventType} (${parsed.payload.eventId})`);
    } catch (err) {
      console.error('Broadcast failed:', err);
    }
  }

  rl.close();
}

export async function main(): Promise<void> {
  const { configPath } = parseArgs();
  const configs = await loadPluginConfigs(configPath);
  if (configs.length === 0) {
    console.warn('No plugins configured. Exiting.');
    return;
  }

  const manager = new PluginManager(configs);
  manager.onPluginNotification((plugin, method, params) => {
    console.log(`[${plugin}] ${method}:`, params);
  });

  try {
    await manager.startAll();
    attachProcessLogs(manager);
    console.log(`Started ${configs.length} plugin(s). Ready to broadcast events.`);
    await runRepl(manager);
  } finally {
    await manager.stopAll();
    await new Promise(resolve => logger.flush(resolve));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

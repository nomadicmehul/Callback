import { render } from 'ink';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from './App';
import { net, waitForServer } from './net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let spawned: ChildProcess | null = null;

async function ensureServer(): Promise<void> {
  try {
    await net.health();
    return; // a server is already running — use it, don't manage it
  } catch {
    /* need to start one */
  }
  // Go through the launcher so dev checkouts (tsx) and npm installs (dist/) both work.
  spawned = spawn(process.execPath, [path.join(root, 'bin', 'callback.mjs'), 'serve'], {
    stdio: 'ignore',
    cwd: root,
    env: {
      ...process.env,
      CALLBACK_NO_OPEN: '1',
      NODE_OPTIONS: [process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'].filter(Boolean).join(' '),
    },
  });
  const ok = await waitForServer(15000);
  if (!ok) {
    console.error('Could not start the Callback server. Try `callback serve` in another terminal.');
    process.exit(1);
  }
}

function cleanup() {
  if (spawned && !spawned.killed) spawned.kill();
}
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

await ensureServer();
const app = render(<App />);
await app.waitUntilExit();
cleanup();

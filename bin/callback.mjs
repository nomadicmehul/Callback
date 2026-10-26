#!/usr/bin/env node
// Callback launcher — the one entry point for every way of running it.
//
//   callback            start the local server, open the dashboard
//   callback serve      start the server only (no browser)
//   callback tui        animated terminal UI (starts the server if needed)
//   callback mcp        stdio MCP server — used by the Claude Code plugin
//   callback --version / --help
//
// Runs the TypeScript source through tsx in a git checkout (src/ + tsx present),
// and the bundled dist/ output when installed from npm (`npx callback-agent`).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const webDist = path.join(root, 'dist', 'web');
const bin = (name) => path.join(root, 'node_modules', '.bin', name);

// Node 22+ prints ExperimentalWarnings (node:sqlite, Web Storage) that are noise
// for users; silence just that category, keep everything else.
const env = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'].filter(Boolean).join(' '),
};

// Dev checkout → run TypeScript directly (always fresh). Packaged → dist/.
const devMode = existsSync(path.join(root, 'src')) && existsSync(bin('tsx')) && process.env.CALLBACK_PREFER_DIST !== '1';

/** [command, args] to run one of the Node entry points. */
function entry(name) {
  const ts = { server: 'src/server/index.ts', tui: 'src/tui/index.tsx', mcp: 'src/mcp-stdio.ts' }[name];
  const js = { server: 'dist/server/index.mjs', tui: 'dist/tui/index.mjs', mcp: 'dist/mcp-stdio.mjs' }[name];
  if (devMode) return [bin('tsx'), [path.join(root, ts)]];
  const built = path.join(root, js);
  if (!existsSync(built)) {
    console.error(`Callback is not built (${js} missing). In a checkout run "npm install && npm run build".`);
    process.exit(1);
  }
  return [process.execPath, [built]];
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', cwd: root, env, ...opts });
    p.on('exit', (code, signal) => (code === 0 || signal ? resolve() : reject(new Error(`${path.basename(cmd)} exited with ${code}`))));
    p.on('error', reject);
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  } catch {
    /* ignore — the URL is printed anyway */
  }
}

async function ensureBuilt() {
  if (existsSync(webDist)) return;
  if (!devMode) {
    console.error('The dashboard bundle (dist/web) is missing from this install. Reinstall the package or run "npm run build" in a checkout.');
    process.exit(1);
  }
  console.log('  Building the dashboard (first run only)…\n');
  await run(bin('vite'), ['build']);
}

const sub = process.argv[2];
const noOpen = process.env.CALLBACK_NO_OPEN === '1' || process.argv.includes('--no-open');

try {
  if (sub === '--version' || sub === '-v') {
    console.log(pkg.version);
  } else if (sub === '--help' || sub === '-h' || sub === 'help') {
    console.log(`Callback v${pkg.version} — local-first AI job-search & interview-prep agent

  callback            start the local server and open the dashboard
  callback serve      start the server only (add --no-open to any command to skip the browser)
  callback tui        animated terminal UI
  callback mcp        stdio MCP server (what the Claude Code plugin runs)

  Data lives in ~/.callback (override with CALLBACK_HOME). Port: CALLBACK_PORT (default 4317).
  No API key? Run it inside Claude Code: claude --plugin-dir <this folder>`);
  } else if (sub === 'tui') {
    await run(...entry('tui'));
  } else if (sub === 'mcp') {
    // stdout is the MCP channel — print nothing from here.
    await run(...entry('mcp'));
  } else if (sub === undefined || sub === 'serve' || sub === '--no-open') {
    await ensureBuilt();
    const port = process.env.CALLBACK_PORT || '4317';
    const url = `http://127.0.0.1:${port}`;
    if (sub !== 'serve' && !noOpen) setTimeout(() => openBrowser(url), 1300);
    await run(...entry('server'));
  } else {
    console.error(`Unknown command "${sub}". Try: callback --help`);
    process.exit(2);
  }
} catch (err) {
  console.error(err?.message ?? err);
  process.exit(1);
}

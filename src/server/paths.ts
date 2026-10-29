import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// All personal data lives under ~/.callback by default — on the user's machine,
// never in the repo. Override with CALLBACK_HOME (handy for tests / demos).
export const DATA_DIR =
  process.env.CALLBACK_HOME && process.env.CALLBACK_HOME.trim().length > 0
    ? path.resolve(process.env.CALLBACK_HOME)
    : path.join(os.homedir(), '.callback');

export const DB_PATH = path.join(DATA_DIR, 'callback.db');
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
export const FILES_DIR = path.join(DATA_DIR, 'files');
export const WORKSPACE_DIR = path.join(DATA_DIR, 'workspace');

/** A folder as someone would type it in a shell: "~/Callback" under the home folder (no
 *  username in screenshots), quoted where needed; absolute and quoted on Windows. */
export function shellPath(dir: string): string {
  const quote = (s: string) => (/[^\w@%+=:,./-]/.test(s) ? `"${s.replace(/(["\\$`])/g, '\\$1')}"` : s);
  if (process.platform === 'win32') return `"${dir}"`;
  const home = os.homedir();
  if (dir === home) return '~';
  return dir.startsWith(home + path.sep) ? `~/${quote(dir.slice(home.length + 1))}` : quote(dir);
}

// The launcher always starts the server with cwd = package root (checkout or npm
// install), which is also the Claude Code plugin root.
const root = process.cwd();
export const PLUGIN_DIR = fs.existsSync(path.join(root, '.claude-plugin', 'plugin.json')) ? shellPath(root) : null;

/** Create the data directory tree if it does not exist yet. */
export function ensureDataDir(): void {
  for (const dir of [DATA_DIR, FILES_DIR, WORKSPACE_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

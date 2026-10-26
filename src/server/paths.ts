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

/** Create the data directory tree if it does not exist yet. */
export function ensureDataDir(): void {
  for (const dir of [DATA_DIR, FILES_DIR, WORKSPACE_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

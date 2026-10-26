import fs from 'node:fs';
import type { ProfileSource } from '@shared/types';
import { CONFIG_PATH } from './paths';

// Non-secret settings live in the DB; the API key lives here, in a 0600 file
// under the user's home dir. (A future version can move it to the OS keychain.)
export interface StoredConfig {
  apiKey?: string;
  /** The candidate's real experience (resume text). Grounds every draft. */
  candidateProfile?: string;
  profileSource?: ProfileSource;
}

let cache: StoredConfig | null = null;

function read(): StoredConfig {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as StoredConfig;
  } catch {
    cache = {};
  }
  return cache;
}

function write(cfg: StoredConfig): void {
  cache = cfg;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  // Tighten perms even if the file already existed with looser ones.
  try {
    fs.chmodSync(CONFIG_PATH, 0o600);
  } catch {
    /* best effort */
  }
}

export function getConfig(): StoredConfig {
  return { ...read() };
}

export function setConfig(patch: Partial<StoredConfig>): StoredConfig {
  const next = { ...read(), ...patch };
  write(next);
  return { ...next };
}

/** The effective API key: explicit config wins, else the environment. */
export function resolveApiKey(): string | undefined {
  const fromConfig = read().apiKey?.trim();
  if (fromConfig) return fromConfig;
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  return fromEnv || undefined;
}

export function hasApiKey(): boolean {
  return Boolean(resolveApiKey());
}

export function hasProfile(): boolean {
  return (read().candidateProfile?.trim().length ?? 0) > 0;
}

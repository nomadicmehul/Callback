// ─── Backup, restore, start fresh ───────────────────────────────────────────
// One .zip holds everything Callback knows about a person: the SQLite file
// (jobs, documents, memory, interview history, experience bank, gap answers),
// config.json (profile text, document format — the API key only on request)
// and the files they uploaded. Export it here, import it on the next machine,
// carry on with the same context. A reset writes the same archive first, so
// "start fresh" is never "start over".

import fs from 'node:fs';
import path from 'node:path';
import type { BackupFile, BackupManifest, ImportReport, ResetReport, ResetScope } from '@shared/types';
import { APP_VERSION } from './version';
import { CONFIG_PATH, DATA_DIR, DB_PATH, FILES_DIR, ensureDataDir } from './paths';
import { getConfig, reloadConfig, type StoredConfig } from './config';
import { activeRunCount, clearTables, closeDb, dataCounts, initDb, vacuumInto } from './db';
import { unzipFiles, zipFiles, type ZipEntry } from './zip';

export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
/** Regenerable from the documents themselves — not worth carrying. */
const SKIP_DIRS = new Set(['exports']);

/** Every file under `dir`, as forward-slash paths relative to it. */
function walk(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (dir === base && SKIP_DIRS.has(ent.name)) continue;
      out.push(...walk(full, base));
    } else if (ent.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

export function exportBackup(opts: { includeApiKey?: boolean } = {}): { zip: Buffer; manifest: BackupManifest } {
  ensureDataDir();
  // VACUUM INTO writes a consistent single-file snapshot even in WAL mode.
  const tmp = path.join(DATA_DIR, `.export-${process.pid}-${Date.now()}.db`);
  vacuumInto(tmp);
  const db = fs.readFileSync(tmp);
  fs.rmSync(tmp, { force: true });
  const cfg = getConfig();
  if (!opts.includeApiKey) delete cfg.apiKey;
  const manifest: BackupManifest = {
    format: 'callback-backup',
    formatVersion: 1,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: dataCounts(),
    includesApiKey: Boolean(cfg.apiKey),
    hasProfile: Boolean(cfg.candidateProfile?.trim()),
  };
  const entries: ZipEntry[] = [
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) },
    { name: 'callback.db', data: db },
    { name: 'config.json', data: Buffer.from(JSON.stringify(cfg, null, 2)) },
    ...walk(FILES_DIR).map((rel) => {
      const full = path.join(FILES_DIR, rel);
      return { name: `files/${rel}`, data: fs.readFileSync(full), mtime: fs.statSync(full).mtime };
    }),
  ];
  return { zip: zipFiles(entries), manifest };
}

export const backupFilename = (d = new Date()) => `callback-backup-${d.toISOString().slice(0, 10)}.zip`;

/** A safety copy under ~/.callback/backups (API key included — it stays on this machine, 0600). */
export function saveBackup(prefix: string, includeApiKey = true): string {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const file = path.join(BACKUPS_DIR, `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.zip`);
  fs.writeFileSync(file, exportBackup({ includeApiKey }).zip, { mode: 0o600 });
  return file;
}

export function listBackups(): BackupFile[] {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => {
      const st = fs.statSync(path.join(BACKUPS_DIR, f));
      return { file: path.join(BACKUPS_DIR, f), size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Validate an archive before touching anything. */
export function readBackup(zip: Buffer): { manifest: BackupManifest; files: Map<string, Buffer> } {
  const files = unzipFiles(zip, () => true);
  const m = files.get('manifest.json');
  const db = files.get('callback.db');
  if (!m || !db) throw new Error('Not a Callback backup — expected manifest.json and callback.db inside the .zip.');
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(m.toString('utf8')) as BackupManifest;
  } catch {
    throw new Error('Not a Callback backup — the manifest is unreadable.');
  }
  if (manifest.format !== 'callback-backup') throw new Error('Not a Callback backup (wrong manifest).');
  if (manifest.formatVersion > 1) throw new Error(`This backup was made by a newer Callback (format ${manifest.formatVersion}). Update Callback first.`);
  if (db.subarray(0, 16).toString('latin1') !== 'SQLite format 3\0') throw new Error('The database inside the backup is damaged.');
  return { manifest, files };
}

/** Replace this machine's data with the archive's. What was here is saved first. */
export function importBackup(zip: Buffer): ImportReport {
  const { manifest, files } = readBackup(zip);
  if (activeRunCount() > 0) throw new Error('An agent run is still active — wait for it to finish (or approve/deny it) before importing.');
  const safetyBackup = saveBackup('before-import');
  const local = getConfig();

  closeDb();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
  fs.writeFileSync(DB_PATH, files.get('callback.db')!);

  // Config: the archive's, plus this machine's API key when the archive carries none.
  let incoming: StoredConfig = {};
  try {
    incoming = JSON.parse(files.get('config.json')?.toString('utf8') ?? '{}') as StoredConfig;
  } catch {
    incoming = {};
  }
  const keptLocalApiKey = !incoming.apiKey && Boolean(local.apiKey);
  const merged: StoredConfig = { ...incoming, ...(keptLocalApiKey ? { apiKey: local.apiKey } : {}) };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), { mode: 0o600 });
  reloadConfig();

  // Files: the archive's replace what was here (exports stay — regenerable either way).
  for (const rel of walk(FILES_DIR)) fs.rmSync(path.join(FILES_DIR, rel), { force: true });
  for (const [name, data] of files) {
    if (!name.startsWith('files/')) continue;
    const rel = name.slice('files/'.length);
    if (!rel || rel.split('/').includes('..')) continue;
    const dest = path.join(FILES_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
  }

  initDb(); // migrations bring an older backup up to date
  return { manifest, counts: dataCounts(), safetyBackup, keptLocalApiKey };
}

/** Start fresh — jobs only (profile, bank, memory and settings stay) or everything. A safety copy is written first. */
export function resetData(scope: ResetScope): ResetReport {
  if (activeRunCount() > 0) throw new Error('An agent run is still active — wait for it to finish (or approve/deny it) before resetting.');
  const safetyBackup = saveBackup(`before-reset-${scope}`);
  clearTables(scope);
  fs.rmSync(path.join(FILES_DIR, 'exports'), { recursive: true, force: true });
  if (scope === 'all') {
    const { apiKey } = getConfig(); // the key is this machine's, not the data's
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(apiKey ? { apiKey } : {}, null, 2), { mode: 0o600 });
    reloadConfig();
    fs.rmSync(FILES_DIR, { recursive: true, force: true });
    ensureDataDir();
  }
  return { scope, safetyBackup, counts: dataCounts() };
}

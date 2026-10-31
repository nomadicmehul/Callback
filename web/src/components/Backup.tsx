import { useEffect, useRef, useState } from 'react';
import type { BackupFile, ResetScope } from '@shared/types';
import { api } from '../lib/api';

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Export everything as one .zip, import it on another machine, or start fresh (with a safety copy first). */
export function BackupPanel({ dataDir, onChanged }: { dataDir: string | null; onChanged: () => void }) {
  const [withKey, setWithKey] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadBackups = () => api.listBackups().then(setBackups).catch(() => setBackups([]));
  useEffect(() => {
    loadBackups();
  }, []);

  async function run(key: string, fn: () => Promise<string>, reload = false) {
    setBusy(key);
    setMsg(null);
    try {
      const text = await fn();
      setMsg({ kind: 'ok', text });
      await loadBackups();
      onChanged();
      if (reload) setTimeout(() => window.location.reload(), 1800);
    } catch (e: any) {
      setMsg({ kind: 'err', text: String(e?.message ?? e) });
    } finally {
      setBusy(null);
    }
  }

  const exportNow = () => run('export', () => api.exportBackup(withKey).then(() => 'Backup downloaded ✓ — keep it somewhere safe, or move it to your next machine.'));
  const importFile = (file: File) => {
    if (!window.confirm(`Import "${file.name}"?\n\nThis replaces everything in ${dataDir ?? 'your data folder'} with the backup's contents. What is there now is saved to a safety copy first.`)) return;
    run(
      'import',
      () =>
        api.importBackup(file).then((r) => {
          const c = r.counts;
          return `Imported ✓ — ${c.applications} job(s), ${c.artifacts} document(s), ${c.memoryNotes} memory note(s), ${c.experiences} experience(s), ${c.interviewSessions} interview(s)${
            r.keptLocalApiKey ? ' · kept this machine’s API key' : ''
          }. Safety copy: ${r.safetyBackup}. Reloading…`;
        }),
      true,
    );
  };
  const reset = (scope: ResetScope) => {
    const what = scope === 'all' ? 'EVERYTHING — profile, experience bank, memory, jobs, settings' : 'all jobs, documents, runs, mock interviews and drills (your profile, experience bank, memory and settings stay)';
    if (!window.confirm(`Start fresh?\n\nThis deletes ${what}.\n\nA full backup is written to ${dataDir ?? '~/.callback'}/backups first, so nothing is lost.`)) return;
    run('reset-' + scope, () => api.resetData(scope).then((r) => `Done ✓ — safety copy at ${r.safetyBackup}. Reloading…`), true);
  };

  return (
    <div className="panel" style={{ padding: 18, marginBottom: 18 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>Backup, move & start fresh</h3>
      <p style={{ color: 'var(--text-dim)', marginTop: 0, fontSize: 13 }}>
        One <span className="kbd">.zip</span> holds everything Callback knows: your profile, experience bank, memory, every job with its
        documents and interview history, and your settings. Export it here, import it on a new machine, carry on with the same context.
      </p>

      <div className="backup-row">
        <button className="btn accent" onClick={exportNow} disabled={!!busy}>
          {busy === 'export' ? 'Packing…' : '⬇ Export backup (.zip)'}
        </button>
        <label className="scrim-note" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} /> include my API key (only for a machine you own)
        </label>
      </div>

      <div className="backup-row">
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          {busy === 'import' ? 'Importing…' : '⬆ Import backup'}
        </button>
        <span className="scrim-note">Replaces what is here; the current data is saved to a safety copy first. This machine’s API key is kept if the backup has none.</span>
      </div>

      <div className="backup-row" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <button className="btn" onClick={() => reset('jobs')} disabled={!!busy} title="Delete jobs, documents, runs, mock interviews and drills — keep profile, experience bank, memory and settings">
          {busy === 'reset-jobs' ? 'Clearing…' : '🧹 Clear jobs & interviews'}
        </button>
        <button className="btn danger" onClick={() => reset('all')} disabled={!!busy} title="Back to first run: no profile, empty bank, no memory. The API key stays.">
          {busy === 'reset-all' ? 'Wiping…' : '⚠ Wipe everything'}
        </button>
        <span className="scrim-note">Both write a full backup first.</span>
      </div>

      {msg && <div style={{ fontSize: 12.5, marginTop: 10, color: msg.kind === 'ok' ? 'var(--brand)' : 'var(--danger)' }}>{msg.text}</div>}

      {backups.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          <div className="scrim-note" style={{ marginBottom: 4 }}>Safety copies on this machine (import one to go back)</div>
          <ul className="backup-list">
            {backups.slice(0, 6).map((b) => (
              <li key={b.file}>
                <span className="kbd">{b.file.split('/').pop()}</span> · {fmtSize(b.size)} · {new Date(b.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

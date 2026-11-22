import { useEffect, useState } from 'react';
import type { FolderInfo, FolderSync } from '@shared/types';
import { api } from '../lib/api';

/** Settings: where each job's folder goes — <root>/<Company>/<Role>/. */
export function FolderSettingsPanel() {
  const [dir, setDir] = useState('');
  const [current, setCurrent] = useState('');
  const [fallback, setFallback] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    api.getConfig().then((c) => {
      setCurrent(c.applicationsDir);
      setFallback(c.applicationsDirDefault);
      setDir(c.applicationsDir === c.applicationsDirDefault ? '' : c.applicationsDir);
    });
  }, []);

  async function save() {
    setMsg(null);
    try {
      const r = await api.saveConfig({ applicationsDir: dir });
      setCurrent(r.applicationsDir);
      setMsg({ kind: 'ok', text: 'Saved ✓' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: String(e?.message ?? e) });
    }
  }

  return (
    <div className="panel" style={{ padding: 18, marginBottom: 18 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>Application folders</h3>
      <p style={{ color: 'var(--text-dim)', marginTop: 0, fontSize: 13 }}>
        Every job gets its own folder, <span className="kbd">Company/Role/</span>: the CV and cover letter you send (plain names, like{' '}
        <span className="kbd">Jane_Doe_CV.pdf</span>), Word copies named for the job, the posting as you captured it, the audits and the prep
        pack. A folder is made when you export a document or log “applied”. Folders that are already there are never written into, and
        starting fresh never deletes them.
      </p>
      <label className="field" style={{ marginBottom: 10 }}>
        <span className="lab">Folder (leave empty for the default)</span>
        <input type="text" value={dir} onChange={(e) => setDir(e.target.value)} placeholder={fallback || '~/.callback/applications'} />
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={save}>
          Save folder
        </button>
        <span className="scrim-note">
          Now: <span className="kbd">{current}</span>
        </span>
        {msg && <span style={{ color: msg.kind === 'ok' ? 'var(--brand)' : 'var(--danger)', fontSize: 13 }}>{msg.text}</span>}
      </div>
      <p className="scrim-note" style={{ margin: '10px 0 0' }}>
        Changing it affects what you save next. Folders already written stay where they are.
      </p>
    </div>
  );
}

/** The drawer row: where this job's folder is, open it, or write everything it has. */
export function JobFolder({ applicationId, refreshKey }: { applicationId: string; refreshKey: number }) {
  const [info, setInfo] = useState<FolderInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FolderSync | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => api.folder(applicationId).then(setInfo).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, refreshKey]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      setResult(await api.saveFolder(applicationId));
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }
  async function open() {
    setErr(null);
    await api.openFolder(applicationId).catch((e: any) => setErr(String(e?.message ?? e)));
  }

  if (!info) return null;
  return (
    <div className="panel" style={{ padding: '10px 12px', marginBottom: 16, fontSize: 12.5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>📁</span>
        {info.path ? (
          <span className="kbd" title={info.path} style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360, whiteSpace: 'nowrap' }}>
            {info.path}
          </span>
        ) : (
          <span style={{ color: 'var(--text-dim)' }}>No folder yet. It is made when you export or log “applied”.</span>
        )}
        <div className="grow" style={{ flex: 1 }} />
        {info.path && (
          <button className="btn ghost sm" onClick={open} title="Show it in your file manager">
            Open
          </button>
        )}
        <button className="btn sm" onClick={save} disabled={busy} title="Write the CV, cover letter, audits, posting and prep pack into this job's folder">
          {busy ? 'Saving…' : info.path ? 'Save all again' : 'Save to folder'}
        </button>
      </div>
      {info.files.length > 0 && (
        <div style={{ color: 'var(--text-faint)', marginTop: 6 }}>{info.files.map((f) => f.name).join(' · ')}</div>
      )}
      {result && (
        <div style={{ marginTop: 6, color: 'var(--text-dim)' }}>
          Saved {result.written.length} file{result.written.length === 1 ? '' : 's'} ✓
          {result.skipped.map((s) => (
            <div key={s.file} style={{ color: 'var(--warn)' }}>
              Not written: {s.file}, {s.reason}.
            </div>
          ))}
        </div>
      )}
      {err && <div style={{ marginTop: 6, color: 'var(--danger)' }}>{err}</div>}
    </div>
  );
}

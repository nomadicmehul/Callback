import { useState } from 'react';
import type { Artifact, AtsReport } from '@shared/types';
import { api } from '../lib/api';
import { Md } from './Markdown';
import { AtsReportView } from './AtsReport';

const EXPORTABLE = new Set(['resume', 'cover_letter', 'interview_prep']);
const CHECKABLE = new Set(['resume', 'cover_letter']);

export function ArtifactCard({
  artifact,
  open,
  onToggle,
  onChanged,
}: {
  artifact: Artifact;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(artifact.content);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AtsReport | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), kind === 'ok' ? 2500 : 7000);
  };

  async function save() {
    setBusy(true);
    try {
      await api.updateArtifact(artifact.id, draft);
      setEditing(false);
      setReport(null);
      flash('ok', 'Saved ✓');
      onChanged();
    } catch (err: any) {
      flash('err', String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setBusy(true);
    try {
      const r = await api.atsCheck(artifact.id);
      setReport(r.report);
    } catch (err: any) {
      flash('err', String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }
  async function download(format: 'pdf' | 'docx') {
    setBusy(true);
    try {
      await api.downloadArtifact(artifact.id, format);
      flash('ok', `Exported ${format.toUpperCase()} ✓`);
    } catch (err: any) {
      flash('err', String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  const revisions = Number(artifact.meta?.revisions ?? 0);

  return (
    <div className="panel" style={{ marginBottom: 8, overflow: 'hidden' }}>
      <div style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={onToggle}>
        <span className="status-chip" style={{ ['--chip' as any]: 'var(--accent)' }}>{artifact.kind.replace('_', ' ')}</span>
        <span style={{ fontSize: 13 }}>{artifact.title}</span>
        {revisions > 0 && <span className="scrim-note">· edited ×{revisions}</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--text-faint)' }}>{open ? '▾' : '▸'}</span>
      </div>

      {open && (
        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--border)' }}>
          {(EXPORTABLE.has(artifact.kind) || CHECKABLE.has(artifact.kind)) && !editing && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              <button
                className="btn sm"
                onClick={() => {
                  setDraft(artifact.content);
                  setEditing(true);
                }}
                disabled={busy}
              >
                ✎ Edit
              </button>
              {CHECKABLE.has(artifact.kind) && (
                <button className="btn sm accent" onClick={check} disabled={busy}>
                  {busy ? 'Checking…' : '🔍 ATS check'}
                </button>
              )}
              {EXPORTABLE.has(artifact.kind) && (
                <>
                  <button className="btn sm" onClick={() => download('pdf')} disabled={busy}>
                    ⬇ PDF
                  </button>
                  <button className="btn sm" onClick={() => download('docx')} disabled={busy}>
                    ⬇ DOCX
                  </button>
                </>
              )}
              {msg && (
                <span style={{ fontSize: 12.5, color: msg.kind === 'ok' ? 'var(--brand)' : 'var(--danger)' }}>{msg.text}</span>
              )}
            </div>
          )}

          {editing ? (
            <>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} style={{ minHeight: 320 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <span className="scrim-note">Replace every <span className="kbd">[fill in: …]</span> with real details — Callback won’t export a scaffold.</span>
                <div style={{ flex: 1 }} />
                <button className="btn ghost sm" onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </button>
                <button className="btn primary sm" onClick={save} disabled={busy || !draft.trim()}>
                  Save
                </button>
              </div>
            </>
          ) : artifact.kind === 'jd_analysis' ? (
            <pre style={{ fontSize: 11.5, overflow: 'auto', color: 'var(--text-dim)', margin: 0 }}>{artifact.content}</pre>
          ) : (
            <Md source={artifact.content} />
          )}

          {report && !editing && (
            <div style={{ marginTop: 12 }}>
              <AtsReportView report={report} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

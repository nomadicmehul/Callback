import { useState } from 'react';
import type { Artifact, AtsReport } from '@shared/types';
import { fillGaps, findGaps, type GapFill } from '@shared/placeholders';
import { api } from '../lib/api';
import { Md } from './Markdown';
import { AtsReportView } from './AtsReport';
import { GapFiller } from './GapFiller';

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
  const [filling, setFilling] = useState(false);
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
  async function saveFills(fills: GapFill[], keep: number[]) {
    setBusy(true);
    try {
      const next = fillGaps(artifact.content, fills);
      await api.updateArtifact(artifact.id, next);
      // Remember every answer (where you're based, a headline…) so the next draft can reuse or suggest it;
      // answers about real experience also go to the bank.
      const gaps = findGaps(artifact.content);
      const typed = fills.flatMap((f) => ('text' in f && gaps[f.index] ? [{ hint: gaps[f.index].hint, answer: f.text }] : []));
      if (typed.length) await api.recordGapAnswers(artifact.id, typed).catch(() => {});
      for (const f of fills) {
        if (!('text' in f) || !keep.includes(f.index)) continue;
        const text = f.text.replace(/\s+/g, ' ').trim();
        const outcome = /outcome|result/i.test(gaps[f.index]?.hint ?? '');
        await api.addExperience({
          kind: 'story',
          title: text.length > 90 ? `${text.slice(0, 90).replace(/\s+\S*$/, '')}…` : text.replace(/\.$/, ''),
          ...(outcome ? { result: text } : { action: text }),
          status: 'active',
          source: 'gap',
          sourceRef: artifact.title,
        });
      }
      const left = findGaps(next).length;
      setFilling(false);
      setReport(null);
      flash('ok', left ? `Saved ✓ — ${left} gap(s) left` : 'Saved ✓ — ready to export');
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
  async function downloadAudit() {
    setBusy(true);
    try {
      await api.downloadAudit(artifact.id);
      flash('ok', 'Audit saved ✓');
    } catch (err: any) {
      flash('err', String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }
  async function download(format: 'pdf' | 'docx') {
    if (gaps.length) {
      // Callback won't export a scaffold — take the human straight to the gaps instead of a dead end.
      setFilling(true);
      return;
    }
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
  const gaps = EXPORTABLE.has(artifact.kind) ? findGaps(artifact.content) : [];

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
          {(EXPORTABLE.has(artifact.kind) || CHECKABLE.has(artifact.kind)) && !editing && !filling && (
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
                <>
                  <button className="btn sm accent" onClick={check} disabled={busy} title="Render, read back like a parser, score six weighted categories">
                    {busy ? 'Checking…' : '🔍 ATS check'}
                  </button>
                  <button className="btn sm" onClick={downloadAudit} disabled={busy} title="The full audit as a Markdown file — score, why, and what to do">
                    ⬇ Audit
                  </button>
                </>
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

          {gaps.length > 0 && !editing && !filling && (
            <div className="issue block gap-banner">
              <span className="lvl">⛔</span>
              <span style={{ flex: 1 }}>
                {gaps.length} gap{gaps.length === 1 ? '' : 's'} to fill with your real details before this can be exported.
              </span>
              <button className="btn primary sm" onClick={() => setFilling(true)} disabled={busy}>
                Fill gaps
              </button>
            </div>
          )}

          {filling && msg && (
            <div style={{ fontSize: 12.5, marginBottom: 8, color: msg.kind === 'ok' ? 'var(--brand)' : 'var(--danger)' }}>{msg.text}</div>
          )}
          {filling ? (
            <GapFiller artifactId={artifact.id} content={artifact.content} busy={busy} onSave={saveFills} onCancel={() => setFilling(false)} />
          ) : editing ? (
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

          {report && !editing && !filling && (
            <div style={{ marginTop: 12 }}>
              <AtsReportView report={report} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

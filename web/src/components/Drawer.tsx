import { useCallback, useEffect, useState } from 'react';
import type { InterviewMode, OutcomeStage, RunEvent } from '@shared/types';
import { api, type ApplicationDetail } from '../lib/api';
import { ALL_STATUSES, statusVar } from '../lib/ui';
import { ActivityFeed } from './Activity';
import { ArtifactCard } from './ArtifactCard';
import { MaterialsRow } from './Materials';
import { RecList } from './Recommendations';

const OUTCOME_STAGES: OutcomeStage[] = ['applied', 'screen', 'interview', 'offer', 'rejected', 'ghosted'];
const MODE_LABEL: Record<InterviewMode, string> = { behavioral: 'Behavioral', technical: 'Technical', system_design: 'System design' };

export interface InterviewTarget {
  applicationId: string;
  sessionId?: string | null;
  /** Jump straight to this job's due drills. */
  drills?: boolean;
}

export function ApplicationDrawer({
  id,
  activity,
  onClose,
  onChanged,
  onInterview,
}: {
  id: string;
  activity: RunEvent[];
  onClose: () => void;
  onChanged: () => void;
  onInterview: (target: InterviewTarget) => void;
}) {
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [openArt, setOpenArt] = useState<string | null>(null);
  const [outStage, setOutStage] = useState<OutcomeStage>('applied');
  const [outDetail, setOutDetail] = useState('');
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ company: '', role: '', location: '' });

  const load = useCallback(() => {
    api.getApplication(id).then(setDetail).catch(() => {});
  }, [id]);

  // Reload on open and whenever new events stream in (keeps the drawer live).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, activity.length]);
  const runIds = (detail?.runs ?? []).map((r) => r.id);
  const myActivity = activity.filter((e) => runIds.includes(e.runId));

  if (!detail) return null;
  const a = detail.application;
  const an = a.analysis;
  const m = a.materials;
  const drillsDue = detail.drills.filter((d) => d.dueAt <= new Date().toISOString());
  const drillsLater = detail.drills.length - drillsDue.length;

  async function setStatus(s: string) {
    await api.setStatus(id, s as any);
    load();
    onChanged();
  }
  async function retailor() {
    await api.tailor(id);
    load();
    onChanged();
  }
  async function prep() {
    await api.prep(id);
    load();
    onChanged();
  }
  async function logOutcome() {
    await api.recordOutcome(id, outStage, outDetail);
    setOutDetail('');
    load();
    onChanged();
  }
  function startEdit() {
    setEdit({ company: a.company, role: a.role, location: a.location ?? '' });
    setEditing(true);
  }
  async function saveEdit() {
    await api.updateApplication(id, { company: edit.company, role: edit.role, location: edit.location.trim() || null });
    setEditing(false);
    load();
    onChanged();
  }

  return (
    <div className="drawer">
      <div className="modal" style={{ border: 'none', borderRadius: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <header>
          {editing ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1 }}>
              <input type="text" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} placeholder="Role" />
              <input type="text" value={edit.company} onChange={(e) => setEdit({ ...edit, company: e.target.value })} placeholder="Company" />
              <input type="text" value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} placeholder="Location (optional)" />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button className="btn ghost sm" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button className="btn primary sm" onClick={saveEdit} disabled={!edit.role.trim() || !edit.company.trim()}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 650, fontSize: 16 }}>
                {a.role}{' '}
                <button className="btn ghost sm" onClick={startEdit} title="Fix the company, role, or location" style={{ padding: '0 6px', fontSize: 12 }}>
                  ✎
                </button>
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                {a.company}
                {a.location && <span style={{ color: 'var(--text-faint)' }}> · {a.location}</span>}
                {a.jdUrl && (
                  <>
                    {' · '}
                    <a href={a.jdUrl} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--accent)' }}>
                      posting ↗
                    </a>
                  </>
                )}
              </div>
            </div>
          )}
          <div className="grow" />
          <span className="status-chip" style={{ ['--chip' as any]: statusVar(a.status) }}>{a.status}</span>
          <button className="btn ghost sm" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="body" style={{ overflow: 'auto', flex: 1 }}>
          {/* What this job has — its own documents and its own interview record */}
          <div style={{ marginBottom: 14 }}>
            <MaterialsRow m={m} />
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>Status</label>
            <select value={a.status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button className="btn sm" onClick={retailor} title="Drafts this job's resume and cover letter (you approve each)">
              ⟳ {m.resume ? 'Re-tailor' : 'Tailor resume + letter'}
            </button>
            <button className="btn sm" onClick={prep} title="Build an interview prep pack for this role">
              📋 {m.prep ? 'Rebuild prep pack' : 'Prep pack'}
            </button>
            <button className="btn sm" onClick={() => onInterview({ applicationId: id })} title="Mock interview with company-specific questions from this JD">
              🎤 Mock interview
            </button>
            {a.fitScore != null && (
              <span className="badge" style={{ marginLeft: 'auto' }}>
                {a.fitScore}/100 fit
              </span>
            )}
          </div>

          {a.guardFlags?.length > 0 && (
            <div className="guard-note" style={{ marginBottom: 16 }}>
              <b>⚠ Posting guard cleaned this job description.</b> Removed before any agent read it:
              <ul>
                {a.guardFlags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Analysis */}
          {an && (
            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 8px' }}>Analysis</h3>
              {an.fitRationale && <p style={{ marginTop: 0, color: 'var(--text-dim)', fontSize: 13 }}>{an.fitRationale}</p>}
              {an.mustHaves.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 650, margin: '8px 0 4px' }}>Must-haves</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {an.mustHaves.map((mh, i) => (
                      <li key={i}>{mh}</li>
                    ))}
                  </ul>
                </>
              )}
              {an.redFlags.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 650, margin: '10px 0 4px', color: 'var(--danger)' }}>Potential red flags</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-dim)' }}>
                    {an.redFlags.map((rf, i) => (
                      <li key={i}>{rf}</li>
                    ))}
                  </ul>
                </>
              )}
              {an.keywords.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {an.keywords.slice(0, 12).map((k) => (
                    <span key={k} className="kbd">
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Documents — this job's own */}
          <section style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 8px' }}>
              Documents for this job{detail.artifacts.length > 0 && <span className="scrim-note"> · {detail.artifacts.length}</span>}
            </h3>
            {detail.artifacts.length === 0 && <div className="col-empty">No documents yet. Run “Tailor resume + letter”.</div>}
            {detail.artifacts.map((art) => (
              <ArtifactCard
                key={art.id}
                artifact={art}
                open={openArt === art.id}
                onToggle={() => setOpenArt(openArt === art.id ? null : art.id)}
                onChanged={() => {
                  load();
                  onChanged();
                }}
              />
            ))}
          </section>

          {/* Interview prep — this job's own sessions and drills */}
          <section style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 8px' }}>
              Interview prep for this job
              {m.interviews > 0 && (
                <span className="scrim-note">
                  {' '}
                  · {m.interviews} session{m.interviews > 1 ? 's' : ''}
                  {m.avgInterviewScore != null ? ` · avg ${m.avgInterviewScore}/5` : ''}
                </span>
              )}
            </h3>
            {detail.interviews.length === 0 ? (
              <div className="col-empty">
                No mock interviews for this role yet.{' '}
                <a href="#" onClick={(e) => (e.preventDefault(), onInterview({ applicationId: id }))}>
                  Start one
                </a>{' '}
                — questions come from this JD.
              </div>
            ) : (
              detail.interviews.map((s) => (
                <div key={s.id} className="ivrow" onClick={() => onInterview({ applicationId: id, sessionId: s.id })} title="Open this session">
                  <span className="status-chip" style={{ ['--chip' as any]: 'var(--violet)' }}>{MODE_LABEL[s.mode]}</span>
                  {s.stage && (
                    <span className="scrim-note" title="Where this job was in the pipeline when you practiced">
                      at {s.stage}
                    </span>
                  )}
                  <span className="sum">{s.status === 'running' ? 'In progress — click to resume' : s.summary ?? 'Finished'}</span>
                  <span className="scrim-note">{new Date(s.startedAt).toLocaleDateString()}</span>
                  <span className="sc" style={{ color: s.avgScore == null ? 'var(--text-faint)' : s.avgScore >= 4 ? 'var(--brand)' : s.avgScore >= 3 ? 'var(--warn)' : 'var(--danger)' }}>
                    {s.avgScore != null ? `${s.avgScore}/5` : '—'}
                  </span>
                </div>
              ))
            )}
            {detail.drills.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5, color: 'var(--text-dim)' }}>
                <span>
                  ⏰ {drillsDue.length} drill{drillsDue.length === 1 ? '' : 's'} due now
                  {drillsLater > 0 ? ` · ${drillsLater} scheduled` : ''} — from this job's weak answers.
                </span>
                {drillsDue.length > 0 && (
                  <button className="btn sm" onClick={() => onInterview({ applicationId: id, drills: true })}>
                    Drill now →
                  </button>
                )}
              </div>
            )}
            {(() => {
              const last = detail.interviews.find((s) => s.status === 'done' && s.recommendations?.length);
              return last ? (
                <div style={{ marginTop: 10 }}>
                  <RecList recs={last.recommendations.slice(0, 3)} title={`Next steps from your last ${MODE_LABEL[last.mode].toLowerCase()} mock`} />
                </div>
              ) : null;
            })()}
          </section>

          {/* Outcome logger — feeds the learning loop */}
          <section style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 8px' }}>Log an outcome</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={outStage} onChange={(e) => setOutStage(e.target.value as OutcomeStage)} style={{ width: 'auto' }}>
                {OUTCOME_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={outDetail}
                onChange={(e) => setOutDetail(e.target.value)}
                placeholder="optional note (e.g. 'recruiter screen Thursday')"
                style={{ flex: 1, minWidth: 160 }}
              />
              <button className="btn sm" onClick={logOutcome}>
                Log
              </button>
            </div>
            {detail.outcomes.length > 0 && (
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--text-dim)' }}>
                {detail.outcomes.map((o) => (
                  <li key={o.id}>
                    <b>{o.stage}</b>
                    {o.detail ? ` — ${o.detail}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Live activity for this application */}
          <section>
            <h3 style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 8px' }}>Agent activity</h3>
            <ActivityFeed events={myActivity} empty="No agent runs yet for this application." />
          </section>
        </div>
      </div>
    </div>
  );
}

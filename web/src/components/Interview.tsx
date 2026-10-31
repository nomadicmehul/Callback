import { useCallback, useEffect, useState } from 'react';
import type { AnswerScore, Application, Drill, InterviewMode, InterviewSession, InterviewTurn, RunEvent } from '@shared/types';
import { api } from '../lib/api';
import { statusVar } from '../lib/ui';
import { Dictate, appendSpoken } from './Dictate';
import { RecList } from './Recommendations';
import type { InterviewTarget } from './Drawer';

const MODES: { key: InterviewMode; label: string; blurb: string }[] = [
  { key: 'behavioral', label: 'Behavioral', blurb: 'STAR stories, ownership, quantified impact.' },
  { key: 'technical', label: 'Technical', blurb: 'Patterns, complexity, edge cases — understanding, not memorization.' },
  { key: 'system_design', label: 'System design', blurb: 'Requirements, estimates, trade-offs, bottlenecks.' },
];

const DIM_LABELS: Record<string, string> = {
  structure: 'STAR structure',
  ownership: 'Ownership',
  impact: 'Quantified result',
  reflection: 'Reflection',
  concision: 'Concision',
  approach: 'Approach',
  complexity: 'Complexity',
  edge_cases: 'Edge cases',
  correctness: 'Correctness',
  communication: 'Communication',
  requirements: 'Requirements',
  estimation: 'Estimation',
  design: 'Design',
  tradeoffs: 'Trade-offs',
  bottlenecks: 'Bottlenecks',
};

const modeLabel = (m: InterviewMode) => MODES.find((x) => x.key === m)?.label ?? m;
const barColor = (v: number) => (v >= 4 ? 'var(--brand)' : v >= 3 ? 'var(--warn)' : 'var(--danger)');

function ScoreCard({ score }: { score: AnswerScore }) {
  return (
    <div className="score">
      <div className="score-head">
        <span className="score-overall" style={{ color: barColor(score.overall) }}>
          {score.overall.toFixed(1)}
          <small>/5</small>
        </span>
        <span className="score-fix">💡 {score.fix}</span>
      </div>
      <div className="bars">
        {Object.entries(score.dims).map(([k, v]) => (
          <div className="bar" key={k}>
            <span className="bar-label">{DIM_LABELS[k] ?? k}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(v / 5) * 100}%`, background: barColor(v) }} />
            </span>
            <span className="bar-val">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Senior Backend @ Acme · at screen" — the job a session or drill belongs to. */
function JobTag({
  applications,
  applicationId,
  stage,
}: {
  applications: Application[];
  applicationId: string | null;
  stage?: string | null;
}) {
  const a = applications.find((x) => x.id === applicationId);
  if (!a) return <span className="scrim-note">General practice</span>;
  return (
    <span className="scrim-note" title="This session is saved under this job in your pipeline">
      for <b style={{ color: 'var(--text)' }}>{a.role}</b> @ {a.company}
      {stage && (
        <>
          {' '}
          · <span style={{ color: statusVar(stage as any) }}>at {stage}</span>
        </>
      )}
    </span>
  );
}

export function InterviewView({
  applications,
  activity,
  target,
  onChanged,
}: {
  applications: Application[];
  activity: RunEvent[];
  /** Where the user came from: a pipeline job, and optionally a specific session or its drills. */
  target: InterviewTarget | null;
  onChanged: () => void;
}) {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [active, setActive] = useState<{ session: InterviewSession; turns: InterviewTurn[] } | null>(null);
  const [drills, setDrills] = useState<{ due: Drill[]; upcoming: Drill[] }>({ due: [], upcoming: [] });
  const [mode, setMode] = useState<InterviewMode>('behavioral');
  const [appId, setAppId] = useState<string>(target?.applicationId ?? '');
  const [onlyThisJob, setOnlyThisJob] = useState<boolean>(Boolean(target?.applicationId));
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drill, setDrill] = useState<Drill | null>(null);
  const [drillAnswer, setDrillAnswer] = useState('');
  const [drillResult, setDrillResult] = useState<{ score: AnswerScore; drill: Drill } | null>(null);

  const load = useCallback(async () => {
    const [s, d] = await Promise.all([api.interviews(), api.drills()]);
    setSessions(s);
    setDrills(d);
    return d;
  }, []);
  const loadActive = useCallback(async (id: string) => setActive(await api.interview(id)), []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  // Arriving from a pipeline job: preselect it, open the requested session, or jump to its drills.
  useEffect(() => {
    if (!target) return;
    setAppId(target.applicationId);
    setOnlyThisJob(true);
    if (target.sessionId) loadActive(target.sessionId).catch(() => {});
    else setActive(null);
    if (target.drills) {
      load()
        .then((d) => setDrill(d.due.find((x) => x.applicationId === target.applicationId) ?? d.due[0] ?? null))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Keep the live session in sync with the agent's events.
  useEffect(() => {
    const last = activity[activity.length - 1];
    if (!last || !active) return;
    if (
      (last.type === 'interview_question' || last.type === 'interview_score' || last.type === 'interview_done') &&
      last.sessionId === active.session.id
    ) {
      loadActive(active.session.id).catch(() => {});
      if (last.type === 'interview_done') load().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.length]);

  async function start() {
    setBusy(true);
    setError('');
    try {
      const s = await api.startInterview(mode, appId || null);
      await loadActive(s.id);
      await load();
      onChanged();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!active || !answer.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.answerInterview(active.session.id, answer);
      setAnswer('');
      await loadActive(active.session.id);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }
  async function end() {
    if (!active) return;
    setBusy(true);
    try {
      await api.endInterview(active.session.id);
      await loadActive(active.session.id);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  async function submitDrill() {
    if (!drill || !drillAnswer.trim()) return;
    setBusy(true);
    try {
      const r = await api.answerDrill(drill.id, drillAnswer);
      setDrillResult(r);
      setDrillAnswer('');
      await load();
      onChanged();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }
  function nextDrill() {
    setDrillResult(null);
    const remaining = drills.due.filter((d) => d.id !== drill?.id);
    setDrill(remaining[0] ?? null);
  }

  const open = active?.turns.find((t) => t.answer == null) ?? null;
  const waiting = Boolean(active && active.session.status === 'running' && !open);
  const selectedApp = applications.find((x) => x.id === appId) ?? null;
  const visibleSessions = onlyThisJob && appId ? sessions.filter((s) => s.applicationId === appId) : sessions;
  const scoreColor = (v: number | null) => (v == null ? 'var(--text-faint)' : barColor(v));

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Spaced-repetition queue */}
      <div className="banner" style={{ background: 'color-mix(in srgb, var(--violet) 9%, var(--panel))', borderColor: 'color-mix(in srgb, var(--violet) 35%, var(--border))' }}>
        <div>
          <b>Drills.</b> {drills.due.length} due now · {drills.upcoming.length} scheduled. Weak answers come back on a spaced
          schedule until they’re strong — that’s how the practice sticks.
        </div>
        {drills.due.length > 0 && !drill && (
          <button className="btn primary sm" onClick={() => setDrill(drills.due[0])}>
            Drill now →
          </button>
        )}
      </div>

      {drill && (
        <div className="drill-card">
          <div className="scrim-note" style={{ marginBottom: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>
              Drill · {modeLabel(drill.mode)} · {DIM_LABELS[drill.dimension] ?? drill.dimension}
              {drill.lastScore != null && ` · last time ${drill.lastScore}/5`}
            </span>
            <span>·</span>
            <JobTag applications={applications} applicationId={drill.applicationId} />
          </div>
          <div className="bubble q">{drill.question}</div>
          {drillResult ? (
            <>
              <ScoreCard score={drillResult.score} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                <span className="scrim-note">Next due {new Date(drillResult.drill.dueAt).toLocaleDateString()} (every {drillResult.drill.intervalDays}d)</span>
                <div style={{ flex: 1 }} />
                <button className="btn sm" onClick={nextDrill}>
                  {drills.due.filter((d) => d.id !== drill.id).length ? 'Next drill →' : 'Done'}
                </button>
              </div>
            </>
          ) : (
            <>
              <textarea value={drillAnswer} onChange={(e) => setDrillAnswer(e.target.value)} placeholder="Answer out loud — hit Speak to have it written down, or type the gist here." style={{ minHeight: 110, fontFamily: 'var(--font)' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn ghost sm" onClick={() => setDrill(null)}>
                  Later
                </button>
                <Dictate onText={(t) => setDrillAnswer((prev) => appendSpoken(prev, t))} disabled={busy} />
                <div style={{ flex: 1 }} />
                <button className="btn primary sm" onClick={submitDrill} disabled={busy || !drillAnswer.trim()}>
                  Score it
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Live session */}
      {active ? (
        <div className="panel" style={{ padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span className="status-chip" style={{ ['--chip' as any]: 'var(--violet)' }}>{modeLabel(active.session.mode)}</span>
            <JobTag applications={applications} applicationId={active.session.applicationId} stage={active.session.stage} />
            {active.session.avgScore != null && (
              <span className="scrim-note">
                · avg <b style={{ color: scoreColor(active.session.avgScore) }}>{active.session.avgScore}/5</b> over {active.session.answered}
              </span>
            )}
            <div style={{ flex: 1 }} />
            {active.session.status === 'running' ? (
              <button className="btn sm" onClick={end} disabled={busy}>
                End session
              </button>
            ) : (
              <button className="btn ghost sm" onClick={() => setActive(null)}>
                ✕ Close
              </button>
            )}
          </div>

          <div className="chat">
            {active.turns.map((t) => (
              <div key={t.id}>
                <div className="bubble q">
                  <span className="qn">Q{t.seq} · {DIM_LABELS[t.dimension] ?? t.dimension}</span>
                  {t.question}
                </div>
                {t.answer && <div className="bubble a">{t.answer}</div>}
                {t.score && <ScoreCard score={t.score} />}
              </div>
            ))}
            {waiting && <div className="scrim-note">● interviewer is thinking…</div>}
            {active.session.status === 'done' && (
              <div className="guard-note" style={{ borderColor: 'color-mix(in srgb, var(--brand) 40%, var(--border))', background: 'color-mix(in srgb, var(--brand) 8%, transparent)' }}>
                <b style={{ color: 'var(--brand)' }}>🏁 Session complete.</b> {active.session.summary}
                <div className="scrim-note" style={{ marginTop: 6 }}>
                  Proposed weaknesses wait in <b>Memory</b> for your approval — activate them and the next session will target them.
                  {active.session.applicationId && ' This session is saved under its job in the Pipeline.'}
                </div>
                {active.session.recommendations?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <RecList recs={active.session.recommendations} title="Next steps — from this session's weakest dimensions and the job's stack. For the next round, not the next hour." />
                  </div>
                )}
              </div>
            )}
          </div>

          {open && active.session.status === 'running' && (
            <div style={{ marginTop: 12 }}>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Answer as you would out loud — type, or hit Speak and talk. Situation → what YOU did → the measurable result → what you learned."
                style={{ minHeight: 130, fontFamily: 'var(--font)' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Dictate onText={(t) => setAnswer((prev) => appendSpoken(prev, t))} disabled={busy} />
                <span className="scrim-note">{answer.trim().split(/\s+/).filter(Boolean).length} words · aim for 150–250</span>
                <div style={{ flex: 1 }} />
                <button className="btn primary" onClick={send} disabled={busy || !answer.trim()}>
                  {busy ? 'Sending…' : 'Send answer →'}
                </button>
              </div>
            </div>
          )}
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>
      ) : (
        <div className="panel" style={{ padding: 18, marginBottom: 18 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>Start a mock interview</h3>
          <p className="scrim-note" style={{ marginTop: 0 }}>
            Honest prep that makes you better — scored on real signals, with one concrete fix per answer. Never real-time help during a live interview.
          </p>
          <div className="mode-grid">
            {MODES.map((m) => (
              <div key={m.key} className={`mode-card ${mode === m.key ? 'active' : ''}`} onClick={() => setMode(m.key)}>
                <div style={{ fontWeight: 650 }}>{m.label}</div>
                <div className="scrim-note">{m.blurb}</div>
              </div>
            ))}
          </div>
          <label className="field" style={{ marginTop: 14 }}>
            <span className="lab">Which job is this for? (unlocks company-specific questions from its JD)</span>
            <select value={appId} onChange={(e) => setAppId(e.target.value)}>
              <option value="">General practice (not tied to a job)</option>
              {applications.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.role} @ {a.company} · {a.status}
                  {a.materials?.interviews ? ` · ${a.materials.interviews} session${a.materials.interviews > 1 ? 's' : ''}` : ''}
                </option>
              ))}
            </select>
          </label>
          {selectedApp && (
            <div className="scrim-note" style={{ marginBottom: 10 }}>
              Questions will be grounded in the <b>{selectedApp.role} @ {selectedApp.company}</b> posting
              {selectedApp.materials?.prep ? ' and its prep pack' : ''}; the session is saved under that job in your pipeline
              {selectedApp.status !== 'saved' ? ` (currently at “${selectedApp.status}”)` : ''}.
            </div>
          )}
          <button className="btn primary" onClick={start} disabled={busy}>
            {busy ? 'Starting…' : '🎤 Start interview'}
          </button>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>
      )}

      {/* History */}
      {sessions.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 10px' }}>
            <h3 style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
              Past sessions{onlyThisJob && selectedApp ? ` · ${selectedApp.role} @ ${selectedApp.company}` : ''}
            </h3>
            {appId && (
              <button className="btn ghost sm" onClick={() => setOnlyThisJob((v) => !v)}>
                {onlyThisJob ? 'Show all jobs' : 'Only this job'}
              </button>
            )}
          </div>
          {visibleSessions.length === 0 && <div className="col-empty">No sessions for this job yet.</div>}
          {visibleSessions.map((s) => (
            <div key={s.id} className="mem" style={{ cursor: 'pointer' }} onClick={() => loadActive(s.id)}>
              <div className="kind" style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}>
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {modeLabel(s.mode)} · {s.status === 'running' ? 'in progress' : 'done'}
                </span>
                <JobTag applications={applications} applicationId={s.applicationId} stage={s.stage} />
                <span style={{ marginLeft: 'auto', color: scoreColor(s.avgScore), fontVariantNumeric: 'tabular-nums' }}>
                  {s.avgScore != null ? `${s.avgScore}/5 · ${s.answered} answered` : 'not scored yet'}
                </span>
              </div>
              <div className="c" style={{ marginBottom: 2 }}>{s.summary ?? 'In progress — click to resume.'}</div>
              <div className="foot">{new Date(s.startedAt).toLocaleString()}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

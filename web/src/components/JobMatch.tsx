import { useEffect, useState } from 'react';
import type { Artifact, AtsReport } from '@shared/types';
import { api } from '../lib/api';

const scoreColor = (s: number) => (s >= 80 ? 'var(--brand)' : s >= 60 ? 'var(--warn)' : 'var(--danger)');
const version = (a: Artifact | undefined) => (a ? `${a.id}:${a.meta?.revisions ?? 0}` : '');

/** The audit at a glance, without opening anything: how the current CV matches this job, what's missing,
 *  and what to do next. Runs on its own whenever the current CV or letter changes. */
export function JobMatch({ resume, letter, onOpen }: { resume?: Artifact; letter?: Artifact; onOpen: (artifactId: string) => void }) {
  const [cv, setCv] = useState<AtsReport | null>(null);
  const [cl, setCl] = useState<AtsReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setErr(null);
    if (resume) api.atsCheck(resume.id).then((r) => setCv(r.report), (e) => setErr(String(e?.message ?? e)));
    else setCv(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version(resume)]);
  useEffect(() => {
    if (letter) api.atsCheck(letter.id).then((r) => setCl(r.report), () => setCl(null));
    else setCl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version(letter)]);

  if (!resume) return null;
  if (!cv) return <div className="panel job-match scrim-note">{err ? `Audit failed: ${err}` : 'Checking your CV against this job…'}</div>;

  const k = cv.keywords;
  const inContext = k.found.filter((x) => !k.skillsOnly.includes(x));
  const missing = cv.mustHaves.unaddressed;
  const next = [
    ...cv.issues.filter((i) => i.level === 'block').map((i) => i.text),
    ...missing.slice(0, 2).map((m) => `Show real evidence for “${m.length > 90 ? m.slice(0, 90) + '…' : m}”, if you have it — or name it as a gap in the letter.`),
    ...cv.suggestions,
  ].slice(0, 4);

  async function download() {
    await api.downloadAudit(resume!.id).then(() => setSaved(true), (e) => setErr(String(e?.message ?? e)));
  }

  return (
    <section className="panel job-match">
      <div className="job-match-head">
        <div className="ats-score" style={{ color: scoreColor(cv.score) }}>
          {cv.score}
          <small>/100</small>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650 }}>Your CV against this job</div>
          <div className="scrim-note">
            {cv.verdict}
            {cl && (
              <>
                {' · '}cover letter <b style={{ color: scoreColor(cl.score) }}>{cl.score}/100</b>
              </>
            )}
          </div>
        </div>
        <button className="btn sm" onClick={() => onOpen(resume.id)} title="Every category, keyword and finding">
          Full audit
        </button>
        <button className="btn sm" onClick={download} title="The full audit as a Markdown file">
          {saved ? 'Saved ✓' : '⬇ Audit'}
        </button>
      </div>

      <div className="job-match-cols">
        <div>
          <div className="job-match-label good">
            Matches · {cv.mustHaves.addressed.length} of {cv.mustHaves.addressed.length + missing.length} must-haves
          </div>
          <ul>
            {cv.mustHaves.addressed.slice(0, 4).map((m) => (
              <li key={m}>✓ {m}</li>
            ))}
          </ul>
          {inContext.length > 0 && (
            <div className="chips">
              {inContext.map((x) => (
                <span key={x} className="chip found">
                  {x}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="job-match-label bad">Missing or weak</div>
          {missing.length === 0 && k.missing.length === 0 && k.skillsOnly.length === 0 ? (
            <div className="scrim-note">Nothing the posting asks for is missing.</div>
          ) : (
            <>
              <ul>
                {missing.map((m) => (
                  <li key={m}>✗ {m}</li>
                ))}
              </ul>
              {(k.missing.length > 0 || k.skillsOnly.length > 0) && (
                <div className="chips">
                  {k.missing.map((x) => (
                    <span key={x} className="chip missing" title="The posting names it; your CV doesn't">
                      {x}
                    </span>
                  ))}
                  {k.skillsOnly.map((x) => (
                    <span key={x} className="chip weak" title="Only in your skills list — show it in a bullet if it's real">
                      {x}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {next.length > 0 && (
        <div className="job-match-next">
          <div className="job-match-label">Next steps</div>
          <ol>
            {next.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      {cv.unverifiedClaims.length > 0 && (
        <div className="scrim-note" style={{ color: 'var(--warn)', marginTop: 6 }}>
          ⚠ {cv.unverifiedClaims.length} number{cv.unverifiedClaims.length === 1 ? '' : 's'} not found in your profile. Open the full audit to check each one.
        </div>
      )}
      <div className="scrim-note" style={{ marginTop: 6 }}>Add a missing term only if it is true for you. Callback never adds one for you.</div>
    </section>
  );
}

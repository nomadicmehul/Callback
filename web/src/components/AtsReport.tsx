import type { AtsReport } from '@shared/types';

const scoreColor = (s: number) => (s >= 80 ? 'var(--brand)' : s >= 60 ? 'var(--warn)' : 'var(--danger)');

export function AtsReportView({ report }: { report: AtsReport }) {
  const r = report;
  return (
    <div className="ats">
      <div className="ats-head">
        <div className="ats-score" style={{ color: scoreColor(r.score) }}>
          {r.score}
          <small>/100</small>
        </div>
        <div className="ats-meta">
          <div>
            <b>{r.pages}</b> page{r.pages === 1 ? '' : 's'} · <b>{r.parseable ? 'parseable' : 'NOT parseable'}</b> ·{' '}
            {r.extractedChars.toLocaleString()} chars read back
          </div>
          <div className="scrim-note">
            email {r.contact.email ? '✓' : '✗'} · phone {r.contact.phone ? '✓' : '✗'} · sections:{' '}
            {r.sections.length ? r.sections.join(', ') : 'none detected'}
          </div>
        </div>
      </div>

      {r.issues.length > 0 && (
        <ul className="ats-issues">
          {r.issues.map((i, idx) => (
            <li key={idx} className={`issue ${i.level}`}>
              <span className="lvl">{i.level === 'block' ? '⛔' : i.level === 'warn' ? '⚠' : 'ℹ'}</span>
              {i.text}
            </li>
          ))}
        </ul>
      )}

      {r.keywords.coverage != null && (
        <div style={{ marginTop: 10 }}>
          <div className="scrim-note" style={{ marginBottom: 6 }}>
            Posting keywords — {Math.round(r.keywords.coverage * 100)}% present. Add missing ones <b>only if genuinely true</b>.
          </div>
          <div className="chips">
            {r.keywords.found.map((k) => (
              <span key={k} className="chip found">
                {k}
              </span>
            ))}
            {r.keywords.missing.map((k) => (
              <span key={k} className="chip missing">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {(r.mustHaves.addressed.length > 0 || r.mustHaves.unaddressed.length > 0) && (
        <div style={{ marginTop: 10, fontSize: 12.5 }}>
          <div className="scrim-note" style={{ marginBottom: 4 }}>Must-haves</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {r.mustHaves.addressed.map((m) => (
              <li key={m} style={{ color: 'var(--text-dim)' }}>
                ✓ {m}
              </li>
            ))}
            {r.mustHaves.unaddressed.map((m) => (
              <li key={m} style={{ color: 'var(--warn)' }}>
                ✗ {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.unverifiedClaims.length > 0 && (
        <div className="guard-note" style={{ marginTop: 10 }}>
          <b>Verify these numbers.</b> They don’t appear in your profile — make sure each one is true before you send this:
          <ul>
            {r.unverifiedClaims.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

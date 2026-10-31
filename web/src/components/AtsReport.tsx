import { useState } from 'react';
import type { AtsReport, AuditCategory } from '@shared/types';

const scoreColor = (s: number) => (s >= 80 ? 'var(--brand)' : s >= 60 ? 'var(--warn)' : 'var(--danger)');

/** One weighted category: a bar, and on click the strengths and findings behind it. */
function CategoryRow({ c }: { c: AuditCategory }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`audit-cat ${open ? 'open' : ''}`} onClick={() => setOpen((v) => !v)} title={c.hint}>
      <div className="audit-cat-row">
        <span className="audit-cat-label">
          {c.label} <span className="scrim-note">· {c.hint}</span>
        </span>
        <span className="audit-bar">
          <span className="audit-bar-fill" style={{ width: `${c.score}%`, background: scoreColor(c.score) }} />
        </span>
        <span className="audit-cat-score" style={{ color: scoreColor(c.score) }}>
          {c.score}
        </span>
        <span className="audit-cat-weight">{Math.round(c.weight * 100)}%</span>
      </div>
      {open && (c.strengths.length > 0 || c.findings.length > 0) && (
        <ul className="audit-cat-detail">
          {c.strengths.map((s, i) => (
            <li key={`s${i}`} className="good">
              ✓ {s}
            </li>
          ))}
          {c.findings.map((f, i) => (
            <li key={`f${i}`}>✗ {f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
          <div style={{ fontWeight: 600 }}>{r.verdict}</div>
          <div className="scrim-note">
            {r.pages} page{r.pages === 1 ? '' : 's'} · {r.parseable ? 'parseable' : 'NOT parseable'} · {r.extractedChars.toLocaleString()} chars read back · email{' '}
            {r.contact.email ? '✓' : '✗'} · phone {r.contact.phone ? '✓' : '✗'}
          </div>
        </div>
      </div>

      {r.categories?.length > 0 && (
        <div className="audit-cats">
          {r.categories.map((c) => (
            <CategoryRow key={c.key} c={c} />
          ))}
          <div className="scrim-note" style={{ marginTop: 4 }}>
            Weighted average of the categories; placeholders cap it at 40, an unreadable text layer at 30. Click a row for the why.
          </div>
        </div>
      )}

      {r.standout?.length > 0 && (
        <div className="audit-standout">
          <div className="scrim-note" style={{ marginBottom: 4 }}>What makes it stand out</div>
          <ul>
            {r.standout.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

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
            Posting keywords — {Math.round(r.keywords.coverage * 100)}% weighted coverage (k8s = Kubernetes; a term only in your skills list counts 60%). Add missing ones{' '}
            <b>only if genuinely true</b>.
          </div>
          <div className="chips">
            {r.keywords.found.map((k) => (
              <span key={k} className={`chip ${r.keywords.skillsOnly?.includes(k) ? 'weak' : 'found'}`} title={r.keywords.skillsOnly?.includes(k) ? 'Only in your skills list — show it in a bullet' : 'Used in context'}>
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

      {r.suggestions.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5 }}>
          <div className="scrim-note" style={{ marginBottom: 4 }}>
            Make it stronger — style and evidence only; every detail stays yours
          </div>
          <ul className="suggestions">
            {r.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
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

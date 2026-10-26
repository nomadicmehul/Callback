import { useState } from 'react';
import type { Approval } from '@shared/types';
import { api, type FetchedPosting } from '../lib/api';
import { Md } from './Markdown';

const SOURCE_LABEL: Record<NonNullable<FetchedPosting['companySource']>, string> = {
  'json-ld': 'from the page’s structured job data',
  meta: 'from the page’s site name',
  title: 'guessed from the page title — check it',
  url: 'guessed from the web address — check it',
};

// ─── Capture a new job ──────────────────────────────────────────────────────
export function NewApplicationModal({
  onClose,
  onCreated,
  hasProfile,
  onGoSettings,
}: {
  onClose: () => void;
  onCreated: () => void;
  hasProfile: boolean;
  onGoSettings: () => void;
}) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [jdUrl, setJdUrl] = useState('');
  const [jdText, setJdText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [flags, setFlags] = useState<string[]>([]);
  const [fetched, setFetched] = useState<FetchedPosting | null>(null);
  const [error, setError] = useState('');

  async function fetchFromUrl() {
    if (!jdUrl.trim()) return;
    setFetching(true);
    setError('');
    try {
      const r = await api.fetchJd(jdUrl);
      setJdText(r.text);
      setFlags(r.flags);
      setFetched(r);
      // Fill what the page states; never overwrite something the user already typed.
      if (!company.trim() && r.company) setCompany(r.company);
      if (!role.trim() && r.role) setRole(r.role.slice(0, 120));
      if (!location.trim() && r.location) setLocation(r.location);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setFetching(false);
    }
  }

  async function submit(tailor: boolean) {
    if (!jdText.trim() && !jdUrl.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.createApplication({ company, role, location: location || undefined, jdText, jdUrl: jdUrl || undefined, tailor });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(jdText.trim() || jdUrl.trim());

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Capture a job</h2>
          <div className="grow" />
          <span className="scrim-note">Paste a posting or its URL — Callback analyzes fit and drafts honest, tailored materials.</span>
        </header>
        <div className="body">
          {!hasProfile && (
            <div className="banner" style={{ marginBottom: 16 }}>
              <div>
                <b>No profile yet.</b> Drafts will be honest scaffolds with placeholders until you add your real experience.
              </div>
              <button className="btn sm" onClick={onGoSettings}>
                Add my resume first →
              </button>
            </div>
          )}
          <label className="field">
            <span className="lab">Job posting URL</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={jdUrl} onChange={(e) => setJdUrl(e.target.value)} placeholder="https://…" style={{ flex: 1 }} />
              <button className="btn" onClick={fetchFromUrl} disabled={fetching || !jdUrl.trim()}>
                {fetching ? 'Fetching…' : 'Fetch'}
              </button>
            </div>
          </label>
          {fetched && (
            <div className="scrim-note" style={{ marginTop: -6, marginBottom: 12 }}>
              ✓ Read the posting ({fetched.text.length.toLocaleString()} chars).
              {fetched.company ? (
                <>
                  {' '}
                  Company <b style={{ color: 'var(--text)' }}>{fetched.company}</b>
                  {fetched.companySource ? ` — ${SOURCE_LABEL[fetched.companySource]}` : ''}.
                </>
              ) : (
                ' The page doesn’t state the company — please type it.'
              )}
              {[fetched.employmentType, fetched.datePosted ? `posted ${fetched.datePosted}` : null].filter(Boolean).length > 0 &&
                ` ${[fetched.employmentType, fetched.datePosted ? `posted ${fetched.datePosted}` : null].filter(Boolean).join(' · ')}.`}
            </div>
          )}
          <div className="row2">
            <label className="field">
              <span className="lab">Company</span>
              <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Northwind" />
            </label>
            <label className="field">
              <span className="lab">Role</span>
              <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
            </label>
          </div>
          <label className="field">
            <span className="lab">Location (optional)</span>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Berlin · Remote" />
          </label>
          <label className="field">
            <span className="lab">Job description {jdUrl.trim() && !jdText.trim() ? '(optional — will be fetched from the URL)' : '*'}</span>
            <textarea value={jdText} onChange={(e) => setJdText(e.target.value)} placeholder="Paste the full job description here, or fetch it from the URL above…" />
          </label>
          {flags.length > 0 && (
            <div className="guard-note">
              <b>⚠ Posting guard cleaned this listing.</b> Job posts are untrusted input — Callback removed:
              <ul>
                {flags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        </div>
        <footer>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={() => submit(false)} disabled={busy || !canSubmit}>
            Just save
          </button>
          <button className="btn primary" onClick={() => submit(true)} disabled={busy || !canSubmit}>
            {busy ? 'Starting…' : 'Capture & tailor →'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── The human-in-the-loop approval card ────────────────────────────────────
export function ApprovalModal({ approval }: { approval: Approval }) {
  const [busy, setBusy] = useState(false);
  const content = typeof approval.input?.content === 'string' ? (approval.input.content as string) : '';

  async function resolve(decision: 'allow' | 'deny') {
    setBusy(true);
    try {
      await api.resolveApproval(approval.id, decision);
      // The modal unmounts when the SSE 'approval_resolved' event clears it.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <header>
          <span className="badge mode-demo" style={{ color: 'var(--warn)' }}>
            <span className="dot" /> Needs your sign-off
          </span>
          <h2 style={{ marginLeft: 4 }}>{approval.title}</h2>
        </header>
        <div className="body">
          <p className="scrim-note" style={{ marginTop: 0 }}>
            An agent drafted this and is waiting for you. Nothing is saved or sent until you approve. Review every line for
            truth before applying — Callback never fabricates experience.
          </p>
          {content ? (
            <div className="panel" style={{ padding: '14px 18px', maxHeight: '48vh', overflow: 'auto' }}>
              <Md source={content} />
            </div>
          ) : (
            <pre className="panel" style={{ padding: 14, overflow: 'auto' }}>
              {JSON.stringify(approval.input, null, 2)}
            </pre>
          )}
        </div>
        <footer>
          <button className="btn danger" onClick={() => resolve('deny')} disabled={busy}>
            Discard
          </button>
          <button className="btn primary" onClick={() => resolve('allow')} disabled={busy}>
            {busy ? 'Saving…' : 'Approve & save'}
          </button>
        </footer>
      </div>
    </div>
  );
}

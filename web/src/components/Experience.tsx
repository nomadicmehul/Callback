import { useRef, useState } from 'react';
import type { Experience, ExperienceInput, ExperienceKind, ImportResult } from '@shared/types';
import { STORY_TIPS, STORY_TYPES } from '@shared/stories';
import { api } from '../lib/api';

const KINDS: { key: ExperienceKind; label: string; group: string }[] = [
  { key: 'story', label: 'Story', group: 'Stories' },
  { key: 'role', label: 'Role', group: 'Roles' },
  { key: 'project', label: 'Project', group: 'Projects' },
  { key: 'education', label: 'Education', group: 'Education' },
  { key: 'certification', label: 'Credential or award', group: 'Credentials & awards' },
  { key: 'link', label: 'Link or writing', group: 'Links & writing' },
];
const SOURCE_LABEL: Record<Experience['source'], string> = {
  manual: 'added by you',
  quick: 'added by you',
  gap: 'from a draft gap',
  cv: 'from your CV',
  linkedin: 'from LinkedIn',
  github: 'from GitHub',
  link: 'from a link',
  agent: 'via Claude Code',
};

type FormState = { id?: string; confirm?: boolean; type: string; data: ExperienceInput };
const blank = (kind: ExperienceKind = 'story'): ExperienceInput => ({ kind, title: '', tags: [] });

// ─── Form ───────────────────────────────────────────────────────────────────

function ExperienceForm({ form, onCancel, onSaved }: { form: FormState; onCancel: () => void; onSaved: () => void }) {
  const [data, setData] = useState<ExperienceInput>(form.data);
  const [type, setType] = useState(form.type);
  const [tags, setTags] = useState((form.data.tags ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const kind = data.kind ?? 'story';
  const guide = STORY_TYPES.find((t) => t.key === type) ?? STORY_TYPES[STORY_TYPES.length - 1];
  const set = (k: keyof ExperienceInput) => (e: { target: { value: string } }) => setData({ ...data, [k]: e.target.value });

  async function save() {
    if (!data.title?.trim()) return setErr('Give it a short title.');
    setBusy(true);
    try {
      const body = { ...data, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), ...(form.confirm || !form.id ? { status: 'active' as const } : {}) };
      if (form.id) await api.updateExperience(form.id, body);
      else await api.addExperience(body);
      onSaved();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel exp-form">
      <div className="exp-form-main">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <b style={{ fontSize: 14 }}>{form.id ? (form.confirm ? 'Check and confirm' : 'Edit') : 'Add to your experience'}</b>
          <select value={kind} onChange={(e) => setData({ ...data, kind: e.target.value as ExperienceKind })} style={{ width: 'auto', marginLeft: 'auto' }}>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        {kind === 'story' && (
          <label className="field">
            <span className="lab">What kind of story?</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {STORY_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="scrim-note">{guide.hint}</span>
          </label>
        )}

        <label className="field">
          <span className="lab">Title</span>
          <input type="text" value={data.title} onChange={set('title')} placeholder={kind === 'story' ? 'e.g. Cut checkout latency by a third' : kind === 'role' ? 'e.g. Senior Engineer' : 'Name'} />
        </label>
        <div className="row2">
          <label className="field">
            <span className="lab">{kind === 'education' ? 'School' : kind === 'certification' ? 'Issuer' : kind === 'link' ? 'Site' : 'Company / organisation'}</span>
            <input type="text" value={data.org ?? ''} onChange={set('org')} />
          </label>
          <label className="field">
            <span className="lab">When</span>
            <input type="text" value={data.period ?? ''} onChange={set('period')} placeholder="e.g. Jan 2023 – Present" />
          </label>
        </div>

        {kind === 'story' ? (
          <>
            <label className="field">
              <span className="lab">The situation</span>
              <textarea rows={2} value={data.situation ?? ''} onChange={set('situation')} placeholder={guide.situation} />
            </label>
            <label className="field">
              <span className="lab">What you did</span>
              <textarea rows={2} value={data.action ?? ''} onChange={set('action')} placeholder={guide.action} />
            </label>
            <label className="field">
              <span className="lab">The result</span>
              <textarea rows={2} value={data.result ?? ''} onChange={set('result')} placeholder={guide.result} />
            </label>
            {data.details && (
              <label className="field">
                <span className="lab">Original line</span>
                <textarea rows={2} value={data.details ?? ''} onChange={set('details')} />
              </label>
            )}
          </>
        ) : (
          <label className="field">
            <span className="lab">Details</span>
            <textarea rows={4} value={data.details ?? ''} onChange={set('details')} placeholder="What it was, your part in it, bullets — your words." />
          </label>
        )}

        <div className="row2">
          <label className="field">
            <span className="lab">Skills & themes (comma-separated)</span>
            <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. postgres, migration, mentoring" />
          </label>
          <label className="field">
            <span className="lab">Link (optional)</span>
            <input type="text" value={data.url ?? ''} onChange={set('url')} placeholder="https://…" />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {err && <span style={{ color: 'var(--danger)', fontSize: 12.5 }}>{err}</span>}
          <div style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary sm" onClick={save} disabled={busy}>
            {form.confirm ? 'Save & confirm' : 'Save'}
          </button>
        </div>
      </div>
      {kind === 'story' && (
        <aside className="exp-tips">
          <b>What makes a strong story</b>
          <ul>
            {STORY_TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}

// ─── One entry ──────────────────────────────────────────────────────────────

function Entry({ e, onEdit, onStatus }: { e: Experience; onEdit: (confirm?: boolean) => void; onStatus: (s: Experience['status']) => void }) {
  const thinStory = e.kind === 'story' && !e.situation && !e.result;
  return (
    <div className={`exp ${e.status}`}>
      <div className="exp-head">
        <span className="exp-title">{e.title}</span>
        {(e.org || e.period) && <span className="scrim-note">{[e.org, e.period].filter(Boolean).join(' · ')}</span>}
      </div>
      {e.kind === 'story' ? (
        <div className="exp-body">
          {e.situation && (
            <div>
              <span className="exp-k">Situation</span> {e.situation}
            </div>
          )}
          {e.action && (
            <div>
              <span className="exp-k">Did</span> {e.action}
            </div>
          )}
          {e.result && (
            <div>
              <span className="exp-k">Result</span> {e.result}
            </div>
          )}
          {!e.action && !e.result && e.details && <div>{e.details}</div>}
        </div>
      ) : (
        e.details && <div className="exp-body exp-details">{e.details}</div>
      )}
      <div className="exp-foot">
        {e.tags.slice(0, 6).map((t) => (
          <span key={t} className="chip">
            {t}
          </span>
        ))}
        {e.url && (
          <a href={e.url} target="_blank" rel="noreferrer" className="scrim-note">
            link ↗
          </a>
        )}
        <span className="scrim-note">{SOURCE_LABEL[e.source]}</span>
        {thinStory && e.status !== 'archived' && <span className="exp-nudge">Add the situation and result to make this a full story</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {e.status === 'proposed' && (
            <>
              <button className="btn primary sm" onClick={() => onStatus('active')}>
                Confirm
              </button>
              <button className="btn sm" onClick={() => onEdit(true)}>
                Edit
              </button>
              <button className="btn ghost sm" onClick={() => onStatus('archived')}>
                Discard
              </button>
            </>
          )}
          {e.status === 'active' && (
            <>
              <button className="btn sm" onClick={() => onEdit()}>
                Edit
              </button>
              <button className="btn ghost sm" onClick={() => onStatus('archived')}>
                Archive
              </button>
            </>
          )}
          {e.status === 'archived' && (
            <button className="btn ghost sm" onClick={() => onStatus('active')}>
              Restore
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── The view ───────────────────────────────────────────────────────────────

export function ExperienceView({ experiences, hasProfile, onChanged }: { experiences: Experience[]; hasProfile: boolean; onChanged: () => void }) {
  const [form, setForm] = useState<FormState | null>(null);
  const [quick, setQuick] = useState('');
  const [github, setGithub] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const zipRef = useRef<HTMLInputElement>(null);

  const waiting = experiences.filter((e) => e.status === 'proposed');
  const active = experiences.filter((e) => e.status === 'active');
  const archived = experiences.filter((e) => e.status === 'archived');

  async function run(key: string, fn: () => Promise<ImportResult>) {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      setMsg({
        kind: 'ok',
        text: `${r.added.length ? `Added ${r.added.length} for your review` : 'Nothing new'}${r.skipped ? ` · ${r.skipped} already here` : ''}.${r.note ? ` ${r.note}` : ''}`,
      });
      onChanged();
    } catch (e: any) {
      setMsg({ kind: 'err', text: String(e?.message ?? e) });
    } finally {
      setBusy(null);
    }
  }
  async function structure() {
    setBusy('quick');
    setMsg(null);
    try {
      const { draft, type } = await api.quickStory(quick);
      setForm({ type, data: draft });
      setQuick('');
    } catch (e: any) {
      setMsg({ kind: 'err', text: String(e?.message ?? e) });
    } finally {
      setBusy(null);
    }
  }
  async function setStatus(e: Experience, status: Experience['status']) {
    await api.updateExperience(e.id, { status });
    onChanged();
  }
  async function confirmAll() {
    for (const e of waiting) await api.updateExperience(e.id, { status: 'active' });
    onChanged();
  }
  const edit = (e: Experience, confirm?: boolean) => setForm({ id: e.id, confirm, type: 'other', data: { ...e } });
  const entries = (list: Experience[]) =>
    list.map((e) => <Entry key={e.id} e={e} onEdit={(c) => edit(e, c)} onStatus={(s) => setStatus(e, s)} />);

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        Your real experience, stored once. Every resume and cover letter is built from what’s <b>confirmed</b> here, so titles,
        dates and numbers stay the same across every version. Anything imported waits for your OK — Callback never adds a
        detail you didn’t give it.
      </p>

      {/* Bring in what you already have */}
      <div className="exp-imports">
        <div className="panel exp-import">
          <b>Your CV</b>
          <p>Roles, projects, education — and every bullet with a number becomes a story to build on.</p>
          <button className="btn sm accent" onClick={() => run('cv', api.importCv)} disabled={!!busy || !hasProfile} title={hasProfile ? '' : 'Upload your CV in Settings first'}>
            {busy === 'cv' ? 'Reading…' : 'Import from CV'}
          </button>
        </div>
        <div className="panel exp-import">
          <b>LinkedIn export</b>
          <p>
            LinkedIn → Settings → Data privacy → <i>Get a copy of your data</i>. Upload the .zip they email you.
          </p>
          <input
            ref={zipRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) run('linkedin', () => api.importLinkedIn(f));
              e.target.value = '';
            }}
          />
          <button className="btn sm" onClick={() => zipRef.current?.click()} disabled={!!busy}>
            {busy === 'linkedin' ? 'Reading…' : 'Upload .zip'}
          </button>
        </div>
        <div className="panel exp-import">
          <b>GitHub</b>
          <p>Your public profile and most-starred repositories.</p>
          <div className="exp-inline">
            <input type="text" value={github} onChange={(e) => setGithub(e.target.value)} placeholder="username" />
            <button className="btn sm" onClick={() => run('github', () => api.importGitHub(github))} disabled={!!busy || !github.trim()}>
              {busy === 'github' ? '…' : 'Import'}
            </button>
          </div>
        </div>
        <div className="panel exp-import">
          <b>A public link</b>
          <p>A blog post, talk, project page or portfolio — something you made.</p>
          <div className="exp-inline">
            <input type="text" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
            <button className="btn sm" onClick={() => run('link', () => api.importLink(link)).then(() => setLink(''))} disabled={!!busy || !link.trim()}>
              {busy === 'link' ? '…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
      {msg && <div style={{ fontSize: 12.5, margin: '8px 0 0', color: msg.kind === 'ok' ? 'var(--brand)' : 'var(--danger)' }}>{msg.text}</div>}

      {/* Tell it in your own words */}
      <div className="panel exp-quick">
        <b>Tell Callback something you did</b>
        <textarea
          rows={3}
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="e.g. Our checkout kept timing out at peak. I traced it to an N+1 query and added caching. p95 went from 2.4s to 300ms."
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="scrim-note">Callback sorts it into situation → what you did → result. You check every word before it’s saved.</span>
          <div style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={() => setForm({ type: 'improved', data: blank() })} disabled={!!form}>
            Step by step
          </button>
          <button className="btn primary sm" onClick={structure} disabled={!!busy || quick.trim().length < 10}>
            {busy === 'quick' ? '…' : 'Structure it →'}
          </button>
        </div>
      </div>

      {form && (
        <ExperienceForm
          key={form.id ?? 'new'}
          form={form}
          onCancel={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            onChanged();
          }}
        />
      )}

      {waiting.length > 0 && (
        <>
          <h3 className="exp-h">
            Waiting for your review ({waiting.length})
            <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={confirmAll}>
              Confirm all
            </button>
          </h3>
          {entries(waiting)}
        </>
      )}

      {KINDS.map((k) => {
        const list = active.filter((e) => e.kind === k.key);
        return list.length ? (
          <section key={k.key}>
            <h3 className="exp-h">
              {k.group} <span className="scrim-note">· {list.length}</span>
            </h3>
            {entries(list)}
          </section>
        ) : null;
      })}
      {active.length === 0 && waiting.length === 0 && !form && (
        <div className="col-empty" style={{ marginTop: 18 }}>
          Nothing here yet. Import your CV or LinkedIn export above, or tell Callback about something you did.
        </div>
      )}

      {archived.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <button className="btn ghost sm" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '▾' : '▸'} Archived ({archived.length})
          </button>
          {showArchived && <div style={{ marginTop: 8 }}>{entries(archived)}</div>}
        </div>
      )}
    </div>
  );
}

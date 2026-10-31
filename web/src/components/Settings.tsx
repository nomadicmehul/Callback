import { useEffect, useRef, useState } from 'react';
import type { HealthInfo, ProfileSource } from '@shared/types';
import { ClaudeCodeCard } from './ClaudeCodeCard';
import { DocFormatPanel } from './DocFormat';
import { BackupPanel } from './Backup';
import { api } from '../lib/api';

export function SettingsView({ health, onSaved }: { health: HealthInfo | null; onSaved: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [profile, setProfile] = useState('');
  const [source, setSource] = useState<ProfileSource | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getConfig().then((c) => {
      setHasKey(c.hasApiKey);
      setProfile(c.candidateProfile);
      setSource(c.profileSource);
    });
  }, []);

  function flash(kind: 'ok' | 'err', text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), kind === 'ok' ? 2500 : 6000);
  }

  async function save() {
    await api.saveConfig({ apiKey: apiKey || undefined, candidateProfile: profile });
    setApiKey('');
    const c = await api.getConfig();
    setHasKey(c.hasApiKey);
    setSource(c.profileSource);
    flash('ok', 'Saved ✓');
    onSaved();
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const res = await api.uploadProfile(file);
      setProfile(res.text);
      setSource(res.source);
      flash('ok', `Imported ${res.source.filename} — ${res.source.chars.toLocaleString()} characters. Review it below, then save.`);
      onSaved();
    } catch (err: any) {
      flash('err', String(err?.message ?? err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Profile first — it's the ground truth for every draft */}
      <div className="panel" style={{ padding: 18, marginBottom: 18, borderColor: profile.trim() ? undefined : 'color-mix(in srgb, var(--warn) 45%, var(--border))' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>Your profile {profile.trim() ? '' : '— start here'}</h3>
        <p style={{ color: 'var(--text-dim)', marginTop: 0, fontSize: 13 }}>
          Agents read this <b>first</b>, before anything else. Every draft is grounded only in what’s here — Callback will never
          invent experience you haven’t given it. Upload your resume, or paste your real experience.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          <button className="btn accent" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Reading…' : '⬆ Upload resume (PDF / DOCX / TXT)'}
          </button>
          {source && (
            <span className="scrim-note">
              Source: <span className="kbd">{source.filename}</span> · {source.chars.toLocaleString()} chars ·{' '}
              {new Date(source.updatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="lab">Profile text (editable — what the agents see)</span>
          <textarea
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="e.g. 7 years backend engineering. Led the payments platform at … (or upload your resume above)"
            style={{ minHeight: 220 }}
          />
        </label>
      </div>

      <DocFormatPanel />

      <div className="panel" style={{ padding: 18, marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>Claude API key</h3>
        <p style={{ color: 'var(--text-dim)', marginTop: 0, fontSize: 13 }}>
          {hasKey ? (
            <>
              A key is configured — Callback runs <b style={{ color: 'var(--brand)' }}>live</b>. Agents use Claude for real
              analysis and drafting.
            </>
          ) : (
            <>
              No key — Callback runs in <b style={{ color: 'var(--warn)' }}>demo</b> mode (a scripted pipeline, no network). Add
              a key from{' '}
              <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">
                console.anthropic.com
              </a>{' '}
              for live agents.
            </>
          )}
        </p>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="lab">API key (stored locally, 0600, only ever sent to Anthropic)</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? '•••••••• (set — type to replace)' : 'sk-ant-…'}
          />
        </label>
        {!hasKey && <ClaudeCodeCard pluginDir={health?.pluginDir ?? null} />}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn primary" onClick={save}>
          Save settings
        </button>
        {msg && <span style={{ color: msg.kind === 'ok' ? 'var(--brand)' : 'var(--danger)', fontSize: 13 }}>{msg.text}</span>}
      </div>

      <div style={{ marginTop: 24 }}>
        <BackupPanel dataDir={health?.dataDir ?? null} onChanged={onSaved} />
      </div>

      <div className="panel" style={{ padding: 16, fontSize: 12.5, color: 'var(--text-dim)' }}>
        <b style={{ color: 'var(--text)' }}>Local-first & private.</b> Everything lives on your machine
        {health?.dataDir ? (
          <>
            {' '}
            at <span className="kbd">{health.dataDir}</span>
          </>
        ) : null}
        . No cloud, no account, no telemetry. The only network calls are the agent requests you trigger (to Anthropic) and job
        URLs you ask Callback to fetch.
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_DOC_FORMAT, type DocFormat } from '@shared/types';
import { api } from '../lib/api';

const ACCENTS: [string, string][] = [
  ['Navy', '#1F3A5F'],
  ['Charcoal', '#222222'],
  ['Teal', '#0F5E5E'],
  ['Burgundy', '#6B1D2A'],
  ['Forest', '#1F5A3A'],
];

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="fmt-choice">
      <span className="lab">{label}</span>
      <div className="fmt-seg">
        {options.map(([v, text]) => (
          <button key={v} className={`btn sm ${value === v ? 'accent' : 'ghost'}`} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A miniature of the exported resume header, so a choice is visible before you export (sizes at ~85%). */
function Preview({ f }: { f: DocFormat }) {
  const z = (pt: number) => `${(pt * 0.85).toFixed(1)}px`;
  const contact = (
    <div key="c" className="fmt-contact" style={{ fontSize: z(f.sizes.contact) }}>
      City, Country | phone | email | linkedin.com/in/you
    </div>
  );
  const headline = (
    <div key="h" className="fmt-headline" style={{ fontSize: z(f.sizes.headline) }}>
      Target Role | Strength, Strength &amp; Strength
    </div>
  );
  const headlineFirst = f.headerOrder === 'headline-first';
  const family = f.font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'Helvetica, Arial, sans-serif';
  return (
    <div className="fmt-paper" style={{ fontFamily: f.fontName ? `"${f.fontName}", ${family}` : family, textAlign: f.align, fontSize: z(f.sizes.body) }}>
      <div className="fmt-name" style={{ color: f.nameColor ?? f.accent, fontSize: z(f.sizes.name) }}>
        Your Name
      </div>
      {headlineFirst ? [headline, contact] : [contact, headline]}
      <div className="fmt-section" style={{ color: f.accent, borderColor: f.headingRule ? f.accent : 'transparent', fontSize: z(f.sizes.heading) }}>
        {f.headingCase === 'upper' ? 'PROFESSIONAL EXPERIENCE' : 'Professional Experience'}
      </div>
      <div className="fmt-entry">
        <span>
          <b>Senior Engineer</b> | Company
        </span>
        <i>Jan 2023 – Present | City</i>
      </div>
      <div className="fmt-bullet">• What you did, with the number that proves it.</div>
      <div className="fmt-page">{f.pageSize === 'A4' ? 'A4 · 210 × 297 mm' : 'US Letter · 8.5 × 11 in'}</div>
    </div>
  );
}

/** How exported resumes and letters look — applies to every export, including drafts you already have. */
export function DocFormatPanel() {
  const [f, setF] = useState<DocFormat>(DEFAULT_DOC_FORMAT);
  const [saved, setSaved] = useState<DocFormat>(DEFAULT_DOC_FORMAT);
  const [msg, setMsg] = useState<string | null>(null);
  const [found, setFound] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [learning, setLearning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api.getConfig().then((c) => {
      setF(c.docFormat);
      setSaved(c.docFormat);
    });
  }, []);
  const set = (patch: Partial<DocFormat>) => setF({ ...f, ...patch });
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);

  async function learn(file: File) {
    setLearning(true);
    setErr(null);
    try {
      const r = await api.learnFormat(file);
      setF(r.format);
      setFound(r.found);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLearning(false);
    }
  }

  async function save() {
    const r = await api.saveConfig({ docFormat: f });
    setF(r.docFormat);
    setSaved(r.docFormat);
    setFound(null);
    setMsg('Saved ✓ — every export uses it, including drafts you already have.');
    setTimeout(() => setMsg(null), 3500);
  }

  return (
    <div className="panel" style={{ padding: 18, marginBottom: 18 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>Document format</h3>
      <p style={{ color: 'var(--text-dim)', marginTop: 0, fontSize: 13 }}>
        How your exported resumes and cover letters look. By default: your name, your contact line, then your headline in bold.
      </p>
      <div className="fmt-learn">
        <input
          ref={fileRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) learn(file);
            e.target.value = '';
          }}
        />
        <button className="btn sm accent" onClick={() => fileRef.current?.click()} disabled={learning}>
          {learning ? 'Reading…' : '⬆ Use my CV’s format (.docx)'}
        </button>
        <span className="scrim-note">
          {f.learnedFrom ? (
            <>
              Format from <span className="kbd">{f.learnedFrom}</span>
              {f.fontName ? ` · ${f.fontName}` : ''}
            </>
          ) : (
            'Upload your own Word CV and Callback copies its font, sizes, colours and layout.'
          )}
        </span>
      </div>
      {err && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
      {found && (
        <div className="fmt-found">
          <b>Found in your CV</b> — check the preview, then save:
          <ul>
            {found.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="fmt">
        <div className="fmt-controls">
          <Choice label="Page size" value={f.pageSize} options={[['A4', 'A4'], ['LETTER', 'US Letter']]} onChange={(v) => set({ pageSize: v })} />
          <Choice
            label="Under your name"
            value={f.headerOrder}
            options={[
              ['contact-first', 'Contact, then headline'],
              ['headline-first', 'Headline, then contact'],
              ['auto', 'As in my CV'],
            ]}
            onChange={(v) => set({ headerOrder: v })}
          />
          <Choice label="Name & header" value={f.align} options={[['center', 'Centered'], ['left', 'Left']]} onChange={(v) => set({ align: v })} />
          <Choice label="Font" value={f.font} options={[['sans', 'Sans-serif'], ['serif', 'Serif']]} onChange={(v) => set({ font: v })} />
          <Choice
            label="Section headings"
            value={f.headingCase}
            options={[
              ['upper', 'UPPERCASE'],
              ['as-written', 'As written'],
            ]}
            onChange={(v) => set({ headingCase: v })}
          />
          <div className="fmt-choice">
            <span className="lab">Accent colour</span>
            <div className="fmt-seg">
              {ACCENTS.map(([name, hex]) => (
                <button
                  key={hex}
                  className={`fmt-swatch${f.accent.toUpperCase() === hex ? ' on' : ''}`}
                  style={{ background: hex }}
                  title={name}
                  aria-label={name}
                  onClick={() => set({ accent: hex })}
                />
              ))}
              <input type="color" value={f.accent} onChange={(e) => set({ accent: e.target.value.toUpperCase() })} title="Custom colour" className="fmt-color" />
            </div>
          </div>
        </div>
        <Preview f={f} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <button className="btn primary sm" onClick={save} disabled={!dirty}>
          Save format
        </button>
        <button
          className="btn ghost sm"
          onClick={() => {
            setF(DEFAULT_DOC_FORMAT);
            setFound(null);
          }}
        >
          Reset to default
        </button>
        {msg && <span style={{ color: 'var(--brand)', fontSize: 12.5 }}>{msg}</span>}
      </div>
    </div>
  );
}

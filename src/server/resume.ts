// ─── Resume export + ATS verification ───────────────────────────────────────
// Markdown draft → clean single-column PDF/DOCX with a real text layer (what
// parsers need), then read the PDF *back* and verify it the way an ATS would.
// Pure JS throughout — no LaTeX, no native modules.

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import type { Application, Artifact, ArtifactKind, AtsReport } from '@shared/types';
import { findGaps } from '@shared/placeholders';
import { FILES_DIR } from './paths';

export interface Run {
  text: string;
  bold: boolean;
}
export interface Block {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'bullet';
  runs: Run[];
  text: string;
}

const STOP = new Set(
  (
    'the a an and or of to in for with on at by from as is are be we you your our their this that will who what which role team work years experience including etc ' +
    'required strong must have has hiring hire need needs requirements skills skill ability able plus nice preferred looking join about across within using also well'
  ).split(/\s+/),
);

/** Gaps the human still has to fill — placeholders quoted in editorial notes don't count. */
export const findPlaceholders = (md: string): string[] => findGaps(md).map((g) => g.token);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// ─── Markdown → blocks ──────────────────────────────────────────────────────

function parseRuns(line: string): Run[] {
  const clean = line.replace(/`([^`]+)`/g, '$1');
  const runs: Run[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    if (m.index > last) runs.push({ text: clean.slice(last, m.index), bold: false });
    runs.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < clean.length) runs.push({ text: clean.slice(last), bold: false });
  return runs.length ? runs : [{ text: clean, bold: false }];
}

/** Parse a markdown draft, dropping editorial notes (blockquotes, rules, italic guidance). */
export function parseResumeMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith('>')) continue;
    if (/^-{3,}$/.test(t)) continue;
    if (/^_.*_$/.test(t)) continue;
    let type: Block['type'] = 'p';
    let text = t;
    if (/^###\s+/.test(t)) {
      type = 'h3';
      text = t.replace(/^###\s+/, '');
    } else if (/^##\s+/.test(t)) {
      type = 'h2';
      text = t.replace(/^##\s+/, '');
    } else if (/^#\s+/.test(t)) {
      type = 'h1';
      text = t.replace(/^#\s+/, '');
    } else if (/^[-*•]\s+/.test(t)) {
      type = 'bullet';
      text = t.replace(/^[-*•]\s+/, '');
    }
    const runs = parseRuns(text);
    blocks.push({ type, runs, text: runs.map((r) => r.text).join('') });
  }
  return blocks;
}

export const plainText = (blocks: Block[]): string => blocks.map((b) => b.text).join('\n');

// ─── PDF (pdfkit, standard Helvetica → embedded, selectable text) ───────────

// The standard Helvetica only encodes Windows-1252 ("WinAnsi"): anything outside
// it prints as garbage ("→" comes out as "!'"). Use a faithful stand-in where one
// exists, strip accents that have a plain base letter, and report the rest.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const STAND_IN: Record<string, string> = {
  '→': '->', '←': '<-', '⇒': '=>', '↔': '<->', '≥': '>=', '≤': '<=', '≈': '~', '≠': '!=',
  '−': '-', '‐': '-', '‑': '-', '‒': '-', '―': '—', '′': "'", '″': '"', '✓': '', '✔': '', '✗': '', '★': '*',
  'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'ı': 'i', 'Ŀ': 'L', 'ŀ': 'l', 'ẞ': 'SS',
};
const winAnsi = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return ch === '\t' || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch);
};

/** Text the PDF font can draw, plus the characters it had to leave out. */
export function pdfSafe(s: string): { text: string; lost: string[] } {
  const lost = new Set<string>();
  let text = '';
  for (const ch of s) {
    if (winAnsi(ch)) text += ch;
    else if (ch in STAND_IN) text += STAND_IN[ch];
    else {
      const bare = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (bare && [...bare].every(winAnsi)) text += bare;
      else if (!/[​-‍⁠︎️]/.test(ch)) lost.add(ch); // joiners/selectors vanish quietly
    }
  }
  return { text, lost: [...lost] };
}

export function renderPdf(blocks: Block[], opts: { title: string; author?: string; pageSize?: 'A4' | 'LETTER' }): Promise<Buffer> {
  const safe = (t: string) => pdfSafe(t).text;
  blocks = blocks.map((b) => ({ ...b, text: safe(b.text), runs: b.runs.map((r) => ({ ...r, text: safe(r.text) })) }));
  return new Promise((resolve, reject) => {
    const doc: any = new PDFDocument({
      size: opts.pageSize ?? 'A4',
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
      info: { Title: opts.title, Author: opts.author ?? '', Creator: 'Callback' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const BODY = 10.5;

    const writeRuns = (runs: Run[], size: number, x?: number, y?: number, w?: number) => {
      runs.forEach((r, i) => {
        doc.font(r.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
        const o = { continued: i < runs.length - 1, width: w ?? width, lineGap: 2 };
        if (i === 0 && x != null && y != null) doc.text(r.text, x, y, o);
        else doc.text(r.text, o);
      });
    };

    doc.fillColor('#111111');
    for (const b of blocks) {
      switch (b.type) {
        case 'h1':
          doc.moveDown(0.2);
          doc.font('Helvetica-Bold').fontSize(20).text(b.text, left, doc.y, { width });
          doc.moveDown(0.3);
          break;
        case 'h2': {
          doc.moveDown(0.7);
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#222222').text(b.text.toUpperCase(), left, doc.y, { width, characterSpacing: 0.5 });
          const y = doc.y + 1;
          doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.6).strokeColor('#8a8a8a').stroke();
          doc.fillColor('#111111');
          doc.moveDown(0.45);
          break;
        }
        case 'h3':
          doc.moveDown(0.35);
          writeRuns([{ text: b.text, bold: true }], 11, left, doc.y);
          doc.moveDown(0.1);
          break;
        case 'bullet': {
          const y = doc.y;
          doc.font('Helvetica').fontSize(BODY).text('•', left + 2, y, { lineBreak: false });
          writeRuns(b.runs, BODY, left + 14, y, width - 14);
          doc.x = left;
          doc.moveDown(0.15);
          break;
        }
        default:
          writeRuns(b.runs, BODY, left, doc.y);
          doc.x = left;
          doc.moveDown(0.15);
      }
    }
    doc.end();
  });
}

// ─── DOCX (docx package) ────────────────────────────────────────────────────

export async function renderDocx(blocks: Block[], opts: { title: string }): Promise<Buffer> {
  const children = blocks.map((b) => {
    const runs = b.runs.map((r) => new TextRun({ text: r.text, bold: r.bold }));
    switch (b.type) {
      case 'h1':
        return new Paragraph({ heading: HeadingLevel.TITLE, children: runs });
      case 'h2':
        return new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs, spacing: { before: 240, after: 80 } });
      case 'h3':
        return new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs, spacing: { before: 160, after: 40 } });
      case 'bullet':
        return new Paragraph({ children: runs, bullet: { level: 0 } });
      default:
        return new Paragraph({ children: runs, spacing: { after: 60 } });
    }
  });
  const doc = new Document({ title: opts.title, creator: 'Callback', sections: [{ properties: {}, children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

// ─── Export to disk ─────────────────────────────────────────────────────────

export async function exportArtifact(
  art: Artifact,
  app: Application | null,
  format: 'pdf' | 'docx',
): Promise<{ buffer: Buffer; filename: string; filePath: string }> {
  const blocks = parseResumeMarkdown(art.content);
  const base = slug([app?.role, app?.company, art.kind.replace('_', '-')].filter(Boolean).join('-')) || art.kind;
  const filename = `${base}.${format}`;
  const buffer = format === 'pdf' ? await renderPdf(blocks, { title: art.title }) : await renderDocx(blocks, { title: art.title });
  const dir = path.join(FILES_DIR, 'exports', app?.id ?? 'misc');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return { buffer, filename, filePath };
}

// ─── ATS verification: read the PDF back the way a parser would ─────────────

const sig = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length > 4 && !STOP.has(w));

export async function analyzeAts(input: {
  pdf: Buffer;
  source: string;
  application: Application | null;
  profile: string;
  /** Resumes are checked for standard sections; cover letters for one-page length instead. */
  kind?: ArtifactKind;
}): Promise<AtsReport> {
  const isLetter = input.kind === 'cover_letter';
  let text = '';
  let pages = 0;
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(input.pdf));
    const r = await extractText(pdf, { mergePages: true });
    text = String(r.text ?? '');
    pages = Number(r.totalPages ?? 0);
  } catch {
    text = '';
  }

  const blocks = parseResumeMarkdown(input.source);
  const plain = plainText(blocks);
  const tl = text.toLowerCase().replace(/\s+/g, ' ');
  const parseable = text.length > 0 && text.length >= Math.min(200, Math.floor(plain.length * 0.6));
  const cid = /\(cid:\d+\)/.test(text);
  const placeholders = findPlaceholders(input.source);

  const email = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0] ?? null;
  const phone = text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? null;

  const sectionNames = ['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'publications'];
  const sections = blocks
    .filter((b) => b.type === 'h2')
    .map((b) => b.text)
    .filter((h) => sectionNames.some((s) => h.toLowerCase().includes(s)));

  const an = input.application?.analysis ?? null;
  const kws = [
    ...new Set(
      (an?.keywords ?? [])
        .map((k) => k.trim().replace(/^[.,;:]+|[.,;:]+$/g, '').toLowerCase())
        .filter((k) => k.length > 2 && !STOP.has(k) && !/^\d+$/.test(k)),
    ),
  ];
  const found = kws.filter((k) => tl.includes(k.toLowerCase()));
  const missing = kws.filter((k) => !found.includes(k));
  const coverage = kws.length ? found.length / kws.length : null;

  const addressed: string[] = [];
  const unaddressed: string[] = [];
  for (const m of (an?.mustHaves ?? []).filter((x) => !x.startsWith('('))) {
    (sig(m).some((w) => tl.includes(w)) ? addressed : unaddressed).push(m);
  }

  // Honesty check: numbers in the resume that the profile never mentions.
  const prof = input.profile.toLowerCase();
  const unverifiedClaims: string[] = [];
  if (prof.trim()) {
    for (const b of blocks) {
      if (b.type === 'h1' || b.type === 'h2') continue;
      if (/@|\+?\d{2,3}[\s-]\d{3}/.test(b.text)) continue; // contact lines
      const nums = (b.text.match(/\d+(?:[.,]\d+)?%?/g) ?? []).filter((n) => !/^(19|20)\d{2}$/.test(n));
      const bad = nums.filter((n) => !prof.includes(n.toLowerCase()));
      if (bad.length) unverifiedClaims.push(`"${b.text.slice(0, 110)}" — ${[...new Set(bad)].join(', ')} not found in your profile`);
    }
  }

  const issues: AtsReport['issues'] = [];
  let score = 100;
  if (!parseable) {
    score -= 40;
    issues.push({ level: 'block', text: 'The PDF text layer could not be read reliably — an ATS would see little or nothing.' });
  }
  if (cid) {
    score -= 30;
    issues.push({ level: 'block', text: 'Garbled glyphs ("(cid:…)") in the text layer — parsers will read gibberish.' });
  }
  if (placeholders.length) {
    score -= 30;
    issues.push({
      level: 'block',
      text: `${placeholders.length} unfilled placeholder(s) — fill each with a real detail (or drop it) before exporting: ${placeholders.slice(0, 3).join(', ')}${placeholders.length > 3 ? '…' : ''}`,
    });
  }
  const lost = [...new Set(blocks.flatMap((b) => pdfSafe(b.text).lost))];
  if (lost.length) {
    score -= 5;
    issues.push({
      level: 'warn',
      text: `The PDF font can't draw ${lost.slice(0, 6).map((c) => `"${c}"`).join(' ')} — they're left out of the PDF. Rephrase them, or send the DOCX (Word keeps every character).`,
    });
  }
  if (isLetter ? pages > 1 : pages > 2) {
    score -= 15;
    issues.push({ level: 'warn', text: isLetter ? `${pages} pages — a cover letter should fit on one.` : `${pages} pages — aim for 1–2.` });
  }
  if (!email) {
    score -= 10;
    issues.push({ level: 'warn', text: 'No email address found in the text layer — put contact details in plain text, not icons or headers.' });
  }
  if (!phone && !isLetter) {
    score -= 5;
    issues.push({ level: 'info', text: 'No phone number found (fine if intentional).' });
  }
  if (!isLetter && !sections.some((s) => /experience/i.test(s))) {
    score -= 10;
    issues.push({ level: 'warn', text: 'No "Experience" section heading — parsers key on standard headings (Summary, Experience, Education, Skills).' });
  }
  if (isLetter) {
    const words = plain.split(/\s+/).filter(Boolean).length;
    if (words > 450) {
      score -= 10;
      issues.push({ level: 'warn', text: `${words} words — cover letters land best at 250–350.` });
    }
    if (/\b(excited to apply|proven track record|passionate about leveraging|esteemed organi[sz]ation|dynamic team player)\b/i.test(plain)) {
      score -= 10;
      issues.push({ level: 'warn', text: 'Contains AI/boilerplate tells ("excited to apply", "proven track record"…) — rewrite in your own words.' });
    }
    if (input.application && !new RegExp(input.application.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(plain)) {
      score -= 10;
      issues.push({ level: 'warn', text: `Doesn't mention ${input.application.company} by name — make it unmistakably specific to this job.` });
    }
  }
  if (coverage != null) {
    score -= Math.round((1 - coverage) * 20);
    if (missing.length) {
      issues.push({
        level: 'info',
        text: `Posting keywords not present: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''} — add only the ones that are genuinely true for you.`,
      });
    }
  }
  if (unaddressed.length) {
    issues.push({ level: 'warn', text: `Must-haves not evidenced: ${unaddressed.slice(0, 3).map((s) => s.replace(/\.$/, '')).join('; ')}` });
  }
  if (unverifiedClaims.length) {
    score -= Math.min(10, unverifiedClaims.length * 3);
    issues.push({ level: 'warn', text: `${unverifiedClaims.length} number(s) in the resume don't appear in your profile — verify they're true before sending.` });
  }
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    parseable,
    pages,
    extractedChars: text.length,
    placeholders,
    contact: { email, phone },
    sections,
    keywords: { found, missing, coverage },
    mustHaves: { addressed, unaddressed },
    unverifiedClaims,
    issues,
  };
}

/** Compact text rendering of a report, for agents (live mode + plugin). */
export function summarizeAts(r: AtsReport): string {
  const lines = [
    `ATS score ${r.score}/100 · ${r.pages} page(s) · parseable: ${r.parseable ? 'yes' : 'NO'} · email: ${r.contact.email ?? 'missing'} · phone: ${r.contact.phone ?? 'missing'}`,
    r.keywords.coverage != null ? `Keyword coverage ${Math.round(r.keywords.coverage * 100)}% — missing: ${r.keywords.missing.join(', ') || 'none'}` : 'No posting keywords to compare against.',
    r.mustHaves.unaddressed.length ? `Must-haves not evidenced: ${r.mustHaves.unaddressed.join(' | ')}` : 'All extracted must-haves are evidenced.',
    r.placeholders.length ? `BLOCKING: ${r.placeholders.length} placeholder(s) remain: ${r.placeholders.join(', ')}` : '',
    r.unverifiedClaims.length ? `Verify these numbers (not in profile):\n- ${r.unverifiedClaims.join('\n- ')}` : '',
    ...r.issues.map((i) => `[${i.level}] ${i.text}`),
    'Rule: fix only what is genuinely true for the candidate. Never keyword-stuff or invent.',
  ];
  return lines.filter(Boolean).join('\n');
}

// ─── Resume export + ATS verification ───────────────────────────────────────
// Markdown draft → clean single-column PDF/DOCX with a real text layer (what
// parsers need), then read the PDF *back* and verify it the way an ATS would.
// Pure JS throughout — no LaTeX, no native modules.

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Tab, TabStopType, TextRun } from 'docx';
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
  /** A blank line came before it — letters keep their paragraph breaks. */
  spaced: boolean;
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
  let blank = false;
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const t = raw.trim();
    if (!t) {
      blank = true;
      continue;
    }
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
    blocks.push({ type, runs, text: runs.map((r) => r.text).join(''), spaced: blank });
    blank = false;
  }
  return blocks;
}

export const plainText = (blocks: Block[]): string => blocks.map((b) => b.text).join('\n');

// ─── Layout: what each block is on the page ─────────────────────────────────
// The house format (see skills/resume-tailor): `# Name`, contact line and an
// optional **bold headline** right below it; `## Section`; one
// `### Title | Company | Dates | Location` per role, an optional plain scope
// line under it, then bullets; skills as `**Category:** items`. Letters: the
// same header, then a date line, recipient, **subject** and paragraphs.

type Role = 'name' | 'contact' | 'headline' | 'section' | 'entry' | 'scope' | 'bullet' | 'date' | 'subject' | 'text';
type Placed = Block & { role: Role };

const DATE_LINE = /^([A-ZÀ-ÿ][\w .'-]*,\s*)?(\d{1,2}\.?\s+[A-Za-zäé]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2})$/;
const DATES = /\b(19|20)\d{2}\b|\b(present|current|today|heute)\b/i;
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
/** "Jan 2026 – Present", "2012 – 2019", "Aug 2022 - Nov 2024". */
export const DATE_RANGE = new RegExp(
  `(?:${MONTH}\\s+)?(?:19|20)\\d{2}\\s*[–—-]\\s*(?:(?:${MONTH}\\s+)?(?:19|20)\\d{2}|present|current|today|now|heute)\\b`,
  'i',
);
const allBold = (b: Block) => b.runs.every((r) => r.bold || !r.text.trim());

function layout(blocks: Block[], kind?: ArtifactKind): Placed[] {
  const letter = kind === 'cover_letter';
  const house = letter || kind === 'resume' || kind == null;
  let header = false;
  let dated = false;
  return blocks.map((b, i) => {
    let role: Role = 'text';
    if (b.type === 'h1') {
      role = 'name';
      header = house;
    } else if (header && b.type === 'p' && !b.spaced) {
      role = allBold(b) ? 'headline' : 'contact';
    } else {
      header = false;
      if (b.type === 'h2') role = 'section';
      else if (b.type === 'h3') role = 'entry';
      else if (b.type === 'bullet') role = 'bullet';
      else if (blocks[i - 1]?.type === 'h3') role = 'scope';
      else if (letter && !dated && DATE_LINE.test(b.text)) role = 'date';
      else if (letter && allBold(b)) role = 'subject';
    }
    if (role === 'date') dated = true;
    return { ...b, role };
  });
}

/** "Title | Company | Jan 2026 – Present | City" → title, the rest, and the right-aligned dates/location. */
export function splitEntry(text: string): { title: string; rest: string; when: string } {
  // PDF exports glue the dates onto the company ("Acme GmbH Jan 2026 – Present") — pull them apart.
  const parts = text.split(/\s+\|\s+/).flatMap((p) => {
    const m = DATE_RANGE.exec(p);
    return m && m.index > 0 ? [p.slice(0, m.index).trim(), p.slice(m.index).trim()] : [p];
  });
  const at = parts.findIndex((p, i) => i > 0 && DATES.test(p));
  const head = at > 0 ? parts.slice(0, at) : parts;
  return { title: head[0], rest: head.slice(1).join(' | '), when: at > 0 ? parts.slice(at).join(' | ') : '' };
}

/** A role line in canonical form: "Title | Company | Dates | Location". */
export function normalizeEntry(text: string): string {
  const { title, rest, when } = splitEntry(text);
  return [title, rest, when].filter(Boolean).join(' | ');
}

const NAVY = '1F3A5F';
const MUTED = '555555';
const SOFT = '333333';
const INK = '111111';

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

export function renderPdf(
  blocks: Block[],
  opts: { title: string; author?: string; kind?: ArtifactKind; pageSize?: 'A4' | 'LETTER' },
): Promise<Buffer> {
  const safe = (t: string) => pdfSafe(t).text;
  const placed = layout(
    blocks.map((b) => ({ ...b, text: safe(b.text), runs: b.runs.map((r) => ({ ...r, text: safe(r.text) })) })),
    opts.kind,
  );
  const letter = opts.kind === 'cover_letter';
  const center = !letter && opts.kind !== 'interview_prep';
  return new Promise((resolve, reject) => {
    const doc: any = new PDFDocument({
      size: opts.pageSize ?? 'A4',
      margins: { top: 42, bottom: 42, left: 46, right: 46 },
      info: { Title: opts.title, Author: opts.author ?? '', Creator: 'Callback' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const BODY = letter ? 10.5 : 9.5;
    const hex = (c: string) => `#${c}`;

    const writeRuns = (runs: Run[], o: { size: number; x?: number; y?: number; w?: number; italic?: boolean; align?: string }) => {
      runs.forEach((r, i) => {
        doc.font(r.bold ? 'Helvetica-Bold' : o.italic ? 'Helvetica-Oblique' : 'Helvetica').fontSize(o.size);
        const opt = { continued: i < runs.length - 1, width: o.w ?? width, lineGap: 1.5, align: o.align ?? 'left' };
        if (i === 0 && o.x != null && o.y != null) doc.text(r.text, o.x, o.y, opt);
        else doc.text(r.text, opt);
      });
      doc.x = left;
    };
    const rule = (y: number, w: number) => doc.moveTo(left, y).lineTo(left + width, y).lineWidth(w).strokeColor(hex(NAVY)).stroke();
    // Headings and role lines never sit alone at the bottom of a page.
    const keepWithNext = (lines: number) => {
      if (doc.y + lines * BODY * 1.4 > doc.page.maxY()) doc.addPage();
    };

    placed.forEach((b, i) => {
      const next = placed[i + 1];
      doc.fillColor(hex(INK));
      switch (b.role) {
        case 'name':
          doc.font('Helvetica-Bold').fontSize(letter ? 20 : 22).fillColor(hex(NAVY));
          doc.text(b.text, left, doc.y, { width, align: center ? 'center' : 'left' });
          doc.moveDown(0.1);
          break;
        case 'contact':
        case 'headline': {
          doc.fillColor(hex(b.role === 'contact' ? SOFT : INK));
          writeRuns(b.runs, { size: b.role === 'contact' ? 9 : 10.5, x: left, y: doc.y, align: center ? 'center' : 'left' });
          doc.moveDown(0.1);
          if (letter && next?.role !== 'contact' && next?.role !== 'headline') {
            rule(doc.y + 3, 1);
            doc.moveDown(1.2);
          }
          break;
        }
        case 'section':
          keepWithNext(4);
          doc.moveDown(0.6);
          doc.font('Helvetica-Bold').fontSize(10.5).fillColor(hex(NAVY));
          doc.text(b.text.toUpperCase(), left, doc.y, { width, characterSpacing: 0.3 });
          rule(doc.y + 1, 0.8);
          doc.moveDown(0.35);
          break;
        case 'entry': {
          const { title, rest, when } = splitEntry(b.text);
          keepWithNext(3);
          doc.moveDown(0.3);
          const y = doc.y;
          let rw = 0;
          if (when) {
            doc.font('Helvetica-Oblique').fontSize(9).fillColor(hex(MUTED));
            rw = doc.widthOfString(when);
            doc.text(when, left + width - rw, y + 1, { width: rw + 2, lineBreak: false });
            doc.fillColor(hex(INK));
          }
          writeRuns([{ text: title, bold: true }, ...(rest ? [{ text: `  |  ${rest}`, bold: false }] : [])], {
            size: BODY + 0.5,
            x: left,
            y,
            w: width - rw - 12,
          });
          doc.moveDown(0.1);
          break;
        }
        case 'scope':
          doc.fillColor(hex(SOFT));
          writeRuns(b.runs, { size: BODY, x: left, y: doc.y, italic: true });
          doc.moveDown(0.15);
          break;
        case 'bullet': {
          const y = doc.y;
          doc.font('Helvetica').fontSize(BODY).text('•', left + 4, y, { lineBreak: false });
          writeRuns(b.runs, { size: BODY, x: left + 16, y, w: width - 16 });
          doc.moveDown(0.15);
          break;
        }
        case 'date':
          writeRuns(b.runs, { size: BODY, x: left, y: doc.y, align: 'right' });
          doc.moveDown(0.8);
          break;
        default:
          if (letter && (b.spaced || b.role === 'subject')) doc.moveDown(0.6);
          writeRuns(b.role === 'subject' ? b.runs.map((r) => ({ ...r, bold: true })) : b.runs, { size: BODY, x: left, y: doc.y });
          doc.moveDown(letter ? 0.05 : 0.15);
      }
    });
    doc.end();
  });
}

// ─── DOCX (docx package) ────────────────────────────────────────────────────
// Same layout as the PDF, so the Word file a recruiter opens matches what the ATS check read.

export async function renderDocx(blocks: Block[], opts: { title: string; kind?: ArtifactKind }): Promise<Buffer> {
  const letter = opts.kind === 'cover_letter';
  const align = !letter && opts.kind !== 'interview_prep' ? AlignmentType.CENTER : AlignmentType.LEFT;
  const RIGHT_TAB = 11906 - 2 * 1000; // A4 width minus side margins, in twips
  const base = letter ? 21 : 20; // half-points; set on every run too, for viewers that ignore docDefaults
  const line = (size: number) => ({ style: BorderStyle.SINGLE, size, color: NAVY, space: 2 });
  const runs = (rs: Run[], o: { size?: number; color?: string; italics?: boolean; bold?: boolean } = {}) =>
    rs.map((r) => new TextRun({ text: r.text, bold: r.bold || o.bold, italics: o.italics, size: o.size ?? base, color: o.color }));

  const placed = layout(blocks, opts.kind);
  const children = placed.map((b, i) => {
    const next = placed[i + 1];
    switch (b.role) {
      case 'name':
        return new Paragraph({ alignment: align, spacing: { after: 40 }, children: [new TextRun({ text: b.text, bold: true, size: letter ? 40 : 44, color: NAVY })] });
      case 'contact':
      case 'headline': {
        const last = next?.role !== 'contact' && next?.role !== 'headline';
        return new Paragraph({
          alignment: align,
          spacing: { after: last ? (letter ? 280 : 80) : 20 },
          border: letter && last ? { bottom: line(8) } : undefined,
          children: runs(b.runs, b.role === 'contact' ? { size: 18, color: SOFT } : { size: 21 }),
        });
      }
      case 'section':
        return new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 80 },
          border: { bottom: line(6) },
          children: [new TextRun({ text: b.text.toUpperCase(), bold: true, size: 21, color: NAVY, font: 'Calibri' })],
        });
      case 'entry': {
        const { title, rest, when } = splitEntry(b.text);
        return new Paragraph({
          keepNext: true,
          tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
          spacing: { before: 100, after: 20 },
          children: [
            new TextRun({ text: title, bold: true, size: 21 }),
            ...(rest ? [new TextRun({ text: `  |  ${rest}`, size: 21 })] : []),
            ...(when ? [new TextRun({ children: [new Tab(), when], italics: true, size: 18, color: MUTED })] : []),
          ],
        });
      }
      case 'scope':
        return new Paragraph({ spacing: { after: 40 }, children: runs(b.runs, { italics: true, color: SOFT }) });
      case 'bullet':
        return new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: runs(b.runs) });
      case 'date':
        return new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 240 }, children: runs(b.runs) });
      case 'subject':
        return new Paragraph({ spacing: { before: 200, after: 40 }, children: runs(b.runs, { bold: true }) });
      default:
        return new Paragraph({ spacing: { before: letter && b.spaced ? 180 : 0, after: letter ? 0 : 60 }, children: runs(b.runs) });
    }
  });
  const doc = new Document({
    title: opts.title,
    creator: 'Callback',
    styles: { default: { document: { run: { font: 'Calibri', size: base } } } },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children }],
  });
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
  const opts = { title: art.title, kind: art.kind };
  const buffer = format === 'pdf' ? await renderPdf(blocks, opts) : await renderDocx(blocks, opts);
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
  /** The person's other documents of the same kind — letters are checked for recycled sentences. */
  siblings?: string[];
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
      if (DATE_LINE.test(b.text)) continue; // a letter's own date ("Berlin, 29 October 2026")
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
    suggestions: isLetter
      ? letterSuggestions(blocks, plain, input.application, unaddressed, input.siblings ?? [])
      : resumeSuggestions(blocks, plain),
  };
}

// ─── Suggestions: short, concrete ways to make it stronger ──────────────────
// Style and evidence only — never content Callback would have to invent. The
// checks target weak spots that recur in real tailored CVs: posting-bridging
// tails, dash-heavy prose, pet phrases, unbacked skills, mixed spelling and
// recycled letter text.

const FILLER = /\b(passionate|proven track record|results[- ]driven|leverag(?:e|ed|es|ing)|synerg(?:y|ies)|spearhead(?:ed|ing|s)?|cutting[- ]edge|seamless(?:ly)?|world[- ]class|genuinely|dynamic team)\b/gi;
const BRIDGE = /\s[—–]\s(directly transferable|exactly what|which maps|the same\b[^.]{0,60}\b(?:role|team|position)\b|an?\s+\S+-style\b)/i;
const WEAK_OPENER = /^(responsible for|worked on|helped|involved in|participated in|tasked with|assisted)\b/i;
const PHRASE_STOP = new Set('the a an and or of to in for with on at by from as is are be was were that this it its into across our their your my'.split(' '));
const SPELLING: [uk: string, us: string][] = [
  ['organis', 'organiz'], ['optimis', 'optimiz'], ['utilis', 'utiliz'], ['prioritis', 'prioritiz'], ['standardis', 'standardiz'],
  ['containeris', 'containeriz'], ['modernis', 'moderniz'], ['behaviour', 'behavior'], ['colour', 'color'], ['catalogue', 'catalog'],
];

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const quote = (s: string, n = 60) => `"${s.length > n ? s.slice(0, n).trimEnd() + '…' : s}"`;
const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => words(x) >= 8);
/** Every run of 8 consecutive words — shared runs mean recycled text even inside otherwise different sentences. */
const shingles = (s: string) => {
  const w = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  return Array.from({ length: Math.max(0, w.length - 7) }, (_, i) => w.slice(i, i + 8).join(' '));
};

function sharedSuggestions(blocks: Block[], plain: string): string[] {
  const out: string[] = [];
  const lower = plain.toLowerCase();
  const filler = [...new Set((plain.match(FILLER) ?? []).map((w) => w.toLowerCase()))];
  if (filler.length) out.push(`Swap generic words for specifics: ${filler.slice(0, 4).map((w) => `"${w}"`).join(', ')}.`);
  const bridges = blocks.filter((b) => BRIDGE.test(b.text));
  if (bridges.length) {
    out.push(`${bridges.length} line(s) end by bridging to the posting (${quote(bridges[0].text.slice(bridges[0].text.search(/\s[—–]\s/) + 1), 45)}) — let the evidence speak; recruiters read these as AI-written.`);
  }
  const dashes = (plain.match(/—/g) ?? []).length;
  if (dashes >= 5 && dashes / Math.max(1, words(plain)) > 0.006) out.push(`${dashes} em-dashes — turn most into full stops or commas; dash-heavy prose reads as AI-written.`);
  // Pet phrases: any 3-word prose phrase used 3+ times, whatever the field. Phrases with a
  // capitalised word are product/tool names ("Azure AI Foundry") — repeating your real stack is fine.
  const counts = new Map<string, number>();
  for (const b of blocks.filter((x) => x.type === 'bullet' || x.type === 'p')) {
    const w = b.text.replace(/[^A-Za-z0-9+#-]+/g, ' ').trim().split(' ');
    const seen = new Set<string>();
    for (let i = 0; i + 3 <= w.length; i++) {
      const tri = w.slice(i, i + 3);
      if (tri.some((x, j) => /\d/.test(x) || (i + j > 0 && /[A-Z]/.test(x)))) continue;
      if (tri.filter((x) => x.length >= 3 && !PHRASE_STOP.has(x.toLowerCase())).length < 2) continue;
      const k = tri.join(' ').toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const pet = [...counts].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 2);
  for (const [p, n] of pet) out.push(`"${p}" appears in ${n} places — keep it where it lands hardest, rephrase the rest.`);
  const uk = SPELLING.find(([u]) => lower.includes(u));
  const us = SPELLING.find(([, a]) => lower.includes(a));
  if (uk && us) out.push(`Mixed UK and US spelling ("${uk[0]}…" and "${us[1]}…") — pick one and use it throughout.`);
  return out;
}

function resumeSuggestions(blocks: Block[], plain: string): string[] {
  const out: string[] = [];
  const bullets = blocks.filter((b) => b.type === 'bullet');
  const flat = bullets.filter((b) => !/\d/.test(b.text));
  if (bullets.length >= 4 && flat.length / bullets.length > 0.5) {
    out.push(`${flat.length} of ${bullets.length} bullets have no number — where you have a real one (scale, %, time saved, team size), add it.`);
  }
  const long = bullets.filter((b) => words(b.text) > 40);
  if (long.length) out.push(`${long.length} bullet(s) run past 40 words — split or tighten; 20–30 words reads best.`);
  const weak = bullets.map((b) => WEAK_OPENER.exec(b.text)?.[1]).filter(Boolean);
  if (weak.length) out.push(`Lead bullets with what you did ("Owned…", "Built…", "Cut…"), not "${weak[0]}".`);
  if (bullets.some((b) => /\b(I|my|me)\b/.test(b.text))) out.push('Drop "I/my" from bullets — resumes use implied first person.');

  // Header: a headline that names the target role, and links reviewers can check.
  const h1 = blocks.findIndex((b) => b.type === 'h1');
  const header = h1 >= 0 ? blocks.slice(h1 + 1).filter((b, i, arr) => b.type === 'p' && !b.spaced && arr.slice(0, i).every((x) => x.type === 'p' && !x.spaced)) : [];
  if (h1 >= 0 && !header.some((b) => b.runs.every((r) => r.bold || !r.text.trim()))) {
    out.push('Add a one-line bold headline under your name: the target role plus 2–3 strengths you can back up ("<Target role> | <strength>, <strength> & <strength>").');
  }
  if (h1 >= 0 && !header.some((b) => /github\.com|gitlab\.com/i.test(b.text)) && /\b(open[- ]source|github|maintainer)\b/i.test(plain)) {
    out.push('You mention open-source work but the header has no GitHub link — add it so reviewers can check.');
  }

  // Summary length.
  const si = blocks.findIndex((b) => b.type === 'h2' && /summary|profile/i.test(b.text));
  if (si >= 0) {
    const end = blocks.findIndex((b, i) => i > si && b.type === 'h2');
    const n = words(blocks.slice(si + 1, end < 0 ? undefined : end).map((b) => b.text).join(' '));
    if (n > 120) out.push(`Summary is ${n} words — 60–100 reads faster: scope today, your 2 strongest numbers, one specialty.`);
  }

  // Skills nobody can see you use.
  const sk = blocks.findIndex((b) => b.type === 'h2' && /skill/i.test(b.text));
  if (sk >= 0) {
    const end = blocks.findIndex((b, i) => i > sk && b.type === 'h2');
    const skillBlocks = blocks.slice(sk + 1, end < 0 ? undefined : end);
    const rest = blocks.filter((b) => !skillBlocks.includes(b)).map((b) => b.text.toLowerCase()).join('\n');
    const items = skillBlocks
      .flatMap((b) => b.text.replace(/^[^:]{1,40}:\s*/, '').replace(/\([^)]*\)/g, '').split(/[,;]/))
      .map((x) => x.trim().replace(/\.$/, ''))
      .filter((x) => x && words(x) <= 3 && x.length > 1);
    const unbacked = [...new Set(items)].filter((x) => !rest.includes(x.toLowerCase()));
    if (unbacked.length >= 3) {
      out.push(`In Skills but never shown in your experience: ${unbacked.slice(0, 6).join(', ')}${unbacked.length > 6 ? '…' : ''} — be ready to discuss each in an interview, or cut the ones you haven't really used.`);
    }
  }

  // Reverse-chronological order.
  const starts = blocks
    .filter((b) => b.type === 'h3')
    .map((b) => ({ b, y: Number(/\b(19|20)\d{2}\b/.exec(splitEntry(b.text).when)?.[0] ?? NaN) }))
    .filter((x) => !Number.isNaN(x.y));
  const late = starts.find((x, i) => i > 0 && x.y > starts[i - 1].y);
  if (late) out.push(`Roles aren't newest-first: ${quote(splitEntry(late.b.text).title, 40)} sits below an older role.`);

  return [...out, ...sharedSuggestions(blocks, plain)];
}

function letterSuggestions(blocks: Block[], plain: string, app: Application | null, unaddressed: string[], siblings: string[]): string[] {
  const out: string[] = [];
  const dear = blocks.findIndex((b) => /^(dear|hello|hi)\b/i.test(b.text));
  const opening = blocks[dear + 1]?.text ?? '';
  if (/^(I am writing|I'm writing|I am applying|I'm applying|I would like to apply|Please accept|I am excited|I'm excited)/i.test(opening)) {
    out.push(`Open with something only true for you and ${app?.company ?? 'this company'} — a product you use, a problem you've solved that they have — not ${quote(opening, 30)}.`);
  }
  if (!/\d/.test(blocks.slice(dear + 1).map((b) => b.text).join(' '))) out.push('Add one concrete, true number — scale, impact or time — so the claims are checkable.');
  if (unaddressed.length && !/\b(not yet|haven't|have not|new to me|ramp(ing)? up|less experience)\b/i.test(plain)) {
    out.push(`The posting asks for ${quote(unaddressed[0].replace(/\.$/, ''), 50)}, which this letter doesn't cover. Naming one real gap and how you'd close it reads as confident, not weak.`);
  }
  // Recycled text: the closing (availability, sign-off) is fine to reuse; the argument isn't.
  const seen = new Set(siblings.flatMap((s) => shingles(s)));
  const body = blocks.slice(dear + 1, -3).map((b) => b.text).join(' ');
  const reused = sentences(body).filter((s) => shingles(s).some((g) => seen.has(g)));
  if (reused.length) out.push(`${reused.length} sentence(s) reuse wording from your other letters (${quote(reused[0], 50)}) — rewrite them for ${app?.company ?? 'this company'}.`);
  return [...out, ...sharedSuggestions(blocks, plain)];
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
    ...r.suggestions.map((s) => `[suggestion] ${s}`),
    'Rule: fix only what is genuinely true for the candidate. Never keyword-stuff or invent.',
  ];
  return lines.filter(Boolean).join('\n');
}

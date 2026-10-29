// ─── Reading CV text ────────────────────────────────────────────────────────
// Plain text extracted from a resume (PDF/DOCX/paste) — what each line is, and
// undoing the line wrapping a PDF export bakes in. Shared by the demo drafter
// and the experience-bank CV import, so both read a CV the same way.

import { DATE_RANGE } from './resume';

export const isHeadingLine = (t: string) => /^#{1,3}\s/.test(t) || /^[A-Z][A-Z &/,-]{3,}$/.test(t);
export const isBulletLine = (t: string) => /^[-*•]\s/.test(t);
export const isLabelLine = (t: string) => /^[A-Z][\w &/+-]{1,30}:\s+\S/.test(t);
const DATE_RANGES = new RegExp(DATE_RANGE.source, 'gi');
/** "Title | Company | Jan 2026 – Present | City" — exactly one date range (a line listing several is a list, not a role). */
export const isRoleLine = (t: string) =>
  !isBulletLine(t) && t.length < 160 && (t.match(DATE_RANGES) ?? []).length === 1 && (/\s\|\s/.test(t) || t.split(/,\s*/).length >= 3);

/** Email, phone, a link or a bare domain — what a contact line is made of ("ASP.NET" isn't a domain). */
export const isContactLine = (t: string) =>
  /[\w.+-]+@[\w-]+\.[a-z]{2,}|\+?\d[\d\s().-]{7,}\d|https?:\/\/|\bwww\.|linkedin\.com|github\.com|gitlab\.com|\b[a-z0-9-]+\.(?:com|dev|io|net|org|me|de|co|ai|app|xyz|tech|page|site)\b/i.test(
    t,
  ) && !/\b[A-Z]{2,}\.NET\b/.test(t);

export interface CvHeader {
  name: string | null;
  /** Every contact part, in order, wrapped lines joined: "City | phone | email | links". */
  contact: string | null;
  /** The positioning line under the name, wrapped lines joined. */
  headline: string | null;
  /** Which of the two came first in the CV — the draft keeps the person's own order. */
  headlineFirst: boolean;
  /** How many leading lines the header used; the body starts after them. */
  lines: number;
}

/** The block above the first section: name, then contact and headline lines in either order. */
export function parseHeader(text: string): CvHeader {
  const raw = text.split(/\r?\n/);
  const name = guessName(text);
  let i = 0;
  while (i < raw.length && !raw[i].trim()) i++;
  if (name) i++;
  const contact: string[] = [];
  const headline: string[] = [];
  let headlineFirst = false;
  for (; i < raw.length; i++) {
    const t = raw[i].trim();
    if (!t) continue;
    if (isHeadingLine(t) || isRoleLine(t) || isBulletLine(t) || headline.length + contact.length >= 6) break;
    if (isContactLine(t)) contact.push(t);
    else if (/[.!?]$/.test(t) && t.split(/\s+/).length > 12) break; // a summary sentence, not a header line
    else {
      if (!contact.length && !headline.length) headlineFirst = true;
      headline.push(t);
    }
  }
  const parts = contact.join(' | ').split(/\s*\|\s*/).filter(Boolean);
  return {
    name,
    contact: parts.length ? parts.join(' | ') : null,
    headline: headline.length ? headline.join(' ').replace(/^\*\*|\*\*$/g, '') : null,
    headlineFirst,
    lines: i,
  };
}

/** Undo the line wrapping a PDF export bakes into CV text: a line that continues
 *  an unfinished sentence, bullet or skills list is joined back onto it. */
export function reflow(profile: string): string {
  const out: string[] = [];
  for (const raw of profile.split(/\r?\n/)) {
    const t = raw.trim();
    const prev = out[out.length - 1] ?? '';
    const flowing = prev && !isHeadingLine(prev) && !isRoleLine(prev) && !/@/.test(prev);
    const contactBlock = isContactLine(t) && /\s\|\s|@|\+?\d[\d\s().-]{7,}\d/.test(t); // not a bullet ending in "(github.com/…)"
    const starts = t && !isHeadingLine(t) && !isBulletLine(t) && !isLabelLine(t) && !isRoleLine(t) && !contactBlock;
    if (flowing && starts && (/^[a-z(]/.test(t) || (prev.length >= 60 && !/[.!?]$/.test(prev)))) {
      out[out.length - 1] = /[A-Za-z0-9][-–]$/.test(prev) ? prev + t : `${prev} ${t}`;
    } else out.push(t);
  }
  return out.join('\n');
}

/** First profile line that looks like a person's name (2–4 words, no digits/@). */
export function guessName(profile: string): string | null {
  const first = profile.split(/\n/).map((l) => l.trim()).find(Boolean) ?? '';
  // "Jane Doe — Senior Backend Engineer" / "Jane Doe | jane@x.com" → "Jane Doe"
  const clean = first.replace(/^#+\s*/, '').split(/\s+[—–|·,]\s*|\s{2,}/)[0]?.trim() ?? '';
  return /^[A-Za-zÀ-ÿ.'-]+(?:\s+[A-Za-zÀ-ÿ.'-]+){1,3}$/.test(clean) && clean.length <= 40 ? clean : null;
}

/** The contact block — every part, wrapped lines joined, never truncated. */
export function guessContact(profile: string): string | null {
  const fromHeader = parseHeader(profile).contact;
  if (fromHeader) return fromHeader;
  const line = profile.split(/\n/).find((l) => /@[a-z0-9.-]+\.[a-z]{2,}/i.test(l));
  return line ? line.trim().replace(/^[-•*]\s*/, '') : null;
}

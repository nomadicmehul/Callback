// ─── Reading CV text ────────────────────────────────────────────────────────
// Plain text extracted from a resume (PDF/DOCX/paste) — what each line is, and
// undoing the line wrapping a PDF export bakes in. Shared by the demo drafter
// and the experience-bank CV import, so both read a CV the same way.

import { DATE_RANGE } from './resume';

export const isHeadingLine = (t: string) => /^#{1,3}\s/.test(t) || /^[A-Z][A-Z &/,-]{3,}$/.test(t);
export const isBulletLine = (t: string) => /^[-*•]\s/.test(t);
export const isLabelLine = (t: string) => /^[A-Z][\w &/+-]{1,30}:\s+\S/.test(t);
export const isRoleLine = (t: string) => !isBulletLine(t) && t.length < 160 && DATE_RANGE.test(t) && (/\s\|\s/.test(t) || t.split(/,\s*/).length >= 3);

/** Undo the line wrapping a PDF export bakes into CV text: a line that continues
 *  an unfinished sentence, bullet or skills list is joined back onto it. */
export function reflow(profile: string): string {
  const out: string[] = [];
  for (const raw of profile.split(/\r?\n/)) {
    const t = raw.trim();
    const prev = out[out.length - 1] ?? '';
    const flowing = prev && !isHeadingLine(prev) && !isRoleLine(prev) && !/@/.test(prev);
    const starts = t && !isHeadingLine(t) && !isBulletLine(t) && !isLabelLine(t) && !isRoleLine(t);
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

/** The profile line carrying an email (contact block), if any. */
export function guessContact(profile: string): string | null {
  const line = profile.split(/\n/).find((l) => /@[a-z0-9.-]+\.[a-z]{2,}/i.test(l));
  return line ? line.trim().replace(/^[-•*]\s*/, '').slice(0, 120) : null;
}

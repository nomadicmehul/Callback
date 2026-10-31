// ─── Draft gaps ──────────────────────────────────────────────────────────────
// An honest draft marks every missing true detail as `[fill in: …]`. One
// definition, shared by the export gate + ATS check (server) and the gap filler
// (dashboard), so both always agree on what still needs the human.

/** A placeholder the human still has to resolve, in document order. */
export interface Gap {
  /** Position among the draft's gaps (0-based) — the key fillGaps() matches on. */
  index: number;
  /** The placeholder exactly as written, e.g. "[fill in: your name]". */
  token: string;
  /** What it asks for: the text after "fill in:". */
  hint: string;
  /** The (trimmed) line it sits on, for context. */
  line: string;
  /** Offset of the token within `line`. */
  at: number;
}

/** The human's answer to one gap: real text, or drop it when there's nothing true to say. */
export type GapFill = { index: number; text: string } | { index: number; drop: true };

const placeholderRe = () => /\[fill in:([^\]]*)\]/gi;

/** Notes, rules and italic guidance never reach the export, so a placeholder
 *  quoted inside one is an example, not a gap. Mirrors parseResumeMarkdown. */
const isEditorial = (line: string) => {
  const t = line.trim();
  return t.startsWith('>') || /^-{3,}$/.test(t) || /^_.*_$/.test(t);
};

export function findGaps(md: string): Gap[] {
  const gaps: Gap[] = [];
  for (const raw of md.split('\n')) {
    if (isEditorial(raw)) continue;
    const lead = raw.length - raw.trimStart().length;
    for (const m of raw.matchAll(placeholderRe())) {
      gaps.push({ index: gaps.length, token: m[0], hint: m[1].trim(), line: raw.trim(), at: (m.index ?? 0) - lead });
    }
  }
  return gaps;
}

/** Apply the human's answers. Unanswered gaps stay; a dropped gap takes its
 *  line with it when nothing meaningful is left ("- **X** →", "Skills:"), and a
 *  section heading goes too once that leaves it empty. */
export function fillGaps(md: string, fills: GapFill[]): string {
  const byIndex = new Map(fills.map((f) => [f.index, f]));
  let n = 0;
  const out: string[] = [];
  const removedAt: number[] = [];
  for (const raw of md.split('\n')) {
    if (isEditorial(raw)) {
      out.push(raw);
      continue;
    }
    let dropped = false;
    const next = raw.replace(placeholderRe(), (tok) => {
      const f = byIndex.get(n++);
      if (!f) return tok;
      if ('drop' in f) {
        dropped = true;
        return '';
      }
      return f.text.replace(/\s+/g, ' ').trim() || tok;
    });
    if (!dropped) {
      out.push(next);
      continue;
    }
    const indent = /^\s*/.exec(next)?.[0] ?? '';
    const body = next.slice(indent.length).replace(/[ \t]{2,}/g, ' ').replace(/ ([.,;:!?])/g, '$1').trim();
    const content = body.replace(/\*\*|__/g, '').replace(/^([-*•]|\d+\.)(\s+|$)/, '').trim();
    if (!content || /[→:—–]$/.test(content)) {
      removedAt.push(out.length); // nothing true left on this line
      continue;
    }
    out.push(indent + body);
  }
  const isHeading = (l?: string) => l != null && /^#{2,3}\s/.test(l.trim());
  for (const at of removedAt.reverse()) {
    let h = at - 1;
    while (h >= 0 && !out[h].trim()) h--;
    let next = at;
    while (next < out.length && !out[next].trim()) next++;
    if (isHeading(out[h]) && (next >= out.length || isHeading(out[next]) || /^-{3,}$/.test(out[next].trim()))) out.splice(h, 1);
  }
  return out.join('\n');
}

// ─── Gap kinds: what a gap asks for, so answers can be reused and tips given ─

export type GapKind = 'opening' | 'outcome' | 'example' | 'honest' | 'availability' | 'headline' | 'summary' | 'name' | 'contact' | 'other';

/** What kind of detail a placeholder asks for, read from its hint. Order matters: the most specific first. */
export function gapKind(hint: string): GapKind {
  const h = hint.toLowerCase();
  if (/^your name$/.test(h)) return 'name';
  if (/city, country|phone \||email/.test(h)) return 'contact';
  if (/headline/.test(h)) return 'headline';
  if (/opening line/.test(h)) return 'opening';
  if (/honest/.test(h)) return 'honest';
  if (/based and when|could start|start date|notice period/.test(h)) return 'availability';
  if (/3–4 lines|in your own words — years/.test(h)) return 'summary';
  if (/outcome|result/.test(h)) return 'outcome';
  if (/example|true result|true, specific/.test(h)) return 'example';
  return 'other';
}

/** One line of recruiter-style guidance per kind, shown next to the gap. */
export const GAP_TIPS: Record<GapKind, string> = {
  opening: 'One sentence only you could write: a product of theirs you use, a problem of theirs you’ve solved, or how you know the team. Never “I am writing to apply”.',
  outcome: 'What changed because of it — a number makes it checkable: time, %, money, people, scale.',
  example: 'One specific time you did this: what it was, what you did, and what happened. One or two sentences.',
  honest: 'Name the gap plainly, then one concrete step you’d take — confident, not apologetic.',
  availability: 'Where you’re based and your earliest start date or notice period.',
  headline: 'Target role | 2–3 strengths you can back up.',
  summary: '3–4 lines: years of experience, what you own today, your two strongest numbers, one specialty.',
  name: 'As on your CV.',
  contact: 'City, phone, email and the links reviewers check — as on your CV.',
  other: 'A real detail, in your words.',
};

/** Kinds whose answer is a standing fact about the person — safe to reuse as is in the next draft. */
export const STANDING_KINDS: GapKind[] = ['availability', 'name', 'contact'];

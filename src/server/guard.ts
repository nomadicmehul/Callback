// ─── Posting guard + URL capture ────────────────────────────────────────────
// Job postings are UNTRUSTED input. Hidden text and "ignore previous
// instructions" payloads in postings are a documented 2026 tactic (both from
// shady employers and from scraped-and-resold listings). Before any agent reads
// a posting we strip invisible characters, drop instruction-shaped lines, and
// surface exactly what we removed so the user can see it.

// Zero-width and bidi controls, soft hyphen, the Mongolian vowel separator, variation selectors, and
// Unicode tag characters (U+E0000–E007F): invisible on screen, read by a model as text ("ASCII smuggling").
const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFE00-\uFE0F\uFEFF\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;

const INJECTION_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /ignore\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules|context)/i, label: 'instruction override' },
  { re: /disregard\s+(all\s+)?(the\s+)?(previous|prior|above)\s+(instructions?|context)/i, label: 'instruction override' },
  { re: /\b(you\s+are|act\s+as|pretend\s+to\s+be)\s+(now\s+)?(an?\s+)?(ai|assistant|llm|chatgpt|claude|gpt)\b/i, label: 'role hijack' },
  { re: /\bsystem\s+prompt\b/i, label: 'system-prompt reference' },
  { re: /\b(rate|score|rank|mark|recommend)\s+(this|the)\s+(candidate|applicant|resume|cv)\b/i, label: 'screener manipulation' },
  { re: /\b(this|the)\s+(candidate|applicant)\s+is\s+(a\s+)?(perfect|ideal|excellent|strong)\s+(fit|match)\b/i, label: 'screener manipulation' },
  { re: /\bdo\s+not\s+(tell|mention|reveal|disclose)\b/i, label: 'concealment instruction' },
  { re: /\b(ai|llm|language\s+model|bot)\s+(reading|processing|screening|reviewing|parsing)\s+this\b/i, label: 'AI-targeted text' },
  // "SYSTEM: …", "Assistant: …" — a line dressed up as a chat turn
  { re: /^\s*[\[(<]?\s*(system|assistant)\s*[\])>]?\s*:/i, label: 'role-tagged instruction' },
  { re: /\b(developer|god|jailbreak|dan|unrestricted)\s+mode\b|\bjailbreak\b/i, label: 'mode switch' },
  { re: /\b(new|updated|real|actual|hidden)\s+instructions?\s*:/i, label: 'instruction override' },
  // "you must advance this candidate" — but not "you will recommend the right tools" (a real responsibility)
  { re: /\b(assistant|model|ai|you)\s+(must|should|shall|will|are\s+to)\s+(recommend|rate|score|hire|approve|advance|shortlist|praise)\s+(?:(?:this|the)\s+(?:candidate|applicant|resume|cv|person)|him|her|them)\b/i, label: 'screener manipulation' },
  { re: /\brecommend\s+(?:to\s+)?hir(?:e|ing)\b/i, label: 'screener manipulation' },
  { re: /\b(output|give|assign|return)\s+(a\s+|an\s+)?(\d{2,3}\s*(\/\s*100)?|perfect|maximum|top)\s*(score|rating)\b/i, label: 'screener manipulation' },
];

/** A flag's quote: whole words, never cut mid-word. */
const quote = (line: string) => {
  const t = line.trim();
  return t.length <= 70 ? t : `${t.slice(0, 70).replace(/\s+\S*$/, '')}…`;
};

// Elements a browser wouldn't show: display:none, visibility:hidden, zero font size or opacity, the
// hidden attribute, aria-hidden. Pasted HTML keeps them; their text is for a model, not a person.
const HIDDEN_ELEMENT =
  /<(\w+)\b[^>]*?(?:style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![.\d]*[1-9])|opacity\s*:\s*0(?![.\d]*[1-9]))[^"']*["']|\shidden(?=[\s>/=])|aria-hidden\s*=\s*["']true["'])[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Drop hidden elements from HTML, counting them. */
export function stripHidden(html: string): { html: string; hidden: number } {
  let hidden = 0;
  let out = html;
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(HIDDEN_ELEMENT, () => (hidden++, ' '));
    if (next === out) break;
    out = next;
  }
  return { html: out, hidden };
}

/** A posting's company, role or location: one line, no invisibles, capped — and nothing that reads as an
 *  instruction (null then, so the caller falls back to what the person typed or "Unknown"). */
export function guardField(raw: string | null | undefined, max = 160): string | null {
  if (!raw) return null;
  const { text } = normalizeText(String(raw).replace(/<[^>]+>/g, ' '));
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line || INJECTION_PATTERNS.some((p) => p.re.test(line))) return null;
  return line.length <= max ? line : line.slice(0, max).replace(/\s+\S*$/, '');
}

export interface GuardResult {
  text: string;
  flags: string[];
}

/** Normalize whitespace and strip invisible characters (safe for any text). */
export function normalizeText(raw: string): { text: string; invisibleCount: number } {
  let text = raw.replace(/\r\n?/g, '\n');
  const invisibleCount = (text.match(INVISIBLE) ?? []).length;
  if (invisibleCount) text = text.replace(INVISIBLE, '');
  text = text
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, invisibleCount };
}

/** Clean an untrusted posting: strip invisibles, remove injection-shaped lines. */
export function postingGuard(raw: string): GuardResult {
  const flags: string[] = [];
  // Pasted HTML: what a browser hides goes first, then the markup itself.
  let input = raw;
  if (/<[a-z][^>]*>/i.test(raw)) {
    const { html, hidden } = stripHidden(raw);
    if (hidden) flags.push(`removed ${hidden} hidden HTML element(s) (text a reader never sees)`);
    input = htmlToText(html).text;
  }
  const { text: normalized, invisibleCount } = normalizeText(input);
  if (invisibleCount > 0) flags.push(`stripped ${invisibleCount} invisible character(s) (hidden-text trick)`);

  const kept: string[] = [];
  for (const line of normalized.split('\n')) {
    const hit = INJECTION_PATTERNS.find((p) => p.re.test(line));
    if (hit) {
      if (flags.length < 12) flags.push(`removed ${hit.label}: "${quote(line)}"`);
      continue;
    }
    kept.push(line);
  }
  return { text: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), flags };
}

// ─── HTML → text ────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

export function htmlToText(html: string): { text: string; title: string | null } {
  const titleRaw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
  let h = stripHidden(html).html;
  // Prefer the main content region when the page marks one.
  const main = /<main[\s\S]*?<\/main>/i.exec(h)?.[0] ?? /<article[\s\S]*?<\/article>/i.exec(h)?.[0];
  if (main && main.length > 500) h = main;
  h = h
    .replace(/<(script|style|noscript|svg|nav|footer|header|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|ul|ol|table|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(h)
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  return { text, title: titleRaw ? decodeEntities(titleRaw).replace(/\s+/g, ' ') : null };
}

// ─── Polite-fetch helpers (used by posting.ts) ──────────────────────────────

export const UA = 'Mozilla/5.0 (compatible; Callback/0.1; local job-search assistant)';

export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h.endsWith('.local') ||
    h === '::1' ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

/** Minimal robots.txt check for the `*` agent. Fails open if unreachable. */
export async function robotsAllows(url: URL): Promise<boolean> {
  try {
    const res = await fetch(`${url.origin}/robots.txt`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return true;
    const txt = await res.text();
    let applies = false;
    const disallow: string[] = [];
    for (const raw of txt.split('\n')) {
      const line = raw.split('#')[0].trim();
      if (!line) continue;
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();
      if (key === 'user-agent') applies = val === '*' || val.toLowerCase().includes('callback');
      else if (applies && key === 'disallow' && val) disallow.push(val.replace(/\*$/, ''));
    }
    const path = url.pathname + url.search;
    return !disallow.some((d) => d !== '/' && path.startsWith(d)) && !disallow.includes('/');
  } catch {
    return true;
  }
}

// fetchPosting (URL → metadata + cleaned text) lives in posting.ts.

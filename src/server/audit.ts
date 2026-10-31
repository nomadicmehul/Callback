// ─── Resume audit: how this document will do, and why ───────────────────────
// Six weighted categories, each scored 0–100, combined into one honest number
// and a report the candidate can read or download. Grounded in what is known
// about how applications are actually screened:
//   · a parser reads it first — Jobscan's 2026 survey has 99.7 % of recruiters
//     filtering on keywords, so the text layer and standard headings come first;
//   · keyword overlap is checked with normalisation (k8s = Kubernetes, plural =
//     singular) and WHERE a term sits matters: used in experience or the summary
//     counts fully, parked in a skills list counts 60 % — modern systems and every
//     recruiter discount a list nobody can verify;
//   · recruiters skim top-down for ~7 seconds (TheLadders eye tracking) and fixate
//     on quantified bullets, so Impact weighs what sits above the fold;
//   · Resume Worded-style checkers score Impact / Brevity / Style — ours adds
//     Honesty, which gates the whole score.
// Nothing here rewards stuffing: a term only counts where it is really used, and
// placeholders or unbacked numbers cap the total.

import type { Application, Artifact, ArtifactKind, AtsReport, AuditCategory } from '@shared/types';
import type { Block } from './resume';

// Shared with the suggestion heuristics in resume.ts.
export const FILLER = /\b(passionate|proven track record|results[- ]driven|leverag(?:e|ed|es|ing)|synerg(?:y|ies)|spearhead(?:ed|ing|s)?|cutting[- ]edge|seamless(?:ly)?|world[- ]class|genuinely|dynamic team)\b/gi;
export const BRIDGE = /\s[—–]\s(directly transferable|exactly what|which maps|the same\b[^.]{0,60}\b(?:role|team|position)\b|an?\s+\S+-style\b)/i;
export const WEAK_OPENER = /^(responsible for|worked on|helped|involved in|participated in|tasked with|assisted)\b/i;
export const SPELLING: [uk: string, us: string][] = [
  ['organis', 'organiz'], ['optimis', 'optimiz'], ['utilis', 'utiliz'], ['prioritis', 'prioritiz'], ['standardis', 'standardiz'],
  ['containeris', 'containeriz'], ['modernis', 'moderniz'], ['behaviour', 'behavior'], ['colour', 'color'], ['catalogue', 'catalog'],
];

const STRONG_OPENER = /^(?:[A-Z][a-z]+ed|Led|Built|Cut|Grew|Drove|Ran|Set|Won|Shipped|Wrote|Made|Took|Brought|Kept|Held|Taught|Sold|Rebuilt|Oversaw|Overhauled|Spearheaded|Co-led|Co-founded)\b/;
const OUTCOME = /\b(reduc|cut|increas|gr[eo]w|sav(?:ed|ing)|improv|accelerat|boost|deliver|launch|shipp|migrat|scal(?:ed|ing)|automat|eliminat|doubl|tripl|halv|lower|rais|from\s+\S+\s+to\s+\S+)/i;
const PASSIVE = /\b(was|were|been|being)\s+(?:\w+ed|built|made|given|done|taken|written|led|run|set|held|kept)\b/i;
const BOILERPLATE = /\b(excited to apply|proven track record|passionate about leveraging|esteemed organi[sz]ation|dynamic team player|perfect fit|hit the ground running)\b/i;
const GENERIC_OPENING = /^(I am writing|I'm writing|I am applying|I'm applying|I would like to apply|Please accept|I am excited|I'm excited|I am thrilled|I'm thrilled)/i;
const GAP_NAMED = /\b(not yet|haven't|have not|new to me|ramp(?:ing)? up|less experience|still learning)\b/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const quote = (s: string, n = 50) => `"${s.length > n ? s.slice(0, n).trimEnd() + '…' : s}"`;
/** A line with a real figure — not a year, a phone number or a date. */
export const hasMetric = (s: string) =>
  /\d/.test(
    s
      .replace(/\+?\d[\d\s().-]{6,}\d/g, '')
      .replace(/\b(19|20)\d{2}\b/g, '')
      .replace(/\b\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?\b/g, ''),
  );

// ─── Keyword matching: normalised, and aware of where a term sits ───────────

export type Zone = 'header' | 'summary' | 'experience' | 'skills' | 'other';

export interface KeywordHit {
  term: string;
  zone: Zone;
}
export interface KeywordMatch {
  found: KeywordHit[];
  missing: string[];
  /** Found, but only in a skills list. */
  skillsOnly: string[];
  /** Σ zone weight over the found terms — divide by the total for weighted coverage. */
  weighted: number;
}

/** Terms a posting and a resume spell differently. Matching is word-bounded, so "go" never matches "google". */
const SYNONYMS: string[][] = [
  ['kubernetes', 'k8s'],
  ['ci/cd', 'cicd', 'ci cd', 'ci-cd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
  ['aws', 'amazon web services'],
  ['gcp', 'google cloud', 'google cloud platform'],
  ['azure', 'microsoft azure'],
  ['postgresql', 'postgres'],
  ['javascript', 'js'],
  ['typescript', 'ts'],
  ['machine learning', 'ml'],
  ['infrastructure as code', 'infrastructure-as-code', 'iac'],
  ['open source', 'open-source', 'oss'],
  ['site reliability engineering', 'site reliability', 'sre'],
  ['large language models', 'large language model', 'llm', 'llms'],
  ['node.js', 'nodejs', 'node'],
  ['react', 'reactjs', 'react.js'],
  ['golang', 'go'],
  ['c#', 'csharp'],
  ['product management', 'product manager'],
  ['user experience', 'ux'],
  ['quality assurance', 'qa'],
  ['artificial intelligence', 'ai'],
  ['devops', 'dev ops'],
  ['rest', 'restful', 'rest api', 'rest apis'],
  ['microservices', 'micro-services', 'microservice'],
  ['containers', 'containerisation', 'containerization', 'containerised', 'containerized'],
  ['observability', 'monitoring'],
  ['stakeholder management', 'stakeholders'],
  ['github actions', 'gh actions'],
  ['argo cd', 'argocd'],
  ['elasticsearch', 'opensearch'],
];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const synonymsOf = (t: string) => SYNONYMS.find((g) => g.includes(t)) ?? [t];

function variants(term: string): string[] {
  const out = new Set<string>();
  for (const v of synonymsOf(term)) {
    out.add(v);
    out.add(v.replace(/-/g, ' '));
    out.add(v.replace(/\s+/g, '-'));
    if (v.length > 3 && v.endsWith('s')) out.add(v.slice(0, -1));
    else {
      out.add(`${v}s`);
      out.add(`${v}es`);
    }
    if (/(ing|ed)$/.test(v) && v.length > 5) {
      out.add(v.replace(/(ing|ed)$/, ''));
      out.add(v.replace(/(ing|ed)$/, 'e'));
    }
  }
  return [...out].filter((v) => v.length >= 2);
}
const present = (text: string, vs: string[]) => vs.some((v) => new RegExp(`(?<![a-z0-9+#])${esc(v)}(?![a-z0-9])`, 'i').test(text));

/** Which section each block belongs to, by its nearest `##` heading. */
export function blockZones(blocks: Block[]): Zone[] {
  let cur: Zone = 'header';
  return blocks.map((b) => {
    if (b.type === 'h2') {
      const h = b.text.toLowerCase();
      cur = /summary|profile|about|objective/.test(h)
        ? 'summary'
        : /skill|technolog|competenc|stack|tools/.test(h)
          ? 'skills'
          : /experience|employment|work history|career|projects?/.test(h)
            ? 'experience'
            : 'other';
    }
    return cur;
  });
}

const ZONE_WEIGHT: Record<Zone, number> = { experience: 1, summary: 1, header: 1, other: 0.8, skills: 0.6 };
const ZONE_ORDER: Zone[] = ['experience', 'summary', 'header', 'other', 'skills'];

export function matchKeywords(terms: string[], blocks: Block[], textLayer: string): KeywordMatch {
  const zones = blockZones(blocks);
  const text: Record<Zone, string> = { header: '', summary: '', experience: '', skills: '', other: '' };
  blocks.forEach((b, i) => {
    if (b.type !== 'h2') text[zones[i]] += `\n${b.text.toLowerCase()}`;
  });
  const out: KeywordMatch = { found: [], missing: [], skillsOnly: [], weighted: 0 };
  for (const t of terms) {
    const vs = variants(t.toLowerCase());
    const zone = ZONE_ORDER.find((z) => present(text[z], vs)) ?? (present(textLayer, vs) ? 'other' : null);
    if (!zone) {
      out.missing.push(t);
      continue;
    }
    out.found.push({ term: t, zone });
    out.weighted += ZONE_WEIGHT[zone];
    if (zone === 'skills') out.skillsOnly.push(t);
  }
  return out;
}

// ─── The categories ─────────────────────────────────────────────────────────

export interface AuditInput {
  kind?: ArtifactKind;
  blocks: Block[];
  plain: string;
  textChars: number;
  pages: number;
  parseable: boolean;
  cid: boolean;
  lostGlyphs: number;
  placeholders: number;
  email: boolean;
  phone: boolean;
  sections: string[];
  keywords: KeywordMatch | null;
  mustHaves: { addressed: number; total: number; unaddressed: string[] } | null;
  unverifiedClaims: number;
  hasProfile: boolean;
  app: Application | null;
  /** Letters: sentences that reuse wording from the person's other letters. */
  recycled: number;
}

export interface AuditResult {
  score: number;
  verdict: string;
  categories: AuditCategory[];
  standout: string[];
}

type Cat = AuditCategory;
const cat = (key: Cat['key'], label: string, hint: string, weight: number): Cat => ({ key, label, hint, score: 100, weight, findings: [], strengths: [] });
const down = (c: Cat, n: number, why: string) => {
  c.score = Math.max(0, c.score - n);
  c.findings.push(why);
};
const up = (c: Cat, why: string) => c.strengths.push(why);
const list = (xs: string[], n = 6) => xs.slice(0, n).join(', ') + (xs.length > n ? '…' : '');

function parseCategory(i: AuditInput, letter: boolean): Cat {
  const c = cat('parse', 'Parse', 'can a system read it?', letter ? 0.15 : 0.2);
  if (!i.parseable) down(c, 60, 'The PDF text layer could not be read — an ATS would see little or nothing.');
  if (i.cid) down(c, 40, 'Garbled glyphs ("(cid:…)") in the text layer — parsers will read gibberish.');
  if (!i.email) down(c, 15, 'No email address in the text layer — contact details belong in plain text, not icons or headers.');
  if (!i.phone && !letter) down(c, 5, 'No phone number found (fine if intentional).');
  if (!letter) {
    if (!i.sections.some((s) => /experience/i.test(s))) down(c, 15, 'No "Experience" heading — parsers key on Summary, Experience, Education, Skills.');
    if (i.sections.length < 3) down(c, 10, `Only ${i.sections.length} standard section heading(s) recognised.`);
  } else if (i.pages > 1) down(c, 25, `${i.pages} pages — a cover letter fits on one.`);
  if (i.lostGlyphs) down(c, 5, `${i.lostGlyphs} character(s) the PDF font can't draw are left out — rephrase them or send the DOCX.`);
  if (i.parseable && !i.cid) up(c, `Clean text layer — ${i.textChars.toLocaleString()} characters read back exactly as a parser would see them`);
  if (!letter && i.sections.length >= 3) up(c, `Standard headings a parser recognises: ${i.sections.join(', ')}`);
  if (i.email && (i.phone || letter)) up(c, 'Contact details in plain text');
  return c;
}

function matchCategory(i: AuditInput, letter: boolean): Cat | null {
  const kw = i.keywords;
  const mh = i.mustHaves && i.mustHaves.total ? i.mustHaves : null;
  const c = cat('match', 'Match', 'what the posting asks for', 0.3);
  if (letter) {
    const plain = i.plain.toLowerCase();
    if (i.app) {
      if (!plain.includes(i.app.company.toLowerCase())) down(c, 40, `Doesn't name ${i.app.company} — make it unmistakably written for this job.`);
      else up(c, `Names ${i.app.company} — written for this job`);
      const roleWords = i.app.role.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 3);
      if (roleWords.length && !roleWords.some((w) => plain.includes(w))) down(c, 15, `Doesn't mention the role (${i.app.role}).`);
    }
    if (mh) {
      const ratio = mh.addressed / mh.total;
      if (ratio < 1) down(c, Math.round((1 - ratio) * 45), `Must-haves not addressed: ${list(mh.unaddressed.map((s) => s.replace(/\.$/, '')), 3)}`);
      else up(c, `Speaks to all ${mh.total} must-haves`);
    }
    return i.app || mh ? c : null;
  }
  if (!kw && !mh) return null;
  const total = kw ? kw.found.length + kw.missing.length : 0;
  const cov = kw && total ? kw.weighted / total : null;
  const ratio = mh ? mh.addressed / mh.total : null;
  const parts: [number, number][] = [];
  if (cov != null) parts.push([cov, 0.6]);
  if (ratio != null) parts.push([ratio, 0.4]);
  c.score = Math.round((100 * parts.reduce((s, [v, w]) => s + v * w, 0)) / parts.reduce((s, [, w]) => s + w, 0));
  if (kw?.missing.length) c.findings.push(`Not present: ${list(kw.missing)} — add only the ones that are genuinely true for you.`);
  if (kw?.skillsOnly.length) c.findings.push(`Only in your skills list: ${list(kw.skillsOnly)} — a list nobody can check; show each in a bullet where you used it.`);
  if (mh?.unaddressed.length) c.findings.push(`Must-haves not evidenced: ${list(mh.unaddressed.map((s) => s.replace(/\.$/, '')), 3)}`);
  if (kw && cov != null && cov >= 0.7) {
    const inContext = kw.found.filter((h) => h.zone !== 'skills').length;
    up(c, `${kw.found.length} of ${total} posting keywords present (${pct(cov)} weighted) — ${inContext} of them where you actually used them`);
  }
  if (kw && kw.found.length >= 3 && !kw.skillsOnly.length) up(c, 'Every matched keyword appears in context, not just in a list');
  if (ratio === 1) up(c, `All ${mh!.total} must-haves are evidenced`);
  return c;
}

function impactCategory(i: AuditInput): Cat {
  const c = cat('impact', 'Impact', 'quantified, active bullets', 0.2);
  const zones = blockZones(i.blocks);
  const bullets = i.blocks.filter((b, k) => b.type === 'bullet' && zones[k] !== 'skills');
  const n = bullets.length;
  if (n < 3) {
    c.score = 40;
    c.findings.push('Fewer than 3 experience bullets — recruiters skim bullets, not paragraphs.');
    return c;
  }
  const quantified = bullets.filter((b) => hasMetric(b.text)).length;
  const strong = bullets.filter((b) => STRONG_OPENER.test(b.text) && !WEAK_OPENER.test(b.text)).length;
  const outcome = bullets.filter((b) => OUTCOME.test(b.text)).length;
  const weak = bullets.filter((b) => WEAK_OPENER.test(b.text));
  const q = quantified / n;
  const a = strong / n;
  const o = outcome / n;
  c.score = Math.round(100 * (0.5 * Math.min(1, q / 0.5) + 0.3 * Math.min(1, a / 0.7) + 0.2 * Math.min(1, o / 0.4)));
  if (q < 0.5) c.findings.push(`${n - quantified} of ${n} bullets have no number — where you have a real one (scale, %, time saved, team size), add it.`);
  if (weak.length) down(c, Math.min(15, 5 * weak.length), `${weak.length} bullet(s) open weakly (${quote(WEAK_OPENER.exec(weak[0].text)![0], 20)}) — lead with what you did.`);
  else if (a < 0.5) c.findings.push('Fewer than half the bullets start with a verb — "Built…", "Cut…", "Led…".');
  if (bullets.some((b) => /\b(I|my|me)\b/.test(b.text))) down(c, 10, 'Bullets use "I/my" — resumes use the implied first person.');
  // Above the fold: the summary and the first role are where the eye lands.
  const secondRole = i.blocks.findIndex((b, k) => b.type === 'h3' && i.blocks.slice(0, k).some((x) => x.type === 'h3'));
  const fold = i.blocks.slice(0, secondRole > 0 ? secondRole : 14);
  if (fold.some((b) => b.type !== 'h1' && b.type !== 'h3' && hasMetric(b.text))) up(c, 'Your strongest numbers sit above the fold, where the eye lands first');
  else down(c, 10, 'Nothing quantified above the fold — move your strongest number into the summary or the first role.');
  if (q >= 0.5) up(c, `${quantified} of ${n} bullets carry a figure — the thing recruiters fixate on`);
  if (a >= 0.7) up(c, 'Bullets lead with what you did');
  if (o >= 0.4) up(c, `${outcome} bullets name an outcome (cut, grew, reduced…)`);
  return c;
}

function brevityCategory(i: AuditInput, letter: boolean): Cat {
  const c = cat('brevity', 'Brevity', 'length and density', letter ? 0.15 : 0.1);
  const n = words(i.plain);
  if (letter) {
    if (n < 150) down(c, 30, `${n} words — too short to make a case.`);
    else if (n < 250) down(c, 10, `${n} words — a little thin; 250–350 reads best.`);
    else if (n > 450) down(c, 25, `${n} words — cover letters land best at 250–350.`);
    else if (n > 350) down(c, 10, `${n} words — trim toward 350.`);
    else up(c, `${n} words — the length that gets read`);
    return c;
  }
  const pages = Math.max(1, i.pages);
  const wpp = Math.round(n / pages);
  if (i.pages > 2) down(c, 30, `${i.pages} pages — aim for 1–2.`);
  if (wpp > 700) down(c, Math.min(30, Math.round((wpp - 700) / 15)), `${wpp} words per page — dense pages get skimmed, not read.`);
  if (n < 250) down(c, 20, `${n} words — too thin to show a track record.`);
  const zones = blockZones(i.blocks);
  const bullets = i.blocks.filter((b, k) => b.type === 'bullet' && zones[k] !== 'skills');
  if (bullets.length >= 3) {
    const ok = bullets.filter((b) => words(b.text) >= 12 && words(b.text) <= 32).length;
    const long = bullets.filter((b) => words(b.text) > 32).length;
    const short = bullets.length - ok - long;
    if (ok / bullets.length < 0.6) down(c, 15, `${long} bullet(s) over 32 words and ${short} under 12 — 12–32 words reads best.`);
    else up(c, 'Bullets run 12–32 words');
    const roles = i.blocks.filter((b) => b.type === 'h3').length;
    if (roles && bullets.length / roles > 7) down(c, 10, `${Math.round(bullets.length / roles)} bullets per role — keep 3–6, cut the rest.`);
  }
  const si = i.blocks.findIndex((b) => b.type === 'h2' && /summary|profile/i.test(b.text));
  if (si >= 0) {
    const end = i.blocks.findIndex((b, k) => k > si && b.type === 'h2');
    const sw = words(i.blocks.slice(si + 1, end < 0 ? undefined : end).map((b) => b.text).join(' '));
    if (sw > 100) down(c, 10, `Summary is ${sw} words — 60–100 reads faster.`);
  }
  if (i.pages <= 2 && wpp <= 650 && n >= 250) up(c, `${i.pages} page${i.pages === 1 ? '' : 's'}, ${wpp} words per page — skimmable`);
  return c;
}

function styleCategory(i: AuditInput, letter: boolean): Cat {
  const c = cat('style', 'Style', 'reads human, not templated', letter ? 0.05 : 0.1);
  const lower = i.plain.toLowerCase();
  const filler = [...new Set((i.plain.match(FILLER) ?? []).map((w) => w.toLowerCase()))];
  if (filler.length) down(c, Math.min(24, 6 * filler.length), `Generic words: ${filler.slice(0, 4).map((w) => `"${w}"`).join(', ')} — swap for specifics.`);
  else up(c, 'No filler phrases');
  const bridges = i.blocks.filter((b) => BRIDGE.test(b.text)).length;
  if (bridges) down(c, Math.min(24, 8 * bridges), `${bridges} line(s) end by bridging to the posting — recruiters read these as AI-written.`);
  const dashes = (i.plain.match(/—/g) ?? []).length;
  if (dashes >= 5 && dashes / Math.max(1, words(i.plain)) > 0.006) down(c, 10, `${dashes} em-dashes — dash-heavy prose reads as AI-written.`);
  const uk = SPELLING.find(([u]) => lower.includes(u));
  const us = SPELLING.find(([, a]) => lower.includes(a));
  if (uk && us) down(c, 8, `Mixed UK and US spelling ("${uk[0]}…" and "${us[1]}…").`);
  else up(c, 'Consistent spelling');
  if (!letter) {
    const passive = i.blocks.filter((b) => b.type === 'bullet' && PASSIVE.test(b.text)).length;
    if (passive) down(c, Math.min(16, 4 * passive), `${passive} bullet(s) in the passive voice ("was built…") — say who did it: you.`);
    const years = i.blocks
      .filter((b) => b.type === 'h3')
      .map((b) => Math.max(...(b.text.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number)))
      .filter((y) => Number.isFinite(y));
    if (years.some((y, k) => k > 0 && y > years[k - 1])) down(c, 10, "Roles aren't newest-first.");
    else if (years.length >= 2) up(c, 'Newest role first');
    const h1 = i.blocks.findIndex((b) => b.type === 'h1');
    const header = h1 >= 0 ? i.blocks.slice(h1 + 1).filter((b, k, arr) => b.type === 'p' && !b.spaced && arr.slice(0, k).every((x) => x.type === 'p' && !x.spaced)) : [];
    if (h1 >= 0 && !header.some((b) => b.runs.every((r) => r.bold || !r.text.trim()))) down(c, 6, 'No bold headline under your name — name the target role and 2–3 strengths.');
    else if (h1 >= 0) up(c, 'A headline names your target');
  }
  return c;
}

function specificityCategory(i: AuditInput): Cat {
  const c = cat('specificity', 'Specificity', 'written for this company only', 0.25);
  const dear = i.blocks.findIndex((b) => /^(dear|hello|hi)\b/i.test(b.text));
  const body = i.blocks.slice(dear + 1);
  const opening = body[0]?.text ?? '';
  if (GENERIC_OPENING.test(opening)) down(c, 30, `Opens with ${quote(opening, 30)} — open with something only true for you and this company.`);
  else if (opening) up(c, 'Opens with something only you could write');
  if (!body.some((b) => hasMetric(b.text))) down(c, 25, 'No concrete number — one true figure makes the claims checkable.');
  else up(c, 'Carries a real number');
  if (BOILERPLATE.test(i.plain)) down(c, 20, 'Contains boilerplate tells ("excited to apply", "proven track record"…) — rewrite in your own words.');
  if (i.recycled) down(c, Math.min(30, 10 * i.recycled), `${i.recycled} sentence(s) reuse wording from your other letters.`);
  else if (i.app) up(c, `Written for ${i.app.company} — nothing recycled`);
  if (i.mustHaves?.unaddressed.length && !GAP_NAMED.test(i.plain)) down(c, 15, "Doesn't name a real gap — one honest sentence on it reads as confident, not weak.");
  return c;
}

function honestyCategory(i: AuditInput): Cat {
  const c = cat('honesty', 'Honesty', 'every claim backed by your profile', 0.1);
  if (i.placeholders) {
    c.score = 0;
    c.findings.push(`${i.placeholders} unfilled placeholder(s) — fill each with a real detail, or drop it. The overall score is capped at 40 until you do.`);
    return c;
  }
  if (i.unverifiedClaims) down(c, Math.min(100, 25 * i.unverifiedClaims), `${i.unverifiedClaims} number(s) don't appear in your profile — verify each before sending.`);
  if (!i.hasProfile) {
    c.score = Math.min(c.score, 60);
    c.findings.push("No profile on file — numbers can't be verified. Add your resume in Settings.");
  }
  if (i.hasProfile && !i.unverifiedClaims) up(c, 'Every number traces back to your profile');
  return c;
}

const PRIORITY: Cat['key'][] = ['honesty', 'impact', 'specificity', 'match', 'parse', 'brevity', 'style'];

function verdictFor(score: number, i: AuditInput): string {
  if (i.placeholders) return 'Not ready — fill the placeholders first; the score is capped until you do.';
  if (!i.parseable) return 'Not ready — the PDF text layer is unreadable.';
  if (score >= 85) return 'Ready to send — strong on the signals parsers and recruiters check.';
  if (score >= 70) return 'Solid — fix the findings below and it stands out.';
  if (score >= 50) return 'Needs work before it is competitive.';
  return 'Not ready — start with the blocking issues.';
}

export function buildAudit(i: AuditInput): AuditResult {
  const letter = i.kind === 'cover_letter';
  const categories = (
    letter
      ? [parseCategory(i, true), matchCategory(i, true), specificityCategory(i), brevityCategory(i, true), styleCategory(i, true), honestyCategory(i)]
      : [parseCategory(i, false), matchCategory(i, false), impactCategory(i), brevityCategory(i, false), styleCategory(i, false), honestyCategory(i)]
  ).filter((c): c is Cat => c !== null);
  // Renormalise when a category doesn't apply (no posting to match against).
  const total = categories.reduce((s, c) => s + c.weight, 0);
  for (const c of categories) c.weight = Math.round((c.weight / total) * 100) / 100;
  const sum = categories.reduce((s, c) => s + c.weight, 0);
  let score = Math.round(categories.reduce((s, c) => s + c.score * c.weight, 0) / sum);
  if (i.placeholders) score = Math.min(score, 40);
  if (!i.parseable) score = Math.min(score, 30);
  else if (i.cid) score = Math.min(score, 60);
  score = Math.max(0, Math.min(100, score));
  const standout = [...categories].sort((a, b) => PRIORITY.indexOf(a.key) - PRIORITY.indexOf(b.key)).flatMap((c) => c.strengths).slice(0, 5);
  return { score, verdict: verdictFor(score, i), categories, standout };
}

// ─── The report people download ─────────────────────────────────────────────

/** A Markdown audit of one document — the score, why, and what to do about it. */
export function auditMarkdown(r: AtsReport, art: Artifact, app: Application | null): string {
  const letter = art.kind === 'cover_letter';
  const date = new Date().toISOString().slice(0, 10);
  const block = r.issues.filter((x) => x.level === 'block');
  const warn = r.issues.filter((x) => x.level === 'warn');
  const lines = [
    `# Audit — ${art.title}`,
    `_${app ? `${app.role} @ ${app.company} · ` : ''}${letter ? 'cover letter' : 'resume'} · ${date}_`,
    '',
    `## ${r.score}/100 — ${r.verdict}`,
    '',
    '| Category | Asks | Score | Weight |',
    '|---|---|---:|---:|',
    ...r.categories.map((c) => `| ${c.label} | ${c.hint} | ${c.score} | ${Math.round(c.weight * 100)}% |`),
    '',
  ];
  if (r.standout.length) lines.push('## What makes it stand out', ...r.standout.map((s) => `- ${s}`), '');
  if (block.length || warn.length) lines.push('## Fix first', ...block.map((x) => `- ⛔ ${x.text}`), ...warn.map((x) => `- ⚠ ${x.text}`), '');
  lines.push('## By category');
  for (const c of r.categories) {
    lines.push('', `### ${c.label} — ${c.score}/100 (${Math.round(c.weight * 100)}%) · _${c.hint}_`);
    for (const s of c.strengths) lines.push(`- ✓ ${s}`);
    for (const f of c.findings) lines.push(`- ✗ ${f}`);
    if (!c.strengths.length && !c.findings.length) lines.push('- Nothing to flag.');
  }
  if (r.keywords.coverage != null) {
    lines.push(
      '',
      '## Posting keywords',
      `Weighted coverage ${pct(r.keywords.coverage)} — a term counts fully where you used it (experience, summary), 60% when it only sits in a skills list.`,
      r.keywords.found.length ? `- Present: ${r.keywords.found.join(', ')}` : '- Present: none',
      r.keywords.skillsOnly.length ? `- Only in the skills list: ${r.keywords.skillsOnly.join(', ')}` : '',
      r.keywords.missing.length ? `- Missing: ${r.keywords.missing.join(', ')} — add only what is genuinely true for you` : '- Missing: none',
    );
  }
  if (r.mustHaves.addressed.length || r.mustHaves.unaddressed.length) {
    lines.push('', '## Must-haves', ...r.mustHaves.addressed.map((m) => `- ✓ ${m}`), ...r.mustHaves.unaddressed.map((m) => `- ✗ ${m}`));
  }
  if (r.unverifiedClaims.length) lines.push('', '## Numbers to verify', "These don't appear in your profile — make sure each is true before you send:", ...r.unverifiedClaims.map((c) => `- ${c}`));
  if (r.suggestions.length) lines.push('', '## Make it stronger', ...r.suggestions.map((s) => `- ${s}`));
  lines.push(
    '',
    '## How this score works',
    'Each category is scored 0–100 and weighted as shown; the total is their weighted average. Two gates sit on top: unfilled placeholders cap the total at 40 and an unreadable text layer at 30, because nothing else matters until those are fixed.',
    'Keywords are matched after normalisation (k8s = Kubernetes, plural = singular) and weighted by where they sit. Nothing here rewards adding words that are not true — every number is checked against your own profile.',
    'Grounded in how screening works: parsers and keyword filters first (Jobscan 2026: 99.7% of recruiters filter on keywords), then a ~7-second top-down skim that fixates on quantified bullets (TheLadders eye-tracking), then Impact / Brevity / Style the way the better resume checkers score them — plus Honesty, which the others leave out.',
    '',
    '_Generated by Callback on your machine. No data left it._',
  );
  return lines.filter((l) => l !== undefined).join('\n');
}

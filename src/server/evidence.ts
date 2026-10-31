// ─── Evidence: which of the candidate's own lines backs a requirement ───────
// Shared by the demo drafter and the gap suggestions, so a draft and the gap
// filler point at the same real experience. Matching only — never wording.

import type { Experience } from '@shared/types';
import { isHeadingLine, isRoleLine } from './cvtext';

export const STOP = new Set(
  (
    'the a an and or of to in for with on at by from as is are be we you your our their this that will who what which role team work years experience including etc ' +
    'have has must strong hiring hire need needs required requirements skills skill ability able plus nice preferred looking join about across within using also well ' +
    'our you yours they them into over more most such than then these those very each both any all can may should would ' +
    'through teams technical driving partner days interview people company offer benefits culture help make like want just'
  ).split(/\s+/),
);

const GENERIC = new Set(
  'extensive proven deep solid knowledge background roles environment fluency least technologies ecosystem strategies large scale multi such including demonstrated hands'.split(' '),
);

/** The profile sentence that best evidences a requirement: the one sharing the most of its
 *  real terms (skills lines count a little less — a list isn't a story). Null when nothing does. */
/** Matching terms needed to count as evidence: short requirements ("Kubernetes and Terraform") need one, longer ones two. */
export const enough = (terms: string[]) => (terms.length <= 3 ? 1 : 2);
export const requirementTerms = (requirement: string) =>
  [...new Set(requirement.toLowerCase().split(/[^a-z0-9+#]+/))].filter((w) => w.length > 2 && !STOP.has(w) && !GENERIC.has(w));

/** The confirmed story that best evidences a requirement (at least two of its real terms). */
export function storyFor(bank: Experience[], requirement: string, used = new Set<string>()): Experience | null {
  const terms = requirementTerms(requirement);
  let best: Experience | null = null;
  let top = 0;
  for (const e of bank) {
    if (e.kind !== 'story' || used.has(e.id)) continue;
    const hay = [e.title, e.situation, e.action, e.result, e.details, e.tags.join(' ')].filter(Boolean).join(' ').toLowerCase();
    const score = terms.filter((t) => hay.includes(t)).length;
    if (score > top) [best, top] = [e, score];
  }
  return top >= enough(terms) ? best : null;
}

export const hasFigure = (s: string | null) => !!s && /\d/.test(s.replace(/\b(19|20)\d{2}\b/g, ''));
const PAST_VERB = /^(\w+ed|Led|Built|Ran|Wrote|Cut|Grew|Drove|Made|Set|Took|Won|Shipped|Brought|Kept|Found|Rebuilt|Held|Taught|Sold|Spoke)\b/;
/** "Cut p99 latency by 35%" → "I cut p99 latency by 35%." — a letter speaks in the first person. */
export function firstPerson(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ').replace(/[.!?]*$/, '.');
  return PAST_VERB.test(t) ? `I ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t.charAt(0).toUpperCase() + t.slice(1);
}

export function evidenceFor(profile: string, requirement: string, opts: { prose?: boolean } = {}): string | null {
  const terms = requirementTerms(requirement);
  let best: string | null = null;
  let top = 0;
  for (const line of profile.split('\n')) {
    if (!line || /@/.test(line) || isHeadingLine(line) || isRoleLine(line) || /\s\|\s/.test(line)) continue;
    const label = /^(?:[-*•]\s*)?([^:]{1,40}):\s+/.exec(line);
    if (label && opts.prose) continue; // a letter quotes a sentence, never a skills list
    const weight = label ? 0.75 : 1;
    const text = line.replace(/^[-*•]\s*/, '').replace(/^[^:]{1,40}:\s+/, '');
    for (const sent of text.split(/(?<=[.!?])\s+/)) {
      const hay = `${label?.[1] ?? ''} ${sent}`.toLowerCase();
      const score = terms.filter((t) => hay.includes(t)).length * weight;
      if (score > top) [best, top] = [sent, score];
    }
  }
  if (!best || top < Math.min(1.5, enough(terms))) return null;
  return opts.prose || best.length <= 180 ? best : best.slice(0, 180).replace(/\s+\S*$/, '') + '…';
}

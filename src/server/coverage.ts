// ─── Coverage: what your tracked jobs ask for, and what you have a story for ─
// Reads every open application's must-haves and keywords, groups the same ask
// across jobs, and checks each against the confirmed experience bank and the
// CV. "3 of your 5 targets ask for Terraform — no story yet" is the shape. The
// answer is always the person's own story, never a line Callback invents.

import type { Application, Coverage } from '@shared/types';
import { listApplications, listExperiences } from './db';
import { getConfig } from './config';
import { parseHeader, reflow } from './cvtext';
import { STOP, evidenceFor, requirementTerms, storyFor } from './evidence';

/** Words that describe the ask, not the skill — two phrasings of one skill share a key without them. */
const NEUTRAL = new Set(
  'years year production experience experienced hands hands-on senior strong proven solid deep knowledge familiarity understanding working background track record least minimum plus required require requirement demonstrated extensive running'.split(
    ' ',
  ),
);
const LEAD = /^(you (must|should|will need to|need to) have|must have|we (require|need|expect)|requires?|required:?|requirements?:?|have|has|are|be|a|an|strong|solid|deep|proven|demonstrated|extensive)\s+/i;

/** "You must have 6+ years of Terraform." → "6+ years of Terraform" */
function shortLabel(m: string): string {
  let s = m
    .trim()
    .replace(/\.$/, '')
    .replace(/\s+(is|are)\s+(required|a must|essential|mandatory)$/i, '')
    .replace(/\s+\(?required\)?$/i, '');
  while (LEAD.test(s)) s = s.replace(LEAD, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function experienceCoverage(): Coverage[] {
  const apps = listApplications().filter((a) => a.analysis && a.status !== 'rejected');
  if (!apps.length) return [];
  const bank = listExperiences('active');
  const cv = getConfig().candidateProfile?.trim() ?? '';
  const profile = cv ? reflow(cv.split(/\r?\n/).slice(parseHeader(cv).lines).join('\n')) : '';
  const bankBlob = bank
    .map((e) => [e.title, e.situation, e.action, e.result, e.details, e.tags.join(' ')].filter(Boolean).join(' '))
    .join('\n')
    .toLowerCase();

  const groups = new Map<string, Coverage>();
  const ask = (key: string, label: string, terms: string[], app: Application) => {
    const g = groups.get(key) ?? { key, label, terms, asks: [], total: apps.length, covered: null, by: null, evidence: null };
    if (!g.asks.some((a) => a.applicationId === app.id)) g.asks.push({ applicationId: app.id, company: app.company, role: app.role });
    if (label.length < g.label.length) g.label = label; // the shortest phrasing reads best
    groups.set(key, g);
  };
  for (const app of apps) {
    const own = `${app.company} ${app.role}`.toLowerCase();
    const an = app.analysis!;
    for (const m of an.mustHaves.filter((x) => !x.startsWith('('))) {
      const terms = requirementTerms(m).filter((t) => !NEUTRAL.has(t) && !own.includes(t));
      if (!terms.length) continue;
      ask([...terms].sort().join('+'), shortLabel(m), terms, app);
    }
    for (const k of an.keywords) {
      const t = k.toLowerCase().trim();
      if (t.length < 3 || STOP.has(t) || NEUTRAL.has(t) || own.includes(t) || /^\d+$/.test(t)) continue;
      ask(t, k.trim(), [t], app);
    }
  }
  // A bare keyword ("terraform") folds into the must-have that names it ("Terraform experience is required").
  const multi = [...groups.values()].filter((g) => g.terms.length > 1);
  for (const g of [...groups.values()].filter((x) => x.terms.length === 1)) {
    const home = multi.find((m) => m.terms.includes(g.key));
    if (!home) continue;
    for (const a of g.asks) if (!home.asks.some((x) => x.applicationId === a.applicationId)) home.asks.push(a);
    if (g.label.length < home.label.length) home.label = g.label; // "Kafka" beats the whole requirement sentence
    groups.delete(g.key);
  }

  const out: Coverage[] = [];
  for (const g of groups.values()) {
    const story = storyFor(bank, g.terms.join(' '));
    if (story) {
      g.covered = 'story';
      g.by = { id: story.id, title: story.title };
    } else {
      const ev = profile ? evidenceFor(profile, g.terms.join(' ')) : null;
      if (ev) {
        g.covered = 'profile';
        g.evidence = ev;
      } else if (g.terms.every((t) => bankBlob.includes(t))) {
        g.covered = 'profile'; // a confirmed role or project mentions it, even without a story
      }
    }
    out.push(g);
  }
  // Open asks first, the most-wanted on top.
  return out
    .sort((a, b) => Number(!!a.covered) - Number(!!b.covered) || b.asks.length - a.asks.length || a.label.localeCompare(b.label))
    .slice(0, 15);
}

/** Plain text for agents and the plugin. */
export function coverageText(items: Coverage[]): string {
  if (!items.length) return 'No tracked jobs with an analysis yet — capture a job first.';
  const open = items.filter((c) => !c.covered).length;
  return [
    `Across ${items[0].total} tracked job(s): ${open} ask(s) with no story yet.`,
    ...items.map(
      (c) =>
        `${c.covered ? '✓' : '○'} ${c.label} — ${c.asks.length} of ${c.total} (${c.asks.map((a) => a.company).join(', ')})${
          c.covered === 'story' ? ` — story: "${c.by!.title}"` : c.covered === 'profile' ? ` — CV: "${(c.evidence ?? 'a confirmed role or project mentions it').slice(0, 100)}"` : ' — no story yet'
        }`,
    ),
    'The next story worth adding is the top ○ line. It must be their real experience — never invent one to close a gap.',
  ].join('\n');
}

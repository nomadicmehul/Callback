// ─── Gap suggestions: fill a draft's gaps from what Callback already knows ──
// Only the person's own material — their CV, confirmed experience, and what
// they typed into earlier gaps. Standing facts (availability, name, contact)
// pre-fill; experience pre-fills only on a strong match with a real number;
// the rest is offered as one-click options. Nothing is invented, and the
// human checks every word before it's saved.

import type { Application, Artifact, Experience, GapAnswer, GapSuggestion } from '@shared/types';
import { findGaps, gapKind, GAP_TIPS, type Gap } from '@shared/placeholders';
import { getConfig } from './config';
import { listExperiences, listGapAnswers } from './db';
import { isBulletLine, parseHeader, reflow } from './cvtext';
import { enough, firstPerson, hasFigure, requirementTerms } from './evidence';

type Option = { text: string; source: string; score: number };

const clip = (s: string, n = 240) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…');
const score = (text: string, terms: string[]) => terms.filter((t) => text.toLowerCase().includes(t)).length;
const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 12);

/** What a gap is about: the requirement its paragraph names, else the words around it. */
function topicOf(g: Gap): string {
  return (
    /honest sentence on (.+?) —/.exec(g.hint)?.[1] ??
    /shows (.+?), with a number/.exec(g.hint)?.[1] ??
    /You're looking for ([^.]+)\./.exec(g.line)?.[1] ??
    g.line.replace(/\[fill in:[^\]]*\]/g, ' ')
  );
}

/** How a confirmed story reads in a letter: what they did, then what changed. */
const told = (e: Experience) => [e.action ?? e.details ?? e.title, e.result].filter(Boolean).map((s) => firstPerson(s!)).join(' ');

function dedupe(options: Option[], max = 3): { text: string; source: string }[] {
  const seen = new Set<string>();
  return options
    .sort((a, b) => b.score - a.score)
    .filter((o) => {
      const k = o.text.toLowerCase().replace(/\W+/g, ' ').trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max)
    .map(({ text, source }) => ({ text, source }));
}

export function suggestGaps(artifact: Artifact, app: Application | null): GapSuggestion[] {
  const cv = getConfig().candidateProfile?.trim() ?? '';
  const header = parseHeader(cv);
  const body = reflow(cv.split(/\r?\n/).slice(header.lines).join('\n'));
  const cvLines = body
    .split('\n')
    .filter(isBulletLine)
    .flatMap((l) => sentences(l.replace(/^[-*•]\s*/, '')));
  const stories = listExperiences('active').filter((e) => e.kind === 'story');
  const bank = listExperiences('active');
  const past = listGapAnswers();
  const company = app?.company ?? null;
  const ago = (a: GapAnswer) => `your answer for ${a.company ?? 'an earlier draft'}`;

  return findGaps(artifact.content).map((g) => {
    const kind = gapKind(g.hint);
    const sameHint = past.find((a) => a.hint === g.hint && a.company === company); // re-tailoring the same job
    const ofKind = past.filter((a) => a.kind === kind);
    let fill: GapSuggestion['fill'] = sameHint ? { text: sameHint.answer, source: 'your answer for this job' } : null;
    let options: Option[] = [];

    if (kind === 'name' && header.name) fill ??= { text: header.name, source: 'your CV' };
    else if (kind === 'contact' && header.contact) fill ??= { text: header.contact, source: 'your CV' };
    else if (kind === 'availability') {
      if (ofKind[0]) fill ??= { text: ofKind[0].answer.replace(/\.$/, ''), source: ago(ofKind[0]) };
      const city = header.contact?.split(/\s*\|\s*/).find((p) => p && !/[@\d]|\.[a-z]{2,}\b|linkedin|github/i.test(p));
      if (city) options.push({ text: `I am based in ${city.split(',')[0].trim()}`, source: 'your CV', score: 0 });
    } else if (kind === 'headline' || kind === 'summary') {
      options = ofKind.slice(0, 3).map((a) => ({ text: a.answer, source: ago(a), score: 1 }));
    } else if (kind === 'opening') {
      // A real connection to this company in their own material — the strongest opener there is.
      // The company's name as a whole, minus legal/descriptor suffixes: "Grafana Labs" → "grafana", "Acme GmbH" → "acme".
      const name = (company ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\b(gmbh|ag|se|inc|ltd|llc|plc|corp|co|company|labs?|technologies|tech|group|io|hq)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const mentions = (t: string) => name.length > 2 && new RegExp(`\\b${name.replace(/ /g, '\\s+')}\\b`).test(t.toLowerCase());
      options = [
        ...body.split('\n').filter((l) => mentions(l)).map((l) => ({ text: clip(l.replace(/^[-*•]\s*/, '')), source: 'your CV mentions them', score: 3 })),
        ...bank.filter((e) => mentions(`${e.title} ${e.org ?? ''} ${e.details ?? ''}`)).map((e) => ({ text: clip(`${e.title}${e.org ? ` — ${e.org}` : ''}`), source: 'your experience mentions them', score: 3 })),
      ];
    } else if (kind === 'outcome' || kind === 'example' || kind === 'honest' || kind === 'other') {
      const terms = requirementTerms(topicOf(g));
      if (kind !== 'honest') {
        options = [
          ...stories.map((e) => ({
            text: kind === 'outcome' ? firstPerson(e.result ?? e.details ?? e.title) : told(e),
            source: `your story “${clip(e.title, 50)}”`,
            score: score(`${e.title} ${e.situation ?? ''} ${e.action ?? ''} ${e.result ?? ''} ${e.details ?? ''} ${e.tags.join(' ')}`, terms) + (hasFigure(e.result ?? e.details) ? 0.5 : 0),
          })),
          ...cvLines.map((l) => ({ text: firstPerson(l), source: 'your CV', score: score(l, terms) + (hasFigure(l) ? 0.5 : 0) - 0.25 })),
        ].filter((o) => o.score >= 1 && (kind !== 'outcome' || hasFigure(o.text)));
      }
      options.push(...ofKind.map((a) => ({ text: a.answer, source: ago(a), score: score(a.answer, terms) + 0.1 })).filter((o) => o.score >= 1));
      const best = [...options].sort((a, b) => b.score - a.score)[0];
      if (!fill && best && kind !== 'honest' && best.score >= enough(terms) + 0.5 && hasFigure(best.text)) fill = { text: best.text, source: best.source };
    }

    return {
      index: g.index,
      kind,
      tip: GAP_TIPS[kind],
      fill,
      options: dedupe(options.filter((o) => o.text !== fill?.text)),
    };
  });
}

/** Reusable standing answers — where they're based and when they can start, and the header details
 *  (name, contact line) they typed into an earlier draft — for drafts and agents. */
export function standingAnswers(): { availability: string | null; name: string | null; contact: string | null } {
  const last = (kind: string) => listGapAnswers(kind)[0]?.answer.trim() || null;
  return { availability: last('availability')?.replace(/\.$/, '') ?? null, name: last('name'), contact: last('contact') };
}

// ─── Interview prep: rubric, question bank, scoring, spaced repetition ──────
// Grounded in deliberate practice (target one weakness, immediate concrete
// feedback), retrieval practice (make them answer, don't lecture), and spacing
// (re-surface weak items after a delay). Prep BEFORE the interview — never
// real-time assistance during one.

import type {
  AnswerScore,
  Application,
  Drill,
  InterviewMode,
  InterviewTurn,
  MemoryNote,
} from '@shared/types';
import type { RunContext } from './runctx';
import {
  createDrill,
  getDrill,
  rescheduleDrill,
  listInterviewTurns,
  getInterviewSession,
  finishInterviewSession,
  proposeMemory,
  countDrillsSince,
  getApplication,
} from './db';
import { groundTruth } from './experience';
import { ARCH_BLUEPRINT, exerciseFor, learningPath, recommend, studyPlan, type DimResult, type TopicHit } from './resources';
import { isHeadingLine, isRoleLine } from './cvtext';
import { STOP } from './resume';
import { hasMetric } from './audit';

/** Posting words that name nothing to revise — verbs and framing the keyword extractor lets through. */
const GENERIC = new Set(
  (
    'build design run own define deliver drive event events streaming platform platforms systems system experience knowledge strong production teams team engineering environments environment infrastructure tools tooling services service solutions years ability ' +
    'required require requirements requirement must solid proven deep hands familiarity understanding skills skill excellent good working least including similar related relevant'
  ).split(' '),
);
const isContactLine = (s: string) => /@|https?:\/\/|linkedin\.com|github\.com|\+?\d[\d\s().-]{7,}\d/.test(s);

export const INTERVIEW_MODES: InterviewMode[] = ['behavioral', 'technical', 'system_design'];

export const MODE_LABEL: Record<InterviewMode, string> = {
  behavioral: 'Behavioral',
  technical: 'Technical',
  system_design: 'System design',
};

/** The rubric: what we score, and the one concrete fix for each dimension. */
export const DIMENSIONS: Record<InterviewMode, { key: string; label: string; fix: string }[]> = {
  behavioral: [
    { key: 'structure', label: 'STAR structure', fix: 'Lead with the situation in one sentence, then the task, then what YOU did, then the result.' },
    { key: 'ownership', label: 'Ownership ("I" vs "we")', fix: 'Say what you personally did — swap "we" for "I" wherever it was actually you.' },
    { key: 'impact', label: 'Quantified result', fix: 'End with a number: a %, time saved, revenue, users, latency — one concrete metric.' },
    { key: 'reflection', label: 'Reflection', fix: 'Close with one sentence on what you learned or would do differently.' },
    { key: 'concision', label: 'Concision', fix: 'Aim for ~90 seconds spoken (150–250 words). Cut backstory; keep the action and the result.' },
  ],
  technical: [
    { key: 'approach', label: 'Pattern / approach', fix: 'Name the pattern you are applying (hash map, two pointers, BFS, DP…) before you code it.' },
    { key: 'complexity', label: 'Complexity', fix: 'State time and space complexity explicitly, e.g. "O(n) time, O(1) space".' },
    { key: 'edge_cases', label: 'Edge cases', fix: 'Call out empty input, a single element, duplicates, negatives/overflow before you finish.' },
    { key: 'correctness', label: 'Correctness reasoning', fix: 'Walk one small example through your approach step by step to show it works.' },
    { key: 'communication', label: 'Communication', fix: 'Narrate the plan in steps ("first… then… finally…") before diving in.' },
  ],
  system_design: [
    { key: 'requirements', label: 'Requirements', fix: 'Open by clarifying functional and non-functional requirements (scale, latency, availability).' },
    { key: 'estimation', label: 'Back-of-envelope', fix: 'Estimate QPS, storage and bandwidth with real numbers before designing anything.' },
    { key: 'design', label: 'High-level design', fix: 'Name the core components (API, services, DB, cache, queue, LB) and how data flows between them.' },
    { key: 'tradeoffs', label: 'Trade-offs', fix: 'For each major choice say what you traded away and why (consistency vs availability, cost vs latency…).' },
    { key: 'bottlenecks', label: 'Bottlenecks & failure', fix: 'Identify the hot spot or single point of failure and how you would scale or protect it.' },
  ],
};

export const DIM_LABEL: Record<string, string> = Object.fromEntries(
  INTERVIEW_MODES.flatMap((m) => DIMENSIONS[m].map((d) => [d.key, d.label])),
);

// ─── Question bank (generic) ────────────────────────────────────────────────

const BANK: Record<InterviewMode, { q: string; dim: string }[]> = {
  behavioral: [
    { q: 'Tell me about a time you had to deliver something under a tight deadline. What did you do, and what happened?', dim: 'structure' },
    { q: 'Describe the project where you had the most impact. How did you measure it?', dim: 'impact' },
    { q: 'Tell me about a disagreement with a teammate or manager. How did you handle it?', dim: 'ownership' },
    { q: 'Tell me about a time you failed or made a significant mistake. What did you learn?', dim: 'reflection' },
    { q: 'Give me an example of when you had to influence people without authority.', dim: 'ownership' },
    { q: 'Describe a time you had to make a decision with incomplete information.', dim: 'structure' },
    { q: 'Tell me about a time you improved a process or system. What was the before and after?', dim: 'impact' },
    { q: 'Walk me through a time you received tough feedback. What did you change?', dim: 'reflection' },
    { q: 'Tell me about the most complex technical problem you have solved — in about 90 seconds.', dim: 'concision' },
  ],
  technical: [
    { q: 'Given an array of integers and a target, return the indices of two numbers that add up to the target. Talk through your approach and its complexity.', dim: 'approach' },
    { q: 'Find the length of the longest substring without repeating characters. What is the optimal approach?', dim: 'approach' },
    { q: 'You receive a stream of numbers; return the running median after each insertion. How would you do it efficiently?', dim: 'complexity' },
    { q: 'Given a binary tree, determine whether it is a valid binary search tree. What edge cases matter?', dim: 'edge_cases' },
    { q: 'Merge k sorted lists into one sorted list. Compare at least two approaches.', dim: 'complexity' },
    { q: 'Detect whether a linked list has a cycle using O(1) extra space. Explain why it works.', dim: 'correctness' },
    { q: 'Given a grid of 0s and 1s, count the number of islands. Walk me through your plan before any code.', dim: 'communication' },
    { q: 'Design an LRU cache with O(1) get and put. Which data structures do you combine, and why?', dim: 'approach' },
  ],
  system_design: [
    { q: 'Design a URL shortener. Start with requirements and a scale estimate.', dim: 'requirements' },
    { q: 'Design a news feed for a social network with 100M daily users. Where are the bottlenecks?', dim: 'bottlenecks' },
    { q: 'Design a rate limiter for a public API. What trade-offs are you making?', dim: 'tradeoffs' },
    { q: 'Design a distributed job scheduler that runs millions of jobs a day. Estimate the load first.', dim: 'estimation' },
    { q: 'Design a chat system like Slack. Walk me through the high-level components and the data flow.', dim: 'design' },
    { q: 'Design a metrics pipeline ingesting 1M events per second. What breaks first at 10x?', dim: 'bottlenecks' },
  ],
};

export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
export const trimDot = (s: string) => s.trim().replace(/\.$/, '');

/** The first profile line that plausibly evidences a requirement — shared by the
 *  prep pack and the cover letter so both point at the SAME real experience. */
export function findEvidence(profile: string, requirement: string): string | null {
  // Real terms only: "aws" and "eks" count, "experience" and "required" don't.
  const terms = [...new Set(requirement.toLowerCase().split(/[^a-z0-9+#]+/))].filter((w) => w.length > 2 && !STOP.has(w) && !GENERIC.has(w));
  if (!terms.length) return null;
  let best: string | null = null;
  let top = 0;
  for (const raw of profile.split(/\n/)) {
    const line = raw.trim();
    if (!line || isHeadingLine(line) || isContactLine(line)) continue; // a heading or a phone number is never evidence
    const hay = line.toLowerCase();
    const score = terms.filter((t) => hay.includes(t)).length + (hasMetric(line) ? 0.5 : 0); // a figure wins a tie
    if (score > top) [best, top] = [line, score];
  }
  return top >= 1 && best ? best.replace(/^[-•*]\s*/, '') : null;
}
const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const countRe = (s: string, re: RegExp) => (s.match(re) ?? []).length;

/** Company-specific questions derived from the application's JD analysis. */
export function generateQuestions(mode: InterviewMode, app: Application | null): { q: string; dim: string }[] {
  const an = app?.analysis;
  if (!app || !an) return [];
  const out: { q: string; dim: string }[] = [];
  if (mode === 'behavioral') {
    for (const r of an.responsibilities.slice(0, 2)) {
      out.push({
        q: `At ${app.company}, this role will ${lowerFirst(trimDot(r))}. Tell me about a time you did something like that — what was the outcome?`,
        dim: 'impact',
      });
    }
    for (const m of an.mustHaves.slice(0, 1)) {
      if (m.startsWith('(')) continue;
      out.push({ q: `This role requires: "${trimDot(m)}". Walk me through your strongest real example of that.`, dim: 'structure' });
    }
  } else if (mode === 'technical') {
    const k = an.keywords.find((x) => x.length > 2);
    if (k) out.push({ q: `Walk me through a hard problem you solved with ${k}: your approach, its complexity, and the edge cases you handled.`, dim: 'approach' });
  } else {
    out.push({ q: `Design the core system a ${app.role} at ${app.company} would own. Start with requirements and a scale estimate.`, dim: 'requirements' });
  }
  return out;
}

/** Next question: company-specific first, then ones that target known weaknesses. */
export function pickQuestion(
  mode: InterviewMode,
  asked: string[],
  weakDims: string[],
  app: Application | null,
): { q: string; dim: string } | null {
  const generated = generateQuestions(mode, app).filter((c) => !asked.includes(c.q));
  if (generated.length && asked.length < 2) return generated[0];
  const pool = [...generated, ...BANK[mode]].filter((c) => !asked.includes(c.q));
  if (!pool.length) return null;
  return pool.find((c) => weakDims.includes(c.dim)) ?? pool[0];
}

// ─── Scoring (deterministic rubric heuristics; the live driver uses the model) ──

export function scoreAnswer(mode: InterviewMode, _dimension: string, answer: string): AnswerScore {
  const a = answer.toLowerCase();
  const words = countWords(answer);
  const has = (re: RegExp) => re.test(a);
  const n = (re: RegExp) => countRe(a, re);
  const clamp = (x: number) => Math.max(1, Math.min(5, Math.round(x)));
  let dims: Record<string, number>;

  if (mode === 'behavioral') {
    const cues = [
      /\b(when|at the time|situation|context|while|during|last year|in my (previous|last) role)\b/,
      /\b(task|goal|responsible|needed to|had to|asked to|my job was)\b/,
      /\bi (built|led|designed|implemented|wrote|decided|proposed|created|migrated|refactored|coordinated|fixed|took|owned|set up|introduced|negotiated|profiled|shipped)\b/,
      /\b(result|outcome|impact|led to|which (reduced|increased|cut|improved|saved)|so that|as a result|in the end)\b/,
    ];
    const iC = n(/\bi\b/g);
    const weC = n(/\bwe\b/g);
    const ratio = iC / (iC + weC || 1);
    const nums = n(/\d+(\.\d+)?\s*(%|percent|x\b|ms\b|k\b|m\b|million|thousand|users|customers|requests|hours|days|weeks)|\$\s?\d+|\d+%/g);
    dims = {
      structure: clamp(1 + cues.filter(has).length),
      ownership: iC === 0 ? 1 : ratio >= 0.7 ? 5 : ratio >= 0.5 ? 4 : ratio >= 0.3 ? 3 : 2,
      impact: nums >= 2 ? 5 : nums === 1 ? 4 : has(/\b(result|outcome|impact|reduced|increased|improved|cut|saved|grew)\b/) ? 3 : 2,
      reflection: has(/\b(learned|lesson|would do differently|next time|in hindsight|takeaway|realized|i'?d change)\b/) ? 5 : has(/\b(because|so i)\b/) ? 3 : 2,
      concision: words < 40 ? 2 : words <= 260 ? 5 : words <= 400 ? 4 : words <= 600 ? 3 : 2,
    };
  } else if (mode === 'technical') {
    const patterns = n(/\b(hash ?map|hash ?set|dictionary|two[- ]pointers?|sliding window|binary search|bfs|dfs|breadth[- ]first|depth[- ]first|dynamic programming|dp\b|memoi[sz]|heap|priority queue|stack|queue|union[- ]find|trie|greedy|sort(ing)?|recursion|recursive|backtrack|linked list|fast and slow|floyd|topological)\b/g);
    const bigO = n(/o\(/g);
    const edges = n(/\b(edge case|empty|null|none|single element|duplicate|negative|overflow|zero|large input|boundary)\b/g);
    const steps = n(/\b(first|then|next|finally|step|after that)\b/g);
    dims = {
      approach: patterns >= 2 ? 5 : patterns === 1 ? 4 : 2,
      complexity: bigO >= 2 ? 5 : bigO === 1 ? 4 : has(/\b(linear|quadratic|logarithmic|constant time|n log n)\b/) ? 3 : 1,
      edge_cases: edges >= 3 ? 5 : edges === 2 ? 4 : edges === 1 ? 3 : 1,
      correctness: has(/\b(for example|e\.g\.|walk through|trace|invariant|proof|why it works|guarantee)\b/) ? 5 : words > 80 ? 3 : 2,
      communication: steps >= 3 ? 5 : steps === 2 ? 4 : steps === 1 ? 3 : 2,
    };
  } else {
    const req = n(/\b(requirement|functional|non-functional|scale|users|latency|availability|consistency|durability|throughput|sla)\b/g);
    const est = n(/\b\d+[kmb]?\s*(qps|rps|requests|users|gb|tb|pb|ms|per second|per day|writes|reads)\b/g);
    const comp = n(/\b(api|gateway|service|microservice|database|db\b|postgres|mysql|cassandra|dynamo|cache|redis|queue|kafka|pub\/?sub|load balancer|cdn|shard|partition|replica|index|object storage|s3)\b/g);
    const trade = n(/\b(trade-?off|versus|vs\.?|instead of|at the cost of|because|however|downside|alternatively)\b/g);
    const bott = n(/\b(bottleneck|hot ?spot|single point of failure|spof|failover|retry|backpressure|rate limit|circuit breaker|replicat|scal(e|ing) out|horizontal)\b/g);
    dims = {
      requirements: req >= 4 ? 5 : req >= 2 ? 4 : req >= 1 ? 3 : 1,
      estimation: est >= 3 ? 5 : est === 2 ? 4 : est === 1 ? 3 : 1,
      design: comp >= 6 ? 5 : comp >= 4 ? 4 : comp >= 2 ? 3 : 1,
      tradeoffs: trade >= 3 ? 5 : trade === 2 ? 4 : trade === 1 ? 3 : 1,
      bottlenecks: bott >= 3 ? 5 : bott === 2 ? 4 : bott === 1 ? 3 : 1,
    };
  }

  if (words < 15) for (const k of Object.keys(dims)) dims[k] = Math.min(dims[k], 2);
  const vals = Object.values(dims);
  const overall = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
  const weakest = Object.entries(dims).sort((x, y) => x[1] - y[1])[0][0];
  const spec = DIMENSIONS[mode].find((d) => d.key === weakest)!;
  const fix =
    words < 15
      ? 'Give a fuller answer — aim for ~90 seconds spoken: the situation, what you did, and the measurable result.'
      : overall >= 4.5
        ? `Strong answer — this is the pattern to repeat. If anything, tighten "${spec.label.toLowerCase()}" a touch more.`
        : spec.fix;
  return { dims, overall, fix };
}

// ─── Spaced repetition (SM-2-lite) ──────────────────────────────────────────

export function nextSchedule(prev: { intervalDays: number; ease: number; reps: number } | null, score: number) {
  let { intervalDays, ease, reps } = prev ?? { intervalDays: 0, ease: 2.3, reps: 0 };
  if (score >= 4) {
    reps += 1;
    intervalDays = reps === 1 ? 1 : reps === 2 ? 3 : Math.max(1, Math.round(intervalDays * ease));
    ease = Math.min(2.8, ease + 0.1);
  } else if (score >= 3) {
    intervalDays = Math.max(1, Math.round((intervalDays || 1) * 0.7));
    ease = Math.max(1.3, ease - 0.05);
  } else {
    reps = 0;
    intervalDays = 1;
    ease = Math.max(1.3, ease - 0.2);
  }
  const dueAt = new Date(Date.now() + intervalDays * 86_400_000).toISOString();
  return { intervalDays, ease, reps, dueAt };
}

/** Weak answers (≤ 3.5) become drills; strong ones don't need repetition yet. */
export function scheduleDrill(input: {
  question: string;
  dimension: string;
  mode: InterviewMode;
  applicationId: string | null;
  score: number;
}): Drill | null {
  if (input.score > 3.5) return null;
  const s = nextSchedule(null, input.score);
  return createDrill({
    question: input.question,
    dimension: input.dimension,
    mode: input.mode,
    applicationId: input.applicationId,
    dueAt: s.dueAt,
    intervalDays: s.intervalDays,
    ease: s.ease,
    reps: s.reps,
    lastScore: input.score,
  });
}

/** Score a drill answer with the rubric heuristics and reschedule it. */
export function answerDrill(drillId: string, answer: string): { score: AnswerScore; drill: Drill } | null {
  const d = getDrill(drillId);
  if (!d) return null;
  const score = scoreAnswer(d.mode, d.dimension, answer);
  const s = nextSchedule({ intervalDays: d.intervalDays, ease: d.ease, reps: d.reps }, score.overall);
  const drill = rescheduleDrill(d.id, { ...s, lastScore: score.overall })!;
  return { score, drill };
}

/** Reschedule a drill from a score the model (or user) already produced. */
export function recordDrillResult(drillId: string, overall: number): Drill | null {
  const d = getDrill(drillId);
  if (!d) return null;
  const s = nextSchedule({ intervalDays: d.intervalDays, ease: d.ease, reps: d.reps }, overall);
  return rescheduleDrill(d.id, { ...s, lastScore: overall });
}

// ─── Session wrap-up: weaknesses → memory, summary ──────────────────────────

export function deriveWeaknesses(
  mode: InterviewMode,
  turns: InterviewTurn[],
): { dimension: string; label: string; avg: number; count: number; content: string }[] {
  const sums = new Map<string, { s: number; c: number }>();
  for (const t of turns) {
    if (!t.score) continue;
    for (const [k, v] of Object.entries(t.score.dims)) {
      const cur = sums.get(k) ?? { s: 0, c: 0 };
      sums.set(k, { s: cur.s + v, c: cur.c + 1 });
    }
  }
  const out: { dimension: string; label: string; avg: number; count: number; content: string }[] = [];
  for (const [k, { s, c }] of sums) {
    if (c < 2) continue;
    const avg = Math.round((s / c) * 10) / 10;
    if (avg >= 3) continue;
    const spec = DIMENSIONS[mode].find((d) => d.key === k);
    if (!spec) continue;
    out.push({
      dimension: k,
      label: spec.label,
      avg,
      count: c,
      content: `${MODE_LABEL[mode]} answers: "${spec.label}" is a recurring weak spot (avg ${avg}/5 over ${c} answers) — ${spec.fix}`,
    });
  }
  return out.sort((a, b) => a.avg - b.avg);
}

export function sessionSummary(mode: InterviewMode, scored: InterviewTurn[], weaknesses: number, drills: number): string {
  if (!scored.length) return 'Session ended before any answers were scored.';
  const avg = Math.round((scored.reduce((s, t) => s + (t.score?.overall ?? 0), 0) / scored.length) * 10) / 10;
  const totals = new Map<string, number>();
  for (const t of scored) for (const [k, v] of Object.entries(t.score!.dims)) totals.set(k, (totals.get(k) ?? 0) + v);
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const strong = DIM_LABEL[ranked[0]?.[0]] ?? '—';
  const weak = DIM_LABEL[ranked[ranked.length - 1]?.[0]] ?? '—';
  return `${scored.length} answer(s) scored · average ${avg}/5 · strongest: ${strong} · weakest: ${weak}. ${weaknesses} weakness(es) proposed to Memory · ${drills} drill(s) scheduled for spaced repetition.`;
}

/** Finish a session: propose recurring weaknesses to memory, write the summary. */
export function completeSession(sessionId: string, ctx?: RunContext): string {
  const session = getInterviewSession(sessionId);
  if (!session) throw new Error('session not found');
  if (session.status === 'done') return session.summary ?? '';
  const scored = listInterviewTurns(sessionId).filter((t) => t.score);
  const weaknesses = deriveWeaknesses(session.mode, scored);
  for (const w of weaknesses) {
    const note = proposeMemory({
      kind: 'weakness',
      content: w.content,
      scope: `stage:${session.mode}`,
      tags: [w.dimension],
      confidence: 0.5,
      sourceRunId: session.runId,
      evidence: [`mock interview ${sessionId}: ${w.label} averaged ${w.avg}/5 over ${w.count} answers`],
      status: 'proposed',
    });
    ctx?.emit({ type: 'memory_proposed', note });
  }
  const summary = sessionSummary(session.mode, scored, weaknesses.length, countDrillsSince(session.startedAt));
  // Next steps come from every dimension's average (not just the recurring weaknesses) and the job's stack.
  const app = session.applicationId ? getApplication(session.applicationId) : null;
  const recommendations = scored.length ? recommend({ mode: session.mode, dims: dimensionResults(session.mode, scored), app, profile: groundTruth() }) : [];
  finishInterviewSession(sessionId, summary, recommendations);
  return summary;
}

/** Each rubric dimension's average over the scored answers, with its label and fix. */
export function dimensionResults(mode: InterviewMode, turns: InterviewTurn[]): DimResult[] {
  const sums = new Map<string, { s: number; c: number }>();
  for (const t of turns) {
    for (const [k, v] of Object.entries(t.score?.dims ?? {})) {
      const cur = sums.get(k) ?? { s: 0, c: 0 };
      sums.set(k, { s: cur.s + v, c: cur.c + 1 });
    }
  }
  return DIMENSIONS[mode]
    .filter((d) => sums.has(d.key))
    .map((d) => {
      const { s, c } = sums.get(d.key)!;
      return { key: d.key, label: d.label, avg: Math.round((s / c) * 10) / 10, fix: d.fix };
    });
}

// ─── Prep pack ──────────────────────────────────────────────────────────────

// Everything in the pack comes from two documents the candidate can actually read: their own profile
// and this posting. Nothing asks how the company builds or "would solve" anything — that is
// speculation the candidate can't prepare for, and interviewers rarely ask it.
export function buildPrepPack(app: Application, profile: string, weaknesses: MemoryNote[]): string {
  const an = app.analysis;
  const prof = profile.toLowerCase();
  const must = an?.mustHaves.filter((m) => !m.startsWith('(')) ?? [];
  const evidence = must.map((m) => {
    const hit = findEvidence(profile, m);
    return `- **${trimDot(m)}** → ${hit ? `_${hit.slice(0, 140)}_` : '[fill in: your real example, with a number]'}`;
  });
  const behavioral = generateQuestions('behavioral', app).map((q) => `- ${q.q}`);

  // Topics: every technology or practice the posting names, split by whether the profile already shows it.
  // Links only where a chapter or page exists for the topic — never a wall of resources.
  const own = `${app.company} ${app.role}`.toLowerCase();
  const shown = new Map((an?.keywords ?? []).map((k) => [k.toLowerCase().trim(), k.trim()])); // keep the posting's casing
  const kws = [...shown.keys()].filter((k) => k.length > 2 && !own.includes(k));
  // The interview framework is advice, not a topic to revise — it gets its own line under system design.
  const plan = studyPlan(app, profile).filter((p) => p.topic.key !== 'framework');
  const covered = new Set(plan.flatMap((p) => p.terms));
  const loose = kws.filter((k) => !covered.has(k) && k.length > 3 && !STOP.has(k) && !GENERIC.has(k));
  const quote = (k: string) => {
    const line = findEvidence(profile, k);
    return line ? ` — you wrote: _${line.slice(0, 120)}_` : '';
  };
  // Topic lines name the topic; the links live once, in "Read before the day" (at most six).
  const topicLine = (p: TopicHit) =>
    `- **${p.topic.label}** (${p.terms.slice(0, 3).join(', ')})${p.known ? quote(p.terms[0]) : ' — not in your profile; the reading list below has the chapter or page'}`;
  const revise = [...plan.filter((p) => p.known).map(topicLine), ...loose.filter((k) => prof.includes(k)).map((k) => `- **${shown.get(k)}**${quote(k)}`)];
  const learn = [
    ...plan.filter((p) => !p.known).map(topicLine),
    ...loose.filter((k) => !prof.includes(k)).map((k) => `- **${shown.get(k)}** — not in your profile; learn the basics, and if asked say so and how you'd ramp up`),
  ];

  // Technical questions are about what the candidate's own CV says they did — never about the company's systems.
  const technical = kws
    .filter((k) => prof.includes(k) && !STOP.has(k) && !GENERIC.has(k))
    .slice(0, 4)
    .map((k) => {
      const line = findEvidence(profile, k);
      return `- Explain how you used **${shown.get(k)}**${line ? ` — your CV says "_${line.slice(0, 100)}_"` : ''}: the problem, the alternative you rejected, and what you'd do differently now.`;
    });

  // System design only when the role calls for it, as the classic exercises that match this stack.
  const designHits = plan.filter((p) => p.topic.domain === 'system_design' && exerciseFor(p.topic));
  const senior = /\b(senior|staff|principal|lead|architect|platform)\b/i.test(`${app.role} ${an?.seniority ?? ''}`);
  const design =
    designHits.length || senior
      ? [
          `- Walk the four steps aloud every time — scope → high-level design → deep dive → wrap up ([Arch Blueprint: interview framework](${ARCH_BLUEPRINT}#framework)).`,
          ...designHits
            .slice(0, 2)
            .map((p) => `- **${exerciseFor(p.topic)}** — the posting names ${p.terms.slice(0, 2).join(', ')}. Read first: [${p.topic.resources[0].title}](${p.topic.resources[0].url}).`),
          ...(designHits.length ? [] : [`- Design a URL shortener, then a rate limiter — the two classics ([Arch Blueprint](${ARCH_BLUEPRINT}#url-shortener)).`]),
        ]
      : [];

  const path = learningPath(app, plan);
  const study = [...new Map(plan.flatMap((p) => p.topic.resources).map((r) => [r.url, r])).values()].slice(0, 6).map((r) => `- [${r.source}: ${r.title}](${r.url})`);
  if (path) study.push(`- Track for this level: [${path.source}: ${path.title}](${path.url})`);

  // Lines with a real figure — not the contact line, not a role's date range.
  const stories = profile
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 30 && hasMetric(l) && !isContactLine(l) && !isRoleLine(l) && !isHeadingLine(l))
    .slice(0, 5)
    .map((l) => `- ${l.replace(/^[-•*]\s*/, '')}`);
  const watch = weaknesses.length ? weaknesses.map((w) => `- ${w.content}`) : ['- No recorded weaknesses yet — run a mock interview to find them.'];

  return `# Interview prep — ${app.role} @ ${app.company}

> Prep **before** the interview. Everything here comes from your own profile and this posting — not from guesses about how ${app.company} builds its systems. Nothing here is for use *during* a live interview.

## The role in one glance
${an?.fitRationale ? `- Fit: **${an.fitScore ?? '?'}/100** — ${an.fitRationale}` : '- Run a tailor pass first for a fit analysis.'}
${an?.redFlags.length ? `- Watch-outs in the posting: ${an.redFlags.map(trimDot).join('; ')}` : ''}
${prof ? '' : '- ⚠️ No profile on file — add your resume in Settings so this pack can map requirements to *your* evidence.'}

## Topics to revise
**You've done this — brush up and have one example ready**
${revise.join('\n') || '- Nothing the posting names shows up in your profile yet — see below.'}

**Not in your profile — learn the basics, and be upfront if asked**
${learn.join('\n') || '- Nothing missing: every topic the posting names appears in your profile.'}

## Must-haves → your evidence
${evidence.join('\n') || '- (no must-haves extracted)'}

## Likely questions
**Behavioral — from the posting's own responsibilities**
${behavioral.join('\n') || '- Tell me about your most impactful project. How did you measure it?'}

**Technical — about what you've actually done**
${technical.join('\n') || '- Walk through the hardest problem you solved recently: the approach, its complexity, the edge cases.'}
${design.length ? `\n**System design — classic exercises matched to this stack**\n${design.join('\n')}` : ''}

## Stories to have ready (from your profile — the lines with numbers)
${stories.join('\n') || '- [fill in: 4–6 real STAR stories, each with a measurable result]'}

## Your known weak spots — rehearse these
${watch.join('\n')}
${study.length ? `\n## Read before the day\n${study.join('\n')}\n` : ''}
## Before the day
- Re-read the posting and your submitted resume — the interviewer has the same two documents.
- Prepare 3 questions for them (team, success metrics for the role, biggest current challenge).
- Run one more mock interview in Callback targeting your weakest dimension.
`;
}

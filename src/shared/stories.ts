// ─── Story guide ─────────────────────────────────────────────────────────────
// What makes an experience usable in a resume, a cover letter AND an interview:
// a concrete situation, what YOU did, and a result with a number. Shared by the
// dashboard's story form and the Claude Code /callback:story skill so both ask
// the same questions a recruiter would. Field-neutral on purpose.

export interface StoryType {
  key: string;
  label: string;
  /** One-line nudge shown under the type picker. */
  hint: string;
  situation: string;
  action: string;
  result: string;
}

export const STORY_TYPES: StoryType[] = [
  {
    key: 'improved',
    label: 'Made something faster, cheaper or better',
    hint: 'Performance, cost, quality, a process that used to hurt.',
    situation: 'What was slow, expensive or painful — and who felt it?',
    action: 'What did you change? Name the approach and the tools.',
    result: 'Before → after, with a number: time, cost, error rate, % improvement.',
  },
  {
    key: 'built',
    label: 'Built or launched something new',
    hint: 'A product, feature, platform, tool, service or programme.',
    situation: 'What was missing, and why did it matter now?',
    action: 'What did you design or build yourself, and what did you decide not to do?',
    result: 'Who uses it and how much: users, teams, revenue, adoption, time saved.',
  },
  {
    key: 'fixed',
    label: 'Solved a hard problem or a crisis',
    hint: 'An outage, escalation, bug, complaint or deadline at risk.',
    situation: 'What broke, how bad was it, and how was it noticed?',
    action: 'How did you find the real cause, and what did you do about it?',
    result: 'What changed afterwards — and did it ever come back? Numbers if you have them.',
  },
  {
    key: 'changed',
    label: 'Led a change or migration',
    hint: 'Moving systems, tools, processes or teams from A to B.',
    situation: 'From what to what, at what scale, and why?',
    action: 'What did you own: the plan, the rollout, the people, the rollback?',
    result: 'Scale and outcome: how many systems/people moved, downtime, timeline, savings.',
  },
  {
    key: 'led',
    label: 'Led, grew or mentored people',
    hint: 'Leading a team, hiring, coaching, raising the bar.',
    situation: 'Who were the people and what did they need?',
    action: 'What did you do — concretely — as the leader or mentor?',
    result: 'How did they or the team change: promotions, delivery, retention, skills.',
  },
  {
    key: 'won',
    label: 'Won over a customer, stakeholder or deal',
    hint: 'Persuading, negotiating, recovering a relationship.',
    situation: 'Who needed convincing, and what was at stake?',
    action: 'What did you do or show that changed their mind?',
    result: 'The outcome: deal size, renewal, approval, budget, satisfaction score.',
  },
  {
    key: 'shared',
    label: 'Shared what you know',
    hint: 'Talks, writing, teaching, open source, community.',
    situation: 'What did you share, with whom, and why?',
    action: 'What did you create or organise yourself?',
    result: 'Reach and effect: audience, attendees, stars, readers, people who used it.',
  },
  {
    key: 'other',
    label: 'Something else you’re proud of',
    hint: 'Anything a recruiter should hear about.',
    situation: 'What was the situation?',
    action: 'What did you do?',
    result: 'What happened because of it — with a number if you have one?',
  },
];

/** What turns an anecdote into evidence — shown next to the story form. */
export const STORY_TIPS = [
  'One story, one outcome. Split it if it has two.',
  'Say what YOU did, not what “we” did.',
  'A number makes it checkable: scale, %, time, money, people.',
  'Recent beats old: the last 3–5 years carry the most weight.',
  'Write it the way it happened. Callback never adds a detail you didn’t give it.',
];

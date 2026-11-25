// ─── Reading a job description by section (offline, deterministic) ─────────
// Postings are written in sections — what you'll do, who you are, nice to
// have, what we offer. The offline analyzer used to treat every line with
// "strong" or "years" in it as a must-have, which turned marketing copy ("We
// have notable customers like…") into requirements. This reads the headings
// first: must-haves come only from the requirements part, responsibilities
// from the role part, and the about-us / benefits / process parts are ignored.
// Keywords are real skills and tools from a vocabulary, not word counts.

/** What a heading introduces. Order matters: the most specific first. */
const SECTION_RULES: [Section, RegExp][] = [
  ['skip', /\b(shouldn'?t apply|should not apply|not (?:be )?a (?:good )?fit|not for you)\b/i],
  ['nice', /\b(nice[- ]to[- ]have|bonus|plus(?:es)?\b|preferred|fantastic if|would be (?:great|nice|a plus)|extra credit|even better|great if|ideally)/i],
  ['requirements', /\b(requirements?|qualifications?|who you are|about you|you have|you bring|what you bring|great fit|looking for|what we look for|what you(?:'|’)?ll need|you need|must[- ]haves?|your profile|ideal candidate|should apply if|might be a fit|you are\b|your skills|skills|experience)\b/i],
  ['responsibilities', /\b(what you(?:'|’)?ll do|what you will do|responsibilit|your impact|the role|your role|day[- ]to[- ]day|in this role|your mission|tasks|you will\b|what you(?:'|’)?ll work on|the job|about the (?:role|job|position))/i],
  ['stack', /\b(tech(?:nology)? stack|our stack|tools we use|technologies|stack)\b/i],
  ['skip', /\b(benefits?|we offer|perks|about us|who we are|life at|interview|privacy|diversity|equal|culture|why (?:join|work)|compensation|salary|work[- ]life|job details|we welcome|first (?:\w+ )?(?:days|months)|what we(?:'|’)?re building|our mission|our story|how we work|join us|apply now)/i],
];

export type Section = 'requirements' | 'responsibilities' | 'nice' | 'stack' | 'skip' | 'intro';

export interface JdParts {
  mustHaves: string[];
  niceToHaves: string[];
  responsibilities: string[];
  /** Skills and tools the posting names, most-mentioned first, as the posting spells them. */
  keywords: string[];
  /** Whether the posting had headings we could read. */
  sectioned: boolean;
}

const BULLET = /^\s*(?:[•·▪●◦*–—-]|\d+[.)])\s+/;

/** A short line with no sentence ending that isn't a bullet — "What you'll do", "REQUIREMENTS:". */
function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || BULLET.test(t)) return false;
  if (/:$/.test(t)) return t.length <= 240; // "…the job isn't for everyone! You should not apply if:"
  if (t.length > 80 || /[.!?;,]$/.test(t)) return false;
  return t.split(/\s+/).length <= 9;
}

/** The part of a heading that names the section: its last clause ("…tastes! You should not apply if:"). */
const headingText = (t: string) => t.replace(/:$/, '').split(/(?<=[.!?])\s+/).pop() ?? t;

function classify(heading: string): Section | null {
  for (const [s, re] of SECTION_RULES) if (re.test(heading)) return s;
  return null;
}

const clean = (s: string) =>
  s
    .replace(BULLET, '')
    .replace(/^[•·▪●◦\s-]+/, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** A requirement worth quoting back: a sentence about the candidate, not a paragraph about the company. */
const usable = (s: string) => s.length >= 12 && s.length <= 320 && !/^(we|our|at \w+,? we|hi\b|hello\b)/i.test(s) && !/[👋🥵😅]/u.test(s);

// ─── Skills vocabulary ──────────────────────────────────────────────────────
// Display name → pattern. Word-bounded; the posting's casing never matters.
const SKILLS: [string, RegExp][] = (
  [
    ['Kubernetes', /kubernetes|k8s/],
    ['Docker', /docker/],
    ['Helm', /helm/],
    ['Terraform', /terraform|terragrunt|opentofu/],
    ['Pulumi', /pulumi/],
    ['Ansible', /ansible/],
    ['AWS', /aws|amazon web services/],
    ['GCP', /gcp|google cloud/],
    ['Azure', /azure/],
    ['Linux', /linux/],
    ['CI/CD', /ci\s*\/\s*cd|continuous (?:integration|delivery|deployment)/],
    ['GitHub Actions', /github actions/],
    ['GitLab CI', /gitlab(?: ci)?/],
    ['Jenkins', /jenkins/],
    ['Argo CD', /argo ?cd/],
    ['GitOps', /gitops/],
    ['Infrastructure as code', /infrastructure[- ]as[- ]code|\biac\b/],
    ['Prometheus', /prometheus/],
    ['Grafana', /grafana/],
    ['Datadog', /datadog/],
    ['OpenTelemetry', /opentelemetry|otel/],
    ['Observability', /observability/],
    ['SLOs', /slos?|slis?|error budgets?/],
    ['On-call', /on[- ]call/],
    ['Incident response', /incident (?:response|management)|postmortems?/],
    ['SRE', /site reliability|\bsre\b/],
    ['Platform engineering', /platform engineer/],
    ['Python', /python/],
    ['Go', /golang|\bgo\b(?= ?[,/)]| (?:or|and)\b)/],
    ['Java', /java(?!script)/],
    ['Kotlin', /kotlin/],
    ['Rust', /rust/],
    ['Ruby', /ruby|rails/],
    ['TypeScript', /typescript/],
    ['JavaScript', /javascript/],
    ['Node.js', /node\.?js/],
    ['React', /react(?! native)/],
    ['C#', /c#|\.net/],
    ['C++', /c\+\+/],
    ['Bash', /bash|shell scripting/],
    ['SQL', /\bsql\b/],
    ['PostgreSQL', /postgres(?:ql)?/],
    ['MySQL', /mysql/],
    ['Redis', /redis/],
    ['Kafka', /kafka/],
    ['Elasticsearch', /elasticsearch|opensearch/],
    ['Snowflake', /snowflake(?= data|,|\s+(?:or|and)\b)/],
    ['Event-driven architecture', /event[- ]driven/],
    ['Microservices', /micro-?services/],
    ['Distributed systems', /distributed systems?/],
    ['Networking', /networking|tcp\/ip|\bdns\b/],
    ['Security', /security|devsecops/],
    ['Data warehouse', /data warehouse/],
    ['Canary deploys', /canary|feature flags?|gradual rollouts?/],
    ['Machine learning', /machine learning|\bml\b|mlops/],
    ['LLMs', /\bllms?\b|large language models?|genai|generative ai/],
    ['Mentoring', /mentor/],
    ['System design', /system design|architect(?:ure|ing)/],
  ] as [string, RegExp][]
).map(([name, re]) => [name, new RegExp(`(?<![a-z0-9])(?:${re.source})(?![a-z0-9])`, 'i')]);

/** The skills a text names, as display names, most-mentioned first. */
export function skillsIn(text: string): string[] {
  const hits: [string, number][] = [];
  for (const [name, re] of SKILLS) {
    const n = (text.match(new RegExp(re.source, 'gi')) ?? []).length;
    if (n) hits.push([name, n]);
  }
  return hits.sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

export function parseJd(text: string, company = ''): JdParts {
  const raw = text.split(/\r?\n/).flatMap((l) => (/•/.test(l) && !BULLET.test(l) ? l.split(/\s*•\s*/) : [l]));
  const buckets: Record<Section, string[]> = { requirements: [], responsibilities: [], nice: [], stack: [], skip: [], intro: [] };
  let current: Section = 'intro';
  let sectioned = false;
  for (const line of raw) {
    const t = line.trim();
    if (!t) continue;
    if (isHeading(t)) {
      const s = classify(headingText(t));
      if (s) {
        current = s;
        sectioned = true;
        continue;
      }
      // An unrecognised heading inside a section ("Your responsibilities include:") keeps the section.
      if (current === 'intro' || current === 'skip') continue;
    }
    buckets[current].push(t);
  }

  const items = (s: Section) => [...new Set(buckets[s].map(clean).filter(usable))];
  let mustHaves = items('requirements');
  let responsibilities = items('responsibilities');
  const niceToHaves = items('nice');

  // No headings we know: fall back to bullets that read like requirements — never company prose.
  if (!mustHaves.length) {
    const lines = raw.map(clean).filter(usable);
    mustHaves = lines.filter((l) => /\b(required|must|years|proficien|experience (?:with|in)|hands-on|knowledge of|familiar)\b/i.test(l)).slice(0, 8);
    if (!responsibilities.length) responsibilities = lines.filter((l) => /^(build|design|lead|own|develop|create|drive|collaborate|ship|improve|manage|deliver|define|partner|implement|optimi[sz]e|ensure|help)\b/i.test(l)).slice(0, 8);
  }
  // Skill-bearing requirements first: "5y+ with Kubernetes" says more than "You never stop."
  const weight = (s: string) => skillsIn(s).length * 2 + (/\b(years|y\+|experience|hands-on|proficien)/i.test(s) ? 1 : 0);
  mustHaves = mustHaves
    .map((s, i) => ({ s, i, w: weight(s) }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((x) => x.s)
    .slice(0, 8);

  // Keywords: skills named where the job is described (requirements, role, stack, nice-to-haves) —
  // or anywhere, when the posting had no usable sections.
  const focus = sectioned ? [...buckets.requirements, ...buckets.responsibilities, ...buckets.stack, ...buckets.nice].join('\n') : text;
  const own = company.toLowerCase();
  const keywords = skillsIn(focus.length > 200 ? focus : text).filter((k) => !own || !own.includes(k.toLowerCase())).slice(0, 15);

  return { mustHaves, niceToHaves: niceToHaves.slice(0, 6), responsibilities: responsibilities.slice(0, 8), keywords, sectioned };
}

// ─── Tailoring without rewording ────────────────────────────────────────────

/** Terms that make a resume line relevant to this job: its skills plus the real words of its must-haves. */
export function jobTerms(parts: { keywords: string[]; mustHaves: string[]; responsibilities: string[] }, extraStop: Set<string>): RegExp[] {
  const skillRes = SKILLS.filter(([n]) => parts.keywords.includes(n)).map(([, re]) => re);
  const words = [...parts.mustHaves, ...parts.responsibilities]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9+#-]+/)
    .filter((w) => w.length > 4 && !extraStop.has(w));
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const wordRes = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([w]) => new RegExp(`(?<![a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
  return [...skillRes, ...skillRes, ...wordRes]; // skills count double
}

const relevance = (line: string, terms: RegExp[]) => terms.reduce((n, re) => n + (re.test(line) ? 1 : 0), 0);

export interface Reordered {
  body: string;
  /** Roles whose bullets moved. */
  roles: number;
  /** Bullets that now sit higher than they did. */
  moved: number;
  /** The strongest-matching lines, for the editor note. */
  top: string[];
}

/** The same resume with each role's bullets ordered by how much this job asks for them, and each
 *  skills line leading with the skills it names. Every word stays the candidate's; only order changes. */
export function reorderForJob(body: string, terms: RegExp[], keywords: string[]): Reordered {
  const lines = body.split('\n');
  const out: string[] = [];
  let roles = 0;
  let moved = 0;
  const scored: { line: string; score: number }[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!/^- /.test(lines[i])) {
      out.push(skillsLine(lines[i], keywords));
      i++;
      continue;
    }
    const run: { line: string; score: number; at: number }[] = [];
    while (i < lines.length && /^- /.test(lines[i])) {
      run.push({ line: lines[i], score: relevance(lines[i], terms), at: run.length });
      i++;
    }
    const sorted = [...run].sort((a, b) => b.score - a.score || a.at - b.at);
    const up = sorted.filter((x, k) => k < x.at).length;
    if (up) {
      roles++;
      moved += up;
    }
    for (const x of sorted) {
      out.push(x.line);
      scored.push({ line: x.line, score: x.score });
    }
  }
  const top = scored
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.line.replace(/^- /, ''));
  return { body: out.join('\n'), roles, moved, top };
}

/** "AWS (EKS, RDS), Kubernetes" → ["AWS (EKS, RDS)", "Kubernetes"]: a comma inside brackets belongs to its
 *  item, so reordering never moves "Kubernetes" into AWS's parentheses (that would change a fact). */
export function topLevelItems(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** "**Cloud:** Azure, AWS, GCP" → the skills this job names first, the rest in their order. */
function skillsLine(line: string, keywords: string[]): string {
  const m = /^(\*\*[^*]{1,40}:\*\*\s*)(.+)$/.exec(line);
  if (!m || !keywords.length) return line;
  const items = topLevelItems(m[2]);
  if (items.length < 3) return line;
  const wanted = SKILLS.filter(([n]) => keywords.includes(n)).map(([, re]) => re);
  const hit = (s: string) => wanted.some((re) => re.test(s));
  const sorted = [...items.filter(hit), ...items.filter((s) => !hit(s))];
  return m[1] + sorted.join(', ');
}

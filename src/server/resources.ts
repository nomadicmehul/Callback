// ─── Study resources: what to read and build, matched to a posting or a mock ─
// A small static map from the things a posting or a rubric names to the chapter
// or page that teaches it, plus one project that proves it. A recommendation
// layer, not a dependency: nothing here is fetched, nothing breaks without it,
// and a candidate who ignores every link loses nothing else in Callback.
//
// Two sources, both open: Arch Blueprint for system design (16 chapters with
// anchors) and CloudCaptain for cloud, DevOps, platform engineering and SRE.

import type { Application, InterviewMode, Recommendation } from '@shared/types';

export const ARCH_BLUEPRINT = 'https://nomadicmehul.dev/arch-blueprint/';
export const CLOUDCAPTAIN = 'https://cloudcaptain.io';

export interface Resource {
  title: string;
  url: string;
  source: string;
}

export interface StudyTopic {
  key: string;
  label: string;
  domain: 'system_design' | 'cloud';
  /** What in a posting (or a profile) calls for this topic. Never /g — `.test` must stay stateless. */
  match: RegExp;
  resources: Resource[];
  /** One weekend-sized project that proves the topic, or null when reading is the point. */
  project: string | null;
}

const arch = (title: string, anchor: string): Resource => ({ title, url: `${ARCH_BLUEPRINT}#${anchor}`, source: 'Arch Blueprint' });
const captain = (title: string, path: string): Resource => ({ title, url: `${CLOUDCAPTAIN}${path}`, source: 'CloudCaptain' });

export const TOPICS: StudyTopic[] = [
  // ── System design (Arch Blueprint) ──────────────────────────────────────
  {
    key: 'framework',
    label: 'System design interviews — the four steps',
    domain: 'system_design',
    match: /\b(system design|software architect|solutions? architect|distributed systems?|technical design)/i,
    resources: [arch('Interview framework — scope → design → deep dive → wrap up', 'framework')],
    project: null,
  },
  {
    key: 'scaling',
    label: 'Scaling fundamentals — load balancing, replication, caching, CDN, sharding',
    domain: 'system_design',
    match: /\b(load[- ]balanc\w*|replica\w*|cach(?:e|ing)|cdn|shard\w*|horizontal(?:ly)? scal\w*|high[- ]availability|highly available|scalab\w*|low[- ]latency)/i,
    resources: [arch('Scaling fundamentals', 'scaling')],
    project: 'Put a cache and a load balancer in front of a small API, then measure p99 latency before and after under a load test.',
  },
  {
    key: 'estimation',
    label: 'Back-of-the-envelope estimation',
    domain: 'system_design',
    match: /\b(qps|requests? per second|throughput|capacity planning|latency budget|millions? of (?:users|requests|events|rows)|billions? of|petabyte|terabyte)/i,
    resources: [arch('Estimation techniques — QPS, storage, bandwidth, latency numbers', 'estimation')],
    project: 'Write a one-page capacity estimate (QPS, storage, bandwidth) for a system you have actually run, then check it against the real numbers.',
  },
  {
    key: 'rate-limiter',
    label: 'Rate limiting and API gateways',
    domain: 'system_design',
    match: /\b(rate[- ]limit\w*|throttl\w*|api gateway|quotas?|backpressure)/i,
    resources: [arch('Rate limiter — token bucket, sliding window, distributed with Redis', 'rate-limiter')],
    project: 'Build a token-bucket rate limiter as middleware, back it with Redis, and return the standard RateLimit headers.',
  },
  {
    key: 'consistent-hashing',
    label: 'Consistent hashing and partitioning',
    domain: 'system_design',
    match: /\b(consistent hashing|partition\w*|hash ring|distributed cach\w*|memcache\w*)/i,
    resources: [arch('Consistent hashing — hash ring, virtual nodes', 'consistent-hashing')],
    project: 'Implement consistent hashing with virtual nodes and plot how many keys move when one node joins or leaves.',
  },
  {
    key: 'kv-store',
    label: 'Key-value stores — CAP, replication, consistency',
    domain: 'system_design',
    match: /\b(key[- ]value|dynamodb|cassandra|redis|cap theorem|eventual(?:ly)? consisten\w*|nosql|quorum)/i,
    resources: [arch('Key-value store — CAP theorem, partitioning, replication', 'kv-store')],
    project: 'Write a replicated key-value store with quorum reads and writes, plus one test that partitions the network.',
  },
  {
    key: 'id-generator',
    label: 'Unique ID generation',
    domain: 'system_design',
    match: /\b(unique ids?|snowflake|uuids?|id generation|idempotency keys?)/i,
    resources: [arch('Unique ID generator — UUID, ticket servers, Snowflake', 'id-generator')],
    project: null,
  },
  {
    key: 'url-shortener',
    label: 'URL shortener — the classic read-heavy design',
    domain: 'system_design',
    match: /\b(url shortener|base62|redirect service|short links?)/i,
    resources: [arch('URL shortener', 'url-shortener')],
    project: 'Build a URL shortener end to end: capacity estimate first, Base62 IDs, a cache in front of reads, and a load test that proves the estimate.',
  },
  {
    key: 'web-crawler',
    label: 'Crawling and indexing pipelines',
    domain: 'system_design',
    match: /\b(crawl\w*|scrap\w*|indexing pipeline|url frontier)/i,
    resources: [arch('Web crawler — URL frontier, BFS, politeness, dedup', 'web-crawler')],
    project: 'Build a polite crawler for one site: a frontier queue, robots.txt, deduplication and a resume-after-crash path.',
  },
  {
    key: 'notifications',
    label: 'Queues, events and notification systems',
    domain: 'system_design',
    match: /\b(kafka|rabbitmq|sqs|sns|pub\/?sub|message (?:queue|broker)|event[- ]driven|event streaming|notifications?|webhooks?|dead[- ]letter)/i,
    resources: [arch('Notification system — multi-channel delivery, queues, retries', 'notifications')],
    project: 'Build a notification fan-out service on a queue with retries, idempotency keys and a dead-letter path — then replay the dead letters.',
  },
  {
    key: 'news-feed',
    label: 'Feeds and fan-out',
    domain: 'system_design',
    match: /\b(news ?feeds?|timelines?|fan[- ]?out|social (?:network|platform|graph))/i,
    resources: [arch('News feed — fan-out on write vs read, hybrid', 'news-feed')],
    project: null,
  },
  {
    key: 'chat-system',
    label: 'Real-time messaging and presence',
    domain: 'system_design',
    match: /\b(websockets?|real[- ]time|chat|presence|messaging platform|live updates?)/i,
    resources: [arch('Chat system — WebSocket, message sync, presence', 'chat-system')],
    project: 'Build a two-user chat over WebSockets with message ordering, offline delivery and a presence indicator.',
  },
  {
    key: 'autocomplete',
    label: 'Search and autocomplete',
    domain: 'system_design',
    match: /\b(autocomplete|typeahead|search (?:engine|infrastructure|platform)|elasticsearch|opensearch|solr|tries?\b)/i,
    resources: [arch('Search autocomplete — trie, top-K queries', 'autocomplete')],
    project: 'Build typeahead over a real word list with a trie and top-K ranking; measure latency at 1k, 100k and 1M entries.',
  },
  {
    key: 'video-platform',
    label: 'Media pipelines and streaming',
    domain: 'system_design',
    match: /\b(video|streaming platform|transcod\w*|hls|dash\b|media pipeline)/i,
    resources: [arch('Video platform — transcoding pipeline, adaptive streaming, CDN', 'video-platform')],
    project: null,
  },
  {
    key: 'cloud-storage',
    label: 'Object storage and file sync',
    domain: 'system_design',
    match: /\b(object storage|s3\b|blob storage|gcs\b|file sync|dedup\w*|block[- ]level)/i,
    resources: [arch('Cloud storage — block-level sync, deduplication, conflicts', 'cloud-storage')],
    project: null,
  },

  // ── Cloud, DevOps, platform engineering, SRE (CloudCaptain) ─────────────
  {
    key: 'kubernetes',
    label: 'Kubernetes',
    domain: 'cloud',
    match: /\b(kubernetes|k8s|helm|kustomize|eks|gke|aks|openshift|container orchestration|operators?\b)/i,
    resources: [captain('Kubernetes', '/docs/tools/kubernetes')],
    project: 'Stand up a small cluster (k3s or kind), deploy a service with Helm, add probes and an HPA, then kill a node and write down what happened.',
  },
  {
    key: 'docker',
    label: 'Containers',
    domain: 'cloud',
    match: /\b(docker|containers?|containeri[sz]\w*|oci\b|podman)/i,
    resources: [captain('Docker', '/docs/tools/docker')],
    project: null,
  },
  {
    key: 'terraform',
    label: 'Infrastructure as code',
    domain: 'cloud',
    match: /\b(terraform|opentofu|pulumi|iac\b|infrastructure[- ]as[- ]code|cloudformation|bicep|crossplane)/i,
    resources: [captain('Terraform', '/docs/tools/terraform')],
    project: 'Recreate one environment you know from scratch in Terraform — remote state, a plan step in CI, and a destroy you have actually run.',
  },
  {
    key: 'ansible',
    label: 'Configuration management',
    domain: 'cloud',
    match: /\b(ansible|puppet|chef|saltstack|configuration management)/i,
    resources: [captain('Ansible', '/docs/tools/ansible')],
    project: null,
  },
  {
    key: 'cicd',
    label: 'CI/CD and delivery pipelines',
    domain: 'cloud',
    match: /\b(ci\/?cd|continuous (?:integration|delivery|deployment)|github actions|gitlab ci|jenkins|argo ?cd|tekton|build pipelines?|deployment pipelines?|gitops)/i,
    resources: [captain('CI/CD', '/docs/tools/cicd')],
    project: 'Build a pipeline that tests, scans, builds and deploys a small service behind a manual gate — then add a one-command rollback.',
  },
  {
    key: 'aws',
    label: 'AWS',
    domain: 'cloud',
    match: /\b(aws|amazon web services|ec2|lambda|ecs|iam\b|cloudwatch|route ?53|rds\b)/i,
    resources: [captain('AWS', '/docs/cloud/aws')],
    project: null,
  },
  {
    key: 'azure',
    label: 'Azure',
    domain: 'cloud',
    match: /\b(azure|entra|azure devops|app service)/i,
    resources: [captain('Azure', '/docs/cloud/azure')],
    project: null,
  },
  {
    key: 'gcp',
    label: 'Google Cloud',
    domain: 'cloud',
    match: /\b(gcp|google cloud|bigquery|cloud run|pub\/?sub)/i,
    resources: [captain('Google Cloud', '/docs/cloud/gcp')],
    project: null,
  },
  {
    key: 'linux',
    label: 'Linux and networking',
    domain: 'cloud',
    match: /\b(linux|bash|shell scripting|systemd|tcp\/ip|dns\b|networking)/i,
    resources: [captain('Linux', '/docs/tools/linux')],
    project: null,
  },
  {
    key: 'devsecops',
    label: 'Security in the pipeline',
    domain: 'cloud',
    match: /\b(devsecops|security scanning|sast|dast|supply[- ]chain security|sbom|secrets management|vault\b|compliance|zero trust)/i,
    resources: [captain('DevSecOps', '/docs/tools/devsecops')],
    project: null,
  },
  {
    key: 'observability',
    label: 'Observability, SRE and incident response',
    domain: 'cloud',
    match: /\b(observab\w*|monitoring|prometheus|grafana|opentelemetry|datadog|logging|tracing|sre\b|site reliability|slos?\b|slis?\b|on[- ]call|incident (?:response|management)|postmortems?)/i,
    resources: [captain('Observability', '/docs/tools/observability')],
    project: 'Instrument a service with OpenTelemetry, define one SLO with an error budget, and write the alert that pages only when the budget is at risk.',
  },
  {
    key: 'platform',
    label: 'Platform engineering',
    domain: 'cloud',
    match: /\b(platform engineer\w*|internal developer platform|idp\b|backstage|golden paths?|developer experience|developer productivity)/i,
    resources: [captain('Cloud Architect track — platform engineering & SRE', '/docs/learning-paths/containers')],
    project: 'Build a golden path: one template that gives a new service a repo, a pipeline, a deployment and a dashboard in a single command.',
  },
  {
    key: 'mlops',
    label: 'ML and LLM operations',
    domain: 'cloud',
    match: /\b(mlops|ml ops|llmops|model serving|feature store|ml pipelines?|genai|generative ai|llms?\b|rag\b|vector (?:db|database|store))/i,
    resources: [captain('AI / ML Ops', '/docs/learning-paths/ai-ml')],
    project: null,
  },
];

/** The classic interview exercise for a system-design topic — what an interviewer actually says. */
const EXERCISE: Record<string, string> = {
  scaling: 'Design a read-heavy web service that has to survive 10× traffic growth',
  estimation: 'Estimate QPS, storage and bandwidth for a service you have run, then design it for 10×',
  'rate-limiter': 'Design a rate limiter for a public API',
  'consistent-hashing': 'Design a distributed cache that survives nodes joining and leaving',
  'kv-store': 'Design a distributed key-value store',
  'id-generator': 'Design a unique ID generator for a distributed system',
  'url-shortener': 'Design a URL shortener',
  'web-crawler': 'Design a web crawler',
  notifications: 'Design a notification system that delivers over email, push and SMS, with retries',
  'news-feed': 'Design a news feed',
  'chat-system': 'Design a chat system with presence',
  autocomplete: 'Design search autocomplete',
  'video-platform': 'Design a video upload and streaming platform',
  'cloud-storage': 'Design a file-sync service',
};
export const exerciseFor = (topic: StudyTopic): string | null => EXERCISE[topic.key] ?? null;

// ─── Matching ───────────────────────────────────────────────────────────────

export interface TopicHit {
  topic: StudyTopic;
  /** The posting's own words that called for it. */
  terms: string[];
  /** Whether the candidate's profile already shows it. */
  known: boolean;
}

const dedupe = <T>(xs: T[]) => [...new Set(xs)];

/** Topics a piece of text calls for — a posting, a free-text question, a profile. */
export function topicsIn(text: string): StudyTopic[] {
  return TOPICS.filter((t) => t.match.test(text));
}

/** The posting's topics, each with the words that triggered it and whether the profile shows it. */
export function studyPlan(app: Application | null, profile: string, extraText = ''): TopicHit[] {
  const kws = app?.analysis?.keywords ?? [];
  const text = [app?.role, app?.jdText, extraText].filter(Boolean).join('\n');
  if (!text.trim()) return [];
  const out: TopicHit[] = [];
  for (const topic of TOPICS) {
    const terms = dedupe(kws.filter((k) => topic.match.test(k)).map((k) => k.toLowerCase()));
    const m = terms.length ? null : topic.match.exec(text);
    if (!terms.length && !m) continue;
    out.push({ topic, terms: terms.length ? terms : [m![0].toLowerCase()], known: topic.match.test(profile) });
  }
  return out;
}

/** The CloudCaptain track that fits the role's level — only for roles that touch cloud/DevOps at all. */
export function learningPath(app: Application | null, plan = studyPlan(app, '')): Resource | null {
  if (!app || !plan.some((p) => p.topic.domain === 'cloud')) return null;
  const t = `${app.role} ${app.analysis?.seniority ?? ''}`;
  if (/\b(junior|entry|graduate|intern|associate|trainee)\b/i.test(t)) return captain('Foundation track (4–6 weeks)', '/docs/learning-paths/devops');
  if (/\b(senior|staff|principal|lead|architect|platform|sre)\b/i.test(t)) return captain('Cloud Architect track — platform engineering & SRE (12–16 weeks)', '/docs/learning-paths/containers');
  return captain('DevOps Engineer track (8–12 weeks)', '/docs/learning-paths/devops');
}

// ─── Recommendations after a mock interview ─────────────────────────────────

/** One rubric dimension's result, with its label and the fix the rubric prescribes. */
export interface DimResult {
  key: string;
  label: string;
  /** 1–5 average over the session's answers; null when an agent only names the weak keys (no number is printed then). */
  avg: number | null;
  fix: string;
}

/** The Arch Blueprint chapter that teaches each system-design dimension. */
const DESIGN_CHAPTER: Record<string, Resource> = {
  requirements: arch('Interview framework — scope → design → deep dive → wrap up', 'framework'),
  estimation: arch('Estimation techniques — QPS, storage, bandwidth, latency numbers', 'estimation'),
  design: arch('Scaling fundamentals — load balancers, replicas, caches, CDN, queues, sharding', 'scaling'),
  tradeoffs: arch('Key-value store — CAP theorem, partitioning, replication, consistency', 'kv-store'),
  bottlenecks: arch('Rate limiter — where systems break first and how to protect them', 'rate-limiter'),
};

/** What to actually do about a weak dimension — a habit, not a reading list. */
const PRACTICE: Record<string, string> = {
  structure: 'Rewrite your three best stories as four sentences each: the situation, the task, what you did, the result.',
  ownership: 'Go through your stories and swap every "we" for "I" where it really was you — and say separately what the team did.',
  impact: 'Find the number for each story — a %, a time, a cost, a user count. Where there is none, pick a different story.',
  reflection: 'Add one closing line to each story: what you learned, or what you would do differently.',
  concision: 'Record yourself answering one question in 90 seconds; cut everything that comes before the task.',
  approach: "Before any code, say the pattern out loud (hash map, two pointers, BFS, DP…). Today's weakest question is already scheduled as a drill — redo it tomorrow.",
  complexity: 'For every solution you write this week, state time and space complexity before you run it.',
  edge_cases: 'Keep one fixed checklist — empty, one element, duplicates, negatives, overflow — and run it aloud before you say "done".',
  correctness: 'Walk one small example through your solution step by step, every time, before you call it correct.',
  communication: 'Narrate the plan in numbered steps before touching the keyboard; ask someone to stop you whenever you go quiet.',
  requirements: 'Start every design with two minutes of questions: who uses it, how many, how fast, how consistent, what is out of scope.',
  estimation: 'Do one back-of-the-envelope estimate a day (QPS, storage, bandwidth) for a system you use.',
  design: 'Draw the same system three times from memory until the components and the data flow come without thinking.',
  tradeoffs: 'For each component you pick, finish the sentence "I chose X over Y because…" — out loud.',
  bottlenecks: 'For every design, name the first thing that breaks at 10× load and the single point of failure.',
};

/** The project to build when the posting itself suggests none. */
const DEFAULT_PROJECT: Record<InterviewMode, Recommendation> = {
  system_design: rec(
    'build',
    'Build a URL shortener end to end',
    'Capacity estimate first (QPS, storage, bandwidth), then Base62 IDs, a cache in front of reads, and a load test that proves the estimate.',
    arch('URL shortener', 'url-shortener'),
  ),
  technical: rec(
    'build',
    'Build an LRU cache and a token-bucket rate limiter from scratch',
    'With tests for empty, single-element and duplicate inputs — then explain each pattern aloud to someone.',
    arch('Rate limiter', 'rate-limiter'),
  ),
  behavioral: rec(
    'practice',
    'Write one project up as a STAR story in your experience bank',
    'The situation, what you did, the result with a number — then it is ready for every letter and every interview.',
    null,
  ),
};

function rec(kind: Recommendation['kind'], title: string, detail: string, resource: Resource | null): Recommendation {
  return { kind, title, detail, url: resource?.url ?? null, source: resource?.source ?? null };
}

const list = (xs: string[]) => xs.slice(0, 3).join(', ');

/** At most four next steps after a mock interview: what to read, what to build, what to practise —
 *  from the weakest dimensions and the posting's own stack. Never a wall of links. */
export function recommend(input: { mode: InterviewMode; dims: DimResult[]; app: Application | null; profile: string }): Recommendation[] {
  const { mode, app, profile } = input;
  // Weakest first; a dimension an agent named without a score counts as weak.
  const weak = [...input.dims].sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0)).filter((d) => d.avg == null || d.avg < 4);
  const weakest = weak[0] ?? null;
  const scored = (d: DimResult) => (d.avg != null ? ` averaged ${d.avg}/5` : '');
  const plan = studyPlan(app, profile);
  const cloud = plan.filter((p) => p.topic.domain === 'cloud');
  const design = plan.filter((p) => p.topic.domain === 'system_design');
  const out: Recommendation[] = [];

  // Read: the chapter for the weakest system-design dimension.
  if (mode === 'system_design' && weakest && DESIGN_CHAPTER[weakest.key]) {
    const r = DESIGN_CHAPTER[weakest.key];
    out.push(rec('read', `Read: ${r.title}`, `${weakest.label}${scored(weakest)} — ${weakest.fix}`, r));
  }

  // Build: a project the posting's stack suggests — preferring what the profile doesn't show yet.
  const pool = mode === 'system_design' ? [...design, ...cloud] : [...cloud, ...design];
  const withProject = pool.filter((p) => p.topic.project);
  const pick = withProject.find((p) => !p.known) ?? withProject[0] ?? null;
  if (pick) {
    out.push(
      rec(
        'build',
        `Build: ${pick.topic.label}`,
        `${pick.topic.project} The posting names ${list(pick.terms)}${pick.known ? '' : ' — not in your profile yet, so this becomes your real example'}.`,
        pick.topic.resources[0],
      ),
    );
  } else {
    out.push(DEFAULT_PROJECT[mode]);
  }

  // Practise: the one habit for the weakest dimension.
  if (weakest && PRACTICE[weakest.key]) {
    out.push(rec('practice', `Practise: ${weakest.label}`, `${weakest.avg != null ? `Averaged ${weakest.avg}/5. ` : ''}${PRACTICE[weakest.key]}`, null));
  }

  // Read: the posting's main cloud/DevOps page, and the track that fits the level.
  const page = cloud.find((p) => !p.known) ?? cloud[0] ?? null;
  if (page && !out.some((r) => r.url === page.topic.resources[0].url)) {
    const path = learningPath(app, plan);
    out.push(
      rec(
        'read',
        `Read: ${page.topic.label}`,
        page.known
          ? `The posting names ${list(page.terms)}; you have used it — refresh the parts you haven't touched lately.${path ? ` Track: ${path.title}.` : ''}`
          : `The posting names ${list(page.terms)} and your profile doesn't show it yet — learn the basics and be upfront about it when asked.${path ? ` Track: ${path.title}.` : ''}`,
        page.topic.resources[0],
      ),
    );
  }
  return out.slice(0, 4);
}

const ICON: Record<Recommendation['kind'], string> = { read: '📖', build: '🛠', practice: '🎯' };

/** Plain-text rendering for agents, the plugin and run summaries. */
export function recommendationsText(recs: Recommendation[]): string {
  if (!recs.length) return '';
  return ['Next steps:', ...recs.map((r) => `- ${ICON[r.kind]} ${r.title} — ${r.detail}${r.url ? ` (${r.source}: ${r.url})` : ''}`)].join('\n');
}

/** The study view of a posting for agents: each topic it names, whether the profile shows it, where to read. */
export function studyText(input: { app: Application | null; profile: string; topics?: string; dims?: DimResult[]; mode?: InterviewMode }): string {
  const { app, profile } = input;
  const plan = studyPlan(app, profile, input.topics ?? '');
  const lines: string[] = [];
  if (plan.length) {
    lines.push(app ? `Topics the ${app.role} @ ${app.company} posting names:` : 'Topics named:');
    for (const p of plan) {
      lines.push(`- ${p.known ? '✓ shown in the profile' : '○ not in the profile'} · ${p.topic.label} (${list(p.terms)}) → ${p.topic.resources.map((r) => `${r.source}: ${r.url}`).join('; ')}`);
    }
    const path = learningPath(app, plan);
    if (path) lines.push(`Learning track for this level: ${path.title} — ${path.url}`);
  } else {
    lines.push('No system-design or cloud/DevOps topics recognised — recommend from the candidate\'s own weak spots instead.');
  }
  if (input.mode) {
    const recs = recommend({ mode: input.mode, dims: input.dims ?? [], app, profile });
    if (recs.length) lines.push('', recommendationsText(recs));
  }
  lines.push('', 'Keep it short for the candidate: at most six links and one project. Say plainly which topics their profile does not show yet.');
  return lines.join('\n');
}

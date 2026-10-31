// ─── Shared types ──────────────────────────────────────────────────────────
// The single source of truth for data shapes crossing the server <-> dashboard
// boundary. Imported by both sides (the web app via the `@shared` alias).

/** Where an application sits in the funnel. */
export type ApplicationStatus =
  | 'saved' // captured, nothing drafted yet
  | 'drafting' // an agent run is tailoring materials
  | 'ready' // materials drafted + approved, awaiting your submit
  | 'applied' // you submitted it
  | 'screen' // recruiter / phone screen
  | 'interview' // one or more interview rounds
  | 'offer'
  | 'rejected'
  | 'ghosted'
  | 'withdrawn';

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'saved',
  'drafting',
  'ready',
  'applied',
  'screen',
  'interview',
  'offer',
  'rejected',
  'ghosted',
  'withdrawn',
];

/** Structured output of the jd-analyzer agent. */
export interface JdAnalysis {
  company: string | null;
  role: string | null;
  location: string | null;
  seniority: string | null;
  mustHaves: string[];
  niceToHaves: string[];
  keywords: string[];
  responsibilities: string[];
  redFlags: string[];
  /** 0–100 fit estimate, honest — gaps stay visible, never keyword-stuffed. */
  fitScore: number | null;
  fitRationale: string | null;
}

export interface Application {
  id: string;
  company: string;
  role: string;
  /** Where the job is, as the posting states it (e.g. "Berlin · Bonn +2 more", "Remote"). */
  location: string | null;
  jdUrl: string | null;
  jdText: string;
  status: ApplicationStatus;
  fitScore: number | null;
  analysis: JdAnalysis | null;
  /** What the posting guard removed from the JD (injection attempts, hidden text). */
  guardFlags: string[];
  /** What exists for THIS job: its own documents and its own interview history. */
  materials: ApplicationMaterials;
  createdAt: string;
  updatedAt: string;
}

/** Per-application checklist — every job carries its own resume, cover letter,
 *  prep pack, and mock-interview record, so nothing is shared or mixed up. */
export interface ApplicationMaterials {
  analysis: boolean;
  resume: boolean;
  coverLetter: boolean;
  prep: boolean;
  /** Mock-interview sessions linked to this application. */
  interviews: number;
  /** Average overall score across this application's scored answers. */
  avgInterviewScore: number | null;
  /** Spaced-repetition drills for this application that are due now. */
  drillsDue: number;
}

export type ArtifactKind =
  | 'jd_analysis'
  | 'resume'
  | 'cover_letter'
  | 'interview_prep'
  | 'notes';

export interface Artifact {
  id: string;
  applicationId: string;
  kind: ArtifactKind;
  title: string;
  content: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

// ─── Memory (the learning feedback loop) ────────────────────────────────────

export type MemoryKind =
  | 'preference' // stable fact about the candidate / their voice
  | 'lesson' // learned from an outcome: what converts, what to avoid
  | 'weakness' // interview weakness to drill (spaced repetition)
  | 'win'; // something that worked, worth repeating

export type MemoryStatus = 'proposed' | 'active' | 'retired';

export interface MemoryNote {
  id: string;
  kind: MemoryKind;
  content: string;
  tags: string[];
  /** e.g. "all", "company:Acme", "role:backend", "stage:behavioral". */
  scope: string;
  status: MemoryStatus;
  confidence: number; // 0–1
  sourceRunId: string | null;
  evidence: string[];
  createdAt: string;
}

// ─── Document format (how exported resumes and letters look) ───────────────

export interface DocFormat {
  pageSize: 'A4' | 'LETTER';
  /** The two lines under the name: contact line then bold headline by default; 'auto' keeps the CV's own order. */
  headerOrder: 'auto' | 'contact-first' | 'headline-first';
  /** Name and header on resumes (letters are always left-aligned). */
  align: 'center' | 'left';
  font: 'sans' | 'serif';
  /** Section headings: "PROFESSIONAL EXPERIENCE" or as written ("Professional Experience"). */
  headingCase: 'upper' | 'as-written';
  /** Headings and rules, as a hex colour. */
  accent: string;
  /** The name's colour; null = the accent. */
  nameColor: string | null;
  /** An exact font, usually learned from the person's own CV ("Lato", "Calibri"). DOCX uses it as is; the PDF
   *  embeds it when it's installed on this machine, else falls back to the `font` family. */
  fontName: string | null;
  /** Point sizes. */
  sizes: { name: number; contact: number; headline: number; heading: number; body: number };
  /** A rule under each section heading. */
  headingRule: boolean;
  /** Page margin in points (left/right; top/bottom a touch less). */
  margin: number;
  /** The CV file this format was learned from, if any. */
  learnedFrom: string | null;
}

export const DEFAULT_DOC_FORMAT: DocFormat = {
  pageSize: 'A4',
  headerOrder: 'contact-first',
  align: 'center',
  font: 'sans',
  headingCase: 'upper',
  accent: '#1F3A5F',
  nameColor: null,
  fontName: null,
  sizes: { name: 22, contact: 9, headline: 10.5, heading: 10.5, body: 10 },
  headingRule: true,
  margin: 46,
  learnedFrom: null,
};

// ─── Experience bank (the candidate's real experience, stored once) ─────────
// Every resume and cover letter is a view of these facts, so titles, dates and
// numbers stop drifting between versions. Imported entries start 'proposed'
// and only reach drafts once the human confirms them.

export type ExperienceKind = 'story' | 'role' | 'project' | 'education' | 'certification' | 'link';
export type ExperienceStatus = 'proposed' | 'active' | 'archived';
export type ExperienceSource = 'manual' | 'quick' | 'gap' | 'cv' | 'linkedin' | 'github' | 'link' | 'agent';

export interface Experience {
  id: string;
  kind: ExperienceKind;
  status: ExperienceStatus;
  /** "Led the Postgres 11→15 upgrade" · "Staff SRE" · "nightwatch" */
  title: string;
  /** Employer, school or project owner. */
  org: string | null;
  /** As the person writes it: "Jan 2023 – Present", "2019". */
  period: string | null;
  /** Stories: challenge → what you did → result (the shape recruiters look for). */
  situation: string | null;
  action: string | null;
  result: string | null;
  /** Roles, projects and links: description or bullets. */
  details: string | null;
  /** Skills, tools and themes: "kubernetes", "migration", "mentoring". */
  tags: string[];
  url: string | null;
  source: ExperienceSource;
  /** File name, URL or username it came from. */
  sourceRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ExperienceInput = Partial<Omit<Experience, 'id' | 'createdAt' | 'updatedAt'>> & { title: string };

export interface ImportResult {
  added: Experience[];
  /** Already in the bank (or discarded before) — not added again. */
  skipped: number;
  note?: string;
}

// ─── Outcomes (what feeds the loop) ─────────────────────────────────────────

export type OutcomeStage =
  | 'applied'
  | 'screen'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'ghosted';

export interface Outcome {
  id: string;
  applicationId: string;
  stage: OutcomeStage;
  detail: string;
  occurredAt: string;
  createdAt: string;
}

// ─── Runs + live events ─────────────────────────────────────────────────────

export type RunKind = 'tailor' | 'mock_interview' | 'retro' | 'research' | 'session';
export type RunDriverName = 'claude' | 'claude-code' | 'demo';
export type RunStatus = 'running' | 'awaiting_approval' | 'done' | 'error' | 'aborted';

export interface Run {
  id: string;
  applicationId: string | null;
  kind: RunKind;
  driver: RunDriverName;
  status: RunStatus;
  costUsd: number;
  createdAt: string;
  finishedAt: string | null;
}

/** A single streamed event from an agent run. Persisted + pushed over SSE. */
export type RunEvent =
  | { type: 'status'; runId: string; ts: string; status: RunStatus; note?: string }
  | { type: 'agent'; runId: string; ts: string; agent: string; model: string }
  | { type: 'thinking'; runId: string; ts: string; text: string }
  | { type: 'text'; runId: string; ts: string; text: string }
  | { type: 'tool_use'; runId: string; ts: string; tool: string; input: unknown }
  | { type: 'tool_result'; runId: string; ts: string; tool: string; summary: string }
  | { type: 'approval_request'; runId: string; ts: string; approval: Approval }
  | { type: 'approval_resolved'; runId: string; ts: string; approvalId: string; decision: ApprovalDecision }
  | { type: 'artifact'; runId: string; ts: string; artifact: Artifact }
  | { type: 'memory_proposed'; runId: string; ts: string; note: MemoryNote }
  | { type: 'cost'; runId: string; ts: string; costUsd: number }
  | { type: 'done'; runId: string; ts: string; summary: string }
  | { type: 'error'; runId: string; ts: string; message: string }
  | { type: 'interview_question'; runId: string; ts: string; sessionId: string; turn: InterviewTurn }
  | { type: 'interview_score'; runId: string; ts: string; sessionId: string; turn: InterviewTurn }
  | { type: 'interview_done'; runId: string; ts: string; sessionId: string; summary: string };

// ─── Approvals (human-in-the-loop) ──────────────────────────────────────────

export type ApprovalDecision = 'allow' | 'deny';
export type ApprovalStatus = 'pending' | 'allowed' | 'denied';

export interface Approval {
  id: string;
  runId: string;
  applicationId: string | null;
  tool: string;
  /** Human-friendly description of what the agent wants to do. */
  title: string;
  /** The payload the agent proposed; shown for review (e.g. the draft). */
  input: Record<string, unknown>;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt: string | null;
}

// ─── Config / health ────────────────────────────────────────────────────────

/** Where the candidate's profile text came from. */
export interface ProfileSource {
  filename: string;
  kind: 'pdf' | 'docx' | 'text' | 'pasted';
  chars: number;
  updatedAt: string;
}

export interface HealthInfo {
  ok: boolean;
  version: string;
  hasApiKey: boolean;
  hasProfile: boolean;
  demoMode: boolean;
  dataDir: string;
  /** What to pass to `claude --plugin-dir`: the package root as typed in a shell ("~/Callback"), when it ships the plugin manifest. */
  pluginDir: string | null;
}

export interface DashboardStats {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
  activeRuns: number;
  pendingApprovals: number;
  lessons: number;
  // Funnel conversion, computed from outcomes.
  responseRate: number | null; // got any response / applied
  interviewRate: number | null; // reached interview / applied
}

// ─── Export + ATS verification ──────────────────────────────────────────────

/** One weighted part of the audit score. Weights sum to 1 across the categories that apply. */
export interface AuditCategory {
  key: 'parse' | 'match' | 'impact' | 'brevity' | 'style' | 'honesty' | 'specificity';
  label: string;
  /** The question this category answers, e.g. "can a system read it?" */
  hint: string;
  /** 0–100 for this category alone. */
  score: number;
  weight: number;
  /** What pulled the score down — concrete and checkable. */
  findings: string[];
  /** What already works — the signals a skimming recruiter will catch. */
  strengths: string[];
}

export interface AtsReport {
  /** 0–100: the weighted category scores, capped at 40 while placeholders remain and at 30 when the text layer is unreadable. */
  score: number;
  /** One line on where the document stands. */
  verdict: string;
  categories: AuditCategory[];
  /** Up to five things that make this document stand out, strongest signals first. */
  standout: string[];
  parseable: boolean;
  pages: number;
  extractedChars: number;
  placeholders: string[];
  contact: { email: string | null; phone: string | null };
  sections: string[];
  /** Normalised matching (k8s = Kubernetes, plural = singular); `coverage` weights a term by where it sits, `skillsOnly` lists terms that only appear in a skills list. */
  keywords: { found: string[]; missing: string[]; coverage: number | null; skillsOnly: string[] };
  mustHaves: { addressed: string[]; unaddressed: string[] };
  /** Numbers in the resume that don't appear in the profile — verify they're true. */
  unverifiedClaims: string[];
  issues: { level: 'block' | 'warn' | 'info'; text: string }[];
  /** Short, concrete ways to make the document stronger — style and evidence, never invented content. */
  suggestions: string[];
}

// ─── Interview prep ─────────────────────────────────────────────────────────

export type InterviewMode = 'behavioral' | 'technical' | 'system_design';

export interface InterviewSession {
  id: string;
  /** The pipeline job this session prepares for (null = general practice). */
  applicationId: string | null;
  /** Where that job was in the pipeline when the session started (e.g. "screen"). */
  stage: ApplicationStatus | null;
  mode: InterviewMode;
  status: 'running' | 'done';
  runId: string | null;
  summary: string | null;
  /** Answers scored so far, and their average overall — for history and the job drawer. */
  answered: number;
  avgScore: number | null;
  startedAt: string;
  finishedAt: string | null;
}

/** Rubric scores for one answer: each dimension 1–5, an overall, one fix. */
export interface AnswerScore {
  dims: Record<string, number>;
  overall: number;
  fix: string;
}

export interface InterviewTurn {
  id: string;
  sessionId: string;
  seq: number;
  question: string;
  /** Rubric dimension this question primarily exercises. */
  dimension: string;
  answer: string | null;
  score: AnswerScore | null;
  createdAt: string;
}

/** A spaced-repetition item: a question worth re-answering after a delay. */
export interface Drill {
  id: string;
  question: string;
  dimension: string;
  mode: InterviewMode;
  applicationId: string | null;
  dueAt: string;
  intervalDays: number;
  ease: number;
  reps: number;
  lastScore: number | null;
  createdAt: string;
}

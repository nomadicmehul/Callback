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

export interface AtsReport {
  /** 0–100. Deductions for anything a parser or a recruiter would trip on. */
  score: number;
  parseable: boolean;
  pages: number;
  extractedChars: number;
  placeholders: string[];
  contact: { email: string | null; phone: string | null };
  sections: string[];
  keywords: { found: string[]; missing: string[]; coverage: number | null };
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

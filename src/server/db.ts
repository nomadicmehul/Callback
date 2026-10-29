import { DatabaseSync } from 'node:sqlite';
import { nanoid } from 'nanoid';
import { ensureDataDir, DB_PATH } from './paths';
import type {
  Application,
  ApplicationMaterials,
  ApplicationStatus,
  Artifact,
  ArtifactKind,
  JdAnalysis,
  MemoryKind,
  Experience,
  ExperienceInput,
  ExperienceKind,
  ExperienceSource,
  ExperienceStatus,
  MemoryNote,
  MemoryStatus,
  Outcome,
  OutcomeStage,
  Run,
  RunEvent,
  RunKind,
  RunDriverName,
  RunStatus,
  Approval,
  ApprovalStatus,
  DashboardStats,
  InterviewMode,
  InterviewSession,
  InterviewTurn,
  AnswerScore,
  Drill,
} from '@shared/types';
import { APPLICATION_STATUSES } from '@shared/types';

// ─── Connection ─────────────────────────────────────────────────────────────

let db: DatabaseSync;

export function initDb(): void {
  ensureDataDir();
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate();
}

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      jd_url TEXT,
      jd_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'saved',
      fit_score INTEGER,
      analysis_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_notes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      scope TEXT NOT NULL DEFAULT 'all',
      status TEXT NOT NULL DEFAULT 'proposed',
      confidence REAL NOT NULL DEFAULT 0.5,
      source_run_id TEXT,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outcomes (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      driver TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS run_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      ts TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      application_id TEXT,
      tool TEXT NOT NULL,
      title TEXT NOT NULL,
      input_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_artifacts_app ON artifacts(application_id);
    CREATE INDEX IF NOT EXISTS idx_outcomes_app ON outcomes(application_id);
    CREATE INDEX IF NOT EXISTS idx_runs_app ON runs(application_id);
    CREATE INDEX IF NOT EXISTS idx_events_run ON run_events(run_id);
    CREATE INDEX IF NOT EXISTS idx_memory_status ON memory_notes(status);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id TEXT PRIMARY KEY,
      application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      run_id TEXT,
      summary TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS interview_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      question TEXT NOT NULL,
      dimension TEXT NOT NULL,
      answer TEXT,
      score_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drills (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      dimension TEXT NOT NULL,
      mode TEXT NOT NULL,
      application_id TEXT,
      due_at TEXT NOT NULL,
      interval_days INTEGER NOT NULL DEFAULT 1,
      ease REAL NOT NULL DEFAULT 2.3,
      reps INTEGER NOT NULL DEFAULT 0,
      last_score REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS experiences (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed',
      title TEXT NOT NULL,
      org TEXT,
      period TEXT,
      situation TEXT,
      action TEXT,
      result TEXT,
      details TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      url TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      source_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_turns_session ON interview_turns(session_id);
    CREATE INDEX IF NOT EXISTS idx_drills_due ON drills(due_at);
  `);
  // Additive migrations for databases created before a column existed.
  try {
    db.exec("ALTER TABLE applications ADD COLUMN guard_json TEXT NOT NULL DEFAULT '[]'");
  } catch {
    /* column already exists */
  }
  try {
    db.exec('ALTER TABLE interview_sessions ADD COLUMN stage TEXT');
  } catch {
    /* column already exists */
  }
  try {
    db.exec('ALTER TABLE applications ADD COLUMN location TEXT');
  } catch {
    /* column already exists */
  }
}

const now = () => new Date().toISOString();

// ─── Applications ───────────────────────────────────────────────────────────

/** What exists for one job — its own documents and its own interview record. */
export function materialsFor(applicationId: string): ApplicationMaterials {
  const kinds = new Set(
    (db.prepare('SELECT DISTINCT kind FROM artifacts WHERE application_id = ?').all(applicationId) as any[]).map((r) => r.kind),
  );
  const iv = db
    .prepare(
      `SELECT COUNT(DISTINCT s.id) AS sessions,
              AVG(json_extract(t.score_json, '$.overall')) AS avg
         FROM interview_sessions s
         LEFT JOIN interview_turns t ON t.session_id = s.id AND t.score_json IS NOT NULL
        WHERE s.application_id = ?`,
    )
    .get(applicationId) as any;
  const due = (db.prepare('SELECT COUNT(*) AS c FROM drills WHERE application_id = ? AND due_at <= ?').get(applicationId, now()) as any).c;
  return {
    analysis: kinds.has('jd_analysis'),
    resume: kinds.has('resume'),
    coverLetter: kinds.has('cover_letter'),
    prep: kinds.has('interview_prep'),
    interviews: Number(iv?.sessions ?? 0),
    avgInterviewScore: iv?.avg != null ? Math.round(Number(iv.avg) * 10) / 10 : null,
    drillsDue: Number(due ?? 0),
  };
}

function rowToApplication(r: any): Application {
  return {
    id: r.id,
    company: r.company,
    role: r.role,
    location: r.location ?? null,
    jdUrl: r.jd_url ?? null,
    jdText: r.jd_text,
    status: r.status as ApplicationStatus,
    fitScore: r.fit_score ?? null,
    analysis: r.analysis_json ? (JSON.parse(r.analysis_json) as JdAnalysis) : null,
    guardFlags: r.guard_json ? JSON.parse(r.guard_json) : [],
    materials: materialsFor(r.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createApplication(input: {
  company: string;
  role: string;
  jdText: string;
  jdUrl?: string | null;
  location?: string | null;
  guardFlags?: string[];
}): Application {
  const id = `app_${nanoid(10)}`;
  const ts = now();
  db.prepare(
    `INSERT INTO applications (id, company, role, location, jd_url, jd_text, status, guard_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'saved', ?, ?, ?)`,
  ).run(id, input.company, input.role, input.location ?? null, input.jdUrl ?? null, input.jdText, JSON.stringify(input.guardFlags ?? []), ts, ts);
  return getApplication(id)!;
}

export function getApplication(id: string): Application | null {
  const r = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  return r ? rowToApplication(r) : null;
}

export function listApplications(): Application[] {
  return db
    .prepare('SELECT * FROM applications ORDER BY updated_at DESC')
    .all()
    .map(rowToApplication);
}

/** Fix what a capture got wrong: company, role, location. */
export function updateApplicationMeta(id: string, patch: { company?: string; role?: string; location?: string | null }): Application | null {
  const cur = getApplication(id);
  if (!cur) return null;
  db.prepare('UPDATE applications SET company = ?, role = ?, location = ?, updated_at = ? WHERE id = ?').run(
    patch.company?.trim() || cur.company,
    patch.role?.trim() || cur.role,
    patch.location === undefined ? cur.location : patch.location?.trim() || null,
    now(),
    id,
  );
  return getApplication(id);
}

export function updateApplicationStatus(id: string, status: ApplicationStatus): void {
  db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
}

export function setApplicationAnalysis(id: string, analysis: JdAnalysis): void {
  db.prepare(
    'UPDATE applications SET analysis_json = ?, fit_score = ?, company = COALESCE(NULLIF(?, \'\'), company), role = COALESCE(NULLIF(?, \'\'), role), updated_at = ? WHERE id = ?',
  ).run(
    JSON.stringify(analysis),
    analysis.fitScore ?? null,
    analysis.company ?? '',
    analysis.role ?? '',
    now(),
    id,
  );
}

// ─── Artifacts ──────────────────────────────────────────────────────────────

function rowToArtifact(r: any): Artifact {
  return {
    id: r.id,
    applicationId: r.application_id,
    kind: r.kind as ArtifactKind,
    title: r.title,
    content: r.content,
    meta: r.meta_json ? JSON.parse(r.meta_json) : {},
    createdAt: r.created_at,
  };
}

export function saveArtifact(input: {
  applicationId: string;
  kind: ArtifactKind;
  title: string;
  content: string;
  meta?: Record<string, unknown>;
}): Artifact {
  const id = `art_${nanoid(10)}`;
  db.prepare(
    `INSERT INTO artifacts (id, application_id, kind, title, content, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.applicationId,
    input.kind,
    input.title,
    input.content,
    JSON.stringify(input.meta ?? {}),
    now(),
  );
  return rowToArtifact(db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id));
}

export function getArtifact(id: string): Artifact | null {
  const r = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id);
  return r ? rowToArtifact(r) : null;
}

/** Replace a document's content in place (user edits, agent revisions). */
export function updateArtifact(id: string, content: string): Artifact | null {
  const cur = getArtifact(id);
  if (!cur) return null;
  const meta = { ...cur.meta, editedAt: now(), revisions: Number(cur.meta.revisions ?? 0) + 1 };
  db.prepare('UPDATE artifacts SET content = ?, meta_json = ? WHERE id = ?').run(content, JSON.stringify(meta), id);
  return getArtifact(id);
}

export function listArtifacts(applicationId: string): Artifact[] {
  return db
    .prepare('SELECT * FROM artifacts WHERE application_id = ? ORDER BY created_at DESC')
    .all(applicationId)
    .map(rowToArtifact);
}

/** Every other document of one kind (e.g. all cover letters) — to catch text reused word for word. */
export function listArtifactsOfKind(kind: ArtifactKind, exceptId: string): Artifact[] {
  return db.prepare('SELECT * FROM artifacts WHERE kind = ? AND id != ?').all(kind, exceptId).map(rowToArtifact);
}

// ─── Memory ─────────────────────────────────────────────────────────────────

function rowToMemory(r: any): MemoryNote {
  return {
    id: r.id,
    kind: r.kind as MemoryKind,
    content: r.content,
    tags: JSON.parse(r.tags_json),
    scope: r.scope,
    status: r.status as MemoryStatus,
    confidence: r.confidence,
    sourceRunId: r.source_run_id ?? null,
    evidence: JSON.parse(r.evidence_json),
    createdAt: r.created_at,
  };
}

export function proposeMemory(input: {
  kind: MemoryKind;
  content: string;
  tags?: string[];
  scope?: string;
  confidence?: number;
  sourceRunId?: string | null;
  evidence?: string[];
  status?: MemoryStatus; // defaults to 'proposed'; seeds may pass 'active'
}): MemoryNote {
  const id = `mem_${nanoid(10)}`;
  db.prepare(
    `INSERT INTO memory_notes (id, kind, content, tags_json, scope, status, confidence, source_run_id, evidence_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.kind,
    input.content,
    JSON.stringify(input.tags ?? []),
    input.scope ?? 'all',
    input.status ?? 'proposed',
    input.confidence ?? 0.5,
    input.sourceRunId ?? null,
    JSON.stringify(input.evidence ?? []),
    now(),
  );
  return rowToMemory(db.prepare('SELECT * FROM memory_notes WHERE id = ?').get(id));
}

export function listMemory(status?: MemoryStatus): MemoryNote[] {
  const rows = status
    ? db.prepare('SELECT * FROM memory_notes WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM memory_notes ORDER BY created_at DESC').all();
  return rows.map(rowToMemory);
}

export function setMemoryStatus(id: string, status: MemoryStatus): MemoryNote | null {
  db.prepare('UPDATE memory_notes SET status = ? WHERE id = ?').run(status, id);
  const r = db.prepare('SELECT * FROM memory_notes WHERE id = ?').get(id);
  return r ? rowToMemory(r) : null;
}

/**
 * Keyword search over ACTIVE memory, optionally scoped. Deliberately simple
 * (LIKE over content/tags/scope) — good enough until recall becomes a
 * bottleneck, at which point we add embeddings. Returns highest-confidence first.
 */
export function searchMemory(queryText: string, scope?: string, limit = 8): MemoryNote[] {
  const active = listMemory('active');
  const terms = queryText
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length > 2);
  const scored = active
    .map((note) => {
      const hay = `${note.content} ${note.tags.join(' ')} ${note.scope}`.toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score += 1;
      // Scope match is a strong signal.
      if (scope && (note.scope === scope || note.scope === 'all')) score += 2;
      score += note.confidence; // tiebreak toward trusted lessons
      return { note, score };
    })
    .filter((s) => s.score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((s) => s.note);
}

// ─── Experience bank ────────────────────────────────────────────────────────

function rowToExperience(r: any): Experience {
  return {
    id: r.id,
    kind: r.kind as ExperienceKind,
    status: r.status as ExperienceStatus,
    title: r.title,
    org: r.org ?? null,
    period: r.period ?? null,
    situation: r.situation ?? null,
    action: r.action ?? null,
    result: r.result ?? null,
    details: r.details ?? null,
    tags: JSON.parse(r.tags_json),
    url: r.url ?? null,
    source: r.source as ExperienceSource,
    sourceRef: r.source_ref ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const EXPERIENCE_FIELDS = ['kind', 'status', 'title', 'org', 'period', 'situation', 'action', 'result', 'details', 'url', 'source', 'sourceRef'] as const;
const column = (f: string) => f.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const blankToNull = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const cleanTags = (tags: unknown) =>
  Array.isArray(tags) ? [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20) : [];

export function addExperience(input: ExperienceInput): Experience {
  const id = `exp_${nanoid(10)}`;
  const ts = now();
  db.prepare(
    `INSERT INTO experiences (id, kind, status, title, org, period, situation, action, result, details, tags_json, url, source, source_ref, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.kind ?? 'story',
    input.status ?? 'proposed',
    input.title.trim(),
    blankToNull(input.org),
    blankToNull(input.period),
    blankToNull(input.situation),
    blankToNull(input.action),
    blankToNull(input.result),
    blankToNull(input.details),
    JSON.stringify(cleanTags(input.tags)),
    blankToNull(input.url),
    input.source ?? 'manual',
    blankToNull(input.sourceRef),
    ts,
    ts,
  );
  return getExperience(id)!;
}

export function getExperience(id: string): Experience | null {
  const r = db.prepare('SELECT * FROM experiences WHERE id = ?').get(id);
  return r ? rowToExperience(r) : null;
}

export function listExperiences(status?: ExperienceStatus): Experience[] {
  const rows = status
    ? db.prepare('SELECT * FROM experiences WHERE status = ? ORDER BY updated_at DESC').all(status)
    : db.prepare('SELECT * FROM experiences ORDER BY updated_at DESC').all();
  return rows.map(rowToExperience);
}

export function updateExperience(id: string, patch: Partial<ExperienceInput>): Experience | null {
  const cur = getExperience(id);
  if (!cur) return null;
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  for (const f of EXPERIENCE_FIELDS) {
    if (!(f in patch)) continue;
    const v = (patch as any)[f];
    if (f === 'title' && !String(v ?? '').trim()) continue; // a title is required
    sets.push(`${column(f)} = ?`);
    vals.push(f === 'kind' || f === 'status' || f === 'source' ? String(v) : blankToNull(v));
  }
  if ('tags' in patch) {
    sets.push('tags_json = ?');
    vals.push(JSON.stringify(cleanTags(patch.tags)));
  }
  if (!sets.length) return cur;
  db.prepare(`UPDATE experiences SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals, now(), id);
  return getExperience(id);
}

/** Same kind + title + org already stored (even if discarded) — imports never re-add it. */
export function findExperienceDuplicate(kind: ExperienceKind, title: string, org: string | null): Experience | null {
  const key = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return listExperiences().find((e) => e.kind === kind && key(e.title) === key(title) && key(e.org) === key(org)) ?? null;
}

// ─── Outcomes ───────────────────────────────────────────────────────────────

function rowToOutcome(r: any): Outcome {
  return {
    id: r.id,
    applicationId: r.application_id,
    stage: r.stage as OutcomeStage,
    detail: r.detail,
    occurredAt: r.occurred_at,
    createdAt: r.created_at,
  };
}

export function recordOutcome(input: {
  applicationId: string;
  stage: OutcomeStage;
  detail?: string;
  occurredAt?: string;
}): Outcome {
  const id = `out_${nanoid(10)}`;
  const ts = now();
  db.prepare(
    `INSERT INTO outcomes (id, application_id, stage, detail, occurred_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, input.applicationId, input.stage, input.detail ?? '', input.occurredAt ?? ts, ts);
  return rowToOutcome(db.prepare('SELECT * FROM outcomes WHERE id = ?').get(id));
}

export function listOutcomes(applicationId: string): Outcome[] {
  return db
    .prepare('SELECT * FROM outcomes WHERE application_id = ? ORDER BY occurred_at ASC')
    .all(applicationId)
    .map(rowToOutcome);
}

// ─── Runs + events ──────────────────────────────────────────────────────────

function rowToRun(r: any): Run {
  return {
    id: r.id,
    applicationId: r.application_id ?? null,
    kind: r.kind as RunKind,
    driver: r.driver as RunDriverName,
    status: r.status as RunStatus,
    costUsd: r.cost_usd,
    createdAt: r.created_at,
    finishedAt: r.finished_at ?? null,
  };
}

export function createRun(input: {
  applicationId: string | null;
  kind: RunKind;
  driver: RunDriverName;
}): Run {
  const id = `run_${nanoid(10)}`;
  db.prepare(
    `INSERT INTO runs (id, application_id, kind, driver, status, created_at)
     VALUES (?, ?, ?, ?, 'running', ?)`,
  ).run(id, input.applicationId, input.kind, input.driver, now());
  return rowToRun(db.prepare('SELECT * FROM runs WHERE id = ?').get(id));
}

export function getRun(id: string): Run | null {
  const r = db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
  return r ? rowToRun(r) : null;
}

export function updateRun(id: string, patch: { status?: RunStatus; costUsd?: number; finished?: boolean }): void {
  const run = getRun(id);
  if (!run) return;
  db.prepare('UPDATE runs SET status = ?, cost_usd = ?, finished_at = ? WHERE id = ?').run(
    patch.status ?? run.status,
    patch.costUsd ?? run.costUsd,
    patch.finished ? now() : run.finishedAt,
    id,
  );
}

export function appendRunEvent(event: RunEvent): void {
  db.prepare('INSERT INTO run_events (run_id, ts, type, payload_json) VALUES (?, ?, ?, ?)').run(
    event.runId,
    event.ts,
    event.type,
    JSON.stringify(event),
  );
}

export function listRunEvents(runId: string): RunEvent[] {
  return db
    .prepare('SELECT payload_json FROM run_events WHERE run_id = ? ORDER BY seq ASC')
    .all(runId)
    .map((r: any) => JSON.parse(r.payload_json) as RunEvent);
}

export function listRunsByApplication(applicationId: string): Run[] {
  return db
    .prepare('SELECT * FROM runs WHERE application_id = ? ORDER BY created_at DESC')
    .all(applicationId)
    .map(rowToRun);
}

// ─── Approvals ──────────────────────────────────────────────────────────────

function rowToApproval(r: any): Approval {
  return {
    id: r.id,
    runId: r.run_id,
    applicationId: r.application_id ?? null,
    tool: r.tool,
    title: r.title,
    input: r.input_json ? JSON.parse(r.input_json) : {},
    status: r.status as ApprovalStatus,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at ?? null,
  };
}

export function createApproval(input: {
  runId: string;
  applicationId: string | null;
  tool: string;
  title: string;
  input: Record<string, unknown>;
}): Approval {
  const id = `apr_${nanoid(10)}`;
  db.prepare(
    `INSERT INTO approvals (id, run_id, application_id, tool, title, input_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(id, input.runId, input.applicationId, input.tool, input.title, JSON.stringify(input.input), now());
  return rowToApproval(db.prepare('SELECT * FROM approvals WHERE id = ?').get(id));
}

export function getApproval(id: string): Approval | null {
  const r = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
  return r ? rowToApproval(r) : null;
}

export function resolveApprovalRow(id: string, status: ApprovalStatus): Approval | null {
  db.prepare('UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ?').run(status, now(), id);
  return getApproval(id);
}

export function listPendingApprovals(): Approval[] {
  return db
    .prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at ASC")
    .all()
    .map(rowToApproval);
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export function computeStats(): DashboardStats {
  const apps = listApplications();
  const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<
    ApplicationStatus,
    number
  >;
  for (const a of apps) byStatus[a.status] += 1;

  const applied =
    byStatus.applied + byStatus.screen + byStatus.interview + byStatus.offer + byStatus.rejected + byStatus.ghosted;
  const responded = byStatus.screen + byStatus.interview + byStatus.offer + byStatus.rejected;
  const interviewed = byStatus.interview + byStatus.offer;

  const activeRuns = (db.prepare("SELECT COUNT(*) AS c FROM runs WHERE status IN ('running','awaiting_approval')").get() as any).c;

  return {
    total: apps.length,
    byStatus,
    activeRuns,
    pendingApprovals: listPendingApprovals().length,
    lessons: listMemory('active').length,
    responseRate: applied > 0 ? responded / applied : null,
    interviewRate: applied > 0 ? interviewed / applied : null,
  };
}

// ─── Interview sessions + turns ─────────────────────────────────────────────

function rowToSession(r: any): InterviewSession {
  const sc = db
    .prepare(
      `SELECT COUNT(*) AS n, AVG(json_extract(score_json, '$.overall')) AS avg
         FROM interview_turns WHERE session_id = ? AND score_json IS NOT NULL`,
    )
    .get(r.id) as any;
  return {
    id: r.id,
    applicationId: r.application_id ?? null,
    stage: (r.stage as ApplicationStatus | null) ?? null,
    mode: r.mode as InterviewMode,
    status: r.status,
    runId: r.run_id ?? null,
    summary: r.summary ?? null,
    answered: Number(sc?.n ?? 0),
    avgScore: sc?.avg != null ? Math.round(Number(sc.avg) * 10) / 10 : null,
    startedAt: r.started_at,
    finishedAt: r.finished_at ?? null,
  };
}

function rowToTurn(r: any): InterviewTurn {
  return {
    id: r.id,
    sessionId: r.session_id,
    seq: r.seq,
    question: r.question,
    dimension: r.dimension,
    answer: r.answer ?? null,
    score: r.score_json ? (JSON.parse(r.score_json) as AnswerScore) : null,
    createdAt: r.created_at,
  };
}

export function createInterviewSession(input: {
  applicationId: string | null;
  mode: InterviewMode;
  runId: string | null;
}): InterviewSession {
  const id = `ses_${nanoid(10)}`;
  // Remember where the job was in the pipeline when practice started, so the
  // history reads "behavioral · for Acme · while at: screen".
  const stage = input.applicationId ? (getApplication(input.applicationId)?.status ?? null) : null;
  db.prepare(
    `INSERT INTO interview_sessions (id, application_id, stage, mode, status, run_id, started_at)
     VALUES (?, ?, ?, ?, 'running', ?, ?)`,
  ).run(id, input.applicationId, stage, input.mode, input.runId, now());
  return getInterviewSession(id)!;
}

export function getInterviewSession(id: string): InterviewSession | null {
  const r = db.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id);
  return r ? rowToSession(r) : null;
}

export function listInterviewSessions(limit = 30): InterviewSession[] {
  return db
    .prepare('SELECT * FROM interview_sessions ORDER BY started_at DESC LIMIT ?')
    .all(limit)
    .map(rowToSession);
}

/** Every mock interview run for one pipeline job, newest first. */
export function listInterviewSessionsByApplication(applicationId: string): InterviewSession[] {
  return db
    .prepare('SELECT * FROM interview_sessions WHERE application_id = ? ORDER BY started_at DESC')
    .all(applicationId)
    .map(rowToSession);
}

/** All drills (due and scheduled) that came out of one job's interviews. */
export function listDrillsByApplication(applicationId: string): Drill[] {
  return db
    .prepare('SELECT * FROM drills WHERE application_id = ? ORDER BY due_at ASC')
    .all(applicationId)
    .map(rowToDrill);
}

export function finishInterviewSession(id: string, summary: string): void {
  db.prepare("UPDATE interview_sessions SET status = 'done', summary = ?, finished_at = ? WHERE id = ?").run(summary, now(), id);
}

export function addInterviewTurn(input: { sessionId: string; question: string; dimension: string }): InterviewTurn {
  const id = `trn_${nanoid(10)}`;
  const seq = (db.prepare('SELECT COUNT(*) AS c FROM interview_turns WHERE session_id = ?').get(input.sessionId) as any).c + 1;
  db.prepare(
    `INSERT INTO interview_turns (id, session_id, seq, question, dimension, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, input.sessionId, seq, input.question, input.dimension, now());
  return rowToTurn(db.prepare('SELECT * FROM interview_turns WHERE id = ?').get(id));
}

export function listInterviewTurns(sessionId: string): InterviewTurn[] {
  return db
    .prepare('SELECT * FROM interview_turns WHERE session_id = ? ORDER BY seq ASC')
    .all(sessionId)
    .map(rowToTurn);
}

/** The latest question the candidate has not answered yet, if any. */
export function getOpenTurn(sessionId: string): InterviewTurn | null {
  const r = db
    .prepare('SELECT * FROM interview_turns WHERE session_id = ? AND answer IS NULL ORDER BY seq DESC LIMIT 1')
    .get(sessionId);
  return r ? rowToTurn(r) : null;
}

export function answerInterviewTurn(turnId: string, answer: string): void {
  db.prepare('UPDATE interview_turns SET answer = ? WHERE id = ?').run(answer, turnId);
}

export function scoreInterviewTurn(turnId: string, score: AnswerScore): InterviewTurn | null {
  db.prepare('UPDATE interview_turns SET score_json = ? WHERE id = ?').run(JSON.stringify(score), turnId);
  const r = db.prepare('SELECT * FROM interview_turns WHERE id = ?').get(turnId);
  return r ? rowToTurn(r) : null;
}

// ─── Drills (spaced repetition) ─────────────────────────────────────────────

function rowToDrill(r: any): Drill {
  return {
    id: r.id,
    question: r.question,
    dimension: r.dimension,
    mode: r.mode as InterviewMode,
    applicationId: r.application_id ?? null,
    dueAt: r.due_at,
    intervalDays: r.interval_days,
    ease: r.ease,
    reps: r.reps,
    lastScore: r.last_score ?? null,
    createdAt: r.created_at,
  };
}

export function createDrill(input: {
  question: string;
  dimension: string;
  mode: InterviewMode;
  applicationId: string | null;
  dueAt: string;
  intervalDays: number;
  ease: number;
  reps: number;
  lastScore: number | null;
}): Drill {
  const id = `drl_${nanoid(10)}`;
  db.prepare(
    `INSERT INTO drills (id, question, dimension, mode, application_id, due_at, interval_days, ease, reps, last_score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.question,
    input.dimension,
    input.mode,
    input.applicationId,
    input.dueAt,
    input.intervalDays,
    input.ease,
    input.reps,
    input.lastScore,
    now(),
  );
  return getDrill(id)!;
}

export function getDrill(id: string): Drill | null {
  const r = db.prepare('SELECT * FROM drills WHERE id = ?').get(id);
  return r ? rowToDrill(r) : null;
}

export function listDueDrills(): Drill[] {
  return db.prepare('SELECT * FROM drills WHERE due_at <= ? ORDER BY due_at ASC').all(now()).map(rowToDrill);
}

export function listUpcomingDrills(limit = 50): Drill[] {
  return db
    .prepare('SELECT * FROM drills WHERE due_at > ? ORDER BY due_at ASC LIMIT ?')
    .all(now(), limit)
    .map(rowToDrill);
}

export function countDrillsSince(iso: string): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM drills WHERE created_at >= ?').get(iso) as any).c;
}

export function rescheduleDrill(
  id: string,
  patch: { dueAt: string; intervalDays: number; ease: number; reps: number; lastScore: number },
): Drill | null {
  db.prepare('UPDATE drills SET due_at = ?, interval_days = ?, ease = ?, reps = ?, last_score = ? WHERE id = ?').run(
    patch.dueAt,
    patch.intervalDays,
    patch.ease,
    patch.reps,
    patch.lastScore,
    id,
  );
  return getDrill(id);
}

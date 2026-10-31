import { Hono } from 'hono';
import type {
  ApplicationStatus,
  ApprovalDecision,
  ExperienceInput,
  ExperienceKind,
  ExperienceSource,
  ExperienceStatus,
  HealthInfo,
  MemoryStatus,
  OutcomeStage,
} from '@shared/types';
import { APP_VERSION } from './version';
import { DATA_DIR, PLUGIN_DIR } from './paths';
import { cleanDocFormat, getConfig, getDocFormat, setConfig, hasApiKey, hasProfile } from './config';
import { resolveApproval } from './approvals';
import {
  startTailorRun,
  startRetroRun,
  startInterviewSession,
  submitInterviewAnswer,
  endInterviewSession,
  startPrepRun,
} from './engine';
import { postingGuard } from './guard';
import { fetchPosting } from './posting';
import { extractProfileText, saveProfileFile } from './profile';
import { answerDrill, INTERVIEW_MODES } from './interview';
import { parseResumeMarkdown, renderPdf, analyzeAts, exportArtifact, findPlaceholders } from './resume';
import {
  listApplications,
  getApplication,
  createApplication,
  updateApplicationMeta,
  updateApplicationStatus,
  listArtifacts,
  listRunsByApplication,
  listRunEvents,
  recordOutcome,
  listOutcomes,
  listMemory,
  setMemoryStatus,
  listPendingApprovals,
  computeStats,
  listInterviewSessions,
  listInterviewSessionsByApplication,
  getInterviewSession,
  listInterviewTurns,
  listDueDrills,
  listUpcomingDrills,
  listDrillsByApplication,
  getArtifact,
  listArtifactsOfKind,
  updateArtifact,
  addExperience,
  listExperiences,
  updateExperience,
  addGapAnswers,
} from './db';
import { groundTruth, importFromCv, importGitHub, importLink, importLinkedIn, structureStory } from './experience';
import { learnFormat } from './cvformat';
import { suggestGaps } from './gapsuggest';
import { gapKind } from '@shared/placeholders';

const EXPERIENCE_KINDS: ExperienceKind[] = ['story', 'role', 'project', 'education', 'certification', 'link'];
const EXPERIENCE_STATUSES: ExperienceStatus[] = ['proposed', 'active', 'archived'];
const EXPERIENCE_SOURCES: ExperienceSource[] = ['manual', 'quick', 'gap', 'cv', 'linkedin', 'github', 'link', 'agent'];
const TEXT_FIELDS = ['title', 'org', 'period', 'situation', 'action', 'result', 'details', 'url', 'sourceRef'] as const;

/** Only known fields, with enums checked — a request body never writes anything else. */
function experienceFields(body: any): Partial<ExperienceInput> {
  const out: Partial<ExperienceInput> = {};
  for (const f of TEXT_FIELDS) if (f in body) (out as any)[f] = body[f] == null ? null : String(body[f]).slice(0, 4000);
  if (EXPERIENCE_KINDS.includes(body.kind)) out.kind = body.kind;
  if (EXPERIENCE_STATUSES.includes(body.status)) out.status = body.status;
  if (EXPERIENCE_SOURCES.includes(body.source)) out.source = body.source;
  if (Array.isArray(body.tags)) out.tags = body.tags.map(String);
  return out;
}

export function apiRouter(): Hono {
  const api = new Hono();

  api.get('/health', (c) => {
    const info: HealthInfo = {
      ok: true,
      version: APP_VERSION,
      hasApiKey: hasApiKey(),
      hasProfile: hasProfile(),
      demoMode: process.env.CALLBACK_DEMO === '1' || !hasApiKey(),
      dataDir: DATA_DIR,
      pluginDir: PLUGIN_DIR,
    };
    return c.json(info);
  });

  // ─── Config (never echoes the API key back) ──────────────────────────────
  api.get('/config', (c) => {
    const cfg = getConfig();
    return c.json({
      hasApiKey: hasApiKey(),
      candidateProfile: cfg.candidateProfile ?? '',
      profileSource: cfg.profileSource ?? null,
      docFormat: getDocFormat(),
    });
  });
  api.post('/config', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if (typeof body.apiKey === 'string' && body.apiKey.trim()) patch.apiKey = body.apiKey.trim();
    if (typeof body.candidateProfile === 'string') {
      patch.candidateProfile = body.candidateProfile;
      const prev = getConfig();
      // Keep an upload's provenance when the user edits the text; otherwise mark it pasted.
      patch.profileSource = body.candidateProfile.trim()
        ? { ...(prev.profileSource ?? { filename: 'pasted', kind: 'pasted' }), chars: body.candidateProfile.length, updatedAt: new Date().toISOString() }
        : undefined;
    }
    if (body.docFormat && typeof body.docFormat === 'object') patch.docFormat = cleanDocFormat(body.docFormat, getDocFormat());
    setConfig(patch);
    return c.json({ ok: true, hasApiKey: hasApiKey(), hasProfile: hasProfile(), docFormat: getDocFormat() });
  });

  // ─── Profile (the ground truth for every draft) ──────────────────────────
  api.get('/profile', (c) => {
    const cfg = getConfig();
    return c.json({ text: cfg.candidateProfile ?? '', source: cfg.profileSource ?? null, hasProfile: hasProfile() });
  });

  api.post('/profile/upload', async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: 'Upload a file in the "file" field (PDF, DOCX, TXT, or MD).' }, 400);
    const data = new Uint8Array(await file.arrayBuffer());
    if (data.byteLength > 10 * 1024 * 1024) return c.json({ error: 'File too large (10 MB max).' }, 400);
    try {
      const { text, kind } = await extractProfileText(file.name, data);
      if (!text.trim()) return c.json({ error: 'Could not extract any text from that file. Is it a scanned image? Try pasting the text instead.' }, 422);
      saveProfileFile(file.name, data);
      const source = { filename: file.name, kind, chars: text.length, updatedAt: new Date().toISOString() } as const;
      setConfig({ candidateProfile: text, profileSource: source });
      return c.json({ text, source });
    } catch (err: any) {
      return c.json({ error: `Could not read that file: ${String(err?.message ?? err)}` }, 422);
    }
  });

  // Learn a document format from the person's own CV (.docx). Returns a preview — saving is a separate step.
  api.post('/format/learn', async (c) => {
    const file = (await c.req.parseBody()).file;
    if (!(file instanceof File)) return c.json({ error: 'Upload your CV (.docx) in the "file" field.' }, 400);
    if (/\.pdf$/i.test(file.name)) {
      return c.json({ error: 'PDFs don’t keep the format details Callback needs — upload the Word version (.docx) of your CV.' }, 422);
    }
    if (file.size > 20 * 1024 * 1024) return c.json({ error: 'File too large (20 MB max).' }, 400);
    try {
      const { format, found } = learnFormat(new Uint8Array(await file.arrayBuffer()), file.name);
      return c.json({ format: cleanDocFormat(format, getDocFormat()), found });
    } catch (err: any) {
      return c.json({ error: String(err?.message ?? err) }, 422);
    }
  });

  // ─── Job capture helpers ─────────────────────────────────────────────────
  api.post('/jd/fetch', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await fetchPosting(String(body.url ?? ''));
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: String(err?.message ?? err) }, 422);
    }
  });

  // ─── Applications ─────────────────────────────────────────────────────────
  api.get('/applications', (c) => c.json(listApplications()));

  api.post('/applications', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    let jdText = String(body.jdText ?? '').trim();
    const jdUrl = body.jdUrl ? String(body.jdUrl).trim() : null;
    let flags: string[] = [];
    let fetchedRole: string | null = null;
    let fetchedCompany: string | null = null;
    let location: string | null = body.location ? String(body.location).trim() || null : null;

    if (!jdText && jdUrl) {
      try {
        const fetched = await fetchPosting(jdUrl);
        jdText = fetched.text;
        flags = fetched.flags;
        fetchedRole = fetched.role;
        fetchedCompany = fetched.company;
        location ??= fetched.location;
      } catch (err: any) {
        return c.json({ error: String(err?.message ?? err) }, 422);
      }
    } else if (jdText) {
      const g = postingGuard(jdText);
      jdText = g.text;
      flags = g.flags;
    }
    if (!jdText) return c.json({ error: 'Paste a job description or provide a URL.' }, 400);

    const app = createApplication({
      company: String(body.company ?? '').trim() || fetchedCompany || 'Unknown company',
      role: String(body.role ?? '').trim() || fetchedRole || 'Unknown role',
      jdText,
      jdUrl,
      location,
      guardFlags: flags,
    });
    const runId = body.tailor !== false ? startTailorRun(app.id).id : null;
    return c.json({ application: app, runId });
  });

  api.get('/applications/:id', (c) => {
    const app = getApplication(c.req.param('id'));
    if (!app) return c.json({ error: 'not found' }, 404);
    return c.json({
      application: app,
      artifacts: listArtifacts(app.id),
      runs: listRunsByApplication(app.id),
      outcomes: listOutcomes(app.id),
      // Everything interview-related that belongs to THIS job.
      interviews: listInterviewSessionsByApplication(app.id),
      drills: listDrillsByApplication(app.id),
    });
  });

  api.patch('/applications/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const app = updateApplicationMeta(c.req.param('id'), {
      company: typeof body.company === 'string' ? body.company : undefined,
      role: typeof body.role === 'string' ? body.role : undefined,
      location: body.location === null ? null : typeof body.location === 'string' ? body.location : undefined,
    });
    if (!app) return c.json({ error: 'not found' }, 404);
    return c.json({ application: app });
  });

  api.patch('/applications/:id/status', async (c) => {
    const app = getApplication(c.req.param('id'));
    if (!app) return c.json({ error: 'not found' }, 404);
    const body = await c.req.json().catch(() => ({}));
    updateApplicationStatus(app.id, body.status as ApplicationStatus);
    return c.json({ ok: true });
  });

  api.post('/applications/:id/tailor', (c) => {
    const app = getApplication(c.req.param('id'));
    if (!app) return c.json({ error: 'not found' }, 404);
    return c.json({ runId: startTailorRun(app.id).id });
  });

  api.post('/applications/:id/outcome', async (c) => {
    const app = getApplication(c.req.param('id'));
    if (!app) return c.json({ error: 'not found' }, 404);
    const body = await c.req.json().catch(() => ({}));
    const outcome = recordOutcome({
      applicationId: app.id,
      stage: body.stage as OutcomeStage,
      detail: String(body.detail ?? ''),
    });
    const map: Partial<Record<OutcomeStage, ApplicationStatus>> = {
      applied: 'applied',
      screen: 'screen',
      interview: 'interview',
      offer: 'offer',
      rejected: 'rejected',
      ghosted: 'ghosted',
    };
    const next = map[outcome.stage];
    if (next) updateApplicationStatus(app.id, next);
    // Close the loop: every outcome triggers a retro that proposes lessons.
    const runId = startRetroRun(app.id).id;
    return c.json({ outcome, runId });
  });

  // ─── Runs ─────────────────────────────────────────────────────────────────
  api.get('/runs/:id/events', (c) => c.json(listRunEvents(c.req.param('id'))));

  // ─── Approvals ────────────────────────────────────────────────────────────
  api.get('/approvals', (c) => c.json(listPendingApprovals()));
  api.post('/approvals/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const decision = (body.decision === 'deny' ? 'deny' : 'allow') as ApprovalDecision;
    const approval = resolveApproval(c.req.param('id'), decision);
    if (!approval) return c.json({ error: 'not found' }, 404);
    return c.json({ approval });
  });

  // ─── Experience bank ──────────────────────────────────────────────────────
  api.get('/experience', (c) => c.json(listExperiences()));

  api.post('/experience', async (c) => {
    const fields = experienceFields(await c.req.json().catch(() => ({})));
    if (!fields.title?.trim()) return c.json({ error: 'A title is required.' }, 400);
    // Written by the human in the dashboard: theirs, so active unless they say otherwise.
    return c.json({ experience: addExperience({ status: 'active', source: 'manual', ...fields, title: fields.title }) });
  });

  api.patch('/experience/:id', async (c) => {
    const experience = updateExperience(c.req.param('id'), experienceFields(await c.req.json().catch(() => ({}))));
    if (!experience) return c.json({ error: 'not found' }, 404);
    return c.json({ experience });
  });

  api.post('/experience/quick', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const text = String(body.text ?? '').trim();
    if (text.length < 10) return c.json({ error: 'Write a sentence or two about what you did.' }, 400);
    return c.json(structureStory(text.slice(0, 4000)));
  });

  const imported = async (c: any, run: () => unknown) => {
    try {
      return c.json(await run());
    } catch (err: any) {
      return c.json({ error: String(err?.message ?? err) }, 422);
    }
  };
  api.post('/experience/import/cv', (c) => imported(c, importFromCv));
  api.post('/experience/import/github', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return imported(c, () => importGitHub(String(body.username ?? '')));
  });
  api.post('/experience/import/link', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return imported(c, () => importLink(String(body.url ?? '')));
  });
  api.post('/experience/import/linkedin', async (c) => {
    const file = (await c.req.parseBody()).file;
    if (!(file instanceof File)) return c.json({ error: 'Upload the LinkedIn export (.zip) in the "file" field.' }, 400);
    if (file.size > 50 * 1024 * 1024) return c.json({ error: 'File too large (50 MB max).' }, 400);
    const data = new Uint8Array(await file.arrayBuffer());
    return imported(c, () => importLinkedIn(data));
  });

  // ─── Memory ───────────────────────────────────────────────────────────────
  api.get('/memory', (c) =>
    c.json({ proposed: listMemory('proposed'), active: listMemory('active'), retired: listMemory('retired') }),
  );
  api.post('/memory/:id/status', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const note = setMemoryStatus(c.req.param('id'), body.status as MemoryStatus);
    if (!note) return c.json({ error: 'not found' }, 404);
    return c.json({ note });
  });

  // ─── Documents: edit, verify, export ──────────────────────────────────────
  api.patch('/artifacts/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const content = String(body.content ?? '');
    if (!content.trim()) return c.json({ error: 'content is required' }, 400);
    const artifact = updateArtifact(c.req.param('id'), content);
    if (!artifact) return c.json({ error: 'not found' }, 404);
    return c.json({ artifact });
  });

  api.post('/artifacts/:id/ats', async (c) => {
    const art = getArtifact(c.req.param('id'));
    if (!art) return c.json({ error: 'not found' }, 404);
    const app = getApplication(art.applicationId);
    const pdf = await renderPdf(parseResumeMarkdown(art.content), { title: art.title, kind: art.kind, style: getDocFormat() });
    const report = await analyzeAts({
      pdf,
      source: art.content,
      application: app,
      profile: groundTruth(),
      kind: art.kind,
      siblings: listArtifactsOfKind(art.kind, art.id).map((a) => a.content),
    });
    return c.json({ report });
  });

  // Suggestions for a draft's gaps — from the person's CV, confirmed experience and earlier answers.
  api.get('/artifacts/:id/gaps', (c) => {
    const art = getArtifact(c.req.param('id'));
    if (!art) return c.json({ error: 'not found' }, 404);
    return c.json(suggestGaps(art, getApplication(art.applicationId)));
  });

  // Remember what the person typed into gaps, so the next draft can reuse or suggest it.
  api.post('/gap-answers', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const art = getArtifact(String(body.artifactId ?? ''));
    if (!art) return c.json({ error: 'artifact not found' }, 404);
    const answers = (Array.isArray(body.answers) ? body.answers : [])
      .map((a: any) => ({ hint: String(a?.hint ?? '').trim(), answer: String(a?.answer ?? '').replace(/\s+/g, ' ').trim() }))
      .filter((a: { hint: string; answer: string }) => a.hint && a.answer);
    const company = getApplication(art.applicationId)?.company ?? null;
    const saved = addGapAnswers(answers.map((a: { hint: string; answer: string }) => ({ ...a, kind: gapKind(a.hint), company, artifactKind: art.kind })));
    return c.json({ saved });
  });

  api.get('/artifacts/:id/download', async (c) => {
    const art = getArtifact(c.req.param('id'));
    if (!art) return c.json({ error: 'not found' }, 404);
    const format = c.req.query('format') === 'docx' ? 'docx' : 'pdf';
    const placeholders = findPlaceholders(art.content);
    if (placeholders.length) {
      return c.json(
        { error: `Fill in the ${placeholders.length} placeholder(s) first — Callback won't export a scaffold: ${placeholders.slice(0, 3).join(', ')}` },
        422,
      );
    }
    const { buffer, filename } = await exportArtifact(art, getApplication(art.applicationId), format);
    c.header('content-type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    c.header('content-disposition', `attachment; filename="${filename}"`);
    return c.body(new Uint8Array(buffer));
  });

  // ─── Interview prep ───────────────────────────────────────────────────────
  api.get('/interviews', (c) => {
    const applicationId = c.req.query('applicationId');
    return c.json(applicationId ? listInterviewSessionsByApplication(applicationId) : listInterviewSessions());
  });

  api.post('/interviews', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const mode = String(body.mode ?? 'behavioral') as (typeof INTERVIEW_MODES)[number];
    if (!INTERVIEW_MODES.includes(mode)) return c.json({ error: 'mode must be behavioral, technical, or system_design' }, 400);
    const applicationId = body.applicationId ? String(body.applicationId) : null;
    if (applicationId && !getApplication(applicationId)) return c.json({ error: 'application not found' }, 404);
    return c.json(startInterviewSession(mode, applicationId));
  });

  api.get('/interviews/:id', (c) => {
    const session = getInterviewSession(c.req.param('id'));
    if (!session) return c.json({ error: 'not found' }, 404);
    return c.json({ session, turns: listInterviewTurns(session.id) });
  });

  api.post('/interviews/:id/answer', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      submitInterviewAnswer(c.req.param('id'), String(body.answer ?? ''));
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: String(err?.message ?? err) }, 400);
    }
  });

  api.post('/interviews/:id/end', (c) => {
    try {
      return c.json({ session: endInterviewSession(c.req.param('id')) });
    } catch (err: any) {
      return c.json({ error: String(err?.message ?? err) }, 404);
    }
  });

  api.get('/drills', (c) => c.json({ due: listDueDrills(), upcoming: listUpcomingDrills() }));

  api.post('/drills/:id/answer', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const answer = String(body.answer ?? '').trim();
    if (!answer) return c.json({ error: 'Write an answer first.' }, 400);
    const result = answerDrill(c.req.param('id'), answer);
    if (!result) return c.json({ error: 'not found' }, 404);
    return c.json(result);
  });

  api.post('/applications/:id/prep', (c) => {
    const app = getApplication(c.req.param('id'));
    if (!app) return c.json({ error: 'not found' }, 404);
    return c.json({ runId: startPrepRun(app.id).id });
  });

  // ─── Dashboard stats ──────────────────────────────────────────────────────
  api.get('/stats', (c) => c.json(computeStats()));

  return api;
}

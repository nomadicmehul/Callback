import type {
  Application,
  ApplicationStatus,
  Approval,
  Artifact,
  DashboardStats,
  HealthInfo,
  MemoryNote,
  MemoryStatus,
  Outcome,
  OutcomeStage,
  ProfileSource,
  Run,
  RunEvent,
  AnswerScore,
  AtsReport,
  DocFormat,
  Drill,
  Experience,
  ExperienceInput,
  GapSuggestion,
  ImportResult,
  InterviewMode,
  InterviewSession,
  InterviewTurn,
} from '@shared/types';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const e = await res.json();
      if (e?.error) msg = String(e.error);
    } catch {
      /* no JSON body */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
const patch = (url: string, body?: unknown) =>
  fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });

/** What /api/jd/fetch extracts from a posting URL. */
export interface FetchedPosting {
  text: string;
  role: string | null;
  /** Alias of role (older field name). */
  title: string | null;
  company: string | null;
  location: string | null;
  employmentType: string | null;
  datePosted: string | null;
  companySource: 'json-ld' | 'meta' | 'title' | 'url' | null;
  flags: string[];
  url: string;
}

export interface ApplicationDetail {
  application: Application;
  artifacts: Artifact[];
  runs: Run[];
  outcomes: Outcome[];
  /** Mock interviews and drills that belong to this job specifically. */
  interviews: InterviewSession[];
  drills: Drill[];
}

export const api = {
  health: () => fetch('/api/health').then(j<HealthInfo>),
  stats: () => fetch('/api/stats').then(j<DashboardStats>),

  getConfig: () =>
    fetch('/api/config').then(j<{ hasApiKey: boolean; candidateProfile: string; profileSource: ProfileSource | null; docFormat: DocFormat }>),
  saveConfig: (body: { apiKey?: string; candidateProfile?: string; docFormat?: Partial<DocFormat> }) =>
    post('/api/config', body).then(j<{ ok: boolean; hasApiKey: boolean; hasProfile: boolean; docFormat: DocFormat }>),

  getProfile: () => fetch('/api/profile').then(j<{ text: string; source: ProfileSource | null; hasProfile: boolean }>),
  uploadProfile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/profile/upload', { method: 'POST', body: fd }).then(j<{ text: string; source: ProfileSource }>);
  },

  fetchJd: (url: string) => post('/api/jd/fetch', { url }).then(j<FetchedPosting>),

  listApplications: () => fetch('/api/applications').then(j<Application[]>),
  getApplication: (id: string) => fetch(`/api/applications/${id}`).then(j<ApplicationDetail>),
  createApplication: (body: { company: string; role: string; location?: string; jdText: string; jdUrl?: string; tailor?: boolean }) =>
    post('/api/applications', body).then(j<{ application: Application; runId: string | null }>),
  setStatus: (id: string, status: ApplicationStatus) => patch(`/api/applications/${id}/status`, { status }).then(j),
  updateApplication: (id: string, body: { company?: string; role?: string; location?: string | null }) =>
    patch(`/api/applications/${id}`, body).then(j<{ application: Application }>),
  tailor: (id: string) => post(`/api/applications/${id}/tailor`).then(j<{ runId: string }>),
  recordOutcome: (id: string, stage: OutcomeStage, detail: string) =>
    post(`/api/applications/${id}/outcome`, { stage, detail }).then(j<{ outcome: Outcome; runId: string }>),

  approvals: () => fetch('/api/approvals').then(j<Approval[]>),
  resolveApproval: (id: string, decision: 'allow' | 'deny') =>
    post(`/api/approvals/${id}`, { decision }).then(j<{ approval: Approval }>),

  memory: () => fetch('/api/memory').then(j<{ proposed: MemoryNote[]; active: MemoryNote[]; retired: MemoryNote[] }>),
  setMemoryStatus: (id: string, status: MemoryStatus) =>
    post(`/api/memory/${id}/status`, { status }).then(j<{ note: MemoryNote }>),

  runEvents: (id: string) => fetch(`/api/runs/${id}/events`).then(j<RunEvent[]>),

  // Interview prep
  interviews: (applicationId?: string | null) =>
    fetch(applicationId ? `/api/interviews?applicationId=${encodeURIComponent(applicationId)}` : '/api/interviews').then(j<InterviewSession[]>),
  interview: (id: string) => fetch(`/api/interviews/${id}`).then(j<{ session: InterviewSession; turns: InterviewTurn[] }>),
  startInterview: (mode: InterviewMode, applicationId: string | null) =>
    post('/api/interviews', { mode, applicationId }).then(j<InterviewSession>),
  answerInterview: (id: string, answer: string) => post(`/api/interviews/${id}/answer`, { answer }).then(j<{ ok: true }>),
  endInterview: (id: string) => post(`/api/interviews/${id}/end`).then(j<{ session: InterviewSession }>),
  drills: () => fetch('/api/drills').then(j<{ due: Drill[]; upcoming: Drill[] }>),
  answerDrill: (id: string, answer: string) =>
    post(`/api/drills/${id}/answer`, { answer }).then(j<{ score: AnswerScore; drill: Drill }>),
  prep: (applicationId: string) => post(`/api/applications/${applicationId}/prep`).then(j<{ runId: string }>),

  learnFormat: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/format/learn', { method: 'POST', body: fd }).then(j<{ format: DocFormat; found: string[] }>);
  },

  // Experience bank
  experiences: () => fetch('/api/experience').then(j<Experience[]>),
  addExperience: (body: ExperienceInput) => post('/api/experience', body).then(j<{ experience: Experience }>),
  updateExperience: (id: string, body: Partial<ExperienceInput>) => patch(`/api/experience/${id}`, body).then(j<{ experience: Experience }>),
  quickStory: (text: string) => post('/api/experience/quick', { text }).then(j<{ draft: ExperienceInput; type: string }>),
  importCv: () => post('/api/experience/import/cv').then(j<ImportResult>),
  importGitHub: (username: string) => post('/api/experience/import/github', { username }).then(j<ImportResult>),
  importLink: (url: string) => post('/api/experience/import/link', { url }).then(j<ImportResult>),
  importLinkedIn: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/experience/import/linkedin', { method: 'POST', body: fd }).then(j<ImportResult>);
  },

  // Documents: edit, verify, export
  updateArtifact: (id: string, content: string) => patch(`/api/artifacts/${id}`, { content }).then(j<{ artifact: Artifact }>),
  gapSuggestions: (id: string) => fetch(`/api/artifacts/${id}/gaps`).then(j<GapSuggestion[]>),
  recordGapAnswers: (artifactId: string, answers: { hint: string; answer: string }[]) =>
    post('/api/gap-answers', { artifactId, answers }).then(j<{ saved: number }>),
  atsCheck: (id: string) => post(`/api/artifacts/${id}/ats`).then(j<{ report: AtsReport }>),
  /** The audit as a .md file — saved next to the exports on the server, downloaded here. */
  downloadAudit: async (id: string): Promise<void> => {
    const res = await fetch(`/api/artifacts/${id}/audit?download=1`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const blob = await res.blob();
    const filename = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'audit.md';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  /** Downloads via fetch so a 422 (placeholders left) surfaces as a readable error. */
  downloadArtifact: async (id: string, format: 'pdf' | 'docx'): Promise<void> => {
    const res = await fetch(`/api/artifacts/${id}/download?format=${format}`);
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const e = await res.json();
        if (e?.error) msg = String(e.error);
      } catch {
        /* no body */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? `document.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};

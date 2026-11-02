// ─── Application folders ────────────────────────────────────────────────────
// One folder per job, named the way a person would name it: <root>/<Company>/<Role>/.
// What you send has a plain name (Jane_Doe_CV.pdf, so a forwarded file shows no company list);
// the Word copy you keep says which job it is for. Next to them: the posting as captured
// (postings disappear), the audits, the prep pack and a summary of where the application stands.
// A draft with gaps is never written. Nothing here deletes a file, and a folder Callback didn't
// create (no marker) is never written into: the next free name is used instead.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Application, Artifact, ArtifactKind, FolderInfo, FolderSync } from '@shared/types';
import { getConfig, getDocFormat } from './config';
import { DATA_DIR } from './paths';
import { getApplication, listArtifacts, listArtifactsOfKind, listInterviewSessionsByApplication, listOutcomes, setApplicationFolder } from './db';
import { analyzeAts, findPlaceholders, parseResumeMarkdown, renderArtifact, renderPdf, unbackedEntries } from './resume';
import { auditMarkdown } from './audit';
import { claimsTruth } from './experience';
import { standingAnswers } from './gapsuggest';
import { guessName } from './cvtext';
import { subscribe } from './bus';

export const DEFAULT_APPLICATIONS_DIR = path.join(DATA_DIR, 'applications');
export const applicationsRoot = (): string => getConfig().applicationsDir || DEFAULT_APPLICATIONS_DIR;

/** "~/Documents/Jobs" → an absolute path; null for a relative one (relative to what?). */
export function cleanRoot(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const expanded = t === '~' ? os.homedir() : t.startsWith('~/') ? path.join(os.homedir(), t.slice(2)) : t;
  return path.isAbsolute(expanded) ? path.resolve(expanded) : null;
}

// "(m/f/d)", "(f/m/x)", "(all genders)" belong to the posting, not to a folder or file name.
const GENDER = /\s*\((?:[mfwdx]\s*[\/|,]\s*)+[mfwdx]\)|\s*\(all genders?\)/gi;

/** A folder name as a person would type it: no path separators, nothing macOS or Windows refuse. */
export function folderName(s: string, fallback: string): string {
  const clean = s
    .replace(GENDER, '')
    .replace(/[\/\\:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80)
    .trim();
  return clean || fallback;
}

const STOP = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'the', 'to', 'with']);
// "Acme Cloud GmbH" is "Acme_Cloud" in a file name, the way people name their own files.
const LEGAL = /[\s,]+(?:gmbh|ag|se|inc|ltd|llc|plc|bv|nv|sa|sas|srl|corp|corporation|co|kg|ug|oy|ab|as)\.?(?:\s*&\s*co\.?(?:\s*kg)?)?$/i;

/** "Director of Cloud Platform Engineering & DevOps" → "Director_Cloud_Platform_Engineering_DevOps". */
export function fileWords(s: string, max = 6): string {
  return s
    .replace(GENDER, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()))
    .slice(0, max)
    .join('_');
}

const LABEL: Record<ArtifactKind, string> = {
  resume: 'CV',
  cover_letter: 'Cover_Letter',
  interview_prep: 'Interview_Prep',
  notes: 'Notes',
  jd_analysis: 'Job_Analysis',
};
const person = () => fileWords(standingAnswers().name ?? guessName(getConfig().candidateProfile ?? '') ?? '', 4);

/** What you send is plain (Jane_Doe_CV.pdf); the Word copy you keep says which job it is for. */
export function documentFileName(art: Artifact, app: Application | null, format: 'pdf' | 'docx'): string {
  const base = [person(), LABEL[art.kind]].filter(Boolean).join('_');
  if (format === 'pdf') return `${base}.pdf`;
  const company = fileWords((app?.company ?? '').replace(LEGAL, ''), 3);
  return `${[base, company, fileWords(app?.role ?? '')].filter(Boolean).join('_')}.docx`;
}

// ─── Where a job's folder is ────────────────────────────────────────────────

const MARKER = '.callback.json';

function owner(dir: string): string | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf8')).applicationId ?? null;
  } catch {
    return null;
  }
}

/** The wanted folder, or "Role (2)" when that one belongs to another job or isn't Callback's
 *  (a folder of your own from before is left alone). */
function freeFolder(root: string, want: string, appId: string): string {
  for (let i = 1; ; i++) {
    const rel = i === 1 ? want : `${want} (${i})`;
    const dir = path.join(root, rel);
    if (!fs.existsSync(dir) || owner(dir) === appId) return rel;
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** This job's folder: created on first use, moved along when its company or role is corrected. */
export function folderFor(app: Application): string {
  const root = applicationsRoot();
  const want = path.join(folderName(app.company, 'Company'), folderName(app.role, 'Role'));
  if (app.folder) {
    const cur = path.join(root, app.folder);
    if (fs.existsSync(cur) && owner(cur) === app.id) {
      if (new RegExp(`^${escapeRe(want)}(?: \\(\\d+\\))?$`).test(app.folder)) return cur;
      const rel = freeFolder(root, want, app.id);
      try {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.renameSync(cur, path.join(root, rel));
        try {
          fs.rmdirSync(path.dirname(cur)); // the old company folder, only if nothing else is in it
        } catch {
          /* not empty */
        }
        setApplicationFolder(app.id, rel);
        return path.join(root, rel);
      } catch {
        return cur;
      }
    }
  }
  const rel = freeFolder(root, want, app.id);
  const dir = path.join(root, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MARKER), JSON.stringify({ applicationId: app.id, createdAt: new Date().toISOString() }, null, 2) + '\n');
  setApplicationFolder(app.id, rel);
  return dir;
}

const existingFolder = (app: Application): string | null => {
  if (!app.folder) return null;
  const dir = path.join(applicationsRoot(), app.folder);
  return fs.existsSync(dir) ? dir : null;
};

export function folderInfo(app: Application): FolderInfo {
  const dir = existingFolder(app);
  const files = dir
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && !e.name.startsWith('.'))
        .map((e) => {
          const st = fs.statSync(path.join(dir, e.name));
          return { name: e.name, size: st.size, modifiedAt: st.mtime.toISOString() };
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  return { root: applicationsRoot(), path: dir, files };
}

/** Show the folder in Finder / Explorer / the desktop's file manager. */
export function openFolder(dir: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  spawn(cmd, [dir], { detached: true, stdio: 'ignore' })
    .on('error', () => {})
    .unref();
}

// ─── What goes in it ────────────────────────────────────────────────────────

export async function auditOf(art: Artifact) {
  const app = getApplication(art.applicationId);
  const pdf = await renderPdf(parseResumeMarkdown(art.content), { title: art.title, kind: art.kind, style: getDocFormat() });
  return analyzeAts({
    pdf,
    source: art.content,
    application: app,
    profile: claimsTruth(),
    kind: art.kind,
    siblings: listArtifactsOfKind(art.kind, art.id).map((a) => a.content),
  });
}

const auditFileName = (art: Artifact) => `audit-${art.kind === 'cover_letter' ? 'cover-letter' : art.kind === 'resume' ? 'cv' : art.kind.replace('_', '-')}.md`;

function postingMarkdown(app: Application): string {
  const facts = [
    app.location && `**Location:** ${app.location}`,
    app.jdUrl && `**Posting:** ${app.jdUrl}`,
    `**Captured:** ${app.createdAt.slice(0, 10)}`,
  ].filter(Boolean);
  const must = app.analysis?.mustHaves ?? [];
  return [
    `# ${app.role} — ${app.company}`,
    '',
    facts.join('  \n'),
    ...(app.guardFlags.length ? ['', `> Callback's posting guard removed: ${app.guardFlags.join('; ')}`] : []),
    ...(must.length ? ['', '## Must-haves', '', ...must.map((m) => `- ${m}`)] : []),
    '',
    '## The posting',
    '',
    app.jdText.trim(),
    '',
  ].join('\n');
}

function summaryMarkdown(app: Application, arts: Artifact[]): string {
  const day = (iso: string) => iso.slice(0, 10);
  const outcomes = listOutcomes(app.id);
  const sessions = listInterviewSessionsByApplication(app.id);
  const notes = arts.filter((a) => a.kind === 'notes');
  return [
    `# ${app.role} — ${app.company}`,
    '',
    "_Callback rewrites this file when the application changes. Keep your own notes in another file._",
    '',
    [`**Status:** ${app.status}`, app.fitScore != null && `**Fit:** ${app.fitScore}/100`, `**Updated:** ${day(app.updatedAt)}`]
      .filter(Boolean)
      .join('  \n'),
    '',
    '## Timeline',
    '',
    `- ${day(app.createdAt)} · captured`,
    ...outcomes.map((o) => `- ${day(o.occurredAt)} · ${o.stage}${o.detail ? ` — ${o.detail}` : ''}`),
    ...(sessions.length
      ? [
          '',
          '## Mock interviews',
          '',
          ...sessions.map(
            (s) => `- ${day(s.startedAt)} · ${s.mode.replace('_', ' ')}${s.avgScore != null ? ` · ${s.avgScore}/5` : ''}${s.summary ? ` — ${s.summary}` : ''}`,
          ),
        ]
      : []),
    ...(notes.length ? ['', '## Notes', '', ...notes.map((n) => n.content.trim())] : []),
    '',
  ].join('\n');
}

/** The Markdown files: cheap, always current, never a document you sent. */
function writeContext(dir: string, app: Application, arts: Artifact[], written: string[]): void {
  const put = (name: string, text: string) => {
    fs.writeFileSync(path.join(dir, name), text);
    written.push(name);
  };
  put('posting.md', postingMarkdown(app));
  const prep = arts.find((a) => a.kind === 'interview_prep');
  if (prep) put('prep-pack.md', prep.content.trim() + '\n');
  put('application.md', summaryMarkdown(app, arts));
}

function appOf(art: Artifact): Application {
  const app = getApplication(art.applicationId);
  if (!app) throw new Error(`No application for document ${art.id}`);
  return app;
}

/** One document into its job's folder. The file you downloaded is the one kept there. */
export async function exportToFolder(art: Artifact, format: 'pdf' | 'docx'): Promise<{ buffer: Buffer; filename: string; filePath: string }> {
  const app = appOf(art);
  const buffer = await renderArtifact(art, format);
  const filename = documentFileName(art, app, format);
  const dir = folderFor(app);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  writeContext(dir, app, listArtifacts(app.id), []);
  return { buffer, filename, filePath };
}

/** A document's audit report, saved next to it. */
export async function saveAudit(art: Artifact): Promise<{ markdown: string; filename: string; filePath: string }> {
  const app = appOf(art);
  const markdown = auditMarkdown(await auditOf(art), art, app);
  const filename = auditFileName(art);
  const filePath = path.join(folderFor(app), filename);
  fs.writeFileSync(filePath, markdown);
  return { markdown, filename, filePath };
}

/** Everything this job has, written to its folder: the latest CV and letter as PDF + Word (only once
 *  every gap is filled) with their audits, the posting, the prep pack and the summary. */
export async function syncFolder(appId: string): Promise<FolderSync> {
  const app = getApplication(appId);
  if (!app) throw new Error(`No application ${appId}`);
  const dir = folderFor(app);
  const arts = listArtifacts(app.id); // newest first
  const written: string[] = [];
  const skipped: FolderSync['skipped'] = [];
  for (const kind of ['resume', 'cover_letter'] as const) {
    const art = arts.find((a) => a.kind === kind);
    if (!art) continue;
    const gaps = findPlaceholders(art.content);
    if (gaps.length) {
      skipped.push({ file: documentFileName(art, app, 'pdf'), reason: `${gaps.length} gap${gaps.length === 1 ? '' : 's'} to fill first` });
      continue;
    }
    const unbacked = kind === 'resume' ? unbackedEntries(art.content, claimsTruth()) : [];
    if (unbacked.length) {
      skipped.push({ file: documentFileName(art, app, 'pdf'), reason: `names an employer, school or title your profile doesn't (${unbacked[0]})` });
      continue;
    }
    for (const format of ['pdf', 'docx'] as const) {
      const name = documentFileName(art, app, format);
      fs.writeFileSync(path.join(dir, name), await renderArtifact(art, format));
      written.push(name);
    }
    const name = auditFileName(art);
    fs.writeFileSync(path.join(dir, name), auditMarkdown(await auditOf(art), art, app));
    written.push(name);
  }
  writeContext(dir, app, arts, written);
  return { path: dir, written, skipped };
}

/** After a change (a new draft, an edit, an outcome), bring an existing folder's Markdown up to date.
 *  The documents you sent are never rewritten behind your back, and a job you only captured gets no folder. */
export function refreshFolder(appId: string): void {
  try {
    const app = getApplication(appId);
    const dir = app && existingFolder(app);
    if (!app || !dir) return;
    writeContext(folderFor(app), app, listArtifacts(app.id), []);
  } catch (err: any) {
    console.error('[folders]', err?.message ?? err); // stderr: safe in the stdio plugin too
  }
}

/** Keep folders current whoever saved the change: the dashboard's runs or the plugin. */
export function watchFolders(): () => void {
  return subscribe((ev) => {
    if (ev.type === 'artifact') refreshFolder(ev.artifact.applicationId);
  });
}

// ─── Experience bank: imports, quick add, and what drafts read ──────────────
// The candidate's real experience, stored once (see types.ts). Everything
// imported here arrives as 'proposed' — the human confirms it before any draft
// or check relies on it. Sources are the candidate's OWN material: their CV,
// their LinkedIn data export, their public GitHub, pages they point at.

import { inflateRawSync } from 'node:zlib';
import type { Experience, ExperienceInput, ExperienceKind, ImportResult } from '@shared/types';
import { addExperience, findExperienceDuplicate, listExperiences } from './db';
import { getConfig } from './config';
import { isBulletLine, isHeadingLine, isRoleLine, parseHeader, reflow } from './cvtext';
import { splitEntry } from './resume';
import { htmlToText, isPrivateHost, normalizeText, postingGuard, robotsAllows, UA } from './guard';
import { metaTags } from './posting';

// ─── What drafts and checks read ────────────────────────────────────────────

const GROUPS: [ExperienceKind, string][] = [
  ['story', 'Stories'],
  ['role', 'Roles'],
  ['project', 'Projects'],
  ['education', 'Education'],
  ['certification', 'Credentials & awards'],
  ['link', 'Links & writing'],
];

/** Confirmed entries as text an agent (or the honesty check) can read. */
export function bankText(entries: Experience[] = listExperiences('active')): string {
  if (!entries.length) return '';
  const out = ['## Experience bank (confirmed by the candidate — use these facts verbatim)'];
  for (const [kind, label] of GROUPS) {
    const items = entries.filter((e) => e.kind === kind);
    if (!items.length) continue;
    out.push('', `### ${label}`);
    for (const e of items) {
      out.push(`- ${e.title}${e.org ? ` — ${e.org}` : ''}${e.period ? ` (${e.period})` : ''}`);
      for (const [k, v] of [
        ['Situation', e.situation],
        ['Action', e.action],
        ['Result', e.result],
        ['Details', e.details],
        ['Link', e.url],
      ] as const) {
        if (v) out.push(`  ${k}: ${v.replace(/\n+/g, ' ')}`);
      }
      if (e.tags.length) out.push(`  Tags: ${e.tags.join(', ')}`);
    }
  }
  return out.join('\n');
}

/** Everything the candidate has confirmed: their profile text plus the active bank. */
export function groundTruth(): string {
  return [getConfig().candidateProfile?.trim() ?? '', bankText()].filter(Boolean).join('\n\n');
}

/** Add imported entries as proposals, skipping anything already in the bank (or discarded). */
function propose(entries: ExperienceInput[], note?: string): ImportResult {
  const added: Experience[] = [];
  let skipped = 0;
  for (const e of entries) {
    if (!e.title?.trim()) continue;
    if (findExperienceDuplicate(e.kind ?? 'story', e.title, e.org ?? null)) {
      skipped++;
      continue;
    }
    added.push(addExperience({ ...e, status: 'proposed' }));
  }
  return { added, skipped, note };
}

const shorten = (s: string, n = 90) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…').replace(/\.$/, '');
const hasNumber = (s: string) => /\d/.test(s.replace(/\b(19|20)\d{2}\b/g, ''));

// ─── From the CV already on file ────────────────────────────────────────────

/** Roles, education, projects and credentials from CV text — plus every quantified
 *  bullet as a story seed the candidate can grow into a full story. */
export function entriesFromCv(text: string): ExperienceInput[] {
  const body = text.split(/\r?\n/).slice(parseHeader(text).lines).join('\n'); // name, contact, headline aren't entries
  const out: ExperienceInput[] = [];
  let section = '';
  let current: ExperienceInput | null = null;
  const flush = () => {
    if (current) out.push(current);
    current = null;
  };
  const kindFor = (): ExperienceKind => (/educat|academ/.test(section) ? 'education' : /project|open.?source|portfolio/.test(section) ? 'project' : 'role');

  for (const t of reflow(body).split('\n')) {
    if (!t) continue;
    if (isHeadingLine(t)) {
      flush();
      section = t.replace(/^#+\s*/, '').toLowerCase();
      continue;
    }
    if (isRoleLine(t)) {
      flush();
      const { title, rest, when } = splitEntry(/\s\|\s/.test(t) ? t : t.split(/,\s*/).join(' | '));
      const [period, ...place] = when.split(/\s+\|\s+/);
      current = {
        kind: kindFor(),
        title,
        org: [rest, ...place].filter(Boolean).join(' · ') || null,
        period: period || null,
        details: '',
        source: 'cv',
      };
      continue;
    }
    const body = t.replace(/^[-*•]\s*/, '');
    if (/certif|licen[cs]e|award|honou?r/.test(section)) {
      for (const c of body.split(/\s+\|\s+/)) if (c.trim()) out.push({ kind: 'certification', title: c.trim(), source: 'cv' });
      continue;
    }
    if (/project|open.?source|portfolio/.test(section) && isBulletLine(t)) {
      flush();
      const [head, ...desc] = body.split(/\s+[—–-]\s+|:\s+/);
      const url = /(https?:\/\/\S+|(?:github|gitlab)\.com\/[\w.-]+\/[\w.-]+)/i.exec(body)?.[1]?.replace(/[).,]+$/, '') ?? null;
      out.push({ kind: 'project', title: head.trim(), details: desc.join(' — ').trim() || null, url: url && !/^https?:/.test(url) ? `https://${url}` : url, source: 'cv' });
      continue;
    }
    if (!current) continue; // summary, skills and anything else stays in the profile text
    current.details = current.details ? `${current.details}\n${isBulletLine(t) ? `- ${body}` : body}` : isBulletLine(t) ? `- ${body}` : body;
    if (isBulletLine(t) && hasNumber(body) && current.kind === 'role') {
      out.push({ kind: 'story', title: shorten(body), details: body, org: current.org ?? null, period: current.period ?? null, source: 'cv' });
    }
  }
  flush();
  return out;
}

export function importFromCv(): ImportResult {
  const text = getConfig().candidateProfile?.trim() ?? '';
  if (!text) throw new Error('No CV on file yet — upload one in Settings → Profile first.');
  return propose(entriesFromCv(text), 'Summary and skills stay in your profile text.');
}

// ─── LinkedIn data export (.zip) ────────────────────────────────────────────
// LinkedIn → Settings → Data privacy → Get a copy of your data. A plain ZIP of
// CSVs; read with node:zlib so there's no new dependency.

const MAX_FILE = 5 * 1024 * 1024;

/** The named files from a ZIP archive (stored or deflated entries). */
export function unzip(data: Uint8Array, wanted: (name: string) => boolean): Map<string, string> {
  const buf = Buffer.from(data);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('That is not a ZIP file. Upload the .zip LinkedIn emailed you.');
  const files = new Map<string, string>();
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0; n--) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('The ZIP file looks damaged.');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    if (name.endsWith('/') || !wanted(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    const out = method === 0 ? raw : method === 8 ? inflateRawSync(raw, { maxOutputLength: MAX_FILE }) : null;
    if (out) files.set(name, out.toString('utf8').replace(/^﻿/, ''));
  }
  return files;
}

/** RFC 4180 CSV → rows (quoted fields, doubled quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((f) => f.trim()));
}

/** CSV rows as records, starting at the header row that has `key` (LinkedIn sometimes adds notes above it). */
function records(csv: string | undefined, key: string): Record<string, string>[] {
  if (!csv) return [];
  const rows = parseCsv(csv);
  const h = rows.findIndex((r) => r.includes(key));
  if (h < 0) return [];
  return rows.slice(h + 1).map((r) => Object.fromEntries(rows[h].map((col, i) => [col, (r[i] ?? '').trim()])));
}

const span = (from?: string, to?: string, ongoing = true) =>
  [from, to || (from && ongoing ? 'Present' : '')].filter(Boolean).join(' – ') || null;

export function entriesFromLinkedIn(files: Map<string, string>): ExperienceInput[] {
  const file = (n: string) => [...files].find(([k]) => k.split('/').pop()?.toLowerCase() === n.toLowerCase())?.[1];
  const src = { source: 'linkedin' as const, sourceRef: 'LinkedIn export' };
  return [
    ...records(file('Positions.csv'), 'Company Name').map((r) => ({
      kind: 'role' as const,
      title: r['Title'],
      org: [r['Company Name'], r['Location']].filter(Boolean).join(' · '),
      period: span(r['Started On'], r['Finished On']),
      details: r['Description'] || null,
      ...src,
    })),
    ...records(file('Education.csv'), 'School Name').map((r) => ({
      kind: 'education' as const,
      title: r['Degree Name'] || r['School Name'],
      org: r['School Name'],
      period: span(r['Start Date'], r['End Date'], false),
      details: [r['Notes'], r['Activities']].filter(Boolean).join('\n') || null,
      ...src,
    })),
    ...records(file('Projects.csv'), 'Title').map((r) => ({
      kind: 'project' as const,
      title: r['Title'],
      period: span(r['Started On'], r['Finished On'], false),
      details: r['Description'] || null,
      url: r['Url'] || null,
      ...src,
    })),
    ...records(file('Certifications.csv'), 'Name').map((r) => ({
      kind: 'certification' as const,
      title: r['Name'],
      org: r['Authority'] || null,
      period: r['Started On'] || null,
      url: r['Url'] || null,
      ...src,
    })),
    ...records(file('Honors.csv'), 'Title').map((r) => ({
      kind: 'certification' as const,
      title: r['Title'],
      period: r['Issued On'] || null,
      details: r['Description'] || null,
      tags: ['award'],
      ...src,
    })),
    ...records(file('Publications.csv'), 'Name').map((r) => ({
      kind: 'link' as const,
      title: r['Name'],
      org: r['Publisher'] || null,
      period: r['Published On'] || null,
      details: r['Description'] || null,
      url: r['Url'] || null,
      tags: ['writing'],
      ...src,
    })),
  ].filter((e) => e.title);
}

export function importLinkedIn(data: Uint8Array): ImportResult {
  const files = unzip(data, (n) => /\/?(positions|education|projects|certifications|honors|publications)\.csv$/i.test(n));
  if (!files.size) throw new Error('No positions, education or projects found. Is this the LinkedIn data export (.zip)?');
  return propose(entriesFromLinkedIn(files), 'Your headline, summary and skills stay in your profile text.');
}

// ─── Public GitHub profile ──────────────────────────────────────────────────

export async function entriesFromGitHub(input: string): Promise<ExperienceInput[]> {
  const login = input.trim().replace(/^@/, '').replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').split(/[/?#]/)[0];
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login)) throw new Error('That does not look like a GitHub username.');
  const gh = async (path: string) => {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: { 'user-agent': UA, accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(12000),
    });
    if (res.status === 404) throw new Error(`No GitHub user "${login}".`);
    if (res.status === 403 || res.status === 429) throw new Error('GitHub’s limit for anonymous requests is used up — try again in an hour.');
    if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}.`);
    return res.json() as Promise<any>;
  };
  const user = await gh(`/users/${login}`);
  const repos: any[] = await gh(`/users/${login}/repos?per_page=100&sort=pushed&type=owner`);
  const src = { source: 'github' as const, sourceRef: login };
  const clean = (s: unknown) => (s ? normalizeText(String(s)).text : null);
  const picked = repos
    .filter((r) => !r.fork && !r.private && (r.stargazers_count > 0 || r.description))
    .sort((a, b) => b.stargazers_count - a.stargazers_count || Date.parse(b.pushed_at) - Date.parse(a.pushed_at))
    .slice(0, 10);
  const years = (r: any) => {
    const [a, b] = [r.created_at, r.pushed_at].map((d: string) => d?.slice(0, 4));
    return a === b ? a : `${a} – ${b}`;
  };
  return [
    {
      kind: 'link',
      title: `GitHub — ${user.login}`,
      url: user.html_url,
      details: [clean(user.bio), `${user.public_repos} public repositories`, user.followers ? `${user.followers} followers` : ''].filter(Boolean).join(' · '),
      ...src,
    },
    ...(user.blog ? [{ kind: 'link' as const, title: 'Website', url: /^https?:/.test(user.blog) ? user.blog : `https://${user.blog}`, ...src }] : []),
    ...picked.map((r) => ({
      kind: 'project' as const,
      title: r.name,
      period: years(r),
      details: [clean(r.description), r.stargazers_count ? `${r.stargazers_count} stars` : '', r.language ? `Main language: ${r.language}` : '']
        .filter(Boolean)
        .join(' · '),
      tags: [r.language, ...(r.topics ?? [])].filter(Boolean).map((t: string) => t.toLowerCase()),
      url: r.html_url,
      ...src,
    })),
  ];
}

export async function importGitHub(input: string): Promise<ImportResult> {
  return propose(await entriesFromGitHub(input), 'Contributions to other people’s repositories aren’t listed by GitHub’s API — add those as links.');
}

// ─── Any public page (blog post, talk, project site) ────────────────────────

export async function entryFromLink(input: string): Promise<ExperienceInput> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('That does not look like a valid URL.');
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) links are supported.');
  if (isPrivateHost(url.hostname)) throw new Error('Refusing to fetch a private/local address.');
  if (!(await robotsAllows(url))) throw new Error('This site disallows automated fetching — add it by hand instead.');
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`The site returned HTTP ${res.status}.`);
  const html = await res.text();
  const tags = metaTags(html);
  const page = htmlToText(html);
  // Untrusted page text: same guard as job postings.
  const desc = postingGuard(tags['og:description'] ?? tags['description'] ?? page.text.slice(0, 400)).text;
  const published = tags['article:published_time'] ?? tags['date'] ?? null;
  return {
    kind: /^github\.com\/[^/]+\/[^/]+/.test(url.hostname + url.pathname) ? 'project' : 'link',
    title: postingGuard(tags['og:title'] ?? page.title ?? url.hostname).text.slice(0, 160) || url.hostname,
    org: tags['og:site_name'] ?? url.hostname.replace(/^www\./, ''),
    period: published ? published.slice(0, 10) : null,
    details: desc ? shorten(desc, 400) : null,
    url: url.toString(),
    source: 'link',
    sourceRef: url.toString(),
  };
}

export async function importLink(input: string): Promise<ImportResult> {
  return propose([await entryFromLink(input)]);
}

// ─── Quick add: plain words → a story draft the human reviews ───────────────

const RESULT = /\b(cut|reduc|sav|grew|grow|increas|decreas|improv|faster|slower|halv|doubl|zero|no longer|down from|up from|from \S+ to)\w*/i;
const ACTION = /^(i\s+)?(led|built|designed|migrated|moved|created|automated|introduced|wrote|ran|drove|owned|rolled|set up|launched|fixed|found|traced|replaced|rebuilt|mentored|hired|coached|negotiated|organi[sz]ed|shipped)\b/i;
const TYPES: [string, RegExp][] = [
  ['fixed', /\b(incident|outage|bug|root cause|crisis|escalat|broke|failure|traced|kept (hitting|failing|crashing)|paged|alert)\w*/i],
  ['improved', /\b(faster|latency|cost|cheaper|perform|reduc|optimi[sz])\w*/i],
  ['changed', /\b(migrat|moved|upgrad|switch|consolidat|replac)\w*/i],
  ['led', /\b(mentor|hired|hiring|coach|my team|led a team|onboard)\w*/i],
  ['won', /\b(customer|client|deal|stakeholder|contract|renewal)\w*/i],
  ['shared', /\b(talk|meetup|blog|article|open source|conference|workshop)\w*/i],
  ['built', /\b(built|launched|created|new|designed)\w*/i],
];

/** A first structuring of what the person typed — every word stays theirs; they edit before saving. */
export function structureStory(text: string): { draft: ExperienceInput; type: string } {
  const clean = normalizeText(text).text.replace(/\s+/g, ' ').trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  // Before the first "I did…" sentence is the situation (even with numbers in it); after it, outcomes are the result.
  const firstAction = sentences.findIndex((s) => ACTION.test(s));
  const start = firstAction >= 0 ? firstAction : sentences.length > 1 ? 1 : 0;
  const situation = sentences.slice(0, start);
  const rest = sentences.slice(start);
  const isResult = (s: string) => hasNumber(s) || RESULT.test(s);
  const result = rest.filter((s, i) => isResult(s) && !(i === 0 && firstAction >= 0)); // the "I did…" sentence stays the action
  const action = rest.filter((s) => !result.includes(s));
  const lead = (action[0] ?? sentences[0] ?? clean).replace(/^i\s+/i, '');
  // Tools and names: capitalised words that aren't just starting a sentence.
  const tags = [
    ...new Set(
      sentences.flatMap((s) =>
        s
          .split(/\s+/)
          .slice(1)
          .map((w) => w.replace(/[^A-Za-z0-9+#.]/g, '').replace(/\.$/, ''))
          .filter((w) => /^[A-Z][A-Za-z0-9+#.]+$/.test(w) && !/^(I|I'm|The|A|An|It|We|Our|My)$/.test(w))
          .map((w) => w.toLowerCase()),
      ),
    ),
  ].slice(0, 6);
  return {
    type: TYPES.find(([, re]) => re.test(clean))?.[0] ?? 'other',
    draft: {
      kind: 'story',
      title: shorten(lead.charAt(0).toUpperCase() + lead.slice(1)).replace(/[.!?]$/, ''),
      situation: situation.join(' ') || null,
      action: action.join(' ') || (result.length ? null : clean),
      result: result.join(' ') || null,
      tags,
      source: 'quick',
    },
  };
}

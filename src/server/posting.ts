// ─── Posting extraction: what a job page tells us about the job ─────────────
// Most job pages carry structured data. In order of trust:
//   1. JSON-LD <script type="application/ld+json"> with @type JobPosting
//      (title, hiringOrganization, jobLocation, datePosted, employmentType) —
//      what Google for Jobs indexes, so boards and career sites publish it.
//   2. Open Graph / Twitter meta tags (og:title, og:site_name).
//   3. The <title> tag, split on "Role - Company" / "Role at Company" patterns.
//   4. The URL itself: known boards put the employer in the host or path.
// Everything here is still UNTRUSTED input — the text goes through postingGuard.

import { guardField, htmlToText, postingGuard, robotsAllows, isPrivateHost, UA } from './guard';

export type CompanySource = 'json-ld' | 'meta' | 'title' | 'url';

export interface PostingMeta {
  role: string | null;
  company: string | null;
  location: string | null;
  employmentType: string | null;
  datePosted: string | null;
  /** Where the company name came from — so the UI can say how sure to be. */
  companySource: CompanySource | null;
}

export interface FetchedPosting extends PostingMeta {
  text: string;
  /** Alias of `role`, kept for older clients. */
  title: string | null;
  flags: string[];
  url: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const ROLE_WORDS =
  /\b(engineer|engineering|developer|programmer|manager|director|designer|analyst|architect|scientist|lead|head|intern|internship|specialist|consultant|administrator|officer|associate|coordinator|recruiter|accountant|nurse|teacher|technician|devops|sre|product|marketing|sales|founder|cto|ceo|cfo|vp|principal|staff|senior|junior|entwickler|ingenieur|leiter|berater|werkstudent|praktikant|référent|chef de projet)\b|\((?:m\/w\/d|w\/m\/d|f\/m\/d|m\/f\/d|m\/f\/x|h\/f)\)/i;

const AGGREGATORS = /^(linkedin|indeed|glassdoor|stepstone|xing|monster|ziprecruiter|welcome to the jungle|wellfound|angellist|dice|hired|otta|jobs?\.ch|jobteaser|totaljobs|reed(\.co\.uk)?|seek|naukri|google)$/i;

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

function titleCase(s: string): string {
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/** "Acme Careers" / "Jobs at Acme" / "Karriere bei Acme GmbH" → "Acme" / "Acme GmbH". */
export function cleanCompany(raw: string): string | null {
  let s = squash(decode(raw));
  s = s.replace(/^(careers?|jobs?|working|work|karriere|stellenangebote|offres d'emploi|job board)\s+(at|bei|chez|@|with|-|–|\|)\s+/i, '');
  s = s.replace(/\s*[-–—|·:]?\s*(careers?( site| page| portal)?|jobs?( board| portal)?|karriere(portal)?|stellenangebote?|job openings?|open positions|vacancies|recruiting|hiring|talent( network)?)\s*$/i, '');
  s = s.replace(/^[\s\-–—|·:]+|[\s\-–—|·:]+$/g, '');
  return s.length > 1 && s.length <= 80 ? s : null;
}

/** Strip board/site chrome from a role title. */
export function cleanRole(raw: string, company: string | null): string | null {
  let s = squash(decode(raw));
  s = s.replace(/^(job application for|apply for|apply to|apply now[:\s-]*|stellenangebot:?|job:?|position:?)\s+/i, '');
  s = s.replace(/\s*[-–—|·]\s*(linkedin|indeed(\.com)?|glassdoor|stepstone|xing|monster|ziprecruiter|welcome to the jungle|wellfound)\s*$/i, '');
  s = s.replace(/\s*[-–—|·:]\s*(careers?|jobs?|karriere|stellenangebote?|job details|job description|apply)\s*$/i, '');
  s = s.replace(/\s*\((?:job\s*)?(?:id|ref|req)[^)]*\)\s*$/i, '');
  if (company) {
    const esc = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const trailing = new RegExp(`\\s*(?:[-–—|·:]|\\bat\\b|\\bbei\\b|\\bchez\\b|@)\\s*${esc}(?:\\s+(?:careers?|jobs?|karriere))?\\s*$`, 'i');
    // "Senior Engineer at Acme | Acme Careers" carries the company twice — strip until stable.
    for (let i = 0; i < 3 && trailing.test(s); i++) s = s.replace(trailing, '');
    s = s.replace(new RegExp(`^${esc}\\s*(?:[-–—|·:]|\\bhiring\\b)\\s*`, 'i'), '');
  }
  s = s.replace(/^[\s\-–—|·:]+|[\s\-–—|·:]+$/g, '');
  return s.length > 1 ? s.slice(0, 120) : null;
}

/** Split a page title into role + company using the common patterns. */
export function splitTitle(raw: string): { role: string | null; company: string | null } {
  const t = squash(decode(raw));
  if (!t) return { role: null, company: null };

  // "Acme hiring Senior Engineer in Berlin | LinkedIn"
  const li = /^(.+?)\s+hiring\s+(.+?)\s+in\s+.+?\s*\|\s*LinkedIn$/i.exec(t);
  if (li) return { role: li[2], company: li[1] };

  // "Job Application for Senior Engineer at Acme" / "Senior Engineer at Acme | Acme Careers" / "… bei Acme" / "… chez Acme"
  const at = /^(?:job application for\s+|apply for\s+|apply to\s+)?(.+?)\s+(?:at|bei|chez|@)\s+([^|\-–—]+?)(?:\s*[|\-–—].*)?$/i.exec(t);
  if (at && ROLE_WORDS.test(at[1]) && !ROLE_WORDS.test(at[2])) return { role: at[1], company: at[2] };

  const parts = t
    .split(/\s+[-–—|·]\s+|\s*::\s*|\s+:\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !AGGREGATORS.test(p));
  if (parts.length >= 2) {
    const roleIdx = parts.findIndex((p) => ROLE_WORDS.test(p));
    const role = roleIdx >= 0 ? parts[roleIdx] : parts[0];
    const rest = parts.filter((_, i) => i !== (roleIdx >= 0 ? roleIdx : 0));
    // Prefer the segment that announces itself as the employer ("Acme Careers"), else the last one.
    const announced = rest.find((p) => /\b(careers?|jobs?|karriere|hiring|stellenangebote?)\b/i.test(p));
    return { role, company: announced ?? rest[rest.length - 1] ?? null };
  }
  return { role: t, company: null };
}

/** The employer, when the URL belongs to a board that encodes it. */
export function companyFromUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const seg = url.pathname.split('/').filter(Boolean);
  const pick = (s?: string) => (s ? titleCase(decodeURIComponent(s).replace(/[-_]+/g, ' ')) : null);

  if (/(^|\.)greenhouse\.io$/.test(host)) return pick(seg[0]); // boards.greenhouse.io/<org>/jobs/123
  if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') return pick(seg[0]);
  if (host === 'jobs.ashbyhq.com') return pick(seg[0]);
  if (host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com') return pick(seg[0]);
  if (host === 'apply.workable.com') return pick(seg[0]);
  if (host === 'jobs.jobvite.com') return pick(seg[0]);
  if (host === 'jobs.dualoo.com' || host === 'join.com') return pick(seg[0]);
  const wd = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/.exec(host);
  if (wd) return pick(wd[1]);
  const sub = /^([a-z0-9-]+)\.(jobs\.personio\.(?:de|com)|bamboohr\.com|recruitee\.com|teamtailor\.com|breezy\.hr|applytojob\.com|workable\.com|softgarden\.io|onlyfy\.jobs|jobs\.workablemail\.com)$/.exec(host);
  if (sub) return pick(sub[1]);
  if (/(^|\.)(linkedin|indeed|glassdoor|stepstone|xing|monster|ziprecruiter|welcometothejungle|wellfound|dice|otta)\.[a-z.]+$/.test(host)) return null; // aggregators: host ≠ employer

  // careers.acme.com / jobs.acme.de / acme.co.uk → "Acme"
  const labels = host.split('.');
  if (labels.length < 2) return null;
  const second = labels[labels.length - 2];
  const core = labels.length >= 3 && /^(co|com|org|net|ac|gov|edu)$/.test(second) ? labels[labels.length - 3] : second;
  return core && core.length > 1 ? titleCase(core.replace(/[-_]+/g, ' ')) : null;
}

export function metaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const a = /<meta\s+[^>]*?(?:property|name)\s*=\s*["']([^"']+)["'][^>]*?content\s*=\s*["']([^"']*)["']/gi;
  const b = /<meta\s+[^>]*?content\s*=\s*["']([^"']*)["'][^>]*?(?:property|name)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = a.exec(html))) out[m[1].toLowerCase()] ??= squash(decode(m[2]));
  while ((m = b.exec(html))) out[m[2].toLowerCase()] ??= squash(decode(m[1]));
  return out;
}

/** The first JSON-LD JobPosting on the page (handles arrays, @graph, CDATA). */
export function jsonLdJobPosting(html: string): any | null {
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').trim();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const items: any[] = [];
    const walk = (x: any) => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') {
        items.push(x);
        if (x['@graph']) walk(x['@graph']);
        if (x.mainEntity) walk(x.mainEntity);
      }
    };
    walk(data);
    const job = items.find((it) => {
      const t = it['@type'];
      return (Array.isArray(t) ? t : [t]).some((x) => String(x).toLowerCase() === 'jobposting');
    });
    if (job) return job;
  }
  return null;
}

function ldLocation(job: any): string | null {
  const locs: any[] = Array.isArray(job.jobLocation) ? job.jobLocation : job.jobLocation ? [job.jobLocation] : [];
  const names = [
    ...new Set(
      locs
        .map((l) => {
          const a = l?.address ?? l;
          if (typeof a === 'string') return squash(a);
          const city = [a?.addressLocality, a?.addressRegion].filter(Boolean).join(', ');
          return city || a?.addressCountry || l?.name || null;
        })
        .filter(Boolean) as string[],
    ),
  ];
  const remote = /telecommute|remote/i.test(String(job.jobLocationType ?? '')) ? 'Remote' : null;
  const all = [remote, ...names].filter(Boolean) as string[];
  if (!all.length) return null;
  return all.length <= 3 ? all.join(' · ') : `${all.slice(0, 3).join(' · ')} +${all.length - 3} more`;
}

function ldEmployment(job: any): string | null {
  const v = Array.isArray(job.employmentType) ? job.employmentType[0] : job.employmentType;
  if (!v) return null;
  const s = String(v).toLowerCase().replace(/_/g, '-');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── The extractor ──────────────────────────────────────────────────────────

export function extractPosting(html: string, url: URL): { meta: PostingMeta; text: string } {
  const page = htmlToText(html);
  const job = jsonLdJobPosting(html);
  const tags = metaTags(html);
  const h1raw = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const h1 = h1raw ? squash(decode(h1raw.replace(/<[^>]+>/g, ' '))) : null;
  const ogSplit = splitTitle(tags['og:title'] ?? '');
  const titleSplit = splitTitle(page.title ?? '');

  // Company — most trusted source first.
  let company: string | null = null;
  let companySource: CompanySource | null = null;
  const org = job?.hiringOrganization;
  const ldName = typeof org === 'string' ? org : org?.name ?? org?.legalName ?? null;
  const siteName = tags['og:site_name'] && !AGGREGATORS.test(tags['og:site_name']) ? tags['og:site_name'] : null;
  const titled = titleSplit.company ?? ogSplit.company;
  if (ldName && cleanCompany(String(ldName))) {
    company = cleanCompany(String(ldName));
    companySource = 'json-ld';
  } else if (siteName && cleanCompany(siteName)) {
    company = cleanCompany(siteName);
    companySource = 'meta';
  } else if (titled && cleanCompany(titled)) {
    company = cleanCompany(titled);
    companySource = 'title';
  } else {
    company = companyFromUrl(url);
    companySource = company ? 'url' : null;
  }

  // Role — JSON-LD title, then og:title, then the page heading, then <title>.
  const roleRaw = (job?.title && String(job.title)) || ogSplit.role || (h1 && ROLE_WORDS.test(h1) ? h1 : null) || titleSplit.role || page.title || null;
  const role = roleRaw ? cleanRole(roleRaw, company) : null;

  // Location / type / date — JSON-LD only (meta tags rarely carry them reliably).
  const location = job ? ldLocation(job) : null;
  const employmentType = job ? ldEmployment(job) : null;
  const datePosted = job?.datePosted ? String(job.datePosted).slice(0, 10) : null;

  // Text — the JSON-LD description is the posting itself (no nav/footer), but
  // some sites only put a teaser there; use it only when it is substantial.
  const ldDesc = job?.description ? htmlToText(String(job.description)).text : '';
  const text = ldDesc.length >= 800 && ldDesc.length >= page.text.length * 0.6 ? ldDesc : page.text;

  return { meta: { role, company, location, employmentType, datePosted, companySource }, text };
}

// ─── Official job-board APIs ────────────────────────────────────────────────
// Greenhouse, Lever and Ashby pages build the description in the browser, so the
// HTML alone holds little more than the application form. Their public posting
// APIs return the same posting whole — the sanctioned route, no scraping.

interface BoardApi {
  api: string;
  parse: (json: any) => { meta: PostingMeta; text: string } | null;
  /** A second call that names the employer, when the posting itself doesn't. */
  company?: { api: string; name: (json: any) => unknown };
}

const fromHtml = (html: unknown) => htmlToText(decode(String(html ?? ''))).text;
const isoDay = (v: unknown) => {
  const d = v == null || v === '' ? null : new Date(typeof v === 'number' ? v : String(v));
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
};

export function boardApiFor(url: URL): BoardApi | null {
  const host = url.hostname.toLowerCase();
  const [org, a, b] = url.pathname.split('/').filter(Boolean);
  if (!org) return null;
  const company = companyFromUrl(url);
  const meta = (role: unknown, location: unknown, employmentType: unknown, datePosted: unknown, name?: unknown): PostingMeta => {
    const co = (name ? cleanCompany(String(name)) : null) ?? company;
    return {
      role: role ? cleanRole(String(role), co) : null,
      company: co,
      location: location ? squash(String(location)) : null,
      employmentType: employmentType ? squash(String(employmentType)) : null,
      datePosted: isoDay(datePosted),
      companySource: name ? 'json-ld' : 'url',
    };
  };

  // job-boards.greenhouse.io/<board>/jobs/<id> (also boards., and the .eu. variants)
  if (/^(job-)?boards(\.eu)?\.greenhouse\.io$/.test(host) && a === 'jobs' && /^\d+$/.test(b ?? '')) {
    const apiHost = host.includes('.eu.') ? 'boards-api.eu.greenhouse.io' : 'boards-api.greenhouse.io';
    return {
      api: `https://${apiHost}/v1/boards/${encodeURIComponent(org)}/jobs/${b}`,
      parse: (j) => (j?.content ? { meta: meta(j.title, j.location?.name, null, j.first_published ?? j.updated_at, j.company_name), text: fromHtml(j.content) } : null),
    };
  }
  // jobs.lever.co/<company>/<uuid>
  if ((host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') && /^[0-9a-f-]{36}$/i.test(a ?? '')) {
    const apiHost = host === 'jobs.eu.lever.co' ? 'api.eu.lever.co' : 'api.lever.co';
    return {
      api: `https://${apiHost}/v0/postings/${encodeURIComponent(org)}/${a}`,
      parse: (j) => {
        if (!j?.text) return null;
        const lists = (j.lists ?? []).map((l: any) => `${l.text ?? ''}\n${fromHtml(l.content)}`);
        const text = [j.descriptionPlain ?? fromHtml(j.description), ...lists, j.additionalPlain ?? ''].filter(Boolean).join('\n\n');
        return { meta: meta(j.text, j.categories?.location, j.categories?.commitment, j.createdAt), text };
      },
    };
  }
  // jobs.ashbyhq.com/<org>/<uuid> — the board API lists every open job; pick this one.
  if (host === 'jobs.ashbyhq.com' && /^[0-9a-f-]{36}$/i.test(a ?? '')) {
    return {
      api: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}`,
      parse: (j) => {
        const job = (j?.jobs ?? []).find((x: any) => x.id === a);
        return job ? { meta: meta(job.title, job.location, job.employmentType, job.publishedAt), text: job.descriptionPlain ?? fromHtml(job.descriptionHtml) } : null;
      },
    };
  }
  // apply.workable.com/<org>/j/<shortcode> — description, requirements and benefits are separate fields.
  if (host === 'apply.workable.com' && a === 'j' && /^[0-9A-Z]{6,12}$/i.test(b ?? '')) {
    return {
      api: `https://apply.workable.com/api/v2/accounts/${encodeURIComponent(org)}/jobs/${b}`,
      company: { api: `https://apply.workable.com/api/v1/accounts/${encodeURIComponent(org)}`, name: (j) => j?.name },
      parse: (j) => {
        if (!j?.title) return null;
        const where = j.location ? [j.location.city, j.location.region, j.location.country].filter(Boolean).join(', ') : '';
        const location = j.workplace === 'remote' ? (where ? `Remote · ${where}` : 'Remote') : where || null;
        const text = [
          fromHtml(j.description),
          j.requirements ? `Requirements\n${fromHtml(j.requirements)}` : '',
          j.benefits ? `Benefits\n${fromHtml(j.benefits)}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');
        return { meta: meta(j.title, location, j.type ? String(j.type).replace(/^full$/, 'Full-time').replace(/^part$/, 'Part-time') : null, j.published), text };
      },
    };
  }
  return null;
}

/** Known board postings this page links to (an "Apply" button, an iframe) — at most a few, page order. */
export function linkedBoardUrls(html: string, base: URL): URL[] {
  const out: URL[] = [];
  const re = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 4) {
    let u: URL;
    try {
      u = new URL(decode(m[1]), base);
    } catch {
      continue;
    }
    // Greenhouse's embedded application iframe: …/embed/job_app?for=<board>&token=<id>
    const gh = /(?:^|\.)greenhouse\.io$/.test(u.hostname) && /\/embed\/job_app/.test(u.pathname) ? u : null;
    if (gh && gh.searchParams.get('for') && /^\d+$/.test(gh.searchParams.get('token') ?? '')) {
      u = new URL(`https://job-boards.greenhouse.io/${gh.searchParams.get('for')}/jobs/${gh.searchParams.get('token')}`);
    }
    if (u.href !== base.href && boardApiFor(u) && !out.some((x) => x.href === u.href)) out.push(u);
  }
  return out;
}

// ─── App state: pages built by JavaScript often ship the posting as JSON ────
// Next.js (__NEXT_DATA__), Nuxt and most single-page career sites embed the
// data they render in a <script type="application/json"> tag. The posting is
// the longest prose-like string in there; its sibling "title"/"name" is the role.

export function appStatePosting(html: string): { role: string | null; text: string } | null {
  const re = /<script[^>]*type\s*=\s*["']application\/(?:json|ld\+json)["'][^>]*>([\s\S]*?)<\/script>/gi;
  let best: { role: string | null; text: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1].length < 400) continue;
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const walk = (node: unknown, depth: number): void => {
      if (depth > 40 || node == null || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      for (const [key, v] of Object.entries(obj)) {
        if (typeof v === 'string' && v.length >= 600 && /description|content|body|text|details|html/i.test(key)) {
          const text = /<[a-z][\s\S]*>/i.test(v) ? htmlToText(v).text : v.replace(/\r/g, '').trim();
          // Prose, not a blob: real words and sentence breaks.
          if (text.length >= 600 && /[.!?:]\s/.test(text) && (text.match(/[a-z]{3,}/gi)?.length ?? 0) > 80 && text.length > (best?.text.length ?? 0)) {
            const title = obj.title ?? obj.name ?? obj.jobTitle ?? obj.positionName;
            best = { role: typeof title === 'string' && title.length < 160 ? squash(title) : null, text };
          }
        } else if (typeof v === 'object') walk(v, depth + 1);
      }
    };
    walk(data, 0);
  }
  return best;
}

/** The job board behind a URL or page, when we can tell — for an error that says what to do next. */
export function detectBoard(url: URL, html = ''): string | null {
  const hay = `${url.hostname} ${url.search} ${html.slice(0, 400_000)}`;
  const boards: [string, RegExp][] = [
    ['Ashby', /ashbyhq\.com|ashby_jid/i],
    ['Greenhouse', /greenhouse\.io|gh_jid/i],
    ['Lever', /lever\.co/i],
    ['Workable', /workable\.com/i],
    ['Workday', /myworkdayjobs\.com|myworkdaysite\.com/i],
    ['SmartRecruiters', /smartrecruiters\.com/i],
    ['Personio', /personio\.(?:de|com)/i],
    ['Recruitee', /recruitee\.com/i],
    ['Teamtailor', /teamtailor\.com/i],
    ['SuccessFactors', /successfactors\.(?:com|eu)|jobs\.sap\.com/i],
    ['iCIMS', /icims\.com/i],
    ['Taleo', /taleo\.net/i],
  ];
  return boards.find(([, re]) => re.test(hay))?.[0] ?? null;
}

// ─── Boards embedded in a company's own careers page ────────────────────────
// acme.com/careers?ashby_jid=<uuid> or ?gh_jid=<id> carries the job id but not
// the board name, and the page itself is an empty shell the embed script fills.
// The board name usually sits in that embed code; when it doesn't, the domain
// is a good guess (ashbyhq.com → "ashby"). A candidate only counts if the
// board's public API actually lists this exact job id, so a guess can never
// return somebody else's posting.

export interface EmbeddedJob {
  kind: 'ashby' | 'greenhouse';
  jobId: string;
}

export function embeddedJob(url: URL): EmbeddedJob | null {
  const ashby = url.searchParams.get('ashby_jid');
  if (ashby && /^[0-9a-f-]{36}$/i.test(ashby)) return { kind: 'ashby', jobId: ashby.toLowerCase() };
  const gh = url.searchParams.get('gh_jid');
  if (gh && /^\d+$/.test(gh)) return { kind: 'greenhouse', jobId: gh };
  return null;
}

/** Board names in the page's embed code, then guesses from the domain — most likely first. */
export function boardCandidates(kind: EmbeddedJob['kind'], url: URL, html: string): string[] {
  const found: string[] = [];
  const add = (s: string | undefined) => {
    const b = s ? decodeURIComponent(s).trim() : '';
    if (b && /^[\w.-]{1,80}$/.test(b) && !found.includes(b)) found.push(b);
  };
  let m: RegExpExecArray | null;
  if (kind === 'ashby') {
    const re = /jobs\.ashbyhq\.com\/([\w.%-]+)/g;
    while ((m = re.exec(html))) if (!/^(api|embed|static)$/i.test(m[1])) add(m[1]);
    const conf = /organizationHostedJobsPageName["'\s:=]+["']([\w.%-]+)["']/g;
    while ((m = conf.exec(html))) add(m[1]);
  } else {
    const re = /(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=|embed\/job_app\?for=)?([\w.%-]+)/g;
    while ((m = re.exec(html))) if (!/^(embed|v1|jobs)$/i.test(m[1])) add(m[1]);
  }
  // careers.acme-labs.com → acme-labs, acmelabs; ashbyhq.com → ashbyhq, ashby
  const labels = url.hostname.toLowerCase().replace(/^www\./, '').split('.');
  const second = labels[labels.length - 2] ?? '';
  const core = labels.length >= 3 && /^(co|com|org|net|ac|gov|edu)$/.test(second) ? labels[labels.length - 3] : second;
  if (core) {
    add(core);
    add(core.replace(/-/g, ''));
    add(core.replace(/(hq|careers|jobs|app|inc|labs|io)$/, ''));
  }
  return found.slice(0, 6);
}

/** The board-hosted URL for an embedded job — what boardApiFor already knows how to read. */
const boardUrl = (job: EmbeddedJob, board: string) =>
  new URL(
    job.kind === 'ashby'
      ? `https://jobs.ashbyhq.com/${encodeURIComponent(board)}/${job.jobId}`
      : `https://job-boards.greenhouse.io/${encodeURIComponent(board)}/jobs/${job.jobId}`,
  );

async function fetchEmbedded(url: URL, job: EmbeddedJob): Promise<{ meta: PostingMeta; text: string } | null> {
  // The company's page may name the board in its embed code, and its own name in og:site_name.
  let html = '';
  try {
    if (await robotsAllows(url)) {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
      if (res.ok) html = (await res.text()).slice(0, 2_000_000);
    }
  } catch {
    /* guesses from the domain still work */
  }
  for (const board of boardCandidates(job.kind, url, html)) {
    const got = await fetchFromBoardApi(boardUrl(job, board));
    if (!got) continue;
    const site = metaTags(html)['og:site_name'];
    const company = (site && !AGGREGATORS.test(site) ? cleanCompany(site) : null) ?? companyFromUrl(url) ?? got.meta.company;
    return { meta: { ...got.meta, company, companySource: site ? 'meta' : 'url' }, text: got.text };
  }
  return null;
}

async function fetchFromBoardApi(url: URL): Promise<{ meta: PostingMeta; text: string } | null> {
  const board = boardApiFor(url);
  if (!board) return null;
  try {
    const api = new URL(board.api);
    if (!(await robotsAllows(api))) return null;
    const res = await fetch(api, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const got = board.parse(await res.json());
    if (!got || got.text.length < 200) return null;
    if (board.company) {
      const name = await fetch(board.company.api, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => board.company!.name(j))
        .catch(() => null);
      const co = typeof name === 'string' ? cleanCompany(name) : null;
      if (co) got.meta = { ...got.meta, company: co, companySource: 'json-ld' };
    }
    return got;
  } catch {
    return null; // fall back to the page itself
  }
}

// ─── Fetch a posting by URL (politely), then extract + guard ────────────────

export async function fetchPosting(input: string): Promise<FetchedPosting> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('That does not look like a valid URL.');
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) URLs are supported.');
  if (isPrivateHost(url.hostname)) throw new Error('Refusing to fetch a private/local address.');

  const embedded = embeddedJob(url);
  const board = embedded ? await fetchEmbedded(url, embedded) : await fetchFromBoardApi(url);
  if (board) {
    const { text, flags } = postingGuard(board.text);
    const meta = guardMeta(board.meta);
    return { ...meta, text: text.slice(0, 20000), title: meta.role, flags, url: url.toString() };
  }

  if (!(await robotsAllows(url))) {
    throw new Error('This site disallows automated fetching (robots.txt). Paste the posting text instead.');
  }

  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`The site returned HTTP ${res.status}. Paste the posting text instead.`);
  const ct = res.headers.get('content-type') ?? '';
  const body = await res.text();
  const isHtml = ct.includes('html') || /<html[\s>]/i.test(body);
  let extracted = isHtml
    ? extractPosting(body, url)
    : { meta: { role: null, company: companyFromUrl(url), location: null, employmentType: null, datePosted: null, companySource: 'url' as const }, text: body };

  // A thin page is usually a JavaScript shell. Before giving up, in order:
  // the JSON the page ships for its own renderer, then a job board it links to.
  if (isHtml && extracted.text.length < 600) {
    const state = appStatePosting(body);
    if (state && state.text.length > extracted.text.length) {
      extracted = { meta: { ...extracted.meta, role: extracted.meta.role ?? (state.role ? cleanRole(state.role, extracted.meta.company) : null) }, text: state.text };
    }
  }
  if (isHtml && extracted.text.length < 600) {
    for (const linked of linkedBoardUrls(body, url)) {
      const got = await fetchFromBoardApi(linked);
      if (!got) continue;
      // The company's own page names the company better than a board slug does.
      const ownCompany = extracted.meta.companySource && extracted.meta.companySource !== 'url' ? extracted.meta.company : null;
      extracted = { meta: { ...got.meta, company: ownCompany ?? got.meta.company, companySource: ownCompany ? extracted.meta.companySource : got.meta.companySource }, text: got.text };
      break;
    }
  }

  if (extracted.text.length < 200) {
    const ats = detectBoard(url, isHtml ? body : '');
    throw new Error(
      ats
        ? `This ${ats} page builds the posting with JavaScript, and Callback couldn't reach it through ${ats}'s public data. Open the posting, copy its text, and paste it below — or try the direct ${ats} job link (the "Apply" button usually points to it).`
        : 'Could not extract a posting from that page (it may need JavaScript or a login). Open it, copy the text, and paste it below.',
    );
  }
  const { text, flags } = postingGuard(extracted.text);
  const meta = guardMeta(extracted.meta);
  return { ...meta, text: text.slice(0, 20000), title: meta.role, flags, url: url.toString() };
}

/** The page's own company, role and location are untrusted too: they reach prompts and approval titles. */
function guardMeta<T extends { company: string | null; role: string | null; location: string | null }>(meta: T): T {
  return { ...meta, company: guardField(meta.company, 120), role: guardField(meta.role), location: guardField(meta.location) };
}

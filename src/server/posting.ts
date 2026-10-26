// ─── Posting extraction: what a job page tells us about the job ─────────────
// Most job pages carry structured data. In order of trust:
//   1. JSON-LD <script type="application/ld+json"> with @type JobPosting
//      (title, hiringOrganization, jobLocation, datePosted, employmentType) —
//      what Google for Jobs indexes, so boards and career sites publish it.
//   2. Open Graph / Twitter meta tags (og:title, og:site_name).
//   3. The <title> tag, split on "Role - Company" / "Role at Company" patterns.
//   4. The URL itself: known boards put the employer in the host or path.
// Everything here is still UNTRUSTED input — the text goes through postingGuard.

import { htmlToText, postingGuard, robotsAllows, isPrivateHost, UA } from './guard';

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

function metaTags(html: string): Record<string, string> {
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
  const extracted = isHtml
    ? extractPosting(body, url)
    : { meta: { role: null, company: companyFromUrl(url), location: null, employmentType: null, datePosted: null, companySource: 'url' as const }, text: body };
  if (extracted.text.length < 200) {
    throw new Error('Could not extract a posting from that page (it may need JavaScript or a login). Paste the text instead.');
  }
  const { text, flags } = postingGuard(extracted.text);
  return { ...extracted.meta, text: text.slice(0, 20000), title: extracted.meta.role, flags, url: url.toString() };
}

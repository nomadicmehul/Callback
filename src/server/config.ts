import fs from 'node:fs';
import { DEFAULT_DOC_FORMAT, type DocFormat, type ProfileSource } from '@shared/types';
import { CONFIG_PATH } from './paths';

// Non-secret settings live in the DB; the API key lives here, in a 0600 file
// under the user's home dir. (A future version can move it to the OS keychain.)
export interface StoredConfig {
  apiKey?: string;
  /** The candidate's real experience (resume text). Grounds every draft. */
  candidateProfile?: string;
  profileSource?: ProfileSource;
  /** How exported documents look; missing fields fall back to the defaults. */
  docFormat?: Partial<DocFormat>;
}

let cache: StoredConfig | null = null;

function read(): StoredConfig {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as StoredConfig;
  } catch {
    cache = {};
  }
  return cache;
}

function write(cfg: StoredConfig): void {
  cache = cfg;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  // Tighten perms even if the file already existed with looser ones.
  try {
    fs.chmodSync(CONFIG_PATH, 0o600);
  } catch {
    /* best effort */
  }
}

export function getConfig(): StoredConfig {
  return { ...read() };
}

export function setConfig(patch: Partial<StoredConfig>): StoredConfig {
  const next = { ...read(), ...patch };
  write(next);
  return { ...next };
}

/** The effective API key: explicit config wins, else the environment. */
export function resolveApiKey(): string | undefined {
  const fromConfig = read().apiKey?.trim();
  if (fromConfig) return fromConfig;
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  return fromEnv || undefined;
}

export function hasApiKey(): boolean {
  return Boolean(resolveApiKey());
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** A complete, valid format from whatever was stored or sent; an invalid value keeps the `base` one. */
export function cleanDocFormat(raw: Partial<DocFormat> | undefined, base: DocFormat = DEFAULT_DOC_FORMAT): DocFormat {
  const d = base;
  const r = raw ?? {};
  return {
    pageSize: pick(r.pageSize, ['A4', 'LETTER'] as const, d.pageSize),
    headerOrder: pick(r.headerOrder, ['auto', 'contact-first', 'headline-first'] as const, d.headerOrder),
    align: pick(r.align, ['center', 'left'] as const, d.align),
    font: pick(r.font, ['sans', 'serif'] as const, d.font),
    headingCase: pick(r.headingCase, ['upper', 'as-written'] as const, d.headingCase),
    accent: hex(r.accent) ?? d.accent,
    nameColor: r.nameColor === null ? null : (hex(r.nameColor) ?? d.nameColor),
    fontName: r.fontName === null ? null : typeof r.fontName === 'string' && /^[\w .'-]{1,40}$/.test(r.fontName.trim()) ? r.fontName.trim() : d.fontName,
    sizes: {
      name: pt(r.sizes?.name, 12, 40) ?? d.sizes.name,
      contact: pt(r.sizes?.contact, 7, 14) ?? d.sizes.contact,
      headline: pt(r.sizes?.headline, 7, 18) ?? d.sizes.headline,
      heading: pt(r.sizes?.heading, 7, 18) ?? d.sizes.heading,
      body: pt(r.sizes?.body, 7, 14) ?? d.sizes.body,
    },
    headingRule: typeof r.headingRule === 'boolean' ? r.headingRule : d.headingRule,
    margin: pt(r.margin, 18, 90) ?? d.margin,
    learnedFrom: r.learnedFrom === null ? null : typeof r.learnedFrom === 'string' ? r.learnedFrom.slice(0, 120) : d.learnedFrom,
  };
}
const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null);
/** A point size within sensible bounds, rounded to a half point. */
const pt = (v: unknown, min: number, max: number) => (typeof v === 'number' && v >= min && v <= max ? Math.round(v * 2) / 2 : null);

export const getDocFormat = (): DocFormat => cleanDocFormat(read().docFormat);

export function hasProfile(): boolean {
  return (read().candidateProfile?.trim().length ?? 0) > 0;
}

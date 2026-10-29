// ─── Learn a document format from the person's own CV (.docx) ───────────────
// "Bring your own format": read how their Word CV looks — font, sizes, colours,
// header order, heading style, page — and turn it into a DocFormat they can
// preview and save. Plain regex over the OOXML; nothing is executed or kept.

import type { DocFormat } from '@shared/types';
import { isContactLine } from './cvtext';
import { unzip } from './experience';

interface RunProps {
  size?: number;
  color?: string;
  bold?: boolean;
  caps?: boolean;
  font?: string;
}
interface Para {
  text: string;
  style: string | null;
  align: string | null;
  border: boolean;
  runs: { text: string; props: RunProps }[];
  /** Props of the paragraph's longest run — what it "looks like". */
  props: RunProps;
}

const val = (xml: string, tag: string, name = 'w:val') => new RegExp(`<${tag}\\b[^>]*?\\s${name}="([^"]*)"`).exec(xml)?.[1] ?? null;
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const on = (xml: string, tag: string) =>
  new RegExp(`<${tag}(?:\\s+w:val="(?:1|true|on)")?\\s*/>`).test(xml) ? true : new RegExp(`<${tag}\\s+w:val="(?:0|false|off)"\\s*/>`).test(xml) ? false : undefined;

function runProps(rPr: string): RunProps {
  const sz = val(rPr, 'w:sz');
  const color = val(rPr, 'w:color');
  const theme = val(rPr, 'w:rFonts', 'w:asciiTheme');
  return {
    size: sz ? Number(sz) / 2 : undefined,
    color: color && /^[0-9a-f]{6}$/i.test(color) ? `#${color.toUpperCase()}` : undefined,
    bold: on(rPr, 'w:b'),
    caps: on(rPr, 'w:caps'),
    font: val(rPr, 'w:rFonts', 'w:ascii') ?? val(rPr, 'w:rFonts', 'w:hAnsi') ?? (theme ? `theme:${theme}` : undefined),
  };
}
const merge = (...ps: (RunProps | undefined)[]): RunProps =>
  ps.reduce<RunProps>((acc, p) => {
    for (const [k, v] of Object.entries(p ?? {})) if (v !== undefined) (acc as any)[k] = v;
    return acc;
  }, {});

/** Paragraph styles with their basedOn chain resolved. */
function readStyles(xml: string) {
  const raw = new Map<string, { basedOn: string | null; props: RunProps; align: string | null; border: boolean }>();
  for (const m of xml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const body = m[2];
    raw.set(m[1], {
      basedOn: val(body, 'w:basedOn'),
      props: runProps(/<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(body)?.[1] ?? ''),
      align: val(body, 'w:jc'),
      border: /<w:pBdr>[\s\S]*?<w:bottom\b/.test(body),
    });
  }
  const resolve = (id: string | null, depth = 0): { props: RunProps; align: string | null; border: boolean } => {
    const s = id ? raw.get(id) : undefined;
    if (!s || depth > 8) return { props: {}, align: null, border: false };
    const parent = resolve(s.basedOn, depth + 1);
    return { props: merge(parent.props, s.props), align: s.align ?? parent.align, border: s.border || parent.border };
  };
  const defaults = runProps(/<w:rPrDefault>[\s\S]*?<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(xml)?.[1] ?? '');
  return { resolve, defaults };
}

/** The value that carries the most text (a weighted mode). */
function dominant<T>(items: { value: T | undefined; weight: number }[]): T | undefined {
  const tally = new Map<T, number>();
  for (const { value, weight } of items) if (value !== undefined) tally.set(value, (tally.get(value) ?? 0) + weight);
  return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const SERIF = /times|georgia|garamond|cambria|palatino|book antiqua|baskerville|merriweather|charter|didot|bodoni|caslon|minion|playfair|libre baskerville|pt serif|noto serif|source serif|lora/i;
const isUpper = (t: string) => /[A-Z]/.test(t) && t === t.toUpperCase();

export function learnFormat(data: Uint8Array, filename: string): { format: Partial<DocFormat>; found: string[] } {
  const files = unzip(data, (n) => /^word\/(document|styles)\.xml$|^word\/theme\/theme1\.xml$/.test(n));
  const doc = files.get('word/document.xml');
  if (!doc) throw new Error('That isn’t a Word document. Upload your CV as .docx (Word → Save As → .docx).');
  const { resolve, defaults } = readStyles(files.get('word/styles.xml') ?? '');
  const theme = files.get('word/theme/theme1.xml') ?? '';
  const themeFont = (which: string) =>
    new RegExp(`<a:${/major/i.test(which) ? 'major' : 'minor'}Font>[\\s\\S]*?<a:latin typeface="([^"]+)"`).exec(theme)?.[1];
  const fontOf = (f?: string) => (f?.startsWith('theme:') ? themeFont(f) : f);

  const paras: Para[] = [];
  for (const m of doc.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const inner = m[1] ?? '';
    const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(inner)?.[1] ?? '';
    const styleId = val(pPr, 'w:pStyle');
    const st = resolve(styleId);
    const runs = [...inner.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)].map((r) => ({
      text: decode([...r[1].matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g)].map((t) => t[1] ?? '\t').join('')),
      props: merge(defaults, st.props, runProps(/<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(r[1])?.[1] ?? '')),
    }));
    const text = runs.map((r) => r.text).join('').trim();
    if (!text) continue;
    const longest = runs.reduce((a, b) => (b.text.trim().length > a.text.trim().length ? b : a), runs[0]);
    paras.push({ text, style: styleId, align: val(pPr, 'w:jc') ?? st.align, border: /<w:pBdr>[\s\S]*?<w:bottom\b/.test(pPr) || st.border, runs, props: longest.props });
  }
  if (paras.length < 3) throw new Error('Couldn’t find enough text in that document to learn its format.');

  const isHeading = (p: Para, i: number) =>
    i > 0 && p.text.length < 70 && (p.border || /heading/i.test(p.style ?? '') || (!!p.props.bold && (isUpper(p.text) || !!p.props.caps) && !isContactLine(p.text)));
  const name = paras[0];
  let first = paras.findIndex((p, i) => isHeading(p, i));
  if (first < 0) first = Math.min(paras.length, 4);
  const header = paras.slice(1, first);
  const contact = header.filter((p) => isContactLine(p.text));
  const headline = header.filter((p) => !isContactLine(p.text));
  const headings = paras.slice(first).filter((p, i) => isHeading(p, i + first));
  const body = paras.slice(first).filter((p, i) => !isHeading(p, i + first));
  const weighted = <T,>(ps: Para[], pick: (r: RunProps) => T | undefined) =>
    dominant(ps.flatMap((p) => p.runs.map((r) => ({ value: pick(r.props), weight: r.text.length }))));

  const fontName = fontOf(weighted(body.length ? body : paras, (r) => r.font));
  const pgW = Number(val(doc, 'w:pgSz', 'w:w') ?? 0);
  const marginTw = Number(val(doc, 'w:pgMar', 'w:left') ?? 0);
  const headingColor = dominant(headings.map((h) => ({ value: h.props.color ?? '#000000', weight: 1 })));
  const format: Partial<DocFormat> = {
    learnedFrom: filename,
    fontName: fontName ?? null,
    font: fontName && SERIF.test(fontName) ? 'serif' : 'sans',
    align: name.align === 'center' ? 'center' : 'left',
    nameColor: name.props.color ?? '#000000',
    accent: headingColor ?? name.props.color ?? '#000000',
    headingCase: headings.length && headings.filter((h) => isUpper(h.text) || h.props.caps).length >= headings.length / 2 ? 'upper' : 'as-written',
    headingRule: headings.length ? headings.filter((h) => h.border).length >= headings.length / 2 : true,
    ...(contact.length && headline.length ? { headerOrder: header.indexOf(contact[0]) < header.indexOf(headline[0]) ? 'contact-first' : 'headline-first' } : {}),
    ...(Math.abs(pgW - 12240) < 300 ? { pageSize: 'LETTER' } : Math.abs(pgW - 11906) < 300 ? { pageSize: 'A4' } : {}),
    ...(marginTw ? { margin: Math.round(marginTw / 20) } : {}),
    sizes: {
      name: name.props.size ?? 22,
      contact: contact[0]?.props.size ?? 9,
      headline: headline[0]?.props.size ?? 10.5,
      heading: dominant(headings.map((h) => ({ value: h.props.size, weight: 1 }))) ?? 10.5,
      body: weighted(body, (r) => r.size) ?? 10,
    },
  };

  const s = format.sizes!;
  const found = [
    `Font: ${fontName ?? 'not set (keeping the default)'}`,
    `Name: ${s.name}pt, ${format.align === 'center' ? 'centered' : 'left'}, ${format.nameColor}`,
    contact.length && headline.length
      ? `Under the name: ${format.headerOrder === 'contact-first' ? 'contact line, then headline' : 'headline, then contact line'}`
      : 'Under the name: only one line found',
    `Headings: ${format.headingCase === 'upper' ? 'UPPERCASE' : 'as written'}, ${s.heading}pt, ${format.accent}${format.headingRule ? ', with a rule' : ''}`,
    `Body text: ${s.body}pt`,
    `Page: ${format.pageSize ?? 'size not set'}${format.margin ? `, ${format.margin}pt margins` : ''}`,
  ];
  return { format, found };
}

// ─── Fonts installed on this machine ────────────────────────────────────────
// A CV's own font (learned from its .docx) is embedded in exported PDFs when it
// is installed here, so the export looks like the person's own document.
// Read-only: we only look for font files, never install or copy them.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface FontFiles {
  regular: string;
  bold: string;
  italic: string;
}

function fontDirs(): string[] {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return [
      '/System/Library/Fonts',
      '/System/Library/Fonts/Supplemental',
      '/Library/Fonts',
      path.join(home, 'Library/Fonts'),
      '/Applications/Microsoft Word.app/Contents/Resources/DFonts', // Office ships Calibri, Cambria…
    ];
  }
  if (process.platform === 'win32') {
    return [path.join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA ?? home, 'Microsoft', 'Windows', 'Fonts')];
  }
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(home, '.local/share/fonts'), path.join(home, '.fonts')];
}

function walk(dir: string, depth: number, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0) walk(p, depth - 1, out);
    else if (/\.(ttf|otf)$/i.test(e.name)) out.push(p);
  }
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const cache = new Map<string, FontFiles | null>();
let installed: string[] | null = null;

/** Regular / bold / italic files for a font family, or null when it isn't installed.
 *  Handles "Lato-Bold.ttf" style names and Windows-style "calibrib.ttf" (b = bold, i = italic). */
export function findFontFiles(family: string): FontFiles | null {
  const k = key(family);
  if (!k) return null;
  if (cache.has(k)) return cache.get(k)!;
  if (!installed) {
    installed = [];
    for (const d of fontDirs()) walk(d, 3, installed);
  }
  const ours = installed
    .map((f) => ({ f, style: key(path.basename(f).replace(/\.(ttf|otf)$/i, '')) }))
    .filter((x) => x.style.startsWith(k))
    .map((x) => ({ ...x, style: x.style.slice(k.length) }));
  const pick = (styles: string[]) => ours.find((x) => styles.includes(x.style))?.f ?? null;
  const regular = pick(['', 'regular', 'r', 'roman', 'book']);
  const found = regular ? { regular, bold: pick(['bold', 'b', 'bd']) ?? regular, italic: pick(['italic', 'i', 'it', 'oblique']) ?? regular } : null;
  cache.set(k, found);
  return found;
}

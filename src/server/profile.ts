import fs from 'node:fs';
import path from 'node:path';
import { FILES_DIR } from './paths';
import { normalizeText } from './guard';

export type ProfileKind = 'pdf' | 'docx' | 'text';

/** Extract plain text from an uploaded resume. Pure JS — no native deps. */
export async function extractProfileText(filename: string, data: Uint8Array): Promise<{ text: string; kind: ProfileKind }> {
  const ext = path.extname(filename).toLowerCase();
  const isPdf = ext === '.pdf' || (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46); // %PDF
  const isZip = data[0] === 0x50 && data[1] === 0x4b; // PK — .docx is a zip

  if (isPdf) {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: true });
    return { text: normalizeText(String(text)).text, kind: 'pdf' };
  }
  if (ext === '.docx' || isZip) {
    const mod: any = await import('mammoth');
    const mammoth = mod.default ?? mod;
    const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return { text: normalizeText(String(result.value ?? '')).text, kind: 'docx' };
  }
  return { text: normalizeText(Buffer.from(data).toString('utf8')).text, kind: 'text' };
}

/** Keep the original upload under ~/.callback/files/profile/ for the user's reference. */
export function saveProfileFile(filename: string, data: Uint8Array): string {
  const dir = path.join(FILES_DIR, 'profile');
  fs.mkdirSync(dir, { recursive: true });
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'resume';
  const dest = path.join(dir, safe);
  fs.writeFileSync(dest, data);
  return dest;
}

import type { ApplicationStatus } from '@shared/types';
export { eventIcon, eventText, fmtTime } from '@shared/events';

export const BOARD_COLUMNS: ApplicationStatus[] = [
  'saved',
  'drafting',
  'ready',
  'applied',
  'screen',
  'interview',
  'offer',
  'rejected',
];

export const ALL_STATUSES: ApplicationStatus[] = [
  'saved',
  'drafting',
  'ready',
  'applied',
  'screen',
  'interview',
  'offer',
  'rejected',
  'ghosted',
  'withdrawn',
];

export const statusVar = (s: ApplicationStatus) => `var(--s-${s})`;

/** Deliberately tiny markdown → HTML, for previewing drafts. Escapes first. */
export function miniMarkdown(src: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = src.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^#\s+/.test(line)) {
      closeList();
      out.push(`<h1>${inline(esc(line.replace(/^#\s+/, '')))}</h1>`);
    } else if (/^##\s+/.test(line)) {
      closeList();
      out.push(`<h2>${inline(esc(line.replace(/^##\s+/, '')))}</h2>`);
    } else if (/^>\s?/.test(line)) {
      closeList();
      out.push(`<blockquote>${inline(esc(line.replace(/^>\s?/, '')), false)}</blockquote>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(esc(line.replace(/^[-*]\s+/, '')))}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else if (/^---+$/.test(line)) {
      closeList();
      out.push('<hr class="sep" />');
    } else {
      closeList();
      out.push(`<p>${inline(esc(line))}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

/** Links, bold + code; `[fill in: …]` gaps are highlighted unless they're quoted in an editorial note. */
function inline(s: string, gaps = true): string {
  const out = s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  return gaps ? out.replace(/\[fill in:[^\]]*\]/gi, '<mark class="gap">$&</mark>') : out;
}

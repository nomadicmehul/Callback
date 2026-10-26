// Pure formatters for run events, shared by the web dashboard and the TUI.
import type { RunEvent } from './types';

export function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function eventIcon(e: RunEvent): string {
  switch (e.type) {
    case 'agent':
      return '◆';
    case 'tool_use':
      return '→';
    case 'tool_result':
      return '✓';
    case 'artifact':
      return '▣';
    case 'approval_request':
      return '⏸';
    case 'approval_resolved':
      return e.decision === 'allow' ? '✅' : '🚫';
    case 'memory_proposed':
      return '🧠';
    case 'cost':
      return '≈';
    case 'done':
      return '✔';
    case 'error':
      return '⚠';
    case 'thinking':
      return '…';
    case 'interview_question':
      return '❓';
    case 'interview_score':
      return '📊';
    case 'interview_done':
      return '🏁';
    default:
      return '•';
  }
}

export function eventText(e: RunEvent): string {
  switch (e.type) {
    case 'status':
      return e.note ? `${cap(e.status)} — ${e.note}` : cap(e.status);
    case 'agent':
      return `${e.agent}  ·  ${e.model}`;
    case 'thinking':
      return e.text;
    case 'text':
      return e.text;
    case 'tool_use':
      return `${e.tool}(${shortInput(e.input)})`;
    case 'tool_result':
      return `${e.tool}: ${e.summary}`;
    case 'approval_request':
      return `Awaiting your approval — ${e.approval.title}`;
    case 'approval_resolved':
      return e.decision === 'allow' ? 'You approved the draft' : 'You discarded the draft';
    case 'artifact':
      return `Saved ${e.artifact.kind.replace('_', ' ')} — ${e.artifact.title}`;
    case 'memory_proposed':
      return `Proposed lesson — ${e.note.content}`;
    case 'cost':
      return `Run cost ≈ $${e.costUsd.toFixed(2)}`;
    case 'done':
      return `Done — ${e.summary}`;
    case 'error':
      return `Error — ${e.message}`;
    case 'interview_question':
      return `Q${e.turn.seq} (${e.turn.dimension}): ${e.turn.question.slice(0, 90)}`;
    case 'interview_score':
      return `Q${e.turn.seq} scored ${e.turn.score?.overall ?? '?'}/5 — ${e.turn.score?.fix.slice(0, 70) ?? ''}`;
    case 'interview_done':
      return `Interview finished — ${e.summary}`;
    default:
      return '';
  }
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ');

export function shortInput(input: unknown): string {
  if (!input || typeof input !== 'object') return String(input ?? '');
  const o = input as Record<string, unknown>;
  if (typeof o.query === 'string') return `"${o.query}"`.slice(0, 48);
  if (typeof o.applicationId === 'string') return o.applicationId as string;
  const s = JSON.stringify(o);
  return s.length > 46 ? s.slice(0, 46) + '…' : s;
}

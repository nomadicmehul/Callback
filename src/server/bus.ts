import { EventEmitter } from 'node:events';
import type { RunEvent } from '@shared/types';
import type { RunEmit } from './runctx';
import { appendRunEvent } from './db';

// A tiny pub/sub that (1) persists every run event to the DB so a run can be
// replayed on reload, and (2) fans it out to connected dashboard SSE clients.
const emitter = new EventEmitter();
emitter.setMaxListeners(0); // many SSE clients + run loops

export function emitRunEvent(event: RunEvent): void {
  try {
    appendRunEvent(event);
  } catch (err) {
    console.error('[bus] failed to persist event', err);
  }
  emitter.emit('event', event);
}

export function subscribe(listener: (event: RunEvent) => void): () => void {
  emitter.on('event', listener);
  return () => emitter.off('event', listener);
}

/** Build an emit function bound to a run, filling in runId + timestamp. */
export function emitterForRun(runId: string): RunEmit {
  return (event): void => {
    emitRunEvent({ ...event, runId, ts: event.ts ?? new Date().toISOString() } as RunEvent);
  };
}

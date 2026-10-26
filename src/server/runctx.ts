import type { RunEvent } from '@shared/types';

// Distributive Omit so each member of the RunEvent union keeps its own fields
// after we strip the parts the emitter fills in (runId, ts).
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

export type RunEmit = (event: DistributiveOmit<RunEvent, 'runId' | 'ts'> & { ts?: string }) => void;

/** Everything a driver or MCP tool needs to report progress for one run. */
export interface RunContext {
  runId: string;
  applicationId: string | null;
  /** Set when the run is driving a mock-interview session. */
  sessionId?: string;
  emit: RunEmit;
}

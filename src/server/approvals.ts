import { createApproval, resolveApprovalRow } from './db';
import { emitRunEvent } from './bus';
import type { Approval, ApprovalDecision } from '@shared/types';

// Bridges the agent (which blocks on a tool it wants to run) and the human (who
// approves it in the dashboard). requestApproval() returns a promise that stays
// pending — potentially for a long time — until the UI posts a decision.
const pending = new Map<string, (decision: ApprovalDecision) => void>();

export function requestApproval(input: {
  runId: string;
  applicationId: string | null;
  tool: string;
  title: string;
  input: Record<string, unknown>;
}): Promise<ApprovalDecision> {
  const approval = createApproval(input);
  emitRunEvent({
    type: 'approval_request',
    runId: approval.runId,
    ts: new Date().toISOString(),
    approval,
  });
  return new Promise<ApprovalDecision>((resolve) => {
    pending.set(approval.id, resolve);
  });
}

export function resolveApproval(id: string, decision: ApprovalDecision): Approval | null {
  const approval = resolveApprovalRow(id, decision === 'allow' ? 'allowed' : 'denied');
  if (!approval) return null;
  emitRunEvent({
    type: 'approval_resolved',
    runId: approval.runId,
    ts: new Date().toISOString(),
    approvalId: id,
    decision,
  });
  const resolver = pending.get(id);
  if (resolver) {
    pending.delete(id);
    resolver(decision);
  }
  return approval;
}

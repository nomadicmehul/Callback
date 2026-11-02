import { createApproval, getApplication, resolveApprovalRow, saveArtifact, setDraftStatus, settleDrafting, updateArtifact } from './db';
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
  } else if (decision === 'allow') {
    applyOrphan(approval); // the run that asked died with a restart; the draft is still here
  }
  return approval;
}

/** Approving a draft whose run is gone (the server restarted while it waited) keeps the draft: the approval
 *  row holds exactly what the agent proposed, so save that, the same way the tool would have. */
function applyOrphan(approval: Approval): void {
  const input = approval.input as Record<string, any>;
  const appId = approval.applicationId ?? (typeof input.applicationId === 'string' ? input.applicationId : null);
  let artifact = null;
  if (/save_draft$/.test(approval.tool) && appId && getApplication(appId) && typeof input.content === 'string') {
    const kind = ['resume', 'cover_letter', 'interview_prep'].includes(input.kind) ? input.kind : 'resume';
    artifact = saveArtifact({ applicationId: appId, kind, title: String(input.title ?? kind), content: input.content });
    if (kind !== 'interview_prep') setDraftStatus(appId, 'ready');
  } else if (/artifact_update$/.test(approval.tool) && typeof input.artifactId === 'string' && typeof input.content === 'string') {
    artifact = updateArtifact(input.artifactId, input.content);
  }
  if (appId) settleDrafting(appId);
  if (artifact) emitRunEvent({ type: 'artifact', runId: approval.runId, ts: new Date().toISOString(), artifact });
}

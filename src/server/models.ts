// ─── Model routing + cost policy ────────────────────────────────────────────
// Pick the cheapest model that does each job well, and cap spend per run.
// Prices are per-million tokens (Anthropic pricing, Oct 2026) and used only for
// the rough client-side cost estimate we surface in the UI.

export type Role = 'orchestrator' | 'writer' | 'extractor';

export interface ModelSpec {
  id: string;
  inputPerMTok: number;
  outputPerMTok: number;
}

export const MODELS: Record<string, ModelSpec> = {
  'claude-opus-5-5': { id: 'claude-opus-5-5', inputPerMTok: 4, outputPerMTok: 20 },
  'claude-sonnet-5-5': { id: 'claude-sonnet-5-5', inputPerMTok: 2, outputPerMTok: 10 },
  'claude-haiku-5-5': { id: 'claude-haiku-5-5', inputPerMTok: 0.1, outputPerMTok: 0.5 },
};

export function modelFor(role: Role): string {
  switch (role) {
    case 'orchestrator':
      return process.env.CALLBACK_MODEL_ORCHESTRATOR || 'claude-opus-5-5';
    case 'writer':
      return process.env.CALLBACK_MODEL_WRITER || 'claude-sonnet-5-5';
    case 'extractor':
      return process.env.CALLBACK_MODEL_EXTRACTOR || 'claude-haiku-5-5';
  }
}

/** Hard per-run spend ceiling in USD. */
export function maxRunUsd(): number {
  const raw = Number(process.env.CALLBACK_MAX_RUN_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : 1.0;
}

/** Rough USD estimate for a token count on a model (for display only). */
export function estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const spec = MODELS[modelId];
  if (!spec) return 0;
  return (inputTokens / 1e6) * spec.inputPerMTok + (outputTokens / 1e6) * spec.outputPerMTok;
}

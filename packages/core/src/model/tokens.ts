import type { MessageId } from "./ids.js";

/**
 * Token accounting — the part of the model the spike (doc 19) found is recorded
 * as *actuals* per assistant message, not estimates. Field names map onto the
 * Anthropic `usage` object but are tool-neutral so other adapters populate the
 * same shape.
 *
 * Engineering principle (doc 17 §6): "token math is sacred." If these numbers
 * aren't trusted, the product is worthless — so we carry the raw provider
 * counts verbatim and compute derived values explicitly, never silently.
 */
export interface TokenUsage {
  /** Fresh (uncached) input tokens for this message. */
  readonly inputTokens: number;
  /** Generated output tokens. */
  readonly outputTokens: number;
  /**
   * Tokens served from the prompt cache — i.e. context *re-ingested* this turn.
   * This is the firmest evidence of recarry: stale-but-resident context shows
   * up here every turn it persists. Central to the reclaimable-% metric.
   */
  readonly cacheReadTokens: number;
  /** Tokens written into the prompt cache this turn. */
  readonly cacheCreationTokens: number;
}

/** Sum of everything the model had to ingest to produce this message. */
export function totalInputTokens(u: TokenUsage): number {
  return u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens;
}

/**
 * Per-1M-token prices for a model, in USD. Adapters/analysis look pricing up
 * out-of-band (it changes independently of transcript format), so it's modeled
 * separately from {@link TokenUsage}.
 */
export interface ModelPricing {
  readonly model: string;
  readonly inputPerMTok: number;
  readonly outputPerMTok: number;
  readonly cacheReadPerMTok: number;
  readonly cacheWritePerMTok: number;
}

/** A computed cost attributable to a message (and, later, to a segment). */
export interface CostRecord {
  readonly messageId: MessageId;
  readonly model: string;
  readonly usage: TokenUsage;
  /** USD, derived from usage × pricing. `null` when pricing is unknown. */
  readonly costUsd: number | null;
}

import type { CostRecord, ModelPricing, Session, TokenUsage } from "@glassbox/core";
import { pricingFor } from "./pricing.js";

/**
 * Cost accounting (doc 17 §1.2). This is the *trustworthy* half of "token math
 * is sacred": it never estimates token counts — it multiplies the provider's
 * **actual** `usage` (captured verbatim by the adapter, doc 19 §1) by published
 * {@link ModelPricing}. So a session's dollar cost is exact up to the pricing
 * table, not a heuristic.
 *
 * The per-component split matters for the product thesis: `cacheReadUsd` is what
 * you pay every turn to re-ingest resident context — the recurring cost of the
 * garbage the reclaimable analyzer flags (doc 20). We surface it on its own.
 */
export interface CostBreakdown {
  readonly inputUsd: number;
  readonly outputUsd: number;
  /** Cost of context re-ingested from cache this turn (the recarry tax). */
  readonly cacheReadUsd: number;
  readonly cacheWriteUsd: number;
  readonly totalUsd: number;
}

/** Cost of one message's usage under a given price sheet. */
export function costOfUsage(usage: TokenUsage, pricing: ModelPricing): CostBreakdown {
  const inputUsd = perMTok(usage.inputTokens, pricing.inputPerMTok);
  const outputUsd = perMTok(usage.outputTokens, pricing.outputPerMTok);
  const cacheReadUsd = perMTok(usage.cacheReadTokens, pricing.cacheReadPerMTok);
  const cacheWriteUsd = perMTok(usage.cacheCreationTokens, pricing.cacheWritePerMTok);
  return {
    inputUsd,
    outputUsd,
    cacheReadUsd,
    cacheWriteUsd,
    totalUsd: inputUsd + outputUsd + cacheReadUsd + cacheWriteUsd,
  };
}

export interface SessionCostReport {
  readonly totalUsd: number;
  readonly breakdown: CostBreakdown;
  /** Per-message cost records (`costUsd: null` where the model was unpriced). */
  readonly records: readonly CostRecord[];
  readonly pricedMessages: number;
  /** Messages with usage we couldn't price (unknown model) — honest gap. */
  readonly unpricedMessages: number;
  /** Distinct models seen, and whether each was priced. */
  readonly models: readonly { readonly model: string; readonly priced: boolean }[];
  /**
   * What the cache *saved*: cache-read tokens billed at the cache rate cost this
   * much less than they would have at the full input rate. A positive number is
   * the prompt cache earning its keep; pair it with `cacheReadUsd` to judge
   * recarry. Null contribution from unpriced messages is simply omitted.
   */
  readonly cacheSavingsUsd: number;
}

export interface SessionCostOptions {
  /** Force one price sheet for the whole session (else per-message `model`). */
  readonly pricing?: ModelPricing;
}

/**
 * Roll session cost up from per-message provider actuals. Each message is priced
 * by its own `model` (models can differ within a session — e.g. a Haiku
 * subagent), unless an override sheet is supplied.
 */
export function analyzeSessionCost(
  session: Session,
  opts: SessionCostOptions = {},
): SessionCostReport {
  const records: CostRecord[] = [];
  const sum: Mutable<CostBreakdown> = blank();
  let pricedMessages = 0;
  let unpricedMessages = 0;
  let cacheSavingsUsd = 0;
  const models = new Map<string, boolean>();

  for (const message of session.messages) {
    if (!message.usage) continue;
    const model = message.model ?? session.tool;
    const pricing = opts.pricing ?? pricingFor(message.model);

    if (!pricing) {
      unpricedMessages++;
      if (message.model) models.set(message.model, false);
      records.push({ messageId: message.id, model, usage: message.usage, costUsd: null });
      continue;
    }

    pricedMessages++;
    models.set(pricing.model, true);
    const c = costOfUsage(message.usage, pricing);
    add(sum, c);
    // Counterfactual: cache reads at full input price vs the cache-read price.
    cacheSavingsUsd += perMTok(
      message.usage.cacheReadTokens,
      pricing.inputPerMTok - pricing.cacheReadPerMTok,
    );
    records.push({ messageId: message.id, model: pricing.model, usage: message.usage, costUsd: c.totalUsd });
  }

  return {
    totalUsd: sum.totalUsd,
    breakdown: sum,
    records,
    pricedMessages,
    unpricedMessages,
    models: [...models].map(([model, priced]) => ({ model, priced })),
    cacheSavingsUsd,
  };
}

// ───────────────────────────── helpers ─────────────────────────────

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function perMTok(tokens: number, perMTokPrice: number): number {
  return (tokens / 1_000_000) * perMTokPrice;
}

function blank(): Mutable<CostBreakdown> {
  return { inputUsd: 0, outputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, totalUsd: 0 };
}

function add(into: Mutable<CostBreakdown>, c: CostBreakdown): void {
  into.inputUsd += c.inputUsd;
  into.outputUsd += c.outputUsd;
  into.cacheReadUsd += c.cacheReadUsd;
  into.cacheWriteUsd += c.cacheWriteUsd;
  into.totalUsd += c.totalUsd;
}

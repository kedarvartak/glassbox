import type { ModelPricing } from "@glassbox/core";

/**
 * Per-model pricing, USD per 1M tokens.
 *
 * Source: the Anthropic/Claude API reference (the `claude-api` skill, cached
 * 2026-05-26). Pricing changes independently of transcript format, so it lives
 * here in analysis rather than in the model (doc note in core/tokens.ts), and
 * the table is dated so staleness is visible.
 *
 * Cache rates are derived from the published multipliers rather than hard-coded
 * per model: **cache read = 0.1× input**, **cache write (5-minute TTL) = 1.25×
 * input** (Anthropic prompt-caching docs). Encoding the rule once keeps the
 * table honest — every row's cache rates are provably consistent with its input
 * rate instead of being a place a typo can hide.
 */
export const PRICING_AS_OF = "2026-05-26";

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_5M_MULTIPLIER = 1.25;

/** Build a full {@link ModelPricing} from just the input/output base rates. */
function priced(model: string, inputPerMTok: number, outputPerMTok: number): ModelPricing {
  return {
    model,
    inputPerMTok,
    outputPerMTok,
    cacheReadPerMTok: round(inputPerMTok * CACHE_READ_MULTIPLIER),
    cacheWritePerMTok: round(inputPerMTok * CACHE_WRITE_5M_MULTIPLIER),
  };
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Canonical model-id → pricing. Keys are the bare ids transcripts record. */
const TABLE: Readonly<Record<string, ModelPricing>> = {
  "claude-opus-4-8": priced("claude-opus-4-8", 5, 25),
  "claude-opus-4-7": priced("claude-opus-4-7", 5, 25),
  "claude-opus-4-6": priced("claude-opus-4-6", 5, 25),
  "claude-sonnet-4-6": priced("claude-sonnet-4-6", 3, 15),
  "claude-haiku-4-5": priced("claude-haiku-4-5", 1, 5),
};

/**
 * Resolve pricing for a model string as recorded in a transcript.
 *
 * Transcripts carry ids like `claude-sonnet-4-6` but sometimes a dated variant
 * (`claude-haiku-4-5-20251001`) or a `-fast`/`[1m]` suffix. We resolve in order
 * of confidence — exact, then known-id prefix, then a family fallback to the
 * cheapest member of that family (so an unknown new Opus is priced as *at least*
 * the current Opus base, never silently free). Returns `null` only when we truly
 * can't tell — and a `null` flows through as `costUsd: null`, surfaced honestly
 * rather than guessed.
 */
export function pricingFor(model: string | null | undefined): ModelPricing | null {
  if (!model) return null;
  const exact = TABLE[model];
  if (exact) return exact;

  for (const [id, pricing] of Object.entries(TABLE)) {
    if (model.startsWith(id)) return pricing;
  }

  if (model.includes("opus")) return TABLE["claude-opus-4-6"] as ModelPricing;
  if (model.includes("sonnet")) return TABLE["claude-sonnet-4-6"] as ModelPricing;
  if (model.includes("haiku")) return TABLE["claude-haiku-4-5"] as ModelPricing;
  return null;
}

/** The set of model ids with exact pricing — for diagnostics/UX. */
export function pricedModels(): readonly string[] {
  return Object.keys(TABLE);
}

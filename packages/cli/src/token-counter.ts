import type { TokenCounter } from "@glassbox/core";

/**
 * Cheap ~4-chars/token estimate — the same heuristic the spike used (doc 20 §6).
 * Good enough to stand the pipeline up; it implements the {@link TokenCounter}
 * port so a real provider tokenizer drops in later without touching adapters.
 * Until then, every number it produces is directional, and the CLI says so.
 */
export class EstimateTokenCounter implements TokenCounter {
  count(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

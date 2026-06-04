import type { IsoTimestamp, MessageId } from "./ids.js";

export type MemoryOpKind = "write" | "edit" | "recall";

/**
 * A memory operation, normalized across tools with very different mechanisms
 * (doc 19 "headline asymmetry"):
 *  - Claude Code: memory = files (`CLAUDE.md` + `memory/`); writes/edits are
 *    *inferred* from Write/Edit tool calls; recalls are inferred from injection.
 *  - Codex: structured SQLite (`stage1_outputs`) with real `usage_count` /
 *    `last_usage` recall signals.
 *
 * `confidence` records that asymmetry honestly: a Codex recall is `observed`,
 * a Claude recall is `inferred`. The memory-health analyzer (the post-spike
 * hero, doc 19 §6) keys off this so it never presents a guess as a fact.
 */
export interface MemoryOp {
  readonly kind: MemoryOpKind;
  /** The memory artifact: a file path, or a row/key for structured stores. */
  readonly target: string;
  readonly tokens: number | null;

  readonly confidence: "observed" | "inferred";
  readonly messageId: MessageId | null;
  readonly timestamp: IsoTimestamp;
}

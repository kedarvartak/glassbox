import type { IsoTimestamp, MessageId } from "./ids.js";

/**
 * A compaction/summarization event: what the agent silently dropped or rewrote.
 *
 * Status (doc 19 §1): NOT yet observed in real Claude Code transcripts on the
 * spike machine — no compaction marker was found, and per the owner this being
 * unobservable for now is acceptable. The type is defined so the model is
 * *ready* the moment an adapter can populate it, but adapters may legitimately
 * emit zero of these. Treat presence as optional everywhere.
 */
export interface CompactionEvent {
  readonly id: MessageId;
  readonly timestamp: IsoTimestamp;

  /** Token size of the window immediately before/after compaction. */
  readonly tokensBefore: number;
  readonly tokensAfter: number;

  /** Messages/segments evicted entirely. */
  readonly evictedMessageIds: readonly MessageId[];
  /** Human-readable note on what the summary replaced (when recoverable). */
  readonly summary: string | null;
}

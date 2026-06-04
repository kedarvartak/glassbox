import type { IsoTimestamp, MessageId, SegmentId, ToolCallId } from "./ids.js";
import type { SegmentSource } from "./source.js";

/**
 * The reclaimable-status vocabulary — doc 20's unifying rule made into a type:
 *
 *   "Context that refers to something gone, stale, or already-spent."
 *
 * The *vocabulary* lives in the model (it's the contract the UI renders and the
 * analyzer emits); the *assignment* of a status to a segment lives in
 * @glassbox/analysis, which alone may touch the filesystem/git to decide.
 */
export type SegmentStatus =
  | "live" // still valid and (plausibly) needed — not reclaimable
  | "gone" // refers to something deleted (e.g. content of an rm'd file)
  | "stale" // superseded — an overwritten file version, drifted memory source
  | "spent" // one-shot tool/command output never referenced again
  | "duplicate" // byte-for-byte repeat of another resident segment
  | "unknown"; // not yet classified

/** Statuses that count toward the reclaimable-tokens total. */
export const RECLAIMABLE_STATUSES = ["gone", "stale", "spent", "duplicate"] as const;

export function isReclaimableStatus(status: SegmentStatus): boolean {
  return (RECLAIMABLE_STATUSES as readonly SegmentStatus[]).includes(status);
}

/**
 * A contiguous chunk of context attributable to one source — the unit the x-ray
 * breaks the window into and the unit the hygiene analyzer scores.
 */
export interface Segment {
  readonly id: SegmentId;
  readonly source: SegmentSource;
  /** Short human label, e.g. "Write docs/README.md" or "Bash: ls -R". */
  readonly label: string;
  readonly sizeTokens: number;

  /** Where this content entered the window. */
  readonly originMessageId: MessageId;
  readonly originToolCallId?: ToolCallId;
  /** Set when the segment is file content — enables filesystem cross-check. */
  readonly path?: string;

  readonly status: SegmentStatus;
  /** Why the analyzer assigned the status (for the UI + for trust). */
  readonly statusReason?: string;
}

/**
 * What was resident in the context window at a point in the session.
 *
 * Modeled as a value object so the engine can either materialize one per turn
 * or reconstruct on demand (an engine/storage decision deferred to Phase 1 —
 * see ADR 0004); the shape is identical either way. The reclaimable-tokens
 * report is a fold over the latest snapshot's segments.
 */
export interface ContextSnapshot {
  readonly atMessageId: MessageId;
  readonly timestamp: IsoTimestamp;
  readonly segments: readonly Segment[];
  /** Total resident tokens — should reconcile with the turn's cache-read. */
  readonly totalTokens: number;
}

import type { ContextSnapshot, MessageId, SegmentId, ToolCallId } from "@glassbox/core";
import type { ReclaimableDetail, ReclaimableReport } from "./reclaimable.js";

/**
 * The context cleaner — Glassbox's single cleanup strategy: **surgical, lossless
 * eviction** of provable garbage from a *derived copy* of the transcript.
 *
 * Detection ({@link import("./reclaimable.js")}) answers *"which segments are
 * garbage?"*. The cleaner answers *"remove exactly those, and nothing else."* It
 * turns a {@link ReclaimableReport} into an {@link EvictionPlan}: for each
 * provably-dead segment, where it lives in the transcript and the tombstone that
 * replaces it.
 *
 * Why this is the only strategy (and why it beats the alternatives):
 *  - **Lossless by construction.** It removes only segments the detector can
 *    *prove* are dead — a `gone` file's content, a `stale-drift`/`stale-superseded`
 *    copy a newer version replaces, a byte-identical `duplicate`. Nothing the
 *    model still needs is ever touched, so it carries none of the accuracy loss
 *    that summarizing compaction does.
 *  - **`spent` is deliberately excluded** from the default set: it's the one
 *    *heuristic* class ("one-shot output never referenced again" is inferred, not
 *    proven). Callers who accept that small risk can opt in via {@link EvictionOptions}.
 *
 * This module is pure: it locates the evictable content and plans the tombstones.
 * The fork-writer that materializes the cleaned `.jsonl` lives in the adapter
 * (it owns the raw format) and is driven by the CLI, which does the I/O and
 * writes a *new* file — the read-only-on-transcripts rule holds.
 */

/** A surgical eviction of one resident garbage segment from a derived transcript. */
export interface EvictAction {
  readonly segmentId: SegmentId;
  /** Where the stale content lives, so the fork-writer can find and replace it. */
  readonly originMessageId: MessageId;
  readonly originToolCallId?: ToolCallId;
  readonly path?: string;
  readonly detail: ReclaimableDetail;
  /** Resident tokens this segment holds today (before the tombstone is added). */
  readonly reclaimableTokens: number;
  /** The stub that replaces the evicted content (preserves message structure). */
  readonly tombstone: string;
  /** Estimated tokens the tombstone itself costs (the price of staying loadable). */
  readonly tombstoneTokens: number;
}

export interface EvictionPlan {
  readonly actions: readonly EvictAction[];
  /** Tokens the evicted content holds today. */
  readonly reclaimableTokens: number;
  /** Tokens the replacement tombstones cost. */
  readonly tombstoneTokens: number;
  /** Net tokens reclaimed = reclaimable − tombstones. */
  readonly netReclaimedTokens: number;
}

export interface EvictionOptions {
  /**
   * Which reclaimable classes to evict. Defaults to the **provable** set —
   * everything detection can prove dead without inference. `spent-tool`/
   * `spent-mcp` are excluded by default because they rest on a heuristic; pass
   * them explicitly to trade absolute losslessness for ~9% more coverage.
   */
  readonly classes?: readonly ReclaimableDetail[];
}

/**
 * The provably-dead classes — safe to remove with zero information loss:
 *  - `gone`             — the file was deleted; its content is unreachable.
 *  - `stale-drift`      — the file changed on disk; the resident copy is outdated.
 *  - `stale-superseded` — a later read in-session holds the current version.
 *  - `duplicate`        — a byte-identical copy is already resident.
 * `spent-*` is intentionally absent (it's inferred, not proven).
 */
export const PROVABLE_CLASSES: readonly ReclaimableDetail[] = [
  "gone",
  "stale-drift",
  "stale-superseded",
  "duplicate",
];

/**
 * Tier 1 classes — extends provable eviction with spent observation clearing.
 * `spent-tool` / `spent-mcp` rest on an inference ("never referenced again"),
 * not a proof, so they are excluded from the lossless default. Under a token
 * budget that inference earns its keep: the tool *call* stays in the transcript
 * so the model knows the action happened; only the heavy result bytes are cleared.
 * Zero hallucination risk, no model call — the biggest single reclaimable mass
 * in most sessions.
 */
export const TIER1_CLASSES: readonly ReclaimableDetail[] = [
  ...PROVABLE_CLASSES,
  "spent-tool",
  "spent-mcp",
];

/**
 * Plan the surgical eviction of provable garbage. Pure — no I/O. Joins the
 * report's reclaimable items to their snapshot segments to recover the transcript
 * location (`originMessageId`/`originToolCallId`) the fork-writer needs.
 */
export function planEviction(
  report: ReclaimableReport,
  snapshot: ContextSnapshot,
  opts: EvictionOptions = {},
): EvictionPlan {
  const classes = new Set(opts.classes ?? PROVABLE_CLASSES);
  const segById = new Map(snapshot.segments.map((s) => [s.id, s]));

  const actions: EvictAction[] = [];
  for (const item of report.items) {
    if (!item.detail || !classes.has(item.detail)) continue;
    const seg = segById.get(item.segmentId);
    if (!seg) continue;
    const tombstone = renderTombstone(item.detail, item.path);
    actions.push({
      segmentId: item.segmentId,
      originMessageId: seg.originMessageId,
      ...(seg.originToolCallId !== undefined ? { originToolCallId: seg.originToolCallId } : {}),
      ...(item.path ? { path: item.path } : {}),
      detail: item.detail,
      reclaimableTokens: item.tokens,
      tombstone,
      tombstoneTokens: estimateTokens(tombstone),
    });
  }

  const reclaimableTokens = actions.reduce((s, a) => s + a.reclaimableTokens, 0);
  const tombstoneTokens = actions.reduce((s, a) => s + a.tombstoneTokens, 0);
  return {
    actions: actions.sort((a, b) => b.reclaimableTokens - a.reclaimableTokens),
    reclaimableTokens,
    tombstoneTokens,
    netReclaimedTokens: reclaimableTokens - tombstoneTokens,
  };
}

/**
 * The marker that replaces evicted content in the derived transcript. This text
 * is what the model sees in place of the old bytes on the next resume, so it must
 * (a) make clear the content was intentionally removed by tooling, and (b) point
 * the model at where the current version is, so it neither re-reads needlessly
 * nor treats the gap as an error.
 *
 * TODO(kedar): this wording is the product decision — tune it for how Claude
 * actually behaves when it meets a stubbed block on resume. Keep it short
 * (every token here is token you didn't reclaim).
 */
function renderTombstone(detail: ReclaimableDetail, path?: string): string {
  const where = path ? ` of ${path}` : "";
  if (detail === "stale-superseded") {
    return `[glassbox: removed a superseded copy${where}; a later read in this session holds the current version. Use that.]`;
  }
  if (detail === "stale-drift") {
    return `[glassbox: removed an outdated copy${where}; the file changed on disk — re-read it if you need the current version.]`;
  }
  if (detail === "gone") {
    return `[glassbox: removed content${where}; the file was deleted and no longer exists.]`;
  }
  if (detail === "duplicate") {
    return `[glassbox: removed a duplicate${where}; the identical copy already in context is authoritative.]`;
  }
  return `[glassbox: removed spent output${where} that was never referenced again.]`;
}

/** Local ~4-chars/token estimate, matching the default TokenCounter. Pure. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

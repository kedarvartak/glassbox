import type {
  ContextSnapshot,
  ModelPricing,
  RepoState,
  Segment,
  SegmentStatus,
} from "@glassbox/core";
import { isReclaimableStatus } from "@glassbox/core";

/**
 * The reclaimable-tokens analyzer — doc 20's headline metric.
 *
 * It folds {@link classifySegment} over a snapshot's segments and rolls the
 * result up into one screenshot-worthy number: how many resident tokens are
 * garbage, and what they cost every turn they persist.
 *
 * Note the separation of concerns: classification (the verdict) is one small
 * pure-ish function; everything else here is arithmetic over its output. That's
 * deliberate — the verdict is the part that earns trust, so it stays isolated
 * and easy to test against golden fixtures.
 */
export interface ReclaimableItem {
  readonly segmentId: Segment["id"];
  readonly label: string;
  readonly status: SegmentStatus;
  readonly reason: string;
  readonly tokens: number;
}

export interface ReclaimableReport {
  readonly totalTokens: number;
  readonly reclaimableTokens: number;
  /** reclaimableTokens / totalTokens, 0..1. */
  readonly reclaimablePct: number;
  /** Reclaimable tokens grouped by status (gone/stale/spent/duplicate). */
  readonly byStatus: Readonly<Record<SegmentStatus, number>>;
  /** USD wasted per turn this garbage stays resident (null if no pricing). */
  readonly wastedUsdPerTurn: number | null;
  readonly items: readonly ReclaimableItem[];
}

export interface ReclaimableOptions {
  readonly repo: RepoState;
  /** Pricing for the session's model, to translate tokens → dollars. */
  readonly pricing?: ModelPricing;
}

export async function analyzeReclaimable(
  snapshot: ContextSnapshot,
  opts: ReclaimableOptions,
): Promise<ReclaimableReport> {
  const items: ReclaimableItem[] = [];
  const byStatus = emptyByStatus();

  for (const segment of snapshot.segments) {
    const { status, reason } = await classifySegment(segment, opts.repo);
    if (!isReclaimableStatus(status)) continue;
    byStatus[status] += segment.sizeTokens;
    items.push({
      segmentId: segment.id,
      label: segment.label,
      status,
      reason,
      tokens: segment.sizeTokens,
    });
  }

  const reclaimableTokens = items.reduce((sum, i) => sum + i.tokens, 0);
  const reclaimablePct = snapshot.totalTokens > 0 ? reclaimableTokens / snapshot.totalTokens : 0;

  return {
    totalTokens: snapshot.totalTokens,
    reclaimableTokens,
    reclaimablePct,
    byStatus,
    // Reclaimable context is re-ingested from cache every turn, so it's billed
    // at the cache-read rate — that's the recurring cost doc 20 highlights.
    wastedUsdPerTurn: opts.pricing
      ? (reclaimableTokens / 1_000_000) * opts.pricing.cacheReadPerMTok
      : null,
    items: items.sort((a, b) => b.tokens - a.tokens),
  };
}

/**
 * Classify one resident segment against the live repo — the embodiment of
 * doc 20 §3: "context that refers to something gone, stale, or already-spent."
 *
 * Kept intentionally small and dependency-light: filesystem/git is reached only
 * through the {@link RepoState} port (read-only by contract). Returns a status +
 * a human reason so the UI can explain *why* something is reclaimable — trust is
 * the product.
 */
export async function classifySegment(
  segment: Segment,
  repo: RepoState,
): Promise<{ status: SegmentStatus; reason: string }> {
  // Only file-backed segments can be "gone" or "stale"; we need a path to check.
  if (segment.path) {
    const exists = await repo.exists(segment.path);
    if (!exists) {
      // GONE: content for a file that no longer exists on disk (e.g. rm'd).
      return { status: "gone", reason: `file no longer exists: ${segment.path}` };
    }
    // STALE detection (overwritten/drifted content) needs the segment's own
    // captured content to diff against the current file. That arrives once the
    // Phase-1 parser populates segment content; until then we don't guess.
  }

  // SPENT (one-shot tool output never referenced again) and DUPLICATE require
  // whole-session reference tracking, not a single segment — they're computed by
  // a session-level pass (see analyzeSession, Phase 1). Here we stay conservative.
  return { status: "live", reason: "no reclaimable signal" };
}

function emptyByStatus(): Record<SegmentStatus, number> {
  return { live: 0, gone: 0, stale: 0, spent: 0, duplicate: 0, unknown: 0 };
}

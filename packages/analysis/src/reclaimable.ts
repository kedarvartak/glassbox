import type {
  ContextSnapshot,
  MessageId,
  ModelPricing,
  RepoState,
  Segment,
  SegmentId,
  SegmentStatus,
  Session,
  TokenCounter,
  ToolCallId,
} from "@glassbox/core";
import { isReclaimableStatus } from "@glassbox/core";
import { reconstructContext } from "./context.js";

/**
 * The reclaimable-tokens analyzer — doc 20's headline metric.
 *
 * It classifies each resident segment (live / gone / stale / spent / duplicate)
 * and rolls the reclaimable ones into one screenshot-worthy number: how many
 * resident tokens are garbage, and what they cost every turn they persist.
 *
 * Two classification scopes:
 *  - **per-segment** ({@link analyzeReclaimable}) — needs only the segment + the
 *    repo. Detects `gone` (content of a deleted file).
 *  - **session-aware** ({@link analyzeSessionReclaimable}) — also sees the whole
 *    session, so it can detect `stale`: an older copy of a file that a later
 *    access in the same session supersedes (doc 20 Type #2, "README written 4×,
 *    only the latest valid"). This is the bulk of real context garbage.
 *
 * The verdict logic lives here; the arithmetic is the shared {@link foldReclaimable}.
 */
export interface ReclaimableItem {
  readonly segmentId: SegmentId;
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

/** A classification verdict for one segment. */
interface Verdict {
  readonly status: SegmentStatus;
  readonly reason: string;
}

export interface ReclaimableOptions {
  readonly repo: RepoState;
  /** Pricing for the session's model, to translate tokens → dollars. */
  readonly pricing?: ModelPricing;
}

/** Per-segment analysis over a prebuilt snapshot. Detects `gone` only. */
export async function analyzeReclaimable(
  snapshot: ContextSnapshot,
  opts: ReclaimableOptions,
): Promise<ReclaimableReport> {
  const verdicts = new Map<SegmentId, Verdict>();
  for (const segment of snapshot.segments) {
    verdicts.set(segment.id, await classifySegment(segment, opts.repo));
  }
  return foldReclaimable(snapshot, verdicts, opts.pricing);
}

export interface SessionReclaimableOptions extends ReclaimableOptions {
  /** Sizes history-text segments during reconstruction (file/tool reuse parse counts). */
  readonly tokens: TokenCounter;
  /** Snapshot as of this message (default: the session's last). */
  readonly atMessageId?: MessageId;
}

/**
 * Reconstruct the window for a session and score it with both per-segment
 * (`gone`) and session-level (`stale`) classification. Returns the snapshot too,
 * so callers (the x-ray) get the composition and the verdicts in one pass.
 */
export async function analyzeSessionReclaimable(
  session: Session,
  opts: SessionReclaimableOptions,
): Promise<{ snapshot: ContextSnapshot; report: ReclaimableReport }> {
  const snapshot = reconstructContext(session, {
    tokens: opts.tokens,
    ...(opts.atMessageId ? { atMessageId: opts.atMessageId } : {}),
  });

  const verdicts = await classifySessionSegments(session, snapshot, opts.repo);
  return { snapshot, report: foldReclaimable(snapshot, verdicts, opts.pricing) };
}

/**
 * Read-only/inspection tools whose output is inherently one-shot — useful for
 * the turn that ran them, dead weight afterward (doc 20 Type #3). Conservative
 * by design: only well-known transient tools, so we never call an output the
 * agent is actively working with "spent".
 */
const ONE_SHOT_TOOLS = new Set([
  "Bash",
  "BashOutput",
  "Grep",
  "Glob",
  "LS",
  "WebFetch",
  "WebSearch",
  "NotebookRead",
]);

/**
 * Whole-session classification — the full doc 20 taxonomy. Precedence
 * (most-specific first): **duplicate** (byte-identical to a later resident copy)
 * → **stale** (older version of a path a later access supersedes) → **gone**
 * (file deleted on disk) → **spent** (one-shot tool output from a turn already
 * moved past) → live. duplicate/stale/gone are provable from the model + repo;
 * spent is an explicitly conservative heuristic (its reason says so).
 */
async function classifySessionSegments(
  session: Session,
  snapshot: ContextSnapshot,
  repo: RepoState,
): Promise<Map<SegmentId, Verdict>> {
  // Fingerprint each segment via its origin tool call (file content wins over
  // result text when both exist — same bytes anyway). Names drive `spent`.
  const hashByCall = new Map<ToolCallId, string>();
  for (const op of session.fileOps) if (op.contentHash) hashByCall.set(op.toolCallId, op.contentHash);
  for (const tc of session.toolCalls) {
    if (tc.contentHash && !hashByCall.has(tc.id)) hashByCall.set(tc.id, tc.contentHash);
  }
  const nameByCall = new Map<ToolCallId, string>(session.toolCalls.map((tc) => [tc.id, tc.name]));

  // duplicate: group resident segments by content hash; keep the last copy,
  // mark the earlier identical ones reclaimable.
  const groups = new Map<string, SegmentId[]>();
  for (const seg of snapshot.segments) {
    if (seg.originToolCallId === undefined) continue;
    const hash = hashByCall.get(seg.originToolCallId);
    if (!hash) continue;
    const list = groups.get(hash) ?? [];
    list.push(seg.id);
    groups.set(hash, list);
  }
  const duplicate = new Set<SegmentId>();
  for (const ids of groups.values()) {
    for (const id of ids.slice(0, -1)) duplicate.add(id);
  }

  const superseded = supersededFileSegments(session, snapshot);
  const lastTurn = session.turns[session.turns.length - 1];
  const lastTurnIds = new Set<MessageId>(lastTurn ? lastTurn.messageIds : []);

  const verdicts = new Map<SegmentId, Verdict>();
  for (const seg of snapshot.segments) {
    if (duplicate.has(seg.id)) {
      verdicts.set(seg.id, { status: "duplicate", reason: "byte-identical to a later copy still resident in the window" });
      continue;
    }
    const stale = superseded.get(seg.id);
    if (stale) {
      verdicts.set(seg.id, { status: "stale", reason: stale });
      continue;
    }
    if (seg.path) {
      verdicts.set(seg.id, await classifySegment(seg, repo));
      continue;
    }
    if (seg.source === "tool_result" && lastTurn && !lastTurnIds.has(seg.originMessageId)) {
      const name = seg.originToolCallId === undefined ? undefined : nameByCall.get(seg.originToolCallId);
      if (name && ONE_SHOT_TOOLS.has(name)) {
        verdicts.set(seg.id, {
          status: "spent",
          reason: `one-shot ${name} output from an earlier turn — typically dead weight after use`,
        });
        continue;
      }
    }
    verdicts.set(seg.id, { status: "live", reason: "no reclaimable signal" });
  }
  return verdicts;
}

/**
 * Classify one resident segment against the live repo — doc 20 §3's "gone"
 * rule. File-backed only; reached purely through the read-only {@link RepoState}
 * port. Stale/spent/duplicate need more than a single segment and are decided by
 * the session-level pass (or remain future work).
 */
export async function classifySegment(segment: Segment, repo: RepoState): Promise<Verdict> {
  if (segment.path) {
    const exists = await repo.exists(segment.path);
    if (!exists) {
      return { status: "gone", reason: `file no longer exists: ${segment.path}` };
    }
  }
  return { status: "live", reason: "no reclaimable signal" };
}

/**
 * Find file segments that are *older copies* — a later op on the same path
 * supersedes them, so the earlier copies are dead weight (doc 20 Type #2).
 * Provable purely from the model: we order each path's accesses by the adapter's
 * (chronological) `fileOps` order and mark everything but the latest stale.
 */
function supersededFileSegments(session: Session, snapshot: ContextSnapshot): Map<SegmentId, string> {
  const opOrder = new Map<ToolCallId, number>();
  session.fileOps.forEach((op, i) => opOrder.set(op.toolCallId, i));

  const byPath = new Map<string, { id: SegmentId; order: number }[]>();
  for (const seg of snapshot.segments) {
    if (!seg.path || seg.originToolCallId === undefined) continue;
    const order = opOrder.get(seg.originToolCallId);
    if (order === undefined) continue;
    const list = byPath.get(seg.path) ?? [];
    list.push({ id: seg.id, order });
    byPath.set(seg.path, list);
  }

  const stale = new Map<SegmentId, string>();
  for (const [path, occurrences] of byPath) {
    if (occurrences.length < 2) continue; // only one copy → not superseded
    occurrences.sort((a, b) => a.order - b.order);
    for (const old of occurrences.slice(0, -1)) {
      stale.set(old.id, `older copy of ${path} — a later access in this session supersedes it`);
    }
  }
  return stale;
}

/** Fold per-segment verdicts into the reclaimable report (the arithmetic). */
export function foldReclaimable(
  snapshot: ContextSnapshot,
  verdicts: ReadonlyMap<SegmentId, Verdict>,
  pricing?: ModelPricing,
): ReclaimableReport {
  const items: ReclaimableItem[] = [];
  const byStatus = emptyByStatus();

  for (const segment of snapshot.segments) {
    const verdict = verdicts.get(segment.id);
    if (!verdict || !isReclaimableStatus(verdict.status)) continue;
    byStatus[verdict.status] += segment.sizeTokens;
    items.push({
      segmentId: segment.id,
      label: segment.label,
      status: verdict.status,
      reason: verdict.reason,
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
    wastedUsdPerTurn: pricing ? (reclaimableTokens / 1_000_000) * pricing.cacheReadPerMTok : null,
    items: items.sort((a, b) => b.tokens - a.tokens),
  };
}

function emptyByStatus(): Record<SegmentStatus, number> {
  return { live: 0, gone: 0, stale: 0, spent: 0, duplicate: 0, unknown: 0 };
}

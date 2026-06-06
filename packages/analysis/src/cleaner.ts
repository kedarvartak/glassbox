import type { Session } from "@glassbox/core";
import type { ReclaimableItem, ReclaimableReport } from "./reclaimable.js";

/**
 * The context cleaner — doc 21's "Advise" tier.
 *
 * Detection ({@link import("./reclaimable.js")}) answers *"which segments are
 * garbage?"*. The cleaner answers *"what do we do about it?"* — it turns a
 * {@link ReclaimableReport} into a {@link CleanPlan}: the minimal set of
 * interventions that let the agent or user eliminate the garbage.
 *
 * Phase A (this file) is **pure**: no filesystem writes, no CLI, no agent
 * triggering. It only transforms a report into a plan. The write side
 * (`applyClaudeMd`) and the compact trigger land in later phases, gated behind
 * explicit user confirmation. Glassbox never mutates a session transcript.
 *
 * Two complementary strategies (doc 21 §3):
 *  - **CLAUDE.md injection** handles *file-specific* garbage — `gone` (deleted)
 *    and `stale-drift` (changed on disk). Provable, durable across turns.
 *  - **Compact recommendation** handles *accumulated non-file* garbage — spent
 *    tool/MCP outputs and duplicates — but only once it crosses a threshold,
 *    because a compact resets the whole window and is disruptive.
 */

/** How much to trust an action. CLAUDE.md writes are provable-only by design. */
export type CleanConfidence = "provable" | "heuristic";

/** What the agent should do about a file. */
export type CleanActionType = "stop_referencing" | "re_read";

/** A single file-level intervention, ready to render or inject into CLAUDE.md. */
export interface CleanAction {
  readonly type: CleanActionType;
  readonly path: string;
  /** One-line rationale shown to the user before they confirm. */
  readonly reason: string;
  /** Resident tokens this clears (summed across all copies of the path). */
  readonly reclaimableTokens: number;
  readonly confidence: CleanConfidence;
  /** The exact bullet to write into the CLAUDE.md hygiene block. */
  readonly claudeMdSnippet: string;
}

/** A threshold-gated recommendation to compact the window. */
export interface CompactHint {
  readonly reclaimablePct: number;
  readonly reclaimableTokens: number;
  /** Tokens from spent one-shot tool/MCP output (the bulk a compact clears). */
  readonly spentTokens: number;
  /** Tokens from byte-identical duplicate copies. */
  readonly duplicateTokens: number;
  /** Suggested `/compact` focus prompt — what to ask the agent to preserve. */
  readonly suggestedSummaryFocus: string;
  /** Per-turn USD a compact would stop wasting (null if no pricing). */
  readonly estimatedUsdSaved: number | null;
}

/** Headline numbers for the UI/CLI. */
export interface CleanSummary {
  readonly reclaimableTokens: number;
  readonly reclaimablePct: number;
  /** Number of CLAUDE.md actions in this plan. */
  readonly actionCount: number;
  /** Per-turn USD the full plan would stop wasting (null if no pricing). */
  readonly estimatedUsdSaved: number | null;
}

export interface CleanPlan {
  /** File-level CLAUDE.md interventions, biggest token win first. */
  readonly claudeMdBlocks: readonly CleanAction[];
  /** Present only when reclaimable% crosses the compact threshold. */
  readonly compactRecommendation?: CompactHint;
  readonly summary: CleanSummary;
}

export interface CleanOptions {
  /** Reclaimable fraction (0..1) above which a compact is recommended. */
  readonly compactThreshold?: number;
}

const DEFAULT_COMPACT_THRESHOLD = 0.25;

/**
 * Turn a reclaimable report into an actionable clean plan (doc 21 §5.1).
 * Pure — no I/O. Planning rules:
 *  1. `gone`  → `stop_referencing` action for its path.
 *  2. `stale-drift` → `re_read` action for its path.
 *  3. Dedupe by path: one action per path, tokens summed across copies.
 *  4. reclaimable% > threshold → a {@link CompactHint} for spent/duplicate bulk.
 *  5. Actions sorted by reclaimable tokens, descending.
 *
 * `stale-superseded`, `spent-*`, and `duplicate` items deliberately produce no
 * CLAUDE.md action: superseded copies are already replaced in-session, and the
 * rest are cleared by a compact, not by editing memory.
 */
export function plan(report: ReclaimableReport, session: Session, opts: CleanOptions = {}): CleanPlan {
  const threshold = opts.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD;

  // 1–3: collect file actions, deduped by path (tokens accumulate per path).
  const byPath = new Map<string, { type: CleanActionType; tokens: number }>();
  for (const item of report.items) {
    const action = fileActionFor(item);
    if (!action || !item.path) continue;
    const existing = byPath.get(item.path);
    if (existing) {
      byPath.set(item.path, { type: existing.type, tokens: existing.tokens + item.tokens });
    } else {
      byPath.set(item.path, { type: action, tokens: item.tokens });
    }
  }

  const claudeMdBlocks: CleanAction[] = [...byPath.entries()]
    .map(([path, { type, tokens }]) => buildAction(type, path, tokens))
    .sort((a, b) => b.reclaimableTokens - a.reclaimableTokens);

  // 4: compact recommendation for the accumulated non-file garbage.
  const spentTokens = report.byStatus.spent ?? 0;
  const duplicateTokens = report.byStatus.duplicate ?? 0;
  let compactRecommendation: CompactHint | undefined;
  if (report.reclaimablePct > threshold) {
    const compactableShare =
      report.reclaimableTokens > 0
        ? (spentTokens + duplicateTokens) / report.reclaimableTokens
        : 0;
    compactRecommendation = {
      reclaimablePct: report.reclaimablePct,
      reclaimableTokens: report.reclaimableTokens,
      spentTokens,
      duplicateTokens,
      suggestedSummaryFocus: suggestedCompactFocus(session),
      estimatedUsdSaved:
        report.wastedUsdPerTurn !== null ? report.wastedUsdPerTurn * compactableShare : null,
    };
  }

  return {
    claudeMdBlocks,
    ...(compactRecommendation ? { compactRecommendation } : {}),
    summary: {
      reclaimableTokens: report.reclaimableTokens,
      reclaimablePct: report.reclaimablePct,
      actionCount: claudeMdBlocks.length,
      estimatedUsdSaved: report.wastedUsdPerTurn,
    },
  };
}

/** Map a reclaimable item to a file action type, or null if not file-actionable. */
function fileActionFor(item: ReclaimableItem): CleanActionType | null {
  if (!item.path) return null;
  if (item.detail === "gone") return "stop_referencing";
  if (item.detail === "stale-drift") return "re_read";
  return null;
}

function buildAction(type: CleanActionType, path: string, tokens: number): CleanAction {
  if (type === "stop_referencing") {
    return {
      type,
      path,
      reason: `deleted on disk — its content still sits in the window`,
      reclaimableTokens: tokens,
      confidence: "provable",
      claudeMdSnippet: `- \`${path}\` — deleted; do not read or reference it.`,
    };
  }
  return {
    type,
    path,
    reason: `changed on disk since it was last read — the resident copy is outdated`,
    reclaimableTokens: tokens,
    confidence: "provable",
    claudeMdSnippet: `- \`${path}\` — changed on disk; re-read it before relying on the cached copy.`,
  };
}

/**
 * Build a `/compact` focus suggestion from the session's most recent intent —
 * the last real user prompt plus the latest assistant reply. This tells the
 * agent what to preserve when it summarizes, so the compact keeps the live task
 * and drops the spent bulk. Pure; exported so the CLI's compact action (Phase D)
 * can build a command even when the plan is below the compact threshold.
 */
export function suggestedCompactFocus(session: Session): string {
  const lastUser = lastTextByRole(session, "user");
  const lastAssistant = lastTextByRole(session, "assistant");
  const parts: string[] = [];
  if (lastUser) parts.push(`current task: ${truncate(lastUser, 160)}`);
  if (lastAssistant) parts.push(`recent progress: ${truncate(lastAssistant, 160)}`);
  if (parts.length === 0) return "Preserve the current task and recent file edits; drop spent tool output.";
  return `Preserve — ${parts.join("; ")}. Drop spent tool output and old file copies.`;
}

/**
 * The exact Claude Code slash command to compact with a given focus. Glassbox
 * never runs this — compaction is a live, in-session action and we're read-only
 * on transcripts — so the cleaner's job ends at producing the command for the
 * user to paste into their running session (doc 21 §4, §5.3).
 */
export function compactCommand(focus: string): string {
  return `/compact ${focus}`;
}

function lastTextByRole(session: Session, role: "user" | "assistant"): string | null {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const m = session.messages[i];
    if (!m || m.role !== role) continue;
    const text = m.blocks
      .filter((b) => b.kind === "text")
      .map((b) => (b as { text: string }).text)
      .join(" ")
      .trim();
    if (text) return text;
  }
  return null;
}

function truncate(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

// ───────────────────────── CLAUDE.md injection (Phase C) ─────────────────────────

/**
 * Markers that bound Glassbox's managed region in CLAUDE.md. Everything between
 * them is owned by the cleaner and rewritten on each `--apply`; everything
 * outside is the user's and never touched. The markers are what make the write
 * idempotent — we replace the block in place rather than appending a new one.
 */
export const HYGIENE_START = "<!-- glassbox:hygiene:start -->";
export const HYGIENE_END = "<!-- glassbox:hygiene:end -->";

/**
 * Render the managed CLAUDE.md hygiene block for a plan (doc 21 §5.2). Pure —
 * the timestamp is injected so the output is deterministic and testable. The
 * block instructs the agent which resident files to stop trusting; the compact
 * recommendation is intentionally *not* written here (it's a runtime action,
 * not durable memory).
 */
export function renderHygieneBlock(plan: CleanPlan, now: Date): string {
  const stop = plan.claudeMdBlocks.filter((a) => a.type === "stop_referencing");
  const reread = plan.claudeMdBlocks.filter((a) => a.type === "re_read");

  const lines: string[] = [
    HYGIENE_START,
    `## Context hygiene — Glassbox ${now.toISOString().slice(0, 19)}Z`,
    `These files drifted from or left the workspace after they entered context.`,
  ];
  if (stop.length > 0) {
    lines.push("", "**Deleted — do not read or reference:**");
    for (const a of stop) lines.push(a.claudeMdSnippet);
  }
  if (reread.length > 0) {
    lines.push("", "**Changed on disk — re-read before relying on the cached copy:**");
    for (const a of reread) lines.push(a.claudeMdSnippet);
  }
  lines.push(HYGIENE_END);
  return lines.join("\n");
}

/**
 * Insert-or-replace the Glassbox hygiene block in CLAUDE.md content,
 * idempotently (doc 21 §5.2). Running this twice with the same plan + timestamp
 * yields byte-identical output — the markers guarantee we never stack blocks.
 *
 *  - Plan has actions, existing block present → replace it in place.
 *  - Plan has actions, no block → append (separated by a blank line).
 *  - Plan has no actions → strip any existing block (the window is clean now).
 *
 * Returns the full new CLAUDE.md content. Pure: callers own the file I/O.
 */
export function upsertHygieneBlock(existing: string, plan: CleanPlan, now: Date): string {
  const stripped = stripHygieneBlock(existing);

  // No file-level actions → leave the file with no managed block.
  if (plan.claudeMdBlocks.length === 0) return stripped;

  const block = renderHygieneBlock(plan, now);
  if (stripped.trim() === "") return block + "\n";
  return `${stripped.replace(/\s+$/, "")}\n\n${block}\n`;
}

/** Remove an existing Glassbox block (and its surrounding blank lines) if present. */
function stripHygieneBlock(content: string): string {
  const start = content.indexOf(HYGIENE_START);
  if (start === -1) return content;
  const endMarker = content.indexOf(HYGIENE_END, start);
  if (endMarker === -1) return content; // malformed; leave untouched
  const end = endMarker + HYGIENE_END.length;
  const before = content.slice(0, start).replace(/\s+$/, "");
  const after = content.slice(end).replace(/^\s+/, "");
  if (before === "" ) return after;
  if (after === "") return before;
  return `${before}\n\n${after}`;
}

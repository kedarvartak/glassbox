import type {
  ContextSnapshot,
  MessageId,
  Session,
} from "@glassbox/core";

/**
 * Tier 3 planner — guided summarization of cold reasoning prose.
 *
 * Identifies the compaction boundary (the first turn of the working set) and
 * classifies what is in the cold prefix: cold reasoning segments (the only
 * thing the summarizer is allowed to touch) plus an artifact ledger of hard
 * facts extracted deterministically from the same prefix.
 *
 * No I/O. The LLM call and the actual transcript rewrite live upstream of this
 * module — the plan just drives them.
 */

export interface SummarizePlan {
  /**
   * UUID of the first message in the working set — the compaction boundary.
   * Everything before this in the JSONL becomes the synthetic preamble;
   * everything from here onward is preserved verbatim.
   */
  readonly boundaryMessageId: MessageId;
  /** Turn index of the boundary (0-based), for display. */
  readonly boundaryTurnIndex: number;
  /** All message IDs in the cold prefix (before the boundary). */
  readonly coldMessageIds: ReadonlySet<MessageId>;
  /** Tokens in cold assistant/thinking segments — what the summarizer compresses. */
  readonly coldReasoningTokens: number;
  /** False when there is no cold reasoning to summarize (session too short etc.). */
  readonly hasContent: boolean;
}

export interface SummarizePlanOptions {
  /** Last K turns form the working set (PRESERVE). Default 6. */
  readonly workingSetTurns?: number;
  /** Min cold reasoning tokens before Tier 3 is worth running. Default 500. */
  readonly minColdTokens?: number;
}

/**
 * Plan the Tier 3 compaction boundary and identify cold reasoning segments.
 * Returns null when the session is too short to have a meaningful cold prefix.
 */
export function planSummarize(
  snapshot: ContextSnapshot,
  session: Session,
  opts: SummarizePlanOptions = {},
): SummarizePlan | null {
  const workingSetTurns = opts.workingSetTurns ?? 6;
  const minColdTokens = opts.minColdTokens ?? 500;

  if (session.turns.length <= workingSetTurns) return null;

  const boundaryTurnIndex = session.turns.length - workingSetTurns;
  const boundaryTurn = session.turns[boundaryTurnIndex]!;
  const boundaryMessageId = boundaryTurn.userMessageId;

  // Working set: all message IDs from the preserved turns onward.
  const workingSetIds = new Set<MessageId>();
  for (const turn of session.turns.slice(boundaryTurnIndex)) {
    for (const id of turn.messageIds) workingSetIds.add(id);
  }

  // Cold prefix: all message IDs not in the working set.
  const coldMessageIds = new Set<MessageId>(
    session.messages
      .filter((m) => !workingSetIds.has(m.id))
      .map((m) => m.id),
  );

  // Count cold reasoning tokens (assistant + thinking — what the LLM compresses).
  let coldReasoningTokens = 0;
  for (const seg of snapshot.segments) {
    if (!coldMessageIds.has(seg.originMessageId)) continue;
    if (seg.source === "assistant" || seg.source === "thinking") {
      coldReasoningTokens += seg.sizeTokens;
    }
  }

  return {
    boundaryMessageId,
    boundaryTurnIndex,
    coldMessageIds,
    coldReasoningTokens,
    hasContent: coldReasoningTokens >= minColdTokens,
  };
}

/**
 * Build the artifact ledger for the cold prefix — hard facts extracted
 * deterministically from `session.fileOps` and `session.toolCalls`.
 *
 * These facts bypass the summarizer entirely: they are emitted verbatim into
 * the preamble so the model cannot overwrite or drift them, regardless of how
 * aggressively the cold reasoning is compressed.
 */
export function buildArtifactLedger(
  session: Session,
  coldMessageIds: ReadonlySet<MessageId>,
): string {
  const lines: string[] = ["[artifact ledger — extracted deterministically, not summarized]", ""];

  // File operations in the cold prefix.
  const coldFileOps = session.fileOps.filter((op) => coldMessageIds.has(op.messageId));
  if (coldFileOps.length > 0) {
    lines.push("Files touched:");
    // Dedupe by path, keeping the last op per path (most recent state).
    const byPath = new Map<string, typeof coldFileOps[0]>();
    for (const op of coldFileOps) byPath.set(op.path, op);
    for (const op of byPath.values()) {
      lines.push(`  ${op.kind.padEnd(6)}  ${op.path}`);
    }
    lines.push("");
  }

  // Tool calls in the cold prefix (non-file tools — the interesting actions).
  const fileToolNames = new Set(["Read", "Write", "Edit", "MultiEdit"]);
  const coldToolCalls = session.toolCalls.filter(
    (tc) =>
      coldMessageIds.has(tc.requestedInMessageId) &&
      !fileToolNames.has(tc.name),
  );
  if (coldToolCalls.length > 0) {
    lines.push("Tool calls:");
    for (const tc of coldToolCalls.slice(0, 30)) {
      const input = summarizeInput(tc.input);
      lines.push(`  ${tc.name}${input ? `  ${input}` : ""}`);
    }
    if (coldToolCalls.length > 30) lines.push(`  … and ${coldToolCalls.length - 30} more`);
    lines.push("");
  }

  if (coldFileOps.length === 0 && coldToolCalls.length === 0) {
    lines.push("(no file ops or tool calls in cold prefix)");
    lines.push("");
  }

  return lines.join("\n");
}

/** Render a one-line summary of a tool's input for the ledger. */
function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  // Common patterns: command, query, url, path
  for (const key of ["command", "query", "url", "path", "description"]) {
    if (typeof obj[key] === "string") {
      const v = obj[key] as string;
      return `(${key}: ${v.length > 80 ? v.slice(0, 80) + "…" : v})`;
    }
  }
  return "";
}

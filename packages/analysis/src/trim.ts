import type {
  ContextSnapshot,
  MessageId,
  SegmentId,
  SegmentSource,
  Session,
  ToolCallId,
} from "@glassbox/core";

/**
 * Tier 2 — verbatim line trim.
 *
 * For a live segment that is large and cold (outside the working set, above a
 * token floor), we do not summarize it and we cannot prove it dead. Instead we
 * trim the boring lines *verbatim*: keep the head, the tail, and every line
 * that carries an artifact (signatures, paths, error strings). Every surviving
 * line is byte-identical to the original — no model, no fabrication risk.
 *
 * This module has two layers:
 *  - `trimContent`  — pure text function: trim one content string to its skeleton.
 *  - `planTrim`     — session-level: identify cold live segments above the size
 *                     floor and produce a TrimPlan the adapter writer can apply.
 */

// ─── Content trimmer ──────────────────────────────────────────────────────────

export interface ContentTrimOptions {
  /** Lines to keep verbatim from the top. Default 20. */
  readonly headLines?: number;
  /** Lines to keep verbatim from the bottom. Default 10. */
  readonly tailLines?: number;
}

export interface ContentTrimResult {
  readonly text: string;
  readonly keptLines: number;
  readonly removedLines: number;
}

/**
 * Patterns that mark a line as an artifact — it must survive the trim verbatim.
 * Covers: JS/TS/Python/Go/Rust declarations, import/export, error indicators,
 * file paths, and TODO/FIXME markers.
 */
const ARTIFACT_PATTERNS: RegExp[] = [
  // JS/TS function and class declarations
  /^(export\s+)?(default\s+)?(async\s+)?(function|class)\s+\w/,
  // JS/TS variable and type declarations
  /^(export\s+)?(const|let|var|type|interface|enum|abstract\s+class)\s+\w/,
  // ES module imports/exports
  /^(import|export)\s.*\bfrom\b/,
  /\brequire\s*\(/,
  // Python definitions
  /^(def|class|async\s+def)\s+\w/,
  // Go declarations
  /^func\s+\w/,
  /^type\s+\w+\s+(struct|interface)/,
  // Rust/C# declarations
  /^(pub\s+)?(fn|impl|struct|enum|trait)\s+\w/,
  // Error / test result indicators
  /\b(Error|Exception|FAIL|PASS|WARN)[\s:]/i,
  // Stack trace lines
  /^\s+at\s+\S+.*:\d+/,
  // File paths (two or more path segments)
  /(?:\/[\w.-]+){2,}/,
  // TODO / FIXME / NOTE markers
  /\b(TODO|FIXME|HACK|NOTE|WARN):/i,
];

function isArtifactLine(line: string): boolean {
  return ARTIFACT_PATTERNS.some((p) => p.test(line));
}

/**
 * Trim `text` to its skeleton: head + artifact lines + tail, with `[glassbox:
 * trimmed N lines]` markers replacing each run of dropped lines. Returns the
 * original text unchanged if it is too short to be worth trimming.
 */
export function trimContent(text: string, opts: ContentTrimOptions = {}): ContentTrimResult {
  const headLines = opts.headLines ?? 20;
  const tailLines = opts.tailLines ?? 10;
  // Don't trim if the block isn't meaningfully larger than head + tail.
  const minLines = headLines + tailLines + 15;

  const lines = text.split("\n");
  if (lines.length <= minLines) {
    return { text, keptLines: lines.length, removedLines: 0 };
  }

  const out: string[] = [];
  let removedLines = 0;
  let removedRun = 0;

  const flushRun = () => {
    if (removedRun > 0) {
      out.push(`[glassbox: trimmed ${removedRun} line${removedRun === 1 ? "" : "s"}]`);
      removedRun = 0;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const inHead = i < headLines;
    const inTail = i >= lines.length - tailLines;
    const keep = inHead || inTail || isArtifactLine(lines[i]!);

    if (keep) {
      flushRun();
      out.push(lines[i]!);
    } else {
      removedLines++;
      removedRun++;
    }
  }
  flushRun();

  return { text: out.join("\n"), keptLines: lines.length - removedLines, removedLines };
}

// ─── Session-level planner ────────────────────────────────────────────────────

/** Sources that carry trimable bulk text in their content field. */
const TRIM_SOURCES = new Set<SegmentSource>(["tool_result", "file", "mcp"]);

export interface TrimAction {
  readonly segmentId: SegmentId;
  readonly originMessageId: MessageId;
  readonly originToolCallId?: ToolCallId;
  readonly source: SegmentSource;
  readonly label: string;
  /** Tokens the segment holds now — actual. */
  readonly currentTokens: number;
  /** Head/tail parameters to pass to trimContent at write time. */
  readonly headLines: number;
  readonly tailLines: number;
}

export interface TrimPlan {
  readonly actions: readonly TrimAction[];
  /** Sum of currentTokens across all trim candidates. */
  readonly trimCandidateTokens: number;
}

export interface TrimPlanOptions {
  /**
   * How many of the most recent turns form the working set (PRESERVE zone).
   * Segments originating inside this zone are never trim candidates.
   * Default 6.
   */
  readonly workingSetTurns?: number;
  /**
   * Minimum segment size (tokens) to bother trimming. Below this floor the
   * trim marker overhead is not worth the savings. Default 300.
   */
  readonly minTokens?: number;
  readonly headLines?: number;
  readonly tailLines?: number;
}

/**
 * Identify cold live segments in `snapshot` that are large enough to trim.
 * A segment is cold if its origin message is outside the last `workingSetTurns`
 * turns. Only `tool_result`, `file`, and `mcp` segments carry bulk text content
 * worth trimming; other sources (user/assistant/thinking) are reasoning — Tier 3
 * territory, not Tier 2.
 *
 * Pure: no I/O. The plan drives `applyTrimTranscript` in the adapter.
 */
export function planTrim(
  snapshot: ContextSnapshot,
  session: Session,
  opts: TrimPlanOptions = {},
): TrimPlan {
  const workingSetTurns = opts.workingSetTurns ?? 6;
  const minTokens = opts.minTokens ?? 300;
  const headLines = opts.headLines ?? 20;
  const tailLines = opts.tailLines ?? 10;

  // Build the working set: message IDs from the last K turns.
  const workingSet = new Set<MessageId>();
  for (const turn of session.turns.slice(-workingSetTurns)) {
    for (const id of turn.messageIds) workingSet.add(id);
  }

  const actions: TrimAction[] = [];
  for (const seg of snapshot.segments) {
    if (seg.status !== "live" && seg.status !== "unknown") continue;
    if (!TRIM_SOURCES.has(seg.source)) continue;
    if (seg.sizeTokens < minTokens) continue;
    if (workingSet.has(seg.originMessageId)) continue;
    // Only segments with a tool call id — those map to a content field in the JSONL.
    if (seg.originToolCallId === undefined) continue;

    actions.push({
      segmentId: seg.id,
      originMessageId: seg.originMessageId,
      originToolCallId: seg.originToolCallId,
      source: seg.source,
      label: seg.label,
      currentTokens: seg.sizeTokens,
      headLines,
      tailLines,
    });
  }

  return {
    actions: actions.sort((a, b) => b.currentTokens - a.currentTokens),
    trimCandidateTokens: actions.reduce((s, a) => s + a.currentTokens, 0),
  };
}

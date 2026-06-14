/**
 * Tier 2 transcript writer — applies verbatim line-trim to cold live segments.
 *
 * Mirrors `forkTranscript` in structure: parse each JSONL line, find matching
 * `tool_result` blocks by `tool_use_id`, call `trimContent` on the content
 * string (partial replacement — not a full tombstone), pass through unchanged
 * lines byte-for-byte.
 *
 * Structural guarantee: only the content string is modified. The `tool_result`
 * block, its `tool_use_id`, and the paired `tool_use` block are all untouched —
 * no orphaned pairs, the existing validator passes unchanged.
 *
 * The adapter has no dep on @glassbox/analysis. `TrimSpec` is the minimal shape
 * `TrimAction` satisfies — the CLI passes TrimAction[] and TypeScript accepts it
 * structurally.
 */

/** Minimal shape the writer needs from each trim action. TrimAction satisfies this. */
export interface TrimSpec {
  readonly originToolCallId?: string;
  readonly headLines: number;
  readonly tailLines: number;
}

export interface TrimTranscriptSummary {
  readonly trimmed: number;
  readonly notFound: readonly string[];
  readonly linesRemoved: number;
  readonly bytesBefore: number;
  readonly bytesAfter: number;
}

export interface TrimTranscriptResult {
  readonly text: string;
  readonly summary: TrimTranscriptSummary;
}

export function applyTrimTranscript(
  rawText: string,
  actions: readonly TrimSpec[],
  newSessionId?: string,
): TrimTranscriptResult {
  const byCallId = new Map<string, TrimSpec>();
  for (const a of actions) {
    if (a.originToolCallId !== undefined) byCallId.set(a.originToolCallId, a);
  }

  const lines = rawText.split("\n");
  const seen = new Set<string>();
  let totalLinesRemoved = 0;

  const out = lines.map((line) => {
    if (line.trim() === "") return line;
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch {
      return line;
    }

    const { changed, linesRemoved } = trimLine(ev, byCallId, seen);

    if (newSessionId !== undefined) {
      const e = ev as Record<string, unknown>;
      if (typeof e["sessionId"] === "string") e["sessionId"] = newSessionId;
    }

    totalLinesRemoved += linesRemoved;
    return changed || newSessionId !== undefined ? JSON.stringify(ev) : line;
  });

  const notFound = [...byCallId.keys()].filter((id) => !seen.has(id));
  const text = out.join("\n");
  return {
    text,
    summary: {
      trimmed: seen.size,
      notFound,
      linesRemoved: totalLinesRemoved,
      bytesBefore: Buffer.byteLength(rawText, "utf8"),
      bytesAfter: Buffer.byteLength(text, "utf8"),
    },
  };
}

function trimLine(
  ev: unknown,
  byCallId: ReadonlyMap<string, TrimSpec>,
  seen: Set<string>,
): { changed: boolean; linesRemoved: number } {
  const event = ev as { message?: { content?: unknown }; toolUseResult?: unknown };
  const content = event?.message?.content;
  if (!Array.isArray(content)) return { changed: false, linesRemoved: 0 };

  let changed = false;
  let linesRemoved = 0;

  for (const block of content as Record<string, unknown>[]) {
    if (block["type"] !== "tool_result") continue;
    const id = block["tool_use_id"];
    if (typeof id !== "string") continue;

    const action = byCallId.get(id);
    if (!action) continue;

    const raw = block["content"];
    if (typeof raw !== "string" || raw.trim() === "") continue;

    const result = trimContent(raw, action.headLines, action.tailLines);
    if (result.removedLines === 0) continue;

    block["content"] = result.text;
    seen.add(id);
    linesRemoved += result.removedLines;
    changed = true;

    if (event.toolUseResult !== undefined) {
      shrinkMirror(event, result.text);
    }
  }

  return { changed, linesRemoved };
}

// ─── trimContent — local copy, no dep on @glassbox/analysis ──────────────────
// The authoritative implementation lives in analysis/src/trim.ts (used by the
// planner). This copy is kept in sync manually; if you change artifact patterns
// there, update them here too.

const ARTIFACT_PATTERNS: RegExp[] = [
  /^(export\s+)?(default\s+)?(async\s+)?(function|class)\s+\w/,
  /^(export\s+)?(const|let|var|type|interface|enum|abstract\s+class)\s+\w/,
  /^(import|export)\s.*\bfrom\b/,
  /\brequire\s*\(/,
  /^(def|class|async\s+def)\s+\w/,
  /^func\s+\w/,
  /^type\s+\w+\s+(struct|interface)/,
  /^(pub\s+)?(fn|impl|struct|enum|trait)\s+\w/,
  /\b(Error|Exception|FAIL|PASS|WARN)[\s:]/i,
  /^\s+at\s+\S+.*:\d+/,
  /(?:\/[\w.-]+){2,}/,
  /\b(TODO|FIXME|HACK|NOTE|WARN):/i,
];

function trimContent(
  text: string,
  headLines: number,
  tailLines: number,
): { text: string; removedLines: number } {
  const minLines = headLines + tailLines + 15;
  const lines = text.split("\n");
  if (lines.length <= minLines) return { text, removedLines: 0 };

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
    const keep =
      i < headLines ||
      i >= lines.length - tailLines ||
      ARTIFACT_PATTERNS.some((p) => p.test(lines[i]!));

    if (keep) {
      flushRun();
      out.push(lines[i]!);
    } else {
      removedLines++;
      removedRun++;
    }
  }
  flushRun();

  return { text: out.join("\n"), removedLines };
}

function shrinkMirror(event: { toolUseResult?: unknown }, trimmed: string): void {
  const tur = event.toolUseResult;
  if (typeof tur === "string") {
    event.toolUseResult = trimmed;
    return;
  }
  if (tur === null || typeof tur !== "object") return;
  const obj = tur as Record<string, unknown>;
  const file = obj["file"];
  if (
    file &&
    typeof file === "object" &&
    typeof (file as Record<string, unknown>)["content"] === "string"
  ) {
    (file as Record<string, unknown>)["content"] = trimmed;
  }
  for (const key of ["stdout", "stderr", "content"]) {
    if (typeof obj[key] === "string" && obj[key] !== "") obj[key] = trimmed;
  }
}

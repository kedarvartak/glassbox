/**
 * Transcript fork-writer (cleaner Layer 2) — the *only* place that rewrites raw
 * Claude Code JSONL, and it never touches the user's original: it takes the raw
 * text in and returns *new* text, leaving I/O to the caller (the CLI). The
 * read-only-on-transcripts rule holds — the caller writes a separate file.
 *
 * What it does: given a map of `toolCallId → tombstone`, it finds the heavy bytes
 * that tool call pushed into the window and replaces just those with the short
 * tombstone, so the cleaned transcript loads ~N tokens lighter on `--resume`.
 *
 * Why tombstone instead of delete (doc 21 / the read-only constraint):
 *  - The Anthropic API requires every `tool_use` to keep a matching `tool_result`.
 *    Deleting a result would orphan its use and break the cleaned transcript on
 *    resume. Replacing only the *content string* keeps every block and pairing
 *    intact — the message structure and `parentUuid` tree are untouched.
 *
 * Where each tool's bytes live (mirrors {@link ./parse.ts} `liftFileOp`):
 *  - **Read**       → the `tool_result` block's `content` (a *user* message).
 *  - **Write**      → the `tool_use` block's `input.content` (an *assistant* msg).
 *  - **Edit/Multi** → `input.new_string` (and `input.edits[].new_string`).
 * The rewriter doesn't need to know the tool kind: it stubs whichever of these it
 * finds for a matching id. Lines it doesn't change are passed through byte-for-byte.
 */

export interface ForkSummary {
  /** Distinct tool calls whose content was tombstoned. */
  readonly evicted: number;
  /** Eviction ids that were requested but never located in the transcript. */
  readonly notFound: readonly string[];
  readonly bytesBefore: number;
  readonly bytesAfter: number;
}

export interface ForkResult {
  readonly text: string;
  readonly summary: ForkSummary;
}

export interface ForkOptions {
  /**
   * Re-stamp every line's `sessionId` to this value, making the fork a *new*
   * session Claude Code lists and resumes independently (its filename must match
   * this id). Omit to keep the original session id (a `.cleaned` sibling).
   */
  readonly newSessionId?: string;
}

/**
 * Produce a cleaned copy of `rawText` with each requested tool call's content
 * replaced by its tombstone. Pure: same input → same output, no I/O. Malformed
 * lines and lines with nothing to evict are passed through unchanged (unless a
 * `newSessionId` re-stamp is requested, which rewrites every line).
 */
export function forkTranscript(
  rawText: string,
  evictions: ReadonlyMap<string, string>,
  opts: ForkOptions = {},
): ForkResult {
  const lines = rawText.split("\n");
  const seen = new Set<string>();
  let evicted = 0;

  const out = lines.map((line) => {
    if (line.trim() === "") return line; // preserve blank/trailing lines verbatim
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch {
      return line; // not JSON we understand — never touch it
    }
    const changed = stubLine(ev, evictions, seen);
    let restamped = false;
    if (opts.newSessionId !== undefined) {
      const e = ev as Record<string, unknown>;
      if (typeof e["sessionId"] === "string") {
        e["sessionId"] = opts.newSessionId;
        restamped = true;
      }
    }
    if (changed === 0 && !restamped) return line; // untouched → keep original bytes exactly
    evicted += changed;
    return JSON.stringify(ev);
  });

  const notFound = [...evictions.keys()].filter((id) => !seen.has(id));
  return {
    text: out.join("\n"),
    summary: {
      evicted,
      notFound,
      bytesBefore: Buffer.byteLength(rawText, "utf8"),
      bytesAfter: Buffer.byteLength(out.join("\n"), "utf8"),
    },
  };
}

/** Stub every evictable block in one parsed event. Returns how many it changed. */
function stubLine(ev: unknown, evictions: ReadonlyMap<string, string>, seen: Set<string>): number {
  const event = ev as { message?: { content?: unknown }; toolUseResult?: unknown };
  const content = event?.message?.content;
  if (!Array.isArray(content)) return 0;

  let changed = 0;
  let stubbedResult = false;
  for (const block of content as Record<string, unknown>[]) {
    const type = block["type"];

    // Read result: the bytes are the tool_result's `content`.
    if (type === "tool_result" && typeof block["tool_use_id"] === "string") {
      const tomb = evictions.get(block["tool_use_id"] as string);
      if (tomb !== undefined) {
        block["content"] = tomb;
        seen.add(block["tool_use_id"] as string);
        changed++;
        stubbedResult = true;
      }
      continue;
    }

    // Write/Edit: the bytes are inside the tool_use's `input`.
    if (type === "tool_use" && typeof block["id"] === "string") {
      const tomb = evictions.get(block["id"] as string);
      if (tomb !== undefined && stubInput(block["input"], tomb)) {
        seen.add(block["id"] as string);
        changed++;
      }
    }
  }

  // Claude Code mirrors a Read/Bash result in a top-level `toolUseResult`. If we
  // tombstoned the API-facing copy, shrink the mirror too — otherwise a resume
  // that rebuilds from the mirror would re-inflate the exact bytes we removed.
  if (stubbedResult && event.toolUseResult !== undefined) {
    stubMirror(event, "[glassbox: removed — see tombstoned tool_result]");
  }
  return changed;
}

/** Shrink the content-bearing fields of a `toolUseResult` mirror, keeping its shape. */
function stubMirror(event: { toolUseResult?: unknown }, tomb: string): void {
  const tur = event.toolUseResult;
  if (typeof tur === "string") {
    event.toolUseResult = tomb;
    return;
  }
  if (tur === null || typeof tur !== "object") return;
  const obj = tur as Record<string, unknown>;
  // Read shape: { type, file: { content, … } }
  const file = obj["file"];
  if (file && typeof file === "object" && typeof (file as Record<string, unknown>)["content"] === "string") {
    (file as Record<string, unknown>)["content"] = tomb;
  }
  // Bash shape: { stdout, stderr, … }; generic shape: { content }
  for (const key of ["stdout", "stderr", "content"]) {
    if (typeof obj[key] === "string" && obj[key] !== "") obj[key] = tomb;
  }
}

/** Replace the heavy file-content fields of a Write/Edit input with the tombstone. */
function stubInput(input: unknown, tomb: string): boolean {
  if (input === null || typeof input !== "object") return false;
  const obj = input as Record<string, unknown>;
  let touched = false;
  if (typeof obj["content"] === "string") {
    obj["content"] = tomb;
    touched = true;
  }
  if (typeof obj["new_string"] === "string") {
    obj["new_string"] = tomb;
    touched = true;
  }
  if (Array.isArray(obj["edits"])) {
    for (const e of obj["edits"] as Record<string, unknown>[]) {
      if (e && typeof e["new_string"] === "string") {
        e["new_string"] = tomb;
        touched = true;
      }
    }
  }
  return touched;
}

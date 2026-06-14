import { randomUUID } from "node:crypto";

/**
 * Tier 3 transcript composer — replaces the cold prefix with a synthetic
 * preamble and re-roots the working set into a new resumable session.
 *
 * Two functions:
 *  - `extractColdText`           — scan raw JSONL, pull text+thinking from
 *                                  cold assistant messages → the LLM's input.
 *  - `composeCompactedTranscript` — replace everything before the boundary
 *                                  UUID with preamble messages, re-root the
 *                                  boundary message's `parentUuid`, restamp
 *                                  sessionIds.
 *
 * Structural guarantee (the extended validator checks these):
 *  - Preamble messages contain no `tool_use` blocks → no pairing debt.
 *  - Boundary message's `parentUuid` → last preamble UUID → no dangling link.
 *  - Every `tool_use`/`tool_result` pair inside the working set is untouched.
 */

export interface ComposeResult {
  readonly text: string;
  readonly preambleMessageId: string;
  readonly preservedLines: number;
  readonly droppedLines: number;
}

/**
 * Extract text and thinking content from cold assistant messages in the
 * transcript. This is the raw input to the summarizer — it sees only the cold
 * reasoning, never the working set or garbage (already cleared by Tier 0/1).
 */
export function extractColdText(rawText: string, coldMessageIds: ReadonlySet<string>): string {
  const parts: string[] = [];

  for (const line of rawText.split("\n")) {
    if (line.trim() === "") continue;
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }

    const event = ev as Record<string, unknown>;
    if (event["type"] !== "assistant") continue;
    const uuid = event["uuid"];
    if (typeof uuid !== "string" || !coldMessageIds.has(uuid)) continue;

    const msg = event["message"] as { content?: unknown } | undefined;
    const content = msg?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content as Record<string, unknown>[]) {
      if (block["type"] === "text" && typeof block["text"] === "string") {
        const t = block["text"].trim();
        if (t) parts.push(t);
      } else if (block["type"] === "thinking" && typeof block["thinking"] === "string") {
        const t = block["thinking"].trim();
        if (t) parts.push(`<thinking>\n${t}\n</thinking>`);
      }
    }
  }

  return parts.join("\n\n");
}

/**
 * Replace everything before `boundaryMessageId` with a preamble, re-root
 * the boundary message, and restamp `sessionId` throughout.
 *
 * The preamble is a single `user` message containing the digest (ledger +
 * LLM summary). It has `parentUuid: null` — it starts the new chain. The
 * boundary message's `parentUuid` is updated to the preamble's UUID.
 */
export function composeCompactedTranscript(
  rawText: string,
  preambleContent: string,
  boundaryMessageId: string,
  newSessionId: string,
): ComposeResult {
  const lines = rawText.split("\n");

  // Find the index of the boundary line.
  let boundaryIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    try {
      const ev = JSON.parse(line) as Record<string, unknown>;
      if (ev["uuid"] === boundaryMessageId) {
        boundaryIdx = i;
        break;
      }
    } catch {
      continue;
    }
  }

  if (boundaryIdx === -1) {
    // Boundary not found — return the transcript unchanged as a safe fallback.
    return { text: rawText, preambleMessageId: "", preservedLines: lines.length, droppedLines: 0 };
  }

  // Build the preamble message — a single `user` event, no tool_use blocks.
  const preambleUuid = randomUUID();
  const preambleTs = new Date().toISOString();
  const preambleEvent = {
    type: "user",
    uuid: preambleUuid,
    parentUuid: null,
    sessionId: newSessionId,
    timestamp: preambleTs,
    message: {
      role: "user",
      content: preambleContent,
    },
  };

  const out: string[] = [JSON.stringify(preambleEvent)];

  // Re-root the boundary message and restamp all working-set lines.
  let droppedLines = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") {
      if (i >= boundaryIdx) out.push(line);
      continue;
    }
    if (i < boundaryIdx) {
      droppedLines++;
      continue;
    }

    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch {
      out.push(line);
      continue;
    }

    const event = ev as Record<string, unknown>;

    // Restamp sessionId on every post-boundary line.
    if (typeof event["sessionId"] === "string") event["sessionId"] = newSessionId;

    // Re-root the boundary message to the preamble.
    if (event["uuid"] === boundaryMessageId) {
      event["parentUuid"] = preambleUuid;
    }

    out.push(JSON.stringify(event));
  }

  return {
    text: out.join("\n"),
    preambleMessageId: preambleUuid,
    preservedLines: lines.length - boundaryIdx,
    droppedLines,
  };
}

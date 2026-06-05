import type {
  ContextSnapshot,
  MessageId,
  Segment,
  SegmentSource,
  Session,
  TokenCounter,
  ToolCallId,
} from "@glassbox/core";
import { asIsoTimestamp, asMessageId, asSegmentId } from "@glassbox/core";

/**
 * Context reconstruction (doc 17 §1.3): for a point in the session, compute
 * **what was resident in the window** — broken down into {@link Segment}s by
 * source. This is the data behind the context x-ray (Job 1) and the substrate
 * the reclaimable analyzer scores (doc 20).
 *
 * Facts only. Every segment is emitted with `status: "unknown"`; deciding
 * whether one is gone/stale/spent/duplicate is the analyzer's job (it alone
 * touches the filesystem/git, via {@link import("@glassbox/core").RepoState}).
 * Keeping reconstruction verdict-free is what lets the same snapshot feed both
 * the x-ray UI and the hygiene checks.
 *
 * Where each segment's tokens come from:
 *  - **file content** (`FileOp.contentTokens`) and **tool output**
 *    (`ToolCall.resultTokens`) were already sized by the adapter at parse time,
 *    so we reuse those counts verbatim — no re-tokenizing.
 *  - **history text** (user/assistant/thinking) is sized here via the injected
 *    {@link TokenCounter} (the same swappable seam, directional today).
 *
 * `totalTokens` is the sum of *attributed* segments. It won't equal the turn's
 * `cache_read` exactly — the system prompt and tool definitions are in the real
 * window but absent from the transcript, so they can't be attributed. The gap is
 * unattributed-by-design, not lost; reclaimable-% is therefore "% of attributed
 * context," which is the honest denominator.
 */
export interface ReconstructOptions {
  readonly tokens: TokenCounter;
  /** Snapshot the window as of this message (default: the session's last). */
  readonly atMessageId?: MessageId;
}

export function reconstructContext(session: Session, opts: ReconstructOptions): ContextSnapshot {
  const { tokens } = opts;

  // The window at message N is the linear history messages[0..N]. (Branching/
  // sidechains are preserved in the model but treated linearly here — good
  // enough for the x-ray; revisit if subagent windows need isolating.)
  const cutoffIndex = resolveCutoff(session, opts.atMessageId);
  const windowMessages = session.messages.slice(0, cutoffIndex + 1);
  const inWindow = new Set<MessageId>(windowMessages.map((m) => m.id));
  const atMessage = windowMessages[windowMessages.length - 1];

  const segments: Segment[] = [];
  let seq = 0;
  const add = (init: SegmentInit): void => {
    segments.push({
      id: asSegmentId(`${init.source}:${seq++}`),
      source: init.source,
      label: init.label,
      sizeTokens: init.sizeTokens,
      originMessageId: init.originMessageId,
      status: "unknown",
      ...(init.originToolCallId ? { originToolCallId: init.originToolCallId } : {}),
      ...(init.path ? { path: init.path } : {}),
    });
  };

  // 1. History text — user prompts, assistant replies, visible thinking.
  //    tool_use / tool_result blocks are handled below via FileOps/ToolCalls so
  //    their bytes are sized and sourced exactly once.
  for (const m of windowMessages) {
    for (const block of m.blocks) {
      if (block.kind === "text" && block.text.trim() !== "") {
        add({
          source: roleSource(m.role),
          label: preview(block.text),
          sizeTokens: tokens.count(block.text),
          originMessageId: m.id,
        });
      } else if (block.kind === "thinking" && block.text.trim() !== "") {
        // Omitted thinking has no resident text to attribute — skip it.
        add({
          source: "thinking",
          label: preview(block.text),
          sizeTokens: tokens.count(block.text),
          originMessageId: m.id,
        });
      }
    }
  }

  // 2. File content — the strongest hygiene signal (doc 20 Type #2). Memory
  //    files are surfaced as their own source, reusing the adapter's detection.
  const memoryPaths = new Set(session.memoryOps.map((op) => op.target));
  for (const op of session.fileOps) {
    if (!inWindow.has(op.messageId)) continue;
    add({
      source: memoryPaths.has(op.path) ? "memory" : "file",
      label: `${op.kind} ${basename(op.path)}`,
      sizeTokens: op.contentTokens,
      originMessageId: op.messageId,
      originToolCallId: op.toolCallId,
      path: op.path,
    });
  }

  // 3. Non-file tool output — spent one-shot results (doc 20 Type #3). File
  //    tools' output is already counted as file content above, so skip them.
  const fileToolCallIds = new Set<ToolCallId>(session.fileOps.map((op) => op.toolCallId));
  for (const call of session.toolCalls) {
    if (call.resultText === null || call.resultTokens === null) continue;
    if (fileToolCallIds.has(call.id)) continue;
    const enteredAt = call.resolvedInMessageId ?? call.requestedInMessageId;
    if (!inWindow.has(enteredAt)) continue;
    add({
      source: "tool_result",
      label: `${call.name} result`,
      sizeTokens: call.resultTokens,
      originMessageId: enteredAt,
      originToolCallId: call.id,
    });
  }

  const totalTokens = segments.reduce((sum, s) => sum + s.sizeTokens, 0);

  return {
    atMessageId: atMessage?.id ?? asMessageId(""),
    timestamp: atMessage?.timestamp ?? asIsoTimestamp(session.endedAt),
    segments,
    totalTokens,
  };
}

/**
 * Composition by source — the x-ray's headline breakdown. Tokens per source,
 * descending. A thin fold over a snapshot, handy for the CLI and UI.
 */
export function composition(snapshot: ContextSnapshot): { source: SegmentSource; tokens: number }[] {
  const bySource = new Map<SegmentSource, number>();
  for (const s of snapshot.segments) {
    bySource.set(s.source, (bySource.get(s.source) ?? 0) + s.sizeTokens);
  }
  return [...bySource.entries()]
    .map(([source, tokens]) => ({ source, tokens }))
    .sort((a, b) => b.tokens - a.tokens);
}

// ───────────────────────────── helpers ─────────────────────────────

interface SegmentInit {
  readonly source: SegmentSource;
  readonly label: string;
  readonly sizeTokens: number;
  readonly originMessageId: MessageId;
  readonly originToolCallId?: ToolCallId;
  readonly path?: string;
}

function resolveCutoff(session: Session, atMessageId?: MessageId): number {
  if (!atMessageId) return session.messages.length - 1;
  const i = session.messages.findIndex((m) => m.id === atMessageId);
  return i >= 0 ? i : session.messages.length - 1;
}

function roleSource(role: "user" | "assistant" | "system"): SegmentSource {
  return role === "user" ? "user" : role === "assistant" ? "assistant" : "system";
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function preview(text: string, max = 50): string {
  const firstLine = text.trim().split("\n")[0] ?? "";
  return firstLine.length > max ? `${firstLine.slice(0, max - 1)}…` : firstLine;
}

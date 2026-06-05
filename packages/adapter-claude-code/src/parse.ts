import { createHash } from "node:crypto";
import type {
  ContentBlock,
  FileOp,
  FileOpKind,
  IsoTimestamp,
  MemoryOp,
  Message,
  MessageId,
  MessageRole,
  Session,
  SessionRef,
  ToolCall,
  TokenCounter,
  TokenUsage,
  Turn,
} from "@glassbox/core";
import {
  asIsoTimestamp,
  asMessageId,
  asSessionId,
  asToolCallId,
} from "@glassbox/core";
import {
  isTreeEvent,
  type RawBlock,
  type RawEvent,
  type RawMessageEvent,
  type RawToolResultPart,
  type RawTreeFields,
  type RawUsage,
} from "./raw.js";

/**
 * Parse one Claude Code session transcript into the normalized model.
 *
 * Pure and synchronous: it takes the file *contents* (the adapter owns the fs
 * read) plus the {@link TokenCounter} seam, so it's trivially golden-testable
 * against a fixture string. Never throws on bad data — malformed lines and
 * unknown shapes become `warnings` + best-effort partial output (doc 17 §6).
 *
 * The interesting passes, in order:
 *  1. Parse lines → raw events (bad JSON → warning, skip).
 *  2. Build one {@link Message} per tree event, preserving `uuid`/`parentUuid`
 *     lineage. **Usage is deduped per provider `message.id`** — Claude Code
 *     splits one API response across several JSONL lines that each repeat the
 *     same `usage`, so naively keeping them all would multiply the token count.
 *  3. Stitch `tool_use`↔`tool_result` (they live in different messages) into
 *     {@link ToolCall}s, and lift Read/Write/Edit into {@link FileOp}s and, when
 *     the path is a memory file, {@link MemoryOp}s.
 *  4. Group messages into {@link Turn}s (a turn = a real user prompt + the
 *     agent's response up to the next prompt).
 */
export function parseClaudeSession(
  content: string,
  ref: SessionRef,
  tokens: TokenCounter,
): Session {
  const warnings: string[] = [];
  const events = parseLines(content, warnings);

  const messages: Message[] = [];
  /** Aligned with `messages`: did this event begin a new turn? */
  const startsTurn: boolean[] = [];

  const pendingUses: PendingUse[] = [];
  const results = new Map<string, PendingResult>();
  const seenUsageMsgIds = new Set<string>();

  const meta: SessionMeta = {};
  let minTs: string | undefined;
  let maxTs: string | undefined;

  for (const ev of events) {
    if (!isTreeEvent(ev)) continue; // metadata line (no uuid) — not a message
    const t = ev as RawTreeFields;
    absorbMeta(meta, t);
    if (typeof t.timestamp === "string") {
      if (minTs === undefined || t.timestamp < minTs) minTs = t.timestamp;
      if (maxTs === undefined || t.timestamp > maxTs) maxTs = t.timestamp;
    }

    const id = asMessageId(t.uuid as string);
    const parentId = t.parentUuid ? asMessageId(t.parentUuid) : null;
    const timestamp = asIsoTimestamp(t.timestamp ?? "");
    const isSidechain = t.isSidechain === true;
    const role = roleOf(ev);

    const { blocks, usage, model, providerMessageId, isPrompt } = buildBlocks(
      ev,
      id,
      timestamp,
      pendingUses,
      results,
      seenUsageMsgIds,
    );

    const message: Message = {
      id,
      parentId,
      role,
      timestamp,
      blocks,
      isSidechain,
      ...(usage ? { usage } : {}),
      ...(model ? { model } : {}),
      ...(providerMessageId ? { providerMessageId } : {}),
    };
    messages.push(message);
    startsTurn.push(isPrompt);
  }

  const { toolCalls, fileOps, memoryOps } = stitch(pendingUses, results, tokens);

  return {
    id: asSessionId(meta.sessionId ?? sessionIdFromLocator(ref.locator)),
    tool: "claude-code",
    toolVersion: meta.version ?? null,
    projectPath: meta.cwd ?? ref.projectPath ?? "",
    gitBranch: meta.gitBranch ?? null,
    startedAt: asIsoTimestamp(minTs ?? ""),
    endedAt: asIsoTimestamp(maxTs ?? minTs ?? ""),
    messages,
    turns: buildTurns(messages, startsTurn),
    toolCalls,
    fileOps,
    memoryOps,
    compactions: [], // no compaction marker observed in Claude Code yet (doc 19 §1)
    warnings,
  };
}

// ───────────────────────────── line parsing ─────────────────────────────

function parseLines(content: string, warnings: string[]): RawEvent[] {
  const events: RawEvent[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    try {
      events.push(JSON.parse(trimmed) as RawEvent);
    } catch {
      warnings.push(`skipped malformed JSON on line ${i + 1}`);
    }
  });
  return events;
}

// ───────────────────────────── block building ───────────────────────────

interface BuiltMessage {
  readonly blocks: ContentBlock[];
  readonly usage: TokenUsage | undefined;
  readonly model: string | undefined;
  readonly providerMessageId: string | undefined;
  readonly isPrompt: boolean;
}

function buildBlocks(
  ev: RawEvent,
  messageId: MessageId,
  timestamp: IsoTimestamp,
  pendingUses: PendingUse[],
  results: Map<string, PendingResult>,
  seenUsageMsgIds: Set<string>,
): BuiltMessage {
  // system / attachment events have no `message`; preserve them losslessly.
  if (ev.type === "system" || ev.type === "attachment") {
    const rawKind = ev.type === "system"
      ? `system:${(ev as { subtype?: string }).subtype ?? "?"}`
      : `attachment:${(ev as { attachment?: { type?: string } }).attachment?.type ?? "?"}`;
    return {
      blocks: [{ kind: "unknown", rawKind, raw: ev }],
      usage: undefined,
      model: undefined,
      providerMessageId: undefined,
      isPrompt: false,
    };
  }

  const msgEv = ev as RawMessageEvent;
  const msg = msgEv.message;
  const content = msg?.content;

  // A bare-string `user` content is a typed prompt (the turn boundary signal).
  if (typeof content === "string") {
    const isPrompt = ev.type === "user" && msgEv.isMeta !== true && content.trim() !== "";
    return {
      blocks: [{ kind: "text", text: content }],
      usage: undefined,
      model: undefined,
      providerMessageId: undefined,
      isPrompt,
    };
  }

  const blocks: ContentBlock[] = [];
  let sawText = false;
  for (const raw of content ?? []) {
    const block = mapBlock(raw, messageId, timestamp, pendingUses, results);
    if (block.kind === "text") sawText = true;
    blocks.push(block);
  }

  // Dedupe usage on the provider message id: only the first JSONL line of a
  // multi-line response carries it forward (see parseClaudeSession docstring).
  let usage: TokenUsage | undefined;
  const provId = msg?.id;
  if (ev.type === "assistant" && msg?.usage && (!provId || !seenUsageMsgIds.has(provId))) {
    usage = mapUsage(msg.usage);
    if (provId) seenUsageMsgIds.add(provId);
  }

  // A user message that carries real text (not only tool_result) starts a turn.
  const isPrompt = ev.type === "user" && msgEv.isMeta !== true && sawText;

  return { blocks, usage, model: msg?.model, providerMessageId: provId, isPrompt };
}

function mapBlock(
  raw: RawBlock,
  messageId: MessageId,
  timestamp: IsoTimestamp,
  pendingUses: PendingUse[],
  results: Map<string, PendingResult>,
): ContentBlock {
  switch (raw.type) {
    case "text":
      return { kind: "text", text: raw.text ?? "" };
    case "thinking":
      return { kind: "thinking", text: raw.thinking ?? "" };
    case "tool_use": {
      const toolCallId = asToolCallId(raw.id ?? "");
      pendingUses.push({
        id: raw.id ?? "",
        name: raw.name ?? "",
        input: raw.input,
        messageId,
        timestamp,
      });
      return { kind: "tool_use", toolCallId, name: raw.name ?? "", input: raw.input };
    }
    case "tool_result": {
      const id = raw.tool_use_id ?? "";
      const text = flattenResult(raw.content);
      const isError = raw.is_error === true;
      // First result wins if a tool_use_id somehow repeats.
      if (id && !results.has(id)) {
        results.set(id, { id, text, isError, messageId, timestamp });
      }
      return {
        kind: "tool_result",
        toolCallId: asToolCallId(id),
        isError,
        text,
        ...(raw.content !== undefined ? { raw: raw.content } : {}),
      };
    }
    default:
      return { kind: "unknown", rawKind: raw.type ?? "?", raw };
  }
}

function flattenResult(content: string | readonly RawToolResultPart[] | undefined): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n");
  }
  return "";
}

function mapUsage(u: RawUsage): TokenUsage {
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
  };
}

function roleOf(ev: RawEvent): MessageRole {
  if (ev.type === "assistant") return "assistant";
  if (ev.type === "user") return "user";
  return "system"; // system + attachment are harness-level context
}

// ──────────────────────── tool-call / fileop stitching ──────────────────

interface PendingUse {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  readonly messageId: MessageId;
  readonly timestamp: IsoTimestamp;
}
interface PendingResult {
  readonly id: string;
  readonly text: string;
  readonly isError: boolean;
  readonly messageId: MessageId;
  readonly timestamp: IsoTimestamp;
}

function stitch(
  uses: readonly PendingUse[],
  results: Map<string, PendingResult>,
  tokens: TokenCounter,
): { toolCalls: ToolCall[]; fileOps: FileOp[]; memoryOps: MemoryOp[] } {
  const toolCalls: ToolCall[] = [];
  const fileOps: FileOp[] = [];
  const memoryOps: MemoryOp[] = [];

  for (const use of uses) {
    const result = use.id ? results.get(use.id) : undefined;
    const resultText = result?.text ?? null;
    toolCalls.push({
      id: asToolCallId(use.id),
      name: use.name,
      requestedInMessageId: use.messageId,
      resolvedInMessageId: result?.messageId ?? null,
      input: use.input,
      resultText,
      isError: result?.isError ?? false,
      resultTokens: resultText !== null ? tokens.count(resultText) : null,
      ...(resultText !== null ? { contentHash: sha(resultText) } : {}),
      requestedAt: use.timestamp,
      resolvedAt: result?.timestamp ?? null,
    });

    const fileOp = liftFileOp(use, result, tokens);
    if (fileOp) {
      fileOps.push(fileOp);
      const memOp = liftMemoryOp(fileOp);
      if (memOp) memoryOps.push(memOp);
    }
  }

  return { toolCalls, fileOps, memoryOps };
}

/** Map the file-touching tools onto a normalized {@link FileOp}, or null. */
function liftFileOp(
  use: PendingUse,
  result: PendingResult | undefined,
  tokens: TokenCounter,
): FileOp | null {
  const kind = FILE_TOOLS[use.name];
  if (!kind) return null;
  const input = (use.input ?? {}) as Record<string, unknown>;
  const path = typeof input["file_path"] === "string" ? (input["file_path"] as string) : null;
  if (!path) return null;

  // The content that entered the window comes from wherever the file text was:
  // a Read injects it via the *result*; a Write/Edit via its *input*. Token size
  // and content hash are both derived from that one string.
  let content = "";
  if (kind === "read") {
    content = result?.text ?? "";
  } else if (kind === "write") {
    content = asStr(input["content"]);
  } else if (kind === "edit") {
    content = editedText(input);
  }

  return {
    kind,
    path,
    contentTokens: tokens.count(content),
    ...(content ? { contentHash: sha(content) } : {}),
    toolCallId: asToolCallId(use.id),
    messageId: use.messageId,
    timestamp: use.timestamp,
  };
}

/** Claude Code tools that push file content into the window (doc 20 Type #2). */
const FILE_TOOLS: Record<string, FileOpKind | undefined> = {
  Read: "read",
  Write: "write",
  Edit: "edit",
  MultiEdit: "edit",
  NotebookEdit: "edit",
};

function editedText(input: Record<string, unknown>): string {
  // MultiEdit carries an `edits` array; Edit carries `new_string` directly.
  const edits = input["edits"];
  if (Array.isArray(edits)) {
    return edits.map((e) => asStr((e as Record<string, unknown>)?.["new_string"])).join("\n");
  }
  return asStr(input["new_string"]);
}

/**
 * In Claude Code, memory *is* files (doc 19): `CLAUDE.md`, `MEMORY.md`, and the
 * project `memory/` dir. So a Write/Edit to one of those is a memory write/edit,
 * and a Read of one is a (inferred) recall. The confidence is always `inferred`
 * — Claude Code has no structured memory log, unlike Codex.
 */
function liftMemoryOp(op: FileOp): MemoryOp | null {
  if (!isMemoryPath(op.path)) return null;
  return {
    kind: op.kind === "read" ? "recall" : op.kind === "edit" ? "edit" : "write",
    target: op.path,
    tokens: op.contentTokens,
    confidence: "inferred",
    messageId: op.messageId,
    timestamp: op.timestamp,
  };
}

function isMemoryPath(path: string): boolean {
  if (/\/memory\//.test(path)) return true;
  const base = path.split(/[/\\]/).pop() ?? "";
  return base === "CLAUDE.md" || base === "MEMORY.md";
}

// ───────────────────────────── turn grouping ────────────────────────────

/**
 * A turn = a real user prompt and every message after it up to the next prompt.
 * Messages before the first prompt (initial attachments/system context) are
 * folded into the first turn so nothing is orphaned.
 */
function buildTurns(messages: readonly Message[], startsTurn: readonly boolean[]): Turn[] {
  // Work in a mutable shape, then return it (mutable → readonly is assignable).
  interface MutableTurn {
    index: number;
    userMessageId: MessageId;
    messageIds: MessageId[];
  }
  const turns: MutableTurn[] = [];
  const preamble: MessageId[] = [];

  messages.forEach((msg, i) => {
    if (startsTurn[i]) {
      turns.push({ index: turns.length, userMessageId: msg.id, messageIds: [msg.id] });
    } else {
      const current = turns[turns.length - 1];
      if (current) current.messageIds.push(msg.id);
      else preamble.push(msg.id);
    }
  });

  const first = turns[0];
  if (first && preamble.length > 0) {
    first.messageIds.unshift(...preamble);
  } else if (turns.length === 0 && messages.length > 0) {
    // No typed prompt anywhere (e.g. a tool-only session) — one synthetic turn.
    const head = messages[0] as Message;
    turns.push({ index: 0, userMessageId: head.id, messageIds: messages.map((m) => m.id) });
  }
  return turns;
}

// ───────────────────────────── small helpers ────────────────────────────

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Short content fingerprint for byte-identical duplicate detection (doc 20). */
function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Session-level fields, taken from the first event that carries each. */
interface SessionMeta {
  sessionId?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
}

function absorbMeta(into: SessionMeta, ev: RawTreeFields): void {
  if (into.sessionId === undefined && ev.sessionId !== undefined) into.sessionId = ev.sessionId;
  if (into.cwd === undefined && ev.cwd !== undefined) into.cwd = ev.cwd;
  if (into.version === undefined && ev.version !== undefined) into.version = ev.version;
  if (into.gitBranch === undefined && ev.gitBranch !== undefined) into.gitBranch = ev.gitBranch;
}

function sessionIdFromLocator(locator: string): string {
  const base = locator.split(/[/\\]/).pop() ?? locator;
  return base.replace(/\.jsonl$/, "");
}

/**
 * The **real** on-disk Claude Code transcript schema, captured from live state on
 * the spike machine (doc 19 §1) and re-sampled before writing the parser. This
 * file is the single place that knows what Claude Code's JSONL actually looks
 * like — the parser ({@link ./parse.ts}) maps these shapes onto the tool-neutral
 * `@glassbox/core` model, and nothing past this package ever sees a raw field.
 *
 * Everything here is `readonly` and deliberately *loose* (lots of `?` and
 * `unknown`): transcripts are an undocumented, fast-moving format, so the parser
 * treats every field as possibly-absent and degrades gracefully rather than
 * trusting a shape (doc 17 §6).
 *
 * Observed `type` values: `user`, `assistant`, `system`, `attachment`,
 * `file-history-snapshot`, `permission-mode`, `ai-title`, `last-prompt`.
 * Only the first four carry a `uuid` and belong in the message tree; the rest
 * are session metadata the parser skips.
 */

/** Fields shared by every event that is a node in the `parentUuid` tree. */
export interface RawTreeFields {
  readonly uuid?: string;
  readonly parentUuid?: string | null;
  readonly timestamp?: string;
  readonly sessionId?: string;
  readonly cwd?: string;
  readonly version?: string;
  readonly gitBranch?: string;
  readonly isSidechain?: boolean;
  /** Harness-injected user events (command output etc.) — never a real prompt. */
  readonly isMeta?: boolean;
}

/** A `user` or `assistant` line. The shape of `message` differs by role. */
export interface RawMessageEvent extends RawTreeFields {
  readonly type: "user" | "assistant";
  readonly message?: RawMessage;
  /**
   * On `user` tool-result lines, Claude Code also attaches a *structured* result
   * alongside the flattened `tool_result` block (e.g. `{ type, file: { content,
   * numLines, … } }`). Preserved verbatim so analysis can use it later.
   */
  readonly toolUseResult?: unknown;
}

export interface RawMessage {
  readonly role?: string;
  /** Provider message id (e.g. `msg_…`). One API response can span several JSONL
   * lines that all repeat this id and the same `usage` — the parser dedupes on it. */
  readonly id?: string;
  readonly model?: string;
  readonly usage?: RawUsage;
  /** A bare string (a typed user prompt) or an array of content blocks. */
  readonly content?: string | readonly RawBlock[];
}

/** The Anthropic `usage` object as Claude Code persists it (extra fields ignored). */
export interface RawUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_input_tokens?: number;
  readonly cache_creation_input_tokens?: number;
}

/** A content block inside `message.content`. Discriminated on `type`. */
export interface RawBlock {
  readonly type?: string;
  // text
  readonly text?: string;
  // thinking
  readonly thinking?: string;
  // tool_use
  readonly id?: string;
  readonly name?: string;
  readonly input?: unknown;
  // tool_result
  readonly tool_use_id?: string;
  readonly is_error?: boolean;
  /** tool_result payload: a string, or an array of `{ type:"text", text }` parts. */
  readonly content?: string | readonly RawToolResultPart[];
}

export interface RawToolResultPart {
  readonly type?: string;
  readonly text?: string;
}

/** A `system` diagnostic line (subtypes seen: `turn_duration`, `away_summary`). */
export interface RawSystemEvent extends RawTreeFields {
  readonly type: "system";
  readonly subtype?: string;
  /** Compaction summary text — present on `away_summary` events. */
  readonly summary?: string;
  /** Alternate field name used in some Claude Code builds. */
  readonly leafText?: string;
}

/** An `attachment` line — harness-injected context (dir snapshots, skills, …). */
export interface RawAttachmentEvent extends RawTreeFields {
  readonly type: "attachment";
  readonly attachment?: { readonly type?: string } & Record<string, unknown>;
}

/** Anything else (metadata lines without a `uuid`). */
export interface RawOtherEvent {
  readonly type?: string;
  readonly [k: string]: unknown;
}

export type RawEvent = RawMessageEvent | RawSystemEvent | RawAttachmentEvent | RawOtherEvent;

/** True for the event types that become {@link import("@glassbox/core").Message}s. */
export function isTreeEvent(
  ev: RawEvent,
): ev is RawMessageEvent | RawSystemEvent | RawAttachmentEvent {
  return (
    (ev.type === "user" ||
      ev.type === "assistant" ||
      ev.type === "system" ||
      ev.type === "attachment") &&
    typeof (ev as RawTreeFields).uuid === "string"
  );
}

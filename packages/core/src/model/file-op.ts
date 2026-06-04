import type { IsoTimestamp, MessageId, ToolCallId } from "./ids.js";

export type FileOpKind = "read" | "write" | "edit" | "delete";

/**
 * A file touched during the session, lifted out of a tool call.
 *
 * This is the backbone of the strongest hygiene signal (doc 20 Type #2:
 * orphaned & duplicate file content). Every Read/Write/Edit pushes full file
 * content into the window and it *never leaves* — so to find the garbage we need
 * to know, per op: which path, how many tokens of content it injected, and when.
 *
 * The actual "is this stale?" verdict is NOT here — it's computed by the
 * analysis layer by cross-checking `path` against the real filesystem/git
 * (doc 20 §3, the "gone / stale / already-spent" rule). The model only records
 * the facts; classification stays in @glassbox/analysis.
 */
export interface FileOp {
  readonly kind: FileOpKind;
  /** Absolute or repo-relative path as the tool reported it. */
  readonly path: string;
  /** Tokens of file content this op injected into the window. */
  readonly contentTokens: number;

  readonly toolCallId: ToolCallId;
  readonly messageId: MessageId;
  readonly timestamp: IsoTimestamp;
}

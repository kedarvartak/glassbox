import type { ToolCallId } from "./ids.js";

/**
 * Content blocks — the atoms inside a {@link Message}.
 *
 * This is a discriminated union on `kind`, mirroring the block types observed in
 * Claude Code transcripts (`text`, `thinking`, `tool_use`, `tool_result`). Other
 * adapters normalize their own block shapes onto these four; anything that
 * doesn't fit becomes an `UnknownBlock` so the parser never drops data silently.
 */
export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | UnknownBlock;

export interface TextBlock {
  readonly kind: "text";
  readonly text: string;
}

export interface ThinkingBlock {
  readonly kind: "thinking";
  readonly text: string;
}

export interface ToolUseBlock {
  readonly kind: "tool_use";
  readonly toolCallId: ToolCallId;
  readonly name: string;
  /**
   * Raw tool input. Left as `unknown` on purpose: the shape is tool-specific
   * (a Write carries file contents, a Bash carries a command). Adapters that
   * recognize a tool lift the interesting bits into a {@link FileOp}/MemoryOp;
   * the raw payload stays here for everything else.
   */
  readonly input: unknown;
}

export interface ToolResultBlock {
  readonly kind: "tool_result";
  /** Links back to the {@link ToolUseBlock} that produced this result. */
  readonly toolCallId: ToolCallId;
  readonly isError: boolean;
  /** Flattened textual result; structured payload preserved in `raw`. */
  readonly text: string;
  readonly raw?: unknown;
}

/** Escape hatch for block kinds we don't model yet. Keeps parsing lossless. */
export interface UnknownBlock {
  readonly kind: "unknown";
  readonly rawKind: string;
  readonly raw: unknown;
}

import type { IsoTimestamp, MessageId, ToolCallId } from "./ids.js";

/**
 * A normalized tool call — the join of a `tool_use` block with its matching
 * `tool_result`, which live in *different* messages in the raw transcript
 * (assistant requests, the next user message returns the result).
 *
 * Stitching them once, here, means analyses (e.g. "this tool output was never
 * referenced again" → reclaimable, doc 20 Type #3) don't each re-implement the
 * id-matching dance.
 */
export interface ToolCall {
  readonly id: ToolCallId;
  readonly name: string;

  /** Message containing the `tool_use`. */
  readonly requestedInMessageId: MessageId;
  /** Message containing the `tool_result`, if one was observed. */
  readonly resolvedInMessageId: MessageId | null;

  readonly input: unknown;
  readonly resultText: string | null;
  readonly isError: boolean;

  /** Token size of the result payload — what this call cost the window. */
  readonly resultTokens: number | null;
  /** Stable hash of `resultText` — for duplicate-output detection (doc 20). */
  readonly contentHash?: string;

  readonly requestedAt: IsoTimestamp;
  readonly resolvedAt: IsoTimestamp | null;
}

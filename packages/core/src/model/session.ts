import type { CompactionEvent } from "./compaction.js";
import type { FileOp } from "./file-op.js";
import type { IsoTimestamp, MessageId, SessionId } from "./ids.js";
import type { Message } from "./message.js";
import type { MemoryOp } from "./memory.js";
import type { SourceTool } from "./source.js";
import type { ToolCall } from "./tool-call.js";

/**
 * A turn = one user prompt and everything the agent did in response, up to the
 * next user prompt. A *view* over the message tree (grouped by walking
 * `parentId` from each user message), not a separate source of truth — see
 * {@link Message}.
 */
export interface Turn {
  readonly index: number;
  readonly userMessageId: MessageId;
  readonly messageIds: readonly MessageId[];
}

/**
 * The top-level normalized object every adapter produces and every analysis +
 * view consumes. One `Session` ⇒ one agent conversation on disk.
 *
 * Cross-cutting facts (tool calls, file ops, memory ops, compactions) are
 * hoisted to session level rather than buried per-message: analyses scan them
 * as flat streams, and it keeps the per-message shape small.
 */
export interface Session {
  readonly id: SessionId;
  readonly tool: SourceTool;
  /** Adapter/tool version the session was produced by — drives churn handling. */
  readonly toolVersion: string | null;

  readonly projectPath: string;
  readonly gitBranch: string | null;

  readonly startedAt: IsoTimestamp;
  readonly endedAt: IsoTimestamp;

  readonly messages: readonly Message[];
  readonly turns: readonly Turn[];

  readonly toolCalls: readonly ToolCall[];
  readonly fileOps: readonly FileOp[];
  readonly memoryOps: readonly MemoryOp[];
  readonly compactions: readonly CompactionEvent[];

  /** Non-fatal issues encountered while parsing — degrade gracefully, surface honestly. */
  readonly warnings: readonly string[];
}

import type { ContentBlock } from "./content.js";
import type { IsoTimestamp, MessageId } from "./ids.js";
import type { TokenUsage } from "./tokens.js";

export type MessageRole = "user" | "assistant" | "system";

/**
 * A single normalized message/event.
 *
 * Transcripts store a flat, parent-linked event log (Claude Code: `uuid` +
 * `parentUuid`). We preserve that tree here rather than pre-flattening into
 * turns, because some analyses (subagent/spawn graphs — doc 19 §3) need the raw
 * lineage. {@link Turn} grouping is a view layered on top, not a replacement.
 */
export interface Message {
  readonly id: MessageId;
  readonly parentId: MessageId | null;
  readonly role: MessageRole;
  readonly timestamp: IsoTimestamp;
  readonly blocks: readonly ContentBlock[];

  /** Present on assistant messages; the actuals from the provider. */
  readonly usage?: TokenUsage;
  readonly model?: string;

  /** True for messages produced inside a subagent/sidechain. */
  readonly isSidechain: boolean;
}

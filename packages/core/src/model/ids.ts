/**
 * Branded identifier types.
 *
 * These are plain strings at runtime, but the brand prevents accidentally
 * passing a `MessageId` where a `SessionId` is expected. The whole model is
 * cross-tool, so IDs from different adapters flow through the same code paths —
 * the brand is cheap insurance against mixing them up.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** A session/conversation, unique per tool. */
export type SessionId = Brand<string, "SessionId">;
/** A single message/event within a session (e.g. Claude Code `uuid`). */
export type MessageId = Brand<string, "MessageId">;
/** A tool invocation (e.g. Claude Code `tool_use.id` / `toolu_…`). */
export type ToolCallId = Brand<string, "ToolCallId">;
/** A reconstructed context segment (see context-snapshot.ts). */
export type SegmentId = Brand<string, "SegmentId">;

/** Brand a raw string coming out of an adapter. No runtime cost. */
export const asSessionId = (s: string): SessionId => s as SessionId;
export const asMessageId = (s: string): MessageId => s as MessageId;
export const asToolCallId = (s: string): ToolCallId => s as ToolCallId;
export const asSegmentId = (s: string): SegmentId => s as SegmentId;

/**
 * Timestamps are ISO-8601 strings (what transcripts store) rather than `Date`,
 * so the model is trivially JSON-serializable — the engine emits the model as
 * JSON (`glassbox parse <session>`) and golden tests diff that JSON.
 */
export type IsoTimestamp = Brand<string, "IsoTimestamp">;
export const asIsoTimestamp = (s: string): IsoTimestamp => s as IsoTimestamp;

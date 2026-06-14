import { describe, expect, it } from "vitest";
import {
  asIsoTimestamp,
  asMessageId,
  asSessionId,
  asToolCallId,
  type ContentBlock,
  type Message,
  type Session,
  type TokenCounter,
  type TokenUsage,
} from "@glassbox/core";
import { checkTokenAccuracy } from "./token-accuracy.js";

const counter: TokenCounter = { count: (t) => Math.ceil(t.length / 4) };

function msg(
  id: string,
  providerMessageId: string,
  blocks: ContentBlock[],
  outputTokens?: number,
): Message {
  const usage: TokenUsage | undefined =
    outputTokens === undefined
      ? undefined
      : { inputTokens: 0, outputTokens, cacheReadTokens: 0, cacheCreationTokens: 0 };
  return {
    id: asMessageId(id),
    parentId: null,
    role: "assistant",
    timestamp: asIsoTimestamp("2026-06-04T00:00:00Z"),
    blocks,
    isSidechain: false,
    providerMessageId,
    ...(usage ? { usage } : {}),
  };
}

function sessionOf(messages: Message[]): Session {
  return {
    id: asSessionId("s1"),
    tool: "claude-code",
    toolVersion: null,
    projectPath: "/p",
    gitBranch: null,
    startedAt: asIsoTimestamp("2026-06-04T00:00:00Z"),
    endedAt: asIsoTimestamp("2026-06-04T00:00:00Z"),
    messages,
    turns: [],
    toolCalls: [],
    fileOps: [],
    memoryOps: [],
    compactions: [],
    warnings: [],
  };
}

const text = (t: string): ContentBlock => ({ kind: "text", text: t });

describe("checkTokenAccuracy", () => {
  it("regroups split responses and calibrates the estimate against output_tokens", () => {
    const session = sessionOf([
      // Response MA: two transcript events, one provider message. usage lives on
      // the first (deduped). Combined text "hello world again" = 17 chars → est 5.
      msg("a1", "MA", [text("hello world")], 4),
      msg("a2", "MA", [text(" again")]),
      // Response MB: contains thinking → excluded from the clean sample.
      msg("b1", "MB", [{ kind: "thinking", text: "" }, text("done")], 10),
      // Response MC: contains a tool call → excluded.
      msg(
        "c1",
        "MC",
        [{ kind: "tool_use", toolCallId: asToolCallId("t1"), name: "Read", input: {} }],
        20,
      ),
    ]);

    const r = checkTokenAccuracy(session, counter);

    expect(r.totalResponses).toBe(3);
    expect(r.excludedWithThinking).toBe(1);
    expect(r.excludedWithToolUse).toBe(1);
    expect(r.sampleResponses).toBe(1);
    expect(r.estimatedTokens).toBe(5); // ceil(17/4)
    expect(r.providerTokens).toBe(4);
    expect(r.ratio).toBeCloseTo(1.25);
    expect(r.meanAbsPctError).toBeCloseTo(0.25);
    expect(r.note).toMatch(/overcounts/);
  });

  it("reports honestly when there is no plain-text response to calibrate against", () => {
    const session = sessionOf([
      msg(
        "c1",
        "MC",
        [{ kind: "tool_use", toolCallId: asToolCallId("t1"), name: "Read", input: {} }],
        20,
      ),
    ]);
    const r = checkTokenAccuracy(session, counter);
    expect(r.ratio).toBeNull();
    expect(r.meanAbsPctError).toBeNull();
    expect(r.note).toMatch(/No plain-text responses/);
  });
});

import { describe, expect, it } from "vitest";
import {
  asIsoTimestamp,
  asMessageId,
  asSessionId,
  type Message,
  type Session,
  type TokenUsage,
} from "@glassbox/core";
import { analyzeSessionCost, costOfUsage } from "./cost.js";
import { pricingFor } from "./pricing.js";

const SONNET = pricingFor("claude-sonnet-4-6");

function usage(p: Partial<TokenUsage>): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, ...p };
}

function assistant(id: string, model: string | undefined, u: TokenUsage): Message {
  return {
    id: asMessageId(id),
    parentId: null,
    role: "assistant",
    timestamp: asIsoTimestamp("2026-06-04T00:00:00Z"),
    blocks: [],
    isSidechain: false,
    usage: u,
    ...(model ? { model } : {}),
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

describe("pricingFor", () => {
  it("resolves exact, dated, and family-fallback model ids", () => {
    expect(pricingFor("claude-sonnet-4-6")?.inputPerMTok).toBe(3);
    // dated variant → prefix match
    expect(pricingFor("claude-haiku-4-5-20251001")?.inputPerMTok).toBe(1);
    // unknown future opus → family fallback (never silently free)
    expect(pricingFor("claude-opus-4-9-experimental")?.inputPerMTok).toBe(5);
    expect(pricingFor("gpt-9")).toBeNull();
    expect(pricingFor(null)).toBeNull();
  });

  it("derives cache rates from the published multipliers", () => {
    const p = pricingFor("claude-sonnet-4-6");
    expect(p?.cacheReadPerMTok).toBe(0.3); // 0.1× input
    expect(p?.cacheWritePerMTok).toBe(3.75); // 1.25× input
  });
});

describe("costOfUsage", () => {
  it("multiplies provider actuals by the price sheet (exact, not estimated)", () => {
    const c = costOfUsage(
      usage({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 1_000_000 }),
      SONNET!,
    );
    expect(c.inputUsd).toBeCloseTo(0.003); // 1000 @ $3/MTok
    expect(c.outputUsd).toBeCloseTo(0.0075); // 500 @ $15/MTok
    expect(c.cacheReadUsd).toBeCloseTo(0.3); // 1M @ $0.30/MTok
    expect(c.totalUsd).toBeCloseTo(0.3105);
  });
});

describe("analyzeSessionCost", () => {
  it("rolls up per-message cost and surfaces unpriced models honestly", () => {
    const session = sessionOf([
      assistant("a", "claude-sonnet-4-6", usage({ inputTokens: 1000, outputTokens: 1000 })),
      assistant("b", "claude-haiku-4-5", usage({ outputTokens: 1000 })),
      assistant("c", "some-unknown-model", usage({ outputTokens: 1000 })),
    ]);
    const r = analyzeSessionCost(session);

    expect(r.pricedMessages).toBe(2);
    expect(r.unpricedMessages).toBe(1);
    // sonnet: 1000@3 + 1000@15 = 0.003 + 0.015; haiku: 1000@5 = 0.005
    expect(r.totalUsd).toBeCloseTo(0.003 + 0.015 + 0.005);
    expect(r.records.find((x) => x.messageId === "c")?.costUsd).toBeNull();
  });

  it("reports cache savings from re-reads served at the cache rate", () => {
    const session = sessionOf([
      assistant("a", "claude-sonnet-4-6", usage({ cacheReadTokens: 1_000_000 })),
    ]);
    const r = analyzeSessionCost(session);
    // saved = 1M × ($3 − $0.30)/MTok = $2.70
    expect(r.cacheSavingsUsd).toBeCloseTo(2.7);
  });
});

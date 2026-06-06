import { describe, expect, it } from "vitest";
import {
  asIsoTimestamp,
  asMessageId,
  asSegmentId,
  asSessionId,
  type Message,
  type SegmentStatus,
  type Session,
} from "@glassbox/core";
import {
  compactCommand,
  HYGIENE_END,
  HYGIENE_START,
  plan,
  renderHygieneBlock,
  suggestedCompactFocus,
  upsertHygieneBlock,
} from "./cleaner.js";
import type { ReclaimableDetail, ReclaimableItem, ReclaimableReport } from "./reclaimable.js";

function item(
  status: SegmentStatus,
  detail: ReclaimableDetail,
  tokens: number,
  opts: { path?: string; label?: string } = {},
): ReclaimableItem {
  return {
    segmentId: asSegmentId(`${detail}:${opts.path ?? opts.label ?? tokens}`),
    label: opts.label ?? opts.path ?? detail,
    status,
    reason: `${detail} reason`,
    tokens,
    ...(opts.path ? { path: opts.path } : {}),
    detail,
  };
}

function report(items: ReclaimableItem[], over: Partial<ReclaimableReport> = {}): ReclaimableReport {
  const reclaimableTokens = items.reduce((s, i) => s + i.tokens, 0);
  const byStatus = { live: 0, gone: 0, stale: 0, spent: 0, duplicate: 0, unknown: 0 } as Record<SegmentStatus, number>;
  for (const i of items) byStatus[i.status] += i.tokens;
  const totalTokens = over.totalTokens ?? (reclaimableTokens * 2 || 1);
  return {
    totalTokens,
    reclaimableTokens,
    reclaimablePct: reclaimableTokens / totalTokens,
    byStatus,
    wastedUsdPerTurn: null,
    items,
    ...over,
  };
}

function msg(role: "user" | "assistant", id: string, text: string): Message {
  return {
    id: asMessageId(id),
    parentId: null,
    role,
    timestamp: asIsoTimestamp("2026-06-04T00:00:00Z"),
    blocks: text ? [{ kind: "text", text }] : [],
    isSidechain: false,
  };
}

function session(messages: Message[] = []): Session {
  return {
    id: asSessionId("s1"),
    tool: "claude-code",
    toolVersion: null,
    projectPath: "/repo",
    gitBranch: null,
    startedAt: asIsoTimestamp("2026-06-04T00:00:00Z"),
    endedAt: asIsoTimestamp("2026-06-04T00:00:09Z"),
    messages,
    turns: [],
    toolCalls: [],
    fileOps: [],
    memoryOps: [],
    compactions: [],
    warnings: [],
  };
}

describe("plan — CLAUDE.md actions", () => {
  it("turns a gone file into a stop_referencing action", () => {
    const r = report([item("gone", "gone", 100, { path: "/repo/old.ts" })]);
    const p = plan(r, session());
    expect(p.claudeMdBlocks).toHaveLength(1);
    const a = p.claudeMdBlocks[0];
    expect(a?.type).toBe("stop_referencing");
    expect(a?.path).toBe("/repo/old.ts");
    expect(a?.confidence).toBe("provable");
    expect(a?.reclaimableTokens).toBe(100);
    expect(a?.claudeMdSnippet).toContain("/repo/old.ts");
    expect(a?.claudeMdSnippet).toContain("do not read");
  });

  it("turns a drifted file into a re_read action", () => {
    const r = report([item("stale", "stale-drift", 80, { path: "/repo/changed.ts" })]);
    const p = plan(r, session());
    expect(p.claudeMdBlocks).toHaveLength(1);
    expect(p.claudeMdBlocks[0]?.type).toBe("re_read");
    expect(p.claudeMdBlocks[0]?.claudeMdSnippet).toContain("re-read");
  });

  it("does NOT action superseded / spent / duplicate items", () => {
    const r = report([
      item("stale", "stale-superseded", 50, { path: "/repo/app.ts" }),
      item("spent", "spent-tool", 500, { label: "Bash result" }),
      item("spent", "spent-mcp", 300, { label: "mcp__x result" }),
      item("duplicate", "duplicate", 90, { path: "/repo/dup.ts" }),
    ]);
    const p = plan(r, session());
    expect(p.claudeMdBlocks).toHaveLength(0);
  });

  it("dedupes multiple copies of the same path into one action, summing tokens", () => {
    const r = report([
      item("gone", "gone", 60, { path: "/repo/old.ts", label: "read old.ts" }),
      item("gone", "gone", 40, { path: "/repo/old.ts", label: "write old.ts" }),
    ]);
    const p = plan(r, session());
    expect(p.claudeMdBlocks).toHaveLength(1);
    expect(p.claudeMdBlocks[0]?.reclaimableTokens).toBe(100);
  });

  it("sorts actions by reclaimable tokens, descending", () => {
    const r = report([
      item("gone", "gone", 30, { path: "/repo/a.ts" }),
      item("gone", "gone", 300, { path: "/repo/b.ts" }),
      item("stale", "stale-drift", 120, { path: "/repo/c.ts" }),
    ]);
    const p = plan(r, session());
    expect(p.claudeMdBlocks.map((a) => a.path)).toEqual(["/repo/b.ts", "/repo/c.ts", "/repo/a.ts"]);
  });
});

describe("plan — compact recommendation", () => {
  it("omits the compact hint below the threshold", () => {
    // 100 reclaimable of 1000 total = 10% < 25% default.
    const r = report([item("spent", "spent-tool", 100)], { totalTokens: 1000 });
    const p = plan(r, session());
    expect(p.compactRecommendation).toBeUndefined();
  });

  it("emits a compact hint above the threshold with spent/duplicate breakdown", () => {
    // 400 reclaimable of 1000 total = 40% > 25%.
    const r = report(
      [item("spent", "spent-tool", 300), item("duplicate", "duplicate", 100)],
      { totalTokens: 1000, wastedUsdPerTurn: 0.02 },
    );
    const p = plan(r, session([msg("user", "u1", "Add a greet helper to app.ts")]));
    expect(p.compactRecommendation).toBeDefined();
    expect(p.compactRecommendation?.spentTokens).toBe(300);
    expect(p.compactRecommendation?.duplicateTokens).toBe(100);
    expect(p.compactRecommendation?.suggestedSummaryFocus).toContain("greet helper");
    // all reclaimable is spent+duplicate → full per-turn waste is recoverable.
    expect(p.compactRecommendation?.estimatedUsdSaved).toBeCloseTo(0.02);
  });

  it("respects a custom threshold", () => {
    const r = report([item("spent", "spent-tool", 100)], { totalTokens: 1000 });
    const p = plan(r, session(), { compactThreshold: 0.05 });
    expect(p.compactRecommendation).toBeDefined();
  });

  it("falls back to a generic focus when there is no message text", () => {
    const r = report([item("spent", "spent-tool", 500)], { totalTokens: 1000 });
    const p = plan(r, session());
    expect(p.compactRecommendation?.suggestedSummaryFocus).toMatch(/preserve/i);
  });
});

describe("plan — summary", () => {
  it("reports action count and reclaimable totals", () => {
    const r = report(
      [
        item("gone", "gone", 100, { path: "/repo/a.ts" }),
        item("stale", "stale-drift", 50, { path: "/repo/b.ts" }),
        item("spent", "spent-tool", 200),
      ],
      { totalTokens: 1000, wastedUsdPerTurn: 0.01 },
    );
    const p = plan(r, session());
    expect(p.summary.actionCount).toBe(2);
    expect(p.summary.reclaimableTokens).toBe(350);
    expect(p.summary.estimatedUsdSaved).toBe(0.01);
  });
});

describe("upsertHygieneBlock — CLAUDE.md injection (Phase C)", () => {
  const NOW = new Date("2026-06-06T12:00:00Z");
  const goneAndDrift = () =>
    plan(
      report([
        item("gone", "gone", 100, { path: "/repo/old.ts" }),
        item("stale", "stale-drift", 80, { path: "/repo/changed.ts" }),
      ]),
      session(),
    );

  it("renders a block with both deleted and changed sections", () => {
    const block = renderHygieneBlock(goneAndDrift(), NOW);
    expect(block.startsWith(HYGIENE_START)).toBe(true);
    expect(block.endsWith(HYGIENE_END)).toBe(true);
    expect(block).toContain("do not read or reference");
    expect(block).toContain("/repo/old.ts");
    expect(block).toContain("re-read");
    expect(block).toContain("/repo/changed.ts");
    expect(block).toContain("2026-06-06T12:00:00Z");
  });

  it("appends the block to existing user content, preserving it", () => {
    const existing = "# My project\n\nUse pnpm. Prefer small functions.\n";
    const out = upsertHygieneBlock(existing, goneAndDrift(), NOW);
    expect(out).toContain("# My project");
    expect(out).toContain("Use pnpm.");
    expect(out).toContain(HYGIENE_START);
  });

  it("is idempotent — applying twice yields byte-identical output", () => {
    const existing = "# My project\n\nGuidelines here.\n";
    const once = upsertHygieneBlock(existing, goneAndDrift(), NOW);
    const twice = upsertHygieneBlock(once, goneAndDrift(), NOW);
    expect(twice).toBe(once);
  });

  it("replaces an out-of-date block rather than stacking a second one", () => {
    const existing = "# My project\n";
    const first = upsertHygieneBlock(existing, goneAndDrift(), NOW);
    // a later plan with a different set of files
    const laterPlan = plan(report([item("gone", "gone", 50, { path: "/repo/other.ts" })]), session());
    const second = upsertHygieneBlock(first, laterPlan, NOW);
    expect(second.match(new RegExp(HYGIENE_START, "g"))).toHaveLength(1);
    expect(second).toContain("/repo/other.ts");
    expect(second).not.toContain("/repo/old.ts");
  });

  it("strips the managed block entirely when the window is clean", () => {
    const existing = "# My project\n";
    const withBlock = upsertHygieneBlock(existing, goneAndDrift(), NOW);
    const cleanPlan = plan(report([item("spent", "spent-tool", 10)], { totalTokens: 1000 }), session());
    const cleaned = upsertHygieneBlock(withBlock, cleanPlan, NOW);
    expect(cleaned).not.toContain(HYGIENE_START);
    expect(cleaned).toContain("# My project");
  });
});

describe("compact command (Phase D)", () => {
  it("builds a /compact slash command from the focus", () => {
    const focus = suggestedCompactFocus(session([msg("user", "u1", "Fix the parser bug")]));
    const cmd = compactCommand(focus);
    expect(cmd.startsWith("/compact ")).toBe(true);
    expect(cmd).toContain("Fix the parser bug");
  });

  it("focus matches the one carried in the plan's compact recommendation", () => {
    const r = report([item("spent", "spent-tool", 400)], { totalTokens: 1000 });
    const s = session([msg("user", "u1", "Ship the release")]);
    const p = plan(r, s);
    expect(p.compactRecommendation?.suggestedSummaryFocus).toBe(suggestedCompactFocus(s));
  });
});

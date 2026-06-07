import { describe, expect, it } from "vitest";
import {
  asIsoTimestamp,
  asMessageId,
  asSegmentId,
  asToolCallId,
  type ContextSnapshot,
  type Segment,
  type SegmentStatus,
} from "@glassbox/core";
import { planEviction, PROVABLE_CLASSES } from "./cleaner.js";
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

/** A snapshot whose segment ids/paths line up with `item(...)`, so the eviction
 * planner can join report items back to their transcript location. */
function snapshotFor(items: ReclaimableItem[]): ContextSnapshot {
  const segments: Segment[] = items.map((it, i) => ({
    id: it.segmentId,
    source: "tool_result",
    label: it.label,
    sizeTokens: it.tokens,
    originMessageId: asMessageId(`m${i}`),
    originToolCallId: asToolCallId(`tc${i}`),
    ...(it.path ? { path: it.path } : {}),
    status: it.status,
  }));
  return {
    atMessageId: asMessageId("latest"),
    timestamp: asIsoTimestamp("2026-06-04T00:00:00Z"),
    segments,
    totalTokens: segments.reduce((s, x) => s + x.sizeTokens, 0) || 1,
  };
}

describe("planEviction — provable, lossless cleanup", () => {
  it("plans an eviction for each provable copy and reclaims net of tombstone cost", () => {
    const items = [
      item("stale", "stale-superseded", 2000, { path: "/repo/a.ts" }),
      item("gone", "gone", 1000, { path: "/repo/b.ts" }),
    ];
    const e = planEviction(report(items), snapshotFor(items));
    expect(e.actions).toHaveLength(2);
    expect(e.reclaimableTokens).toBe(3000);
    expect(e.tombstoneTokens).toBeGreaterThan(0);
    expect(e.netReclaimedTokens).toBe(3000 - e.tombstoneTokens);
    // biggest copy first, carrying the transcript location for the fork-writer.
    expect(e.actions[0]?.reclaimableTokens).toBe(2000);
    expect(e.actions[0]?.originToolCallId).toBeDefined();
    expect(e.actions[0]?.tombstone).toContain("/repo/a.ts");
  });

  it("evicts every provable class (gone/drift/superseded/duplicate) but NOT spent", () => {
    const items = [
      item("gone", "gone", 500, { path: "/repo/dead.ts" }),
      item("stale", "stale-drift", 400, { path: "/repo/changed.ts" }),
      item("stale", "stale-superseded", 300, { path: "/repo/old.ts" }),
      item("duplicate", "duplicate", 200, { path: "/repo/dup.ts" }),
      item("spent", "spent-tool", 999), // heuristic — excluded by default
      item("spent", "spent-mcp", 888), // heuristic — excluded by default
    ];
    const e = planEviction(report(items), snapshotFor(items));
    const evicted = new Set(e.actions.map((a) => a.detail));
    expect(evicted).toEqual(new Set(PROVABLE_CLASSES));
    expect(e.actions.some((a) => a.detail === "spent-tool")).toBe(false);
    expect(e.actions.some((a) => a.detail === "spent-mcp")).toBe(false);
    expect(e.reclaimableTokens).toBe(1400); // 500+400+300+200, no spent
  });

  it("can opt into the spent heuristic for ~9% more coverage", () => {
    const items = [
      item("gone", "gone", 500, { path: "/repo/dead.ts" }),
      item("spent", "spent-tool", 200),
    ];
    const e = planEviction(report(items), snapshotFor(items), {
      classes: [...PROVABLE_CLASSES, "spent-tool"],
    });
    expect(e.actions).toHaveLength(2);
    expect(e.reclaimableTokens).toBe(700);
  });

  it("skips items whose segment is absent from the snapshot (no location to evict)", () => {
    const items = [item("gone", "gone", 500, { path: "/repo/x.ts" })];
    const e = planEviction(report(items), snapshotFor([])); // empty snapshot
    expect(e.actions).toHaveLength(0);
    expect(e.netReclaimedTokens).toBe(0);
  });
});

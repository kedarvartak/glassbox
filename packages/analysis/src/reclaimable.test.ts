import { describe, expect, it } from "vitest";
import {
  asIsoTimestamp,
  asMessageId,
  asSegmentId,
  type ContextSnapshot,
  type RepoState,
  type Segment,
} from "@glassbox/core";
import { analyzeReclaimable } from "./reclaimable.js";

function seg(partial: Partial<Segment> & Pick<Segment, "id" | "sizeTokens">): Segment {
  return {
    source: "file",
    label: "seg",
    originMessageId: asMessageId("m1"),
    status: "unknown",
    ...partial,
  };
}

const repo: RepoState = {
  exists: async (p) => p === "/repo/keep.ts",
  read: async () => null,
  modifiedAt: async () => null,
};

describe("analyzeReclaimable", () => {
  it("flags content of deleted files as 'gone' and totals reclaimable %", async () => {
    const snapshot: ContextSnapshot = {
      atMessageId: asMessageId("m1"),
      timestamp: asIsoTimestamp("2026-06-04T00:00:00Z"),
      totalTokens: 1000,
      segments: [
        seg({ id: asSegmentId("a"), sizeTokens: 300, path: "/repo/keep.ts" }),
        seg({ id: asSegmentId("b"), sizeTokens: 200, path: "/repo/deleted.ts" }),
      ],
    };

    const report = await analyzeReclaimable(snapshot, {
      repo,
      pricing: {
        model: "test",
        inputPerMTok: 3,
        outputPerMTok: 15,
        cacheReadPerMTok: 0.3,
        cacheWritePerMTok: 3.75,
      },
    });

    expect(report.reclaimableTokens).toBe(200);
    expect(report.byStatus.gone).toBe(200);
    expect(report.reclaimablePct).toBeCloseTo(0.2);
    expect(report.items).toHaveLength(1);
    expect(report.items[0]?.status).toBe("gone");
    // 200 tok @ $0.30/MTok cache-read.
    expect(report.wastedUsdPerTurn).toBeCloseTo(0.00006);
  });
});

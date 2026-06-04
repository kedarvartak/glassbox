import { describe, expect, it } from "vitest";
import {
  isReclaimableStatus,
  RECLAIMABLE_STATUSES,
  type SegmentStatus,
} from "./context-snapshot.js";

describe("reclaimable status taxonomy (doc 20 unifying rule)", () => {
  it("counts gone/stale/spent/duplicate as reclaimable", () => {
    for (const s of RECLAIMABLE_STATUSES) {
      expect(isReclaimableStatus(s)).toBe(true);
    }
  });

  it("does not count live/unknown as reclaimable", () => {
    const notReclaimable: SegmentStatus[] = ["live", "unknown"];
    for (const s of notReclaimable) {
      expect(isReclaimableStatus(s)).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  asIsoTimestamp,
  asMessageId,
  asSessionId,
  asToolCallId,
  type FileOp,
  type Message,
  type RepoState,
  type Session,
  type TokenCounter,
  type ToolCall,
} from "@glassbox/core";
import { analyzeSessionReclaimable } from "./reclaimable.js";

const tokens: TokenCounter = { count: (t) => Math.ceil(t.length / 4) };
const repoAllExist: RepoState = {
  exists: async () => true,
  read: async () => null,
  // Return epoch (0) — file exists, not drifted (well before any test timestamp).
  modifiedAt: async () => 0,
};

function read(
  path: string,
  tokensCount: number,
  tc: string,
  msg: string,
  order: number,
  hash?: string,
): FileOp {
  return {
    kind: "read",
    path,
    contentTokens: tokensCount,
    ...(hash ? { contentHash: hash } : {}),
    toolCallId: asToolCallId(tc),
    messageId: asMessageId(msg),
    timestamp: asIsoTimestamp(`2026-06-04T00:00:0${order}Z`),
  };
}

function assistant(id: string, timestamp?: string): Message {
  return {
    id: asMessageId(id),
    parentId: null,
    role: "assistant",
    timestamp: asIsoTimestamp(timestamp ?? "2026-06-04T00:00:00Z"),
    blocks: [],
    isSidechain: false,
  };
}

function sessionOf(fileOps: FileOp[]): Session {
  return {
    id: asSessionId("s1"),
    tool: "claude-code",
    toolVersion: null,
    projectPath: "/repo",
    gitBranch: null,
    startedAt: asIsoTimestamp("2026-06-04T00:00:00Z"),
    endedAt: asIsoTimestamp("2026-06-04T00:00:09Z"),
    messages: [assistant("a1"), assistant("a2"), assistant("a3")],
    turns: [],
    toolCalls: [],
    fileOps,
    memoryOps: [],
    compactions: [],
    warnings: [],
  };
}

describe("analyzeSessionReclaimable — stale (superseded file versions)", () => {
  it("flags every copy of a file but the latest as stale", async () => {
    // app.ts read 3× across the session; foo.ts read once.
    const session = sessionOf([
      read("/repo/app.ts", 100, "t1", "a1", 1),
      read("/repo/foo.ts", 50, "t2", "a2", 2),
      read("/repo/app.ts", 110, "t3", "a2", 3),
      read("/repo/app.ts", 120, "t4", "a3", 4),
    ]);

    const { report } = await analyzeSessionReclaimable(session, { repo: repoAllExist, tokens });

    // The two earlier app.ts copies (100 + 110) are stale; the latest (120) and
    // the single foo.ts read are live.
    expect(report.byStatus.stale).toBe(210);
    expect(report.byStatus.gone).toBe(0);
    expect(report.reclaimableTokens).toBe(210);
    expect(report.items.map((i) => i.tokens).sort((a, b) => a - b)).toEqual([100, 110]);
    expect(report.items[0]?.reason).toContain("/repo/app.ts");
  });

  it("combines stale (superseded) with gone (deleted) in one report", async () => {
    const session = sessionOf([
      read("/repo/app.ts", 100, "t1", "a1", 1),
      read("/repo/app.ts", 120, "t2", "a2", 2), // supersedes the first → stale
      read("/repo/deleted.ts", 80, "t3", "a3", 3), // file gone on disk
    ]);
    const repo: RepoState = {
      exists: async (p) => p !== "/repo/deleted.ts",
      read: async () => null,
      // null = gone for deleted.ts; epoch = exists+no-drift for others.
      modifiedAt: async (p) => (p === "/repo/deleted.ts" ? null : 0),
    };

    const { report } = await analyzeSessionReclaimable(session, { repo, tokens });
    expect(report.byStatus.stale).toBe(100);
    expect(report.byStatus.gone).toBe(80);
    expect(report.reclaimableTokens).toBe(180);
  });

  it("flags byte-identical copies as duplicate (not stale)", async () => {
    // Same path read twice with identical content hash → the earlier copy is a
    // duplicate; the later survives. (Different hash would be stale instead.)
    const session = sessionOf([
      read("/repo/app.ts", 100, "t1", "a1", 1, "HASH_SAME"),
      read("/repo/app.ts", 100, "t2", "a2", 2, "HASH_SAME"),
    ]);
    const { report } = await analyzeSessionReclaimable(session, { repo: repoAllExist, tokens });

    expect(report.byStatus.duplicate).toBe(100);
    expect(report.byStatus.stale).toBe(0);
    expect(report.items[0]?.status).toBe("duplicate");
  });
});

describe("analyzeSessionReclaimable — stale (disk-drift)", () => {
  it("flags a file segment as stale when disk mtime is >3 s after capture", async () => {
    // The segment was captured at T+1 s; the file was modified at T+10 s on disk.
    const captureTime = "2026-06-04T00:00:01Z";
    const driftTime = new Date("2026-06-04T00:00:10Z").getTime(); // 9 s later

    const session: Session = {
      ...sessionOf([read("/repo/app.ts", 100, "t1", "a1", 1)]),
      messages: [assistant("a1", captureTime)],
    };
    const repo: RepoState = {
      exists: async () => true,
      read: async () => null,
      modifiedAt: async (p) => (p === "/repo/app.ts" ? driftTime : null),
    };

    const { report } = await analyzeSessionReclaimable(session, { repo, tokens });
    expect(report.byStatus.stale).toBe(100);
    expect(report.items[0]?.reason).toContain("modified on disk");
  });

  it("does not flag a file modified within the 3 s grace window", async () => {
    const captureTime = "2026-06-04T00:00:01Z";
    // Only 2 s after capture — within the 3-second grace period.
    const withinGrace = new Date("2026-06-04T00:00:03Z").getTime();

    const session: Session = {
      ...sessionOf([read("/repo/app.ts", 100, "t1", "a1", 1)]),
      messages: [assistant("a1", captureTime)],
    };
    const repo: RepoState = {
      exists: async () => true,
      read: async () => null,
      modifiedAt: async () => withinGrace,
    };

    const { report } = await analyzeSessionReclaimable(session, { repo, tokens });
    expect(report.byStatus.stale).toBe(0);
    expect(report.reclaimableTokens).toBe(0);
  });
});

describe("analyzeSessionReclaimable — spent (one-shot tool output)", () => {
  it("flags one-shot tool output from a turn the agent has moved past", async () => {
    const bash: ToolCall = {
      id: asToolCallId("b1"),
      name: "Bash",
      requestedInMessageId: asMessageId("a1"),
      resolvedInMessageId: asMessageId("u1b"),
      input: {},
      resultText: "huge ls output",
      isError: false,
      resultTokens: 500,
      contentHash: "BASHHASH",
      requestedAt: asIsoTimestamp("2026-06-04T00:00:01Z"),
      resolvedAt: asIsoTimestamp("2026-06-04T00:00:02Z"),
    };
    const session: Session = {
      ...sessionOf([]),
      messages: [assistant("a1"), assistant("u1b"), assistant("a2")],
      toolCalls: [bash],
      // Turn 1 contains the bash output; turn 2 is the latest (agent moved on).
      turns: [
        { index: 0, userMessageId: asMessageId("a1"), messageIds: [asMessageId("a1"), asMessageId("u1b")] },
        { index: 1, userMessageId: asMessageId("a2"), messageIds: [asMessageId("a2")] },
      ],
    };

    const { report } = await analyzeSessionReclaimable(session, { repo: repoAllExist, tokens });
    expect(report.byStatus.spent).toBe(500);
    expect(report.items[0]?.status).toBe("spent");
    expect(report.items[0]?.reason).toContain("Bash");
  });

  it("does not flag one-shot output that is still in the latest turn", async () => {
    const bash: ToolCall = {
      id: asToolCallId("b1"),
      name: "Bash",
      requestedInMessageId: asMessageId("a1"),
      resolvedInMessageId: asMessageId("a1"),
      input: {},
      resultText: "ls output",
      isError: false,
      resultTokens: 500,
      contentHash: "BASHHASH",
      requestedAt: asIsoTimestamp("2026-06-04T00:00:01Z"),
      resolvedAt: asIsoTimestamp("2026-06-04T00:00:02Z"),
    };
    const session: Session = {
      ...sessionOf([]),
      messages: [assistant("a1")],
      toolCalls: [bash],
      turns: [{ index: 0, userMessageId: asMessageId("a1"), messageIds: [asMessageId("a1")] }],
    };
    const { report } = await analyzeSessionReclaimable(session, { repo: repoAllExist, tokens });
    expect(report.byStatus.spent).toBe(0); // still the current turn — not dead weight yet
  });
});

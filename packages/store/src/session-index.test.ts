import { describe, expect, it } from "vitest";
import {
  asIsoTimestamp,
  asMessageId,
  asSessionId,
  type Message,
  type Session,
} from "@glassbox/core";
import { SessionIndex } from "./session-index.js";

function message(id: string): Message {
  return {
    id: asMessageId(id),
    parentId: null,
    role: "user",
    timestamp: asIsoTimestamp("2026-06-04T00:00:00Z"),
    blocks: [{ kind: "text", text: "hi" }],
    isSidechain: false,
  };
}

function sessionWith(id: string, projectPath: string, messages = 2): Session {
  return {
    id: asSessionId(id),
    tool: "claude-code",
    toolVersion: "1.2.3",
    projectPath,
    gitBranch: "main",
    startedAt: asIsoTimestamp("2026-06-04T10:00:00Z"),
    endedAt: asIsoTimestamp("2026-06-04T10:05:00Z"),
    messages: Array.from({ length: messages }, (_, i) => message(`m${i}`)),
    turns: [{ index: 0, userMessageId: asMessageId("m0"), messageIds: [asMessageId("m0")] }],
    toolCalls: [],
    fileOps: [],
    memoryOps: [],
    compactions: [],
    warnings: [],
  };
}

describe("SessionIndex", () => {
  it("round-trips a session and exposes queryable metadata", () => {
    const index = SessionIndex.open(":memory:");
    const session = sessionWith("s1", "/home/dev/acme", 3);
    index.upsert({ locator: "/a.jsonl", session, source: { modifiedAt: "t1", sizeBytes: 100 } });

    const got = index.get("/a.jsonl");
    expect(got?.session).toEqual(session); // full model preserved through the blob
    expect(got?.messageCount).toBe(3);
    expect(got?.projectPath).toBe("/home/dev/acme");

    const [meta] = index.list();
    expect(meta?.sessionId).toBe("s1");
    expect(meta?.turnCount).toBe(1);
    expect(index.fingerprint("/a.jsonl")).toEqual({ modifiedAt: "t1", sizeBytes: 100 });
    expect(index.stats().sessions).toBe(1);
    index.close();
  });

  it("upsert replaces in place (keyed by locator)", () => {
    const index = SessionIndex.open(":memory:");
    index.upsert({
      locator: "/a.jsonl",
      session: sessionWith("s1", "/p", 2),
      source: { modifiedAt: "t1", sizeBytes: 10 },
    });
    index.upsert({
      locator: "/a.jsonl",
      session: sessionWith("s1", "/p", 5),
      source: { modifiedAt: "t2", sizeBytes: 20 },
    });
    expect(index.stats().sessions).toBe(1);
    expect(index.get("/a.jsonl")?.messageCount).toBe(5);
    expect(index.fingerprint("/a.jsonl")?.modifiedAt).toBe("t2");
    index.close();
  });

  it("filters list by project and removes on demand", () => {
    const index = SessionIndex.open(":memory:");
    index.upsert({ locator: "/a", session: sessionWith("a", "/proj/x"), source: blank() });
    index.upsert({ locator: "/b", session: sessionWith("b", "/proj/y"), source: blank() });

    expect(index.list({ projectPath: "/proj/x" }).map((m) => m.sessionId)).toEqual(["a"]);
    expect(index.remove("/a")).toBe(true);
    expect(index.get("/a")).toBeNull();
    expect(index.remove("/a")).toBe(false); // already gone
    expect(index.stats().sessions).toBe(1);
    index.close();
  });
});

function blank() {
  return { modifiedAt: null, sizeBytes: null };
}

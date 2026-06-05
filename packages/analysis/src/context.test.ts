import { describe, expect, it } from "vitest";
import {
  asIsoTimestamp,
  asMessageId,
  asSessionId,
  asToolCallId,
  type ContentBlock,
  type FileOp,
  type Message,
  type RepoState,
  type Session,
  type ToolCall,
  type TokenCounter,
} from "@glassbox/core";
import { composition, reconstructContext } from "./context.js";
import { analyzeReclaimable } from "./reclaimable.js";

const tokens: TokenCounter = { count: (t) => Math.ceil(t.length / 4) };

let ts = 0;
function message(role: Message["role"], blocks: ContentBlock[], id?: string): Message {
  return {
    id: asMessageId(id ?? `m${ts}`),
    parentId: null,
    role,
    timestamp: asIsoTimestamp(`2026-06-04T00:00:0${ts++}Z`),
    blocks,
    isSidechain: false,
  };
}

function sessionOf(
  messages: Message[],
  fileOps: FileOp[] = [],
  toolCalls: ToolCall[] = [],
  memoryOps: Session["memoryOps"] = [],
): Session {
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
    toolCalls,
    fileOps,
    memoryOps,
    compactions: [],
    warnings: [],
  };
}

describe("reconstructContext", () => {
  it("breaks the window into segments by source, reusing stored token counts", () => {
    ts = 0;
    const messages = [
      message("user", [{ kind: "text", text: "please add a helper" }], "u1"),
      message("assistant", [
        { kind: "thinking", text: "I will read the file first" },
        { kind: "tool_use", toolCallId: asToolCallId("tc-read"), name: "Read", input: {} },
      ], "a1"),
      message("user", [
        { kind: "tool_result", toolCallId: asToolCallId("tc-read"), isError: false, text: "file body" },
      ], "u2"),
      message("assistant", [{ kind: "text", text: "done, looks good now" }], "a2"),
    ];
    const fileOps: FileOp[] = [
      {
        kind: "read",
        path: "/repo/src/app.ts",
        contentTokens: 120,
        toolCallId: asToolCallId("tc-read"),
        messageId: asMessageId("a1"),
        timestamp: asIsoTimestamp("2026-06-04T00:00:01Z"),
      },
      {
        kind: "write",
        path: "/repo/CLAUDE.md",
        contentTokens: 40,
        toolCallId: asToolCallId("tc-mem"),
        messageId: asMessageId("a2"),
        timestamp: asIsoTimestamp("2026-06-04T00:00:03Z"),
      },
    ];
    const toolCalls: ToolCall[] = [
      {
        id: asToolCallId("tc-bash"),
        name: "Bash",
        requestedInMessageId: asMessageId("a1"),
        resolvedInMessageId: asMessageId("u2"),
        input: {},
        resultText: "big ls output",
        isError: false,
        resultTokens: 300,
        requestedAt: asIsoTimestamp("2026-06-04T00:00:01Z"),
        resolvedAt: asIsoTimestamp("2026-06-04T00:00:02Z"),
      },
      // A file tool call: its output is the file content, counted via FileOp —
      // must NOT also become a tool_result segment.
      {
        id: asToolCallId("tc-read"),
        name: "Read",
        requestedInMessageId: asMessageId("a1"),
        resolvedInMessageId: asMessageId("u2"),
        input: {},
        resultText: "file body",
        isError: false,
        resultTokens: 120,
        requestedAt: asIsoTimestamp("2026-06-04T00:00:01Z"),
        resolvedAt: asIsoTimestamp("2026-06-04T00:00:02Z"),
      },
    ];
    const memoryOps: Session["memoryOps"] = [
      {
        kind: "write",
        target: "/repo/CLAUDE.md",
        tokens: 40,
        confidence: "inferred",
        messageId: asMessageId("a2"),
        timestamp: asIsoTimestamp("2026-06-04T00:00:03Z"),
      },
    ];

    const snap = reconstructContext(sessionOf(messages, fileOps, toolCalls, memoryOps), { tokens });
    const bySource = Object.fromEntries(composition(snap).map((c) => [c.source, c.tokens]));

    // history text + thinking sized by the counter
    expect(bySource["user"]).toBe(tokens.count("please add a helper"));
    expect(bySource["assistant"]).toBe(tokens.count("done, looks good now"));
    expect(bySource["thinking"]).toBe(tokens.count("I will read the file first"));
    // file content reuses stored contentTokens; memory file gets its own source
    expect(bySource["file"]).toBe(120);
    expect(bySource["memory"]).toBe(40);
    // only the non-file tool output becomes a tool_result segment (no double count)
    expect(bySource["tool_result"]).toBe(300);

    expect(snap.totalTokens).toBe(snap.segments.reduce((s, x) => s + x.sizeTokens, 0));
    expect(snap.atMessageId).toBe("a2");
    expect(snap.segments.every((s) => s.status === "unknown")).toBe(true); // facts only
  });

  it("scopes the window to atMessageId (no future segments leak in)", () => {
    ts = 0;
    const messages = [
      message("user", [{ kind: "text", text: "first turn prompt" }], "u1"),
      message("assistant", [{ kind: "text", text: "second turn reply" }], "a1"),
    ];
    const snap = reconstructContext(sessionOf(messages), { tokens, atMessageId: asMessageId("u1") });
    expect(snap.atMessageId).toBe("u1");
    expect(composition(snap).map((c) => c.source)).toEqual(["user"]); // a1 excluded
  });

  it("feeds the reclaimable analyzer: content of a deleted file is flagged gone", async () => {
    ts = 0;
    const messages = [message("assistant", [{ kind: "text", text: "reading files" }], "a1")];
    const fileOps: FileOp[] = [
      {
        kind: "read",
        path: "/repo/keep.ts",
        contentTokens: 100,
        toolCallId: asToolCallId("t1"),
        messageId: asMessageId("a1"),
        timestamp: asIsoTimestamp("2026-06-04T00:00:01Z"),
      },
      {
        kind: "read",
        path: "/repo/deleted.ts",
        contentTokens: 200,
        toolCallId: asToolCallId("t2"),
        messageId: asMessageId("a1"),
        timestamp: asIsoTimestamp("2026-06-04T00:00:01Z"),
      },
    ];
    const snap = reconstructContext(sessionOf(messages, fileOps), { tokens });

    const repo: RepoState = {
      exists: async (p) => p === "/repo/keep.ts",
      read: async () => null,
      modifiedAt: async () => null,
    };
    const report = await analyzeReclaimable(snap, { repo });

    expect(report.reclaimableTokens).toBe(200);
    expect(report.byStatus.gone).toBe(200);
    expect(report.items[0]?.label).toContain("deleted.ts");
  });
});

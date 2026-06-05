import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SessionRef, TokenCounter } from "@glassbox/core";
import { parseClaudeSession } from "./parse.js";

/**
 * Golden-file test for the Claude Code parser (doc 17 §1.5). The fixture is an
 * anonymized synthetic transcript that mirrors the *real* on-disk schema
 * (sampled in raw.ts) and is built to exercise the cases that actually bite:
 *  - one assistant response split across 3 JSONL lines that repeat `usage`
 *    (M1) → must be counted once,
 *  - user events that are tool-results, not prompts → must not start turns,
 *  - tool_result content as both a string and an array of parts,
 *  - memory-file writes/reads → MemoryOps,
 *  - a deliberately malformed line → a warning, not a crash.
 *
 * Deterministic token counter (the spike's ~4 chars/token estimate) so the
 * golden numbers are stable and the math is checkable by hand.
 */
const tokens: TokenCounter = { count: (t) => Math.ceil(t.length / 4) };

const ref: SessionRef = {
  tool: "claude-code",
  locator: "/home/dev/acme/.claude/projects/x/sess-1.jsonl",
};

function loadFixture(): ReturnType<typeof parseClaudeSession> {
  const path = fileURLToPath(new URL("../test/fixtures/basic-session.jsonl", import.meta.url));
  return parseClaudeSession(readFileSync(path, "utf8"), ref, tokens);
}

describe("parseClaudeSession", () => {
  const session = loadFixture();

  it("extracts session metadata from the transcript, not the locator", () => {
    expect(session.id).toBe("sess-1");
    expect(session.tool).toBe("claude-code");
    expect(session.toolVersion).toBe("1.2.3");
    expect(session.projectPath).toBe("/home/dev/acme");
    expect(session.gitBranch).toBe("main");
    expect(session.startedAt).toBe("2026-06-04T10:00:01.000Z");
    expect(session.endedAt).toBe("2026-06-04T10:00:20.000Z");
  });

  it("keeps every tree event as a message and preserves uuid/parent lineage", () => {
    expect(session.messages).toHaveLength(15); // metadata + the malformed line excluded
    const byId = new Map(session.messages.map((m) => [m.id, m]));
    expect(byId.get("u1")?.parentId).toBeNull();
    expect(byId.get("as1")?.parentId).toBe("a1");
    expect(byId.get("as3")?.parentId).toBe("as2");
  });

  it("degrades gracefully on a malformed line", () => {
    expect(session.warnings).toHaveLength(1);
    expect(session.warnings[0]).toMatch(/line 18/);
  });

  it("dedupes usage across the multi-line assistant response (token math is sacred)", () => {
    const withUsage = session.messages.filter((m) => m.usage);
    // M1, M2, M3 — one per provider message.id, despite 7 assistant JSONL lines.
    expect(withUsage).toHaveLength(3);

    const as1 = session.messages.find((m) => m.id === "as1");
    expect(as1?.usage).toEqual({
      inputTokens: 5,
      outputTokens: 50,
      cacheReadTokens: 1000,
      cacheCreationTokens: 0,
    });
    // The repeat lines of the same response carry NO usage.
    expect(session.messages.find((m) => m.id === "as2")?.usage).toBeUndefined();
    expect(session.messages.find((m) => m.id === "as3")?.usage).toBeUndefined();
  });

  it("groups into turns on real prompts only (tool-result users don't count)", () => {
    expect(session.turns).toHaveLength(2);
    expect(session.turns[0]?.userMessageId).toBe("u1");
    expect(session.turns[1]?.userMessageId).toBe("u6");
    // Turn 1 spans the whole agent response up to the second prompt.
    expect(session.turns[0]?.messageIds).toContain("as4");
    expect(session.turns[0]?.messageIds).not.toContain("u6");
  });

  it("stitches tool_use to its later tool_result across messages", () => {
    expect(session.toolCalls).toHaveLength(4);
    for (const call of session.toolCalls) {
      expect(call.resolvedInMessageId).not.toBeNull();
      expect(call.resolvedAt).not.toBeNull();
    }
    const read1 = session.toolCalls.find((c) => c.id === "toolu_read1");
    expect(read1?.requestedInMessageId).toBe("as3");
    expect(read1?.resolvedInMessageId).toBe("u2");
    // tool_result content was an *array* of parts — flattened to text.
    expect(read1?.resultText).toContain("import {x}");
    expect(read1?.resultTokens).toBe(tokens.count(read1?.resultText ?? ""));
  });

  it("lifts file-touching tools into FileOps with content sizing", () => {
    expect(session.fileOps).toHaveLength(4);
    const write = session.fileOps.find((f) => f.path.endsWith("CLAUDE.md"));
    expect(write?.kind).toBe("write");
    expect(write?.contentTokens).toBe(
      tokens.count("# Project memory\nUse pnpm. Prefer small pure functions."),
    );
    expect(session.fileOps.filter((f) => f.kind === "read")).toHaveLength(2);
    expect(session.fileOps.filter((f) => f.kind === "edit")).toHaveLength(1);
  });

  it("infers MemoryOps from writes/reads of memory files", () => {
    expect(session.memoryOps).toHaveLength(2);
    const write = session.memoryOps.find((m) => m.target.endsWith("CLAUDE.md"));
    const recall = session.memoryOps.find((m) => m.target.endsWith("memory/notes.md"));
    expect(write?.kind).toBe("write");
    expect(recall?.kind).toBe("recall");
    // Claude Code has no structured memory log — every op is inferred (doc 19).
    expect(session.memoryOps.every((m) => m.confidence === "inferred")).toBe(true);
  });

  it("finds no compaction events (none are emitted by Claude Code yet)", () => {
    expect(session.compactions).toEqual([]);
  });

  it("matches the golden normalized model", () => {
    expect(session).toMatchSnapshot();
  });
});

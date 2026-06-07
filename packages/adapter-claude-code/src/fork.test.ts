import { describe, expect, it } from "vitest";
import { forkTranscript } from "./fork.js";

/** One JSONL line for an assistant tool_use (Read/Write/Edit live here). */
function toolUse(id: string, name: string, input: Record<string, unknown>): string {
  return JSON.stringify({
    type: "assistant",
    uuid: `u-${id}`,
    message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] },
  });
}

/** One JSONL line for a user tool_result (Read output lives here). */
function toolResult(id: string, content: unknown): string {
  return JSON.stringify({
    type: "user",
    uuid: `r-${id}`,
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] },
  });
}

const TOMB = "[glassbox: removed superseded copy]";

describe("forkTranscript (Layer 2 rewriter)", () => {
  it("stubs a Read's tool_result content, leaving the block and id intact", () => {
    const raw = [toolUse("t1", "Read", { file_path: "/a.ts" }), toolResult("t1", "OLD FILE BYTES")].join("\n");
    const { text, summary } = forkTranscript(raw, new Map([["t1", TOMB]]));

    expect(summary.evicted).toBe(1);
    expect(summary.notFound).toEqual([]);
    expect(text).toContain(TOMB);
    expect(text).not.toContain("OLD FILE BYTES");

    // structure preserved: the tool_result still pairs with tool_use t1.
    const result = JSON.parse(text.split("\n")[1]!);
    expect(result.message.content[0].type).toBe("tool_result");
    expect(result.message.content[0].tool_use_id).toBe("t1");
    expect(result.message.content[0].content).toBe(TOMB);
  });

  it("stubs a Write's input.content and an Edit's new_string", () => {
    const raw = [
      toolUse("w1", "Write", { file_path: "/a.ts", content: "WRITTEN BODY" }),
      toolUse("e1", "Edit", { file_path: "/b.ts", old_string: "x", new_string: "EDITED BODY" }),
    ].join("\n");
    const { text, summary } = forkTranscript(raw, new Map([["w1", TOMB], ["e1", TOMB]]));

    expect(summary.evicted).toBe(2);
    expect(text).not.toContain("WRITTEN BODY");
    expect(text).not.toContain("EDITED BODY");
    const write = JSON.parse(text.split("\n")[0]!);
    expect(write.message.content[0].input.content).toBe(TOMB);
    expect(write.message.content[0].input.file_path).toBe("/a.ts"); // other fields kept
  });

  it("leaves non-evicted lines byte-for-byte identical", () => {
    const keep = toolResult("keep", "IMPORTANT LIVE OUTPUT");
    const raw = [toolUse("t1", "Read", { file_path: "/a.ts" }), toolResult("t1", "OLD"), keep].join("\n");
    const { text } = forkTranscript(raw, new Map([["t1", TOMB]]));
    expect(text.split("\n")[2]).toBe(keep); // untouched line unchanged
  });

  it("reports ids it could not locate", () => {
    const raw = toolResult("t1", "bytes");
    const { summary } = forkTranscript(raw, new Map([["ghost", TOMB]]));
    expect(summary.evicted).toBe(0);
    expect(summary.notFound).toEqual(["ghost"]);
  });

  it("also stubs the toolUseResult mirror so a resume can't re-inflate", () => {
    const raw = JSON.stringify({
      type: "user",
      uuid: "r1",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "OLD FILE BYTES" }] },
      toolUseResult: { type: "text", file: { filePath: "/a.ts", content: "OLD FILE BYTES", numLines: 1 } },
    });
    const { text } = forkTranscript(raw, new Map([["t1", TOMB]]));
    const ev = JSON.parse(text);
    expect(ev.message.content[0].content).toBe(TOMB);
    expect(ev.toolUseResult.file.content).not.toContain("OLD FILE BYTES");
    expect(ev.toolUseResult.file.filePath).toBe("/a.ts"); // shape preserved
  });

  it("passes malformed and blank lines through untouched", () => {
    const raw = ["not json", "", toolResult("t1", "OLD")].join("\n");
    const { text } = forkTranscript(raw, new Map([["t1", TOMB]]));
    const out = text.split("\n");
    expect(out[0]).toBe("not json");
    expect(out[1]).toBe("");
    expect(out[2]).toContain(TOMB);
  });
});

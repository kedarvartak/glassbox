import { describe, expect, it } from "vitest";
import { newProblems, validateTranscript } from "./validate.js";

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

/** A minimal valid use→result pair across two lines. */
function pair(id: string): string {
  return [
    line({
      type: "assistant",
      uuid: `a-${id}`,
      parentUuid: null,
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id, name: "Read", input: { file_path: "/x" } }],
      },
    }),
    line({
      type: "user",
      uuid: `u-${id}`,
      parentUuid: `a-${id}`,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: id, content: "bytes" }],
      },
    }),
  ].join("\n");
}

describe("validateTranscript", () => {
  it("accepts a well-formed transcript", () => {
    const r = validateTranscript(pair("t1"));
    expect(r.ok).toBe(true);
    expect(r.toolUses).toBe(1);
    expect(r.toolResults).toBe(1);
  });

  it("flags an orphaned tool_use (result missing)", () => {
    const raw = line({
      type: "assistant",
      uuid: "a1",
      parentUuid: null,
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }],
      },
    });
    const r = validateTranscript(raw);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.code === "orphan-tool_use" && p.ref === "t1")).toBe(true);
  });

  it("flags a dangling parentUuid", () => {
    const raw = line({
      type: "assistant",
      uuid: "a1",
      parentUuid: "ghost",
      message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
    });
    const r = validateTranscript(raw);
    expect(r.problems.some((p) => p.code === "dangling-parent")).toBe(true);
  });

  it("flags empty content and bad JSON", () => {
    const raw = [
      "{ not json",
      line({
        type: "assistant",
        uuid: "a1",
        parentUuid: null,
        message: { role: "assistant", content: [] },
      }),
    ].join("\n");
    const r = validateTranscript(raw);
    expect(r.problems.some((p) => p.code === "bad-json")).toBe(true);
    expect(r.problems.some((p) => p.code === "empty-content")).toBe(true);
  });

  it("newProblems reports only what the fork introduced", () => {
    // original already has one orphan; fork adds an empty tool_result.
    const original = validateTranscript(
      line({
        type: "assistant",
        uuid: "a1",
        parentUuid: null,
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }],
        },
      }),
    );
    const forked = validateTranscript(
      [
        line({
          type: "assistant",
          uuid: "a1",
          parentUuid: null,
          message: {
            role: "assistant",
            content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }],
          },
        }),
        line({
          type: "user",
          uuid: "u2",
          parentUuid: "a1",
          message: {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: "t1", content: "" }],
          },
        }),
      ].join("\n"),
    );
    const introduced = newProblems(original, forked);
    // the pre-existing orphan is now resolved, but the empty tool_result is new.
    expect(introduced.some((p) => p.code === "empty-tool_result")).toBe(true);
    expect(introduced.some((p) => p.code === "orphan-tool_use")).toBe(false);
  });
});

/**
 * Structural validator for Claude Code transcripts — the safety gate for the
 * fork-writer (cleaner Layer 2). It enumerates the invariants a resume depends
 * on and the Anthropic API enforces, and reports every violation.
 *
 * The fork-writer uses it differentially: validate the original *and* the fork,
 * then block only on problems the fork *introduced*. Real transcripts legitimately
 * carry pre-existing oddities (a trailing tool_use with no result because the
 * session ended mid-call, sidechain threading, compaction gaps); those are the
 * original's problem, not the fork's. We only guarantee: **the fork breaks
 * nothing the original didn't already break.**
 *
 * Invariants checked:
 *  - JSON: every non-blank line parses.
 *  - uuid: tree events have a unique uuid.
 *  - parentUuid: every non-null parent references a uuid present in the file.
 *  - pairing: every `tool_use` has a matching `tool_result` and vice-versa
 *    (the API's hardest requirement).
 *  - non-empty: no message with empty `content`; no `tool_result` with empty
 *    content; every `tool_use` has an id.
 */

export interface ValidationProblem {
  /** Stable machine code, e.g. `orphan-tool_use`, so problem sets can be diffed. */
  readonly code: string;
  /** Stable key for the offending entity (uuid / tool id / line no). */
  readonly ref: string;
  /** Human-readable detail. */
  readonly detail: string;
}

export interface ValidationReport {
  readonly ok: boolean;
  readonly problems: readonly ValidationProblem[];
  readonly lines: number;
  readonly messages: number;
  readonly toolUses: number;
  readonly toolResults: number;
}

const TREE_TYPES = new Set(["user", "assistant", "system", "attachment"]);

export function validateTranscript(rawText: string): ValidationReport {
  const lines = rawText.split("\n");
  const problems: ValidationProblem[] = [];

  const uuids = new Set<string>();
  const parentRefs: { uuid: string; parent: string }[] = [];
  const toolUseIds = new Set<string>();
  const toolResultIds = new Set<string>();
  let messages = 0;
  let toolUses = 0;
  let toolResults = 0;

  lines.forEach((line, i) => {
    if (line.trim() === "") return;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(line);
    } catch {
      problems.push({ code: "bad-json", ref: `line:${i + 1}`, detail: `line ${i + 1} is not valid JSON` });
      return;
    }

    const type = ev["type"];
    const uuid = ev["uuid"];
    const isTree = typeof type === "string" && TREE_TYPES.has(type) && typeof uuid === "string";

    if (isTree) {
      const id = uuid as string;
      if (uuids.has(id)) problems.push({ code: "duplicate-uuid", ref: id, detail: `uuid ${id} appears more than once` });
      uuids.add(id);
      const parent = ev["parentUuid"];
      if (typeof parent === "string") parentRefs.push({ uuid: id, parent });
    }

    const msg = ev["message"] as { role?: string; content?: unknown } | undefined;
    if (!msg) return;
    const content = msg.content;

    // A bare-string content is a typed prompt — always fine.
    if (typeof content === "string") {
      messages++;
      return;
    }
    if (!Array.isArray(content)) return;
    messages++;

    if (content.length === 0) {
      problems.push({ code: "empty-content", ref: String(uuid ?? `line:${i + 1}`), detail: `message has empty content[]` });
    }

    for (const block of content as Record<string, unknown>[]) {
      if (block["type"] === "tool_use") {
        toolUses++;
        const id = block["id"];
        if (typeof id !== "string" || id === "") {
          problems.push({ code: "tool_use-no-id", ref: String(uuid ?? `line:${i + 1}`), detail: `tool_use block missing id` });
        } else {
          toolUseIds.add(id);
        }
      } else if (block["type"] === "tool_result") {
        toolResults++;
        const id = block["tool_use_id"];
        if (typeof id === "string") toolResultIds.add(id);
        const c = block["content"];
        const empty = c === undefined || c === null || c === "" || (Array.isArray(c) && c.length === 0);
        if (empty) {
          problems.push({ code: "empty-tool_result", ref: typeof id === "string" ? id : `line:${i + 1}`, detail: `tool_result has empty content` });
        }
      }
    }
  });

  // parentUuid must reference a uuid present in the file (no dangling links).
  for (const { uuid, parent } of parentRefs) {
    if (!uuids.has(parent)) {
      problems.push({ code: "dangling-parent", ref: uuid, detail: `parentUuid ${parent} of ${uuid} not found` });
    }
  }

  // tool_use ↔ tool_result pairing — the API's hardest requirement.
  for (const id of toolUseIds) {
    if (!toolResultIds.has(id)) problems.push({ code: "orphan-tool_use", ref: id, detail: `tool_use ${id} has no matching tool_result` });
  }
  for (const id of toolResultIds) {
    if (!toolUseIds.has(id)) problems.push({ code: "orphan-tool_result", ref: id, detail: `tool_result ${id} has no matching tool_use` });
  }

  return {
    ok: problems.length === 0,
    problems,
    lines: lines.filter((l) => l.trim() !== "").length,
    messages,
    toolUses,
    toolResults,
  };
}

/**
 * Problems present in `fork` but not in `original`, keyed by `code:ref`. These are
 * the only ones the fork is responsible for — the gate the fork-writer must pass.
 */
export function newProblems(original: ValidationReport, fork: ValidationReport): ValidationProblem[] {
  const before = new Set(original.problems.map((p) => `${p.code}:${p.ref}`));
  return fork.problems.filter((p) => !before.has(`${p.code}:${p.ref}`));
}

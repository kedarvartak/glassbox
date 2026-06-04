import type { Adapter, DiscoverOptions, Session, SessionRef, TokenCounter } from "@glassbox/core";
import { discoverClaudeSessions } from "./discover.js";

/**
 * Claude Code adapter.
 *
 * `discover` / `canParse` are implemented (cheap, no parsing). `parse` is the
 * Phase-1 workstream (doc 17 §1.1): JSONL → normalized model, including lifting
 * Write/Edit/Read into FileOps and stitching tool_use↔tool_result into
 * ToolCalls. It's stubbed here so the contract compiles and the skeleton is
 * wired end to end; implementing it is the next build step.
 */
export class ClaudeCodeAdapter implements Adapter {
  readonly tool = "claude-code";

  /** Injected so token math stays a single swappable seam (see ports.ts). */
  constructor(private readonly tokens: TokenCounter) {}

  discover(opts?: DiscoverOptions): Promise<SessionRef[]> {
    return discoverClaudeSessions(opts ?? {});
  }

  async canParse(ref: SessionRef): Promise<boolean> {
    return ref.tool === this.tool && ref.locator.endsWith(".jsonl");
  }

  async parse(_ref: SessionRef): Promise<Session> {
    // Phase 1: stream JSONL lines → normalized Message[] → derive turns,
    // toolCalls, fileOps, memoryOps using `this.tokens` for sizing.
    void this.tokens;
    throw new Error(
      "ClaudeCodeAdapter.parse is not implemented yet (Phase 1 / DoD-1). " +
        "Schema is captured in docs/19 + docs/20; the normalized target is @glassbox/core.",
    );
  }
}

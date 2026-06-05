import { readFile } from "node:fs/promises";
import type { Adapter, DiscoverOptions, Session, SessionRef, TokenCounter } from "@glassbox/core";
import { discoverClaudeSessions } from "./discover.js";
import { parseClaudeSession } from "./parse.js";

/**
 * Claude Code adapter — the vertical slice's data layer (doc 17 §1.1).
 *
 * Three small, independently testable steps (per the `Adapter` contract):
 * `discover` and `canParse` are cheap (no parsing); `parse` reads the JSONL off
 * disk and hands the bytes to the pure {@link parseClaudeSession} (the fs read is
 * the only impure part — kept here so the parser stays trivially golden-testable).
 * Claude-specific knowledge lives entirely in this package; nothing leaks out.
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

  async parse(ref: SessionRef): Promise<Session> {
    const content = await readFile(ref.locator, "utf8");
    return parseClaudeSession(content, ref, this.tokens);
  }
}

import type { Session } from "../model/session.js";
import type { SourceTool } from "../model/source.js";

/**
 * The Adapter contract — the single most important seam in the codebase
 * (doc 14 §6: "the moat is the adapter layer + normalized model"). Every tool
 * Glassbox supports implements this; nothing downstream knows which tool it's
 * looking at. Tool-specific parsing must never leak past this boundary
 * (doc 17 §6: "adapters are isolated and pure").
 *
 * The shape is deliberately three small steps so each is independently
 * testable: discover → (read) → parse.
 */
export interface Adapter {
  /** Stable identifier, e.g. "claude-code". */
  readonly tool: SourceTool;

  /**
   * Find candidate sessions on disk without parsing them (cheap). E.g. Claude
   * Code globs `~/.claude/projects/<encoded-cwd>/*.jsonl`.
   */
  discover(opts?: DiscoverOptions): Promise<SessionRef[]>;

  /**
   * Decide whether this adapter can handle a given path/handle — lets a future
   * registry route a file to the right adapter. Should be cheap (sniff, don't
   * fully parse).
   */
  canParse(ref: SessionRef): Promise<boolean>;

  /**
   * Parse one discovered session into the normalized model. Must degrade
   * gracefully: on unknown/changed shapes, push to `Session.warnings` and emit
   * a partial result rather than throwing (doc 17 §6).
   */
  parse(ref: SessionRef): Promise<Session>;
}

export interface DiscoverOptions {
  /** Override the tool's default storage root (testing, non-standard installs). */
  readonly root?: string;
  /** Restrict discovery to sessions for this project path. */
  readonly projectPath?: string;
}

/**
 * A lightweight handle to a session before it's parsed. Carries just enough to
 * sort/filter in a UI without paying the parse cost.
 */
export interface SessionRef {
  readonly tool: SourceTool;
  /** Opaque locator the adapter understands (usually an absolute file path). */
  readonly locator: string;
  readonly projectPath?: string;
  /** Last-modified time, for "most recent session" ordering. */
  readonly modifiedAt?: string;
  readonly sizeBytes?: number;
}

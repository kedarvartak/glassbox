/**
 * Ports — capabilities the core defines but does not implement, injected into
 * adapters and analyzers. Keeping these as interfaces is what lets @glassbox/core
 * stay zero-dependency while real implementations (tiktoken, fs, git) live in
 * the packages that own those concerns.
 */

/**
 * Counts tokens for a string. The spike (doc 20) used a ~4-chars/token estimate;
 * real accuracy needs a provider tokenizer. Modeling it as a port means we can
 * start with the estimate and swap in the real counter without touching adapters
 * — and "token math is sacred" (doc 17 §6) stays a single, testable seam.
 */
export interface TokenCounter {
  count(text: string): number;
}

/**
 * Read-only view of the project filesystem + git, used by the analysis layer to
 * decide if a segment is "gone" (file deleted) or "stale" (overwritten/changed
 * after a memory was derived). Read-only by contract: Glassbox never mutates a
 * user's project (doc 17 §6: "local-first & read-only").
 */
export interface RepoState {
  /** Does this path currently exist on disk? */
  exists(path: string): Promise<boolean>;
  /** Current file contents, or null if gone. */
  read(path: string): Promise<string | null>;
  /** Last-modified time (ms epoch), or null if gone — for source-drift checks. */
  modifiedAt(path: string): Promise<number | null>;
}

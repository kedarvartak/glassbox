/**
 * The seed-experiment contract.
 *
 * A spike seed is not just a conversation — it's a *labeled* experiment. You
 * plant known garbage (duplicates, contradictions, dead facts) via the
 * `conversation`, then declare the ground truth so the harness can measure how
 * much of that garbage survived mem0's write-time ADD/UPDATE/DELETE logic.
 *
 * The four garbage classes we test (from doc 20's taxonomy, adapted to a store):
 *  - duplicate / near-duplicate — same fact, stored more than once.
 *  - contradiction (stale)      — an old value that a newer value should replace.
 *  - dead                       — a fact never surfaced by any realistic query.
 *  - bloat                      — stored count vs. the true number of facts.
 */

/** One message in the seeded conversation, fed to mem0 in order. */
export interface SeedMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/**
 * A planted contradiction. After replay, the store *should* contain
 * `currentText`'s fact and *not* `staleText`'s. If any stored memory still
 * asserts the stale value, mem0's update logic failed to reconcile it.
 */
export interface ContradictionLabel {
  /** Human label for the report, e.g. "UI theme preference". */
  readonly topic: string;
  /** A phrase whose presence in the store means the OLD fact survived (garbage). */
  readonly staleText: string;
  /** The correct, latest value — for the report only. */
  readonly currentText: string;
}

/**
 * A realistic retrieval query. We run every probe through `search()`; any stored
 * memory never returned by any probe is "dead" relative to this query set.
 * `expect` is optional documentation of what the probe *should* surface.
 */
export interface ProbeQuery {
  readonly query: string;
  readonly expect?: string;
}

export interface Seed {
  /** mem0 namespace for this run; the harness resets it before replay. */
  readonly userId: string;
  /** The seeded conversation, replayed message-by-message into mem0. */
  readonly conversation: readonly SeedMessage[];
  /** Ground-truth count of distinct facts planted — denominator of bloat ratio. */
  readonly expectedUniqueFacts: number;
  /** Contradictions you planted; the harness checks whether the stale side survived. */
  readonly contradictions: readonly ContradictionLabel[];
  /** Queries a real app would issue; drives the dead-memory measurement. */
  readonly probes: readonly ProbeQuery[];
}

/** A memory as returned by mem0's getAll, normalized to what the metrics need. */
export interface StoredMemory {
  readonly id: string;
  readonly text: string;
}

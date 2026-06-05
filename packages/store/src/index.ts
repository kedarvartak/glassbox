/**
 * @glassbox/store — the local SQLite index over parsed sessions.
 *
 * Sits between the adapters (which parse) and the surfaces (cli/ui, which
 * query). Depends only on `@glassbox/core`: the {@link SessionIndexer} drives any
 * tool through the core `Adapter` port, so the store stays tool-agnostic. Uses
 * the built-in `node:sqlite` — no native build step.
 */
export {
  SessionIndex,
  type IndexedSession,
  type IndexedSessionMeta,
  type SourceFingerprint,
  type UpsertInput,
  type ListOptions,
} from "./session-index.js";
export {
  SessionIndexer,
  type SyncResult,
  type WatchEvent,
  type WatchOptions,
  type Watcher,
} from "./indexer.js";

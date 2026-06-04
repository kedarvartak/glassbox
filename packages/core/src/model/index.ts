/**
 * The normalized event/context model — Glassbox's spine.
 *
 * Design rules (see ADR 0002 / 0003):
 *  - Pure types + tiny pure helpers. Zero runtime dependencies.
 *  - JSON-serializable end to end (IDs are branded strings, times are ISO).
 *  - Lossless: unknown shapes get `unknown`/`UnknownBlock`, never dropped.
 *  - Facts only. "Is this stale?" verdicts belong to @glassbox/analysis.
 */
export * from "./ids.js";
export * from "./source.js";
export * from "./tokens.js";
export * from "./content.js";
export * from "./message.js";
export * from "./tool-call.js";
export * from "./file-op.js";
export * from "./memory.js";
export * from "./compaction.js";
export * from "./context-snapshot.js";
export * from "./session.js";

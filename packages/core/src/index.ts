/**
 * @glassbox/core — the normalized model + the contracts everything else targets.
 *
 * Dependency rule: this package depends on nothing, and everything depends on
 * it. If you find yourself importing an adapter, analyzer, or UI from here,
 * the dependency arrow is backwards.
 */
export * from "./model/index.js";
export * from "./adapter/index.js";

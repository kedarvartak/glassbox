/**
 * @glassbox/analysis — detectors over the normalized model.
 *
 * Rule of the house: analyzers read the model and the repo (via the RepoState
 * port) but never parse tool-specific files. If you need tool internals, the
 * adapter should have lifted them into the model first.
 */
export * from "./reclaimable.js";

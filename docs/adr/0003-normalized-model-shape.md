# ADR 0003 — Normalized model: facts in the model, verdicts in analysis

- **Status:** Accepted
- **Date:** 2026-06-04
- **Context:** doc 17 §0.2 (the model is the most important design artifact),
  doc 20 §3 (one detection rule), doc 19 (Claude/Codex memory asymmetry).

## Decision

The model records **observable facts** (messages, tool calls, file ops, token
usage, snapshots). It does **not** record judgments. The reclaimable
`SegmentStatus` vocabulary (`gone | stale | spent | duplicate | live | unknown`)
lives in the model as a shared contract, but **assigning** a status is the job of
`@glassbox/analysis`, which alone reads the filesystem/git (via `RepoState`).

Honesty about uncertainty is modeled explicitly: `MemoryOp.confidence` is
`observed` vs `inferred`, capturing the Claude (inferred from tool calls) vs
Codex (structured signals) asymmetry from doc 19.

## Why

- Separation keeps adapters pure and analyzers testable; the same model serves
  many detectors.
- Encoding doc 20's "gone/stale/spent" rule as one status enum keeps the product
  coherent: one detector, many garbage types.

## Consequences

- `Segment` carries `path` so analysis can cross-check the repo; it does not
  carry a "stale" boolean.
- Adding a hygiene check = a new analyzer over existing facts, usually no model
  change.

# ADR 0004 — Defer the ContextSnapshot storage decision to Phase 1

- **Status:** Open (decide during Phase 1)
- **Date:** 2026-06-04
- **Context:** doc 17 Phase 1 (ingestion engine + local SQLite index).

## Question

Do we **materialize** a `ContextSnapshot` per turn (store the resident-segment
set at every turn), or **reconstruct** it on demand from the message stream?

## Considerations

- Materializing is simpler to query and natural for a per-turn UI scrubber, but
  duplicates data and grows with session length.
- Reconstructing keeps storage lean and the message stream the single source of
  truth, at the cost of recompute on each view.
- The `ContextSnapshot` **type is identical either way** (see
  `context-snapshot.ts`), so this choice does not block the model draft — it's an
  engine/index decision made when we build the SQLite local index (Phase 1.4).

## Decision

Deferred. Default lean: reconstruct on demand, add a cache/index only if perf
on large sessions (doc 17 §4.4) demands it. Revisit with real session sizes.

## Update (Phase 1.4, 2026-06-05)

The local index (`@glassbox/store`) landed and confirms the lean path: it stores
the **whole `Session` as a JSON blob** plus queryable metadata columns — it does
**not** materialize per-turn `ContextSnapshot`s. Snapshots will be reconstructed
on demand from the stored model (workstream 1.3). Re-deriving the document-store
schema is cheap because it doesn't shred the model into tables, so this stays
revisable if a per-turn scrubber later needs materialized snapshots for perf.

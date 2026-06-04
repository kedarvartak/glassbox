# @glassbox/ui (placeholder)

The local web UI lands in **Phase 2 (DoD-2)** — see [`docs/17-phased-execution-plan.md`](../../docs/17-phased-execution-plan.md).

Per the build-first principle (data layer → analysis layer → UI), this package
is intentionally empty until there's a correct engine and trustworthy analyzers
to render. Building the UI before then would mean hardening a view over numbers
we don't yet trust.

Planned views (doc 07 jobs, post-spike hero from doc 19/20):

- **Reclaimable-tokens report** — the headline metric, the screenshot moment.
- **Context x-ray** — composition by `SegmentSource` (substrate; Claude's
  `/context` already does a live version, so this supports rather than leads).
- **Memory health** — stale / dead-reference / unused / conflicting memory.

When work starts here it will be React/TS (per OA3), reading the local index
the engine writes.

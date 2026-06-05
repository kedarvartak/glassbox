# @glassbox/ui

The local web UI for **Phase 2 (DoD-2)** — see [`docs/17-phased-execution-plan.md`](../../docs/17-phased-execution-plan.md).

It renders the same local engine outputs exposed by `glassbox cost`, `glassbox
xray`, and the SQLite index. The CLI serves the built dashboard from
`127.0.0.1`; no session data leaves the machine.

Current Phase 2 views:

- **Reclaimable-tokens report** — the headline metric from doc 20.
- **Context x-ray** — composition by `SegmentSource`.
- **Cost attribution** — provider actuals plus cache-read recarry cost.
- **Compaction status** — schema-ready, but currently shows an explicit limitation
  when no adapter-observed compaction event exists.
- **Session navigation** — indexed sessions, project filter, empty/error states.

```bash
pnpm --filter @glassbox/ui build
pnpm --filter @glassbox/ui dev
```

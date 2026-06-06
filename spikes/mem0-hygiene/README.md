# Spike — mem0 memory hygiene

**Question:** does mem0's curated memory store still accumulate garbage (near-duplicates,
surviving contradictions, dead memories, bloat) *despite* its write-time
ADD/UPDATE/DELETE reconciliation? This is the mem0 analogue of the Claude Code
reclaimable-tokens spike (`docs/19`, `docs/20`) — evidence first, claims second.

## What it does

1. **Reset** the mem0 store for the seed user.
2. **Replay** your seeded conversation message-by-message (so mem0's incremental
   reconciliation runs across the whole stream — the path meant to prevent garbage).
3. **getAll** the memories mem0 chose to keep.
4. **Measure** four garbage classes against the ground truth you declared:
   - **bloat** — `storedCount / expectedUniqueFacts`
   - **near-duplicates** — clusters with pairwise cosine ≥ threshold (default 0.85)
   - **surviving contradictions** — stale values that should have been replaced
   - **dead memories** — never surfaced by any probe query
5. **Verdict** — garbage present ⇒ the hygiene gap is real and demonstrable.

## Files

| File | Role |
|---|---|
| `seed.ts` | **You own this.** The labeled experiment: conversation + ground truth. |
| `metrics.ts` | Pure measurement (no mem0 dep) — reusable in a future `adapter-mem0`. |
| `mem0-client.ts` | The only file that touches mem0. Adjust here if the SDK drifts. |
| `embed.ts` | OpenAI embeddings via `fetch` (near-dup detection). |
| `run.ts` | Orchestrator + report. |

## Run

```bash
cd spikes/mem0-hygiene
pnpm install
OPENAI_API_KEY=sk-... pnpm spike
```

`OPENAI_API_KEY` is used by both mem0 (extraction LLM + embedder) and our
near-dup embeddings. Tunable: `NEAR_DUP_THRESHOLD` (default `0.85`).

> mem0's TS SDK has moved its export path across versions. If `import { Memory }
> from "mem0ai/oss"` fails after install, that one line in `mem0-client.ts` is
> the only thing to adjust — nothing else imports mem0.

## Interpreting the result

- **Garbage found** → mem0's defenses are best-effort, not complete. That's the
  wedge: store-wide hygiene + active pruning (mem0 *has* a delete API, unlike a
  Claude Code transcript). Capture the output as the demo artifact.
- **Store clean** → strengthen the seed (subtler near-dups, slower drift) or
  lower the threshold before concluding mem0 self-cleans well.

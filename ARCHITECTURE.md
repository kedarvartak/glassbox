# Glassbox — Engineering Architecture

> Observability for AI agent memory & context. This file is the engineering map;
> the product research lives in [`docs/`](./docs) and the build phasing in
> [`docs/17-phased-execution-plan.md`](./docs/17-phased-execution-plan.md).

## The one idea

Read agent state off disk (read-only), normalize it into one tool-agnostic
model, then run analyzers over that model. The moat is the **adapter layer +
normalized model** — not the UI (doc 14 §6). Everything is built **inside-out**:
data layer → analysis layer → UI.

```
  Agent state (read-only)          @glassbox/*
  ┌──────────────────┐
  │ Claude Code JSONL │──┐   adapter-claude-code ─┐
  │ Codex SQLite      │──┼─►  (per-tool parsing)   ├─► core (normalized model) ─► analysis ─► cli / ui
  │ Cursor / Cline    │──┘   …future adapters    ─┘     the spine                detectors   surfaces
  └──────────────────┘
```

## Packages (the dependency arrow only points one way: toward `core`)

| Package | Role | Depends on |
|---|---|---|
| [`@glassbox/core`](./packages/core) | The spine: normalized model + `Adapter`/`TokenCounter`/`RepoState` contracts. **Zero runtime deps.** | — |
| [`@glassbox/adapter-claude-code`](./packages/adapter-claude-code) | Reads `~/.claude/projects/**/*.jsonl` into the model. Tool-specifics never leak out. | core |
| [`@glassbox/analysis`](./packages/analysis) | Detectors over the model (reclaimable tokens; later: dead-refs, stale memory). | core |
| [`@glassbox/cli`](./packages/cli) | The `glassbox` command — discover + analyze from the terminal. | core, adapter, analysis |
| [`@glassbox/ui`](./packages/ui) | Local web UI. Placeholder until Phase 2. | (later) |

If `core` ever imports an adapter, analyzer, or UI, the arrow is backwards.

## The normalized model (the contract)

Lives in [`packages/core/src/model`](./packages/core/src/model), one file per
concept. Key types:

- `Session` → `Message[]` (parent-linked tree) + `Turn[]` (a view over it).
- `ContentBlock` = `text | thinking | tool_use | tool_result | unknown` (lossless).
- `ToolCall` — the stitched join of a `tool_use` and its later `tool_result`.
- `TokenUsage` / `CostRecord` — provider **actuals** (doc 19), incl. `cacheReadTokens`
  (= context re-ingested every turn — the recarry signal).
- `FileOp` / `MemoryOp` — lifted from tool calls; the substrate for hygiene checks.
- `ContextSnapshot` → `Segment[]` with a `SegmentStatus`
  (`live | gone | stale | spent | duplicate | unknown`) — doc 20's
  "gone / stale / already-spent" rule, encoded as a type.

The model records **facts only**. "Is this stale?" verdicts belong to
`@glassbox/analysis`, the only layer allowed to touch the filesystem/git (through
the read-only `RepoState` port).

## Principles (doc 17 §6, enforced here)

- **Adapters are isolated and pure** — tool parsing never reaches analysis/UI.
- **Token math is sacred** — one swappable `TokenCounter` seam; validate hard.
- **Local-first & read-only** — never mutate user sessions or projects.
- **Degrade gracefully** — unknown shapes → `warnings` + partial result, never a crash.

## Build & test

```bash
pnpm install
pnpm build       # tsc project references, inside-out
pnpm test        # vitest
node packages/cli/dist/main.js list   # discover real sessions on this machine
```

## Status

Phase 0 (Foundations) is complete: workspace, normalized model, adapter/port
contracts, working discovery, and the reclaimable-analyzer shape with a working
"gone" classifier.

**Phase 1 (Ingestion engine) — in progress.**

- **1.1 Claude Code adapter** — done. `ClaudeCodeAdapter.parse` (`src/parse.ts`):
  JSONL → normalized model, with usage deduped per provider `message.id`,
  `tool_use`↔`tool_result` stitching, Read/Write/Edit lifted into `FileOp`s, and
  memory-file ops lifted into `MemoryOp`s. The real on-disk schema is documented
  as types in `src/raw.ts`. A golden-file test (`src/parse.test.ts` +
  `test/fixtures/`) pins the contract; run across real local sessions (incl.
  777-message / 2.5 MB transcripts) with no crashes.
- **1.2 Token & cost accounting** — done. Cost is computed from the provider's
  **actual** `usage` (captured verbatim) × authoritative per-model pricing
  (`@glassbox/analysis`: `pricing.ts`, `cost.ts`) — exact, not estimated, with
  cache-read broken out as the recurring recarry tax (doc 20). Because there is
  no accurate *local* Claude tokenizer (the only exact count is the network
  `count_tokens` endpoint, which local-first forbids by default), the
  `TokenCounter` stays a ~4-chars/token estimate behind a swappable seam, and
  `token-accuracy.ts` characterizes its error against provider truth (~0.86× on
  real sessions) so x-ray segment sizes carry an honest error bar. Surfaced via
  `glassbox cost <session>`.

Still open for DoD-1: the SQLite local index + watch mode (1.4, ADR 0004) and
broader golden fixtures (1.5 — subagent, MCP, compacted sessions). See the ADR
log in [`docs/adr`](./docs/adr).

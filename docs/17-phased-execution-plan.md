# 17 · Phased Execution Plan (Build-First)

> **Question this doc answers:** *How do we build a complete, robust Glassbox product — phase by phase, component by component — before we worry about demoing, launching, or pricing it?*
>
> **Sequencing decision:** This is a **build-first** plan. We engineer the product to a genuinely good, cross-tool, well-tested state *first*. Go-to-market/demo ([doc 11](./11-go-to-market.md), [doc 18](./18-github-growth-and-fundraising.md)), pricing ([doc 09](./09-pricing-monetization.md)), and cloud/fundraising are **explicitly deferred** and out of scope here. Grounded in the architecture from [doc 14](./14-tech-landscape.md) and the feature tiers from [doc 04](./04-feature-comparison-matrix.md)/[doc 13](./13-mvp-scope-roadmap.md).

---

## 0. Build philosophy

1. **Inside-out, not outside-in.** Build the **data layer first** (adapters → normalized model → token accounting), then the **analysis layer**, then the **UI**. The UI is the last thing to harden because it depends on everything beneath it.
2. **The adapter layer + normalized model is the product's spine** ([doc 14 §6](./14-tech-landscape.md)). Most engineering effort and quality goes here — it's what makes Glassbox cross-tool and churn-resistant.
3. **Each phase ends on an engineering Definition of Done (DoD)** — correctness, tests, and "the next layer can be built cleanly on top," not "users liked it."
4. **Vertical slice early, breadth later.** Get *one tool (Claude Code) fully through every layer* before adding a second tool — proves the architecture end-to-end.
5. **Quality before reach.** Robustness, accurate token math, and graceful handling of format churn come before adding more adapters or features.

>  **One honest caution, then we proceed as directed:** building before any external validation assumes we've accepted the pain/feasibility risk ([doc 12](./12-risks-assumptions.md)). We mitigate the *feasibility* half by keeping the spike as Phase 0 (it's engineering, not demoing). The *pain* half is consciously deferred per this plan's build-first intent.

## 0a. Operating assumptions (override if wrong)

| # | Assumption | If wrong |
|---|------------|----------|
| OA1 | **Build target = local-first, cross-tool inspector** (Claude Code + Codex first) | Adapter priority changes |
| OA2 | **Small team** (1–3, founder + eng) | Timeline scales |
| OA3 | **Stack:** TS/Node core + local web UI (React/TS), SQLite local index ([doc 14](./14-tech-landscape.md)) | Tooling changes |
| OA4 | **Day 0 = 2026-06-03** | Relative dates |

---

## 1. Build shape at a glance

```
 PHASE 0          PHASE 1            PHASE 2            PHASE 3            PHASE 4
 FOUNDATIONS      INGESTION ENGINE   THE INSPECTOR      DEPTH + 2nd TOOL   HARDEN + EXTEND
 ~2–3 wks         ~3–5 wks           ~4–6 wks           ~4–6 wks           ~3–5 wks
 ───────────────  ─────────────────  ─────────────────  ─────────────────  ─────────────────
 spike, arch,     Claude Code        context x-ray +    Codex adapter,     more adapters,
 normalized       adapter, parse,    compaction diff +  memory timeline,   adapter SDK, tests,
 model, repo,     token/cost,        cost UI            persistence, cache  perf, packaging,
 dev tooling      local index        (first usable app) insight, MCP        contributor docs
        │                │                  │                  │                  │
     DoD-0 ──────────► DoD-1 ───────────► DoD-2 ───────────► DoD-3 ───────────► DoD-4
   (can read it)    (model is correct)  (it's usable)     (cross-tool +     (production-grade
                                                            deep)             OSS, build-complete)
```

> Durations are lean-team estimates. **DoD gates**, not the calendar, decide progression. End state of Phase 4 = a **complete, robust product** ready for the *separate* decision to demo/launch.

---

## 2. Phase specs (the detail)

### PHASE 0 — FOUNDATIONS (Day 0 → ~Wk 3)

**Objective:** De-risk feasibility and lay the architectural spine so every later phase builds cleanly.

**Build workstreams**
- **0.1 Feasibility spike** ([doc 13 §0](./13-mvp-scope-roadmap.md), [doc 14 §1](./14-tech-landscape.md)): actually parse Claude Code session storage (`~/.claude/projects/**/*.jsonl`); reconstruct a turn's context composition + token sizes; detect a compaction event and produce a before/after; read a memory write. Document the real on-disk schema. `⟦verify⟧`
- **0.2 Normalized event/context model:** design the canonical schema all adapters target — `Session`, `Turn`, `Message`, `ToolCall`, `ContextSnapshot` (with sourced segments + token counts), `CompactionEvent` (before/after/evicted), `MemoryOp` (write/recall/edit), `CostRecord` (tokens, cache hit/miss). This is the most important design artifact in the project.
- **0.3 Repo & architecture skeleton:** monorepo (core / adapters / ui / cli), TS config, lint/format, CI, test harness, conventional commits, license decision deferred-but-stubbed.
- **0.4 Adapter interface contract:** define the `Adapter` interface (discover sessions → parse → emit normalized events) so tools are pluggable from day one.

**Deliverables:** feasibility memo (with real schema findings), the normalized model (typed + documented), repo skeleton + CI, adapter interface spec.

**Definition of Done (DoD-0):**
- [ ] Spike proves the data is surfaceable (or scope is consciously narrowed).
- [ ] Normalized model reviewed and stable enough to build on.
- [ ] `Adapter` interface defined; repo + CI green.

**Dependencies:** none. **Top risk:** opaque internals (A3/A9, [doc 12](./12-risks-assumptions.md)) → narrow scope if the spike is partial.

---

### PHASE 1 — INGESTION ENGINE (DoD-0 → ~Wk 3 + 3–5)

**Objective:** Turn a real Claude Code session on disk into the correct normalized model — *headless*, no UI yet. This is the vertical slice's foundation.

**Build workstreams**
- **1.1 Claude Code adapter:** implement the `Adapter` for Claude Code — session discovery, JSONL parsing, mapping to normalized events, compaction/memory detection.
- **1.2 Token & cost accounting:** integrate tokenizer/counting; compute per-segment token sizes; detect prompt-cache hits/misses; compute cost. Validate token math against provider truth. `⟦verify⟧`
- **1.3 Context reconstruction:** for any turn, compute "what was in the window" (by source segment + tokens) — the data behind the x-ray.
- **1.4 Local index/store:** parse → SQLite local index for fast queries + incremental re-parse on file change (watch mode).
- **1.5 Engine test suite:** golden-file tests against captured real sessions (anonymized fixtures) so format changes are caught.

**Deliverables:** a headless engine + CLI command (`glassbox parse <session>`) that emits the normalized model as JSON; passing golden tests.

**Definition of Done (DoD-1):**
- [ ] A real Claude Code session parses into a correct, complete normalized model.
- [ ] Token/cost numbers validated as trustworthy (within tolerance of provider truth).
- [ ] Compaction events + memory ops correctly extracted (or limitations documented).
- [ ] Golden-file tests cover the parser; CI green.

**Dependencies:** DoD-0. **Top risk:** token accuracy (must be trusted) → validate hard.

---

### PHASE 2 — THE INSPECTOR (DoD-1 → ~Wk 8 + 4–6)

**Objective:** Build the **first genuinely usable local app** on top of the engine — the P0 hero features for one tool. (Still no public demo/pricing.)

**Build workstreams**
- **2.1 Local app shell:** `npx glassbox` → launches a local web UI (React/TS) reading the local index; zero signup, nothing leaves the machine.
- **2.2 Context x-ray view (hero):** the composition breakdown of a turn's window — treemap/bars by source (system, files, tool outputs, memory, MCP, history) with token sizes + cost. (Job 1, [doc 07](./07-jobs-to-be-done.md).)
- **2.3 Compaction diff view (hero):** before/after of each compaction event — what was evicted/rewritten, token delta. (Job 2 — the sharpest wedge, [doc 05](./05-market-gaps-opportunities.md).)
- **2.4 Cost attribution view:** spend tied to context composition + cache misses. (Job 4.)
- **2.5 Session navigation + UX polish:** pick a session, scrub turns, search; clear empty/error states; fast.

**Deliverables:** an installable local inspector that, for Claude Code, delivers the context x-ray + compaction diff + cost. The first artifact a teammate could *use* daily.

**Definition of Done (DoD-2):**
- [ ] One-command install → first useful view in < 2 minutes on a clean machine.
- [ ] X-ray, compaction diff, and cost views work on real sessions and are accurate.
- [ ] Robust empty/error/edge-case handling; no crashes on malformed sessions.
- [ ] Dogfood-ready: *we* use it on our own daily agent work.

**Dependencies:** DoD-1. **Top risk:** scope creep into "another tracer" — hold the line on the 3 hero views.

---

### PHASE 3 — DEPTH + SECOND TOOL (DoD-2 → ~Wk 14 + 4–6)

**Objective:** Prove the architecture is truly cross-tool and add the depth features that make it sticky.

**Build workstreams**
- **3.1 Codex adapter:** second `Adapter` implementation — *the real test of the normalized model.* Anything that doesn't fit cleanly = model refactor now, while it's cheap. `⟦verify⟧`
- **3.2 Memory timeline + persistence view:** writes/recalls/edits over time; "what persisted into this session vs. what was lost." (Job 3.)
- **3.3 Prompt-cache insight:** surface cache hits/misses and their cost impact across turns.
- **3.4 MCP contribution view:** show context contributed by MCP servers/tools.
- **3.5 Cross-tool unified view:** one UI spanning sessions from multiple tools.

**Deliverables:** a cross-tool (Claude Code + Codex) inspector with memory timeline, persistence, cache, and MCP views.

**Definition of Done (DoD-3):**
- [ ] Codex sessions parse through the *same* normalized model + views with no per-tool hacks in the UI.
- [ ] Memory timeline + persistence views correct on real multi-session usage.
- [ ] The model proved general (refactors from 3.1 absorbed).

**Dependencies:** DoD-2. **Top risk:** the model wasn't general enough → necessary (and now-cheaper) refactor.

---

### PHASE 4 — HARDEN + EXTEND (DoD-3 → ~Wk 20 + 3–5)

**Objective:** Make it **production-grade and extensible** — the point where the *build* is "done" and a separate demo/launch decision can be made.

**Build workstreams**
- **4.1 More adapters:** Cursor and/or Cline (by usage priority).
- **4.2 Adapter SDK + docs:** a clean, documented interface so contributors can add tools — turns the adapter layer into an ecosystem and offloads the churn-maintenance tax.
- **4.3 Test & resilience:** broad golden fixtures, version detection per tool, graceful degradation on format changes, fuzz/edge-case coverage.
- **4.4 Performance:** large-session/many-session performance; incremental parsing; index efficiency.
- **4.5 Packaging & distribution:** reliable install (`npx`/brew/binary), versioned releases, semantic versioning, error reporting (local/opt-in).
- **4.6 Engineering docs:** architecture docs, adapter-authoring guide, contribution setup (the *technical* README; marketing README is a later GTM task).

**Deliverables:** a robust, performant, multi-tool, extensible OSS-quality product with an adapter SDK and tests — **build-complete.**

**Definition of Done (DoD-4):**
- [ ] ≥3 tool adapters; adding a 4th is documented and doable by an outside contributor.
- [ ] Test coverage + version detection make format churn survivable.
- [ ] Performs well on heavy real-world usage.
- [ ] Clean install + release pipeline; architecture/adapter docs complete.
- [ ] **The product is good enough that the next decision is "do we demo/launch it" — handled in [doc 11](./11-go-to-market.md)/[doc 18](./18-github-growth-and-fundraising.md), not here.**

**Dependencies:** DoD-3.

---

## 3. What this doc deliberately does NOT cover (deferred)

Per the build-first directive, these are **out of scope here** and live elsewhere:

| Deferred concern | Lives in |
|------------------|----------|
| Demoing / Show HN / launch / GIFs | [doc 11 · GTM](./11-go-to-market.md), [doc 18 · GitHub playbook](./18-github-growth-and-fundraising.md) |
| Pricing / monetization / open-core tiers | [doc 09 · Pricing](./09-pricing-monetization.md) |
| Market validation / interviews | [doc 15 · Validation](./15-validation-plan.md) |
| Cloud/team backend, SDK ingestion, enterprise | future build phases (post-build-complete) |
| Fundraising | [doc 18 · Part C](./18-github-growth-and-fundraising.md) |

> We revisit these **only after DoD-4**. The build comes first.

## 4. Build dependency graph (why the order is fixed)

```
  Normalized model (P0) ──┬──► Claude Code adapter (P1) ──► Engine + index (P1)
                          │                                      │
                          │                                      ▼
   Adapter interface (P0) ┘                              Analysis: x-ray,
                                                         compaction, cost (P2)
                                                                 │
                                                                 ▼
                                                         Local app / UI (P2)
                                                                 │
                            Codex adapter (P3) ◄── tests the model │
                                                                 ▼
                                            Depth: memory, persistence, cache, MCP (P3)
                                                                 │
                                                                 ▼
                                       More adapters + SDK + hardening + perf + docs (P4)
```

You cannot build the x-ray before the engine, or trust the engine before the model. The order is a dependency fact, not a preference.

## 5. Cross-phase engineering artifacts (set up in Phase 0)

| Artifact | Purpose |
|----------|---------|
| **Normalized model spec** | The contract every adapter + view depends on; version it |
| **Adapter compatibility matrix** | Tools × versions supported; churn watch |
| **Golden-fixture test suite** | Real (anonymized) sessions; catches format regressions |
| **Architecture decision log** | Irreversible technical choices + rationale + date |
| **Engineering changelog** | Per-release build history |

## 6. Engineering principles (apply every phase)

- **Adapters are isolated and pure:** tool-specific parsing never leaks into analysis/UI.
- **Token math is sacred:** if numbers aren't trusted, the product is worthless — validate against provider truth.
- **Local-first & read-only:** never mutate user sessions; nothing leaves the machine.
- **Degrade gracefully:** unknown/changed formats → partial results + a clear note, never a crash.
- **Dogfood continuously:** we run Glassbox on our own agent work from Phase 2 onward.

## 7. One-page build summary

| | P0 | P1 | P2 | P3 | P4 |
|--|----|----|----|----|----|
| **Name** | Foundations | Ingestion engine | The inspector | Depth + 2nd tool | Harden + extend |
| **Builds** | model, spike, repo | Claude Code parse, tokens, index | x-ray + compaction + cost UI | Codex, memory, persistence, cache, MCP | adapters, SDK, tests, perf, docs |
| **Layer** | spine | data | analysis+UI (1 tool) | cross-tool+depth | production+ecosystem |
| **DoD** | can read it | model correct | usable daily | cross-tool proven | build-complete |

## 8. Day-0 actions
1. **Run the feasibility spike** — inspect real Claude Code storage this week (biggest risk, cheapest test).
2. **Draft the normalized model** from what the spike finds.
3. Stand up repo + CI + adapter interface.
4. Confirm OA1/OA2 (build target + team).

---

*Back to [README](./README.md) · Related: [13 · MVP Scope](./13-mvp-scope-roadmap.md), [14 · Tech Landscape](./14-tech-landscape.md), [04 · Feature Matrix](./04-feature-comparison-matrix.md).*

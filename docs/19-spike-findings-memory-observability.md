# 19 · Spike Findings — Can We Observe Memory Health? (Real-Machine Investigation)

> **What this is:** the Phase-0 feasibility spike ([doc 17](./17-phased-execution-plan.md)), run for real against live Claude Code and Codex state on this machine on **2026-06-03**. It answers two questions:
> 1. Can we observe **when a memory is going stale / bad**, and what *more* can we infer?
> 2. Do Claude Code / Codex already ship **in-house tools** that do this?
>
> ⚠️ Findings are from one machine at one point in time; agent internals are undocumented and change fast. Everything tool-specific is `⟦verify⟧`. Assistant knowledge cutoff is 2026-01, so in-house feature claims especially need re-checking.

---

## 1. What was actually observed (raw findings)

### Claude Code (`~/.claude/`)
- **Transcript:** `projects/<encoded-cwd>/<session-id>.jsonl` — full event log. Event types this session: `user` (120), `assistant` (184), `system` (11), plus attachments/snapshots/titles.
- **Token/cost:** `usage` is recorded **per assistant message** → cost is *actuals*, not estimates. ✅
- **Tool calls:** `toolUseResult` (112) + assistant `tool_use` → every tool action is logged. ✅
- **Structure:** `parentUuid` tree, `isSidechain` (367 — subagent calls), timestamps, `gitBranch`, `cwd`, `version`.
- **Memory = files + tool calls:** memory lives in `CLAUDE.md` + the project `memory/` dir (confirmed: `MEMORY.md` + memory files present). Memory writes appear as **Write tool calls** in the transcript — **106** `memory/` references this session. So memory *writes/edits* are detectable; there is **no structured memory log**.
- **Compaction:** system subtypes this session were only `turn_duration` + `away_summary` — **no compaction marker found** (session hadn't compacted, or it's recorded elsewhere). Compaction diff is **unconfirmed** and needs a compacted session to verify. (Per your note: this being unobservable for now is acceptable.)

### Codex (`~/.codex/`) — much more structured
- **Multiple versioned SQLite DBs:** `memories_1.sqlite`, `state_5.sqlite`, `goals_1.sqlite`, `logs_2.sqlite` (**560 MB**, **137,973** log rows), plus `sessions/`, `session_index.jsonl`, `history.jsonl`, `rules/default.rules`, `skills/`.
- **`memories_1.sqlite` → `stage1_outputs`** columns are *exactly* memory-health signals: `raw_memory`, `rollout_summary`, `generated_at`, `source_updated_at`, `usage_count`, `last_usage`, `selected_for_phase2`. Plus a `jobs` table (a memory regeneration/curation pipeline with timestamps + watermarks).
- **`state_5.sqlite`:** `threads`, `agent_jobs`, `thread_spawn_edges` (subagent graph), `thread_dynamic_tools`.
- **`logs_2.sqlite` → `logs`:** `ts`, `ts_nanos`, `level`, `target`, `module_path`, `file`, `line`, `thread_id` — a full structured trace log (internal Rust logging, not a semantic memory API).
- **⚠️ Critical caveat:** on this machine the memory tables are **provisioned but EMPTY** (`stage1_outputs` = 0 rows, `jobs` = 0, `~/.codex/memories/` has 0 files). So the *schema reveals intent and capability*, but we have **not empirically confirmed** the signals are populated in real use here. `⟦verify⟧` on a machine with active Codex memory.

### The headline asymmetry
| | Claude Code | Codex |
|--|-------------|-------|
| Memory storage | files (`CLAUDE.md` + `memory/`) | structured SQLite (when populated) |
| Memory write/edit | inferred from tool calls / file changes | row timestamps |
| Memory recall | inferred only | `usage_count` + `last_usage` proxy |
| Memory *quality* signals | none native | `source_updated_at`, `selected_for_phase2`, usage |
| Compaction | unconfirmed | unconfirmed |
| Cost/token | actuals in transcript | in logs/state |

---

## 2. THE MAIN QUESTION: can we observe a memory going stale / bad?

**Short answer: yes — but as *derived/inferred* signals, never a built-in "this memory is stale" flag.** And the available signals differ sharply by tool. This is actually a *sharper and more valuable* product idea than generic "memory ops observability."

### The memory-health signal catalog (what we can infer, and from where)

| Signal of stale/bad memory | How we detect it | Claude Code | Codex | Strength |
|----------------------------|------------------|:-----------:|:-----:|:--------:|
| **Dead/dangling references** — memory names a file/function/flag that no longer exists | cross-check memory text against the repo/filesystem + git | ✅ (parse `memory/` + `CLAUDE.md`, check repo) | ✅ (parse `raw_memory`, check repo) | 🟢 **High / concrete** |
| **Source drift** — memory derived from something that changed after it was written | `source_updated_at` > `generated_at` (Codex) · file mtime / git history (Claude) | 🟡 (mtime/git) | ✅ (direct columns) | 🟢 High |
| **Disuse** — memory rarely/never recalled | `usage_count`/`last_usage` (Codex) · inferred from context-injection frequency (Claude) | 🟡 inferred | ✅ direct | 🟢 High (Codex) |
| **Recall-but-ignored** — memory was in context but the agent contradicted/ignored it | correlate injected memory vs. agent output | 🟡 | 🟡 | 🟡 Medium |
| **Recall miss (false negative)** — a relevant memory existed but wasn't surfaced | correlate turn topic vs. stored memory | 🟡 | 🟡 | 🟡 Medium |
| **Conflict / duplication** — two memories contradict or repeat | semantic comparison across memory set | ✅ | ✅ | 🟡 Medium |
| **Staleness by age** — simply old + untouched | timestamps / mtime | ✅ | ✅ | 🟢 Easy |
| **Contradiction with recent actions** — memory says X, recent edits did Y | memory vs. recent tool calls / commits | 🟡 | 🟡 | 🟡 Medium (high value) |
| **Bloat / cost** — memory's token cost per turn vs. its usefulness | token size of memory segment × turns carried, vs. usage | ✅ (usage actuals) | ✅ | 🟢 High |

> **The single most concrete, defensible signal is "dead references."** Memory that mentions `src/foo.ts::bar()` or a `--flag` that no longer exists is *provably* stale — checkable against the repo, no ML needed. (Notably, the Claude memory system itself warns about exactly this: "if a memory names a file/function/flag, verify it still exists.") This is a lint rule, and it's a killer demo.

### What this reframes the product into

REC The user's question points at a **sharper wedge than "observability"**: a **memory health / hygiene monitor — a "linter for agent memory."** It doesn't just *show* memory; it *flags stale, dead-reference, conflicting, unused, and bloated memories* and suggests pruning/refreshing. That is a clearer painkiller ("my agent keeps acting on outdated memory") and harder for a generic trace tool to copy. Strongly consider making **memory health the hero**, with the raw x-ray as the substrate.

---

## 3. What MORE can we infer from all this (beyond memory)

The same observed data unlocks more than memory health:

- **Context composition over time** — what dominates the window across a session (files, tool spew, history, memory, MCP). Both tools.
- **Cost & cache efficiency** — actuals (Claude `usage`; Codex logs); cache hit/miss waste; "this file re-injected every turn cost $X."
- **Tool-call pathology** — retry loops, repeated failing tool calls, runaway tool output (often the real cause of context bloat).
- **Subagent / spawn graphs** — Claude `isSidechain` + Codex `thread_spawn_edges` both expose agent→subagent structure → "which subagent burned the budget."
- **Session/thread lineage & continuity** — what carried across sessions vs. what was lost.
- **"What changed between turns"** — diff context turn-to-turn (the firmest version of the compaction idea, even without a compaction marker).

> These are mostly **point-in-time + historical**, which matters for §4 (the platform built-ins are point-in-time only).

---

## 4. Do Claude Code / Codex already have in-house tools for this?

**Partial built-ins exist for *current-state context*; none do *memory health / staleness / cross-session / cross-tool*.** `⟦verify⟧` — these change frequently.

### Claude Code (in-house, today `⟦verify⟧`)
- **`/context`** — visualizes the **current** context-window usage broken down by category (system prompt, tools, MCP, memory files, messages) with token counts. **This overlaps our "context x-ray" directly.** ⚠️
- **`/cost`** — session cost/token usage.
- **`/compact`** / **`/clear`** — manual compaction / reset.
- **`/memory`** — open & edit the `CLAUDE.md` memory files.
- **CLAUDE.md hierarchy + file-based memory** — the memory mechanism itself.
- **What it does NOT do:** staleness/dead-reference detection, memory health scoring, historical/cross-session analysis, cross-tool, or diffing over time. `/context` is a *live snapshot*, not a *health monitor*.

### Codex (in-house, today `⟦verify⟧`)
- **An internal memory *curation* pipeline** — `stage1_outputs` + `selected_for_phase2` + `usage_count` + the `jobs` queue show Codex already **generates memories from threads, scores/selects them, and tracks usage.** That's the *seed* of staleness handling — but it's **internal machinery, not a user-facing observability/health tool.**
- **`rules/` (`default.rules`), AGENTS.md, skills/** — instruction/config layer.
- **What it does NOT do:** expose a user-facing memory-health dashboard, surface staleness, or work cross-tool.

### Strategic read (important — updates [doc 02](./02-competitor-landscape.md), [doc 08](./08-positioning-differentiation.md), [doc 12](./12-risks-assumptions.md))
1. **Validation:** platforms shipping `/context` and internal memory curation **proves they think context/memory visibility matters.** Good signal.
2. **Platform risk is real for the *basic x-ray*:** Claude's `/context` already commoditizes the live context breakdown. So **the live x-ray is a weaker hero than we thought** — differentiate up the stack.
3. **The unserved gap is precisely:** **memory *health/staleness*, *historical/cross-session* analysis, and *cross-tool* unification** — none of which the point-in-time, single-vendor built-ins do.
4. REC **Pivot the hero from "see your context now" (Claude already does that) to "catch your agent's stale/bad memory across sessions and tools" (nobody does that).** This aligns exactly with the user's instinct.

---

## 5. Honest caveats / what's still unproven
- Codex memory tables were **empty** here → staleness signals are *schema-confirmed, not usage-confirmed*. Verify on an active-memory machine. `⟦verify⟧`
- Compaction markers **not found** in the Claude session → compaction diff unconfirmed (and per the user, acceptable to drop for now).
- Codex schemas are **versioned + undocumented** (`memories_1`, `state_5`, `logs_2`, `_sqlx_migrations`) → **high adapter-churn risk**; version detection is mandatory.
- Dead-reference / conflict / "ignored-recall" detection requires building real analysis (filesystem/git cross-check, semantic comparison) — feasible but it's the actual work.
- In-house feature lists (`/context`, etc.) may have changed since 2026-01 → re-verify before relying.

## 6. Recommendations
1. **Re-aim the wedge** ([doc 05](./05-market-gaps-opportunities.md), [doc 08](./08-positioning-differentiation.md)): hero = **agent memory health ("linter for agent memory": stale, dead-reference, unused, conflicting, bloated)** + **historical/cross-session/cross-tool** analysis. Demote the live context x-ray to "substrate," since Claude `/context` already does the basic version.
2. **Build the dead-reference detector first** as the killer demo — concrete, provable, no ML.
3. **Lean memory-health on Codex** (structured signals) and **lineage/cost on Claude** (rich transcript), per each tool's strengths.
4. **Update affected docs:** 02 (add `/context` + Codex curation as built-ins), 08 (reposition hero), 12 (raise platform-risk on basic x-ray + Codex schema churn), 13/14/17 (tiered memory model + new hero).

---

*Related: [02 · Competitors](./02-competitor-landscape.md) · [05 · Gaps](./05-market-gaps-opportunities.md) · [08 · Positioning](./08-positioning-differentiation.md) · [14 · Tech](./14-tech-landscape.md) · [17 · Build Plan](./17-phased-execution-plan.md). Back to [README](./README.md).*

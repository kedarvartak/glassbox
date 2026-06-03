# 04 · Feature Comparison Matrix

> **Question:** Where's the table-stakes line, and which features actually differentiate?
> Legend:  strong ·  partial/weak ·  none · `?` verify. All cells `⟦verify⟧`.

## 1. Capability matrix

| Capability | **Glassbox (target)** | Langfuse | Helicone | Phoenix | mem0/Letta | ccusage | Platform built-ins |
|---|---|---|---|---|---|---|---|
| **LLM call tracing** |  (not our focus) |  |  |  |  |  |  |
| **Token/cost attribution** |  |  |  |  |  |  |  |
| **Context-window x-ray** (what's in it *now*, by source) |  |  |  |  |  |  |  |
| **Compaction/summarization visibility** (what got dropped) |  |  |  |  |  |  |  |
| **Memory read/write/recall timeline** |  |  |  |  | (own store) |  |  |
| **Cross-session continuity / persistence view** |  |  |  |  |  |  |  |
| **Prompt-cache hit/miss insight** |  |  |  |  |  |  |  |
| **Local-first / runs on your machine** |  | (self-host) |  |  | n/a |  |  |
| **Cross-tool (Claude Code + Codex + Cursor…)** |  |  |  |  | n/a | (single) | (single) |
| **MCP context contribution view** |  |  |  |  |  |  |  |
| **Agent-SDK instrumentation (builders)** | → |  |  |  |  |  | n/a |
| **Team/cloud dashboard** | later |  |  |  |  |  |  |
| **Open source** |  |  |  |  |  |  |  |

>  = where we intend to be *visibly better than everyone*.

## 2. Reading the matrix — three takeaways

1. **Table stakes (credibility):** token/cost view, runs locally or self-host, OSS, reads at least Claude Code + one other tool. Without these we're not a real entrant.

2. **Differentiation columns (our  vs. others' /):**
   - **Compaction/summarization visibility** — *nearly empty for everyone.* The sharpest wedge. OPP
   - **Memory recall timeline + cross-session persistence** — near-empty.
   - **Context-window x-ray by source** — underserved.
   - **Cross-tool + local-first** — incumbents are app-instrumentation or single-tool.

3. **Where we're behind on day one:** deep LLM tracing and team/cloud dashboards (incumbents own these). We **deliberately don't lead there** — we lead on memory/context lifecycle and add team/cloud later.

## 3. The "feature trap" 

Tempting to try to match Langfuse's tracing/eval breadth. **Don't** — a worse Langfuse loses.

REC **Be radically better on the memory/context-lifecycle wedge, merely adequate on tracing/cost.** Depth in the near-empty columns beats breadth as a clone.

## 4. Capability tiers for our build (preview of MVP)

| Tier | Features | Rationale |
|------|----------|-----------|
| **P0 (MVP)** | Local read of Claude Code (+Codex) sessions; context-window x-ray (composition by source + token sizes); cost; **compaction event view (before/after, what dropped)** | The aha: "I can finally *see* my context" |
| **P1** | Memory read/write/recall timeline; cross-session view; prompt-cache insight; second/third tool adapter; MCP contribution | Depth + retention |
| **P2** | Agent-SDK instrumentation for builders; shareable snapshots; team cloud dashboard | Monetization path |
| **P3** | Enterprise: SSO, self-host support, audit, alerting on context anomalies | Org deals |

> Detailed in [doc 13 · MVP & Roadmap](./13-mvp-scope-roadmap.md).

---

*Continue to [05 · Market Gaps & Opportunities](./05-market-gaps-opportunities.md).*

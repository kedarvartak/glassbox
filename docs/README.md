# Glassbox — Product Research Workspace

> **Project codename:** `Glassbox` (working title — alternatives: Recall, Lens, CtxScope)
> **Product concept:** **Observability for AI agent memory & context.** Make the "black hole" of how coding agents (Claude Code, Codex, Cursor, Cline…) and agent SDKs store, compact, recall, and spend context **transparent and debuggable.**
> **Owner:** Kedar (PM) · **Research started:** 2026-06-03 · **Status:** Discovery / pre-build

---

## The problem in one paragraph

When you use an AI coding agent, **context and memory are a black box.** You can't easily see: what's in the context window right now, what it costs, *where* the conversation/memory is stored on disk, *when* compaction/summarization fires and *what it silently dropped*, what got written to or recalled from memory, or what survives across sessions. When the agent does something dumb, you can't tell if it "forgot," got compacted, or never had the context. Glassbox turns that black box into a **glass box.**

## Why this workspace exists

Before writing product code, we need conviction on four questions:

1. **Is the pain real and is there a market?** (demand, who feels it, size)
2. **Who already serves it, and where are they weak?** (LLM-observability + memory tooling)
3. **Who exactly are we for, and what job do they hire us to do?**
4. **How do we win, grow on GitHub, and fund it?** (positioning, OSS growth, fundraising)

---

## How to read these docs (recommended order)

| # | Document | Question it answers |
|---|----------|---------------------|
| 00 | [Executive Summary](./00-executive-summary.md) | TL;DR + recommendation |
| 01 | [Market Overview & Sizing](./01-market-overview.md) | Is there a market? How big? |
| 02 | [Competitor Landscape](./02-competitor-landscape.md) | Who's out there? |
| 03 | [Competitor Deep Dives](./03-competitor-deep-dives.md) | How do the key players work? |
| 04 | [Feature Comparison Matrix](./04-feature-comparison-matrix.md) | Where's the table-stakes line? |
| 05 | [Market Gaps & Opportunities](./05-market-gaps-opportunities.md) | Where can we win? |
| 06 | [Target Personas & Segments](./06-target-personas.md) | Who are we for? |
| 07 | [Jobs To Be Done](./07-jobs-to-be-done.md) | What do they hire us for? |
| 08 | [Positioning & Differentiation](./08-positioning-differentiation.md) | How do we stand apart? |
| 09 | [Pricing & Monetization](./09-pricing-monetization.md) | How do we make money (open-core)? |
| 10 | [SWOT Analysis](./10-swot.md) | Honest strengths/weaknesses |
| 11 | [Go-To-Market Strategy](./11-go-to-market.md) | How do we get users? |
| 12 | [Risks & Assumptions](./12-risks-assumptions.md) | What could kill this? |
| 13 | [MVP Scope & Roadmap](./13-mvp-scope-roadmap.md) | What do we build first? |
| 14 | [Technical Landscape](./14-tech-landscape.md) | What's the build reality? |
| 15 | [Validation Plan](./15-validation-plan.md) | How do we de-risk before building? |
| 16 | [Glossary & Sources](./16-glossary-and-sources.md) | Terms + where numbers come from |
| 17 | [Phased Execution Plan (Build-First)](./17-phased-execution-plan.md) | **How do we build the product — phases, layers, engineering DoD gates** |
| 18 | [**GitHub Boom, Marketing & Fundraising Playbook**](./18-github-growth-and-fundraising.md) | **How do we blow up on GitHub + raise money?** |
| 19 | [**Spike Findings — Memory Observability**](./19-spike-findings-memory-observability.md) | **Real-machine spike: can we observe memory health? + platform built-ins** |
| 20 | [**Context Garbage — Evidence & Taxonomy**](./20-context-garbage-evidence-and-taxonomy.md) | **Is context bloat real? Measured garbage types + reclaimable %** |

---

##  A note on the numbers

Market sizes, competitor stats, and pricing here are **directional estimates** from the assistant's general knowledge as of training — **not** live data. They frame strategy and prioritize validation, but **every quantitative claim must be re-verified** before any board deck or fundraising memo. Softer claims are flagged `⟦verify⟧`; the [Validation Plan](./15-validation-plan.md) and [Sources doc](./16-glossary-and-sources.md) say what to confirm.

## Conventions

- `⟦verify⟧` — claim needs primary-source confirmation.
- `OPP` — opportunity hook · `RISK` — trap · `REC` — recommended POV.
- Dates absolute (e.g., "2026-Q3"), never relative.

# 05 · Market Gaps & Opportunities

> **Question:** Given the landscape, where exactly can a focused entrant win?
> Each gap: **the gap · evidence · the bet · how to test · risk.**

## The 6 gaps, ranked

| Rank | Gap | Pain size | Defensibility | Effort | Verdict |
|------|-----|-----------|---------------|--------|---------|
| 1 | **Compaction/summarization visibility** | High | Medium | Low–med | REC Lead wedge |
| 2 | **Context-window x-ray (composition by source)** | High | Medium | Low | REC Core |
| 3 | **Memory recall + cross-session persistence view** | Med–High | Medium | Med | REC Core |
| 4 | **Cross-tool, local-first inspector** | High | Med (network/community) | Med | REC Distribution wedge |
| 5 | **Cost tied to context composition** | Medium | Low–med | Low | Supporting |
| 6 | **Observability layer over memory frameworks (mem0/Letta)** | Med (rising) | Medium | Med | OPP Expansion |

---

## Gap 1 — Compaction/summarization visibility REC

- **The gap:** When an agent compacts/summarizes context, **what got dropped or rewritten is invisible.** No tool surfaces a clear before/after diff of a compaction event. This is the literal "black hole" moment users describe.
- **Evidence to confirm `⟦verify⟧`:** forum/Discord threads of "Claude forgot X after compaction"; the frequency of compaction in long sessions.
- **The bet:** Show every compaction event as a **diff**: what was in context before, what the summary replaced it with, what was evicted, token delta. "Here's exactly what your agent forgot and why."
- **How to test:** Build this single view first; show it in a demo GIF; measure "I need this" reactions (Show HN, [doc 15](./15-validation-plan.md)).
- **Risk:** Internals/format may be undocumented and change RISK → adapter layer + community.

## Gap 2 — Context-window x-ray REC

- **The gap:** Nobody cleanly answers *"what is in my context window right now, broken down by source?"* (system prompt, files, tool outputs, memory, MCP, history) with token sizes.
- **The bet:** A live/loadable breakdown — a "what's eating my context" treemap. Immediately useful and screenshot-friendly (great for virality).
- **How to test:** Ship as the headline of the MVP; measure daily-active use.
- **Risk:** Token accounting must be accurate to be trusted.

## Gap 3 — Memory recall + cross-session persistence REC

- **The gap:** What did the agent **write to / recall from** memory (CLAUDE.md, memory tools, mem0, etc.), when, and **what carries across sessions?** Opaque today.
- **The bet:** A **memory timeline**: writes, recalls, edits, and a "what persisted into this session vs. what was lost" view.
- **How to test:** Interviews on "have you been burned by the agent forgetting/mis-remembering?"
- **Risk:** Memory mechanisms differ per tool; needs adapters.

## Gap 4 — Cross-tool, local-first inspector REC (distribution)

- **The gap:** Existing utilities are **single-tool** (ccusage = Claude Code) or **app-instrumentation** (Langfuse). Devs use *several* agents and want **one local x-ray** across them.
- **The bet:** One install, reads Claude Code + Codex + Cursor + Cline sessions, unified view. Local-first = trust + zero-friction adoption (no sending data to a cloud).
- **How to test:** Which tools do target users run? (interviews) Start with the top 2.
- **Risk:** Each adapter is maintenance; prioritize by usage.

## Gap 5 — Cost tied to context composition (supporting)

- **The gap:** Cost tools (ccusage) show *spend*; they don't tie it to *why* (which files/tool outputs/memory bloated the window, cache misses).
- **The bet:** "This file added 12k tokens every turn; this cache miss cost $X." Actionable cost, not just totals.
- **Risk:** Adjacent to ccusage's turf; differentiate via the composition link.

## Gap 6 — Observability over memory frameworks OPP (expansion)

- **The gap:** mem0/Letta/Zep are *backends*; nobody is the neutral **dashboard for** them.
- **The bet:** Be the observability layer agent-*builders* point at their memory layer. Opens the B2B/team segment.
- **Risk:** Requires builder adoption + integrations; later phase.

---

## Synthesis — the opportunity stack

REC **Lead with the local-first cross-tool inspector (distribution) → make compaction visibility + context x-ray the unmissable hero features (painkiller) → add memory/persistence timeline (depth/retention) → expand to observability-over-frameworks + team cloud (monetization).**

```
   ADOPT (free OSS)        WOW / PAINKILLER          RETAIN              MONETIZE
   ┌──────────────┐       ┌────────────────────┐    ┌────────────┐     ┌──────────────┐
   │ cross-tool   │ ────► │ compaction diff +   │──► │ memory +   │──► │ team cloud +  │
   │ local-first  │       │ context x-ray       │    │ persistence│     │ observe mem0/ │
   │ inspector    │       │ ("see your context")│    │ timeline   │     │ Letta + ent.  │
   └──────────────┘       └────────────────────┘    └────────────┘     └──────────────┘
```

Each layer maps to a validation gate ([doc 15](./15-validation-plan.md)).

---

*Continue to [06 · Target Personas](./06-target-personas.md).*

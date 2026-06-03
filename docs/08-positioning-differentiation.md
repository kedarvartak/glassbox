# 08 · Positioning & Differentiation

> **Question:** In one breath — what are we, who for, why us?

## 1. Positioning statement (draft)

> **For** developers who use and build AI agents
> **who** are frustrated that agent memory & context are a black box,
> **Glassbox** is an open-source observability tool
> **that** makes context composition, compaction, memory, and cross-session persistence visible and debuggable — across the tools you already use.
> **Unlike** LLM-observability platforms (call traces, not memory-lifecycle) or memory frameworks (backends you adopt, not lenses on what you run),
> **we** are the cross-tool, local-first x-ray for agent memory & context.

## 2. One-liner / tagline candidates

| Tagline | Leans into | Best for |
|---------|-----------|----------|
| "See inside your agent's memory." | clarity/x-ray | broad |
| "Turn the black box into a glass box." | the core metaphor | the pain |
| "Observability for AI agent memory & context." | category-defining | builders |
| "Stop guessing what your agent forgot." | compaction painkiller | Persona 1 |
| "`htop` for your agent's context." | dev-native analogy | engineers OPP |

> The `htop`/Sentry-style analogy ("the X for your agent's context") is powerful with engineers — instantly communicates category + local-first. Test it ([doc 15](./15-validation-plan.md)).

## 3. Differentiation pillars

```
┌──────────────────────────────────────────────────────────┐
│ 1. MEMORY/CONTEXT-LIFECYCLE NATIVE                          │
│    compaction diffs, recall timeline, persistence — not    │
│    just call traces                                         │
├────────────────────────────────────────────────────────────┤
│ 2. CROSS-TOOL                                               │
│    one lens across Claude Code, Codex, Cursor, Cline,       │
│    SDKs — not single-vendor                                 │
├────────────────────────────────────────────────────────────┤
│ 3. LOCAL-FIRST & OPEN SOURCE                                │
│    runs on your machine, your data stays yours, inspectable │
├────────────────────────────────────────────────────────────┤
│ 4. DEVELOPER-LOVED CLARITY                                  │
│    instant, screenshot-worthy "aha" — relief from the       │
│    black box                                                │
└──────────────────────────────────────────────────────────┘
```

Each pillar exploits a *structural* weakness rivals can't easily copy:
- Observability incumbents are architected around **call traces**, not memory state.
- Memory frameworks are **backends**, structurally not observability.
- Platform built-ins are **single-vendor** by definition — they'll never be cross-tool.

> REC Best differentiation exploits a competitor's *architecture/business-model constraint*, not a missing feature. Cross-tool + memory-lifecycle is structurally hard for each incumbent.

## 4. Perceptual map

```
              "Memory/context-lifecycle native"
                        ▲
                        │   ● Glassbox (target)
        mem0/Letta      │
        (backends)      │
   ─────────────────────┼─────────────────────►
   App-instrument       │        Local / daily-user
   (builders)           │
        Langfuse        │   ccusage (single-tool, cost)
        Phoenix         │
                        ▼
              "Generic call tracing"
```

We plant the flag **upper-right**: memory/context-lifecycle native *and* usable locally by daily agent users.

## 5. Messaging by persona

| Persona | Headline | Proof point |
|---------|----------|-------------|
| Devon (daily user) | "Stop guessing what your agent forgot." | compaction diff + context x-ray demo GIF |
| Mira (builder) | "Observability for your agent's memory & context." | SDK instrumentation + state-at-failure view |
| Indie/curious | "Finally see what your agent is doing with context." | one-command local install |

## 6. What we deliberately DON'T claim
-  "Full LLM eval/experimentation platform" (Braintrust/LangSmith ground).
-  "A better memory backend" (that's mem0/Letta — we *observe* them).
-  "All-in-one LLMOps."
- REC Saying no sharpens the wedge. A muddy "we do all observability" message loses to incumbents.

## 7. Brand attributes
Transparent · Developer-native · Trustworthy (local-first, OSS) · Fast/clear · Cross-tool/neutral.

---

*Continue to [09 · Pricing & Monetization](./09-pricing-monetization.md).*

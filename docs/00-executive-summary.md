# 00 · Executive Summary

> One-page read for anyone deciding whether to build/fund this. Expanded in later docs.

## The concept in one sentence

**Glassbox is observability for AI agent memory & context** — a tool that makes the opaque lifecycle of how coding agents and agent apps store, compact, recall, and spend context **visible, debuggable, and trustworthy.**

## The pain (why this is a painkiller, not a vitamin)

Anyone who uses Claude Code, Codex, Cursor, or builds on an agent SDK hits the same wall: **context is a black box.**
- *"What's even in the context window right now, and what is it costing me?"*
- *"Where is my session/memory actually stored on disk? What's in it?"*
- *"Compaction just happened — what did it throw away? Is that why the agent forgot?"*
- *"What did it write to / recall from memory, and when?"*
- *"Why did the agent do that — bad context, lost context, or no context?"*

This is **acute** (blocks debugging now), **frequent** (every long session), and **badly solved** (today: guessing, or grepping raw JSONL logs by hand). That is the painkiller profile the earlier idea lacked.

## What we found (short version)

The space splits into three camps, and **memory/context-lifecycle observability sits in the gap between them**:
- **LLM/agent observability** (Langfuse, Helicone, Arize Phoenix, LangSmith, Braintrust, W&B Weave) — superb at *traces, prompts, evals, cost*. Weak on the **memory & context-window lifecycle** (compaction, recall, what-persists) as a first-class object. `⟦verify⟧`
- **Memory frameworks** (mem0, Letta/MemGPT, Zep, cognee) — they *are* memory *backends/SDKs you adopt*, not a lens onto the memory an agent **already has**.
- **Coding-agent utilities** (e.g., `ccusage` for Claude Code cost) — narrow, cost-focused, per-tool, no unified context/memory view. `⟦verify⟧`

REC **The wedge:** be the **"x-ray for agent context & memory."** Start local-first for the tools developers already use daily (Claude Code, Codex), expand to an SDK/proxy for teams building agents.

## Why now

- The **agent explosion** of 2025–2026: millions of developers now run long-horizon coding agents daily, and context/memory is the #1 source of confusing behavior and runaway cost. `⟦verify⟧`
- Agents externalize state to **disk and standard formats** (transcripts, memory files, MCP) we can read — making a local-first inspector genuinely feasible.
- Observability for *traditional* LLM calls is mature; observability for **agent memory/context as a lifecycle** is nascent. OPP

## Biggest risks (full list in [doc 12](./12-risks-assumptions.md))

- RISK **Platforms close the gap themselves.** Anthropic/OpenAI/Cursor could ship native context inspectors. Mitigate by being cross-tool, deeper, and developer-loved before they bother.
- RISK **Observability incumbents extend into memory.** Langfuse/Phoenix already have distribution. We must own the *memory/context-lifecycle* angle sharply.
- RISK **Monetizing developer tools is hard;** OSS expectation of free. Revenue lives in teams/cloud/enterprise (open-core).
- RISK **Format churn.** Agent internals (transcript schemas, compaction) change without notice; adapters need maintenance.

## Recommended point of view

REC **Proceed to validation, open-source-first.** The pain is real and we feel it ourselves (strong founder-pain signal). Before heavy build:
1. Beachhead = **engineers who live in Claude Code / Codex daily** (see [doc 06](./06-target-personas.md)).
2. Run the [Validation Plan](./15-validation-plan.md): ship a tiny OSS "context inspector," post a Show HN / demo GIF, measure GitHub stars + "holy cow I needed this" signal + retention.
3. Expand to the agent-builder segment + cloud/team tier only after the local tool earns love.

## The 3 things to chase down first
1. **Do people feel this as a top-3 pain** or just a mild annoyance? → interviews + Show HN reaction.
2. **Is local-first inspector enough to get daily-active use**, or do they need the team/cloud layer to care?
3. **How fast do agent internal formats change** (the maintenance-tax question)?

---

*Continue to [01 · Market Overview](./01-market-overview.md).*

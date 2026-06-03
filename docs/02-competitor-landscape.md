# 02 · Competitor Landscape

> **Question:** Who serves agent observability / memory today, and how do they cluster?
> Deep dives in [doc 03](./03-competitor-deep-dives.md); feature matrix in [doc 04](./04-feature-comparison-matrix.md).
>  Specifics, stars, and features change fast — all `⟦verify⟧`.

## 1. The four clusters

We don't have one competitor set — we have four, because "agent memory/context observability" overlaps four categories. Knowing the cluster tells you which part of *our* job they threaten.

```
┌───────────────────────────────────────────────────────────────┐
│ A. LLM/Agent Observability        B. Memory frameworks/backends │
│    (traces, prompts, evals, cost)    (you ADOPT them as memory) │
│    Langfuse, Helicone, Arize         mem0, Letta/MemGPT, Zep,   │
│    Phoenix, LangSmith, Braintrust,   cognee, LangMem            │
│    W&B Weave, Lunary, Traceloop                                 │
│                                                                 │
│ C. Coding-agent utilities          D. Platform-native tooling   │
│    (per-tool, often cost/usage)      (built into the agent)     │
│    ccusage & Claude Code monitors,   Claude Code's own context  │
│    transcript viewers, Cursor        meter / Codex / Cursor     │
│    usage tools                       built-ins                  │
└───────────────────────────────────────────────────────────────┘
```

## 2. Positioning grid

Two axes that define our empty space:
- **X:** Generic LLM tracing ↔ **Memory/context-lifecycle native** (compaction, recall, persistence as first-class).
- **Y:** Built for **agent builders (prod/SDK)** ↔ built for **agent *users* (local, daily)**.

```
 Builders / prod
   HIGH │ Langfuse  LangSmith  Braintrust
        │ Phoenix   Weave   Helicone
        │ (great traces, weak memory-lifecycle)
        │                       ┌──────────────────────┐
        │  mem0/Letta/Zep       │   REC TARGET GAP      │
        │  (memory backends,    │ memory & context-     │
        │   not observability)  │ lifecycle x-ray,      │
        │                       │ cross-tool            │
        │                       └──────────────────────┘
   LOW  │ ccusage, transcript viewers   (Glassbox local-first start)
        │ (narrow, per-tool, cost)
        └──────────────────────────────────────────────────►
          Generic tracing  ◄──────────────►  Memory/context-lifecycle native
```

REC The **"memory/context-lifecycle native, usable by both daily agent users and builders"** corner is thinly occupied. Generic observability is crowded; memory backends solve a different problem; coding-agent utilities are narrow and per-tool.

## 3. Roster (quick reference)

| Tool | Cluster | OSS? | Threatens which job? | One-line read |
|------|---------|------|----------------------|---------------|
| **Langfuse** | A |  (open-core) | trace, cost, prod observ. | The OSS observability leader; strong distribution; memory-lifecycle is not its core RISK |
| **Helicone** | A |  | cost, logging, proxy | Proxy-based LLM logging/cost; broad |
| **Arize Phoenix** | A |  | tracing, evals | OSS tracing/eval, OTel-based |
| **LangSmith** | A |  | tracing, evals | LangChain's platform; tied to that ecosystem |
| **Braintrust / W&B Weave** | A | partial | evals, tracing | Eval-centric, team/enterprise |
| **mem0** | B |  | memory backend | Popular OSS memory layer you *integrate*; not a lens on existing agents OPP-complement |
| **Letta (MemGPT)** | B |  | memory/agent runtime | Memory-centric agent framework; research lineage |
| **Zep / cognee** | B | /partial | memory store | Memory/knowledge layers for apps |
| **ccusage** | C |  | cost/usage (Claude Code) | Beloved CLI for Claude Code token/cost from JSONL; narrow & cost-only `⟦verify⟧` |
| **Transcript/usage viewers** | C |  indie | view sessions | Fragmented, per-tool, unmaintained-prone OPP |
| **Platform built-ins** | D | n/a | context meter | Anthropic/OpenAI/Cursor native views; basic today, could deepen RISK |

> **The invisible competitor:** **"grep the JSONL / do nothing."** Most people's current "tool" is manually inspecting `~/.claude/projects/**.jsonl`, eyeballing a token counter, or just shrugging. Beating *do-nothing* (and habit) is the real fight ([doc 07](./07-jobs-to-be-done.md)).

## 4. Competitive intensity by job

| Our job | Crowded? | Opening |
|---------|----------|---------|
| **Trace/log LLM calls** |  Very (commodity) | Don't lead here; not our wedge |
| **Cost/token attribution** |  (ccusage, observ. tools) | Differentiate: tie cost to *context composition* & compaction |
| **Context-window x-ray** (what's in it now, by source) |  Underserved | Strong wedge OPP |
| **Compaction/summarization visibility** (what got dropped) |  Nearly empty | Sharpest wedge OPP |
| **Memory read/write/recall timeline** |  Nearly empty | Strong wedge OPP |
| **Cross-session continuity** (what persists) |  Nearly empty | Strong wedge OPP |

REC Lead with **compaction visibility + context x-ray + memory timeline** — the near-empty columns. Avoid competing as "another tracer."

## 5. Momentum signals (verify)

`⟦verify⟧` before relying: Langfuse/Helicone/Phoenix actively funded & high-star; mem0/Letta high-star memory projects; ccusage popular but narrow; check whether Anthropic/OpenAI/Cursor have shipped deeper native context inspectors recently (the key platform-risk signal).

---

*Continue to [03 · Competitor Deep Dives](./03-competitor-deep-dives.md).*

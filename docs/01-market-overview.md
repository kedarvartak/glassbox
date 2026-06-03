# 01 · Market Overview & Sizing

> **Question:** Is there a real, growing market for agent memory/context observability — and how big is the winnable slice?

## 1. What market are we in?

Glassbox sits at the intersection of three established/emerging categories:

```
       LLM / Agent Observability
       (Langfuse, Helicone, Phoenix,
        LangSmith, Braintrust, Weave)
                 \
                  \
   Agent Memory  ---●---  Coding-agent dev tooling
   layers/frameworks |     (Claude Code/Codex/Cursor
   (mem0, Letta,     |      ecosystems, ccusage,
    Zep, cognee)     |      transcript viewers)
                     |
            "Memory & context-LIFECYCLE
              observability"  ← us
```

We are **not** another LLM trace viewer, and **not** a memory backend you adopt. We are the **lens onto the context & memory an agent already has** — what's in the window, where it's stored, what compaction did, what was recalled, what persists.

## 2. Market tailwinds (why demand is rising)

| Tailwind | What's happening | Why it helps us |
|----------|------------------|-----------------|
| **Agent explosion** | Millions of devs now run coding agents daily (Claude Code, Codex, Cursor, Cline, Aider) `⟦verify⟧` | A large, growing base feeling the black-box pain |
| **Long-horizon agents** | Sessions span hours; context windows fill; compaction/summarization is routine | Memory/context confusion scales with session length |
| **Cost sensitivity** | Token spend on agents is real money; caching matters | "What am I paying for?" is a daily question |
| **Externalized state** | Transcripts/memory live in files + standard formats (MCP, JSONL) | A local-first inspector is technically feasible OPP |
| **Observability now expected** | Teams shipping agents to prod demand visibility | B2B/enterprise willingness to pay exists |

## 3. Market headwinds (why it's hard)

| Headwind | Implication |
|----------|-------------|
| **Platform risk** | Vendors could ship native inspectors; format churn breaks adapters RISK |
| **OSS = free expectation** | Devtool monetization needs an open-core wedge |
| **Crowded observability** | Funded incumbents with distribution can extend toward memory |
| **"Nice to debug" vs. "must have"** | Must prove it's top-3 pain, not mild annoyance |

## 4. Sizing: TAM / SAM / SOM (directional)

>  Framing estimates, not researched figures. Re-derive with live data (developer-population reports, LLMOps market reports, company metrics) before external use. All `⟦verify⟧`.

| Layer | Definition | Directional estimate | Basis (to verify) |
|-------|-----------|----------------------|-------------------|
| **TAM** | Global LLMOps / AI-observability + AI-developer-tools spend | **$5–15B/yr by ~2028** | A fast-growing slice of devtools + observability `⟦verify⟧` |
| **SAM** | Teams & developers building or heavily *using* agents who need memory/context visibility | **$0.5–2B/yr** | Filtered to agent-centric users |
| **SOM (3-yr)** | Realistic capture as a focused OSS-led entrant | **$3–20M ARR (aspirational ceiling)** | Bottoms-up: cloud teams + enterprise |

### Bottoms-up sanity check (the model to actually build)

```
OSS users (yr 3):           ~50,000 installs / many free       (vanity-ish; fuels funnel)
Converting teams (yr 3):    1,500 teams on a cloud/team plan
Avg price/team/month:       ~$80 (seats + usage)
=> Team ARR:                1,500 × $80 × 12     ≈ $1.44M
Enterprise (yr 3):          25 contracts × ~$30k ≈ $0.75M
Total directional yr-3 ARR  ≈ $2.2M  (healthy OSS-devtool trajectory IF the
                                      free tool earns mass adoption first)
```

REC The story to tell: **adoption first (stars + DAU), revenue second.** This is a classic open-core devtool shape (cf. Langfuse, PostHog) — value compounds with community and integrations, not seats alone.

## 5. Segmentation

| Segment | WTP | Feature bar | Notes |
|---------|-----|-------------|-------|
| Individual dev / power user | Low (free OSS) | Low | Daily-active funnel + word of mouth + stars |
| Agent-building team (2–30) | Medium–high | Medium | Cloud dashboard, shared traces, collaboration |
| Enterprise (agents in prod) | High | High | SSO, self-host, audit, data residency, SLAs |

> See [doc 06 · Personas](./06-target-personas.md).

## 6. What "winning" looks like

- **Niche-leader:** the default "open it when your agent acts weird" tool; the `htop`/`Sentry` of agent context. Profitable open-core, $3–10M ARR.
- **Platform:** the standard memory/context-observability layer across agent frameworks (SDK + integrations + cloud), bigger TAM, needs ecosystem adoption.

## 7. Open questions (→ [Validation](./15-validation-plan.md))
1. Is this top-3 pain for daily agent users, or a curiosity?
2. Does local-first alone drive retention, or is the team/cloud layer required for stickiness?
3. How heavy is the format-maintenance tax?

---

*Continue to [02 · Competitor Landscape](./02-competitor-landscape.md).*

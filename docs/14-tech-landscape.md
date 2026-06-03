# 14 · Technical Landscape

> **Question:** What's the build reality — what's easy, what's hard, what can we reuse?
> PM-level feasibility scan, not an engineering spec. Grounds strategy in what's buildable.

## 1. Where the data actually lives (the foundation)

Glassbox depends on **reading agent state**. Approximate sources `⟦verify⟧` (confirm in the Week-1 spike, [doc 13](./13-mvp-scope-roadmap.md)):

| Source | Where / how | What we get |
|--------|-------------|-------------|
| **Claude Code** | Session transcripts as JSONL under `~/.claude/projects/<encoded-path>/*.jsonl`; memory via `CLAUDE.md` + memory tool | Turns, tool calls, tokens, compaction markers, memory writes `⟦verify⟧` |
| **Codex** | Its own local session store (`~/.codex/…`) `⟦verify⟧` | Session history, usage |
| **Cursor / Cline** | App data (SQLite/leveldb/JSON) `⟦verify⟧` | Chat/context history |
| **Agent SDKs (builders)** | Instrumentation hooks / OTel spans / proxy | Live context, memory ops, tool calls |
| **MCP servers** | Protocol messages | Context contributed by tools/resources |
| **Provider APIs** | Usage/cost endpoints, cache headers | Token/cost/cache truth |

> REC The **local-first, file-reading** approach (Claude Code/Codex transcripts) is the feasible, trust-building entry point. The **SDK/proxy/OTel** approach serves builders later. Two ingestion modes, one model.

## 2. What's easy (reuse, don't build)
| Need | Reuse |
|------|-------|
| Tokenization/estimation | `tiktoken`/Anthropic token counting libs `⟦verify⟧` |
| Local UI | Web UI (React/TS) served locally, or a TUI |
| CLI | Node/TS or Go CLI; `npx` one-command UX |
| Parsing JSONL/SQLite | Standard libs |
| Diffing (for compaction view) | Existing diff libs |
| Telemetry standard | **OpenTelemetry** for the builder/SDK path (interop, not reinvention) OPP |

## 3. What's medium-hard
| Need | Challenge | Approach |
|------|-----------|----------|
| **Accurate context reconstruction** | Faithfully recompute "what was in the window" per turn | Careful per-tool adapters; validate token math |
| **Compaction detection** | Identifying + diffing summarization events | Depends on what the transcript records; spike it |
| **Memory timeline** | Normalizing different memory mechanisms | Adapter abstraction |
| **Cross-tool model** | One schema across tools | A normalized internal event model + per-tool adapters |

## 4. What's genuinely hard (defer or design carefully)
| Need | Why hard | Strategy |
|------|----------|----------|
| **Adapter durability vs. format churn** | Internals change without notice | Modular adapters, contract tests, community contributions, version detection RISK |
| **Live (real-time) context view** | Hooking a running agent | Start with post-hoc/session reading; add live later |
| **Cloud ingestion at scale** | Storage/cost of agent telemetry | P2; meter retention |
| **Enterprise (self-host/SSO/audit)** | Security surface | P3; gate on demand |

## 5. Architecture sketch (conceptual)

```
  Agent state sources                Glassbox
  ┌───────────────────┐             ┌──────────────────────────────┐
  │ Claude Code JSONL  │──┐         │  Adapters (per tool)          │
  │ Codex store        │──┼───read──►│      ↓                        │
  │ Cursor/Cline data  │──┘         │  Normalized event model       │
  │ SDK/OTel (builders)│──ingest───►│  (context, compaction, memory,│
  │ MCP messages       │──┘         │   tokens, cost, cache)        │
  └───────────────────┘             │      ↓                        │
                                     │  Local UI (x-ray, diff,       │
                                     │  timeline)  + optional cloud   │
                                     └──────────────────────────────┘
```

Key decisions (route to a spike, not this doc):
- **Local-first, read-only** on user files = trust + feasibility. REC
- **Normalized event model + adapters** = the architecture that makes "cross-tool" real and churn survivable.
- **OTel for the builder path** = interop with existing observability.

## 6. Build-vs-buy
| Component | Decision |
|-----------|----------|
| Tokenizers, diff, parsing, UI framework, CLI, OTel | **Reuse/OSS** |
| **Adapters + normalized model** | **Build** (this is differentiation + moat) |
| **Compaction/memory views** | **Build** (the wedge) |
| Cloud/team backend | Build later (NestJS/standard stack) |

## 7. Technical risks (→ [doc 12](./12-risks-assumptions.md))
- Compaction/memory data may be under-documented → spike first; degrade gracefully.
- Token math must be trustworthy → validate against provider truth.
- Format churn → adapter abstraction is the single most important architectural decision.

> REC **PM takeaway:** the moat isn't the UI (commodity) — it's the **adapter layer + normalized memory/context model** that makes Glassbox cross-tool and churn-resistant. Concentrate engineering there.

---

*Continue to [15 · Validation Plan](./15-validation-plan.md).*

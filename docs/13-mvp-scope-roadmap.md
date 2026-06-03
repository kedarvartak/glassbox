# 13 · MVP Scope & Roadmap

> **Question:** What's the smallest thing that tests the thesis and delivers real value — and what comes after?

## 1. MVP philosophy

The MVP must reach the **aha moment** ("I can finally *see* my agent's context") with near-zero friction, while testing the riskiest assumptions: **is this top-3 pain (A1), does local-first retain (A2), and can we even surface the data (A3/A9)** ([doc 12](./12-risks-assumptions.md)).

> REC **Build the inspector, not the platform.** Lead with the local, cross-tool x-ray. Defer cloud, SDK, team, enterprise.

## 0. Week-1 feasibility spike (BEFORE the MVP)

Non-negotiable de-risking, because the whole product depends on it:
- Can we parse **Claude Code** session storage (JSONL transcripts) and reconstruct context composition + token sizes? `⟦verify⟧`
- Can we **detect compaction/summarization events** and show a before/after? `⟦verify⟧`
- Can we read **memory** signals (CLAUDE.md / memory tool writes) and a second tool (**Codex**)?
- **Output:** a feasibility memo — green-lights the MVP or forces a pivot in approach.

## 2. The MVP: "the local context x-ray"

**One-sentence MVP:** *A one-command local tool that reads your Claude Code (and Codex) sessions and shows what's in your context window by source + token size, what compaction dropped, and what it cost — no signup, no cloud.*

### P0 — must-have
| Feature | Why P0 | Notes |
|---------|--------|-------|
| One-command install + point-at-session | Time-to-wow < 2 min ([doc 11](./11-go-to-market.md)) | `npx`/CLI/local web UI |
| **Context-window x-ray** (composition by source, token sizes) | Hero feature; Job 1 | the screenshot moment |
| **Compaction diff** (what was dropped/rewritten) | Sharpest wedge; Job 2 | depends on spike |
| **Cost / token attribution** | Table stakes; Job 4 | tie to composition |
| Reads **Claude Code + Codex** | Cross-tool proof | top-2 by usage |
| Local-first, no data leaves machine | Trust | say it loudly |

### Explicitly NOT in MVP (deferred)
-  Cloud/team dashboards → P2 (monetization).
-  Agent-SDK instrumentation for builders → P2.
-  Memory recall timeline → P1 (fast follow).
-  Enterprise (SSO/audit) → P3.
-  Full LLM tracing/evals → *never* (anti-persona ground).

## 3. Roadmap (phased, gated)

```
 PHASE 0           PHASE 1             PHASE 2              PHASE 3
 Spike+Validate    OSS inspector       Depth + adapters     Cloud/Team + builders
 ───────────────   ─────────────────   ──────────────────   ────────────────────
 • feasibility     • P0 local x-ray    • memory timeline    • cloud dashboards
   spike           • Show HN launch    • persistence view   • SDK instrumentation
 • interviews      • Claude Code+Codex  • more tool adapters • observe mem0/Letta
 • demo GIF        • measure retention  • cache insight      • team beta → GA
                                        • contributors/      • enterprise (SSO,
                                          Discord              audit) on demand
   GATE A ───────► GATE B ───────────► GATE C ────────────► GATE D
```

### Gates
- **Gate A (build MVP?):** feasibility spike green + interviews/Show-HN say top-3 pain.
- **Gate B (invest in depth?):** strong activation + **daily-active retention** + star/feedback momentum.
- **Gate C (build cloud/team?):** retention solid + inbound team interest + design partners.
- **Gate D (enterprise?):** repeatable team adoption + NRR > 100% + concrete enterprise demand.

## 4. MVP success criteria (set before building)
| Metric | Target (hypothesis) |
|--------|---------------------|
| Install → first "aha" view | > 60% |
| W1 retention (open again within a week) | > 30% |
| Show HN / Reddit reaction | front-page or strongly positive; many "I needed this" |
| GitHub stars in first month | meaningful traction (set vs. comparable launches) `⟦verify⟧` |
| Qualitative "very disappointed if gone" | > 40% (Sean Ellis) |

## 5. Effort note
A lean local inspector is achievable fast with OSS components ([doc 14](./14-tech-landscape.md)). The hard/uncertain part is the **spike** (reading compaction/memory reliably) — budget for it and treat a partial result as a scope signal, not a failure.

---

*Continue to [14 · Technical Landscape](./14-tech-landscape.md).*

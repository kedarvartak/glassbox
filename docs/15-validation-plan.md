# 15 · Validation Plan

> **Question:** How do we de-risk the dangerous assumptions *before* committing to a full build?
> The most important action doc: it earns the right to build.

## 1. Principle: validate the riskiest assumptions cheapest-first

From [doc 12](./12-risks-assumptions.md), the killers are:
- **A3/A9** — can we technically surface compaction/memory/context data? (*feasibility*)
- **A1** — is this a top-3 pain? (*severity*)
- **A2** — does a local-first inspector earn daily-active use? (*retention*)
- **A5** — does OSS adoption convert to revenue? (*later*)

Unusually for us, the **#1 risk is technical feasibility**, so validation starts with a spike, not interviews.

## 2. Validation gates

| Gate | Question | Pass bar | Method |
|------|----------|----------|--------|
| **Gate A** | Build the MVP at all? | spike green + pain confirmed | Spike + interviews + Show-HN teaser |
| **Gate B** | Invest in depth? | activation + daily retention + momentum | Instrument OSS MVP |
| **Gate C** | Build cloud/team? | retention + inbound team interest | Design partners |
| **Gate D** | Enterprise? | repeatable team adoption + NRR>100% | Live data |

This doc details **Gate A**.

## 3. Gate A — four pre-build experiments

### Experiment 0 — Technical feasibility spike (do this FIRST)
- **What:** Spend a few days actually parsing Claude Code JSONL + Codex store; reconstruct context composition + tokens; detect a compaction event and diff it; read a memory write. ([doc 14](./14-tech-landscape.md))
- **Goal:** Prove A3/A9 — *the data exists and is surfaceable.*
- **Disqualifier:** if compaction/memory are entirely opaque, the differentiated wedge collapses → narrow to "context x-ray + cost" or reconsider.

### Experiment 1 — Problem interviews (severity)
- **Who:** 10–15 daily Claude Code/Codex/Cursor users (Persona 1) + a few builders (Persona 2).
- **Method (Mom Test):** ask about *past* incidents — "tell me about the last time your agent forgot something / your bill spiked / you wondered what was in context. What did you do?"
- **Listen for:** unprompted black-box frustration; do they currently grep JSONL / use ccusage / shrug; would they install a tool.
- **Disqualifier:** "eh, I don't really think about context." (mild annoyance, not top-3 pain).

### Experiment 2 — Demo-GIF / Show-HN teaser (demand + messaging)
- **What:** Build the single most striking view (context x-ray or compaction diff), record a 15–30s GIF, post as a teaser/"building this" on HN/Reddit/X.
- **A/B the framing:** "see what's in your agent's context" vs. "see what your agent forgot (compaction)" vs. "htop for your agent."
- **Measure:** upvotes, comments, "I need this", waitlist/stars on a teaser repo, which framing resonates.
- **Pass bar:** strong qualitative pull + a credible early-interest list.

### Experiment 3 — Tiny OSS drop (the real test)
- **What:** Release the P0 local inspector (Experiment 0 productized) as an OSS repo with a great README + GIF; soft Show HN.
- **Goal:** measure **activation** (install → aha) and **W1 retention** (A2) — the truth metric.
- **Disqualifier:** people star but don't return (vanity without retention).

## 4. Decision rule (honest in advance)
> REC **Pass Gate A only if: the spike is green (data is surfaceable) AND interviews/Show-HN confirm top-3 pain AND the OSS drop shows real activation + early retention.** If the spike is partial, narrow the wedge. If pain is mild or retention is flat, **the cheapest win is not building the full platform.**

## 5. Post-launch validation (Gates B–D)
Instrument from day one ([doc 11 metrics](./11-go-to-market.md)): activation, DAU/WAU retention, contributors, stars (social proof only), then free→paid/usage/NRR once cloud exists. Run the Sean Ellis PMF survey.

## 6. Timeline (illustrative, ~5–7 weeks pre-full-build)
| Week | Activity |
|------|----------|
| 1 | **Feasibility spike** (Exp 0) + start interviews |
| 2–3 | Finish interviews; build the hero view + demo GIF (Exp 2) |
| 3–5 | Polish + OSS drop (Exp 3); soft launch; measure |
| 6 | Synthesize → **Gate A decision** |

## 7. What a "no" saves you
Weeks + near-zero cost instead of months building observability nobody opens twice — the #1 pre-mortem failure ([doc 12](./12-risks-assumptions.md)). A "no" here is a successful outcome.

---

*Continue to [16 · Glossary & Sources](./16-glossary-and-sources.md).*

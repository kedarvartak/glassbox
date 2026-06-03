# 12 · Risks & Assumptions

> **Question:** What must be true for this to work — and what could kill it?

## 1. Assumption ledger

Rated by **Impact** (if wrong, how bad) and **Confidence** (how sure today). Danger zone = High impact + Low confidence → validate first.

| # | Assumption | Impact | Confidence | Action |
|---|------------|:------:|:----------:|--------|
| A1 | Agent memory/context opacity is a **top-3 pain**, not a mild annoyance |  High |  Med | **Validate (interviews + Show HN)** |
| A2 | A **local-first inspector** drives **daily-active** use (retention) |  High |  Med | **Validate (MVP retention)** |
| A3 | We can **reliably read** Claude Code / Codex sessions, compaction, memory |  High |  Med | **Spike early (feasibility)** |
| A4 | Agent **internal formats are stable enough** to maintain adapters |  Med |  Low | **Validate + design for churn** RISK |
| A5 | OSS adoption converts to **team/cloud revenue** |  High |  Low | Validate post-adoption |
| A6 | **Cross-tool** matters (devs use multiple agents) |  Med |  Med | Validate (interviews) |
| A7 | Platforms **won't quickly** ship deep native inspectors |  Med |  Med | Monitor; build moat fast |
| A8 | Small team can ship a credible local tool fast |  Med |  High | Low concern |
| A9 | Compaction visibility is **technically surfaceable** (data exists) |  High |  Med | **Spike early** |

> REC The three that can kill it: **A1 (is it top-3 pain), A2 (does local-first retain), A3/A9 (can we even surface compaction/memory data).** A3/A9 are *technical feasibility* — spike them in week 1 before anything else.

## 2. Risk register

| Risk | Type | Likelihood | Impact | Mitigation / signal |
|------|------|:----------:|:------:|---------------------|
| **Platform ships native inspector** | Market | Med | High | Cross-tool + deeper + loved first. Signal: vendor ships it |
| **Format/internals churn breaks us** | Technical | High | Med | Adapter abstraction, tests, community adapters. Signal: breakage after updates |
| **Can't access compaction/memory data** | Technical | Med | High | Week-1 feasibility spike; fall back to what's readable. Signal: spike fails |
| **"Nice not need" → weak retention** | Market | Med | High | Validate top-3 pain; lead with painkiller views. Signal: low DAU |
| **Incumbents extend to memory** | Market | Med | Med | Own memory-lifecycle identity + community. Signal: feature announcements |
| **OSS adoption, no revenue** | Business | Med | High | Open-core team value; design wall early. Signal: stars up, conversion flat |
| **Privacy/trust (handling sessions/keys)** | Operational | Low | High | Local-first, no exfiltration, open code, clear policy. Signal: any incident |
| **Solo bandwidth / scope creep** | Execution | Med | Med | Ruthless P0; don't become "another tracer". Signal: slipping launch |

## 3. Pre-mortem — "It's 2027 and Glassbox failed. Why?"
1. **"We couldn't reliably surface compaction/memory data, so it was just another cost tool."** → A3/A9 not spiked early. **Most likely technical death.**
2. **"It was cool but people didn't open it twice."** → A2; nice-to-have, not painkiller.
3. **"Anthropic shipped a context inspector and we hadn't built a moat."** → A7; too slow.
4. **"Adapters broke every update and we drowned in maintenance."** → A4.
5. **"Tons of stars, no revenue."** → A5; monetization unproven.

> REC Pre-mortem takeaway: **de-risk technical feasibility (compaction/memory access) and pain-severity (top-3?) before building the full product.** Both are cheap to test.

## 4. OK-to-be-wrong (low stakes)
- Exact name/branding, tagline, which 3rd/4th tool adapter ships first, cloud pricing details.

---

*Continue to [13 · MVP Scope & Roadmap](./13-mvp-scope-roadmap.md).*

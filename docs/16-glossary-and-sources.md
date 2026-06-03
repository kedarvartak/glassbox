# 16 · Glossary & Sources

> Shared vocabulary + an honest note on where numbers come from and what to verify.

## 1. Glossary

### Domain terms
- **Context window:** the tokens the model "sees" on a given turn (system prompt, history, files, tool outputs, memory, MCP content).
- **Context composition:** the breakdown of what's occupying the window, by source and token size. Glassbox's "x-ray."
- **Compaction / summarization:** when an agent compresses/replaces older context (often a summary) to stay within the window — and may silently drop detail. The core "black hole" moment.
- **Memory:** persisted information across turns/sessions — e.g., `CLAUDE.md`, memory tools, or external layers (mem0/Letta/Zep).
- **Recall:** the agent reading from memory into context.
- **Cross-session persistence:** what carries from one session to the next vs. what's lost.
- **Transcript / session store:** on-disk record of a session (e.g., Claude Code JSONL under `~/.claude/projects/`).
- **Prompt caching:** provider caching of repeated prompt prefixes to cut cost/latency; has a TTL (Anthropic ~5 min) — cache misses cost money. `⟦verify⟧`
- **MCP (Model Context Protocol):** standard by which tools/resources feed context to an agent.
- **Token attribution:** mapping token spend to its causes (which files/tools/memory).
- **OTel (OpenTelemetry):** the observability standard; the interop path for the builder/SDK use case.
- **Adapter:** per-tool module translating a specific agent's storage/format into Glassbox's normalized event model.

### PM / strategy terms
- **TAM/SAM/SOM:** Total / Serviceable Available / Serviceable Obtainable Market.
- **JTBD:** Jobs To Be Done — people "hire" a product to make progress ([doc 07](./07-jobs-to-be-done.md)).
- **Beachhead:** the single initial segment you dominate before expanding ([doc 06](./06-target-personas.md)).
- **Open-core:** OSS core + paid cloud/enterprise (our model, [doc 09](./09-pricing-monetization.md)).
- **OSS-LG:** Open-Source-Led Growth ([doc 11](./11-go-to-market.md)).
- **Painkiller vs. vitamin:** must-have (acute/frequent/expensive pain) vs. nice-to-have.
- **Activation / Retention / DAU-WAU:** reached first value / came back / daily-weekly actives.
- **NRR:** Net Revenue Retention (expansion-driven).
- **PMF:** Product-Market Fit; Sean Ellis test (>40% "very disappointed" to lose it).
- **Pre-mortem:** imagining failure to surface risks ([doc 12](./12-risks-assumptions.md)).
- **The Mom Test:** ask about past behavior/facts, not hypotheticals.

## 2. Source & methodology note (read before quoting numbers) 

**These docs were assembled from the assistant's general knowledge as of training — NOT live research, primary interviews, or data pulls.** Treat all quantitative claims and competitor specifics as **directional and provisional.**

### Reliable here
- The **strategic framework** (clusters, gaps, JTBD, beachhead, risk structure, validation, OSS/funding playbook) — sound and transferable.
- The **qualitative competitive read** — directionally robust; specifics drift fast in this space.

### MUST verify (`⟦verify⟧`)
| Claim type | Where to verify |
|------------|-----------------|
| Market size (LLMOps/observability/devtools) | Industry reports (Gartner/IDC/independent), analyst notes |
| Competitor features/funding/stars | Each project's GitHub + site + Crunchbase (changes weekly) |
| Agent storage internals (Claude Code/Codex/Cursor paths, JSONL schema, compaction behavior) | **The Week-1 feasibility spike** ([doc 13](./13-mvp-scope-roadmap.md)) — inspect them directly |
| Prompt-cache TTL/behavior | Provider docs |
| Developer-population / agent-usage numbers | Vendor disclosures, surveys (e.g., Stack Overflow / JetBrains dev surveys) |
| OSS conversion benchmarks | OpenView/devtool reports + your own data |

### Recommended primary research next
1. **The feasibility spike** — the single most important fact-find; inspect the actual on-disk formats.
2. **10–15 problem interviews** with daily agent users.
3. A live competitor/star teardown to refresh [doc 02–04].

## 3. Document map
| Need… | Go to |
|-------|-------|
| Recommendation | [00](./00-executive-summary.md) |
| Market | [01](./01-market-overview.md) |
| Competitors | [02](./02-competitor-landscape.md), [03](./03-competitor-deep-dives.md), [04](./04-feature-comparison-matrix.md) |
| Where to win | [05](./05-market-gaps-opportunities.md) |
| Who/why | [06](./06-target-personas.md), [07](./07-jobs-to-be-done.md) |
| Stand out | [08](./08-positioning-differentiation.md) |
| Earn | [09](./09-pricing-monetization.md) |
| Honest read | [10](./10-swot.md) |
| Grow | [11](./11-go-to-market.md), [18](./18-github-growth-and-fundraising.md) |
| Could kill it | [12](./12-risks-assumptions.md) |
| Build | [13](./13-mvp-scope-roadmap.md), [14](./14-tech-landscape.md) |
| De-risk | [15](./15-validation-plan.md) |
| Execute | [17](./17-phased-execution-plan.md) |

---

*Continue to [17 · Phased Execution Plan](./17-phased-execution-plan.md).*

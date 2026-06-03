# 06 · Target Personas & Segments

> **Question:** Who exactly are we for — and which one do we build for *first*?
> Goal: force a **beachhead** choice (a deliberate exclusion).

---

## Persona 1 — "Devon," the daily coding-agent power user REC candidate

- **Role:** Software engineer who runs Claude Code / Codex / Cursor / Cline **many hours a day**.
- **Context:** Long sessions, big repos, hits compaction constantly, watches token spend, occasionally rage-quits when the agent "forgets."
- **Pain:** "What's in my context? Why did it forget? What did compaction drop? What am I paying for?" — the black hole, felt daily.
- **Hires us to:** "Let me *see* and trust what my agent is doing with context & memory."
- **WTP:** Low individually (expects free OSS) — but **high-value as a funnel**: stars, word of mouth, and pulls us into their team.
- **Where to find:** Hacker News, r/LocalLLaMA + r/ClaudeAI + r/ChatGPTCoding, dev Twitter/X, Claude/agent Discords, GitHub.
- **Why attractive:** **Founder-pain match** (this is *our* pain), zero behavior change, cheaply reachable, drives OSS adoption. OPP

## Persona 2 — "Mira," the agent-app builder REC candidate (parallel/expansion)

- **Role:** Engineer building agentic features/products on Agent SDKs, LangGraph, mem0, etc.
- **Context:** Ships agents to users; debugging *why an agent behaved a certain way* is brutal; needs memory/context observability in dev and prod.
- **Pain:** "My agent gave a wrong answer — was it bad memory, lost context, or a bad tool call?" Hard to reproduce/debug.
- **Hires us to:** "Give me observability into my agent's memory/context so I can debug and improve it."
- **WTP:** Medium–high (team budgets, prod tooling). The **monetization segment.**
- **Where to find:** Same channels + LLMOps communities, agent framework Discords.
- **Why attractive:** Real revenue; but higher feature bar (SDK, cloud, prod) → later.

## Persona 3 — "Sam," the AI-curious builder / indie hacker

- **Role:** Solo dev / indie experimenting with agents.
- **Pain:** Curiosity + cost-control; wants to understand what's happening.
- **WTP:** Low. Great for buzz/virality, weak for revenue. Growth fuel, not beachhead-for-revenue.

## Persona 4 — "Ops/Platform team running agents in prod"

- **Role:** Platform/ML-platform/SRE team supporting agents internally.
- **Pain:** Reliability, cost governance, audit of agent behavior at scale.
- **WTP:** High; long cycles, heavy requirements (SSO, self-host, audit).
- **Why attractive:** Enterprise money, **wrong for pre-PMF.** Explicitly *later*. RISK if chased early.

---

## Beachhead scoring (1–5, higher = better beachhead)

| Persona | Pain acuity | WTP | Reachability | Behavior-change (low=better) | Influence/virality | **Weighted** |
|---------|:-:|:-:|:-:|:-:|:-:|:-:|
| 1 · Devon (daily agent user) | 5 | 2 | 5 | 5 | 5 | ** 4.5** |
| 2 · Mira (agent builder) | 4 | 4 | 4 | 3 | 4 | **3.9** |
| 3 · Sam (indie) | 3 | 1 | 4 | 5 | 4 | 3.3 |
| 4 · Platform/prod team | 4 | 5 | 2 | 2 | 2 | 2.9 |

> REC **Beachhead: Persona 1 (daily coding-agent power users)** via a free, local-first OSS tool — they generate stars, feedback, and word of mouth, and *become* Persona 2's teams. **Persona 2 (agent builders)** is the parallel/monetization expansion. Personas 3 (fuel) and 4 (enterprise) are deliberately *later*.
>
> The discipline: choosing Devon means **not** building cloud/SSO/prod features first, even though Persona 4 would pay more.

---

## Anti-personas (NOT at launch)
- Teams wanting a full **LLM eval/experimentation** platform → that's Braintrust/LangSmith.
- Teams wanting a **memory backend to adopt** → that's mem0/Letta (we *observe*, not replace).
- Non-technical users → not our user.

Naming these keeps positioning sharp and prevents scope creep.

---

*Continue to [07 · Jobs To Be Done](./07-jobs-to-be-done.md).*

# 11 · Go-To-Market Strategy

> **Question:** How do we get the first 100 → 1,000 → 10,000 users cheaply?
> GTM = **open-source, community-led, developer-first.** The detailed GitHub-boom + fundraising tactics live in [doc 18](./18-github-growth-and-fundraising.md); this is the strategy that frames them.

## 1. Core motion: Open-Source-Led Growth (OSS-LG)

For a local-first developer tool against a $0 anchor, **OSS + community is the only sane primary motion.** The repo *is* the product, the marketing, and the credibility.

```
   Discover (Show HN, demo GIF, Reddit, X, awesome-lists)
        │
        ▼
   Install (one command, local, <2 min to "whoa")
        │
        ▼
   Share  ◄── screenshot-worthy insights = organic ads
        │
        ▼
   Star + return daily (habit; agent acts weird → open Glassbox)
        │
        ▼
   Adopt at work → Team/Cloud (monetization)
```

> REC The growth engine is **"holy cow, look what was in my context" screenshots** + **stars as social proof.** Engineer the product to produce shareable moments (the context x-ray, the compaction diff).

## 2. The viral/community loop, concretely
1. Dev installs, runs it on a real session → instantly sees something surprising.
2. They screenshot it / tweet it / star the repo.
3. Others see it → "Show HN" and threads compound → more stars → top of GitHub trending.
4. Stars → credibility → more installs → contributors → adapters for more tools → wider reach.

## 3. Channels, ranked for our beachhead

| Channel | Fit | Why | Cost |
|---------|-----|-----|------|
| **Hacker News (Show HN)** | REC High | Where Persona 1 lives; a great agent-debugging demo travels | Low |
| **GitHub itself** (README, trending, topics, awesome-lists) | REC High | The repo is the storefront ([doc 18](./18-github-growth-and-fundraising.md)) | Low |
| **Reddit** (r/ClaudeAI, r/ChatGPTCoding, r/LocalLLaMA) | High | Concentrated agent users | Low |
| **Dev Twitter/X + build-in-public** | High | Demo GIFs spread; founder-pain narrative | Low |
| **Agent/LLM Discords & communities** | Med–High | Direct access to power users | Low |
| **Content/SEO** ("what's in my Claude Code context", "Claude Code compaction", "agent token cost") | Med | High-intent searches | Slow-build |
| **Integrations/ecosystem** (MCP, OTel, mem0/Letta, framework plugins) | Med | Distribution via others | Med effort |
| **Product Hunt** | Med | Secondary spike | Low |
| **Paid ads** |  early | Poor fit for OSS devtool | High |

## 4. Phased GTM

### Phase 0 — Pre-launch (validation)
- Build-in-public thread; teaser demo GIF; collect interested devs.
- 10–15 problem interviews (Persona 1) + watch existing forum complaints.

### Phase 1 — First 100–1,000 (the OSS launch)
- Ship the local inspector (context x-ray + compaction diff) as a polished OSS repo.
- **Show HN** + Reddit + X with a killer demo GIF.
- Goal: stars, installs, and "I needed this" reactions; instrument activation + retention.

### Phase 2 — First 1,000–10,000 (depth + habit)
- Add memory timeline, more tool adapters, persistence view.
- Nurture contributors + Discord; ship integrations.
- Begin Cloud/Team beta with design partners.
- Goal: daily-active retention + first paying teams.

### Phase 3 — Scale + revenue
- Cloud/Team GA; observe-mem0/Letta; enterprise conversations.
- Goal: NRR, repeatable team adoption.

## 5. Activation principles
- **Time-to-wow < 2 minutes:** `npx`/one-command install → point at your latest session → instant x-ray. No signup, no cloud.
- **The demo GIF is the pitch** — a 15-second "watch me find what ate my context" loop.
- **Local-first = trust** — say loudly: your sessions/keys never leave your machine.

## 6. Metrics dashboard
| Stage | Metric | Why |
|-------|--------|-----|
| Acquisition | GitHub stars, repo traffic, install count | Reach/credibility (stars = vanity but social proof) |
| Activation | % installs reaching first "aha" view | Onboarding quality |
| Retention | DAU/WAU, repeat opens, returning installs | Real value (the metric that matters most) |
| Community | contributors, Discord members, issues/PRs | Moat health |
| Revenue | team signups, free→paid, usage, NRR | Business viability |

> REC **Retention (do they open it again when the agent acts weird?) is the truth metric.** Stars are for fundraising/social proof; retention proves painkiller.

---

*Continue to [12 · Risks & Assumptions](./12-risks-assumptions.md).*

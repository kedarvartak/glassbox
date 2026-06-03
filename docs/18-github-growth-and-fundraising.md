# 18 · GitHub Boom, Marketing & Fundraising Playbook

> **Question:** How do open-source developer tools actually "blow up" on GitHub, get marketed, and raise money — and how do *we* do it for Glassbox?
> This is the concrete, tactical "how do people do this" doc. Pairs with [doc 11 · GTM](./11-go-to-market.md) (strategy) and [doc 09 · Pricing](./09-pricing-monetization.md) (open-core model).

---

## PART A — How OSS dev tools boom on GitHub

### A0. The honest mental model first 

> **Stars are social proof, not success.** They help fundraising and credibility, but a repo with 20k stars and no daily users is a failed product. The real metric is **retention** (do people run it again?) and, later, **revenue**. Optimize stars *because they fuel the funnel*, never as the goal. ([doc 11 metrics](./11-go-to-market.md))

The causal chain that actually works:
```
 Real painkiller  →  a 15-sec "whoa" demo  →  a great README  →  a strong launch
   (doc 05/07)        (the GIF)               (the storefront)    (Show HN/Reddit/X)
        →  stars + installs  →  contributors + integrations  →  more reach  →  repeat
        →  (separately) retention proves it's real  →  revenue  →  fundraising
```

### A1. The repo *is* the product page — make it elite
- **README that sells in 10 seconds:** one-line value prop at the very top → an **animated GIF/demo** of the aha moment → 3-line "why it exists" → **copy-paste quickstart that works in <2 min** → screenshots → feature bullets → comparison → docs link → contributing/Discord.
- **The demo GIF is the single highest-leverage asset.** For Glassbox: a 15–30s loop of "long session acting weird → run Glassbox → *see* what compaction dropped / what ate the context." This is what gets screenshotted and reshared.
- **Frictionless quickstart:** `npx glassbox` (or one curl/pip/brew line) → instant value, no signup, no cloud. Every extra step halves conversion.
- **Polish signals seriousness:** clean logo, consistent naming, a real docs site (Docusaurus/Mintlify/Starlight), badges (build, version, license, Discord), GIFs in docs.
- **GitHub hygiene for discovery:** rich **topics/tags**, a crisp repo description, pinned good-first-issues, a `CONTRIBUTING.md`, issue/PR templates, a changelog, semantic releases.

### A2. Pick the license deliberately
- **Permissive (MIT/Apache-2.0):** maximizes adoption & trust; standard for dev tools. Best for the **free local inspector**.
- **Copyleft/Source-available (AGPL / BSL / SSPL):** protects against cloud players reselling you; common for open-core companies (some adopt it for the server, MIT for clients).
- REC **Likely: permissive (Apache-2.0) for the local inspector + adapters** (drive adoption), and decide the **cloud/server** license later (consider AGPL/BSL) when commercial value concentrates there. Get this right early — relicensing later is painful and trust-damaging.

### A3. The launch (the spike that seeds the flywheel)
- **Primary: "Show HN" on Hacker News.** Post in the morning US time, with a clear title, a comment from you explaining the *why/founder-pain*, the GIF, and a live repo. Be present all day to answer every comment. A front-page Show HN can mint thousands of stars + the first real users. `⟦verify⟧`
- **Same week, stagger:** relevant subreddits (r/ClaudeAI, r/ChatGPTCoding, r/LocalLLaMA), X/Twitter thread with the GIF, Lobsters, dev Discords, LinkedIn. Don't blast all at once — sequence so you can iterate the pitch.
- **Product Hunt:** a secondary spike; good for a broader/less-technical wave.
- **Launch readiness checklist:** repo polished, quickstart tested on a clean machine, GIF ready, docs live, Discord open, an FAQ for predictable HN objections ("how is this different from Langfuse/ccusage?" — answer in the README).

### A4. Sustain after the spike (where most projects die)
- **Ship visibly & often:** weekly releases, public roadmap, respond to issues fast. Momentum compounds; silence kills.
- **Community:** open a Discord; convert users → contributors with good-first-issues and a friendly `CONTRIBUTING.md`; thank contributors publicly.
- **Content/SEO engine:** write the posts your users search for — "what's actually in your Claude Code context", "understanding Claude Code compaction", "cutting agent token costs", "debugging agent memory." Rank for intent.
- **Integrations = distribution:** adapters for more agents, OTel export, plugins for mem0/Letta — each opens a new audience and gets you into *their* docs/awesome-lists.
- **Get on the maps:** awesome-* lists (awesome-llmops, awesome-ai-agents, awesome-claude), comparison pages, and reviews.
- **Build-in-public:** share metrics, learnings, and roadmap openly — it earns goodwill and a following ([doc 11](./11-go-to-market.md)).

### A5. What NOT to do 
- Don't buy stars / fake traction (detectable, reputation-ending).
- Don't launch before the quickstart genuinely works (<2 min) — a broken first run wastes your one launch.
- Don't cripple the free tool to force upgrades (OSS resentment kills the funnel).
- Don't ignore the first 50 users — they're your design partners and evangelists.

---

## PART B — Marketing (beyond the launch)

| Lever | For Glassbox |
|-------|--------------|
| **Demo-driven** | Every feature gets a GIF; the product *generates* shareable artifacts (x-ray/compaction screenshots) |
| **Founder narrative** | "I was tired of my agent being a black box, so I built an x-ray for it." Authentic founder-pain travels |
| **SEO/content** | Own the long tail of agent-context/memory/cost queries |
| **Community-led** | Discord + contributors + responsiveness = retention + word of mouth |
| **DevRel** | Talks/streams on agent context engineering; meetups; podcast guesting |
| **Ecosystem PR** | Co-marketing with framework/memory projects you integrate |
| **Comparison content** | Honest "Glassbox vs. X" pages capture high-intent searchers |

> REC Marketing for a dev tool is **showing, not telling.** The product's "whoa" moment + an honest founder doing it in public beats any ad. Keep paid ads off the table until revenue is proven.

---

## PART C — Fundraising (how devtool founders actually raise)

### C1. Do you even need to raise?
- **Bootstrap-friendly:** small team, OSS, low infra early. You may not need money until the cloud/team push (Phase 3).
- **Raise when:** you have **traction** (stars + DAU + design partners + early revenue) and want to accelerate (hire, cloud, GTM) faster than revenue allows. Raising *on traction* gets far better terms than raising *on an idea*. REC

### C2. What investors in OSS/devtools actually look at
| Signal | Why it matters | Glassbox proxy |
|--------|----------------|----------------|
| **Adoption velocity** | OSS = distribution moat | star growth *rate*, install/DAU curve |
| **Retention** | proves painkiller | W1/W4 repeat usage |
| **Community** | defensibility | contributors, Discord, PRs |
| **Bottoms-up pull** | path to revenue | teams adopting; inbound "can we pay for X" |
| **Early revenue / design partners** | monetization proof | cloud beta conversions, LOIs |
| **Founder-market fit** | execution risk | you live the pain + ship fast |
| **Market timing** | TAM/now | the agent explosion ([doc 01](./01-market-overview.md)) |

>  Stars alone don't raise rounds anymore — investors know they're gameable. **Stars get the meeting; retention + bottoms-up pull get the term sheet.**

### C3. Funding stages & who to talk to
- **Pre-seed/Seed** is the relevant stage. Sources: **angels** (esp. devtool/OSS founders & operators), **accelerators** (e.g., YC and devtool-focused programs), and **early-stage/devtool-focused VCs** `⟦verify⟧` (firms known for OSS/devtools/infra — e.g., the a16z/Sequoia/Boldstart/Uncork/Decibel/Heavybit/Essence/Amplify *type* — verify current thesis & partners before reaching out).
- **Warm intros >>> cold outreach.** Get introduced via other founders they've funded, angels, or your community. Build relationships *before* you need money.
- **Accelerators** are worth it for first-time founders: network, intros, demo day, a credibility stamp — weigh the equity cost.

### C4. The narrative & deck (devtool seed)
A tight ~10–12 slide deck:
1. **One-liner** — "Observability for AI agent memory & context."
2. **Problem** — the black box; make them *feel* it (a real failure story).
3. **Why now** — agent explosion; observability lagging memory ([doc 01](./01-market-overview.md)).
4. **Product** — the demo GIF; the x-ray/compaction diff.
5. **Traction** — stars curve, DAU, retention, contributors, design partners (the slide that matters most).
6. **Market** — TAM/SAM/SOM ([doc 01](./01-market-overview.md), verified).
7. **Business model** — open-core; how free → cloud → enterprise ([doc 09](./09-pricing-monetization.md)).
8. **Competition** — the positioning grid ([doc 02/08](./08-positioning-differentiation.md)); why incumbents structurally can't.
9. **GTM** — OSS-led growth ([doc 11](./11-go-to-market.md)).
10. **Team** — founder-market fit (you live the pain).
11. **The ask** — amount, runway (typically 18–24 mo), milestones it buys (e.g., cloud GA + N paying teams).
12. (Appendix) metrics detail.

> REC The deck's job is to make the **traction + founder-market-fit + timing** undeniable. For OSS, *show the curves*. Numbers in any external deck must be **verified live**, not the directional figures in these docs ([doc 16](./16-glossary-and-sources.md)).

### C5. Metrics to have ready (the data room)
- Star history (and *rate*), unique installs/downloads, DAU/WAU, retention cohorts, contributor count, Discord size, issue response time, cloud beta signups/conversion, any revenue/LOIs, infra cost per user.

### C6. Sequencing (ties to [doc 17](./17-phased-execution-plan.md))
- **Phase 0–1:** build pain proof + launch; **don't raise yet** (no leverage).
- **Phase 2:** retention + community + design partners — start *relationships* with investors (not asks).
- **Phase 3:** raise the seed on the traction curve to fund cloud + GTM.

---

## PART D — 90-day "boom" checklist (if Gate A passes)

| Window | Do |
|--------|-----|
| Pre-launch | Polish repo + README + **demo GIF**; test quickstart on a clean machine; pick license; set up Discord + docs + analytics |
| Launch week | **Show HN** (morning, be present all day) → staggered Reddit/X/Lobsters/Discords; answer every comment; ship fixes same-day |
| Weeks 2–6 | Weekly releases; publish 2–4 SEO posts; convert first contributors; get on awesome-lists; nurture first 50 users |
| Weeks 6–12 | Add an integration or new adapter (new audience); start build-in-public metrics; open relationships with a few investors (no ask yet) |

---

*Back to [README](./README.md) · Related: [11 · GTM](./11-go-to-market.md), [09 · Pricing](./09-pricing-monetization.md), [17 · Phased Plan](./17-phased-execution-plan.md).*

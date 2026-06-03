# 09 · Pricing & Monetization

> **Question:** How do we make money as an open-source developer tool?
> Read alongside [doc 18 · OSS growth & fundraising](./18-github-growth-and-fundraising.md) — the model and the GTM are intertwined.

## 1. The core tension 

Developer tools — especially OSS — are **expected to be free**. The local inspector that wins Persona 1 will likely be free forever. So revenue must come from **(a) teams** (collaboration, cloud, prod) and **(b) enterprise** (self-host support, SSO, compliance). This is the **open-core** model.

> REC Monetize the *team/prod/enterprise outcome* (shared observability, governance, debugging at scale), **not** the local inspector. The free OSS tool is the top-of-funnel and the distribution engine.

## 2. The proven model: open-core (cf. Langfuse, PostHog, Sentry)

```
   FREE / OSS (self-host, local)        →   CLOUD (hosted, team)        →   ENTERPRISE
   local inspector, single-user,            shared dashboards, history,      SSO, audit, self-host
   community support                        team features, usage-based       support, SLA, data
   (adoption + stars + funnel)              (where SMB revenue starts)        residency (big deals)
```

| Tier | Price (hypothesis) | Who | Included | Upgrade wall |
|------|--------------------|-----|----------|--------------|
| **OSS / Local** | $0 | Persona 1, indies | Local inspector, all core x-ray/compaction/memory views, single user | Want shared/cloud/history/team |
| **Cloud / Team** | ~$20–50/seat/mo or usage-based `⟦verify⟧` | Persona 2 teams | Hosted dashboards, retained history, shared sessions, SDK ingestion, alerting | Need SSO/compliance/scale |
| **Enterprise** | Custom (annual) | Persona 4 | Self-host support, SSO, audit, data residency, SLA, priority support | — |

> All prices are **hypotheses to test** ([doc 15](./15-validation-plan.md)), not commitments.

## 3. Candidate value metrics (what we charge *per*)

| Value metric | Pro | Con |
|--------------|-----|-----|
| Per seat | Predictable, standard | Can throttle team spread |
| Usage-based (events/sessions ingested, retention) | Aligns with value; scales with prod agents | Less predictable bills |
| Hybrid (seats + usage) | Common for observability | Slightly complex |

> REC Likely **hybrid**, mirroring observability norms: a per-seat base + usage for ingested/retained agent telemetry. Keep the **local/self-host tool generous** to protect adoption.

## 4. Why open-core works *here* specifically
- The **local-first inspector** is genuinely useful alone → mass adoption → stars → distribution (the [doc 18](./18-github-growth-and-fundraising.md) flywheel).
- **Teams/prod** naturally need what local can't give: shared history, collaboration, alerting, prod ingestion → clean upgrade wall.
- OSS builds **developer trust** (you can read the code that touches your sessions/keys) — critical when handling sensitive context/data.

## 5. Pricing psychology / levers
- **Don't cripple the free tool** — OSS resentment kills the funnel. Gate on *team/cloud/scale*, not core local value.
- **Anchor cloud against the cost of debugging blind / wasted tokens / incidents**, not against free.
- **Usage metering on prod ingestion** captures the builder segment fairly.
- **Annual enterprise** for cash flow + retention.
-  Never monetize by selling/inspecting user data — it would destroy the local-first/trust positioning. RISK

## 6. Unit-economics guardrails (build the model)
- **CAC** — should be low via OSS/community/content; paid ads are a poor fit early.
- **Free→paid (team)** — model conservatively (low single-digit % of active OSS teams). `⟦verify⟧`
- **LTV:CAC ≥ 3**, **payback < 12mo**.
- **NRR** — usage expansion as customers ship more agents is the SaaS compounding story.
- Watch **infra/storage cost** of retaining agent telemetry (can be heavy) — meter it.

## 7. Monetization risks (→ [doc 12](./12-risks-assumptions.md))
- Local tool is "good enough" for most → weak conversion. Mitigate with genuinely team-only value.
- Platform vendors bundle observability free → pressures pricing.
- Self-host enterprises may never pay → make support/compliance the paid value.

---

*Continue to [10 · SWOT](./10-swot.md).*

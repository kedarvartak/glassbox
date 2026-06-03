# 07 · Jobs To Be Done (JTBD)

> **Question:** What job do people *hire* Glassbox to do — and what do they "fire"?
> Frame: **When** [situation], **I want to** [motivation], **so I can** [outcome].

## Primary jobs

### Job 1 — "Show me what's actually in my context right now"
> **When** my agent session has gone long and is behaving oddly or getting expensive, **I want to** see exactly what's occupying the context window (by source + token size), **so I can** understand and control what the model is actually working with.

- **Currently hired:** a raw token meter, eyeballing, grepping JSONL, or nothing.
- **Struggle moments:** "why is every turn 80k tokens?", "what's even in here?"
- **Our angle:** the context x-ray. REC #1 hero feature.

### Job 2 — "Tell me what compaction/summarization dropped"
> **When** the agent suddenly 'forgets' something we established earlier, **I want to** see what the last compaction removed or rewrote, **so I can** know whether to re-supply it and trust the agent again.

- **Currently hired:** guessing; scrolling back; re-explaining.
- **Our angle:** the compaction diff. REC sharpest wedge — *the* black-hole moment.

### Job 3 — "Show me my agent's memory: what it saved, recalled, and kept"
> **When** I rely on the agent remembering things across turns/sessions, **I want to** see what it wrote to / recalled from memory and what persisted, **so I can** trust (or fix) its long-term behavior.

- **Currently hired:** opening CLAUDE.md/memory files manually; hoping.
- **Our angle:** the memory timeline + persistence view.

### Job 4 — "Tell me where my tokens/money went and why"
> **When** my agent bill or token use spikes, **I want to** attribute cost to *what* (which files, tool outputs, cache misses, memory), **so I can** cut waste.

- **Currently hired:** ccusage (totals), provider dashboards.
- **Our angle:** cost tied to *context composition* — actionable, not just totals.

### Job 5 — "Help me debug why my agent did the wrong thing" (builders)
> **When** my shipped agent misbehaves, **I want to** inspect its memory/context state at that moment, **so I can** tell if it was lost context, bad memory, or a bad tool call — and fix it.

- **Currently hired:** trace tools (call-level, not memory-state-level), print debugging.
- **Our angle:** memory/context state observability for builders. The monetization job.

## Functional / emotional / social

| Dimension | What the user gets |
|-----------|--------------------|
| **Functional** | They see/understand/control context & memory; debug faster; spend less |
| **Emotional** | **Relief from the black-box anxiety** — "I finally know what's happening" (this is strong here) |
| **Social** | Screenshot-worthy insights ("look what was eating my context") → sharing → virality |

> REC The **emotional** payoff (replacing anxiety/confusion with clarity) is unusually strong for a dev tool — lean into it in messaging.

## Switching triggers (design onboarding around these)
1. **"The agent just forgot something important."** → compaction diff. (acute, frequent)
2. **"My token bill spiked."** → cost-by-composition.
3. **"Every turn is huge and slow — what's in here?"** → context x-ray.
4. **"My shipped agent did something inexplicable."** → memory/context state debug (builders).

> REC Trigger #1 + #3 are the highest-frequency, lowest-consideration moments — make the path from "weird agent behavior" → "open Glassbox → instant clarity" take seconds.

## What users "fire"
- Fire: grepping `~/.claude/projects/**.jsonl` by hand.
- Fire: re-explaining things the agent "forgot."
- Fire: flying blind on token spend.
- Fire: print-debugging agent memory in their own app.

> The competitor isn't Langfuse — it's **manual JSONL spelunking and shrugging.**

---

*Continue to [08 · Positioning & Differentiation](./08-positioning-differentiation.md).*

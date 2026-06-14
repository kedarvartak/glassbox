# Guided compaction — the architecture

This is the architectural decision for how Glassbox compacts. It builds on
[guided-compaction.md](guided-compaction.md), which introduced the vocabulary
(disposition, the manifest, the boundary, the synthetic preamble). That doc
answered *what the pieces are*. This one answers *how they fit together*, and
why — measured against how the rest of the field solves the same problem.

The goal is stated plainly: **keep the maximum amount of what the agent actually
needs, delete only what it provably or near-provably does not, and never let a
model rewrite a fact it could get wrong.** Accuracy first, size second.

## What the field taught us

Seven teams shipped seven different compactors in late 2025 / early 2026. Read
across them and the disagreements are loud, but the *findings* underneath are
remarkably consistent, and they point one direction.

- **Compression ratio is a vanity metric.** Factory.ai benchmarked 36,000
  production messages: OpenAI, Anthropic, and Factory all compress to ~99%, and
  the ratio predicts nothing about quality. What separates them is *what
  survives*. Instruction-following survives almost perfectly (4.9/5 across the
  board). **Artifact tracking is broken** (2.2–2.45/5): models forget which
  files they changed, what error codes they saw, what signatures they modified.
  The narrative lives; the operational specifics die.
- **Bigger models are worse compressors.** The LLM Scaling Paradox names two
  mechanisms that worsen with scale: *knowledge overwriting* (the model replaces
  a stated fact with a learned prior — "white strawberry" becomes "red") and
  *semantic drift* (paraphrase flips meaning — "Alice hit Bob" becomes "Bob hit
  Alice"). You cannot buy your way out of bad compaction with a bigger model.
- **Verbatim beats summary on accuracy.** Morph deletes tokens instead of
  rewriting them: lower ratio (50–70%), but 98% verbatim accuracy and zero
  hallucination risk. The Complexity Trap paper (NeurIPS 2025) found that simply
  masking old observations — deleting stale tool outputs while keeping the
  reasoning chain — matches or beats LLM summarization on SWE-bench Verified,
  with no model call at all. The reasoning is the asset; observations are
  re-derivable. "You can re-read files. You can't reconstruct reasoning."
- **Summaries-of-summaries drift.** Sourcegraph retired compaction outright
  because repeated compression progressively distorts earlier reasoning. Each
  cycle drifts further from reality.
- **Compaction should be a last resort, triggered at a boundary.** Claude Code
  layers cheaper operations (just-in-time retrieval, tool-result clearing)
  ahead of full compaction, and Managed Agents made the session an append-only
  event log where compaction is a *runtime transformation*, never a destructive
  edit. LangChain exposes compaction as a tool the agent fires at task
  boundaries, never mid-refactor at a fixed token threshold.
- **Keep the original; make lossy recoverable.** Cursor writes full history to a
  file before summarizing, so any dropped detail can be restored — lossy
  compression made lossless by a sidecar.

Every one of these findings rewards exactly what Glassbox already is: a tool that
reasons from *proof*, preserves bytes verbatim, and never modifies the original.
The architecture below is what you get when you take the field's hard-won lessons
seriously instead of chasing the ratio.

## The core decision: a verbatim-first ladder, summarize last

The single most important architectural choice is **ordering**. Most of the
field summarizes first and protects a few things from the summarizer. Glassbox
inverts that: it exhausts every lossless and verbatim method *before* a model is
allowed to rewrite a single token. Summarization is the floor of the ladder, not
the default.

Compaction descends this ladder and stops the instant the window is under the
token target. Each rung is strictly more lossy — and strictly less trusted —
than the one above it.

```
Tier 0  Lossless eviction        provable garbage          0 accuracy cost   (built)
Tier 1  Observation clearing     spent tool outputs        verbatim, no LLM
Tier 2  Verbatim line-trim       cold bulk in live blocks  verbatim, no LLM
Tier 3  Guided summarization     cold reasoning prose      LLM, fact-bypassed
Tier 4  Handoff                  whole-session reset       fresh brief
```

### Tier 0 — Lossless eviction (already shipped)

Tombstone the provably-dead: `gone`, `stale-drift`, `stale-superseded`,
`duplicate`. Proven from the filesystem and the transcript, removed with zero
information loss, structure preserved (see [architecture.md](architecture.md)).
This tier always runs, on every session, compaction or not. It is free accuracy.

### Tier 1 — Observation clearing (the Complexity Trap rung)

This is the field's biggest safe win and Glassbox is already wired for it. The
Complexity Trap result and Claude Code's "tool-result clearing" agree: the
**reasoning chain matters more than the observations**, and observations are
re-derivable. Glassbox segments by `source`, so it can make exactly this cut —
keep assistant reasoning and tool *calls* intact, clear the heavy tool *results*
that are spent and sit outside the working set.

This is the `spent` class the cleaner already detects but excludes from the
lossless default (because "never referenced again" is inferred, not proven).
Under a token budget that inference becomes worth taking — but as a **verbatim
deletion**, never a rewrite. The tool call survives so the model knows the
action happened; only the bytes of its output are tombstoned. Zero hallucination
risk, no model call, and it reclaims the single largest cold mass in most
sessions (~101k tokens of spent tool output in the spike session).

### Tier 2 — Verbatim line-trim (the Morph rung)

For a segment that is still *live* but large and cold — a 40k-token file read the
agent hasn't touched in twenty turns, a long log — do not summarize it. Delete
the boring lines **verbatim**, keeping a structurally chosen skeleton: the head,
the tail, and the lines that carry artifacts (signatures, paths, error strings,
the matched region). Every surviving line is byte-identical to the original.

This is Morph's bet rendered in Glassbox terms: it is better to keep 50% of a
block perfectly than a 100% summary that might invent a file path. Because the
survivors are verbatim, **artifact tracking — the thing summarization breaks — is
preserved exactly.** A line-trim is still lossy (you dropped lines), so it is
below the verbatim-deletion tier, but it carries no *fabrication* risk, which is
why it sits above any summarization.

### Tier 3 — Guided summarization, last resort and fact-bypassed

Only if Tiers 0–2 cannot reach the target does a model rewrite anything, and even
then it rewrites the smallest possible thing under the strictest possible
constraints. Every constraint here is a direct answer to a specific field
finding:

- **The summarizer sees only the cold reasoning prose** — never the working set,
  never artifacts, never garbage (already gone in Tier 0). Bounded discretion
  means bounded damage.
- **Facts bypass the model entirely** (see the artifact ledger below). Factory's
  artifact-tracking failure happens because the model is asked to *carry* facts
  through a paraphrase. Glassbox never asks it to. Paths, signatures, error
  codes, test outcomes, and decisions are extracted and preserved verbatim
  *around* the summarizer; the model only compresses the connective reasoning,
  where paraphrase is acceptable.
- **Structured extraction, not free-form prose.** The summarizer's task is
  "emit decisions, open questions, and findings as a list," not "write a
  paragraph." Structure resists semantic drift.
- **Smaller model preferred.** The LLM Scaling Paradox says larger models
  overwrite and drift more. The summarizer is a place to use a small, literal
  model, not the frontier one.
- **Always summarize from the pristine original, never from a prior summary.**
  This is how Glassbox sidesteps Amp's summaries-of-summaries drift — see the
  append-only decision below.

### Tier 4 — Handoff

When a session is at a clean task boundary, or so large that even summarization
won't recover it, the right move is Amp's: stop compacting a degraded history and
**start fresh** with a structured brief — the artifact ledger plus the digest,
written as the seed of a new session. Glassbox is uniquely positioned to compose
that brief well, because the ledger and manifest already say exactly what
mattered. This is the nuclear option and is always explicit.

## The artifact ledger — Glassbox's answer to the artifact-tracking failure

This is the load-bearing, Glassbox-specific contribution, and it deserves to be
named as its own decision.

Factory's benchmark says the thing compaction reliably destroys is **artifacts**:
which files changed, what errors appeared, what signatures moved, what was
decided. Glassbox's response is to never let those ride inside a lossy step at
all. Before any tier above Tier 0 runs, Glassbox scans the region it is about to
compact and extracts a structured **artifact ledger**, which is then preserved
verbatim regardless of how aggressively everything else is compacted.

The ledger splits cleanly along Glassbox's provable/inferred line:

- **Hard artifacts — extracted deterministically, no model.** File paths touched
  and their final state come straight from `session.fileOps`. Tool calls and
  their parameters come from `session.toolCalls`. Error strings and test
  outcomes are matched from tool results by pattern. These are facts the model
  already holds; the ledger just lifts them out so they survive verbatim. No LLM,
  so no overwriting, no drift.
- **Soft artifacts — the only thing a model extracts.** Decisions, rationale,
  and open questions are not mechanically recoverable, so a model reads the cold
  region and emits them as a structured list. Crucially, even these are kept
  **alongside** the pristine original (the original is never modified), so any
  soft artifact can be audited against, or recovered from, the real record.

The ledger is the spine of every lossy tier. Tier 1 clears an observation *only
after* its artifacts are in the ledger. Tier 3 hands the summarizer the cold
prose but keeps the ledger out of its reach and re-attaches it verbatim
afterward. The digest may be lossy; the ledger never is. This is what lets
Glassbox claim what no competitor does: **the operational specifics survive
compaction by construction, not by hoping the summarizer kept them.**

## Cross-cutting decisions

These hold across every tier and are the reason the ladder is safe.

**1. Accuracy is the objective; ratio is a constraint, not a goal.** Glassbox
never optimizes for "how small." It optimizes for "how much of what matters
survived," subject to fitting under the budget. The headline metric is
artifact-and-decision retention, not bytes saved. A compaction that hits the
budget at Tier 1 is *better* than one that goes to Tier 3 for a smaller file,
because it touched less and risked nothing.

**2. The original is append-only; every compaction is a fresh derivation.**
Glassbox already writes a new sibling and never opens the original for writing.
Elevate that to a hard architectural rule, matching Anthropic's Managed Agents:
the original transcript is an immutable event log. Compaction is a *pure function
of the original log*, recomputed from scratch every time. This single rule kills
Amp's drift problem outright — there is no "summary of a summary" because there
is never a summary in the input, only the pristine log. Re-compacting a session
re-derives from the original, not from the last compaction.

**3. Facts never pass through a model that can rewrite them.** The artifact
ledger enforces this. Anything provable is carried verbatim; the model only ever
compresses prose where paraphrase is lossless-enough. This is the structural
fix for knowledge-overwriting and semantic drift.

**4. The manifest is the contract, and it is recoverable.** Every segment's fate
— preserved, cleared, trimmed, summarized, dropped — is itemized with a reason
and a token delta, and because the original is intact, every lossy decision is
reversible by re-deriving from the log. This is Cursor's "lossy made lossless via
a sidecar," except the sidecar is the untouched original Glassbox already keeps.
It is also the observability surface no competitor offers: you can *see* and
*override* what the compactor decided before it runs, and *diff* the result
against both the original and against what a naive summarize-everything pass
would have produced.

**5. Triggered at a boundary, not at a panic threshold.** Claude Code's 95%
auto-compact fires whenever the window is full, including mid-refactor — the
worst moment, per LangChain. Glassbox can see the working set and the active-edit
set, so it can detect "is the agent mid-task?" and defer, or expose compaction as
a boundary action the agent/user invokes after results are extracted. Compaction
should land *between* units of work, never inside one.

**6. Cache-aware composition.** The economic argument in [idea.md](idea.md) is
cache-read billing per turn, and Manus and Google both treat the KV-cache as
sacred. The composed transcript is ordered so the stable, verbatim
preserve-prefix (instructions, ledger, working set) forms a contiguous,
cacheable head, and the volatile digest sits behind it. A compaction then
behaves as a cache-friendly reset rather than a cache-buster.

## What we deliberately do *not* do

- **We do not train a model to self-summarize (Cursor's RL).** It is the
  strongest single result in the field, but it requires a proprietary training
  pipeline and reward data Glassbox does not have, and it hides the decision
  inside opaque weights — the opposite of an observability tool's value. Glassbox
  competes on *transparency and provability*, not a better black box.
- **We do not chase 99% ratios.** That number is where artifact tracking goes to
  die. We will ship a lower ratio and a higher retention score and argue the
  retention score is the only one that matters.
- **We do not summarize by default.** Summarization is Tier 3 of 4, reached only
  when verbatim methods are exhausted against a hard budget.

## The pipeline, with the ladder

```
parse
 -> analyzeSessionReclaimable                 classify every resident segment
 -> Tier 0: planEviction + fork               tombstone provable garbage  (always)
 -> if under target: done.
 -> buildArtifactLedger                        hard facts (no LLM) + soft (small LLM),
                                                kept verbatim, audited vs the original
 -> planDisposition                            PRESERVE / CLEAR / TRIM / SUMMARIZE / DROP
                                                from recency + reference + source + size + pins
 -> descend the ladder until under target:
        Tier 1: clear spent observations       verbatim deletion, no LLM
        Tier 2: verbatim line-trim cold blocks  byte-identical survivors
        Tier 3: summarize cold reasoning        small model, fact-bypassed, structured
        Tier 4: handoff                         fresh session seeded from ledger + digest
 -> composeCompacted                            cache-ordered: preserve-prefix + ledger
                                                + working set intact + digest behind
 -> validate (extended)                         loads, no orphan pairs, preamble well-formed
 -> write <newId>.jsonl                         new sibling; original is immutable
```

## Why this is good enough

It is good enough because it makes the failure the whole field shares —
artifact-tracking collapse under summarization — *structurally impossible* for
the classes Glassbox can prove or extract, and *minimized* for the rest by only
summarizing prose a small model after every fact has been lifted out. It keeps
the maximum amount of memory by deleting in order of certainty: provable garbage
first, spent observations next, cold bulk by verbatim trim, and only the cold
connective reasoning by summary — last, least, and auditable. And every step is
visible, overridable, and reversible against an original that is never touched.

The field's best ideas, kept; their shared failure, designed out.

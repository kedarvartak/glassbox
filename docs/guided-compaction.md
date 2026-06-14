# Guided compaction

## The problem with compaction

When a session outgrows the context window, the agent compacts: it summarizes
the window and continues from the summary. This is lossy and blind. The native
compactor has no model of which parts of the window matter, so it runs one
`summarize(everything)` pass over the cold exploration, the hot working set, and
the structural anchors alike — the original task, the current TODO list, the
file you are mid-edit on, the decisions already made. Those anchors are exactly
the information you cannot afford to lose, and they are the first casualties,
because nothing tells the compactor they are different from a stale Bash dump.

That is why model accuracy often drops after a compact, and why compaction is
something you reach for with a wince rather than trust.

## The insight

Glassbox already has eyes into the window. The reclaimable analyzer
(`analysis/reclaimable.ts`) parses a session, reconstructs what is resident, and
assigns every segment a meaning: provably dead (`gone`, `stale`, `duplicate`),
or live. The hard, novel work — looking at raw context and knowing what each
piece _is_ — is already done.

Today that classification feeds exactly one action: the lossless fork tombstones
the provably-dead segments and leaves everything else untouched (see
[architecture.md](architecture.md)). But the same eyes can drive a second
action. Compaction does not have to be blind. If we can tell garbage from
important context — and we can — then we can guide the compactor: keep this
verbatim, compress that, drop the other, and never hand the model the parts it
must not mangle.

Guided compaction is that second action. It is the answer to "I don't trust
compaction": make the compactor see what the inspector sees.

## Two write-strategies, one classification

Every segment in a long session falls into one of three regimes, not two:

- **Provably dead** — `gone` / `stale` / `duplicate`. Removed losslessly by the
  existing tombstone fork. The model never sees it again, with no information
  loss, because deadness is proven.
- **Live but cold** — still valid, but old and unreferenced: exploration from
  twenty turns ago, a raw reasoning chain whose conclusion is all that matters,
  a file read long ago and never touched since. Safe to _compress_, not to keep
  verbatim. This is where summarization earns its keep.
- **Live and hot** — recent, active, or structural: the task, the working set of
  recent turns, the file under edit, the open decisions. Must survive
  byte-for-byte.

Native compaction collapses all three into one summarize pass. Glassbox keeps
them apart. Tombstoning (lossless, structure-preserving) handles the first
regime; guided compaction (lossy, but bounded) handles the second; and the third
is protected from both. The two write-strategies are complementary: tombstone
the garbage first, then summarize only what is _still_ over budget.

## Disposition: the verdict that drives compaction

`SegmentStatus` answers one question — _is this reclaimable as garbage?_
Compaction needs a richer per-segment verdict layered on top, a **disposition**:

- `TOMBSTONE` — provable garbage; routed to the existing eviction path. The
  summarizer never sees it.
- `PRESERVE` — must survive verbatim. This is the default, and the safety net.
- `SUMMARIZE` — live but cold; the _only_ thing the summarizer is allowed to
  touch.
- `DROP` — spent one-shot output we are willing to lose entirely (opt-in, the
  same risk posture `spent` carries in the cleaner today).

This mirrors the discipline already in the codebase: `ReclaimableDetail` is the
stable discriminator the cleaner keys on; disposition is the same idea one level
up — the discriminator the compactor keys on. Following ADR 0003, the model
holds only the disposition _vocabulary_; the _assignment_ lives in
`@glassbox/analysis` as a new `planDisposition`, alongside `planEviction`.

The defaults are deliberately inverted from native compaction. There, everything
is summarized unless something protects it. Here, everything is `PRESERVE`
unless a positive signal argues for compressing it.

## How disposition is decided — the guidance

The guidance is not a heuristic vibe; it is a manifest computed from signals
Glassbox already has or can trivially derive per segment. Each signal pushes a
segment toward `PRESERVE` or `SUMMARIZE`.

- **Provable deadness** → `TOMBSTONE`. Already computed by the session
  classifier. Excluded from the summarizer entirely, which also saves summarizer
  tokens.
- **Recency / turn distance.** The analyzer already builds the last turn and its
  message ids. Generalize it: map every origin message to its turn index and
  measure distance from the last turn. The working set — the last K turns, or
  the last T tokens — is `PRESERVE`; the cold tail is eligible for `SUMMARIZE`.
  This is the signal native compaction gets most wrong: it summarizes the turn
  you are standing in.
- **Active reference / under edit.** The superseded-file logic already orders
  each path's accesses. Extend it: a file written or edited _inside the working
  set_ has its latest copy pinned to `PRESERVE` — you are actively working it. A
  file last touched forty turns ago and never since is a `SUMMARIZE` candidate
  even though it is still "live".
- **Source type.** User instructions and the task framing → `PRESERVE` (the
  necessary info). Raw `thinking` chains → `SUMMARIZE` (the conclusion matters,
  the long chain to reach it usually does not). One-shot `tool_result` / `mcp`
  output → `DROP` or `SUMMARIZE`.
- **Size floor.** The eviction planner already nets reclaimed tokens against the
  tombstone's own cost. The same arithmetic applies here: do not summarize a
  small segment whose summary would cost as much as the original. Only segments
  above a token floor are worth the summarizer's effort and output tokens.
- **Explicit pins.** A user- or agent-supplied "never touch this" list forces
  `PRESERVE`, overriding every heuristic. This is the manual half of guiding the
  compactor.

The manifest is the join of all of these: `segment -> {disposition, reason,
tokens}`. That object _is_ the guidance. It is auditable, it is overridable, and
it is what the UI renders. "Guide the model on what to compact" becomes: the
manifest constrains both the input set the summarizer receives and the
instructions it is given.

## The summarizer sees only the cold middle

Native compaction's failure mode is "here is the whole window, compress it."
Guided compaction inverts every part of that prompt:

- **Scope.** The summarizer is handed _only_ the `SUMMARIZE` segments — never the
  garbage (already tombstoned), never the `PRESERVE` set. It physically cannot
  drop your task definition because it never receives it for rewriting.
- **Context, not target.** The `PRESERVE` set is shown as read-only context —
  "these survive verbatim elsewhere; be consistent with them, do not repeat
  them" — so the digest stays coherent without re-emitting those tokens.
- **Directives from the manifest.** Each `SUMMARIZE` group carries its `reason`
  into the prompt: "cold file-exploration from turns 4–9; compress to findings;
  keep file paths, decisions, and open questions; discard raw output." That
  per-segment reason is the literal text of the guidance.

The model's discretion is bounded to the cold middle. Everything you care about
is either preserved verbatim or never exposed to rewriting.

## Writing it back: the structural constraint

Tombstoning is lossless because it keeps the message graph identical — it swaps a
heavy content string for a short marker and touches nothing else, so the
validator passes trivially. Summarization cannot do that. Collapsing turns 4–9
into one summary message orphans every `tool_use` / `tool_result` pair in that
range and breaks the `parentUuid` chain, and the Anthropic API rejects a
transcript with orphaned pairs on resume.

The solution is to pick a **compaction boundary** and treat the two sides
differently:

- **After the boundary** (the working set) is kept intact, byte-for-byte. Its
  tool pairs and parent links are already valid, so this region passes
  validation unchanged — the same guarantee the current fork gives.
- **Before the boundary** (the cold prefix) is replaced by a **synthetic
  preamble**: one or a few new messages holding the digest of the `SUMMARIZE`
  segments plus the `PRESERVE`-verbatim segments re-emitted. The preamble
  contains **no `tool_use` blocks**, so it owes no pairing, and the first
  post-boundary message's `parentUuid` is **re-rooted** to the preamble.

The orphaned-pair problem only exists if you partially summarize a region that
still holds live tool blocks. By making the boundary a clean cut — everything
before becomes prose with zero tool blocks, everything after stays whole — no
dangling pair is ever created. The summary is "just text," which the API always
accepts. This is how the native compactor stays loadable; guided compaction
differs only in choosing the boundary intelligently and in _what_ it preserves
across it, rather than summarizing everything but the last turn.

This means two write-strategies coexist in the adapter: `forkTranscript`
(structure-preserving, lossless) for garbage, and a new
`composeCompactedTranscript` (graph-rewriting, lossy-but-guided) for the cold
prefix.

## The validation gate grows a second mode

`validateTranscript` today encodes "no new structural problems versus the
original" — correct for tombstoning, where structure is unchanged. The
compaction write deliberately changes structure, so it needs a second, explicit
invariant set:

- the synthetic preamble is well-formed JSON and contains no `tool_use` blocks
  (hence no pairing debt);
- the first preserved message's `parentUuid` points at the preamble (re-rooting
  is correct, no dangling link);
- every `tool_use` / `tool_result` pair within the preserved region is still
  matched;
- the result re-parses as a final proof that it loads.

Keep this as a distinct validator. The lossless gate must never wave a lossy
compaction through — the credibility of the whole tool rests on that line.

## The pipeline, end to end

```
parse
 -> analyzeSessionReclaimable        (existing: classify every resident segment)
 -> planEviction (provable)          (existing: tombstone garbage, losslessly)
 -> planDisposition         [new]    (PRESERVE / SUMMARIZE / DROP over the live
                                      remainder, from recency + reference +
                                      source + size + pins)
 -> if window still over target after tombstoning:
        chooseBoundary      [new]    (working set stays; cold prefix is compacted)
        summarizeSegments   [new]    (LLM: digest ONLY the SUMMARIZE bucket,
                                      guided by the manifest)
        composeCompacted    [new]    (synthetic preamble + verbatim PRESERVE +
                                      intact working set, re-rooted)
 -> validate (extended)     [new]    (loads, no orphan pairs, preamble well-formed)
 -> write <newId>.jsonl              (existing: new sibling session; original
                                      untouched)
```

Two properties matter. Compaction is **target-driven** — it fires only when
tombstoning alone cannot get the window under a token budget, because the
lossless fork is always preferable when it is enough. And the garbage is removed
**before** the LLM step, so the summarizer is cheaper and never sees dead content.

## The observability is the UX

The manifest gives a review surface that native compaction structurally cannot
offer.

- **Before.** Show the plan. "Keeping verbatim: your task, the TODO list,
  `auth.ts` (under edit), the last 6 turns. Summarizing: turns 4–9 exploration
  (32k -> 2k). Dropping: 4 spent Bash outputs (18k). Net: 178k -> 71k." Every row
  has a reason, and the user — or the agent itself — can flip any disposition:
  pin a segment, force-summarize a bloated live one. That interaction _is_
  guiding the compactor.
- **After.** Because the original session is never modified (the fork philosophy
  holds), the compacted session can be diffed against it — and against what
  native compaction would have produced. "Native would have dropped your
  acceptance criteria; we preserved them." That comparison is the demo.

`CompactionEvent` already exists in the model, defined for _observing_ native
compactions but unpopulated. Guided compaction lets Glassbox **emit its own** —
tokens before and after, what was summarized, and why. The same type that records
"here is what the harness silently dropped" now records "here is what I dropped,
and exactly why." That audit trail is the direct answer to not trusting
compaction.

## Honesty tier

The tool is scrupulous about _provable_ versus _inferred_: `spent` is excluded
from the default fork precisely because "never referenced again" is inferred, not
proven. Guided compaction is fundamentally inferred and lossy, so it must wear
that label loudly.

- It never runs under the same command or flag as the lossless fork. The fork
  stays the safe default; compaction is the explicit, target-driven escalation.
- `PRESERVE` is the default disposition; a segment is only at risk when signals
  positively argue for it.
- The full manifest and the original summarized segments are persisted alongside
  the result, so a user can audit what was compressed and recover it from the
  untouched original. Lossy is not the same as unaccountable.

One economic note: the value argument in [idea.md](idea.md) rests on cache-read
billing per turn. Any compaction resets the cacheable prefix. If the composed
transcript is ordered so the stable `PRESERVE` material forms a contiguous prefix
and the rewritten digest sits behind it, the compaction becomes a cache-friendly
reset rather than a cache-buster.

## Open questions

These are the real forks in the road, not defaults:

- **Boundary policy** — fixed last-K-turns, token-budget-driven, or semantic (up
  to the last user instruction)? This is the single biggest behavioral knob.
- **Summarizer trust** — a local small model, the same agent, or a cloud call;
  and whether the digest is re-verified ("does it still mention every file path
  and decision the manifest told it to keep?").
- **Where it runs** — a CLI command like `clean --fork`, emitting a new resumable
  session, or a live hook the harness calls at its compaction trigger. The former
  fits today's architecture exactly; the latter is the bigger bet.

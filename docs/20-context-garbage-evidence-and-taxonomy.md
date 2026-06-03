# 20 · Context Garbage — Evidence & Taxonomy

> **What this is:** a continuation of the Phase-0 spike ([doc 19](./19-spike-findings-memory-observability.md)), answering a sharper question: **is "context garbage" (unnecessary junk accumulating in the agent's window) an actual, measurable problem — and what kinds of garbage are there?**
> **Method:** mined a live Claude Code session transcript + Codex stores on this machine, **2026-06-03**. Token figures are rough (~4 chars/token) and from **one session** — directional, not exact. `⟦verify⟧` on more sessions, including MCP-heavy ones.

---

## 1. Is it a real issue? Yes — measured, not theoretical

From a single real Claude Code working session (the very session that produced these docs):

| Measurement | Value | Meaning |
|-------------|-------|---------|
| Tool-result payload accumulated | **~101,000 tok** | results that mostly mattered for one turn |
| `Write` tool *inputs* pushed into context | **~70,000 tok** | full file contents, many later changed/deleted |
| Peak context recarried in one turn (`cache_read_input_tokens`) | **~234,900 tok** | what the model re-ingests *every* turn |
| Largest single resident blob | **~12,700 tok** | one command/tool output sitting there |

> **Takeaway:** a normal working session carried a double-digit-percent fraction of *reclaimable* tokens **without any MCP tools involved.** Add MCP and it gets worse. The problem is real and quantifiable.

---

## 2. The garbage taxonomy (with evidence)

### Type #1 — MCP envelope cruft *(the originating insight)*
- **What:** when an MCP tool is called, the full URL, request/response envelope, IDs, and re-injected tool/resource **schemas** land in context. The *content* mattered; the wrapper didn't.
- **Evidence here:** ⚠️ **not present in this session** (tools used were Write/Bash/Edit/Read/AskUserQuestion — no MCP). Mechanism is real; **needs an MCP-using session to quantify.** `⟦verify⟧`
- **Detection:** strip envelope/metadata, collapse repeated tool schemas.

### Type #2 — Orphaned & duplicate file content *(strongest, most provable)*
- **What:** every `Write`/`Edit`/`Read` pushes full file content into context. **Old versions never leave**, and content for **deleted** files persists.
- **Evidence here (vivid):**
  - `README.md` written **4×**, `index.ts` **4×**, `17-phased-execution-plan.md` **3×**, many docs **2×** → multiple full copies resident, only the latest valid.
  - We ran `rm -rf docs` deleting **~18 markdown-platform docs**, then wrote 19 new ones — **the entire deleted project's doc contents are still in context**, describing files that no longer exist on disk.
  - ~70,000 tok of `Write` content, a large fraction now stale/orphaned.
- **Detection:** 🟢 **provable** — cross-check resident file content against the actual filesystem/git. Deleted/overwritten = definitionally stale. (Same engine as memory dead-reference detection in [doc 19](./19-spike-findings-memory-observability.md).)

### Type #3 — Spent one-shot tool/command outputs
- **What:** outputs useful for exactly one turn (big `ls` dumps, build/command output, analysis dumps, large file reads) that are then dead weight — yet recarried every turn.
- **Evidence here:** the largest resident blobs (~12.7k, ~4.8k, ~3.3k tok…) are one-shot command/tool outputs; **~101k tok of tool results total**, most already "spent."
- **Detection:** 🟢 a tool result never referenced again after turn N = reclaimable.

### Bonus — Codex storage/telemetry self-bloat *(different flavor)*
- **What:** not context-window garbage, but storage noise. `~/.codex/logs_2.sqlite` = **560 MB / 138,086 rows**, dominated by `codex_otel.log_only`, `codex_otel.trace_safe`, `opentelemetry_sdk`, websocket transport — mostly telemetry, not semantic signal. (`memories` tables empty; `history.jsonl` a lean 335-row prompt log.)
- **Why it matters:** proves the broader thesis — **raw agent logs are mostly noise; the value is in distilling them.** Also a "don't replicate this" note for our own observability storage.

---

## 3. The unifying detection principle

`★ Core insight ───────────────────────────────`
All three context-garbage classes (and memory staleness from [doc 19](./19-spike-findings-memory-observability.md)) reduce to **one rule:**

> **"Context that refers to something gone, stale, or already-spent."**

- *gone* → content for deleted files / dead references
- *stale* → overwritten file versions / memory whose source changed
- *already-spent* → one-shot tool outputs never referenced again, MCP envelopes

**One detector, many garbage types.** That's the engineering economy that makes this buildable and the product coherent.
`──────────────────────────────────────────────`

---

## 4. The headline product metric: **Reclaimable %**

Every finding rolls up into one screenshot-worthy number:

> *"~34k tokens (37% of your window) are reclaimable — deleted/overwritten files, spent tool outputs, MCP cruft — costing ≈ $X every turn."*

- **Quantifiable** → trivial demo + trivial sales pitch (ROI in dollars).
- **Recurring** → the cost repeats every turn the junk persists.
- **Quality angle** → less junk = less "context rot" = better agent reasoning, not just cheaper.

---

## 5. What this means for the product (updates the thesis)

1. **The wedge sharpens again:** from "observability" → "memory health" ([doc 19](./19-spike-findings-memory-observability.md)) → **"context hygiene"** = detect + (eventually) clear *garbage context* **and** *stale memory*. One thesis, two junk sources.
2. **Strongest first feature = the reclaimable-tokens report** (orphaned-file + spent-output detection), because it's provable from the transcript with real numbers, no ML, cross-tool.
3. **Survives platform risk:** Claude's `/context` shows a live snapshot; it does **not** flag garbage, score reclaimable tokens, or clean. We're clearly up-stack.
4. **The product modes ladder** (from prior ideation): **Observe** (reclaimable report) → **Advise** (what to clear / which MCP server to trim) → **Act** (MCP-proxy / session optimizer that strips garbage before it enters context — the sticky, infrastructure-grade endgame).

---

## 6. Honest caveats
- Token counts are **~4 chars/token estimates** from **one session** — directional. Re-measure with real tokenizer + more sessions. `⟦verify⟧`
- **MCP garbage (Type #1) was not observed here** — the user's own finding stands, but quantify it on an MCP session.
- `cache_read` peak (~234k) may include cache accounting nuances; treat as order-of-magnitude evidence of heavy recarry, not a precise window size.
- "Spent / never-referenced-again" detection needs real reference-tracking logic — feasible, but it's the actual work.

## 7. Recommended next step
Build a small **`reclaimable-tokens` analyzer** that runs over any Claude Code session JSONL and prints: total context recarried, orphaned/overwritten/deleted file content, spent tool outputs, and a reclaimable % + $ estimate. This is simultaneously the **first working prototype**, the **demo GIF**, and the **proof for the validation gate** ([doc 15](./15-validation-plan.md)).

---

*Related: [19 · Memory Spike Findings](./19-spike-findings-memory-observability.md) · [05 · Gaps](./05-market-gaps-opportunities.md) · [08 · Positioning](./08-positioning-differentiation.md) · [13 · MVP](./13-mvp-scope-roadmap.md). Back to [README](./README.md).*

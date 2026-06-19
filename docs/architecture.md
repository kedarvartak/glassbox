# Architecture

Glassbox is a pnpm monorepo of six packages. Data flows in one direction: a
tool-specific adapter parses a transcript into a neutral model, analyzers read the
model, and the CLI/UI present the result. Only the adapter knows the raw
Claude Code format; only the CLI does filesystem writes.

## Packages

- **core** — the tool-neutral model: `Session`, `Message`, `ToolCall`, `FileOp`,
  `ContextSnapshot`, `Segment`, and the `SegmentStatus` vocabulary. Pure types and
  small helpers; no I/O.
- **adapter-claude-code** — reads Claude Code's on-disk JSONL. `parseClaudeSession`
  maps raw events onto the core model. `forkTranscript` rewrites a transcript into
  a cleaned copy. `validateTranscript` checks the structural invariants a resume
  depends on. This is the only package that understands the raw format.
- **analysis** — detectors over the model. `analyzeSessionReclaimable` classifies
  resident segments; `planEviction` turns that into a removal plan; `cost` and
  `pricing` compute spend from provider actuals; `context` reconstructs the window
  composition. Pure: it reads the model and the repo through a `RepoState` port but
  never writes.
- **store** — a SQLite index of parsed sessions for fast listing, plus a watcher.
- **cli** — the `glassbox` command. Dispatches subcommands, renders ANSI output,
  and performs all filesystem writes.

## The pipeline

```
transcript.jsonl
  -> parseClaudeSession            (adapter)   raw events -> Session
  -> analyzeSessionReclaimable     (analysis)  Session -> snapshot + report
  -> planEviction                  (analysis)  report -> EvictionPlan
  -> forkTranscript                (adapter)   raw + plan -> cleaned text
  -> validateTranscript            (adapter)   gate: no new structural problems
  -> write <newId>.jsonl           (cli)       new sibling session
```

## Detection taxonomy

A segment is reclaimable when it is provably dead or redundant. The provable
classes the fork removes:

- `gone` — file content whose file was deleted (checked by stat).
- `stale-drift` — a copy outdated because the file changed on disk (checked by
  mtime against capture time).
- `stale-superseded` — an older copy a later read of the same path replaced
  (proven from the transcript order).
- `duplicate` — a byte-identical repeat of resident content (proven by hash).

`spent` (one-shot tool output never referenced again) is detected but excluded by
default, because "never referenced again" is inferred rather than proven. It is
opt-in through `EvictionOptions.classes`.

## The fork, in detail

The fork never deletes a block. The Anthropic API requires every `tool_use` to
keep a matching `tool_result`, so deletion would orphan pairs and break the resume.
Instead it replaces only the heavy content with a short tombstone:

- a Read's bytes live in the `tool_result.content` and a mirrored `toolUseResult`;
  both are stubbed so a resume cannot re-inflate them.
- a Write's or Edit's bytes live in the `tool_use.input` (`content`, `new_string`,
  or `edits[]`); those fields are stubbed.

Lines with nothing to evict pass through byte-for-byte. The fork is given a fresh
session id and filename so Claude Code lists it as its own session; the original
file is never opened for writing.

Before writing, `validateTranscript` runs on both the original and the fork and the
fork is rejected if it introduces any new problem (orphaned pairs, dangling
`parentUuid`, empty content, invalid JSON). After writing, the fork is re-parsed as
a final proof that it loads.

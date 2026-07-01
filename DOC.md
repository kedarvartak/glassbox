# Glassbox Documentation

Glassbox is a local-first, read-only x-ray and hygiene monitor for AI-agent context. It inspects Claude Code transcripts on disk, reconstructs what is currently resident in the model context window, shows what that context costs, identifies provably reclaimable garbage, and can write a cleaned or compacted fork that can be resumed without mutating the original session.

This document is the app-level documentation page for the repository. Keep it updated whenever commands, behavior, configuration, architecture, workflows, or public package APIs change.

## Table of contents

- [What Glassbox solves](#what-glassbox-solves)
- [Safety model](#safety-model)
- [Installation](#installation)
- [Quick start](#quick-start)
- [CLI reference](#cli-reference)
- [Core workflows](#core-workflows)
- [How analysis works](#how-analysis-works)
- [Architecture](#architecture)
- [Packages](#packages)
- [Data and files](#data-and-files)
- [Development](#development)
- [Validation and release](#validation-and-release)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

## What Glassbox solves

Long agent sessions accumulate stale or redundant context. The user usually cannot see:

- what content is currently in the agent context window;
- where that content came from;
- how much it costs every turn;
- which parts are deleted, stale, superseded, duplicated, or otherwise safe to clear;
- whether a cleaned session can still be resumed safely.

Glassbox turns Claude Code transcripts into a normalized session model, analyzes context composition and cost, then optionally writes a new transcript fork where provably dead content is replaced by small tombstones.

The current implementation targets Claude Code transcripts stored under `~/.claude/projects`. The core model, analysis package, and store are designed to be tool-neutral so future adapters can support other coding agents.

## Safety model

Glassbox is designed around conservative, local-first operation.

- **Local-first:** transcripts are read from local disk. Normal inspection, indexing, cleaning, and lossless compaction do not upload sessions.
- **Read-only by default:** analysis commands only read transcripts.
- **Original sessions are never mutated:** `clean --fork` and `compact --fork` write a new sibling `<newSessionId>.jsonl` file.
- **Forks preserve transcript structure:** tool-use and tool-result pairs remain paired, parent links remain valid, and JSON lines remain parseable.
- **Integrity gates run before writing:** the fork is validated against the original and refused if it introduces new structural problems.
- **Re-parse proof after writing:** written forks are parsed again before the CLI reports them as safe to resume.
- **Lossless cleaning is conservative:** the default cleaner removes only classes that are provably dead or redundant.

Tier 3 guided summarization in `compact` is different: it can call Anthropic when `ANTHROPIC_API_KEY` is set. It is opt-in through `compact --fork` and is documented separately below.

## Installation

### Requirements

- Node.js `>=22`
- pnpm, normally activated through Corepack
- Claude Code transcripts on disk for useful CLI output

### One-line install

```bash
curl -fsSL https://raw.githubusercontent.com/kedarvartak/glassbox/main/install.sh | bash
```

The installer:

1. checks Node.js version;
2. activates pnpm if needed;
3. clones or reuses the repository;
4. installs dependencies;
5. builds the workspace;
6. writes a `glassbox` wrapper to `${BIN_DIR:-$HOME/.local/bin}`.

Environment variables supported by the installer:

- `GLASSBOX_DIR` — clone/build directory, default `$HOME/.glassbox-cli`.
- `BIN_DIR` — wrapper output directory, default `$HOME/.local/bin`.

### Manual install from a clone

```bash
pnpm install
pnpm build

printf '#!/usr/bin/env bash\nexec node %s/packages/cli/dist/main.js "$@"\n' "$PWD" \
  > ~/.local/bin/glassbox && chmod +x ~/.local/bin/glassbox
```

## Quick start

```bash
glassbox list
glassbox inspect <session.jsonl>
glassbox clean <session.jsonl>
glassbox clean <session.jsonl> --fork
```

Resume a cleaned fork from the related project directory:

```bash
claude --resume
```

Choose the newest session shown by Claude Code. The original session remains available.

## CLI reference

All commands are dispatched by `packages/cli/src/main.ts` and run through the built CLI binary at `packages/cli/dist/main.js`.

### `glassbox help`

Prints command help and short descriptions.

### `glassbox list [--project <path>]`

Discovers Claude Code sessions under `~/.claude/projects` and prints modified time, approximate size, and transcript path.

Use `--project` to limit discovery to one project path.

### `glassbox search <term>`

Finds sessions whose encoded project name or full transcript path matches `<term>` case-insensitively.

### `glassbox parse <session.jsonl>`

Parses a Claude Code JSONL transcript and prints the normalized Glassbox `Session` model as JSON. This is useful for debugging adapters and analyzers.

### `glassbox inspect <session.jsonl>`

Prints the full dashboard:

- session metadata;
- message, turn, tool-call, file-op, and memory-op counts;
- context-window token estimate;
- context composition by source/status;
- provider-reported cost breakdown when available;
- reclaimable token report.

### `glassbox xray <session.jsonl>`

Prints context composition and reclaimable-token details without the full cost dashboard.

### `glassbox cost <session.jsonl>`

Prints spend using provider-reported token usage and package pricing tables. Cost figures are exact when provider token counts and pricing are known. Messages with unknown pricing are reported as unpriced.

### `glassbox clean <session.jsonl> [--fork] [--yes|-y] [--json]`

Builds a Tier 0 eviction plan for provable garbage.

- Without `--fork`, prints a dry-run plan and writes nothing.
- With `--json`, prints the eviction plan as JSON.
- With `--fork`, writes a cleaned sibling transcript after validation and confirmation.
- With `--yes` or `-y`, skips the write confirmation.

Default reclaimable classes removed by the cleaner:

- `gone` — file content captured from a file that no longer exists;
- `stale-drift` — file content that is older than the file currently on disk;
- `stale-superseded` — an older read replaced by a later read of the same path;
- `duplicate` — byte-identical repeated resident content.

The cleaner replaces heavy content with short tombstones instead of deleting transcript lines. This keeps Claude Code resume invariants intact.

### `glassbox compact <session.jsonl> [--fork] [--yes|-y]`

Runs a tiered compaction plan:

1. **Tier 0 — provable garbage:** same conservative classes as `clean`.
2. **Tier 1 — observation clearing:** clears spent tool/MCP outputs while preserving tool-call structure.
3. **Tier 2 — verbatim line trim:** trims cold live bulk segments to a skeleton of head, tail, and artifact lines.
4. **Tier 3 — guided summarization:** summarizes cold reasoning into a structured digest when `ANTHROPIC_API_KEY` is set.

Without `--fork`, prints the plan and writes nothing. With `--fork`, applies available tiers, validates the fork, writes a new sibling transcript, and re-parses it.

Tier 3 uses the configured Anthropic API key and the summarizer model displayed by the CLI. If the API key is absent or summarization fails, the CLI can still write the Tier 0–2 result.

### `glassbox bench <session.jsonl> [--vs <cleaned.jsonl>]`

Evaluates compaction quality by replaying probes into original and cleaned transcripts and judging whether answers degrade. Requires:

- `ANTHROPIC_API_KEY`;
- a session with probeable cleaned segments.

If `--vs` is omitted, Glassbox creates an in-memory Tier 0+1 cleaned transcript for comparison. The command exits non-zero when degraded answers are detected.

### `glassbox index [--project <path>] [--db <path>]`

Parses discovered sessions and writes or updates a local SQLite index. The default database path is `~/.glassbox/index.db`.

### `glassbox sessions [--project <path>] [--limit <n>] [--db <path>]`

Lists indexed sessions from SQLite without re-parsing transcript files. This is the fast path once `index` or `watch` has populated the database.

### `glassbox watch [--project <path>] [--db <path>]`

Runs an initial index sync, then watches Claude Code transcript roots for changes and incrementally updates the SQLite index until interrupted.

## Core workflows

### Inspect before cleaning

```bash
glassbox list
glassbox inspect <session.jsonl>
glassbox xray <session.jsonl>
glassbox cost <session.jsonl>
```

Use this workflow to understand the session before modifying anything.

### Write a lossless cleaned fork

```bash
glassbox clean <session.jsonl>
glassbox clean <session.jsonl> --fork
cd <project-dir>
claude --resume
```

The first command previews the exact eviction plan. The second command writes a new transcript only after integrity checks pass and the user confirms.

### Run deeper compaction

```bash
glassbox compact <session.jsonl>
ANTHROPIC_API_KEY=... glassbox compact <session.jsonl> --fork
```

Use this when you want Tier 1–3 reductions in addition to provable garbage removal. Review the output carefully because higher tiers are more aggressive than `clean`.

### Keep a local session index

```bash
glassbox index
glassbox sessions
glassbox watch
```

The index stores session metadata for fast listing. It does not modify project files or transcript files.

## How analysis works

### Normalized session model

Adapters convert tool-specific transcripts into the core `Session` model. The model includes:

- messages and turns;
- tool calls and tool results;
- file operations;
- memory operations;
- context snapshots;
- segments with source, token estimate, and status;
- provider token usage and cost records when available.

### Context composition

The analysis package reconstructs resident context and groups segments by source and status. Segment token sizes are estimated locally because there is no exact local Claude tokenizer. Cost commands use provider-reported token counts when available.

### Reclaimable taxonomy

Glassbox distinguishes conservative, provable classes from inferred classes.

Provable classes used by default cleaning:

- `gone`
- `stale-drift`
- `stale-superseded`
- `duplicate`

Additional inferred or higher-tier classes may be used by compact/bench flows, including spent tool output and cold bulk/reasoning candidates.

### Fork writing

Forking is handled by the Claude Code adapter. It rewrites only the heavy content fields that correspond to planned evictions or trims, while preserving the transcript line structure needed for resume.

Important invariants:

- every `tool_use` keeps a matching `tool_result`;
- parent UUID chains are not broken;
- message content is not made invalid or empty;
- original transcript file is untouched;
- new session id and filename match so Claude Code lists the fork as resumable.

## Architecture

Data flows in one direction:

```text
Claude Code JSONL transcript
  -> adapter-claude-code parses raw events
  -> @glassbox/core normalized Session model
  -> @glassbox/analysis reconstructs context, cost, and reclaimable reports
  -> @glassbox/cli renders dashboards and, only on --fork, writes a sibling transcript
  -> @glassbox/store optionally indexes parsed metadata in SQLite
```

Dependency rules:

- `@glassbox/core` depends on nothing inside the workspace.
- Adapters depend on `core` and lift tool-specific data into the normalized model.
- `analysis` depends on the normalized model and reads repository state through a `RepoState` port.
- `store` depends on the adapter contract and core model concepts for indexing.
- `cli` composes adapters, analyzers, store, rendering, and filesystem writes.

## Packages

### `@glassbox/core`

The normalized model and contracts used by every other package.

Key exports include:

- `Session`, `Turn`, `Message`, and `MessageRole`;
- `ToolCall`;
- `FileOp` and `FileOpKind`;
- `MemoryOp` and `MemoryOpKind`;
- `ContextSnapshot`, `Segment`, and `SegmentStatus`;
- token and pricing types;
- branded id helpers;
- the `Adapter`, `TokenCounter`, and `RepoState` ports.

### `@glassbox/adapter-claude-code`

The Claude Code transcript adapter. It is the only package that understands Claude Code's raw JSONL shape.

Key exports include:

- `ClaudeCodeAdapter`;
- `discoverClaudeSessions`;
- `parseClaudeSession`;
- `forkTranscript`;
- `applyTrimTranscript`;
- `extractColdText`;
- `composeCompactedTranscript`;
- `validateTranscript` and `newProblems`;
- `claudeProjectsRoot` and `encodeProjectDir`.

### `@glassbox/analysis`

Pure analysis over the normalized model plus repository state through ports.

Key capabilities include:

- reclaimable segment detection;
- context composition;
- eviction planning;
- trim planning;
- guided summarization planning;
- artifact ledger generation;
- model pricing and cost calculation;
- token accuracy checks;
- filesystem-backed `RepoState`.

### `@glassbox/store`

A local SQLite index over parsed sessions. It uses Node's built-in `node:sqlite` and avoids a native dependency build step.

Key exports include:

- `SessionIndex`;
- `SessionIndexer`;
- indexed-session metadata types;
- sync, watch, and list option types.

### `glassbox` CLI

The executable package. It wires together the Claude Code adapter, analysis, store, renderer, token estimator, summarizer, and benchmark runner.

## Data and files

### Input data

- Claude Code transcripts: `~/.claude/projects/**/*.jsonl`
- Current repository state: used to determine gone/stale file content
- Optional Anthropic API access: used by `compact` Tier 3 and `bench`

### Output data

- Cleaned/compacted transcript forks written next to the original transcript only when `--fork` is used.
- SQLite index at `~/.glassbox/index.db` by default.
- CLI reports printed to stdout.

### Environment variables

- `ANTHROPIC_API_KEY` — required for `bench`; enables Tier 3 summarization in `compact`.
- `GLASSBOX_DIR` — install location used by `install.sh`.
- `BIN_DIR` — wrapper output directory used by `install.sh`.

## Development

### Repository layout

```text
assets/                       demo assets
packages/core/                normalized model and ports
packages/adapter-claude-code/ Claude Code discovery, parsing, validation, forking
packages/analysis/            context, cost, reclaimable, trim, and summarization planning
packages/store/               local SQLite index and watcher
packages/cli/                 glassbox executable and terminal rendering
docs/                         supporting design and usage notes
```

### Workspace commands

Run from the repository root:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm clean
pnpm format
```

Root scripts:

- `pnpm build` — TypeScript project build plus CLI bundle.
- `pnpm clean` — clean TypeScript build output.
- `pnpm typecheck` — TypeScript project references.
- `pnpm test` — Vitest test suite.
- `pnpm lint` — ESLint over the workspace.
- `pnpm format` — Prettier write over the workspace.

### Coding guidelines

- Keep tool-specific parsing in adapters.
- Keep analyzers pure and tool-neutral.
- Keep filesystem writes in CLI or explicitly write-focused adapter helpers.
- Prefer conservative reclaimability decisions over aggressive token removal.
- Add tests for parser, validation, detection, planning, and store behavior when those areas change.
- Update this `DOC.md` and `CHANGELOG.md` for user-visible or developer-visible changes.

## Validation and release

Before opening a PR or publishing, run the relevant subset and preferably the full suite:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Publishing is handled by the `Publish` GitHub workflow on version tags matching `v*`. It installs dependencies, builds the `glassbox` CLI package, and publishes it to npm with the configured `NPM_TOKEN`.

## Troubleshooting

### `glassbox` command not found

Ensure `$HOME/.local/bin` or your custom `BIN_DIR` is on `PATH`.

### No sessions found

Check that Claude Code has created transcripts under `~/.claude/projects`, or pass `--project <path>` for a specific project.

### Build fails

Check Node.js version:

```bash
node --version
```

Glassbox requires Node.js `>=22`. Then reinstall and rebuild:

```bash
pnpm install
pnpm build
```

### Cleaned fork is not written

The CLI refuses to write if validation finds new transcript-structure problems, if the source transcript cannot be read, if there are no evictions, or if confirmation is declined.

### Tier 3 summarization is skipped

Set `ANTHROPIC_API_KEY`. If summarization fails, `compact` reports the error and can still write lower-tier results.

### Cost appears incomplete

Cost uses provider token actuals and known pricing. If a model is unknown or token fields are missing, Glassbox reports unpriced messages rather than inventing exact costs.

## Known limitations

- Claude Code is the only implemented adapter today.
- Segment token counts are local estimates; provider cost token counts are exact when present.
- `spent` and higher-tier compaction classes are less conservative than default cleaning.
- Tier 3 summarization and `bench` require network/API access through Anthropic.
- The CLI uses hand-written command dispatch rather than a full command framework.
- The SQLite index is local metadata and should be rebuilt if transcript formats change significantly.

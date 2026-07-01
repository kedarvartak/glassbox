# Changelog

All notable changes to Glassbox are documented in this file. Entries are written from the perspective of users and developers who install, run, integrate with, or contribute to the project.

This project follows a Keep a Changelog-style structure. Version headings may correspond to npm package versions, release tags, or an `Unreleased` section while work is in progress.

## Unreleased

### Added

- Added comprehensive app-level documentation in `DOC.md`, covering installation, CLI commands, safety guarantees, workflows, architecture, package responsibilities, data files, environment variables, development commands, validation, troubleshooting, and limitations.
- Added this detailed `CHANGELOG.md` as the mandatory release-history document for future user-visible and developer-visible changes.

### Documentation

- Established the rule that future behavior, API, command, configuration, workflow, architecture, or release changes should update `DOC.md` and `CHANGELOG.md` together.

## 0.1.0 - Current CLI baseline

### Added

- Added the `glassbox` CLI package for inspecting and cleaning Claude Code agent sessions.
- Added one-line installation through `install.sh`, including Node.js version checks, pnpm activation, workspace install, build, and wrapper creation.
- Added manual pnpm-based installation support for local clones.
- Added Claude Code session discovery under `~/.claude/projects`.
- Added `glassbox list` to print discovered Claude Code transcript paths with modified time and approximate file size.
- Added `glassbox search <term>` to find sessions by project name or transcript path.
- Added `glassbox parse <session.jsonl>` to print the normalized Glassbox session model as JSON.
- Added `glassbox inspect <session.jsonl>` as the full terminal dashboard for session metadata, context composition, cost, and reclaimable context.
- Added `glassbox xray <session.jsonl>` to focus on context-window composition and reclaimable tokens.
- Added `glassbox cost <session.jsonl>` to show provider-token-based cost breakdowns.
- Added `glassbox clean <session.jsonl>` to generate a dry-run eviction plan for conservative, provably reclaimable context.
- Added `glassbox clean <session.jsonl> --json` to emit the eviction plan as JSON.
- Added `glassbox clean <session.jsonl> --fork` to write a cleaned sibling Claude Code transcript that can be resumed separately.
- Added `--yes` / `-y` support for non-interactive fork writes.
- Added `glassbox compact <session.jsonl>` for tiered compaction planning.
- Added `glassbox compact <session.jsonl> --fork` to write a compacted sibling session after validation.
- Added `glassbox bench <session.jsonl>` to evaluate whether cleaning/compaction degrades answers by replaying probes through original and cleaned transcripts.
- Added `glassbox bench <session.jsonl> --vs <cleaned.jsonl>` to compare against a specific cleaned transcript.
- Added `glassbox index` to parse sessions into a local SQLite index.
- Added `glassbox sessions` to list indexed sessions without re-parsing transcripts.
- Added `glassbox watch` to keep the local session index updated as transcript files change.
- Added `--project` filters for discovery, indexing, session listing, and watching workflows where applicable.
- Added `--db <path>` support for commands that read or write the SQLite session index.

### Safety

- Added a local-first design where normal inspection, indexing, cleaning, and lossless compaction operate on local transcript files.
- Added read-only defaults: commands do not modify transcripts unless an explicit `--fork` write mode is used.
- Added sibling-session forking so original Claude Code transcripts remain untouched.
- Added fresh session-id generation for forked transcripts so Claude Code can list cleaned sessions independently.
- Added transcript validation before writing forks.
- Added detection of newly introduced structural problems, including orphaned tool pairs, dangling parent links, invalid JSON, and empty content cases.
- Added post-write re-parse checks so the CLI can prove a written fork still loads.
- Added tombstone-based cleaning instead of raw deletion to preserve `tool_use` / `tool_result` invariants.

### Analysis

- Added normalized context reconstruction from Claude Code transcripts.
- Added provider-token-based cost analysis with input, output, cache-read, cache-write, and cache-savings breakdowns.
- Added local segment token estimation for context x-ray reporting.
- Added reclaimable-context detection for provable classes:
  - `gone` file content;
  - `stale-drift` file content;
  - `stale-superseded` file content;
  - `duplicate` resident content.
- Added additional higher-tier compaction planning for spent observations, cold live bulk trimming, and cold reasoning summarization candidates.
- Added model pricing utilities and unpriced-message reporting when exact pricing is unavailable.
- Added token accuracy checks for comparing estimates to provider actuals.

### Compaction

- Added Tier 0 compaction for provable garbage removal.
- Added Tier 1 observation clearing for spent tool and MCP outputs.
- Added Tier 2 verbatim line trimming for cold live bulk segments.
- Added Tier 3 guided summarization for cold reasoning when `ANTHROPIC_API_KEY` is present.
- Added artifact ledger and synthetic preamble composition for summarized cold context.
- Added fallback behavior so lower-tier compaction can continue when Tier 3 is unavailable or fails.

### Packages

- Added `@glassbox/core`, the tool-neutral normalized model and adapter/port contracts.
- Added `@glassbox/adapter-claude-code`, the Claude Code discovery, parsing, validation, trimming, summarization-composition, and fork-writing adapter.
- Added `@glassbox/analysis`, the pure analysis layer for context composition, reclaimability, cost, pricing, trimming, summarization planning, and token accuracy.
- Added `@glassbox/store`, the local SQLite session index and watcher built on Node's built-in `node:sqlite`.
- Added `glassbox`, the CLI package and executable.

### Developer experience

- Added pnpm workspace configuration.
- Added TypeScript project references and package-level TypeScript configs.
- Added Vitest tests for parser, validation, cleaner, context, cost, reclaimable analysis, repo state, token accuracy, and store behavior.
- Added ESLint and Prettier-based workspace quality checks.
- Added build scripts for TypeScript packages and the bundled CLI.
- Added GitHub Actions workflows for CI, build, lint, and publishing.

### Documentation

- Added `README.md` with overview, problem statement, metrics, quickstart, command list, safety notes, and repository layout.
- Added `docs/usage.md` with install, inspect, clean, index, and notes workflows.
- Added `docs/architecture.md` with package responsibilities, analysis pipeline, detection taxonomy, and fork details.
- Added `docs/idea.md` for product motivation and approach.
- Added `docs/interceptor.md` for harness-agnostic live proxy design.
- Added guided compaction design notes in `docs/guided-compaction.md` and `docs/guided-compaction-arch.md`.

### Requirements

- Requires Node.js `>=22`.
- Uses pnpm as the package manager.
- Requires `ANTHROPIC_API_KEY` for `bench` and for Tier 3 guided summarization in `compact`.

### Known limitations

- Claude Code is currently the only implemented transcript adapter.
- Exact local Claude tokenization is unavailable; segment token counts are estimates while cost uses provider actuals when present.
- Higher-tier compaction is more aggressive than the default lossless cleaner.
- Bench and guided summarization require Anthropic API access.

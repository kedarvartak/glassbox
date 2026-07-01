# Glassbox Documentation

Glassbox is an observability tool for AI agent memory and context. It is intended to provide a local-first, cross-tool x-ray and hygiene monitor for coding agents.

## Purpose

Use this document as the complete app documentation page. Any meaningful change to behavior, commands, configuration, architecture, public APIs, or workflows must update this file.

## Quick start

```bash
pnpm install
pnpm build
pnpm test
```

## Common commands

```bash
pnpm lint        # Run lint checks
pnpm typecheck   # Run TypeScript project checks
pnpm test        # Run tests
pnpm build       # Build all packages
pnpm clean       # Clean TypeScript build output
```

## Project structure

- `packages/` — workspace packages.
- `docs/` — supporting documentation.
- `assets/` — project assets.
- `agent-docs/` — mandatory coding-agent guidelines.
- `AGENTS.md` — root instruction file binding agents to the guidelines.
- `.github/pull_request_template.md` — pull request checklist for docs, changelog, validation, and review notes.

## Documentation requirements

When adding or changing features, update this document with:

- What changed.
- How users or developers use it.
- Any new commands, options, configuration, or environment variables.
- Any migration notes or known limitations.

## Troubleshooting

If a command fails, first verify:

1. Node.js version is `>=22`.
2. Dependencies were installed with `pnpm`.
3. The workspace is clean and package scripts are run from the repository root.

## Known limitations

- This document is currently a baseline and should be expanded as app features are implemented or changed.

# ADR 0001 — Monorepo, TypeScript, pnpm + project references

- **Status:** Accepted
- **Date:** 2026-06-04
- **Context:** doc 17 OA3 (TS/Node core + local web UI), doc 14 §2 (reuse OSS).

## Decision

A pnpm-workspace monorepo of small packages (`core`, `adapter-claude-code`,
`analysis`, `cli`, `ui`), TypeScript with **project references** for an
inside-out incremental build, ESM (`NodeNext`), Node ≥ 20, vitest for tests.

## Why

- The product's modularity (per-tool adapters that churn independently) maps
  cleanly onto per-package boundaries with enforced dependency direction.
- Project references give us correct build ordering and fast incremental builds,
  and make "core depends on nothing" a compiler-checked fact, not a convention.
- pnpm `workspace:*` linking keeps cross-package work friction-free.

## Consequences

- Each package ships its own `tsconfig.json` + `package.json`; the root is a thin
  solution config.
- Adding an adapter = a new package referencing `core` only.

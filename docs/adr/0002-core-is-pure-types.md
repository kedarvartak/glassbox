# ADR 0002 — `@glassbox/core` is pure types with zero runtime dependencies

- **Status:** Accepted
- **Date:** 2026-06-04
- **Context:** doc 14 §6 (the moat is the model + adapters), doc 17 §6.

## Decision

`core` exports TypeScript types + tiny pure helpers (branded-id constructors,
status predicates) and **nothing with a runtime dependency**. Runtime validation
of untrusted input (JSONL/SQLite) lives at the **adapter boundary**, not in core.

## Why

- Core is imported by everything; keeping it dependency-free keeps install size
  and version-conflict surface minimal, and makes the contract stable.
- Validation belongs where untrusted data enters (the adapter), which is also
  where graceful degradation (`Session.warnings`) is decided.

## Consequences

- If we want schema validation (e.g. zod) it goes in adapters, not core.
- The model stays trivially JSON-serializable (branded strings, ISO timestamps),
  so the engine can emit it as JSON and golden tests diff it.

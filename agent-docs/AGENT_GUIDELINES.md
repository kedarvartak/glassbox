# Agent Guidelines

These rules are mandatory for every coding agent working in this repository. Prefer small, clear, maintainable changes over clever or broad rewrites.

## 1. Core working principles

- Understand the existing code before editing it.
- Make the smallest change that fully solves the task.
- Keep behavior backward-compatible unless the task explicitly requires a breaking change.
- Do not hide uncertainty. If requirements are unclear, ask or document assumptions.
- Never commit secrets, tokens, local machine paths, or generated dependency folders.

## 2. Code quality standards

### Modular, maintainable code

- Keep modules focused on one responsibility.
- Extract reusable logic when it is used in multiple places or when it improves readability.
- Prefer explicit names over abbreviations.
- Keep functions short enough to understand without scrolling through unrelated logic.
- Avoid global mutable state unless there is a clear lifecycle and ownership model.
- Design APIs around simple inputs and outputs.

### Simplicity first

- Prefer straightforward code over clever abstractions.
- Do not introduce new frameworks, dependencies, or patterns without a strong reason.
- Remove dead code instead of working around it.
- Keep error handling close to the operation that can fail.

### Type safety

- Preserve and improve TypeScript types.
- Avoid `any` unless there is no practical alternative; explain why if used.
- Prefer narrow types and validated boundaries for external data.

## 3. Comments policy

Comments should explain intent, constraints, or non-obvious decisions — not restate the code.

Good comments:

- Explain why a workaround exists.
- Document important invariants or edge cases.
- Clarify external protocol, file format, or API assumptions.
- Mark temporary code with an owner/context and removal condition.

Avoid comments that:

- Repeat obvious implementation details.
- Describe what a self-explanatory function or variable already says.
- Become stale documentation for code that should be clearer instead.

When code is hard to explain, improve the code first and comment only what remains non-obvious.

## 4. Required documentation

### `DOC.md` is mandatory

Every meaningful feature, package, CLI command, config option, public API, workflow, or architectural decision must be reflected in `DOC.md`.

`DOC.md` should read like the documentation page for the app. It should include, as relevant:

- What the app does.
- How to install and run it.
- Main user workflows.
- CLI commands and options.
- Configuration files and environment variables.
- Project/package architecture.
- Public APIs and extension points.
- Troubleshooting notes.
- Known limitations.

When changing behavior, update `DOC.md` in the same change.

### `CHANGELOG.md` is mandatory

Every user-visible or developer-visible change must be recorded in `CHANGELOG.md`.

Use sections such as:

- `Added`
- `Changed`
- `Fixed`
- `Removed`
- `Deprecated`
- `Security`

Write entries from the user's perspective. Include migration notes for breaking changes.

## 5. Testing and validation

- Add or update tests for behavior changes when practical.
- Run the narrowest relevant validation first, then broader checks when appropriate.
- For this repository, prefer:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- If validation cannot be run, state why and what should be run next.

## 6. Change discipline

- Keep unrelated changes out of the diff.
- Preserve formatting and style used by nearby code.
- Do not rename or move files unless needed.
- Avoid large rewrites unless requested or clearly necessary.
- Update imports, tests, docs, and changelog together with code changes.

## 7. Dependency policy

- Do not add dependencies for small utilities that can be implemented clearly in-project.
- If adding a dependency, document why it is needed and prefer stable, maintained packages.
- Keep package manager usage consistent with this repo (`pnpm`).

## 8. Security and privacy

- Treat logs, traces, prompts, memory data, and local files as potentially sensitive.
- Avoid exposing user data in errors, telemetry, examples, or tests.
- Validate untrusted input at boundaries.
- Prefer safe defaults and explicit opt-in for risky behavior.

## 9. Final response expectations

When finishing work, agents should summarize:

- Files changed.
- What changed.
- Tests or checks run.
- Any follow-up needed.

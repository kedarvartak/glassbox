# Usage

## Install

Glassbox is a pnpm workspace. Build it once, then put a wrapper on your PATH.

```
pnpm install
pnpm build

printf '#!/usr/bin/env bash\nexec node %s/packages/cli/dist/main.js "$@"\n' "$PWD" \
  > ~/.local/bin/glassbox && chmod +x ~/.local/bin/glassbox
```

The CLI lives at `packages/cli/dist/main.js`; the wrapper just runs it as
`glassbox`.

It reads Claude Code transcripts from `~/.claude/projects`. Nothing leaves your
machine and your transcripts are never modified.

## Inspect a session

`list` discovers sessions on disk; the rest take a transcript path.

```
glassbox list
glassbox inspect ~/.claude/projects/<project>/<session>.jsonl
```

`inspect` prints the full dashboard: stats, context x-ray, cost, and reclaimable
tokens. `xray` shows just the window composition and garbage; `cost` shows spend
from provider actuals.

## Clean a session

`clean` shows the eviction plan — the provable garbage that would be removed.
Nothing is written without `--fork`.

```
glassbox clean <session.jsonl>            # dry run: show the plan
glassbox clean <session.jsonl> --fork     # write a cleaned sibling session
```

The fork writes a new `<newId>.jsonl` next to the original and prints the result:

```
tombstoned 169 copies; 66,788 tokens net reclaimed
context tokens  146.5k -> 79.7k  (46% lighter)
```

Then resume the cleaned session and the garbage is gone:

```
cd <your project dir>
claude --resume        # pick the newest session
```

Your original session is untouched and still resumable. Add `--yes` to skip the
confirmation, `--json` to get the plan as JSON.

## The web inspector

`serve` indexes your sessions and opens a local dashboard at 127.0.0.1:4317.

```
glassbox serve
```

Open a session, read its x-ray and cost, and click RUN FORK in the Context Cleaner
panel to write a cleaned session without leaving the browser. The button calls the
same fork path as the CLI.

## Keeping the index fresh

```
glassbox sessions     # list indexed sessions (fast, no re-parse)
glassbox index        # parse and incrementally index into SQLite
glassbox watch        # index, then stay live on file changes
```

## Notes

Cost figures use provider-reported token counts and are exact. Segment sizes in the
x-ray use a local estimate (about four characters per token) and are shown with an
error bar; there is no exact local Claude tokenizer.

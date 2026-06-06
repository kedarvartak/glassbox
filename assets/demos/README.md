# Demo recordings

The GIFs referenced in the root [`README.md`](../../README.md) are generated from
the [VHS](https://github.com/charmbracelet/vhs) tapes in this folder. VHS scripts
a terminal and renders a deterministic GIF, so the demos are reproducible and
re-recordable when the CLI output changes.

## Prerequisites

```bash
# install VHS (https://github.com/charmbracelet/vhs)
go install github.com/charmbracelet/vhs@latest   # or: brew install vhs

# build the CLI so `glassbox` output is current
pnpm build
```

The tapes call `glassbox` against a sample session. Set `GLASSBOX_DEMO_SESSION`
to a real `.jsonl` locator on your machine (find one with `glassbox list`), or
edit the `Type` line in each tape.

## Record everything

```bash
GLASSBOX_DEMO_SESSION="$(glassbox list | head -1 | awk '{print $3}')" \
  ./assets/demos/record-all.sh
```

## Tapes

| Tape | Produces | Feature |
|---|---|---|
| `inspect.tape` | `inspect.gif` | Full session dashboard — stats, x-ray, cost, reclaimable |
| `xray.tape` | `xray.gif` | Context composition by source + reclaimable taxonomy |
| `clean.tape` | `clean.gif` | The cleaner: dry-run plan, `--apply` to CLAUDE.md, `--compact` |
| `cost.tape` | `cost.gif` | Cost from provider actuals, cache-read recarry broken out |
| `fleet.tape` | `fleet.gif` | `index` / `sessions` / `watch` across all projects |
| `serve.tape` | `serve.gif` | Launching the local web inspector |

Each tape is self-contained and pins font, theme, and window size so all GIFs
look consistent.

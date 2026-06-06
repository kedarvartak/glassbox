#!/usr/bin/env bash
# Record every demo GIF from its VHS tape. Run from the repo root.
#
#   GLASSBOX_DEMO_SESSION="$(glassbox list | head -1 | awk '{print $3}')" \
#     ./assets/demos/record-all.sh
#
# Requires: vhs (https://github.com/charmbracelet/vhs) and a built CLI (pnpm build).
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v vhs >/dev/null 2>&1; then
  echo "error: vhs not found — install from https://github.com/charmbracelet/vhs" >&2
  exit 1
fi

for tape in assets/demos/*.tape; do
  [ "$(basename "$tape")" = "_common.tape" ] && continue
  echo "recording $tape"
  vhs "$tape"
done

echo "done — GIFs written to assets/demos/"

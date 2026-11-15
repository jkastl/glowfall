#!/usr/bin/env bash
# Build the Pages site from the committed HEAD only (ignores uncommitted work in progress), then
# copy it to the repo root, which GitHub Pages serves (Settings → Pages: main, / (root)).
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
WT=$(mktemp -d)
git -C "$ROOT" worktree add -q --detach "$WT" HEAD
ln -s "$ROOT/node_modules" "$WT/node_modules"
(cd "$WT" && npx vite build --logLevel warn)
# Remove the previous build's files (everything the build produces lives in this list), then copy.
for f in $(cat "$ROOT/.deployed" 2>/dev/null || true); do rm -f "$ROOT/$f"; done
rm -rf "$ROOT/assets"
(cd "$WT/dist" && find . -type f | sed 's|^\./||' | sort) > "$ROOT/.deployed"
cp -r "$WT/dist/." "$ROOT/"
git -C "$ROOT" worktree remove --force "$WT"
echo "site rebuilt at repo root from $(git -C "$ROOT" rev-parse --short HEAD)"

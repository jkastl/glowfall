#!/usr/bin/env bash
# Build the Pages site from the committed HEAD only (ignores uncommitted work in progress),
# then copy the result into ./docs.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
WT=$(mktemp -d)
git -C "$ROOT" worktree add -q --detach "$WT" HEAD
ln -s "$ROOT/node_modules" "$WT/node_modules"
(cd "$WT" && npx vite build --logLevel warn)
rm -rf "$ROOT/docs"
cp -r "$WT/docs" "$ROOT/docs"
git -C "$ROOT" worktree remove --force "$WT"
echo "docs/ rebuilt from $(git -C "$ROOT" rev-parse --short HEAD)"

#!/bin/sh
# Publish a read-only snapshot of the checker to the gh-pages branch of the
# "origin" remote, where GitHub Pages serves it. The branch holds only the
# generated site and is replaced on every publish.
set -eu
cd "$(dirname "$0")/.."
remote=$(git remote get-url origin)
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT

node --disable-warning=ExperimentalWarning src/export.js "$out"

cd "$out"
git init -q -b gh-pages
git add -A
git commit -q -m "${DEPLOY_MESSAGE:-Publish snapshot $(date -u +%Y-%m-%dT%H:%MZ)}"
git push -q --force "$remote" gh-pages
echo "Published to the gh-pages branch of $remote. GitHub Pages can take a minute to update."

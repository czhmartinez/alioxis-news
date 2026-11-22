#!/bin/bash
# Publish the built static site on this same machine (build host == CVM).
# Mirrors scripts/publish-to-cvm.sh but without SSH: atomic swap of
# /opt/ainews/dist, keeping dist.prev as rollback.
#
# Usage: bash scripts/publish-local.sh [dist-dir] [target-dir]
#   dist-dir   default <repo>/dist
#   target-dir default $AINEWS_CVM_DIR or /opt/ainews
#
# Run only after `node build.js` succeeds. Never point this at a dist
# built from incomplete data (it replaces the live site).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="${1:-$ROOT/dist}"
TARGET="${2:-${AINEWS_CVM_DIR:-/opt/ainews}}"

if [[ ! -d "$DIST" ]]; then
  echo "missing dist: $DIST" >&2
  exit 1
fi

rm -rf "$TARGET/dist.next" && mkdir -p "$TARGET/dist.next"
cp -a "$DIST/." "$TARGET/dist.next/"
rm -rf "$TARGET/dist.prev"
if [[ -d "$TARGET/dist" ]]; then
  mv "$TARGET/dist" "$TARGET/dist.prev"
fi
mv "$TARGET/dist.next" "$TARGET/dist"
find "$TARGET/dist" -type f | wc -l
echo "published to $TARGET/dist (prev kept at $TARGET/dist.prev)"

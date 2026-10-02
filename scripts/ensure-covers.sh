#!/usr/bin/env bash
# Checklist helper: list cards missing images for a given day.
# Usage: ./scripts/ensure-covers.sh [YYYY-MM-DD]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DAY="${1:-$(date +%F)}"
DIR="$ROOT/data/$DAY"
if [[ ! -d "$DIR" ]]; then
  echo "No data dir: $DIR" >&2
  exit 1
fi
python3 - << PY
import json, sys
from pathlib import Path
day = Path("$DIR")
for name in ("ai.json", "v.json"):
    p = day / name
    if not p.exists():
        print(f"{name}: (missing file)")
        continue
    items = json.loads(p.read_text())
    missing = [(i, it.get("title", "")[:70]) for i, it in enumerate(items) if not it.get("image")]
    print(f"{name}: {len(missing)} missing / {len(items)} total")
    for i, t in missing:
        prefix = "ai" if name.startswith("ai") else "v"
        print(f"  [{i:02d}] → assets/covers/cover-{prefix}-{i:02d}.png  |  {t}")
print("\nSee scripts/ensure-covers.md for the full generate → JSON → build routine.")
PY

#!/usr/bin/env python3
"""Compress generated cover PNGs to ~960px JPEG q72 and wire into ai.json/v.json for 2026-09-08."""
from __future__ import annotations
import json
from pathlib import Path
from PIL import Image

DATE = "2026-09-08"
ROOT = Path("/workspace/alioxis-news")
COVERS = ROOT / "assets/covers"
DATA = ROOT / "data" / DATE
PROMPTS = DATA / "_cover_prompts.json"
SEARCH_DIRS = [
    Path("/tmp"),
    Path("/workspace"),
    Path("/home/box"),
    COVERS,
    Path("/home/box/.cursor"),
]

def find_png(name: str) -> Path | None:
    # exact name anywhere common, then fuzzy
    candidates = []
    for d in SEARCH_DIRS:
        if not d.exists():
            continue
        p = d / name
        if p.is_file():
            return p
        for p in d.rglob(name):
            if p.is_file():
                candidates.append(p)
    return candidates[0] if candidates else None

def compress(src: Path, dest: Path) -> int:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    target_w = 960
    if w != target_w:
        nh = max(1, round(h * target_w / w))
        im = im.resize((target_w, nh), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "JPEG", quality=72, optimize=True)
    return dest.stat().st_size

def main():
    prompts = json.loads(PROMPTS.read_text())
    by_kind = {"ai": {}, "v": {}}
    ok = fail = 0
    for item in prompts:
        png_name = item["filename_png"]
        jpg_name = item["filename_jpg"]
        dest = COVERS / jpg_name
        src = find_png(png_name)
        if src is None:
            # also accept already-jpg
            if dest.is_file() and dest.stat().st_size > 10_000:
                by_kind[item["kind"]][item["index"]] = item["image_path"]
                ok += 1
                print(f"keep {jpg_name}")
                continue
            print(f"MISSING png for {png_name}")
            fail += 1
            continue
        size = compress(src, dest)
        by_kind[item["kind"]][item["index"]] = item["image_path"]
        ok += 1
        print(f"OK {jpg_name} from {src} -> {size//1024}KB")
        # cleanup oversized original if under /tmp or workspace root
        if src.suffix.lower() == ".png" and src.resolve() != dest.resolve():
            try:
                if src.stat().st_size > 200_000 and str(src).startswith(("/tmp", "/workspace")):
                    src.unlink(missing_ok=True)
            except Exception:
                pass

    for kind in ("ai", "v"):
        path = DATA / f"{kind}.json"
        cards = json.loads(path.read_text())
        for i, card in enumerate(cards):
            if i in by_kind[kind]:
                card["image"] = by_kind[kind][i]
        path.write_text(json.dumps(cards, ensure_ascii=False, indent=2) + "\n")
        print(f"updated {path} ({len(by_kind[kind])} images set)")
    print(f"done ok={ok} fail={fail}")

if __name__ == "__main__":
    main()

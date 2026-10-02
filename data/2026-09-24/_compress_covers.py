#!/usr/bin/env python3
"""Compress _gen_raw PNGs -> assets/covers JPEGs and update ai.json/v.json. Run AFTER GenerateImage fills _gen_raw."""
import json
from pathlib import Path
from PIL import Image

DATE = "2026-09-24"
ROOT = Path("/workspace/alioxis-news")
DATA = ROOT / f"data/{DATE}"
RAW = DATA / "_gen_raw"
OUT = ROOT / "assets/covers"
OUT.mkdir(parents=True, exist_ok=True)

mapping = []
for prefix in ("ai", "v"):
    prompts = json.loads((DATA / f"_cover_prompts_{prefix}.json").read_text())
    items = json.loads((DATA / f"{prefix}.json").read_text())
    for e in prompts:
        idx = e["idx"]
        raw = RAW / e["filename"]
        jpg_name = e["jpg"]
        jpg_path = OUT / jpg_name
        ok = False
        nbytes = 0
        if raw.is_file():
            im = Image.open(raw).convert("RGB")
            w, h = im.size
            if w > 960:
                im = im.resize((960, max(1, round(h * 960 / w))), Image.LANCZOS)
            im.save(jpg_path, "JPEG", quality=72, optimize=True)
            nbytes = jpg_path.stat().st_size
            items[idx]["image"] = f"/assets/covers/{jpg_name}"
            ok = True
            print(f"OK {prefix}-{idx:02d} {nbytes}B")
        else:
            print(f"FAIL {prefix}-{idx:02d} missing {raw}")
        mapping.append({
            "prefix": prefix, "idx": idx, "ok": ok,
            "raw": str(raw) if ok else None,
            "jpg": f"/assets/covers/{jpg_name}",
            "bytes": nbytes,
        })
    (DATA / f"{prefix}.json").write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

(DATA / "_cover_mapping.json").write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
oks = [m for m in mapping if m["ok"]]
fails = [m for m in mapping if not m["ok"]]
sizes = [m["bytes"] for m in oks]
ai_ok = sum(1 for m in oks if m["prefix"] == "ai")
v_ok = sum(1 for m in oks if m["prefix"] == "v")
report = (
    f"covers {DATE}: ai={ai_ok}/16 v={v_ok}/16 unique GenerateImage content-scenes; ok={len(oks)} fail={len(fails)}\n"
    f"jpg size range: {min(sizes) if sizes else 'n/a'}–{max(sizes) if sizes else 'n/a'} bytes\n"
    f"sample: {[(Path(m['jpg']).name, m['bytes']) for m in oks[:3]]}\n"
)
(DATA / "_covers_report.txt").write_text(report, encoding="utf-8")
print(report)

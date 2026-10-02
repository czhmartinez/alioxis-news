#!/usr/bin/env python3
"""Compress raw v covers and wire v.json. Expects _cover_raw/v-XX.png (or .jpg)."""
import json
from pathlib import Path
from PIL import Image

DATA = Path('/workspace/alioxis-news/data/2026-09-30')
RAW = DATA / '_cover_raw'
OUT = Path('/workspace/alioxis-news/assets/covers')
OUT.mkdir(parents=True, exist_ok=True)
prompts = json.loads((DATA/'_cover_prompts_v.json').read_text())
items = json.loads((DATA/'v.json').read_text())
ok = 0
lines = []
for p in prompts:
    i = p['idx']
    src = None
    for name in (f'v-{i:02d}.png', f'v-{i:02d}.jpg', f'cover-20260930-v-{i:02d}.png', p['filename']):
        cand = RAW / name
        if cand.exists():
            src = cand
            break
    if not src:
        lines.append(f'v-{i:02d} MISSING raw')
        continue
    im = Image.open(src).convert('RGB')
    w, h = im.size
    target = 16/9
    if w/h > target:
        nw = int(h * target); left = (w-nw)//2; im = im.crop((left,0,left+nw,h))
    else:
        nh = int(w / target); top = (h-nh)//2; im = im.crop((0,top,w,top+nh))
    im = im.resize((960,540), Image.Resampling.LANCZOS)
    dest = OUT / p['jpg']
    im.save(dest, 'JPEG', quality=72, optimize=True)
    items[i]['image'] = p['image_path']
    ok += 1
    lines.append(f"v-{i:02d} {dest.stat().st_size} {im.size}")
(DATA/'v.json').write_text(json.dumps(items, ensure_ascii=False, indent=2)+'\n')
report = f"covers 2026-09-30 大V视野: {ok}/{len(prompts)}\n" + "\n".join(lines) + "\n"
(DATA/'_covers_report_v.txt').write_text(report)
print(report)

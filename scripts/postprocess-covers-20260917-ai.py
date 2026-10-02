#!/usr/bin/env python3
"""Post-process 2026-09-17 AI covers after parent GenerateImage.
Looks for PNGs in CWD, agent assets, /tmp, or workspace; writes JPEG to assets/covers/; updates ai.json.
"""
import json, hashlib
from pathlib import Path
from PIL import Image

ROOT = Path('/workspace/alioxis-news')
PROMPTS = ROOT / 'data/2026-09-17/_cover_prompts_ai.json'
AI_JSON = ROOT / 'data/2026-09-17/ai.json'
OUT_DIR = ROOT / 'assets/covers'
OUT_DIR.mkdir(parents=True, exist_ok=True)

prompts = json.loads(PROMPTS.read_text())
ai = json.loads(AI_JSON.read_text())

search_roots = [
    Path('/workspace'),
    Path('/workspace/alioxis-news'),
    Path('/workspace/alioxis-news/assets/covers'),
    Path('/tmp'),
    Path('/home/box/agent-data/agents'),
]

def find_png(name: str):
    # exact name first
    for root in search_roots:
        if not root.exists():
            continue
        direct = root / name
        if direct.is_file():
            return direct
        # recursive shallow for agent assets
        if root.name == 'agents':
            for p in root.glob(f'*/assets/{name}'):
                return p
            # also newest pngs won't match name — caller should pass paths via manifest
    return None

ok, fail = [], []
for entry in prompts:
    i = entry['index']
    jpg_name = entry['filename_jpg']
    png_name = entry['filename_png']
    src = find_png(png_name)
    # also accept already-placed jpg regeneration from any png matching index in prompts folder
    if src is None:
        # accept hashed agent assets listed in optional manifest
        man = ROOT / 'data/2026-09-17/_cover_manifest.json'
        if man.exists():
            m = json.loads(man.read_text())
            key = f'ai-{i:02d}'
            if key in m and Path(m[key].get('src','')).is_file():
                src = Path(m[key]['src'])
    if src is None:
        fail.append(i)
        print(f'FAIL [{i:02d}] missing {png_name}')
        continue
    im = Image.open(src).convert('RGB')
    w, h = im.size
    if w > 960:
        nh = int(h * 960 / w)
        im = im.resize((960, nh), Image.Resampling.LANCZOS)
    out = OUT_DIR / jpg_name
    im.save(out, 'JPEG', quality=72, optimize=True)
    ai[i]['image'] = f'/assets/covers/{jpg_name}'
    ok.append((i, out.stat().st_size))
    print(f'OK  [{i:02d}] {src} -> {out} ({out.stat().st_size} bytes)')

AI_JSON.write_text(json.dumps(ai, ensure_ascii=False, indent=2) + '\n')
print(f'done ok={len(ok)} fail={len(fail)} missing={fail}')

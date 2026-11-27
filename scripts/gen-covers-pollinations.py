#!/usr/bin/env python3
"""Resumable cover generation via pollinations.ai. Usage: gen-covers-pollinations.py YYYY-MM-DD [ai|v ...]"""
import json, sys, os, io, time, urllib.parse, urllib.request, random
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
day = sys.argv[1]; kinds = sys.argv[2:] or ["ai", "v"]
out = os.path.join(ROOT, "assets/covers")
ok = fail = skip = 0
for k in kinds:
    p = os.path.join(ROOT, "data", day, f"_cover_prompts_{k}.json")
    if not os.path.exists(p): print("missing", p); continue
    for it in json.load(open(p)):
        dst = os.path.join(out, it["file"])
        if os.path.exists(dst) and os.path.getsize(dst) > 10000: skip += 1; continue
        done = False
        for attempt in range(4):
            seed = random.randint(1, 10**6)
            url = "https://image.pollinations.ai/prompt/" + urllib.parse.quote(it["prompt"]) + f"?width=1280&height=720&nologo=true&seed={seed}&model=flux"
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                data = urllib.request.urlopen(req, timeout=120).read()
                im = Image.open(io.BytesIO(data)).convert("RGB")
                w, h = im.size
                im = im.crop((0, 0, w, h - max(40, int(h * 0.085)))); w, h = im.size  # crop pollinations watermark
                im = im.resize((960, int(h * 960 / w)), Image.LANCZOS)
                im.save(dst, "JPEG", quality=72, optimize=True, progressive=True)
                print("ok", it["file"], os.path.getsize(dst), flush=True); ok += 1; done = True; break
            except Exception as e:
                print("retry", it["file"], attempt, e, flush=True); time.sleep(5 + attempt * 5)
        if not done: fail += 1
print(f"done ok={ok} skip={skip} fail={fail}")

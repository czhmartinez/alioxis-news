#!/usr/bin/env python3
# usage: compress-cover-map.py YYYYMMDD map.json  -> compress each {"ai-00": src} to assets/covers/cover-YYYYMMDD-ai-00.jpg (skip existing)
import json, sys, os
from PIL import Image
day, mp = sys.argv[1], sys.argv[2]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
m = json.load(open(mp))
for k, src in m.items():
    out = os.path.join(root, 'assets/covers', f'cover-{day}-{k}.jpg')
    if os.path.exists(out) or not os.path.exists(src):
        continue
    im = Image.open(src).convert('RGB')
    if im.width > 960:
        im = im.resize((960, round(im.height * 960 / im.width)), Image.LANCZOS)
    im.save(out, 'JPEG', quality=72, optimize=True, progressive=True)
    print(k, os.path.getsize(out))

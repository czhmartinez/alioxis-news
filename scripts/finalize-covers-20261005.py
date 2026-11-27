#!/usr/bin/env python3
"""Finalize 2026-10-05 covers after the parent's GenerateImage calls.
Input: data/2026-10-05/_cover_id_map.json  {"ai-00": "/abs/path/raw.(png|jpg)", ..., "v-16": ...}
Copies raws to _cover_raw/, compresses to 960w JPEG q72 -> assets/covers/, fills image fields,
writes _covers_report.txt. Exits 1 (and changes nothing in ai.json/v.json) if any cover is missing.
"""
import json, shutil, sys, time
from pathlib import Path
from PIL import Image
ROOT=Path('/workspace/alioxis-news'); D=ROOT/'data/2026-10-05'; OUT=ROOT/'assets/covers'; RAW=D/'_cover_raw'
OUT.mkdir(parents=True,exist_ok=True); RAW.mkdir(exist_ok=True)
m=json.loads((D/'_cover_id_map.json').read_text())
data={t:json.loads((D/f'{t}.json').read_text()) for t in ('ai','v')}
missing=[f'{t}-{i:02d}' for t in data for i in range(len(data[t])) if not Path(m.get(f'{t}-{i:02d}','/nonexistent')).is_file()]
if missing: print('MISSING',missing); sys.exit(1)
lines=['Alioxis News covers 2026-10-05','='*40]
for t,items in data.items():
    for i,it in enumerate(items):
        k=f'{t}-{i:02d}'; src=Path(m[k]); shutil.copy(src,RAW/f'{k}-raw{src.suffix}')
        im=Image.open(src).convert('RGB'); w,h=im.size
        if w>960: im=im.resize((960,round(h*960/w)),Image.Resampling.LANCZOS)
        fn=f'cover-20261005-{k}.jpg'; out=OUT/fn
        q=72; im.save(out,'JPEG',quality=q,optimize=True,progressive=True)
        while out.stat().st_size>110_000 and q>55: q-=6; im.save(out,'JPEG',quality=q,optimize=True,progressive=True)
        it['image']=f'/assets/covers/{fn}'
        lines.append(f'{k} {out.stat().st_size}B {out}' + (f' (q{q})' if q!=72 else ''))
for t,items in data.items(): (D/f'{t}.json').write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
lines.append(f'total ai={len(data["ai"])} v={len(data["v"])} time={time.strftime("%Y-%m-%d %H:%M:%S")} Asia/Taipei')
(D/'_covers_report.txt').write_text('\n'.join(lines)+'\n'); print('\n'.join(lines))

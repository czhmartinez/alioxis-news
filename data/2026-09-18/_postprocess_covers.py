#!/usr/bin/env python3
"""Post-process generated 2026-09-18 cover images from a JSON mapping.

Usage:
  python _postprocess_covers.py mapping.json

Mapping formats accepted:
  {"ai-00": "/tmp/generated.png", "v-00": {"src": "/home/box/downloads/v.png"}}
  [{"kind": "ai", "index": 0, "src": "/tmp/generated.png"}, ...]

Keys are ai-NN/v-NN; sources may be PNG, JPEG, or any Pillow-readable image.
"""
import argparse
import json
from pathlib import Path
from PIL import Image

ROOT = Path('/workspace/alioxis-news')
DATA = ROOT / 'data/2026-09-18'
OUT_DIR = ROOT / 'assets/covers'


def load_mapping(path: Path):
    raw = json.loads(path.read_text())
    result = {}
    if isinstance(raw, dict):
        for key, value in raw.items():
            if isinstance(value, str):
                result[key] = value
            elif isinstance(value, dict):
                src = value.get('src') or value.get('path') or value.get('file')
                if src:
                    result[key] = src
    elif isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            key = entry.get('key')
            if not key and entry.get('kind') is not None and entry.get('index') is not None:
                key = f"{entry['kind']}-{int(entry['index']):02d}"
            src = entry.get('src') or entry.get('path') or entry.get('file')
            if key and src:
                result[key] = src
    return result


def process(kind, prompts, mapping, records):
    ok, fail = [], []
    json_path = DATA / f'{kind}.json'
    source_items = json.loads(json_path.read_text())
    for entry in prompts:
        index = int(entry['index'])
        key = f'{kind}-{index:02d}'
        src_value = mapping.get(key)
        if not src_value:
            fail.append((key, 'no mapping'))
            print(f'FAIL [{key}] no mapping entry')
            continue
        src = Path(src_value).expanduser()
        if not src.is_file():
            fail.append((key, f'missing source {src}'))
            print(f'FAIL [{key}] missing source {src}')
            continue
        try:
            with Image.open(src) as image:
                image = image.convert('RGB')
                width, height = image.size
                target_width = 960
                target_height = max(1, round(height * target_width / width))
                if (width, height) != (target_width, target_height):
                    image = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
                out_name = entry['filename']
                out_path = OUT_DIR / out_name
                out_path.parent.mkdir(parents=True, exist_ok=True)
                image.save(out_path, 'JPEG', quality=72, optimize=True)
            source_items[index]['image'] = f'/assets/covers/{out_name}'
            ok.append(key)
            print(f'OK [{key}] {src} -> {out_path} ({out_path.stat().st_size} bytes)')
        except Exception as exc:
            fail.append((key, str(exc)))
            print(f'FAIL [{key}] {src}: {exc}')
    json_path.write_text(json.dumps(source_items, ensure_ascii=False, indent=2) + '\n')
    return ok, fail


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mapping', type=Path, help='JSON mapping of ai-NN/v-NN to source image paths')
    args = parser.parse_args()
    mapping = load_mapping(args.mapping)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    totals = {}
    for kind in ('ai', 'v'):
        prompts = json.loads((DATA / f'_cover_prompts_{kind}.json').read_text())
        totals[kind] = process(kind, prompts, mapping, {})
    print(f"done ai_ok={len(totals['ai'][0])} ai_fail={len(totals['ai'][1])} "
          f"v_ok={len(totals['v'][0])} v_fail={len(totals['v'][1])}")
    raise SystemExit(1 if any(totals[k][1] for k in totals) else 0)


if __name__ == '__main__':
    main()

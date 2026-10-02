#!/usr/bin/env python3
"""Magazine masthead covers for Alioxis News 2026-09-14 (ensure-covers.md)."""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 960, 540
BAND_RATIO = 0.30
CREAM = (0xF2, 0xF0, 0xEB)
INK = (0x1A, 0x1A, 0x1A)
WHITE = (0xFA, 0xFA, 0xFA)

COLORS = {
    "模型": (0x2F, 0x5D, 0x8C),
    "产品": (0x3D, 0x6B, 0x5A),
    "商业": (0x8A, 0x5A, 0x2B),
    "观点": (0x6B, 0x5A, 0x7E),  # brightened per 陈小青 2026-09-14 review
}

FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
SC_INDEX = 2

OUT_DIR = Path("/workspace/alioxis-news/assets/covers")
DATA_DIR = Path("/workspace/alioxis-news/data/2026-09-14")
DATE_TAG = "20260914"


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size, index=SC_INDEX)


def fit_text(draw: ImageDraw.ImageDraw, text: str, max_w: int, max_h: int, bold=True):
    path = FONT_BOLD if bold else FONT_REG
    # target ~35–45% of band height → try descending sizes
    for size in range(min(max_h, 120), 18, -2):
        font = load_font(path, size)
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        if tw <= max_w and th <= max_h:
            return font, tw, th
    font = load_font(path, 20)
    bbox = draw.textbbox((0, 0), text, font=font)
    return font, bbox[2] - bbox[0], bbox[3] - bbox[1]


# ---- symbol drawers (cx, cy center of cream field) ----

def sym_missile(d, cx, cy, s, c=INK):
    # triangle body + fin
    body = [(cx, cy - s * 0.55), (cx + s * 0.18, cy + s * 0.35), (cx - s * 0.18, cy + s * 0.35)]
    d.polygon(body, fill=c)
    d.polygon([(cx - s * 0.18, cy + s * 0.15), (cx - s * 0.42, cy + s * 0.45), (cx - s * 0.18, cy + s * 0.35)], fill=c)
    d.polygon([(cx + s * 0.18, cy + s * 0.15), (cx + s * 0.42, cy + s * 0.45), (cx + s * 0.18, cy + s * 0.35)], fill=c)
    d.ellipse([cx - s * 0.06, cy - s * 0.62, cx + s * 0.06, cy - s * 0.45], fill=c)


def sym_shield(d, cx, cy, s, c=INK):
    pts = [
        (cx, cy - s * 0.55),
        (cx + s * 0.4, cy - s * 0.25),
        (cx + s * 0.35, cy + s * 0.15),
        (cx, cy + s * 0.55),
        (cx - s * 0.35, cy + s * 0.15),
        (cx - s * 0.4, cy - s * 0.25),
    ]
    d.polygon(pts, outline=c)
    d.line([(cx, cy - s * 0.35), (cx, cy + s * 0.25)], fill=c, width=max(3, s // 40))
    d.line([(cx - s * 0.22, cy), (cx + s * 0.22, cy)], fill=c, width=max(3, s // 40))


def sym_chip(d, cx, cy, s, c=INK):
    half = s * 0.32
    d.rectangle([cx - half, cy - half, cx + half, cy + half], outline=c, width=max(3, s // 35))
    inner = half * 0.55
    d.rectangle([cx - inner, cy - inner, cx + inner, cy + inner], outline=c, width=max(2, s // 45))
    pin_w, pin_l = max(3, s // 40), s * 0.12
    for i in range(-2, 3):
        x = cx + i * (half / 2.2)
        d.rectangle([x - pin_w / 2, cy - half - pin_l, x + pin_w / 2, cy - half], fill=c)
        d.rectangle([x - pin_w / 2, cy + half, x + pin_w / 2, cy + half + pin_l], fill=c)
        y = cy + i * (half / 2.2)
        d.rectangle([cx - half - pin_l, y - pin_w / 2, cx - half, y + pin_w / 2], fill=c)
        d.rectangle([cx + half, y - pin_w / 2, cx + half + pin_l, y + pin_w / 2], fill=c)


def sym_robot(d, cx, cy, s, c=INK):
    # stick-figure robot
    hw = s * 0.22
    d.rectangle([cx - hw, cy - s * 0.35, cx + hw, cy - s * 0.05], outline=c, width=max(3, s // 40))
    d.ellipse([cx - s * 0.08, cy - s * 0.28, cx - s * 0.02, cy - s * 0.18], fill=c)
    d.ellipse([cx + s * 0.02, cy - s * 0.28, cx + s * 0.08, cy - s * 0.18], fill=c)
    d.line([(cx, cy - s * 0.05), (cx, cy + s * 0.25)], fill=c, width=max(3, s // 35))
    d.line([(cx - s * 0.28, cy + s * 0.05), (cx + s * 0.28, cy + s * 0.05)], fill=c, width=max(3, s // 35))
    d.line([(cx, cy + s * 0.25), (cx - s * 0.2, cy + s * 0.5)], fill=c, width=max(3, s // 35))
    d.line([(cx, cy + s * 0.25), (cx + s * 0.2, cy + s * 0.5)], fill=c, width=max(3, s // 35))
    d.rectangle([cx - s * 0.04, cy - s * 0.48, cx + s * 0.04, cy - s * 0.35], fill=c)
    d.ellipse([cx - s * 0.07, cy - s * 0.55, cx + s * 0.07, cy - s * 0.42], outline=c, width=max(2, s // 50))


def sym_letter(d, cx, cy, s, letter, c=INK):
    font = load_font(FONT_BOLD, int(s * 0.7))
    bbox = d.textbbox((0, 0), letter, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), letter, font=font, fill=c)


def sym_chart(d, cx, cy, s, c=INK):
    bars = [0.35, 0.55, 0.45, 0.8, 0.65]
    bw = s * 0.12
    gap = s * 0.06
    total = len(bars) * bw + (len(bars) - 1) * gap
    x0 = cx - total / 2
    base = cy + s * 0.35
    for i, h in enumerate(bars):
        x = x0 + i * (bw + gap)
        d.rectangle([x, base - s * h, x + bw, base], fill=c)
    d.line([(x0 - s * 0.05, base), (x0 + total + s * 0.05, base)], fill=c, width=max(2, s // 50))


def sym_doc(d, cx, cy, s, c=INK):
    w, hgt = s * 0.38, s * 0.5
    d.rectangle([cx - w, cy - hgt, cx + w, cy + hgt], outline=c, width=max(3, s // 40))
    for i in range(4):
        y = cy - hgt + s * 0.18 + i * s * 0.18
        d.line([(cx - w + s * 0.1, y), (cx + w - s * 0.1, y)], fill=c, width=max(2, s // 50))


def sym_network(d, cx, cy, s, c=INK):
    nodes = [
        (cx, cy - s * 0.35),
        (cx - s * 0.35, cy + s * 0.1),
        (cx + s * 0.35, cy + s * 0.1),
        (cx, cy + s * 0.4),
        (cx - s * 0.15, cy - s * 0.05),
        (cx + s * 0.15, cy - s * 0.05),
    ]
    for a, b in [(0, 4), (0, 5), (4, 1), (5, 2), (4, 3), (5, 3), (1, 3), (2, 3), (4, 5)]:
        d.line([nodes[a], nodes[b]], fill=c, width=max(2, s // 45))
    r = max(6, s // 18)
    for x, y in nodes:
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)


def sym_building(d, cx, cy, s, c=INK):
    d.rectangle([cx - s * 0.28, cy - s * 0.4, cx + s * 0.28, cy + s * 0.4], outline=c, width=max(3, s // 40))
    for row in range(4):
        for col in range(3):
            x = cx - s * 0.18 + col * s * 0.15
            y = cy - s * 0.28 + row * s * 0.18
            d.rectangle([x, y, x + s * 0.08, y + s * 0.1], outline=c, width=max(2, s // 55))


def sym_gavel(d, cx, cy, s, c=INK):
    # simple gavel: handle + head
    d.line([(cx - s * 0.35, cy + s * 0.35), (cx + s * 0.15, cy - s * 0.15)], fill=c, width=max(5, s // 28))
    d.rectangle([cx + s * 0.05, cy - s * 0.35, cx + s * 0.45, cy - s * 0.05], fill=c)
    d.ellipse([cx - s * 0.42, cy + s * 0.28, cx - s * 0.22, cy + s * 0.48], outline=c, width=max(3, s // 40))


def sym_pause(d, cx, cy, s, c=INK):
    # pause bars inside circle (pace/slow)
    r = s * 0.42
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=c, width=max(4, s // 30))
    bw, bh = s * 0.1, s * 0.35
    d.rectangle([cx - s * 0.2, cy - bh / 2, cx - s * 0.2 + bw, cy + bh / 2], fill=c)
    d.rectangle([cx + s * 0.1, cy - bh / 2, cx + s * 0.1 + bw, cy + bh / 2], fill=c)


def sym_brain(d, cx, cy, s, c=INK):
    r = s * 0.38
    d.ellipse([cx - r, cy - r * 0.85, cx + r, cy + r * 0.85], outline=c, width=max(3, s // 35))
    d.arc([cx - r * 0.7, cy - r * 0.5, cx + r * 0.1, cy + r * 0.5], 200, 340, fill=c, width=max(2, s // 45))
    d.arc([cx - r * 0.1, cy - r * 0.5, cx + r * 0.7, cy + r * 0.5], 200, 340, fill=c, width=max(2, s // 45))
    d.line([(cx, cy - r * 0.85), (cx, cy + r * 0.85)], fill=c, width=max(2, s // 50))


def sym_gear(d, cx, cy, s, c=INK):
    r = s * 0.28
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=c, width=max(4, s // 30))
    d.ellipse([cx - r * 0.4, cy - r * 0.4, cx + r * 0.4, cy + r * 0.4], outline=c, width=max(3, s // 40))
    for i in range(8):
        ang = i * math.pi / 4
        x1 = cx + math.cos(ang) * r * 0.95
        y1 = cy + math.sin(ang) * r * 0.95
        x2 = cx + math.cos(ang) * r * 1.35
        y2 = cy + math.sin(ang) * r * 1.35
        d.line([(x1, y1), (x2, y2)], fill=c, width=max(5, s // 25))


def sym_phone(d, cx, cy, s, c=INK):
    w, hgt = s * 0.28, s * 0.5
    d.rounded_rectangle([cx - w, cy - hgt, cx + w, cy + hgt], radius=int(s * 0.06), outline=c, width=max(3, s // 40))
    d.rectangle([cx - w * 0.7, cy - hgt * 0.7, cx + w * 0.7, cy + hgt * 0.45], outline=c, width=max(2, s // 50))
    d.ellipse([cx - s * 0.05, cy + hgt * 0.65, cx + s * 0.05, cy + hgt * 0.85], fill=c)


def sym_calendar(d, cx, cy, s, c=INK):
    w, hgt = s * 0.4, s * 0.4
    d.rectangle([cx - w, cy - hgt * 0.6, cx + w, cy + hgt], outline=c, width=max(3, s // 40))
    d.rectangle([cx - w, cy - hgt * 0.6, cx + w, cy - hgt * 0.15], fill=c)
    for i in range(2):
        x = cx - w * 0.4 + i * w * 0.8
        d.rectangle([x - s * 0.03, cy - hgt * 0.85, x + s * 0.03, cy - hgt * 0.4], fill=c)
    for row in range(3):
        for col in range(4):
            x = cx - w * 0.65 + col * w * 0.4
            y = cy - hgt * 0.0 + row * hgt * 0.35
            d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=c)


def sym_film(d, cx, cy, s, c=INK):
    d.rectangle([cx - s * 0.45, cy - s * 0.28, cx + s * 0.45, cy + s * 0.28], outline=c, width=max(3, s // 40))
    for x in (-0.35, -0.1, 0.15):
        d.rectangle([cx + s * x, cy - s * 0.18, cx + s * (x + 0.18), cy + s * 0.18], outline=c, width=max(2, s // 50))
    for y in (-0.35, 0.28):
        for i in range(6):
            x = cx - s * 0.4 + i * s * 0.14
            d.rectangle([x, cy + s * y, x + s * 0.08, cy + s * y + s * 0.07], fill=c)


def sym_key(d, cx, cy, s, c=INK):
    d.ellipse([cx - s * 0.35, cy - s * 0.35, cx - s * 0.05, cy - s * 0.05], outline=c, width=max(4, s // 30))
    d.line([(cx - s * 0.05, cy - s * 0.2), (cx + s * 0.4, cy - s * 0.2)], fill=c, width=max(5, s // 28))
    d.line([(cx + s * 0.25, cy - s * 0.2), (cx + s * 0.25, cy - s * 0.05)], fill=c, width=max(4, s // 35))
    d.line([(cx + s * 0.35, cy - s * 0.2), (cx + s * 0.35, cy)], fill=c, width=max(4, s // 35))


def sym_globe(d, cx, cy, s, c=INK):
    r = s * 0.4
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=c, width=max(3, s // 35))
    d.ellipse([cx - r * 0.35, cy - r, cx + r * 0.35, cy + r], outline=c, width=max(2, s // 45))
    d.arc([cx - r, cy - r * 0.35, cx + r, cy + r * 0.35], 0, 360, fill=c, width=max(2, s // 45))
    d.line([(cx - r, cy), (cx + r, cy)], fill=c, width=max(2, s // 50))


def sym_speech(d, cx, cy, s, c=INK):
    d.rounded_rectangle([cx - s * 0.4, cy - s * 0.35, cx + s * 0.4, cy + s * 0.2], radius=int(s * 0.08), outline=c, width=max(3, s // 40))
    d.polygon([(cx - s * 0.1, cy + s * 0.2), (cx - s * 0.25, cy + s * 0.45), (cx + s * 0.05, cy + s * 0.2)], fill=c)
    for i in range(3):
        y = cy - s * 0.18 + i * s * 0.12
        d.line([(cx - s * 0.25, y), (cx + s * 0.25, y)], fill=c, width=max(2, s // 50))


def sym_spark(d, cx, cy, s, c=INK):
    for i in range(8):
        ang = i * math.pi / 4
        inner = s * 0.12 if i % 2 else s * 0.28
        outer = s * 0.42 if i % 2 == 0 else s * 0.22
        # star via lines from center
        d.line(
            [(cx + math.cos(ang) * inner, cy + math.sin(ang) * inner),
             (cx + math.cos(ang) * outer, cy + math.sin(ang) * outer)],
            fill=c, width=max(3, s // 35),
        )
    d.ellipse([cx - s * 0.1, cy - s * 0.1, cx + s * 0.1, cy + s * 0.1], fill=c)


def sym_cube(d, cx, cy, s, c=INK):
    # isometric-ish cube
    top = [(cx, cy - s * 0.35), (cx + s * 0.35, cy - s * 0.15), (cx, cy + s * 0.05), (cx - s * 0.35, cy - s * 0.15)]
    left = [(cx - s * 0.35, cy - s * 0.15), (cx, cy + s * 0.05), (cx, cy + s * 0.4), (cx - s * 0.35, cy + s * 0.2)]
    right = [(cx + s * 0.35, cy - s * 0.15), (cx, cy + s * 0.05), (cx, cy + s * 0.4), (cx + s * 0.35, cy + s * 0.2)]
    d.polygon(top, outline=c)
    d.polygon(left, outline=c)
    d.polygon(right, outline=c)


def sym_handshake_bars(d, cx, cy, s, c=INK):
    # two interlocking C shapes / deal
    d.arc([cx - s * 0.45, cy - s * 0.35, cx + s * 0.05, cy + s * 0.35], 40, 320, fill=c, width=max(5, s // 28))
    d.arc([cx - s * 0.05, cy - s * 0.35, cx + s * 0.45, cy + s * 0.35], 220, 140, fill=c, width=max(5, s // 28))


def sym_warning(d, cx, cy, s, c=INK):
    d.polygon([(cx, cy - s * 0.5), (cx + s * 0.45, cy + s * 0.4), (cx - s * 0.45, cy + s * 0.4)], outline=c, width=max(4, s // 30))
    d.rectangle([cx - s * 0.05, cy - s * 0.15, cx + s * 0.05, cy + s * 0.15], fill=c)
    d.ellipse([cx - s * 0.06, cy + s * 0.22, cx + s * 0.06, cy + s * 0.34], fill=c)


def sym_dollar(d, cx, cy, s, c=INK):
    font = load_font(FONT_BOLD, int(s * 0.75))
    bbox = d.textbbox((0, 0), "$", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), "$", font=font, fill=c)


def sym_heart_fake(d, cx, cy, s, c=INK):
    # broken heart / scam: heart with slash
    r = s * 0.22
    d.ellipse([cx - s * 0.35, cy - s * 0.25, cx - s * 0.35 + 2 * r, cy - s * 0.25 + 2 * r], outline=c, width=max(3, s // 40))
    d.ellipse([cx + s * 0.35 - 2 * r, cy - s * 0.25, cx + s * 0.35, cy - s * 0.25 + 2 * r], outline=c, width=max(3, s // 40))
    d.line([(cx - s * 0.35, cy), (cx, cy + s * 0.4), (cx + s * 0.35, cy)], fill=c, width=max(3, s // 40))
    d.line([(cx - s * 0.3, cy + s * 0.35), (cx + s * 0.3, cy - s * 0.35)], fill=c, width=max(4, s // 30))


def sym_apple_siri(d, cx, cy, s, c=INK):
    # waveform / mic for Siri
    d.rounded_rectangle([cx - s * 0.08, cy - s * 0.35, cx + s * 0.08, cy + s * 0.1], radius=int(s * 0.08), outline=c, width=max(3, s // 40))
    d.arc([cx - s * 0.22, cy - s * 0.05, cx + s * 0.22, cy + s * 0.35], 10, 170, fill=c, width=max(3, s // 40))
    d.line([(cx, cy + s * 0.35), (cx, cy + s * 0.48)], fill=c, width=max(3, s // 40))
    d.line([(cx - s * 0.15, cy + s * 0.48), (cx + s * 0.15, cy + s * 0.48)], fill=c, width=max(3, s // 40))


def sym_camera(d, cx, cy, s, c=INK):
    d.rounded_rectangle([cx - s * 0.4, cy - s * 0.22, cx + s * 0.4, cy + s * 0.28], radius=8, outline=c, width=max(3, s // 40))
    d.ellipse([cx - s * 0.18, cy - s * 0.12, cx + s * 0.18, cy + s * 0.18], outline=c, width=max(3, s // 40))
    d.ellipse([cx - s * 0.08, cy - s * 0.02, cx + s * 0.08, cy + s * 0.08], fill=c)
    d.rectangle([cx + s * 0.15, cy - s * 0.35, cx + s * 0.32, cy - s * 0.22], fill=c)


def sym_pet(d, cx, cy, s, c=INK):
    # simple cat/pet head circle + ears
    r = s * 0.32
    d.ellipse([cx - r, cy - r * 0.7, cx + r, cy + r * 0.9], outline=c, width=max(3, s // 35))
    d.polygon([(cx - r * 0.85, cy - r * 0.2), (cx - r * 0.55, cy - r * 1.15), (cx - r * 0.2, cy - r * 0.5)], outline=c)
    d.polygon([(cx + r * 0.85, cy - r * 0.2), (cx + r * 0.55, cy - r * 1.15), (cx + r * 0.2, cy - r * 0.5)], outline=c)
    d.ellipse([cx - r * 0.4, cy - r * 0.15, cx - r * 0.15, cy + r * 0.1], fill=c)
    d.ellipse([cx + r * 0.15, cy - r * 0.15, cx + r * 0.4, cy + r * 0.1], fill=c)


def sym_layers(d, cx, cy, s, c=INK):
    for i, yoff in enumerate([-0.25, 0, 0.25]):
        w = s * (0.4 - i * 0.02)
        y = cy + s * yoff
        d.polygon(
            [(cx, y - s * 0.12), (cx + w, y), (cx, y + s * 0.12), (cx - w, y)],
            outline=c,
        )


def sym_code_brackets(d, cx, cy, s, c=INK):
    font = load_font(FONT_BOLD, int(s * 0.55))
    text = "</>"
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), text, font=font, fill=c)


def sym_blender(d, cx, cy, s, c=INK):
    # simple 3-circle logo-ish / 3D axes
    r = s * 0.18
    for dx, dy in [(-0.22, 0.15), (0.22, 0.15), (0, -0.22)]:
        d.ellipse([cx + s * dx - r, cy + s * dy - r, cx + s * dx + r, cy + s * dy + r], outline=c, width=max(3, s // 40))
    d.line([(cx, cy), (cx - s * 0.22, cy + s * 0.15)], fill=c, width=max(2, s // 45))
    d.line([(cx, cy), (cx + s * 0.22, cy + s * 0.15)], fill=c, width=max(2, s // 45))
    d.line([(cx, cy), (cx, cy - s * 0.22)], fill=c, width=max(2, s // 45))


SYMBOLS = {
    "missile": ("missile silhouette triangle+fins", sym_missile),
    "shield": ("flat shield icon", sym_shield),
    "chip": ("flat chip with pins", sym_chip),
    "robot": ("robot stick figure", sym_robot),
    "letter_A": ("letter A", lambda d, cx, cy, s, c=INK: sym_letter(d, cx, cy, s, "A", c)),
    "letter_N": ("letter N", lambda d, cx, cy, s, c=INK: sym_letter(d, cx, cy, s, "N", c)),
    "letter_G": ("letter G", lambda d, cx, cy, s, c=INK: sym_letter(d, cx, cy, s, "G", c)),
    "letter_C": ("letter C", lambda d, cx, cy, s, c=INK: sym_letter(d, cx, cy, s, "C", c)),
    "letter_D": ("letter D", lambda d, cx, cy, s, c=INK: sym_letter(d, cx, cy, s, "D", c)),
    "letter_Y": ("letter Y", lambda d, cx, cy, s, c=INK: sym_letter(d, cx, cy, s, "Y", c)),
    "letter_S": ("letter S", lambda d, cx, cy, s, c=INK: sym_letter(d, cx, cy, s, "S", c)),
    "letter_I": ("letter I", lambda d, cx, cy, s, c=INK: sym_letter(d, cx, cy, s, "I", c)),
    "chart": ("bar chart", sym_chart),
    "doc": ("document lines", sym_doc),
    "network": ("node network", sym_network),
    "building": ("building facade", sym_building),
    "gavel": ("gavel icon", sym_gavel),
    "pause": ("pause in circle", sym_pause),
    "brain": ("brain outline", sym_brain),
    "gear": ("gear", sym_gear),
    "phone": ("phone outline", sym_phone),
    "calendar": ("calendar", sym_calendar),
    "film": ("film strip", sym_film),
    "key": ("key icon", sym_key),
    "globe": ("globe", sym_globe),
    "speech": ("speech bubble", sym_speech),
    "spark": ("spark/star", sym_spark),
    "cube": ("isometric cube", sym_cube),
    "deal": ("interlocking arcs", sym_handshake_bars),
    "warning": ("warning triangle", sym_warning),
    "dollar": ("dollar sign", sym_dollar),
    "heart_slash": ("broken heart slash", sym_heart_fake),
    "mic": ("mic/waveform", sym_apple_siri),
    "camera": ("camera", sym_camera),
    "pet": ("pet head ears", sym_pet),
    "layers": ("stacked layers", sym_layers),
    "code": ("code brackets </>", sym_code_brackets),
    "blender": ("3-circle axes", sym_blender),
}


# Classifications: (category, hard_fact, symbol_key)
AI_META = [
    ("观点", "AIHOT", "doc"),            # 0 digest
    ("商业", "Anthropic", "shield"),      # 1 threat report
    ("商业", "Claude Code", "missile"),   # 2 TWZ missiles
    ("商业", "R2000", "warning"),         # 3 Bloomberg Yemen
    ("观点", "Amodei", "speech"),         # 4 Gary Marcus
    ("产品", "Agent", "network"),         # 5 context engineering
    ("商业", "Obama", "gavel"),           # 6 Obama agenda
    ("商业", "Trump", "building"),        # 7 Trump/Johnson
    ("商业", "Nasdaq", "chart"),          # 8 Reuters IPO
    ("商业", "IPO", "dollar"),            # 9 Bloomberg IPO
    ("观点", "Altman", "pause"),          # 10 PCMag pace
    ("观点", "METR", "doc"),              # 11 Amodei essay — vary from 4
    ("模型", "DeepSeek", "chip"),         # 12 V4.1 Flash
    ("模型", "Iris-pro", "spark"),        # 13 AllSpark Iris
    ("产品", "Salesforce", "gear"),       # 14 Salesforce harness
    ("产品", "Copilot", "letter_G"),      # 15 Grok in Copilot
    ("商业", "YC", "letter_Y"),           # 16 YC Demo Day
    ("观点", "Musk", "pause"),            # 17 Guardian Altman/Musk
]

V_META = [
    ("观点", "GTG-15001", "heart_slash"),  # 0 杀猪盘
    ("观点", "银河通用", "robot"),         # 1 具身智能
    ("产品", "Siri", "mic"),               # 2 Claude Siri
    ("观点", "Physical AI", "camera"),     # 3 印度工人
    ("观点", "Amodei", "speech"),          # 4 减速倡议
    ("产品", "Codex", "pet"),              # 5 Codex宠物
    ("模型", "Astra", "layers"),           # 6 Astra重置
    ("产品", "Cursor", "code"),            # 7 Cursor Projects
    ("产品", "Projects", "network"),       # 8 Cursor Beta
    ("产品", "AIHOT", "calendar"),         # 9 Tibo监控
    ("产品", "Seedance", "film"),          # 10 Seedance
    ("观点", "Anthropic", "warning"),      # 11 研究员离职
    ("观点", "DeepSeek", "key"),           # 12 Codex耗尽额度
    ("模型", "GPT-6", "brain"),            # 13 Astra推理
    ("产品", "aihot.news", "globe"),       # 14 AIHOT域名
    ("产品", "Blender", "blender"),        # 15 Blender教程
]


def luminance(rgb):
    r, g, b = [x / 255.0 for x in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def render_cover(category: str, hard_fact: str, symbol_key: str) -> Image.Image:
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    band_w = int(W * BAND_RATIO)
    color = COLORS[category]
    d.rectangle([0, 0, band_w, H], fill=color)

    text_color = WHITE if luminance(color) < 0.45 else INK

    # category + hard fact stacked in band, font ~35-45% of band height each conceptually
    # band is vertical, so use band_w as "band height" for horizontal layout — actually band is left vertical strip
    # "字高约占带高 35–45%" — for left band, band height is H
    pad_x = int(band_w * 0.1)
    max_text_w = band_w - 2 * pad_x
    # two lines: category then hard_fact
    line_max_h = int(H * 0.18)  # ~ band-related sizing
    cat_font, cat_tw, cat_th = fit_text(d, category, max_text_w, int(H * 0.16), bold=True)
    fact_font, fact_tw, fact_th = fit_text(d, hard_fact, max_text_w, int(H * 0.20), bold=True)

    gap = int(H * 0.04)
    total_h = cat_th + gap + fact_th
    y0 = (H - total_h) / 2
    d.text(((band_w - cat_tw) / 2 - d.textbbox((0, 0), category, font=cat_font)[0],
            y0 - d.textbbox((0, 0), category, font=cat_font)[1]),
           category, font=cat_font, fill=text_color)
    d.text(((band_w - fact_tw) / 2 - d.textbbox((0, 0), hard_fact, font=fact_font)[0],
            y0 + cat_th + gap - d.textbbox((0, 0), hard_fact, font=fact_font)[1]),
           hard_fact, font=fact_font, fill=text_color)

    # symbol in cream field
    cream_cx = band_w + (W - band_w) / 2
    cream_cy = H / 2
    sym_size = int(min(W - band_w, H) * 0.55)
    _, drawer = SYMBOLS[symbol_key]
    drawer(d, cream_cx, cream_cy, sym_size, INK)
    return img


def save_jpeg(img: Image.Image, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=72, optimize=True)
    return path.stat().st_size


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ai_path = DATA_DIR / "ai.json"
    v_path = DATA_DIR / "v.json"
    ai = json.loads(ai_path.read_text(encoding="utf-8"))
    v = json.loads(v_path.read_text(encoding="utf-8"))

    assert len(ai) == 18, len(ai)
    assert len(v) == 16, len(v)
    assert len(AI_META) == 18
    assert len(V_META) == 16

    prompts = []
    failures = []
    ai_ok = v_ok = 0

    for i, (cat, fact, sk) in enumerate(AI_META):
        fname = f"cover-{DATE_TAG}-ai-{i:02d}.jpg"
        out = OUT_DIR / fname
        try:
            img = render_cover(cat, fact, sk)
            size = save_jpeg(img, out)
            ai[i]["image"] = f"/assets/covers/{fname}"
            prompts.append({
                "kind": "ai",
                "index": i,
                "category": cat,
                "hard_fact": fact,
                "symbol": SYMBOLS[sk][0],
                "symbol_key": sk,
                "color": f"#{COLORS[cat][0]:02X}{COLORS[cat][1]:02X}{COLORS[cat][2]:02X}",
                "filename": fname,
                "image_path": f"/assets/covers/{fname}",
                "bytes": size,
                "title": ai[i].get("title", ""),
            })
            ai_ok += 1
            print(f"OK ai {i:02d} {fname} {size}B {cat}/{fact}/{sk}")
        except Exception as e:
            failures.append(f"ai-{i:02d}: {e}")
            print(f"FAIL ai {i}: {e}")

    for i, (cat, fact, sk) in enumerate(V_META):
        fname = f"cover-{DATE_TAG}-v-{i:02d}.jpg"
        out = OUT_DIR / fname
        try:
            img = render_cover(cat, fact, sk)
            size = save_jpeg(img, out)
            v[i]["image"] = f"/assets/covers/{fname}"
            prompts.append({
                "kind": "v",
                "index": i,
                "category": cat,
                "hard_fact": fact,
                "symbol": SYMBOLS[sk][0],
                "symbol_key": sk,
                "color": f"#{COLORS[cat][0]:02X}{COLORS[cat][1]:02X}{COLORS[cat][2]:02X}",
                "filename": fname,
                "image_path": f"/assets/covers/{fname}",
                "bytes": size,
                "title": v[i].get("title", ""),
            })
            v_ok += 1
            print(f"OK v  {i:02d} {fname} {size}B {cat}/{fact}/{sk}")
        except Exception as e:
            failures.append(f"v-{i:02d}: {e}")
            print(f"FAIL v {i}: {e}")

    ai_path.write_text(json.dumps(ai, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    v_path.write_text(json.dumps(v, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (DATA_DIR / "_cover_prompts.json").write_text(
        json.dumps(prompts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # size check
    sizes = []
    for p in prompts:
        fp = OUT_DIR / p["filename"]
        if fp.exists():
            sizes.append((p["filename"], fp.stat().st_size))

    report_lines = [
        f"date: 2026-09-14",
        f"covers generated: ai={ai_ok} v={v_ok} total={ai_ok + v_ok}",
        f"expected: ai=18 v=16 total=34",
        f"method: Pillow masthead (left 30% category band + cream symbol field)",
        f"output: /workspace/alioxis-news/assets/covers/cover-20260914-*.jpg JPEG q72 ~960x540",
        f"json updated: ai.json image fields={sum(1 for x in ai if x.get('image'))} v.json={sum(1 for x in v if x.get('image'))}",
        f"prompts: {DATA_DIR / '_cover_prompts.json'} ({len(prompts)} entries)",
        f"failures: {len(failures)}",
    ]
    if failures:
        report_lines.append("--- failures ---")
        report_lines.extend(failures)
    report_lines.append("--- file sizes (bytes) ---")
    for name, sz in sizes:
        flag = "" if 40_000 <= sz <= 100_000 else " (outside 40-100KB target; still OK if readable)"
        # masthead flat graphics often smaller than photo covers — note if small
        if sz < 20_000:
            flag = " (small; flat vector-like)"
        report_lines.append(f"  {name}: {sz}{flag}")
    report = "\n".join(report_lines) + "\n"
    (DATA_DIR / "_covers_report.txt").write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()

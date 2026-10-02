#!/usr/bin/env python3
"""Generate dark Flipboard-style abstract magazine covers (16:9)."""
from __future__ import annotations
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

W, H = 1280, 720
OUT = "/workspace/alioxis-news/assets/covers"

def clamp(x, a=0, b=255):
    return max(a, min(b, int(x)))

def lerp(a, b, t):
    return a + (b - a) * t

def mix(c1, c2, t):
    return tuple(clamp(lerp(c1[i], c2[i], t)) for i in range(3))

def vignette(img, strength=0.55):
    overlay = Image.new("RGB", img.size, (0, 0, 0))
    mask = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(mask)
    cx, cy = W / 2, H / 2
    for r in range(int(max(W, H) * 0.75), 0, -8):
        alpha = int(255 * strength * (1 - r / (max(W, H) * 0.75)) ** 1.6)
        md.ellipse([cx - r, cy - r * 0.85, cx + r, cy + r * 0.85], fill=alpha)
    return Image.composite(overlay, img, mask)

def noise(img, amt=18, seed=0):
    rnd = random.Random(seed)
    px = img.load()
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            n = rnd.randint(-amt, amt)
            r, g, b = px[x, y]
            c = (clamp(r + n), clamp(g + n), clamp(b + n))
            px[x, y] = c
            if x + 1 < W:
                px[x + 1, y] = c
            if y + 1 < H:
                px[x, y + 1] = c
                if x + 1 < W:
                    px[x + 1, y + 1] = c
    return img

def gradient(c_top, c_bot, c_accent=None, accent_xy=(0.7, 0.35), accent_r=0.45):
    img = Image.new("RGB", (W, H))
    px = img.load()
    ax, ay = accent_xy[0] * W, accent_xy[1] * H
    ar = accent_r * max(W, H)
    for y in range(H):
        t = y / (H - 1)
        base = mix(c_top, c_bot, t)
        for x in range(W):
            c = base
            if c_accent:
                d = math.hypot(x - ax, y - ay) / ar
                if d < 1:
                    c = mix(c, c_accent, (1 - d) ** 2 * 0.55)
            # subtle side gradient
            sx = abs(x / W - 0.5) * 2
            c = mix(c, (8, 10, 16), sx * 0.12)
            px[x, y] = c
    return img

def soft_orb(draw, xy, r, color, layers=12):
    x, y = xy
    for i in range(layers, 0, -1):
        t = i / layers
        a = int(40 * t * t)
        rr = int(r * (1.15 - 0.15 * t))
        # approximate glow via filled ellipses with mixed colors
        col = mix(color, (0, 0, 0), 1 - t * 0.85)
        # PIL RGB only — bake glow by lighter rings
        col2 = mix(color, (255, 255, 255), 0.08 * t)
        draw.ellipse([x - rr, y - rr, x + rr, y + rr], fill=col2 if i < 3 else col)

def draw_lines(draw, pts, color, width=2):
    if len(pts) < 2:
        return
    draw.line(pts, fill=color, width=width, joint="curve")

def finish(img, seed):
    img = img.filter(ImageFilter.GaussianBlur(radius=0.6))
    img = noise(img, amt=12, seed=seed)
    img = vignette(img, 0.5)
    img = ImageEnhance.Contrast(img).enhance(1.08)
    img = ImageEnhance.Color(img).enhance(1.05)
    return img

# ---- Theme painters ----

def cover_handwriting(seed=1):
    img = gradient((12, 16, 28), (6, 8, 14), (180, 120, 60), (0.55, 0.45), 0.5)
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    # tablet frame
    d.rounded_rectangle([340, 120, 940, 600], radius=28, fill=(18, 22, 34), outline=(60, 70, 90), width=3)
    d.rounded_rectangle([370, 150, 910, 570], radius=12, fill=(28, 34, 48))
    # ink strokes
    for i in range(7):
        y0 = 200 + i * 45
        pts = []
        for x in range(410, 870, 18):
            pts.append((x, y0 + math.sin(x / 40 + i) * 8 + rnd.uniform(-3, 3)))
        col = mix((210, 160, 90), (140, 90, 40), i / 7)
        draw_lines(d, pts, col, width=3 if i % 2 == 0 else 2)
    # stylus
    d.line([(880, 180), (980, 520)], fill=(200, 200, 210), width=6)
    d.ellipse([970, 510, 996, 536], fill=(220, 180, 100))
    return finish(img, seed)

def cover_agent_os(seed=2):
    img = gradient((10, 14, 32), (4, 6, 12), (80, 140, 255), (0.35, 0.4), 0.55)
    d = ImageDraw.Draw(img)
    nodes = [(280, 220), (520, 160), (780, 240), (420, 400), (680, 380), (900, 480), (220, 480)]
    for a, b in [(0,1),(1,2),(0,3),(1,3),(1,4),(2,4),(3,4),(4,5),(3,6),(4,6)]:
        d.line([nodes[a], nodes[b]], fill=(70, 110, 180), width=2)
    for i, (x, y) in enumerate(nodes):
        soft_orb(d, (x, y), 28 + (i % 3) * 6, (100, 170, 255))
        d.ellipse([x-10, y-10, x+10, y+10], fill=(180, 220, 255))
    # hex grid faint
    for y in range(80, H, 70):
        for x in range(60, W, 80):
            d.regular_polygon((x, y, 18), 6, outline=(30, 45, 70))
    return finish(img, seed)

def cover_wikiskill(seed=3):
    img = gradient((14, 18, 26), (8, 10, 16), (120, 200, 160), (0.65, 0.35), 0.45)
    d = ImageDraw.Draw(img)
    # book / wiki pages
    for i, ox in enumerate([380, 460, 540]):
        d.rounded_rectangle([ox, 140 + i*8, ox + 320, 560], radius=8, fill=(24, 32, 40), outline=(80, 120, 100), width=2)
    # knowledge graph sprouting
    base = (640, 360)
    tips = [(820, 180), (920, 280), (880, 420), (760, 500), (700, 200)]
    for t in tips:
        d.line([base, t], fill=(90, 170, 130), width=2)
        d.ellipse([t[0]-8, t[1]-8, t[0]+8, t[1]+8], fill=(140, 220, 180))
    d.ellipse([base[0]-14, base[1]-14, base[0]+14, base[1]+14], fill=(60, 200, 150))
    return finish(img, seed)

def cover_monid(seed=4):
    img = gradient((16, 12, 28), (6, 6, 14), (200, 100, 255), (0.4, 0.5), 0.5)
    d = ImageDraw.Draw(img)
    # hub + tools orbit
    cx, cy = 640, 360
    soft_orb(d, (cx, cy), 70, (160, 80, 220))
    d.ellipse([cx-36, cy-36, cx+36, cy+36], fill=(40, 20, 60), outline=(220, 160, 255), width=3)
    for i in range(12):
        ang = i / 12 * math.pi * 2
        r = 180 + (i % 3) * 40
        x = cx + math.cos(ang) * r
        y = cy + math.sin(ang) * r * 0.7
        d.line([(cx, cy), (x, y)], fill=(90, 60, 130), width=1)
        d.rounded_rectangle([x-18, y-12, x+18, y+12], radius=4, fill=(50, 30, 70), outline=(180, 120, 240), width=2)
    return finish(img, seed)

def cover_ai_drama(seed=5):
    img = gradient((28, 10, 20), (8, 4, 10), (255, 80, 120), (0.6, 0.4), 0.5)
    d = ImageDraw.Draw(img)
    # film strip
    d.rectangle([180, 180, 1100, 540], fill=(20, 8, 14))
    for x in range(200, 1080, 140):
        d.rounded_rectangle([x, 210, x + 110, 510], radius=6, fill=(40, 16, 28), outline=(120, 40, 60), width=2)
        # play triangle
        d.polygon([(x+35, 320), (x+35, 400), (x+85, 360)], fill=(220, 90, 120))
    for y in (160, 550):
        for x in range(200, 1100, 40):
            d.rectangle([x, y, x+22, y+18], fill=(60, 20, 30))
    return finish(img, seed)

def cover_cloud_deal(seed=6):
    img = gradient((8, 16, 36), (4, 8, 18), (60, 160, 255), (0.5, 0.3), 0.55)
    d = ImageDraw.Draw(img)
    # server racks abstract
    for i, x in enumerate([280, 420, 560]):
        d.rounded_rectangle([x, 160, x+100, 560], radius=8, fill=(16, 28, 48), outline=(50, 100, 180), width=2)
        for y in range(190, 540, 36):
            d.rectangle([x+12, y, x+88, y+18], fill=(30, 60, 110))
            d.ellipse([x+20, y+5, x+30, y+15], fill=(80, 220, 160) if (i+y)//36 % 3 else (220, 80, 80))
    # cloud blobs + money glow
    soft_orb(d, (900, 260), 90, (100, 180, 255))
    soft_orb(d, (1000, 320), 60, (80, 140, 220))
    soft_orb(d, (860, 340), 50, (120, 200, 255))
    # handshake lines
    d.arc([720, 400, 1020, 580], 200, 340, fill=(180, 210, 255), width=4)
    return finish(img, seed)

def cover_semiconductor(seed=7):
    img = gradient((12, 20, 28), (6, 10, 14), (0, 200, 180), (0.45, 0.5), 0.45)
    d = ImageDraw.Draw(img)
    # chip die
    d.rounded_rectangle([420, 180, 860, 540], radius=16, fill=(20, 36, 40), outline=(0, 180, 160), width=3)
    for y in range(220, 500, 40):
        for x in range(460, 820, 40):
            d.rectangle([x, y, x+28, y+28], outline=(40, 120, 110), width=1)
            if (x + y) % 80 == 0:
                d.rectangle([x+6, y+6, x+22, y+22], fill=(0, 160, 140))
    # pins
    for x in range(450, 840, 30):
        d.rectangle([x, 150, x+12, 180], fill=(180, 190, 200))
        d.rectangle([x, 540, x+12, 570], fill=(180, 190, 200))
    for y in range(210, 520, 30):
        d.rectangle([390, y, 420, y+12], fill=(180, 190, 200))
        d.rectangle([860, y, 890, y+12], fill=(180, 190, 200))
    return finish(img, seed)

def cover_trust_partners(seed=8):
    img = gradient((14, 18, 32), (8, 10, 18), (100, 140, 220), (0.5, 0.45), 0.5)
    d = ImageDraw.Draw(img)
    # interlocking rings / network of trust
    rings = [(480, 340, 120), (640, 300, 140), (800, 350, 120), (640, 420, 100)]
    cols = [(90, 140, 220), (120, 180, 255), (70, 110, 190), (160, 200, 255)]
    for (x, y, r), c in zip(rings, cols):
        d.ellipse([x-r, y-r, x+r, y+r], outline=c, width=5)
    # node centers
    for x, y, _ in rings:
        d.ellipse([x-8, y-8, x+8, y+8], fill=(200, 220, 255))
    return finish(img, seed)

def cover_gmail_clean(seed=9):
    img = gradient((16, 18, 28), (8, 8, 14), (255, 180, 80), (0.55, 0.4), 0.4)
    d = ImageDraw.Draw(img)
    # inbox stack decluttering
    for i in range(6):
        y = 160 + i * 70
        w = 700 - i * 40
        x = 290 + i * 20
        alpha_col = mix((40, 44, 60), (30, 32, 42), i / 6)
        d.rounded_rectangle([x, y, x + w, y + 52], radius=8, fill=alpha_col, outline=(80, 90, 110), width=2)
        d.ellipse([x+18, y+14, x+42, y+38], fill=(200, 140, 60) if i < 2 else (70, 80, 100))
        d.rectangle([x+60, y+18, x+w-40, y+28], fill=(90, 100, 120))
        d.rectangle([x+60, y+34, x+w-120, y+42], fill=(60, 68, 84))
    # broom / sparkle sweep
    soft_orb(d, (980, 280), 50, (255, 200, 100))
    return finish(img, seed)

def cover_pastoral_ai(seed=10):
    img = gradient((20, 32, 24), (8, 14, 12), (180, 220, 100), (0.4, 0.55), 0.5)
    d = ImageDraw.Draw(img)
    # hills
    d.polygon([(0, 480), (200, 360), (420, 440), (640, 320), (900, 400), (1280, 300), (1280, 720), (0, 720)], fill=(24, 48, 32))
    d.polygon([(0, 560), (300, 460), (600, 540), (900, 450), (1280, 520), (1280, 720), (0, 720)], fill=(16, 36, 24))
    # sun / generative orb
    soft_orb(d, (960, 180), 80, (220, 200, 100))
    d.ellipse([930, 150, 990, 210], fill=(255, 230, 140))
    # abstract flowers as pixels
    rnd = random.Random(seed)
    for _ in range(40):
        x, y = rnd.randint(80, 1100), rnd.randint(380, 650)
        col = rnd.choice([(220, 120, 140), (240, 200, 100), (180, 220, 160)])
        d.ellipse([x-6, y-6, x+6, y+6], fill=col)
    return finish(img, seed)

def cover_prompts(seed=11):
    img = gradient((12, 14, 30), (6, 6, 14), (140, 120, 255), (0.5, 0.4), 0.5)
    d = ImageDraw.Draw(img)
    # chat bubbles ascending in quality
    bubbles = [(300, 480, 280, 90), (420, 360, 320, 90), (520, 240, 360, 90), (600, 120, 400, 90)]
    for i, (x, y, w, h) in enumerate(bubbles):
        col = mix((40, 40, 70), (100, 90, 200), i / 3)
        d.rounded_rectangle([x, y, x+w, y+h], radius=20, fill=col, outline=(160, 150, 255), width=2)
        for j in range(3):
            d.rectangle([x+24, y+22+j*18, x+w-40-j*30, y+34+j*18], fill=mix((80, 80, 120), (200, 190, 255), i/3))
    # spark at top
    soft_orb(d, (980, 140), 40, (200, 180, 255))
    return finish(img, seed)

def cover_cursor_claude(seed=12):
    img = gradient((10, 18, 28), (6, 8, 14), (100, 200, 255), (0.4, 0.45), 0.5)
    d = ImageDraw.Draw(img)
    # IDE window
    d.rounded_rectangle([220, 120, 1060, 600], radius=12, fill=(14, 22, 32), outline=(50, 90, 120), width=2)
    d.rectangle([220, 120, 1060, 160], fill=(22, 34, 48))
    for i, c in enumerate([(220, 80, 80), (220, 180, 60), (80, 200, 100)]):
        d.ellipse([240+i*22, 132, 254+i*22, 146], fill=c)
    # code lines glowing
    for i in range(12):
        y = 190 + i * 32
        w = 200 + (i * 47) % 500
        d.rectangle([260, y, 260+w, y+10], fill=(40, 80, 110) if i % 3 else (60, 140, 180))
    soft_orb(d, (900, 360), 70, (80, 180, 255))
    return finish(img, seed)

def cover_ads_money(seed=13):
    img = gradient((18, 14, 28), (8, 6, 14), (255, 200, 80), (0.55, 0.4), 0.5)
    d = ImageDraw.Draw(img)
    # rising chart bars
    heights = [120, 180, 150, 260, 220, 340, 300, 400]
    for i, h in enumerate(heights):
        x = 260 + i * 100
        col = mix((80, 60, 40), (255, 200, 80), i / 7)
        d.rounded_rectangle([x, 560-h, x+70, 560], radius=6, fill=col)
    # globe arcs
    d.arc([700, 140, 1100, 420], 200, 20, fill=(255, 210, 100), width=3)
    d.arc([760, 180, 1040, 380], 220, 40, fill=(200, 160, 80), width=2)
    soft_orb(d, (900, 220), 55, (255, 220, 120))
    return finish(img, seed)

def cover_memory(seed=14):
    img = gradient((14, 16, 30), (6, 8, 16), (160, 100, 255), (0.5, 0.45), 0.5)
    d = ImageDraw.Draw(img)
    # linked memory nodes / brain-ish lattice
    rnd = random.Random(seed)
    pts = [(rnd.randint(200, 1080), rnd.randint(140, 580)) for _ in range(18)]
    for i, a in enumerate(pts):
        for b in pts[i+1:]:
            if math.hypot(a[0]-b[0], a[1]-b[1]) < 220:
                d.line([a, b], fill=(90, 60, 150), width=1)
    for i, (x, y) in enumerate(pts):
        soft_orb(d, (x, y), 16 if i % 4 else 28, (180, 120, 255))
        d.ellipse([x-6, y-6, x+6, y+6], fill=(230, 200, 255))
    return finish(img, seed)

def cover_aihot(seed=15):
    img = gradient((20, 12, 18), (8, 6, 10), (255, 90, 60), (0.45, 0.4), 0.55)
    d = ImageDraw.Draw(img)
    # newspaper / digest stack
    for i in range(4):
        ox, oy = 300 + i*30, 160 + i*25
        d.rounded_rectangle([ox, oy, ox+560, oy+380], radius=10, fill=(28, 16, 20), outline=(180, 70, 50), width=2)
    # headline bars
    d.rectangle([360, 220, 800, 250], fill=(220, 90, 60))
    for y in range(280, 480, 36):
        d.rectangle([360, y, 780 - (y % 80), y+12], fill=(80, 40, 40))
    soft_orb(d, (980, 200), 60, (255, 120, 60))
    return finish(img, seed)

def cover_chatgpt_work(seed=16):
    img = gradient((12, 20, 28), (6, 10, 14), (80, 200, 160), (0.4, 0.5), 0.5)
    d = ImageDraw.Draw(img)
    # dual panels: cloud vs desktop
    d.rounded_rectangle([180, 160, 580, 560], radius=14, fill=(18, 32, 40), outline=(60, 160, 130), width=2)
    soft_orb(d, (380, 280), 70, (80, 200, 170))
    d.ellipse([340, 240, 420, 300], outline=(160, 240, 210), width=3)
    d.rounded_rectangle([700, 160, 1100, 560], radius=14, fill=(18, 28, 36), outline=(80, 140, 200), width=2)
    d.rectangle([740, 220, 1060, 480], fill=(24, 36, 48))
    for i in range(5):
        d.rectangle([760, 250+i*40, 1000, 270+i*40], fill=(50, 90, 130))
    # bridge
    d.line([(580, 360), (700, 360)], fill=(140, 200, 180), width=4)
    return finish(img, seed)

def cover_uber_agent(seed=17):
    img = gradient((14, 16, 24), (6, 8, 12), (255, 180, 40), (0.5, 0.4), 0.45)
    d = ImageDraw.Draw(img)
    # PR merge / pipeline
    for i, y in enumerate([200, 320, 440]):
        d.rounded_rectangle([280, y, 720, y+70], radius=10, fill=(28, 32, 40), outline=(200, 150, 50), width=2)
        d.ellipse([300, y+18, 340, y+52], fill=(255, 190, 60) if i < 2 else (80, 200, 120))
        d.rectangle([370, y+28, 680, y+42], fill=(70, 70, 80))
    # agent arrow takeover
    d.polygon([(780, 280), (980, 360), (780, 440), (820, 360)], fill=(255, 170, 40))
    soft_orb(d, (1040, 360), 50, (255, 200, 80))
    return finish(img, seed)

def cover_glm_open(seed=18):
    img = gradient((10, 16, 28), (4, 8, 14), (60, 140, 255), (0.5, 0.45), 0.5)
    d = ImageDraw.Draw(img)
    # open source unlock
    d.rounded_rectangle([480, 200, 800, 520], radius=20, fill=(16, 28, 48), outline=(80, 140, 255), width=3)
    # circuit inside
    for y in range(250, 480, 45):
        d.line([(520, y), (760, y)], fill=(50, 100, 180), width=2)
        d.ellipse([630, y-8, 650, y+8], fill=(100, 180, 255))
    # open lock shackle
    d.arc([560, 120, 720, 260], 200, 340, fill=(140, 190, 255), width=8)
    d.rectangle([560, 230, 590, 280], fill=(140, 190, 255))
    soft_orb(d, (900, 300), 60, (80, 160, 255))
    return finish(img, seed)

def cover_reward_hacker(seed=19):
    img = gradient((24, 10, 18), (8, 4, 10), (255, 60, 100), (0.5, 0.4), 0.55)
    d = ImageDraw.Draw(img)
    # maze / reward path with wrong turn glow
    for y in range(160, 560, 80):
        d.rectangle([240, y, 1040, y+18], fill=(40, 16, 28))
    for x in range(280, 1000, 160):
        d.rectangle([x, 160, x+18, 560], fill=(40, 16, 28))
    # false reward coins
    for pos in [(360, 280), (680, 360), (520, 440), (840, 240)]:
        soft_orb(d, pos, 28, (255, 80, 120))
        d.ellipse([pos[0]-14, pos[1]-14, pos[0]+14, pos[1]+14], fill=(255, 120, 80))
    # warning triangle
    d.polygon([(640, 180), (720, 320), (560, 320)], outline=(255, 180, 60), width=4)
    return finish(img, seed)

def cover_agent_collusion(seed=20):
    img = gradient((16, 12, 28), (6, 6, 14), (200, 80, 255), (0.45, 0.5), 0.5)
    d = ImageDraw.Draw(img)
    # many small agent dots coordinating
    rnd = random.Random(seed)
    pts = []
    for _ in range(60):
        pts.append((rnd.randint(180, 1100), rnd.randint(140, 580)))
    hub = (640, 360)
    for p in pts:
        if math.hypot(p[0]-hub[0], p[1]-hub[1]) < 280:
            d.line([hub, p], fill=(80, 40, 120), width=1)
        d.ellipse([p[0]-4, p[1]-4, p[0]+4, p[1]+4], fill=(200, 120, 255))
    soft_orb(d, hub, 50, (180, 80, 255))
    d.ellipse([hub[0]-16, hub[1]-16, hub[0]+16, hub[1]+16], fill=(255, 180, 255))
    return finish(img, seed)

def cover_copyright_music(seed=21):
    img = gradient((18, 14, 26), (8, 6, 12), (255, 100, 160), (0.5, 0.4), 0.5)
    d = ImageDraw.Draw(img)
    # abstract musical waveforms + legal seal feel
    for i in range(5):
        pts = []
        y0 = 220 + i * 70
        for x in range(200, 1080, 10):
            amp = 30 + i * 8
            pts.append((x, y0 + math.sin(x / 35 + i) * amp))
        draw_lines(d, pts, mix((180, 80, 140), (255, 140, 180), i/4), width=3)
    # circular seal
    d.ellipse([860, 160, 1080, 380], outline=(220, 160, 100), width=4)
    d.ellipse([890, 190, 1050, 350], outline=(180, 120, 70), width=2)
    return finish(img, seed)

def cover_local_llm(seed=22):
    img = gradient((12, 16, 24), (6, 8, 12), (100, 180, 255), (0.4, 0.45), 0.45)
    d = ImageDraw.Draw(img)
    # desktop Mac-like silhouette abstract
    d.rounded_rectangle([400, 140, 880, 480], radius=18, fill=(22, 30, 42), outline=(80, 120, 160), width=3)
    d.rectangle([430, 170, 850, 430], fill=(14, 20, 30))
    # model layers
    for i in range(6):
        y = 200 + i * 35
        d.rectangle([470, y, 810, y+18], fill=mix((40, 80, 120), (100, 180, 255), i/5))
    d.rectangle([520, 480, 760, 500], fill=(50, 60, 70))
    d.rectangle([440, 500, 840, 520], fill=(40, 48, 56))
    soft_orb(d, (980, 260), 55, (120, 190, 255))
    return finish(img, seed)


COVERS = {
    # v tab
    "cover-v-00.png": cover_handwriting,
    "cover-v-01.png": cover_agent_os,
    "cover-v-02.png": cover_wikiskill,
    "cover-v-03.png": cover_monid,
    "cover-v-09.png": cover_ai_drama,
    "cover-v-10.png": cover_cloud_deal,
    "cover-v-11.png": cover_trust_partners,
    "cover-v-12.png": cover_semiconductor,
    "cover-v-13.png": cover_gmail_clean,
    "cover-v-14.png": cover_pastoral_ai,
    "cover-v-15.png": cover_prompts,
    # ai tab
    "cover-ai-04.png": cover_cursor_claude,
    "cover-ai-06.png": cover_ads_money,
    "cover-ai-07.png": cover_memory,
    "cover-ai-11.png": cover_aihot,
    "cover-ai-12.png": cover_chatgpt_work,
    "cover-ai-13.png": cover_uber_agent,
    "cover-ai-14.png": cover_glm_open,
    "cover-ai-16.png": cover_reward_hacker,
    "cover-ai-17.png": cover_agent_collusion,
    "cover-ai-18.png": cover_copyright_music,
    "cover-ai-19.png": cover_local_llm,
}

def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in COVERS.items():
        seed = sum(ord(c) for c in name)
        img = fn(seed)
        path = os.path.join(OUT, name)
        img.save(path, "PNG", optimize=True)
        print(f"wrote {path} ({os.path.getsize(path)} bytes)")
    print(f"done: {len(COVERS)} covers")

if __name__ == "__main__":
    main()

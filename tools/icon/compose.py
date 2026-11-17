# Builds the app icons from a render of the car on green (tools/icon/render_car.js):
# night-blue background, yellow and orange speed streaks behind the car, a soft shadow, the car, and an APEX wordmark.
# usage: python3 tools/icon/compose.py car.png outdir
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

src, outdir = sys.argv[1], sys.argv[2]
S = 1024
BLACK = '/usr/share/fonts/opentype/inter/Inter-BlackItalic.otf'
XBOLD = '/usr/share/fonts/opentype/inter/Inter-ExtraBoldItalic.otf'

def key_car(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    spill = g - np.maximum(r, b)
    alpha = np.clip(1 - (spill - 30) / 120, 0, 1)            # green backdrop -> transparent, soft edges
    g2 = np.minimum(g, np.maximum(r, b) + 8)                  # no green fringe on the edges
    out = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    return im.crop(im.getbbox())

def background():
    y, x = np.mgrid[0:S, 0:S].astype(np.float32) / S
    d = np.sqrt((x - 0.62) ** 2 + (y - 0.42) ** 2)
    t = np.clip(d / 0.85, 0, 1)
    c0, c1 = np.array([22, 44, 92]), np.array([5, 7, 13])   # night blue in the middle, near black at the edges
    img = (c0[None, None, :] * (1 - t[..., None]) + c1[None, None, :] * t[..., None])
    return Image.fromarray(img.astype(np.uint8), 'RGB').convert('RGBA')

def streaks(img, box):
    # tapered motion streaks running back from the car, at a slight angle
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = box
    rows = [(0.18, 230, (255, 210, 31)), (0.34, 300, (255, 122, 26)), (0.5, 380, (255, 210, 31)), (0.64, 260, (255, 255, 255)), (0.78, 330, (255, 122, 26))]
    for k, (fy, length, col) in enumerate(rows):
        yy = y0 + (y1 - y0) * fy; xe = x0 + (x1 - x0) * 0.22; xs = xe - length * 1.4
        for i in range(40):  # taper: thin and faint at the tail
            f = i / 40; xa = xs + (xe - xs) * f; xb = xa + (xe - xs) / 40 + 1; w = 2 + 9 * f
            d.polygon([(xa, yy - w / 2 + (xa - xe) * 0.08), (xb, yy - w / 2 + (xb - xe) * 0.08), (xb, yy + w / 2 + (xb - xe) * 0.08), (xa, yy + w / 2 + (xa - xe) * 0.08)], fill=col + (int(30 + 200 * f),))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(1.2)))

def compose(scale, wordmark=True):
    img = background()
    car = key_car(src)
    cw = int(S * 0.94 * scale); ch = int(car.height * cw / car.width); car = car.resize((cw, ch), Image.LANCZOS)
    cx = (S - cw) // 2 + int(S * 0.01); cy = int(S * (0.5 + 0.12 * scale)) - ch // 2 + int(S * 0.06 * scale)
    # glow and streaks behind, a shadow under the car
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(glow).ellipse([cx + cw * 0.1, cy + ch * 0.35, cx + cw * 0.95, cy + ch * 1.05], fill=(255, 170, 40, 70))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(60 * scale)))
    streaks(img, (cx, cy, cx + cw, cy + ch))
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse([cx + cw * 0.05, cy + ch * 0.82, cx + cw * 0.98, cy + ch * 1.06], fill=(0, 0, 0, 170))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18 * scale)))
    img.alpha_composite(car, (cx, cy))
    if wordmark:
        d = ImageDraw.Draw(img)
        f1 = ImageFont.truetype(BLACK, int(250 * scale)); f2 = ImageFont.truetype(XBOLD, int(66 * scale))
        t1 = 'APEX'; w1 = d.textlength(t1, font=f1); x1 = (S - w1) / 2; y1 = S * (0.5 - 0.39 * scale)
        # a soft drop shadow, then the yellow letters
        shl = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(shl).text((x1 + 8 * scale, y1 + 10 * scale), t1, font=f1, fill=(0, 0, 0, 200))
        img.alpha_composite(shl.filter(ImageFilter.GaussianBlur(8 * scale)))
        d.text((x1, y1), t1, font=f1, fill=(255, 210, 31))
        t2 = 'GRAND PRIX'; w2 = d.textlength(t2, font=f2); y2 = y1 + 262 * scale
        d.text(((S - w2) / 2, y2), t2, font=f2, fill=(240, 244, 248))
        # a thin yellow underline sweep
        d.polygon([((S - w2) / 2 - 10 * scale, y2 + 84 * scale), ((S + w2) / 2 + 30 * scale, y2 + 74 * scale), ((S + w2) / 2 + 30 * scale, y2 + 82 * scale), ((S - w2) / 2 - 10 * scale, y2 + 92 * scale)], fill=(255, 210, 31))
    return img.convert('RGB')

full = compose(1.0)
full.save(f'{outdir}/icon-1024.png')
full.resize((512, 512), Image.LANCZOS).save(f'{outdir}/icon-512.png', optimize=True)
full.resize((192, 192), Image.LANCZOS).save(f'{outdir}/icon-192.png', optimize=True)
full.resize((180, 180), Image.LANCZOS).save(f'{outdir}/apple-touch-icon.png', optimize=True)
compose(0.76).resize((512, 512), Image.LANCZOS).save(f'{outdir}/icon-maskable-512.png', optimize=True)  # inside the round safe zone
print('ok')

# Cleans the textures of the Sketchfab bike "Ducati Lenovo Team - MotoGP26" by Kenny3D89 (CC BY 4.0) for the game:
# every sponsor, maker and tyre logo is removed. The fairing atlas becomes paint areas (a mask our team liveries
# colour in the game) plus the carbon and black parts; the mechanical textures lose their small text and stickers.
# usage: python3 assets/clean_bike_tex.py   (reads assets/bikes_src/motogp26.glb, writes assets/bikes_src/tex/)
import json, struct, io, os
import numpy as np
from PIL import Image
from scipy import ndimage as nd
SRC, OUT = 'assets/bikes_src/motogp26.glb', 'assets/bikes_src/tex/'
os.makedirs(OUT, exist_ok=True)
b = open(SRC, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); off = 20 + L + 8
def image(i):
    v = j['bufferViews'][j['images'][i]['bufferView']]; o = off + v.get('byteOffset', 0)
    return Image.open(io.BytesIO(b[o:o + v['byteLength']]))
def hsl(a):
    a = a.astype(np.float32) / 255; mx, mn = a.max(2), a.min(2)
    return (mx - mn), 0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]
def disk(r): y, x = np.ogrid[-r:r + 1, -r:r + 1]; return x * x + y * y <= r * r

# ---- fairing atlas (image 0): labels paint (red), stripe (white), dark (carbon/black); every logo is swallowed
a = np.array(image(0).convert('RGB')); sat, lum = hsl(a); r, g, bl = [a[..., k].astype(np.int32) for k in range(3)]
red = (r > 90) & (r > g * 1.8) & (r > bl * 1.8)
white = (sat < 0.12) & (lum > 0.62)
dark = (lum < 0.3) & ~red
lab = np.full(a.shape[:2], -1, np.int8); lab[red] = 0; lab[white] = 1; lab[dark] = 2   # blue, yellow, green, beige: -1, filled below
R = 7  # strokes narrower than about 14 px (all lettering and logos) are removed; panels and stripes stay
keep = np.full(a.shape[:2], -1, np.int8)
for k in (2, 1, 0):   # paint last so it wins where an opened stripe and the paint touch
    # opening by reconstruction: a shape survives whole (sharp corners and all) if any part of it is wider than 2R,
    # so panels and stripes keep their exact outline while lettering, which is thin everywhere, disappears
    m = nd.binary_propagation(nd.binary_erosion(lab == k, structure=disk(R)), mask=(lab == k)); keep[m] = k
# everything not kept takes the label of the nearest kept texel
idx = nd.distance_transform_edt(keep < 0, return_distances=False, return_indices=True)
lab2 = keep[idx[0], idx[1]]
lab2 = nd.median_filter(lab2, size=5)   # tidy ragged edges
# base colour: carbon keeps its weave where it was carbon; filled carbon takes a blurred carbon; paint is neutral light grey
carbon = a.copy().astype(np.float32)
cm = (lab == 2) & (lab2 == 2) & (nd.distance_transform_edt(lab == 2) > 4)   # carbon well away from anything that was not carbon
blur = np.stack([nd.uniform_filter(np.where(cm, a[..., k], 0).astype(np.float32), 31) for k in range(3)], 2)
wsum = nd.uniform_filter(cm.astype(np.float32), 31)[..., None]
fill = np.where(wsum > 0.01, blur / np.maximum(wsum, 1e-3), 40)
base = np.where((lab2 == 2)[..., None], np.where(cm[..., None], carbon, fill), 235).astype(np.uint8)
Image.fromarray(base).save(OUT + 'body.png')
mask = np.zeros(a.shape, np.uint8); mask[..., 0] = (lab2 == 0) * 255; mask[..., 1] = (lab2 == 1) * 255
Image.fromarray(mask).save(OUT + 'body_mask.png')

# ---- mechanical textures: small text and stickers are replaced by the surrounding material
def erase(i, name, size=13, thr=38, passes=2, keep_alpha=False):
    im = image(i); al = np.array(im.convert('RGBA'))[..., 3] if keep_alpha else None
    a = np.array(im.convert('RGB')).astype(np.int32)
    for _ in range(passes):
        med = np.stack([nd.median_filter(a[..., k], size=size) for k in range(3)], 2)
        diff = np.abs(a - med).max(2) > thr
        sat, _ = hsl(a.astype(np.uint8)); loud = sat > 0.35   # saturated stickers (sponsor colours) go even when large
        m = nd.binary_dilation(diff | (loud & ~nd.binary_opening(loud, structure=disk(9))), iterations=2)
        a = np.where(m[..., None], med, a)
    out = Image.fromarray(a.astype(np.uint8))
    if keep_alpha: out = Image.fromarray(np.dstack([a.astype(np.uint8), al]), 'RGBA')
    out.save(OUT + name + '.png')
erase(4, 'upper')        # tank, clamps, cockpit parts
erase(5, 'chassis')      # frame, engine, forks, exhaust, swingarm
erase(10, 'dash', size=21)
erase(12, 'rims')
# tyres: any light lettering on the sidewall goes back to rubber
t = np.array(image(11).convert('RGB')).astype(np.int32); sat, lum = hsl(t.astype(np.uint8))
m = nd.binary_dilation((lum > 0.2) | (sat > 0.2), iterations=2); med = np.stack([nd.median_filter(np.where(m, 30, t[..., k]), size=9) for k in range(3)], 2)
Image.fromarray(np.where(m[..., None], np.minimum(med, 40), t).astype(np.uint8)).save(OUT + 'tyre.png')
# windscreen: plain smoked screen, the print removed, transparency kept
w = np.array(image(2).convert('RGBA')); w[..., :3] = (38, 40, 44); Image.fromarray(w, 'RGBA').save(OUT + 'screen.png')
print('ok', {k: int((lab2 == k).sum()) for k in (0, 1, 2)})

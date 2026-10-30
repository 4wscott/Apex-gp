# High-resolution pack for PCs on High/Ultra (loaded in the background after the menu): 2K CC0 ground
# photos with the same colour matching as make_photo.py, and 1K Poly Haven HDRIs (the originals of the
# 512 px ones bundled in hdri.js). Output goes to assets/hq/, which build.js copies into site/hq/.
import os, shutil
import numpy as np
from PIL import Image
S, O = 'assets/hq_src/', 'assets/hq/'
os.makedirs(O, exist_ok=True)
def save(img, name, size, q):
    img.resize((size, size), Image.LANCZOS).save(O + name + '.jpg', 'JPEG', quality=q, optimize=True, progressive=True)
def albedo(path, name, target, size=2048, q=84, keep=0.35):
    a = np.asarray(Image.open(S + path).convert('RGB')).astype(np.float32)
    m = a.reshape(-1, 3).mean(0); t = np.array(target, np.float32)
    gain = (t / m) * (1 - keep) + (t.mean() / m.mean()) * keep
    save(Image.fromarray(np.clip(a * gain, 0, 255).astype(np.uint8)), name, size, q)
def plain(path, name, size, q, mode='RGB'):
    save(Image.open(S + path).convert(mode), name, size, q)
albedo('asphalt_track_Diffuse.jpg', 'asphalt', [82, 83, 86], 2048, 80)
plain('asphalt_track_nor_gl.jpg', 'asphaltN', 2048, 82)
plain('asphalt_track_Rough.jpg', 'asphaltR', 1024, 84, 'L')
albedo('Grass004_2K-JPG_Color.jpg', 'grass', [80, 120, 46], 2048, 80)
plain('Grass004_2K-JPG_NormalGL.jpg', 'grassN', 1024, 84)
albedo('gravel_floor_02_Diffuse.jpg', 'gravel', [182, 164, 132], 1024, 82)
plain('gravel_floor_02_nor_gl.jpg', 'gravelN', 1024, 82)
albedo('coast_sand_01_Diffuse.jpg', 'sand', [210, 178, 132], 1024, 82)
plain('coast_sand_01_nor_gl.jpg', 'sandN', 1024, 82)
albedo('concrete_floor_02_Diffuse.jpg', 'concrete', [182, 180, 174], 1024, 84, 0.2)
albedo('asphalt_pit_lane_Diffuse.jpg', 'runoff', [104, 106, 110], 1024, 84, 0.2)
for f in os.listdir(S):
    if f.startswith('hdri_'): shutil.copyfile(S + f, O + f[5:])
print({f: os.path.getsize(O + f) // 1024 for f in sorted(os.listdir(O))})

# Converts the CC0 source photos in assets/tex_src into assets/photo.js (base64 JPEGs),
# shifting each albedo's mean colour toward what the scene lighting was tuned for.
import base64, io, json
import numpy as np
from PIL import Image
S = 'assets/tex_src/'
def enc(img, size, q):
    img = img.resize((size, size), Image.LANCZOS); b = io.BytesIO(); img.save(b, 'JPEG', quality=q, optimize=True, progressive=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
def albedo(path, target, size=1024, q=80, keep=0.35):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    m = a.reshape(-1, 3).mean(0); t = np.array(target, np.float32)
    gain = (t / m) * (1 - keep) + (t.mean() / m.mean()) * keep   # mostly match tint, keep some of the photo's own colour
    return enc(Image.fromarray(np.clip(a * gain, 0, 255).astype(np.uint8)), size, q)
def plain(path, size, q, mode='RGB'):
    return enc(Image.open(path).convert(mode), size, q)
G4 = S + 'Grass004/Grass004_1K-JPG_'
out = {
  'asphalt': albedo(S + 'asphalt_track_diff.jpg', [82, 83, 86]),
  'asphaltN': plain(S + 'asphalt_track_nor.jpg', 1024, 82),
  'asphaltR': plain(S + 'asphalt_track_rough.jpg', 512, 80, 'L'),
  'grass': albedo(G4 + 'Color.jpg', [80, 120, 46]),
  'grassN': plain(G4 + 'NormalGL.jpg', 512, 82),
  'gravel': albedo(S + 'gravel_floor_02_diff.jpg', [182, 164, 132], 1024, 78),
  'gravelN': plain(S + 'gravel_floor_02_nor.jpg', 512, 82),
  'sand': albedo(S + 'coast_sand_01_diff.jpg', [210, 178, 132], 1024, 78),
  'sandN': plain(S + 'coast_sand_01_nor.jpg', 512, 82),
  'concrete': albedo(S + 'concrete_floor_02_diff.jpg', [182, 180, 174], 512, 80, 0.2),
  'runoff': albedo(S + 'asphalt_pit_lane_diff.jpg', [104, 106, 110], 512, 80, 0.2),
}
js = '// CC0 photo textures (Poly Haven: asphalt_track, asphalt_pit_lane, gravel_floor_02, coast_sand_01, concrete_floor_02; ambientCG: Grass004)\nconst PHOTO_TEX = ' + json.dumps(out) + ';\n'
open('assets/photo.js', 'w').write(js)
print('photo.js', len(js) // 1024, 'KB', {k: len(v) // 1024 for k, v in out.items()})

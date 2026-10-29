# Prepares the Sketchfab driver and helmet (CC BY 4.0, see assets/HDRI-LICENSE-NOTE.md) for the game:
# converts spec/gloss materials to metal/rough, drops the parts the game never shows, downsizes textures,
# and writes assets/models.js with the GLBs as base64 data URIs.
import json, struct, io, base64, sys
from PIL import Image

def read(path):
    b = open(path, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + L]); off = 20 + L; BL = struct.unpack('<I', b[off:off + 4])[0]
    return j, bytearray(b[off + 8:off + 8 + BL])

def write(j, chunks):
    # chunks: list of bytes per bufferView index (already in new order)
    bin_ = bytearray(); views = []
    for data in chunks:
        while len(bin_) % 4: bin_.append(0)
        views.append((len(bin_), len(data))); bin_ += data
    for v, (o, n) in zip(j['bufferViews'], views): v['byteOffset'] = o; v['byteLength'] = n; v['buffer'] = 0
    while len(bin_) % 4: bin_.append(0)
    j['buffers'] = [{'byteLength': len(bin_)}]
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_
    return out

def process(path, keep_mesh, tex_max, keep_images=True):
    j, b = read(path)
    chunks = [bytes(b[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]) for v in j['bufferViews']]
    # spec/gloss -> metal/rough
    for m in j.get('materials', []):
        sg = m.get('extensions', {}).pop('KHR_materials_pbrSpecularGlossiness', None)
        if sg is not None:
            pbr = {'metallicFactor': 0, 'roughnessFactor': 1 - sg.get('glossinessFactor', 0.3) * 0.6}
            if 'diffuseTexture' in sg: pbr['baseColorTexture'] = sg['diffuseTexture']
            if 'diffuseFactor' in sg: pbr['baseColorFactor'] = sg['diffuseFactor']
            m['pbrMetallicRoughness'] = pbr
        if not m.get('extensions'): m.pop('extensions', None)
    j.pop('extensionsUsed', None); j.pop('extensionsRequired', None)
    # hide unwanted meshes by detaching them from nodes
    for n in j['nodes']:
        if 'mesh' in n and not keep_mesh(j['meshes'][n['mesh']].get('name', '')): n.pop('mesh'); n.pop('skin', None)
    # drop textures no remaining material uses (then their images)
    used_tex = set()
    def walk(o):
        if isinstance(o, dict):
            if 'index' in o and isinstance(o['index'], int) and set(o) <= {'index', 'texCoord', 'scale', 'strength', 'extensions'}: used_tex.add(o['index'])
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    used_mats = {p.get('material') for n in j['nodes'] if 'mesh' in n for p in j['meshes'][n['mesh']]['primitives']}
    for i, m in enumerate(j.get('materials', [])):
        if i in used_mats: walk(m)
    used_img = {j['textures'][t]['source'] for t in used_tex} if j.get('textures') else set()
    for i, im in enumerate(j.get('images', [])):
        bv = im['bufferView']
        if i not in used_img:
            o = io.BytesIO(); Image.new('RGB', (1, 1)).save(o, 'PNG'); chunks[bv] = o.getvalue(); im['mimeType'] = 'image/png'; continue
        pic = Image.open(io.BytesIO(chunks[bv])); has_a = pic.mode in ('RGBA', 'LA') and pic.getextrema()[-1][0] < 250
        pic.thumbnail((tex_max, tex_max), Image.LANCZOS); o = io.BytesIO()
        if has_a: pic.convert('RGBA').save(o, 'PNG', optimize=True); im['mimeType'] = 'image/png'
        else: pic.convert('RGB').save(o, 'JPEG', quality=82, optimize=True); im['mimeType'] = 'image/jpeg'
        chunks[bv] = o.getvalue()
    # repack: every live accessor gets its own tightly packed bufferView, everything else is dropped
    CS = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    live = []
    for n in j['nodes']:
        if 'mesh' in n:
            for pr in j['meshes'][n['mesh']]['primitives']:
                live += list(pr['attributes'].values()) + ([pr['indices']] if 'indices' in pr else [])
    for sk in j.get('skins', []):
        if 'inverseBindMatrices' in sk: live.append(sk['inverseBindMatrices'])
    new_views, new_chunks, remap_bv = [], [], {}
    for a in dict.fromkeys(live):
        acc = j['accessors'][a]; bv = j['bufferViews'][acc['bufferView']]; esz = CS[acc['componentType']] * NC[acc['type']]
        stride = bv.get('byteStride', esz); src = chunks[acc['bufferView']]; o0 = acc.get('byteOffset', 0)
        data = b''.join(src[o0 + i * stride:o0 + i * stride + esz] for i in range(acc['count']))
        nv = {'buffer': 0, 'byteLength': len(data)}
        if bv.get('target'): nv['target'] = bv['target']
        acc['bufferView'] = len(new_views); acc['byteOffset'] = 0; new_views.append(nv); new_chunks.append(data)
    for im in j.get('images', []):
        if chunks[im['bufferView']]:
            new_views.append({'buffer': 0, 'byteLength': 0}); new_chunks.append(chunks[im['bufferView']]); im['bufferView'] = len(new_views) - 1
    j['images'] = [im for im in j.get('images', []) if im['bufferView'] < len(new_views) and new_chunks[im['bufferView']]] if False else j.get('images', [])
    for i, im in enumerate(j.get('images', [])):
        if im['bufferView'] >= len(new_views) or not new_chunks[im['bufferView']] or im not in [x for x in j['images']]: pass
    # images that were dropped still point at old views: give them an empty 1x1 png so indices stay valid
    tiny = None
    for im in j.get('images', []):
        if im['bufferView'] < len(new_views) and new_views[im['bufferView']]['byteLength'] == 0 and new_chunks[im['bufferView']]: continue
    j['bufferViews'] = new_views; chunks = new_chunks
    return write(j, chunks)

helmet = process('assets/models_src/helmet.glb', lambda n: 'Plane.002' not in n and 'Cube.007' not in n, 512)  # Cube.007 is a hidden inner liner
driver = process('assets/models_src/driver.glb', lambda n: any(k in n for k in ('Outfit_Top', 'Wolf3D_Body')), 512)
car = open('assets/models_src/car2026_game.glb', 'rb').read()  # made by tools/prep_car.mjs
js = ('// Driver, helmet and car models (Sketchfab, CC BY 4.0): "race driver" by asset_for_games, "Racing helmet" by mizucorp4,\n// "My take on the 2026 f1 regulations" by MaG80.\n'
      '// Built by assets/make_models.py from assets/models_src/.\n'
      'const MODEL_DATA = ' + json.dumps({k: 'data:model/gltf-binary;base64,' + base64.b64encode(v).decode() for k, v in (('helmet', helmet), ('driver', driver), ('car', car))}) + ';\n')
open('assets/models.js', 'w').write(js)
print('helmet KB', len(helmet) // 1024, 'driver KB', len(driver) // 1024, 'car KB', len(car) // 1024, 'models.js KB', len(js) // 1024)

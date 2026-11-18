// Prepares the Sketchfab bike "Ducati Lenovo Team - MotoGP26" by Kenny3D89 (CC BY 4.0) for the game.
// Removes the paddock stand, puts in the textures cleaned of all branding (assets/clean_bike_tex.py), splits the
// wheels out (each spins about its own axle), scales it to a real wheelbase and writes three detail levels:
//   hero (close bikes, full detail), field (~20k triangles), far (~4k triangles in one draw call, vertex colours).
// Usage: download the model as glb (Sketchfab model 497ac78767344110a0046a3ab4a5d058, via the download API with a Sketchfab
// token) to assets/bikes_src/motogp26.glb, run python3 assets/clean_bike_tex.py, then: cd tools && node prep_bike.mjs
// (writes assets/bikes_src/bike_*.glb and assets/bikes.js)
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, flatten, join, quantize, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { MeshoptSimplifier } from 'meshoptimizer-simplifier';   // a newer simplifier (prunes the small parts); the encoder stays the one the game's decoder reads
import sharp from 'sharp';
import fs from 'fs';
const SRC = '../assets/bikes_src/', TEX = SRC + 'tex/', WHEELBASE = 1.46;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const TEXMAP = { Part1_Mat: 'body', Part2_Mat: 'screen', Part3_Mat: 'upper', Part4_Mat: 'chassis', Part7_Mat: 'dash', Part8_Mat: 'tyre', Part9_Mat: 'rims' };
const WHEEL = /Part6_Mat|Part8_Mat|Part9_Mat/;     // discs and sprockets, tyres, rims

async function build(level) {
  const doc = await io.read(SRC + 'motogp26.glb'), root = doc.getRoot();
  for (const n of root.listNodes()) { const m = n.getMesh(); if (m && m.listPrimitives().some((p) => p.getMaterial() && p.getMaterial().getName() === 'Part10_Mat')) n.setMesh(null); }
  await doc.transform(flatten(), prune());
  // bake every node's transform into its vertices, so all geometry is in one model space
  const scene = root.listScenes()[0], prims = [];
  for (const n of root.listNodes()) {
    const m = n.getMesh(); if (!m) continue; const M = n.getWorldMatrix();
    for (const p of m.listPrimitives()) {
      const pos = p.getAttribute('POSITION'), a = pos.getArray().slice();
      for (let i = 0; i < a.length; i += 3) { const x = a[i], y = a[i + 1], z = a[i + 2]; a[i] = M[0] * x + M[4] * y + M[8] * z + M[12]; a[i + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; a[i + 2] = M[2] * x + M[6] * y + M[10] * z + M[14]; }
      pos.setArray(a);
      const nrm = p.getAttribute('NORMAL'); if (nrm) { const b = nrm.getArray().slice(); for (let i = 0; i < b.length; i += 3) { const x = b[i], y = b[i + 1], z = b[i + 2]; let X = M[0] * x + M[4] * y + M[8] * z, Y = M[1] * x + M[5] * y + M[9] * z, Z = M[2] * x + M[6] * y + M[10] * z; const l = Math.hypot(X, Y, Z) || 1; b[i] = X / l; b[i + 1] = Y / l; b[i + 2] = Z / l; } nrm.setArray(b); }
      for (const sem of ['TEXCOORD_0', 'TEXCOORD_1']) { const uv = p.getAttribute(sem); if (!uv) continue; const u = uv.getArray().slice(); let mu = 1e9, mv = 1e9; for (let i = 0; i < u.length; i += 2) { mu = Math.min(mu, u[i]); mv = Math.min(mv, u[i + 1]); } const du = Math.floor(mu + 1e-4), dv = Math.floor(mv + 1e-4); if (du || dv) { for (let i = 0; i < u.length; i += 2) { u[i] -= du; u[i + 1] -= dv; } uv.setArray(u); } } // uvs shifted into 0..1 (the source uses 1..2 with repeat)
      prims.push(p);
    }
    n.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  // the two tyres give the axles: front is +z in the source model
  const tyres = prims.filter((p) => p.getMaterial().getName() === 'Part8_Mat').map((p) => { const a = p.getAttribute('POSITION').getArray(); let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[i + k]); hi[k] = Math.max(hi[k], a[i + k]); } return { c: lo.map((v, k) => (v + hi[k]) / 2), r: (hi[1] - lo[1]) / 2 }; }).sort((A, B) => B.c[2] - A.c[2]);
  const [F, R] = tyres, s = WHEELBASE / (F.c[2] - R.c[2]), groundY = Math.min(F.c[1] - F.r, R.c[1] - R.r);
  // model space for the game: x forward, y left, z up, origin on the ground under the rear axle (metres)
  const toGame = (x, y, z) => [(z - R.c[2]) * s, x * s, (y - groundY) * s];
  for (const p of prims) {
    const pos = p.getAttribute('POSITION'), a = pos.getArray().slice();
    for (let i = 0; i < a.length; i += 3) { const g = toGame(a[i], a[i + 1], a[i + 2]); a[i] = g[0]; a[i + 1] = g[1]; a[i + 2] = g[2]; }
    pos.setArray(a);
    const nrm = p.getAttribute('NORMAL'); if (nrm) { const b = nrm.getArray().slice(); for (let i = 0; i < b.length; i += 3) { const x = b[i], y = b[i + 1], z = b[i + 2]; b[i] = z; b[i + 1] = x; b[i + 2] = y; } nrm.setArray(b); }
  }
  const axF = toGame(...F.c), axR = toGame(...R.c);
  // split the wheel parts into front and rear groups, each re-centred on its own axle
  const groups = { body: [], wheelF: [], wheelR: [] };
  const mid = (axF[0] + axR[0]) / 2;
  for (const p of prims) {
    if (!WHEEL.test(p.getMaterial().getName())) { groups.body.push(p); continue; }
    const pos = p.getAttribute('POSITION').getArray(), idx = p.getIndices().getArray(), out = { f: [], r: [] };
    for (let t = 0; t < idx.length; t += 3) { const cx = (pos[idx[t] * 3] + pos[idx[t + 1] * 3] + pos[idx[t + 2] * 3]) / 3; (cx > mid ? out.f : out.r).push(idx[t], idx[t + 1], idx[t + 2]); }
    for (const [key, list, ax] of [['wheelF', out.f, axF], ['wheelR', out.r, axR]]) {
      if (!list.length) continue;
      const q = p.clone(); q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)));
      const qp = q.getAttribute('POSITION').clone(), a = qp.getArray().slice(); for (let i = 0; i < a.length; i += 3) { a[i] -= ax[0]; a[i + 2] -= ax[2]; } qp.setArray(a); q.setAttribute('POSITION', qp);
      groups[key].push(q);
    }
  }
  // detail level: simplify each primitive (texture seams respected where possible)
  const ratio = level === 'hero' ? 1 : level === 'field' ? 0.2 : 0.035, texMax = level === 'hero' ? 1024 : level === 'field' ? 512 : 256;
  const simp = (p) => {
    if (ratio >= 1) return;
    const P = new Float32Array(p.getAttribute('POSITION').getArray()), I = new Uint32Array(p.getIndices().getArray());
    const target = Math.max(36, Math.floor((I.length * ratio) / 3) * 3);
    // texture seams are kept (each triangle keeps its own island's uvs); Permissive lets a seam collapse only where the
    // uvs on both sides agree, Prune drops the tiny parts (bolts, clips) that the simplifier cannot shrink
    const uvA = p.getAttribute('TEXCOORD_0'), UV = uvA ? new Float32Array(uvA.getArray()) : new Float32Array(P.length / 3 * 2);
    let [o] = MeshoptSimplifier.simplifyWithAttributes(I, P, 3, UV, 2, [2, 2], null, target, 0.02, p.getMaterial().getName() === 'Part1_Mat' ? ['Prune'] : ['Permissive', 'Prune']);
    if (process.env.DEBUG) console.log('  ', p.getMaterial().getName(), I.length / 3, '->', o.length / 3, 'target', target / 3);
    p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(o)));
  };
  if (level === 'far') return buildFar(doc, groups, axF, axR, scene);
  // a fresh node per group
  for (const n of root.listNodes()) n.dispose();
  const top = doc.createNode('bike'); scene.addChild(top);
  for (const [key, list] of Object.entries(groups)) {
    const mesh = doc.createMesh(key); list.forEach((p) => { simp(p); if (p.getIndices().getCount() >= 3) mesh.addPrimitive(p); });
    const node = doc.createNode(key).setMesh(mesh); if (key !== 'body') node.setTranslation(key === 'wheelF' ? [axF[0], 0, axF[2]] : [axR[0], 0, axR[2]]);
    top.addChild(node);
  }
  for (const m of root.listMeshes()) if (!Object.keys(groups).includes(m.getName())) m.dispose();
  // cleaned textures, resized for this level
  for (const mat of root.listMaterials()) {
    const name = TEXMAP[mat.getName()], t = mat.getBaseColorTexture();
    if (name && t) { const png = TEX + name + '.png', alpha = name === 'screen'; t.setImage(await sharp(png).resize(texMax, texMax, { fit: 'inside' })[alpha ? 'png' : 'jpeg'](alpha ? {} : { quality: 85 }).toBuffer()).setMimeType(alpha ? 'image/png' : 'image/jpeg'); }
    else if (t && level !== 'hero') { const im = await sharp(Buffer.from(t.getImage())).resize(texMax, texMax, { fit: 'inside' }); const hasA = t.getMimeType() === 'image/png' && /Part5|Part6/.test(mat.getName()); t.setImage(await (hasA ? im.png() : im.jpeg({ quality: 82 })).toBuffer()).setMimeType(hasA ? 'image/png' : 'image/jpeg'); }
    if (level === 'far') mat.setNormalTexture(null);
  }
  if (level === 'far') for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('NORMAL', null); // the game recomputes smooth normals (the coarse mesh's own ones shade badly)
  {
  }
  await doc.transform(dedup(), prune(), join({ keepNamed: true }), prune(), quantize({ quantizePosition: 14, quantizeTexcoord: 12, quantizeNormal: 10 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices() ? p.getIndices().getCount() / 3 : 0;
  await io.write(SRC + 'bike_' + level + '.glb', doc);
  AXLES = { front: axF, rear: axR, rF: F.r * s, rR: R.r * s };
  console.log(level, 'triangles', tris, 'KB', Math.round(fs.statSync(SRC + 'bike_' + level + '.glb').size / 1024), 'axles', axF.map((v) => v.toFixed(3)), axR.map((v) => v.toFixed(3)), 'scale', s.toFixed(3));
}
let AXLES = null;
// far level: one mesh, one material, no textures. Each vertex carries the colour of the texture under it and the livery
// weights (paint, stripe), so the whole bike is a single draw call; the wheels don't need to spin at this distance.
async function buildFar(doc, groups, axF, axR, scene) {
  const root = doc.getRoot(), pix = {};
  const raw = async (key, buf) => pix[key] || (pix[key] = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  const lin = (c) => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
  const outP = [], outC = [], outL = [], outI = [], outW = [];
  for (const [key, list] of Object.entries(groups)) for (const p of list) {
    const mat = p.getMaterial(), name = mat.getName(), t = mat.getBaseColorTexture(), f = mat.getBaseColorFactor();
    const img = t ? await raw(name, TEXMAP[name] ? fs.readFileSync(TEX + TEXMAP[name] + '.png') : Buffer.from(t.getImage())) : null;
    const mask = name === 'Part1_Mat' ? await raw('mask', fs.readFileSync(TEX + 'body_mask.png')) : null;
    const P = p.getAttribute('POSITION').getArray(), uv = p.getAttribute('TEXCOORD_0') ? p.getAttribute('TEXCOORD_0').getArray() : null, I = p.getIndices().getArray();
    const off = key === 'wheelF' ? axF : key === 'wheelR' ? axR : [0, 0, 0], base = outP.length / 3;
    const at = (im, u, v) => { const W = im.info.width, H = im.info.height, x = ((Math.floor(u * W) % W) + W) % W, y = ((Math.floor(v * H) % H) + H) % H, i = (y * W + x) * 4; return [im.data[i], im.data[i + 1], im.data[i + 2]]; };
    for (let v = 0; v < P.length / 3; v++) {
      outP.push(P[v * 3] + off[0], P[v * 3 + 1], P[v * 3 + 2] + off[2]);
      const c = img && uv ? at(img, uv[v * 2], uv[v * 2 + 1]) : [255, 255, 255];
      outC.push(lin(c[0]) * f[0], lin(c[1]) * f[1], lin(c[2]) * f[2]);
      const m = mask && uv ? at(mask, uv[v * 2], uv[v * 2 + 1]) : [0, 0, 0]; outL.push(m[0] / 255, m[1] / 255);
      outW.push(name === 'Part1_Mat' ? 8 : name === 'Part8_Mat' ? 3 : 1);   // the fairing is the outer shell: its colour wins
    }
    for (let k = 0; k < I.length; k++) outI.push(I[k] + base);
  }
  // weld by position (one colour per corner is plenty at this size), then simplify with colour and livery as attributes
  const n = outP.length / 3, canon = new Uint32Array(n), seen = new Map();
  for (let v = 0; v < n; v++) { const k = outP[v * 3].toFixed(4) + ',' + outP[v * 3 + 1].toFixed(4) + ',' + outP[v * 3 + 2].toFixed(4); const c = seen.get(k); canon[v] = c === undefined ? (seen.set(k, v), v) : c; }
  const PI = new Float32Array(outP), A = new Float32Array(n * 5);
  for (let v = 0; v < n; v++) { A.set([outC[v * 3], outC[v * 3 + 1], outC[v * 3 + 2], outL[v * 2], outL[v * 2 + 1]], v * 5); }
  const IW = new Uint32Array(outI.map((v) => canon[v])), target = 4500 * 3;
  let [o] = MeshoptSimplifier.simplifyWithAttributes(IW, PI, 3, A, 5, [0.15, 0.15, 0.15, 0.3, 0.3], null, target, 0.1, ['Prune']);
  console.log('far: welded', IW.length / 3, '-> attr simplify', o.length / 3);
  if (o.length > target * 1.3) { o = MeshoptSimplifier.simplifySloppy(o, PI, 3, null, target, 1)[0]; console.log('far: sloppy', o.length / 3); }
  const remap = new Map(), keep = [], NI = new Uint32Array(o.length);
  for (let k = 0; k < o.length; k++) { let r = remap.get(o[k]); if (r === undefined) { r = keep.length; remap.set(o[k], r); keep.push(o[k]); } NI[k] = r; }
  const pos = new Float32Array(keep.length * 3), col = new Float32Array(keep.length * 3), liv = new Float32Array(keep.length * 2);
  // each kept corner takes the weighted average colour of the original surface within 6 cm (fairing first), so the far
  // bike shows the team colours rather than whatever internal part the simplifier kept
  const G = 0.06, cell = (x) => Math.floor(x / G), grid = new Map();
  for (let v = 0; v < n; v++) { const k = cell(PI[v * 3]) + ',' + cell(PI[v * 3 + 1]) + ',' + cell(PI[v * 3 + 2]); (grid.get(k) || grid.set(k, []).get(k)).push(v); }
  keep.forEach((v, k) => {
    pos.set(PI.subarray(v * 3, v * 3 + 3), k * 3); const acc = [0, 0, 0, 0, 0]; let wsum = 0;
    const cx = cell(PI[v * 3]), cy = cell(PI[v * 3 + 1]), cz = cell(PI[v * 3 + 2]);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const q of grid.get((cx + a) + ',' + (cy + b) + ',' + (cz + c)) || []) {
      const d = Math.hypot(PI[q * 3] - PI[v * 3], PI[q * 3 + 1] - PI[v * 3 + 1], PI[q * 3 + 2] - PI[v * 3 + 2]); if (d > G) continue;
      const w = outW[q] * (1 - d / G); for (let i = 0; i < 5; i++) acc[i] += A[q * 5 + i] * w; wsum += w; }
    for (let i = 0; i < 5; i++) acc[i] = wsum ? acc[i] / wsum : A[v * 5 + i];
    col.set(acc.slice(0, 3), k * 3); liv.set(acc.slice(3, 5), k * 2);
  });
  for (const nd of root.listNodes()) nd.dispose(); for (const m of root.listMeshes()) m.dispose();
  const mat = doc.createMaterial('far').setRoughnessFactor(0.45).setMetallicFactor(0.1);
  const prim = doc.createPrimitive().setMaterial(mat).setIndices(doc.createAccessor().setType('SCALAR').setArray(keep.length < 65536 ? new Uint16Array(NI) : NI))
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos)).setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col))
    .setAttribute('_LIVERY', doc.createAccessor().setType('VEC2').setArray(liv));
  const top = doc.createNode('bike').setMesh(doc.createMesh('far').addPrimitive(prim)); scene.addChild(top);
  await doc.transform(prune(), quantize({ quantizePosition: 12, quantizeColor: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await io.write(SRC + 'bike_far.glb', doc);
  console.log('far triangles', NI.length / 3, 'KB', Math.round(fs.statSync(SRC + 'bike_far.glb').size / 1024));
}
for (const l of ['hero', 'field', 'far']) await build(l);
// assets/bikes.js: the three levels, the livery mask and the axle positions, all embedded
const uri = (f, mime) => 'data:' + mime + ';base64,' + fs.readFileSync(f).toString('base64');
const mask = await sharp(TEX + 'body_mask.png').resize(512, 512).png().toBuffer();
const data = { hero: uri(SRC + 'bike_hero.glb', 'model/gltf-binary'), field: uri(SRC + 'bike_field.glb', 'model/gltf-binary'), far: uri(SRC + 'bike_far.glb', 'model/gltf-binary'), mask: 'data:image/png;base64,' + mask.toString('base64') };
const js = '// Race bike models: "Ducati Lenovo Team - MotoGP26" by Kenny3D89 on Sketchfab (CC BY 4.0), with all branding removed and\n' +
  '// repainted in the game\'s own liveries. Built by tools/prep_bike.mjs (textures by assets/clean_bike_tex.py).\n' +
  '// Model space: x forward, y left, z up, metres, origin on the ground under the rear axle.\n' +
  'const BIKE_AXLES = ' + JSON.stringify({ front: AXLES.front.map((v) => +v.toFixed(4)), rear: AXLES.rear.map((v) => +v.toFixed(4)), rF: +AXLES.rF.toFixed(4), rR: +AXLES.rR.toFixed(4) }) + ';\n' +
  'const BIKE_DATA = ' + JSON.stringify(data) + ';\n';
fs.writeFileSync('../assets/bikes.js', js); console.log('bikes.js KB', Math.round(js.length / 1024));

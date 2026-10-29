// Prepares the Sketchfab 2026-regulations car (CC BY 4.0, "My take on the 2026 f1 regulations" by MaG80):
// drops its wheels and camera, flattens the hierarchy, simplifies the meshes for phones and quantizes them.
// Usage: cd tools && npm install && node prep_car.mjs [ratio]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, flatten, join, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const ratio = +(process.argv[2] || 0.22);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('../assets/models_src/car2026.glb');
const root = doc.getRoot();
for (const n of root.listNodes()) {
  const m = n.getMesh(), name = n.getName();
  if (n.getCamera() || /Wheel/i.test(name) || (m && /Wheel/i.test(m.getName()))) { n.setMesh(null); n.setCamera(null); }
}
for (const c of root.listCameras()) c.dispose();
// normals are recomputed in the game; dropping them lets vertices on hard edges merge so the mesh can simplify
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const nrm = p.getAttribute('NORMAL'); if (nrm) { p.setAttribute('NORMAL', null); } }
await doc.transform(flatten(), dedup(), prune(), weld({ tolerance: 0.0005 }));
// texture seams lock the regular simplifier, so use meshoptimizer's sloppy mode per primitive and compact the result
await MeshoptSimplifier.ready;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  const pos = p.getAttribute('POSITION'), idxA = p.getIndices(); if (!idxA) continue;
  const P = new Float32Array(pos.getArray()), I = new Uint32Array(idxA.getArray());
  const target = Math.max(60, Math.floor((I.length * ratio) / 3) * 3);
  // weld by position only so seams do not lock the simplifier (seam vertices keep one side's uv)
  const canon = new Uint32Array(P.length / 3), seen = new Map();
  for (let v = 0; v < canon.length; v++) { const key = P[v * 3].toFixed(4) + ',' + P[v * 3 + 1].toFixed(4) + ',' + P[v * 3 + 2].toFixed(4); const c = seen.get(key); canon[v] = c === undefined ? (seen.set(key, v), v) : c; }
  const IW = I.map((v) => canon[v]);
  const [out] = MeshoptSimplifier.simplify(IW, P, 3, target, +(process.argv[3] || 0.02));
  const remap = new Map(), keep = [];
  const NI = new Uint32Array(out.length);
  for (let k = 0; k < out.length; k++) { let r = remap.get(out[k]); if (r === undefined) { r = keep.length; remap.set(out[k], r); keep.push(out[k]); } NI[k] = r; }
  for (const sem of p.listSemantics()) {
    const a = p.getAttribute(sem), sz = a.getElementSize(), src = a.getArray(), dst = new src.constructor(keep.length * sz);
    keep.forEach((v, k) => { for (let c = 0; c < sz; c++) dst[k * sz + c] = src[v * sz + c]; });
    a.setArray(dst);
  }
  idxA.setArray(keep.length < 65536 ? new Uint16Array(NI) : NI);
}
await doc.transform(join({ keepNamed: true }), prune(), quantize({ quantizePosition: 14, quantizeTexcoord: 12 }));
let verts = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) verts += p.getAttribute('POSITION').getCount();
await io.write('../assets/models_src/car2026_game.glb', doc);
console.log('meshes', root.listMeshes().length, 'verts', verts);

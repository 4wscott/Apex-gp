// Prepares the Sketchfab car "2027 Formula 1 Car" by abuhossain844 (CC BY 4.0) for the game: an untextured CAD model
// (about 2 million triangles, no branding). The wheels and hubs are cut away (the game draws its own: they spin, steer
// and show the tyre compound), every part is baked into the game's car frame at the game's wheelbase, the parts are
// grouped by finish into five meshes (paint, carbon, metal, glass, lights: five draw calls), tiny parts are pruned and
// two detail levels are written: hq (nearby cars) and game (distant cars, phones).
// Car frame (three.js, before the car's 1.08 drawing scale): x forward, y up, z right; axles at x = +1.7 / -1.7.
// Usage: download the model as glb (Sketchfab model 900b2d93db1b4fd7bfce436067e25287) to assets/car2027_src/f1_2027.glb,
// then: cd tools && node prep_car2027.mjs        (writes assets/car2027_src/car27_hq.glb and car27_game.glb)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { MeshoptSimplifier } from 'meshoptimizer-simplifier';
import fs from 'fs';
const SRC = '../assets/car2027_src/';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
// the source: y up, front toward +z, metres after its node scale; axles at z = -1.46 (front) and -4.48 (rear), y = -0.07
const AXF = -1.46, AXR = -4.48, AXY = -0.07, TYRE_R = 0.31, S = 3.4 / (AXF - AXR), MID = (AXF + AXR) / 2, GROUND = AXY - TYRE_R;
const toCar = (x, y, z) => [(z - MID) * S, (y - GROUND) * S, -x * S];
const classOf = (name) => /LED.*\(White\)_0$|LED_-_SMD_5630_-_50lm_White$/.test(name) && !/_0$/.test(name) ? 'light' : /LED/i.test(name) ? (name.endsWith('_0') ? 'light2' : 'light') : /Glass/i.test(name) ? 'glass' : /Steel|Powder/i.test(name) ? 'metal' : /FRONT_NOSE/i.test(name) ? 'paint' : 'carbon';
const inWheel = (x, y, z) => Math.abs(x) > 0.5 && (Math.hypot(y - AXY, z - AXF) < TYRE_R + 0.02 || Math.hypot(y - AXY, z - AXR) < TYRE_R + 0.02);

async function build(level) {
  const doc = await io.read(SRC + 'f1_2027.glb'), root = doc.getRoot();
  const groups = {};
  for (const n of root.listNodes()) {
    const m = n.getMesh(); if (!m) continue; const M = n.getWorldMatrix();
    for (const p of m.listPrimitives()) {
      const cls = classOf(p.getMaterial() ? p.getMaterial().getName() : '');
      const P = p.getAttribute('POSITION').getArray(), I = p.getIndices() ? p.getIndices().getArray() : null; if (!I) continue;
      const W = new Float32Array(P.length);
      for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; W[i] = M[0] * x + M[4] * y + M[8] * z + M[12]; W[i + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; W[i + 2] = M[2] * x + M[6] * y + M[10] * z + M[14]; }
      // tiny parts (bolts, lettering, rivets) only clutter the detail levels
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < W.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], W[i + k]); hi[k] = Math.max(hi[k], W[i + k]); }
      const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]); if (diag < (level === 'hq' ? 0.06 : 0.18)) continue;
      const keep = [];
      for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3; if (inWheel(W[a], W[a + 1], W[a + 2]) && inWheel(W[b], W[b + 1], W[b + 2]) && inWheel(W[c], W[c + 1], W[c + 2])) continue; keep.push(I[t], I[t + 1], I[t + 2]); }
      if (!keep.length) continue;
      const g = groups[cls] || (groups[cls] = { P: [], I: [] }), base = g.P.length / 3;
      for (let i = 0; i < W.length; i += 3) g.P.push(...toCar(W[i], W[i + 1], W[i + 2]));
      for (const k of keep) g.I.push(k + base);
    }
  }
  // per finish: weld, simplify (a budget per level), then one primitive each
  const budget = level === 'hq' ? { paint: 70000, carbon: 70000, metal: 8000, glass: 2000, light: 600, light2: 600 } : { paint: 12000, carbon: 12000, metal: 1500, glass: 400, light: 120, light2: 120 };
  for (const n of root.listNodes()) n.dispose(); for (const m of root.listMeshes()) m.dispose(); for (const mt of root.listMaterials()) mt.dispose();
  const scene = root.listScenes()[0], top = doc.createNode('car27'); scene.addChild(top);
  let total = 0; const counts = {};
  for (const [cls, g] of Object.entries(groups)) {
    const P = new Float32Array(g.P), n = P.length / 3, canon = new Uint32Array(n), seen = new Map();
    for (let v = 0; v < n; v++) { const k = Math.round(P[v * 3] * 2000) + ',' + Math.round(P[v * 3 + 1] * 2000) + ',' + Math.round(P[v * 3 + 2] * 2000); const c = seen.get(k); canon[v] = c === undefined ? (seen.set(k, v), v) : c; }
    const IW = new Uint32Array(g.I.map((v) => canon[v])), target = Math.min(IW.length, (budget[cls] || 4000) * 3);
    let [o] = MeshoptSimplifier.simplify(IW, P, 3, target, 0.004, ['Prune']);
    if (o.length > target * 1.4) o = MeshoptSimplifier.simplifySloppy(o, P, 3, null, target, 0.01)[0];
    const remap = new Map(), keepV = [], NI = new Uint32Array(o.length);
    for (let k = 0; k < o.length; k++) { let r = remap.get(o[k]); if (r === undefined) { r = keepV.length; remap.set(o[k], r); keepV.push(o[k]); } NI[k] = r; }
    const pos = new Float32Array(keepV.length * 3); keepV.forEach((v, k) => pos.set(P.subarray(v * 3, v * 3 + 3), k * 3));
    const mat = doc.createMaterial(cls);
    const prim = doc.createPrimitive().setMaterial(mat).setIndices(doc.createAccessor().setType('SCALAR').setArray(keepV.length < 65536 ? new Uint16Array(NI) : NI)).setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos));
    top.addChild(doc.createNode(cls).setMesh(doc.createMesh(cls).addPrimitive(prim)));
    counts[cls] = NI.length / 3; total += NI.length / 3;
  }
  await doc.transform(prune(), quantize({ quantizePosition: 16 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const out = SRC + 'car27_' + level + '.glb'; await io.write(out, doc);
  console.log(level, 'triangles', total, JSON.stringify(counts), 'KB', Math.round(fs.statSync(out).size / 1024));
}
for (const l of ['hq', 'game']) await build(l);
// assets/car27.js: both levels embedded (the build turns them into files for the installed app)
const uri = (f) => 'data:model/gltf-binary;base64,' + fs.readFileSync(f).toString('base64');
fs.writeFileSync('../assets/car27.js', '// The race car: "2027 Formula 1 Car" by abuhossain844 on Sketchfab (CC BY 4.0), untextured, painted in the game\'s\n' +
  '// own liveries. Built by tools/prep_car2027.mjs. Car frame: x forward, y up, z right, axles at x = +1.7 / -1.7 (metres).\n' +
  'const CAR27_DATA = ' + JSON.stringify({ hq: uri(SRC + 'car27_hq.glb'), game: uri(SRC + 'car27_game.glb') }) + ';\n');
console.log('car27.js KB', Math.round(fs.statSync('../assets/car27.js').size / 1024));

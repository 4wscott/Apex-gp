// ==== Race bikes on screen (docs/PLAN-bikes.md, phase 2) ====================================================
// The bike model (assets/bikes.js) at three detail levels, painted in the team's livery through the fairing mask, on a
// chain of pivots: lean about the tyres' contact line, wheelie about the rear contact patch, stoppie about the front one,
// and the rear stepping out in a slide. The rider is the rigged rider model in team leathers with the race helmet,
// posed live by IK: hips on the seat (sliding to the inside of a corner), tucked behind the screen on the straights,
// sitting up under braking, hands on the grips, feet on the pegs, the inside knee out and the head turned into the turn.
// In a crash the rider leaves the bike and both tumble where the physics puts them.
// Model space (bikes.js): x forward from the rear axle, y left, z up. Three.js scene space: x forward, y up, z right.
const BIKE_PTS = { hips: [0.33, 0, 0.98], grip: [1.12, 0.31, 0.87], peg: [0.43, 0.25, 0.42], chin: [0.95, 0, 1.08] };
const BIKE_COG_X = 0.72; // the physics' centre of gravity, ahead of the rear axle
const m2s = (p, side = 1) => new THREE.Vector3(p[0], p[2], -p[1] * side); // model point -> scene (bike frame)

function loadBikes() {
  if (GFX.bikes) return Promise.resolve(GFX.bikes);
  if (typeof BIKE_DATA === 'undefined') return Promise.resolve(null);
  if (GFX.bikesLoading) return GFX.bikesLoading;
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  const get = (k) => fetch(BIKE_DATA[k]).then((r) => r.arrayBuffer()).then((b) => new Promise((ok, no) => L.parse(b, '', ok, no)));
  const tl = new THREE.TextureLoader();
  return (GFX.bikesLoading = Promise.all([get('hero'), get('field'), get('far'), tl.loadAsync(BIKE_DATA.mask)]).then(([h, f, r, mask]) => {
    mask.flipY = false; mask.colorSpace = THREE.NoColorSpace; mask.userData.keep = true;
    const prep = (g) => {
      const root = g.scene, wheels = {};
      root.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material.name === 'Part2_Mat') o.material = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55, depthWrite: false }); }
        if (o.name === 'wheelF' || o.name === 'wheelR') wheels[o.name] = o;
      });
      return { root, wheels };
    };
    const far = r.scene; far.traverse((o) => { if (o.isMesh) { o.geometry.computeVertexNormals(); o.castShadow = false; } });
    return (GFX.bikes = { hero: prep(h), field: prep(f), far: { root: far }, mask });
  }).catch((e) => { console.warn('bike models', e); return null; }));
}
// the team's paint on the fairing: red areas of the mask take the main colour, white areas the second; carbon stays
// the rider's race number: white or black, whichever stands out on the team's main colour
function bikeNumberTex(team, num) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  const dark = lum(team.c1) > 0.45; g.font = '900 108px "Saira Condensed", Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = dark ? '#ffffff' : '#111111'; g.strokeText(String(num), 128, 68); g.fillStyle = dark ? '#111111' : '#ffffff'; g.fillText(String(num), 128, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.keep = true; return t;
}
// the team's paint on the fairing: red areas of the mask take the main colour, white areas the second; carbon stays. The
// rider's number goes on the tail sides and the nose (worked out in the bike's own frame, so it sits on every level)
function bikePaint(mat, team, lod, num = 0) {
  const far = lod === 'far', key = team.id + lod + (far ? '' : '#' + num); GFX.bikePaints = GFX.bikePaints || {};
  if (GFX.bikePaints[key]) return GFX.bikePaints[key];
  const m = new THREE.MeshPhysicalMaterial({ map: far ? null : mat.map, vertexColors: far, roughness: far ? 0.7 : team.matte ? 0.5 : 0.32, metalness: 0.05, clearcoat: far ? 0 : team.matte ? 0.1 : 0.85, clearcoatRoughness: 0.08 });
  const c1 = new THREE.Color(team.c1), c2 = new THREE.Color(lum(team.c2) > 0.08 ? team.c2 : team.c3 || '#ffffff');
  const inv = { value: new THREE.Matrix4() }, numTex = !far && num ? bikeNumberTex(team, num) : null; m.userData.bkInv = inv;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.bkC1 = { value: c1 }; sh.uniforms.bkC2 = { value: c2 };
    if (far) {
      sh.vertexShader = 'attribute vec2 _livery; varying vec2 vLiv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLiv = _livery;');
      sh.fragmentShader = 'uniform vec3 bkC1, bkC2; varying vec2 vLiv;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, bkC1, smoothstep(0.08, 0.35, vLiv.x)); diffuseColor.rgb = mix(diffuseColor.rgb, bkC2, smoothstep(0.1, 0.4, vLiv.y));');
    } else {
      sh.uniforms.bkMask = { value: GFX.bikes.mask }; sh.uniforms.bkInv = inv; sh.uniforms.bkNum = { value: numTex };
      sh.vertexShader = 'uniform mat4 bkInv; varying vec3 vBkP; varying vec3 vBkN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBkP = (bkInv * modelMatrix * vec4(transformed, 1.0)).xyz; vBkN = normalize(mat3(bkInv) * mat3(modelMatrix) * objectNormal);');
      let frag = '#include <map_fragment>\n vec3 bkL = texture2D(bkMask, vMapUv).rgb; diffuseColor.rgb = mix(diffuseColor.rgb, bkC1, bkL.r); diffuseColor.rgb = mix(diffuseColor.rgb, bkC2, bkL.g);';
      if (numTex) frag += `
        { vec2 nuv = vec2(-1.0); float paint = clamp(bkL.r + bkL.g, 0.0, 1.0);
          if (abs(vBkN.y) > 0.5 && vBkP.x > -0.12 && vBkP.x < 0.26 && vBkP.z > 0.84 && vBkP.z < 1.04) nuv = vec2(vBkN.y > 0.0 ? (0.26 - vBkP.x) / 0.38 : (vBkP.x + 0.12) / 0.38, (vBkP.z - 0.84) / 0.2);
          else if (vBkN.x > 0.3 && vBkP.x > 1.22 && abs(vBkP.y) < 0.15 && vBkP.z > 0.6 && vBkP.z < 0.95) nuv = vec2((vBkP.y + 0.15) / 0.3, (vBkP.z - 0.6) / 0.35);
          if (nuv.x >= 0.0 && nuv.x <= 1.0 && nuv.y >= 0.0 && nuv.y <= 1.0) { vec4 nt = texture2D(bkNum, nuv); diffuseColor.rgb = mix(diffuseColor.rgb, nt.rgb, nt.a * paint); } }`;
      sh.vertexShader = sh.vertexShader; sh.fragmentShader = 'uniform vec3 bkC1, bkC2; uniform sampler2D bkMask, bkNum; varying vec3 vBkP; varying vec3 vBkN;\n' + sh.fragmentShader.replace('#include <map_fragment>', frag);
    }
  };
  m.customProgramCacheKey = () => 'bikePaint' + (far ? 'F' : numTex ? 'N' : '');
  if (!far) carPaintLook(m);
  return (GFX.bikePaints[key] = m);
}
function bikeModel(lod, team, num = 0) {
  const src = GFX.bikes[lod], root = src.root.clone(true), out = { root, wheels: [], paint: null };
  root.traverse((o) => { if (o.isMesh && (o.material.name === 'Part1_Mat' || lod === 'far')) { o.material = bikePaint(o.material, team, lod, num); if (lod !== 'far') out.paint = o.material; } });
  if (lod !== 'far') {
    // each wheel spins about its true axle (the quantised nodes carry an offset): a pivot at the axle takes the wheel
    root.updateMatrixWorld(true);
    for (const [name, ax] of [['wheelF', BIKE_AXLES.front], ['wheelR', BIKE_AXLES.rear]]) {
      let node = null; root.traverse((o) => { if (o.name === name && !node) node = o; }); if (!node) continue;
      const piv = new THREE.Group(); piv.position.set(ax[0], ax[1], ax[2]); node.parent.add(piv); piv.updateMatrixWorld(true); piv.attach(node);
      out.wheels.push(piv);
    }
  }
  return out;
}
// the rider: the rigged model in team leathers (boots and gloves dark), the race helmet on the head bone
function makeRider(team, num) {
  const av = SkeletonUtils.clone(GFX.models.crew), holder = new THREE.Group(); holder.add(av);
  av.rotation.y = Math.PI / 2; // the model faces +z; the bike faces +x
  const bones = {}; av.traverse((o) => { if (o.isBone) bones[o.name.replace(/_\d+$/, '')] = o; });
  av.traverse((o) => {
    if (!o.isSkinnedMesh) return; o.frustumCulled = false; o.castShadow = true;
    const n = o.material.name;
    // leathers: the top in the team's colours; the trousers in its dark colour with the main colour as the trim (as most race leathers are)
    if (n === 'Wolf3D_Outfit_Top') o.material = new THREE.MeshStandardMaterial({ map: suitFromModel(o.material.map.image, team, n), roughness: 0.6 });
    else if (n === 'Wolf3D_Outfit_Bottom') { const dk = lum(team.c3 || '#000') < 0.2 ? team.c3 : '#16181c'; o.material = new THREE.MeshStandardMaterial({ map: suitFromModel(o.material.map.image, Object.assign({}, team, { id: team.id + '-lthr', c1: dk, c2: team.c1, c3: team.c1 }), n), roughness: 0.6 }); }
    else if (n === 'Wolf3D_Headwear') o.visible = false; // the race helmet goes on instead
    else o.material = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.7 }); // gloves, boots
  });
  const H = GFX.models.helmet, head = new THREE.Group();
  if (H) {
    const dr = team.drivers.find((d) => d.num === num) || team.drivers[0];
    head.add(new THREE.Mesh(H.shell, new THREE.MeshPhysicalMaterial({ map: driverHelmetTexture(team, dr), roughness: 0.2, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 })));
    if (H.visor) head.add(new THREE.Mesh(H.visor, GFX.mats.visor));
    head.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.material.clearcoat >= 0.5) carPaintLook(o.material); } });
  }
  av.updateMatrixWorld(true);
  const rest = {}; for (const k in bones) rest[k] = bones[k].quaternion.clone();
  // race leathers: the aero hump on the back (team colour, a stripe of the second colour) and a knee slider on the outside
  // of each knee. Placed in the bind pose, in each bone's own space, so they follow the pose
  holder.updateMatrixWorld(true);
  const toBone = (bone, worldPos) => bone.worldToLocal(worldPos.clone());
  if (bones.Spine2) {
    const sp = bones.Spine2, at = sp.getWorldPosition(new THREE.Vector3()), back = new THREE.Vector3(-1, 0, 0); // the rider faces +x in the holder
    const hump = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: team.c1, roughness: 0.55 }));
    hump.scale.set(0.085, 0.12, 0.045); hump.castShadow = true; const hw = new THREE.Group(); hw.add(hump); hump.rotation.x = Math.PI / 2; hump.position.z = 0;
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: lum(team.c2) > 0.08 ? team.c2 : team.c3 || '#ffffff', roughness: 0.55 }));
    stripe.scale.set(0.02, 0.122, 0.047); stripe.rotation.x = Math.PI / 2; hw.add(stripe);
    sp.add(hw); hw.position.copy(toBone(sp, at.clone().addScaledVector(back, 0.085).add(new THREE.Vector3(0, 0.0, 0))));
    hw.quaternion.copy(sp.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), back)));
  }
  const hipsW = bones.Hips.getWorldPosition(new THREE.Vector3()), slider = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.4, metalness: 0.2 });
  for (const sd of ['Left', 'Right']) {
    const leg = bones[sd + 'Leg']; if (!leg) continue;
    const knee = leg.getWorldPosition(new THREE.Vector3()), out = new THREE.Vector3(0, 0, knee.z - hipsW.z).normalize(); // outward from the bike's centre line
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 16), slider); puck.castShadow = true;
    leg.add(puck); puck.position.copy(toBone(leg, knee.clone().addScaledVector(out, 0.065).add(new THREE.Vector3(0.03, -0.05, 0))));
    puck.quaternion.copy(leg.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out)));
  }
  // the helmet sits on the head bone (scaled from scene metres into the bone's space)
  if (bones.Head) { const s = new THREE.Vector3(); bones.Head.getWorldScale(s); head.scale.setScalar(0.9 / s.x); head.position.set(0, 0.075 / s.y, 0.035 / s.z); head.rotation.y = -Math.PI / 2; bones.Head.add(head); }
  const hip0 = new THREE.Vector3(); bones.Hips.getWorldPosition(hip0); // hips in the holder's space (holder at the origin)
  return { holder, av, bones, rest, hip0, head };
}
function makeBike(team, num, hero = false) {
  const B = GFX.bikes, grp = new THREE.Group(), body = new THREE.Group(); grp.add(body);
  // pivots, outside in: slide (yaw), lean (about the contact line), wheelie (rear patch), stoppie (front patch)
  const yaw = new THREE.Group(), lean = new THREE.Group(), wh = new THREE.Group(), st = new THREE.Group(), frame = new THREE.Group();
  body.add(yaw); yaw.add(lean); lean.add(wh); wh.position.x = -BIKE_COG_X; wh.add(st); st.position.x = BIKE_AXLES.front[0]; st.add(frame); frame.position.x = -BIKE_AXLES.front[0];
  const lods = {};
  for (const k of hero ? ['hero', 'field', 'far'] : ['field', 'far']) { const md = bikeModel(k, team, num); md.root.rotation.x = -Math.PI / 2; md.root.visible = false; frame.add(md.root); lods[k] = md; }
  const rider = GFX.models && GFX.models.crew ? makeRider(team, num) : null;
  if (rider) frame.add(rider.holder);
  const blob = new THREE.Mesh(GFX.geo.blob, GFX.mats.blob); blob.scale.set(0.5, 1, 0.22); blob.position.y = 0.01; blob.renderOrder = 1; grp.add(blob);
  const dummy = () => new THREE.Object3D(), light = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.09), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff0000, emissiveIntensity: 0 }));
  light.position.set(-0.3, 0.78, 0); frame.add(light);
  const m = { isBike: true, grp, body, yaw, lean, wh, st, frame, lods, lod: null, rider, blob, team,
    // what the car code touches each frame: harmless stand-ins
    wheels: [], blurs: [], steer: [], discs: [], arms: [], swSimple: [], mirrors: [], fw: [dummy(), dummy()], flapPivot: dummy(), swSpin: dummy(), swTilt: dummy(), helmet: dummy(), visor: dummy(), shoulders: dummy(), rainLight: light, paint: null, modelBody: null, avatar: null };
  bikeLOD(m, hero ? 'hero' : 'field');
  return m;
}
function bikeLOD(m, k) {
  if (!m.lods[k]) k = m.lods.field ? 'field' : 'far';
  if (m.lod === k) return; m.lod = k;
  for (const key in m.lods) m.lods[key].root.visible = key === k;
  if (m.rider) m.rider.holder.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) o.castShadow = k !== 'far'; });
}
// world-axis rotation of a bone: turn it by `ang` about `axisW` (a world direction)
const _bq = new THREE.Quaternion(), _bq2 = new THREE.Quaternion(), _bv = new THREE.Vector3(), _bv2 = new THREE.Vector3(), _bv3 = new THREE.Vector3();
function turnBone(bone, axisW, ang) {
  bone.getWorldQuaternion(_bq2); _bq.setFromAxisAngle(axisW, ang).multiply(_bq2);
  bone.parent.getWorldQuaternion(_bq2); bone.quaternion.copy(_bq2.invert().multiply(_bq)); bone.updateMatrixWorld(true);
}
// two-bone IK: upper and lower bones so that `end` reaches `target`, the middle joint bending toward `pole`
function ik2(up, lo, end, target, pole) {
  const S = up.getWorldPosition(new THREE.Vector3()), E0 = lo.getWorldPosition(new THREE.Vector3()), H0 = end.getWorldPosition(new THREE.Vector3());
  const la = S.distanceTo(E0), lb = E0.distanceTo(H0), d = Math.min(S.distanceTo(target), (la + lb) * 0.995), n = target.clone().sub(S).normalize();
  const x = (la * la - lb * lb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, la * la - x * x)), p = pole.clone().addScaledVector(n, -pole.dot(n)).normalize();
  const E = S.clone().addScaledVector(n, x).addScaledVector(p, h), T = S.clone().addScaledVector(n, d);
  aimBone(up, E0, E); aimBone(lo, end.getWorldPosition(new THREE.Vector3()), T);
}
// the rider's pose from the bike's state: tuck (0 sitting up .. 1 chin on the tank), hang-off (-1 right .. 1 left)
function poseRider(m, c) {
  const R = m.rider, b = R.bones, F = m.frame;
  for (const k in R.rest) b[k].quaternion.copy(R.rest[k]);
  const lean = c.lean || 0, hang = clamp(lean / 0.9, -1, 1), tuck = c.tuck ?? 1, side = Math.sign(hang) || 1, ah = Math.abs(hang);
  // hips on the seat, sliding off to the inside and down as the bike leans
  const hp = BIKE_PTS.hips, hips = m2s([hp[0] - 0.05 * tuck + 0.04 * (1 - tuck), hp[1] + 0.12 * hang, hp[2] - 0.035 * ah]);
  R.holder.position.copy(hips).sub(R.hip0); R.holder.updateMatrixWorld(true);
  F.updateMatrixWorld(true);
  const fwd = _bv.set(1, 0, 0).transformDirection(F.matrixWorld).clone(), up = _bv2.set(0, 1, 0).transformDirection(F.matrixWorld).clone(), right = _bv3.set(0, 0, 1).transformDirection(F.matrixWorld).clone();
  // the body leans forward about the hips (tucked flat on the straights, upright under braking), and further into the turn
  turnBone(b.Hips, right, -(0.55 + 0.55 * tuck));
  turnBone(b.Hips, fwd, -hang * 0.14);
  if (b.Spine2) turnBone(b.Spine2, right, -0.18 * tuck);
  // head up to look ahead, turned toward the apex
  if (b.Neck) turnBone(b.Neck, right, 0.45 + 0.5 * tuck);
  if (b.Head) { turnBone(b.Head, right, 0.25 * tuck); turnBone(b.Head, up, hang * 0.35); }
  // hands on the grips, elbows out and down; feet on the pegs, knees forward (the inside knee out toward the kerb)
  const sides = [['Left', 1], ['Right', -1]];
  for (const [sd, sg] of sides) {
    const g = BIKE_PTS.grip, tgt = m2s([g[0], g[1] * sg, g[2]]).applyMatrix4(F.matrixWorld);
    const pole = up.clone().multiplyScalar(-0.6).addScaledVector(right, -sg * 1).addScaledVector(fwd, -0.3);
    if (b[sd + 'Arm']) ik2(b[sd + 'Arm'], b[sd + 'ForeArm'], b[sd + 'Hand'], tgt, pole);
    const p = BIKE_PTS.peg, inside = sg === side && ah > 0.15, ft = m2s([p[0] - (inside ? 0.04 : 0), p[1] * sg, p[2]]).applyMatrix4(F.matrixWorld);
    const kp = fwd.clone().addScaledVector(up, 0.3).addScaledVector(right, -sg * (inside ? 1.6 * ah + 0.3 : 0.25));
    if (b[sd + 'UpLeg']) ik2(b[sd + 'UpLeg'], b[sd + 'Leg'], b[sd + 'Foot'], ft, kp);
  }
}
// in a crash the rider is thrown clear: limbs loose, tumbling where the physics puts the rider
function riderCrashPose(m) {
  const R = m.rider, b = R.bones; for (const k in R.rest) b[k].quaternion.copy(R.rest[k]);
  const ax = new THREE.Vector3(0, 0, 1);
  for (const [k, a] of [['LeftArm', 0.9], ['RightArm', -0.9], ['LeftUpLeg', -0.5], ['RightUpLeg', -0.3], ['LeftLeg', 0.8], ['RightLeg', 0.6]]) if (b[k]) b[k].rotateOnAxis(ax, a);
}
// every frame for each bike: detail level, pivots, wheels, the rider; crashes place bike and rider apart
function bikeFrame(c, m, dt, P, near, worldRoot, T) {
  const d = c === P ? 0 : Math.hypot(c.x - P.x, c.y - P.y), q = settings.quality;
  bikeLOD(m, c === P && m.lods.hero ? 'hero' : d < [10, 14, 18, 22][q] && m.lods.hero ? 'hero' : d < [30, 45, 60, 70][q] ? 'field' : 'far');
  m.blob.visible = !c.down;
  const R = m.rider;
  if (c.down) {
    const D = c.down, k = D.bike;
    poseOnRoad(m.grp, T, k.x, k.y, k.yaw, null);
    { const L = m.lods[m.lod]; if (L && L.paint && L.paint.userData.bkInv) { L.root.updateMatrixWorld(true); L.paint.userData.bkInv.value.copy(L.root.matrixWorld).invert(); } }
    m.yaw.rotation.y = 0; m.lean.rotation.x = -k.roll; m.lean.position.y = Math.abs(Math.sin(k.roll)) * 0.32; m.wh.rotation.z = 0; m.st.rotation.z = 0;
    if (R) {
      if (R.holder.parent !== worldRoot) { worldRoot.attach(R.holder); riderCrashPose(m); }
      const r = D.rider; R.holder.position.set(r.x, (typeof groundUnder === 'function' ? groundUnder(T, r.x, r.y) : 0) + 0.15 + r.z, -r.y);
      R.holder.rotation.set(0, Math.atan2(r.vy, r.vx) || 0, 0); R.holder.rotateZ(r.tumble); R.holder.rotateX(Math.sin(r.tumble * 0.7) * 0.8);
      if (D.runT !== undefined && D.t > D.runT * 0.5) { R.holder.rotation.set(0, 0, 0); for (const kk in R.rest) R.bones[kk].quaternion.copy(R.rest[kk]); R.holder.position.y -= 0.15 + r.z; } // up and running back to the bike
    }
    return;
  }
  if (R && R.holder.parent !== m.frame) { m.frame.add(R.holder); R.holder.rotation.set(0, 0, 0); }
  poseOnRoad(m.grp, T, c.x, c.y, c.h, Replay.on ? null : c.idx);
  // the bike leans a little more than bike and rider together (the rider hangs off the inside)
  const leanVis = (c.lean || 0) * 1.1;
  m.lean.rotation.x = -leanVis; m.lean.position.y = 0;
  m.yaw.rotation.y = -(c.slideYaw || 0);
  m.wh.rotation.z = c.wheelie || 0; m.st.rotation.z = -(c.stoppie || 0);
  for (const k of ['hero', 'field']) if (m.lods[k] && m.lods[k].root.visible) m.lods[k].wheels.forEach((w) => (w.rotation.y = c.wheelAng));
  { const L = m.lods[m.lod]; if (L && L.paint && L.paint.userData.bkInv && (c === P || d < 60)) { L.root.updateMatrixWorld(true); L.paint.userData.bkInv.value.copy(L.root.matrixWorld).invert(); } } // the number decal works in the bike's own frame
  m.blob.scale.set(0.5 + Math.abs(Math.sin(leanVis)) * 0.4, 1, 0.22); m.blob.position.z = Math.sin(leanVis) * 0.25;
  // brake light in the rain
  m.rainLight.material.emissiveIntensity = T && c.env && c.env.wet > 0.3 && performance.now() % 400 < 200 ? 6 : 0;
  if (R) { R.holder.visible = m.lod !== 'far' || d < 160; if (near && R.holder.visible) poseRider(m, c); }
}
// air fences: long inflatable cushions in front of every close wall (bike races only). One mesh for the lap: a bulging
// front face and a rounded top, panels with seams every 4 m, in white with a coloured band
function buildAirFences(B, world) {
  if (!B || !B.airL) return null;
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#eef1f4'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#1d4fa3'; g.fillRect(0, 30, 512, 34); g.fillStyle = '#c8202b'; g.fillRect(0, 64, 512, 6);
  for (let x = 0; x < 512; x += 128) { const gr = g.createLinearGradient(x - 10, 0, x + 10, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 10, 0, 20, 128); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 4;
  const parts = [];
  const base = Object.getPrototypeOf(B); // the real walls (the cushion's back rests on them)
  for (const [off, side, air, wall] of [[B.wallL, 1, B.airL, base.wallL], [B.wallR, -1, B.airR, base.wallR]]) {
    const inc = (i) => air[i] > 0.05 && wall[i] - off[i] > 0.15, o2 = (k) => Float32Array.from(off, (v, i) => v + k * (wall[i] - v));
    parts.push(wallRibbon(B, off, side, 0.04, 0.7, 16, inc, o2(-0.07)), wallRibbon(B, o2(-0.07), side, 0.7, 1.25, 16, inc, o2(0.15)), wallRibbon(B, o2(0.15), side, 1.25, 1.38, 16, inc, wall));
  }
  const geo = mergeGeometries(parts, false); parts.forEach((p) => p.dispose());
  // the Long Lap lane: a tarmac strip on the run-off with orange lines either side
  const LL = B.longLap;
  if (LL) {
    const inc = (i) => (i - LL.i0 + B.n) % B.n < LL.len, sideW = LL.side > 0 ? B.wallL : B.wallR, sd = LL.side;
    const at = (o) => Float32Array.from(sideW, () => o);
    const strip = wallRibbon(B, at(LL.off - 1.6), sd, 0.025, 0.025, 8, inc, at(LL.off + 2.6));
    const lines = mergeGeometries([wallRibbon(B, at(LL.off - 1.6), sd, 0.03, 0.03, 8, inc, at(LL.off - 1.35)), wallRibbon(B, at(LL.off + 2.35), sd, 0.03, 0.03, 8, inc, at(LL.off + 2.6))], false);
    const tar = new THREE.Mesh(strip, decal(new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9, side: THREE.DoubleSide }), 1)); tar.receiveShadow = true;
    const ora = new THREE.Mesh(lines, decal(new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.6, side: THREE.DoubleSide }), 2));
    world.add(tar, ora);
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65, side: THREE.DoubleSide }));
  mesh.castShadow = mesh.receiveShadow = true; mesh.userData.noBatch = true; world.add(mesh);
  return mesh;
}

// ==== Pit crew: 17 people per stop, posed with simple two-bone IK and choreographed to the stop timer ======
// Box frame: origin at the painted box centre, +x along the pit lane (direction of travel), +z toward the
// garages. The car stops with its centre on the origin facing +x; its right-hand wheels are on the +z side.
const CREW_ROLES = (() => {
  const r = [];
  for (const [wx, sz, tag] of [[1.7, 1, 'FR'], [1.7, -1, 'FL'], [-1.7, 1, 'RR'], [-1.7, -1, 'RL']]) {
    r.push({ role: 'gun', wheel: tag, wx, sz, x: wx, z: sz * 1.32, face: -sz });
    r.push({ role: 'off', wheel: tag, wx, sz, x: wx - 0.55, z: sz * 1.95, face: -sz });
    r.push({ role: 'on', wheel: tag, wx, sz, x: wx + 0.55, z: sz * 2.05, face: -sz });
  }
  r.push({ role: 'jackF', x: 3.55, z: 0, face: 'back' }, { role: 'jackR', x: -3.35, z: 0, face: 'fwd' });
  r.push({ role: 'stab', x: 0.2, z: 1.15, face: -1 }, { role: 'stab', x: 0.2, z: -1.15, face: 1 });
  r.push({ role: 'chief', x: 4.6, z: 2.4, face: 'back' });
  return r;
})();
const PitCrew = {
  crews: [], props: null,
  reset(scene) { this.crews.forEach((c) => scene.remove(c.root)); this.crews = []; this.scene = scene; },
  // shared prop geometry
  makeProps() {
    if (this.props) return this.props;
    const G2 = GFX.geo, mats = GFX.mats;
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.4 }), alu = new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.3, metalness: 0.9 });
    // wheel gun: silver body, socket on the front, pistol grip and side handle, air hose trailing back
    const gun = (col) => { const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0.6 });
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.34, 16).rotateX(Math.PI / 2), body));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12).rotateX(Math.PI / 2).translate(0, 0, 0.22), alu));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.06).translate(0, -0.12, -0.08), dark));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8).rotateZ(Math.PI / 2).translate(0, 0.02, 0.05), dark));
      const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, -0.15, -0.12], [0, -0.45, -0.3], [0, -0.55, -0.9], [0, -0.58, -1.6]].map((p) => new THREE.Vector3(...p))), 16, 0.018, 6), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8 })); g.add(hose);
      return g; };
    const jack = (col) => { const g = new THREE.Group(); const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.5).translate(0, 0, 0.75), new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 })); g.add(bar); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25).translate(0, -0.02, 1.55), dark); g.add(foot); const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 10).rotateZ(Math.PI / 2).translate(0, -0.05, 1.45), dark); g.add(wh); return g; };
    const tyre = (front, compound) => { const g = new THREE.Group(); g.add(new THREE.Mesh(front ? G2.tyreF : G2.tyreR, mats.tyre[compound] || mats.tyre.M)); g.add(new THREE.Mesh(front ? G2.rimF : G2.rimR, mats.rim)); return g; };
    return (this.props = { gun, jack, tyre });
  },
  makePerson(team, helmetCol) {
    const av = SkeletonUtils.clone(GFX.models.crew), holder = new THREE.Group(); holder.add(av);
    const bones = {}; av.traverse((o) => { if (o.isBone) bones[o.name.replace(/_\d+$/, '')] = o; });
    av.traverse((o) => {
      if (!o.isSkinnedMesh) return; o.frustumCulled = false; o.castShadow = true;
      const n = o.material.name;
      if (n === 'Wolf3D_Outfit_Top' || n === 'Wolf3D_Outfit_Bottom') o.material = new THREE.MeshStandardMaterial({ map: suitFromModel(o.material.map.image, team, n), roughness: 0.85 });
      else if (n === 'Wolf3D_Headwear') o.material = new THREE.MeshPhysicalMaterial({ color: helmetCol, roughness: 0.25, clearcoat: 1 });
      else if (n === 'Wolf3D_Body') o.material = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.8 });
      else o.material = o.material.clone();
    });
    av.updateMatrixWorld(true);
    const rest = {}; for (const k in bones) rest[k] = bones[k].quaternion.clone();
    const hip0 = bones.Hips.position.clone();
    return { holder, av, bones, rest, hip0 };
  },
  // a crew is created on demand for a team's stop and walks back into the garage afterwards
  get(car) {
    let c = this.crews.find((k) => k.car === car);
    if (c) return c;
    if (!GFX.models || !GFX.models.crew || !GFX.pit) return null;
    c = this.crews.find((k) => !k.car && k.team === car.team) || null;
    if (!c) {
      if (this.crews.length >= (settings.quality === 0 ? 1 : 3)) { c = this.crews.find((k) => !k.car); if (!c) return null; this.scene.remove(c.root); this.crews.splice(this.crews.indexOf(c), 1); }
      c = this.build(car.team); this.crews.push(c);
    }
    c.car = car; c.t = 0; c.walk = 0; return c;
  },
  build(team) {
    const root = new THREE.Group(), pr = this.makeProps(), people = [];
    CREW_ROLES.forEach((R, k) => {
      const p = this.makePerson(team, R.role === 'chief' ? '#f4c20d' : team.c1);
      p.R = R; root.add(p.holder); people.push(p);
      if (R.role === 'gun') { p.prop = pr.gun(lum(team.c2) > 0.3 ? team.c2 : '#c9ced6'); root.add(p.prop); }
      if (R.role === 'jackF' || R.role === 'jackR') { p.prop = pr.jack(team.c1); root.add(p.prop); }
      if (R.role === 'off' || R.role === 'on') { p.prop = pr.tyre(R.wx > 0, 'M'); p.prop.visible = false; root.add(p.prop); }
    });
    this.scene.add(root);
    return { root, people, team, car: null, t: 0 };
  },
  // ---- posing ---------------------------------------------------------------------------------
  // local (holder) point -> world
  L(p, x, y, z) { return p.holder.localToWorld(new THREE.Vector3(x, y, z)); },
  ik(p, up, mid, end, target, pole) {
    const B = p.bones, a = B[up], b = B[mid], c = B[end];
    const S = a.getWorldPosition(new THREE.Vector3()), E0 = b.getWorldPosition(new THREE.Vector3()), H0 = c.getWorldPosition(new THREE.Vector3());
    const la = S.distanceTo(E0), lb = E0.distanceTo(H0), d = Math.min(S.distanceTo(target), (la + lb) * 0.999), n = target.clone().sub(S).normalize();
    const x = (la * la - lb * lb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, la * la - x * x));
    const pl = pole.clone().addScaledVector(n, -pole.dot(n)).normalize();
    const E = S.clone().addScaledVector(n, x).addScaledVector(pl, h), T = S.clone().addScaledVector(n, d);
    aimBone(a, E0, E); aimBone(b, c.getWorldPosition(new THREE.Vector3()), T);
  },
  // pose: hip height drop, torso lean (neck target), hands and feet targets, all in holder space
  pose(p, o) {
    const B = p.bones; for (const k in p.rest) B[k].quaternion.copy(p.rest[k]);
    B.Hips.position.copy(p.hip0); p.av.updateMatrixWorld(true);
    if (o.drop) { // lower the hips in world space (the rig's hip parent is rotated, z-up)
      const w = B.Hips.getWorldPosition(new THREE.Vector3()); w.y -= o.drop; B.Hips.position.copy(B.Hips.parent.worldToLocal(w)); p.av.updateMatrixWorld(true);
    }
    const fwd = p.holder.localToWorld(new THREE.Vector3(0, 0, 1)).sub(p.holder.getWorldPosition(new THREE.Vector3())).normalize();
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3().crossVectors(up, fwd).normalize(); // +side = person's left
    if (o.lean) { const nk = B.Neck.getWorldPosition(new THREE.Vector3()); aimBone(B.Spine, nk, nk.clone().addScaledVector(fwd, o.lean).addScaledVector(up, -o.lean * 0.4)); }
    const foot = o.feet || [[0.11, 0.08, 0.02], [-0.11, 0.08, 0.02]];
    const knees = o.knees || [fwd, fwd];
    this.ik(p, 'LeftUpLeg', 'LeftLeg', 'LeftFoot', this.L(p, ...foot[0]), knees[0]);
    this.ik(p, 'RightUpLeg', 'RightLeg', 'RightFoot', this.L(p, ...foot[1]), knees[1]);
    const hands = o.hands || [[0.2, 0.82, 0.05], [-0.2, 0.82, 0.05]];
    const elb = side.clone().multiplyScalar(0.6).addScaledVector(up, -1);
    this.ik(p, 'LeftArm', 'LeftForeArm', 'LeftHand', this.L(p, ...hands[0]), elb);
    this.ik(p, 'RightArm', 'RightForeArm', 'RightHand', this.L(p, ...hands[1]), elb.clone().addScaledVector(side, -1.2));
  },
  handsMid(p) { return p.bones.LeftHand.getWorldPosition(new THREE.Vector3()).add(p.bones.RightHand.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5); },
  // ---- per-frame update ------------------------------------------------------------------------
  update(dt, race, audio, camPos) {
    if (!GFX.pit || !GFX.models || !GFX.models.crew) return;
    const P = GFX.pit;
    // crews for cars heading for or sitting in their box (near the camera)
    for (const c of race.cars) {
      if (!c.pit || c.pit.phase === 'net') continue;
      const q = c.pit, bw = P.at(q.box, P.P.workDist, 0);
      if ((q.phase === 'in' && q.box - q.s < 160) || q.phase === 'queue' || q.phase === 'stop' || (q.phase === 'out' && q.s < q.box + 25))
        if (camPos.distanceTo(bw) < 260) this.get(c);
    }
    for (const C of this.crews) {
      const car = C.car; if (!car) { C.root.visible = false; continue; }
      const q = car.pit, box = q ? q.box : C.box;
      C.box = box; C.root.visible = true;
      const o = P.at(box, P.P.workDist, 0); C.root.position.copy(o); C.root.rotation.y = P.hd(box);
      C.root.updateMatrixWorld(true);
      // timeline: walk out while the car approaches, service, walk back after it leaves
      const ph = q ? q.phase : 'gone', st = q && q.phase === 'stop' ? q.t : ph === 'out' ? 99 : -1, S = q ? q.service : 3;
      const ready = ph === 'gone' ? Math.max(0, (C.ready || 1) - dt / 3) : Math.min(1, (C.ready || 0) + dt / 2.5); C.ready = ready;
      if (ph === 'gone' && ready <= 0) { C.car = null; continue; }
      if (q && q.phase === 'out' && q.s > box + 25) car.pit && (C.leave = true);
      const lift = st < 0 ? 0 : st < 0.25 ? st / 0.25 : st < S - 0.35 ? 1 : st < S - 0.12 ? 1 - (st - (S - 0.35)) / 0.23 : 0;
      const m = car.mesh;
      if (m) {
        // car on the jacks, wheels off and on
        if (q && (q.phase === 'stop')) m.grp.position.y = 0.055 * lift;
        const off = st > 0.5 && st < S - 0.95, fitted = st >= S - 0.95;
        m.wheels.forEach((w) => (w.visible = !off));
        if (fitted && !C.fitted) { C.fitted = true; this.setTyres(m, q.compound); }
        if (st < 0) C.fitted = false;
        // gun sounds
        if (audio && camPos.distanceTo(o) < 120) {
          const vol = Math.max(0.15, 1 - camPos.distanceTo(o) / 120);
          if (st > 0.32 && !C.g1) { C.g1 = true; audio.wheelGun(vol); } if (st > S - 0.75 && !C.g2) { C.g2 = true; audio.wheelGun(vol); }
          if (st < 0) C.g1 = C.g2 = false;
        }
      }
      // the tyres in the crew's hands: the old compound coming off, the new one going on
      if (q && !C.propsFor && (q.phase === 'in' || q.phase === 'queue' || q.phase === 'stop')) {
        C.propsFor = true;
        for (const p of C.people) if (p.R.role === 'off' || p.R.role === 'on') p.prop.traverse((o) => { if (o.isMesh && (o.geometry === GFX.geo.tyreF || o.geometry === GFX.geo.tyreR)) o.material = GFX.mats.tyre[p.R.role === 'off' ? car.compound : q.compound] || GFX.mats.tyre.M; });
      }
      if (!q || q.phase === 'out') C.propsFor = q ? C.propsFor : false;
      // release light
      const L = P.lights[TEAMS.indexOf(C.team)];
      if (L) { const green = q && (q.phase === 'out' || st > S - 0.08) && (!q || q.s < box + 8); L.red.emissiveIntensity = st >= 0 && !green ? 5 : 0; L.green.emissiveIntensity = green ? 6 : 0; }
      for (const p of C.people) this.place(p, C, st, S, ready, q, dt);
    }
  },
  setTyres(m, compound) {
    m.wheels.forEach((w) => w.traverse((o) => { if (o.isMesh && (o.geometry === GFX.geo.tyreF || o.geometry === GFX.geo.tyreR)) o.material = GFX.mats.tyre[compound] || GFX.mats.tyre.M; }));
  },
  place(p, C, st, S, ready, q, dt) {
    const R = p.R, sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    // stand-by spot in front of the garage -> working position
    const home = new THREE.Vector3(R.x * 0.6, 0, 4.2 + (R.z > 0 ? 0.6 : 1.4) + Math.abs(R.x) * 0.05);
    let pos = new THREE.Vector3(R.x, 0, R.z);
    // tyre carriers: off-man pulls the old tyre out, on-man brings the new one in
    let carry = false, tyreAt = null;
    if (R.role === 'off' && st > 0.45) { const k = sm((st - 0.45) / 0.55); pos.set(R.wx - 0.2 - 0.9 * k, 0, R.sz * (1.95 + 1.3 * k)); carry = true; }
    if (R.role === 'on') { if (st < 0.6) carry = true; else if (st < S - 0.95) { const k = sm((st - 0.6) / 0.6); pos.set(R.wx + 0.55 - 0.45 * k, 0, R.sz * (2.05 - 0.45 * k)); carry = true; } else { const k = sm((st - (S - 0.95)) / 0.4); pos.set(R.wx + 0.1 + 0.6 * k, 0, R.sz * (1.6 + 0.7 * k)); } }
    const at = home.clone().lerp(pos, sm(ready));
    const local = C.root.localToWorld(at.clone());
    // facing: toward the car (crew) / along the lane (jacks)
    let yaw = R.face === 'back' ? -Math.PI / 2 : R.face === 'fwd' ? Math.PI / 2 : R.face > 0 ? 0 : Math.PI;
    if (ready < 0.98) yaw = Math.atan2(pos.x - home.x, pos.z - home.z) * (1 - sm(ready)) + yaw * sm(ready); // walking out
    p.holder.position.copy(at); p.holder.rotation.y = yaw; p.holder.updateMatrixWorld(true);
    // walk cycle while moving between spots
    const moving = ready > 0.02 && ready < 0.98 || (R.role === 'off' && st > 0.45 && st < 1.0) || (R.role === 'on' && st > 0.6 && st < S - 0.95);
    p.ph = (p.ph || Math.random() * 6) + dt * 9;
    const sw = moving ? Math.sin(p.ph) * 0.22 : 0;
    const walkFeet = [[0.11, 0.08 + Math.max(0, sw) * 0.25, 0.02 + sw], [-0.11, 0.08 + Math.max(0, -sw) * 0.25, 0.02 - sw]];
    const inSvc = ready > 0.98 && st >= -0.5;
    let o = { feet: walkFeet };
    if (R.role === 'gun' && ready > 0.9) {
      // kneeling at the wheel, gun on the nut
      o = { drop: 0.42, lean: 0.12, feet: [[0.14, 0.06, 0.38], [-0.14, 0.05, -0.42]], knees: [new THREE.Vector3(0, 1, 1), new THREE.Vector3(0, -0.2, 1)], hands: [[0.09, 0.48, 0.36], [-0.07, 0.44, 0.3]] };
    } else if (R.role === 'jackF' || R.role === 'jackR') {
      const pull = st >= 0 && st < S - 0.2 ? 0.25 : 0;
      o = { lean: 0.18 + pull * 0.4, feet: [[0.14, 0.08, 0.1 - pull], [-0.14, 0.08, -0.3 - pull]], hands: [[0.12, 0.92, 0.42 - pull], [-0.12, 0.92, 0.42 - pull]] };
    } else if (R.role === 'stab' && inSvc) {
      o = { lean: 0.32, feet: [[0.14, 0.08, -0.2], [-0.14, 0.08, -0.45]], hands: [[0.16, 0.72, 0.5], [-0.16, 0.72, 0.5]] };
    } else if (carry) {
      o = { feet: walkFeet, lean: 0.12, hands: [[0.24, 0.78, 0.36], [-0.24, 0.78, 0.36]] };
    } else if (R.role === 'chief') {
      o = { feet: walkFeet, hands: [[0.2, 1.05, 0.25], [-0.22, 0.82, 0.05]] };
    }
    this.pose(p, o);
    // props follow the hands
    if (p.prop) {
      const hm = this.handsMid(p), fwd = p.holder.localToWorld(new THREE.Vector3(0, 0, 1)).sub(p.holder.getWorldPosition(new THREE.Vector3()));
      if (R.role === 'gun') { const hub = C.root.localToWorld(new THREE.Vector3(R.wx * 1.08, 0.37, R.sz * 0.82)); p.prop.position.copy(hm); p.prop.lookAt(hub); p.prop.visible = ready > 0.9; }
      else if (R.role === 'jackF' || R.role === 'jackR') { p.prop.position.copy(hm); const tgt = C.root.localToWorld(new THREE.Vector3(R.role === 'jackF' ? 2.85 : -2.6, 0.12 + (st >= 0 && st < S - 0.2 ? 0.05 : 0), 0)); p.prop.lookAt(tgt); p.prop.visible = true; }
      else { p.prop.visible = carry; if (carry) { p.prop.position.copy(hm).addScaledVector(fwd, 0.12); p.prop.position.y = Math.max(0.36, hm.y - 0.05); p.prop.quaternion.copy(C.root.quaternion); if (R.sz < 0) p.prop.rotateY(Math.PI); } }
      if (R.role === 'off' && carry && p.prop.userData.cmp !== (q ? q.oldCompound : 'M')) { /* old tyre keeps the compound it came off with */ }
    }
  },
};

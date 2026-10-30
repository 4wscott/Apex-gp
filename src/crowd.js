// ==== 3D crowd: instanced fans on the grandstand steps, animated on the GPU ===============================
// Each fan is a small low-poly person (legs, body, arms, head, optional cap). Per-fan data: position along the
// stand, phase, keenness, flag-waver flag, shirt colour (mostly team colours), skin tone. The vertex shader
// stands them up, raises arms, jumps and waves as a car passes their seat, and runs Mexican waves.
const Crowd = {
  U: { uTime: { value: 0 }, uExcite: { value: 0.2 }, uCar: { value: new THREE.Vector3(1e6, 0, 0) }, uWave: { value: 0 }, uWaveDir: { value: 1 } },
  spots: [],
  fanGeo() {
    if (this.geo) return this.geo;
    const parts = [], tag = (g, part) => { const n = g.attributes.position.count; g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1)); return g.toNonIndexed ? g : g; };
    const box = (w, h, d, x, y, z, part) => tag(new THREE.BoxGeometry(w, h, d).translate(x, y, z), part);
    parts.push(box(0.36, 0.12, 0.44, 0, 0.06, 0.2, 4));                // thighs on the seat
    parts.push(box(0.34, 0.42, 0.12, 0, -0.17, 0.42, 4));              // shins down the front of the step
    parts.push(box(0.42, 0.52, 0.26, 0, 0.36, 0, 0));                  // torso
    parts.push(box(0.1, 0.48, 0.1, -0.27, 0.33, 0.02, 2));             // left arm (pivot at the shoulder)
    parts.push(box(0.1, 0.48, 0.1, 0.27, 0.33, 0.02, 3));              // right arm
    parts.push(tag(new THREE.IcosahedronGeometry(0.115, 0).translate(0, 0.76, 0.01), 1));                          // head
    parts.push(tag(new THREE.SphereGeometry(0.125, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.78, 0.0), 5)); // cap crown
    parts.push(box(0.2, 0.025, 0.14, 0, 0.785, 0.15, 5));               // cap peak
    const geos = parts.map((g) => (g.index ? g.toNonIndexed() : g));
    this.geo = mergeGeometries(geos, false);
    return this.geo;
  },
  flagGeo() {
    if (this.fgeo) return this.fgeo;
    const pole = new THREE.BoxGeometry(0.025, 1.3, 0.025).translate(0, 0.65, 0); pole.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(pole.attributes.position.count).fill(0), 1));
    const cloth = new THREE.PlaneGeometry(0.85, 0.55, 8, 2).translate(0.425, 1.0, 0); cloth.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(cloth.attributes.position.count).fill(1), 1));
    return (this.fgeo = mergeGeometries([pole.toNonIndexed(), cloth.toNonIndexed()], false));
  },
  // shared animation: how much a fan at world position wo is standing (0..1), its arm raise and jump
  common: `
    uniform float uTime, uExcite, uWave, uWaveDir; uniform vec3 uCar;
    attribute float aPart; attribute vec4 aFan;
    float fanStand(vec3 wo, out float nearF, out float waveF) {
      nearF = smoothstep(120.0, 25.0, distance(wo.xz, uCar.xz)) * aFan.z;
      waveF = uWave * smoothstep(0.82, 1.0, sin(uTime * 2.2 - uWaveDir * aFan.x * 0.16 + aFan.w * 0.0));
      return clamp(max(max(nearF, waveF), uExcite * aFan.z * 0.75), 0.0, 1.0);
    }`,
  material() {
    if (this.mat) return this.mat;
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + this.common + `
        attribute vec4 aSkin; attribute vec3 aShirt; varying vec3 vFan;
        vec3 armRot(vec3 p, float side, float a) { vec3 piv = vec3(side * 0.27, 0.56, 0.02); vec3 v = p - piv; float th = side * a; return piv + vec3(v.x * cos(th) - v.y * sin(th), v.x * sin(th) + v.y * cos(th), v.z); }`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 wo = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float nearF, waveF; float st = fanStand(wo, nearF, waveF);
        float flagger = step(0.5, aFan.w);
        float clap = (1.0 - flagger) * nearF * 0.5 * (0.5 + 0.5 * sin(uTime * 14.0 + aFan.y * 20.0));
        float armA = 0.12 + st * (2.4 + 0.3 * sin(uTime * 9.0 + aFan.y * 9.0)) + clap;
        float armAR = mix(armA, 2.75 + 0.15 * sin(uTime * 4.0 + aFan.y * 5.0), flagger);
        if (aPart > 1.5 && aPart < 2.5) { float th = -armA; objectNormal = vec3(objectNormal.x * cos(th) - objectNormal.y * sin(th), objectNormal.x * sin(th) + objectNormal.y * cos(th), objectNormal.z); }
        if (aPart > 2.5 && aPart < 3.5) { float th = armAR; objectNormal = vec3(objectNormal.x * cos(th) - objectNormal.y * sin(th), objectNormal.x * sin(th) + objectNormal.y * cos(th), objectNormal.z); }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (aPart > 1.5 && aPart < 2.5) transformed = armRot(transformed, -1.0, armA);
        if (aPart > 2.5 && aPart < 3.5) transformed = armRot(transformed, 1.0, armAR);
        if (aPart > 4.5 && aSkin.a < 0.5) transformed = vec3(0.0, 0.7, 0.0);            // no cap: hide it inside the head
        float jump = nearF * max(0.0, sin(uTime * 8.5 + aFan.y * 6.28)) * 0.14;
        float sway = sin(uTime * 1.7 + aFan.y * 6.28) * 0.012;
        if (aPart < 3.5 || aPart > 4.5) transformed.y += st * 0.38 + jump + sway;         // standing up (legs stay on the step)
        transformed.z += st * 0.06;
        vFan = aPart > 0.5 && aPart < 1.5 ? aSkin.rgb : aPart > 3.5 && aPart < 4.5 ? vec3(0.13, 0.15, 0.2) : aPart > 4.5 ? aShirt * 0.8 : aShirt;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFan;').replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vFan;');
    };
    return (this.mat = m);
  },
  flagMaterial() {
    if (this.fmat) return this.fmat;
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + this.common + '\nvarying float vPole;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 wo = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float nearF, waveF; float st = fanStand(wo, nearF, waveF);
        float t = uTime * (3.0 + nearF * 4.0) + aFan.y * 6.28;
        if (aPart > 0.5) transformed.z += sin(t * 2.0 - transformed.x * 6.0) * 0.12 * transformed.x;
        float sw = sin(t) * (0.25 + nearF * 0.35);                                        // waving the pole side to side
        transformed.x += transformed.y * sw * 0.6; transformed.y += st * 0.38; vPole = 1.0 - aPart;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPole;').replace('#include <color_fragment>', '#include <color_fragment>\n if (vPole > 0.5) diffuseColor.rgb = vec3(0.75);');
    };
    return (this.fmat = m);
  },
  // fill a stepped stand. Stand-local frame (as built): rows step up toward -x, row r seat at x = -(r + 0.55)·depth,
  // height (r + 1)·rise, along z in [-len/2, len/2]; fans face +x (the track).
  populate(stand, len, rows, depth, rise, rng, quality) {
    const spacing = quality >= 3 ? 0.58 : quality === 2 ? 0.62 : 0.72, perRow = Math.floor(len / spacing), empty = 0.08;
    const seats = [];
    for (let r = 0; r < rows; r++) for (let k = 0; k < perRow; k++) if (rng() > empty) seats.push([r, -len / 2 + (k + 0.5) * spacing + (rng() - 0.5) * 0.08]);
    const N = seats.length, fans = new THREE.InstancedMesh(this.fanGeo(), this.material(), N);
    const aFan = new Float32Array(N * 4), aSkin = new Float32Array(N * 4), aShirt = new Float32Array(N * 3);
    const skins = ['#f1c9a5', '#e0b089', '#c68e63', '#a8724e', '#8d5a3b', '#5b3a29'].map((c) => new THREE.Color(c));
    const extra = ['#ffffff', '#202124', '#1e88e5', '#e53935', '#fdd835', '#43a047', '#8e24aa', '#90caf9'].map((c) => new THREE.Color(c));
    const teamCols = TEAMS.map((t) => [new THREE.Color(t.c1), new THREE.Color(lum(t.c2) > 0.15 ? t.c2 : t.c3)]);
    // fans cluster by team: blocks of the stand lean toward one team's colours
    const blockTeam = (z) => Math.abs(hashStr(stand.uuid + Math.floor(z / 12))) % TEAMS.length;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const flagSeats = [];
    seats.forEach(([r, z], i) => {
      const sc = 0.92 + rng() * 0.16; s.set(sc, sc, sc);
      p.set(-(r + 0.55) * depth, (r + 1) * rise, z); m4.compose(p, q, s); fans.setMatrixAt(i, m4);
      const flag = rng() < 0.07 ? 1 : 0;
      aFan.set([z + r * 0.6, rng(), 0.55 + rng() * 0.45, flag], i * 4);
      const sk = skins[(rng() * skins.length) | 0]; aSkin.set([sk.r, sk.g, sk.b, rng() < 0.3 ? 1 : 0], i * 4);
      const tc = teamCols[rng() < 0.75 ? blockTeam(z) : (rng() * TEAMS.length) | 0], shirt = rng() < 0.72 ? tc[rng() < 0.7 ? 0 : 1] : extra[(rng() * extra.length) | 0];
      aShirt.set([shirt.r, shirt.g, shirt.b], i * 3);
      if (flag) flagSeats.push([p.clone(), sc, i, tc]);
    });
    const G = fans.geometry = fans.geometry.clone();
    G.setAttribute('aFan', new THREE.InstancedBufferAttribute(aFan, 4)); G.setAttribute('aSkin', new THREE.InstancedBufferAttribute(aSkin, 4)); G.setAttribute('aShirt', new THREE.InstancedBufferAttribute(aShirt, 3));
    fans.frustumCulled = false; stand.add(fans);
    if (flagSeats.length) {
      const fl = new THREE.InstancedMesh(this.flagGeo(), this.flagMaterial(), flagSeats.length), fA = new Float32Array(flagSeats.length * 4), col = new THREE.Color();
      flagSeats.forEach(([pos, sc, i, tc], k) => {
        // pole held in the raised right hand: fan-local (+0.27 sideways, 1.05 up) -> stand-local (facing +x, so sideways is -z)
        m4.compose(new THREE.Vector3(pos.x + 0.05, pos.y + 1.0 * sc, pos.z - 0.32 * sc), q, s.set(sc, sc, sc)); fl.setMatrixAt(k, m4);
        fA.set(aFan.subarray(i * 4, i * 4 + 4), k * 4); fl.setColorAt(k, col.copy(tc[k % 2]));
      });
      fl.geometry = fl.geometry.clone(); fl.geometry.setAttribute('aFan', new THREE.InstancedBufferAttribute(fA, 4));
      fl.frustumCulled = false; stand.add(fl);
    }
    stand.updateMatrixWorld(true); this.spots.push(new THREE.Vector3().setFromMatrixPosition(stand.matrixWorld));
    return N;
  },
  seatMaterial(tx) {
    if (this.smat) return this.smat;
    const t = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#5d6168'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) { g.fillStyle = '#4a4e55'; g.fillRect(0, y + 12, w, 4); for (let x = 0; x < w; x += 5) { g.fillStyle = '#25508f'; g.fillRect(x + 0.5, y + 3, 4, 8); } }
    });
    return (this.smat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
  },
  // per frame
  update(dt, race, P) {
    const U = this.U; U.uTime.value += dt;
    if (!race) { U.uExcite.value = 0.15; U.uCar.value.set(1e6, 0, 0); return; }
    U.uCar.value.set(P.x, 0, -P.y);
    const hype = race.phase !== 'green' || race.greenT < 6 || P.finished || (race.vsc ? 0 : 0);
    U.uExcite.value += ((hype ? 0.9 : 0.12) - U.uExcite.value) * Math.min(1, dt * 1.5);
    // a Mexican wave now and then, rolling round the stand
    this.waveT = (this.waveT ?? 25) - dt;
    if (this.waveT < 0) { this.waveOn = !this.waveOn; this.waveT = this.waveOn ? 14 : 30 + Math.random() * 40; U.uWaveDir.value = Math.random() < 0.5 ? 1 : -1; }
    U.uWave.value += ((this.waveOn ? 1 : 0) - U.uWave.value) * Math.min(1, dt);
  },
  // crowd noise level for the audio engine: rises near the stands and at the start / finish
  noise(race, P) {
    let near = 0; for (const s of this.spots) near = Math.max(near, 1 - Math.min(1, Math.hypot(s.x - P.x, s.z + P.y) / 160));
    return (race.phase !== 'green' || race.greenT < 5 ? 0.09 : 0.015) + near * 0.1 + (P.finished ? 0.08 : 0);
  },
};

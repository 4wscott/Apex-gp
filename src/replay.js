// ==== Replays: a 20 Hz recording of every car, played back with TV-style cameras ====================
// The recorder keeps the whole session (up to 40 minutes) in one growing Float32Array. Playback freezes the
// live race, writes the recorded state into the cars so the normal renderer draws them, and puts every
// overwritten value back on exit.
const REC_HZ = 20, REC_F = 12; // x, y, h, vx, vy, delta, axS, ay, brake, aeroX, flags, surface
const SURF = ['tarmac', 'kerb', 'grass', 'gravel'];
const Replay = {
  rec: null, on: false,
  // ---- recording -------------------------------------------------------------------------------
  reset(race) {
    const n = race.cars.length;
    this.rec = { n, times: [], data: new Float32Array(REC_HZ * 60 * n * REC_F * 4), len: 0, last: -1, pos: [], marks: [] };
    this.on = false;
  },
  sample(race) {
    const R = this.rec; if (!R || race.time - R.last < 1 / REC_HZ - 1e-6) return;
    if (R.times.length >= REC_HZ * 60 * 40) return; // 40 minutes is plenty
    R.last = race.time;
    if (R.green === undefined && race.phase === 'green') R.green = race.time - (race.greenT || 0);
    const need = (R.times.length + 1) * R.n * REC_F;
    if (need > R.data.length) { const d = new Float32Array(R.data.length * 2); d.set(R.data); R.data = d; }
    let o = R.times.length * R.n * REC_F;
    for (const c of race.cars) {
      const d = R.data;
      d[o] = c.x; d[o + 1] = c.y; d[o + 2] = c.h; d[o + 3] = c.vx; d[o + 4] = c.vy || 0; d[o + 5] = c.delta || 0;
      d[o + 6] = c.axS || 0; d[o + 7] = c.ay || 0; d[o + 8] = c.brake || 0; d[o + 9] = c.aeroX ? 1 : 0;
      d[o + 10] = (c.lockF ? 1 : 0) | (c.lockR ? 2 : 0) | (c.spin ? 4 : 0) | (c.kerbHit ? 8 : 0) | (c.pit ? 16 : 0);
      d[o + 11] = Math.max(0, SURF.indexOf(c.surface));
      o += REC_F;
    }
    R.times.push(race.time);
    // positions twice a second, for the highlights (overtakes involving the player)
    if (race.mode === 'race' && race.phase === 'green' && R.times.length % 10 === 0) {
      const pos = race.standings().indexOf(race.player) + 1, prev = R.pos[R.pos.length - 1];
      if (prev && pos !== prev && race.time - (R.marks.at(-1)?.t ?? -99) > 8) R.marks.push({ t: race.time, kind: pos < prev ? 'gain' : 'loss' });
      R.pos.push(pos);
    }
  },
  // ---- playback --------------------------------------------------------------------------------
  FIELDS: ['x', 'y', 'h', 'vx', 'vy', 'delta', 'axS', 'ay', 'brake', 'aeroX', 'lockF', 'lockR', 'spin', 'kerbHit', 'surface', 'slipR', 'wheelAng', 'harvesting', 'idx', 's', 'd'],
  open(from) {
    const R = this.rec, S = App.session; if (!R || R.times.length < 2 || !S) return false;
    const race = S.race;
    this.from = from; this.on = true; this.playing = true; this.speed = 1; this.camMode = 'director'; this.dirT = 0; this.dirK = 0;
    this.focus = race.cars.indexOf(race.player);
    this.saved = race.cars.map((c) => this.FIELDS.map((f) => c[f]));
    this.savedCam = S.camMode; S.camMode = 'far';
    this.clips = null;
    this.t = from === 'highlights' ? this.highlightStart() : Math.max(R.times[0], R.times.at(-1) - 30); // last 30 s by default
    $('#pause').hidden = true; $('#results').hidden = true; $('#replay').hidden = false;
    document.body.classList.add('replaying');
    this.ui();
    return true;
  },
  close() {
    if (!this.on) return;
    const S = App.session, race = S.race;
    race.cars.forEach((c, i) => this.FIELDS.forEach((f, k) => (c[f] = this.saved[i][k])));
    S.camMode = this.savedCam; this.on = false;
    $('#replay').hidden = true; document.body.classList.remove('replaying');
    if (this.from === 'results' || this.from === 'highlights') $('#results').hidden = false; else App.togglePause(true);
  },
  highlightStart() {
    const R = this.rec, t0 = R.times[0], end = R.times.at(-1), green = R.green ?? t0;
    // start of the race, each overtake involving the player, and the finish
    const clips = [[Math.max(t0, green - 2), Math.min(end, green + 12)]];
    for (const m of R.marks.slice(0, 5)) clips.push([Math.max(t0, m.t - 5), Math.min(end, m.t + 3)]);
    clips.push([Math.max(t0, end - 8), end]);
    this.clips = clips.filter((c, i) => i === 0 || c[0] > clips[i - 1][1] - 1); this.clipK = 0;
    return this.clips[0][0];
  },
  frame(dt) {
    const R = this.rec, S = App.session, race = S.race, end = R.times.at(-1);
    if (this.playing) this.t += dt * this.speed;
    if (this.clips) { // highlights: jump from clip to clip, stop at the last one
      const c = this.clips[this.clipK];
      if (this.t > c[1]) { if (this.clipK < this.clips.length - 1) { this.clipK++; this.t = this.clips[this.clipK][0]; this.dirT = 99; } else { this.t = c[1]; this.playing = false; } }
    }
    if (this.t >= end) { this.t = end; this.playing = false; }
    if (this.t < R.times[0]) this.t = R.times[0];
    // binary search for the samples either side of t
    let lo = 0, hi = R.times.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R.times[m] <= this.t) lo = m; else hi = m; }
    const k = clamp((this.t - R.times[lo]) / Math.max(1e-6, R.times[hi] - R.times[lo]), 0, 1);
    const a = lo * R.n * REC_F, b = hi * R.n * REC_F, d = R.data;
    race.cars.forEach((c, i) => {
      const p = a + i * REC_F, q = b + i * REC_F, L = (j) => d[p + j] + (d[q + j] - d[p + j]) * k;
      c.x = L(0); c.y = L(1); c.h = d[p + 2] + angleDiff(d[q + 2], d[p + 2]) * k;
      c.vx = L(3); c.vy = L(4); c.delta = L(5); c.axS = L(6); c.ay = L(7); c.brake = L(8); c.aeroX = d[p + 9] > 0.5;
      const fl = d[p + 10]; c.lockF = !!(fl & 1); c.lockR = !!(fl & 2); c.spin = !!(fl & 4); c.kerbHit = fl & 8 ? 1 : 0;
      c.surface = SURF[d[p + 11]] || 'tarmac'; c.slipR = 0; c.harvesting = false;
      c.wheelAng = (c.wheelAng || 0) + (this.playing ? c.vx * dt * this.speed / 0.36 : 0);
      c.locate(Math.abs(this.t - (this.lastT ?? -9)) > 1); // station along the lap, for the TV camera choice
    });
    this.lastT = this.t; this.ui();
  },
  // TV cameras: fixed points round the lap, a little outside the walls, that pan and zoom to follow
  tvCams(T) {
    if (this.tvT === T) return this.tv;
    const out = [];
    for (let s = 40; s < T.length; s += 170) {
      const i = Math.round(s / T.ds) % T.n, side = (out.length % 2 ? 1 : -1), off = (side > 0 ? T.wallL[i] : T.wallR[i]) + 12;
      out.push({ s, x: T.px[i] + T.nx[i] * off * side, y: T.py[i] + T.ny[i] * off * side, z: 8 + (out.length % 3) * 3 });
    }
    this.tvT = T; this.tv = out; return out;
  },
  camera(cam) {
    const S = App.session, race = S.race, T = race.track, c = race.cars[this.focus], dt = 1 / 60;
    const base = new THREE.Vector3(c.x, 0.7, -c.y), fwd = new THREE.Vector3(Math.cos(c.h), 0, -Math.sin(c.h));
    let mode = this.camMode;
    if (mode === 'director') {
      this.dirT += dt;
      const seq = ['tv', 'onboard', 'tv', 'heli', 'tv', 'chase'], len = [9, 5, 8, 6, 9, 5];
      if (this.dirT > len[this.dirK % seq.length]) { this.dirT = 0; this.dirK++; }
      mode = seq[this.dirK % seq.length];
    }
    cam.up.set(0, 1, 0); cam.near = 0.1;
    if (mode === 'tv') {
      // the camera just ahead of the car; switch as the car passes it
      const s = ((c.s ?? 0) + T.length) % T.length, list = this.tvCams(T);
      let best = list[0], bd = 1e9;
      for (const p of list) { let ahead = p.s - s; if (ahead < -30) ahead += T.length; if (ahead < bd) { bd = ahead; best = p; } }
      cam.position.set(best.x, best.z, -best.y); cam.lookAt(base);
      const dist = cam.position.distanceTo(base); cam.fov = clamp((2 * Math.atan(7 / dist) * 180) / Math.PI, 6, 55);
    } else if (mode === 'heli') {
      const a = (this.t * 0.08) % (Math.PI * 2);
      cam.position.set(base.x + Math.cos(a) * 55, 42, base.z + Math.sin(a) * 55); cam.lookAt(base); cam.fov = 32;
    } else if (mode === 'onboard') {
      c.mesh.body.updateMatrixWorld();
      const eye = new THREE.Vector3(-0.35, 1.22, 0).applyMatrix4(c.mesh.body.matrixWorld);
      cam.position.copy(eye); cam.lookAt(eye.clone().add(fwd.clone().multiplyScalar(10)).add(new THREE.Vector3(0, -0.9, 0))); cam.fov = 62;
    } else {
      cam.position.copy(base).addScaledVector(fwd, -7.5).add(new THREE.Vector3(0, 2.3, 0)); cam.lookAt(base.clone().addScaledVector(fwd, 3).add(new THREE.Vector3(0, 0.3, 0))); cam.fov = 58;
    }
    cam.updateProjectionMatrix();
    this.shown = mode;
  },
  // ---- controls --------------------------------------------------------------------------------
  ui() {
    const R = this.rec, S = App.session; if (!R || !S) return;
    const t0 = R.times[0], end = R.times.at(-1), c = S.race.cars[this.focus];
    $('#rp-play').textContent = this.playing ? '❚❚' : '▶'; $('#rp-play').setAttribute('aria-label', this.playing ? 'Pause replay' : 'Play replay');
    $('#rp-speed').textContent = this.speed === 1 ? '1×' : this.speed === 0.5 ? '½×' : '¼×';
    $('#rp-car').textContent = `${c.driver.abbr || c.driver.code} · ${c.team.name}`; $('#rp-car').style.borderColor = c.team.c1;
    $('#rp-cam').textContent = { director: 'Auto', tv: 'TV', heli: 'Heli', onboard: 'On-board', chase: 'Chase' }[this.camMode];
    const sc = $('#rp-scrub'); sc.min = 0; sc.max = Math.round((end - t0) * 10); if (!this.scrubbing) sc.value = Math.round((this.t - t0) * 10);
    $('#rp-time').textContent = `${fmtClock(this.t - t0)} / ${fmtClock(end - t0)}`;
    $('#rp-tag').textContent = this.clips ? `HIGHLIGHTS ${this.clipK + 1}/${this.clips.length}` : 'REPLAY';
  },
  init() {
    const R = this;
    $('#rp-play').onclick = () => { if (!R.playing && R.t >= R.rec.times.at(-1) - 0.05) R.t = R.clips ? R.clips[0][0] : R.rec.times[0]; R.playing = !R.playing; R.ui(); };
    $('#rp-back').onclick = () => { R.t = Math.max(R.rec.times[0], R.t - 5); R.ui(); };
    $('#rp-fwd').onclick = () => { R.t = Math.min(R.rec.times.at(-1), R.t + 5); R.ui(); };
    $('#rp-speed').onclick = () => { R.speed = R.speed === 1 ? 0.5 : R.speed === 0.5 ? 0.25 : 1; R.ui(); };
    const n = () => App.session.race.cars.length;
    $('#rp-prev').onclick = () => { R.focus = (R.focus - 1 + n()) % n(); R.ui(); };
    $('#rp-next').onclick = () => { R.focus = (R.focus + 1) % n(); R.ui(); };
    $('#rp-cam').onclick = () => { const m = ['director', 'tv', 'heli', 'onboard', 'chase']; R.camMode = m[(m.indexOf(R.camMode) + 1) % m.length]; R.dirT = 0; R.ui(); };
    $('#rp-exit').onclick = () => R.close();
    const sc = $('#rp-scrub');
    sc.addEventListener('input', () => { R.scrubbing = true; R.clips = null; R.t = R.rec.times[0] + sc.value / 10; });
    sc.addEventListener('change', () => { R.scrubbing = false; });
    addEventListener('keydown', (e) => {
      if (!R.on) return;
      const k = { Space: '#rp-play', ArrowLeft: '#rp-back', ArrowRight: '#rp-fwd', KeyC: '#rp-cam', BracketLeft: '#rp-prev', BracketRight: '#rp-next', KeyS: '#rp-speed', Escape: '#rp-exit' }[e.code];
      if (k) { e.preventDefault(); e.stopPropagation(); $(k).click(); }
    }, true);
  },
};
function fmtClock(s) { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; }

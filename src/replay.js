// ==== Replays: a 20 Hz recording of every car, played back like a TV broadcast ========================
// The director cuts to the action (incidents, overtakes, battles within a second, the leader, the start and the flag)
// with broadcast cameras (trackside, apex long lens, kerb, a tracking helicopter, T-cam, front wing, rear-facing,
// on-board, chase), a wipe on each cut, the driver's name strip and the battle gap. The same director runs live
// ("Watch on TV" in the pause menu: the AI drives your car).
// The recorder keeps the whole session (up to 40 minutes) in one growing Float32Array. Playback freezes the
// live race, writes the recorded state into the cars so the normal renderer draws them, and puts every
// overwritten value back on exit.
const REC_HZ = 20, REC_F = 13; // x, y, h, vx, vy, delta, axS, ay, brake, aeroX, flags, surface, dist
const SURF = ['tarmac', 'kerb', 'grass', 'gravel'];
const Replay = {
  rec: null, on: false,
  // ---- recording -------------------------------------------------------------------------------
  reset(race) {
    const n = race.cars.length;
    // one fixed block, allocated once (growing it by doubling briefly needed ~125 MB in a long session: enough for an
    // iPhone to close the page). Phones keep the last 10 minutes, computers the last 30; the oldest minutes roll off.
    const phone = matchMedia('(pointer: coarse)').matches, minutes = phone ? 10 : 30;
    this.cap = REC_HZ * 60 * minutes;
    this.rec = { n, times: [], data: new Float32Array(this.cap * n * REC_F), len: 0, last: -1, pos: [], marks: [] };
    this.on = false;
  },
  sample(race) {
    const R = this.rec; if (!R || race.time - R.last < 1 / REC_HZ - 1e-6) return;
    // full: drop the oldest eighth in place (no new memory) and carry on
    if (R.times.length >= this.cap) { const drop = Math.floor(this.cap / 8); R.data.copyWithin(0, drop * R.n * REC_F, R.times.length * R.n * REC_F); R.times.splice(0, drop); R.marks = R.marks.filter((m) => m.t >= R.times[0]); }
    R.last = race.time;
    if (R.green === undefined && race.phase === 'green') R.green = race.time - (race.greenT || 0);
    let o = R.times.length * R.n * REC_F;
    for (const c of race.cars) {
      const d = R.data;
      d[o] = c.x; d[o + 1] = c.y; d[o + 2] = c.h; d[o + 3] = c.vx; d[o + 4] = c.vy || 0; d[o + 5] = c.delta || 0;
      d[o + 6] = c.axS || 0; d[o + 7] = c.ay || 0; d[o + 8] = c.brake || 0; d[o + 9] = c.aeroX ? 1 : 0;
      d[o + 10] = (c.lockF ? 1 : 0) | (c.lockR ? 2 : 0) | (c.spin ? 4 : 0) | (c.kerbHit ? 8 : 0) | (c.pit ? 16 : 0);
      d[o + 11] = Math.max(0, SURF.indexOf(c.surface)); d[o + 12] = c.dist;
      o += REC_F;
    }
    R.times.push(race.time);
    // the story for the director: incidents (a spin, a hard hit, a car stopping) and passes, for every car
    if (race.mode === 'race' && race.phase === 'green' && race.greenT > 3) {
      race.cars.forEach((c, i) => {
        const yaw = Math.abs(Math.atan2(c.vy || 0, Math.max(0.1, c.vx))), hit = (c.impact || 0) > 6 || (c.dnf && !c._dnfRec);
        if (c.dnf) c._dnfRec = true;
        if ((hit || (yaw > 0.55 && Math.hypot(c.vx, c.vy || 0) > 12)) && race.time - (c._incT ?? -99) > 6) { c._incT = race.time; R.marks.push({ t: race.time, kind: 'incident', car: i }); }
      });
      if (R.times.length % 10 === 0) {
        const ord = race.standings().filter((c) => !c.finished && !c.pit && !c.dnf).map((c) => race.cars.indexOf(c)), prev = R.ord;
        if (prev) for (let k = 0; k < ord.length; k++) { const pk = prev.indexOf(ord[k]); if (pk === k + 1 && prev[k] !== undefined && ord.indexOf(prev[k]) === k + 1) R.marks.push({ t: race.time, kind: 'pass', car: ord[k], other: prev[k] }); }
        R.ord = ord;
      }
    }
    // positions twice a second, for the highlights (overtakes involving the player)
    if (race.mode === 'race' && race.phase === 'green' && R.times.length % 10 === 0) {
      const pos = race.standings().indexOf(race.player) + 1, prev = R.pos[R.pos.length - 1];
      if (prev && pos !== prev && race.time - (R.marks.at(-1)?.t ?? -99) > 8) R.marks.push({ t: race.time, kind: pos < prev ? 'gain' : 'loss' });
      R.pos.push(pos);
    }
  },
  // ---- playback --------------------------------------------------------------------------------
  FIELDS: ['x', 'y', 'h', 'vx', 'vy', 'delta', 'axS', 'ay', 'brake', 'aeroX', 'lockF', 'lockR', 'spin', 'kerbHit', 'surface', 'slipR', 'wheelAng', 'harvesting', 'idx', 's', 'd', 'dist'],
  open(from) {
    const R = this.rec, S = App.session; if (!R || R.times.length < 2 || !S) return false;
    const race = S.race;
    this.from = from; this.on = true; this.playing = true; this.speed = 1; this.camMode = 'director'; this.dirT = 99; this.shot = null; this.slowUntil = 0; if (this.tvOn) this.setTV(false);
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
    S.camMode = this.savedCam; this.on = false; App.rpFocus = null;
    $('#replay').hidden = true; document.body.classList.remove('replaying');
    if (this.from === 'results' || this.from === 'highlights') $('#results').hidden = false; else App.togglePause(true);
  },
  highlightStart() {
    const R = this.rec, t0 = R.times[0], end = R.times.at(-1), green = R.green ?? t0;
    // start of the race, each overtake involving the player, and the finish
    const clips = [[Math.max(t0, green - 2), Math.min(end, green + 12)]];
    // the best moments first (yours and incidents, then passes near the front, then any pass), at least 10 s apart
    const P = race0(), pi = P ? P.cars.indexOf(P.player) : -1;
    const rank = (m) => (m.kind === 'gain' || m.kind === 'loss' || (m.kind === 'pass' && (m.car === pi || m.other === pi)) ? 0 : m.kind === 'incident' ? 1 : this.posAt(m.t, m.car) <= 6 ? 2 : 3);
    const chosen = [];
    for (const m of R.marks.slice().sort((a, b) => rank(a) - rank(b) || a.t - b.t)) { if (chosen.length >= 7) break; if (m.t > green + 10 && chosen.every((c) => Math.abs(c - m.t) > 10)) chosen.push(m.t); }
    for (const t of chosen) clips.push([Math.max(t0, t - 5), Math.min(end, t + 3)]);
    clips.push([Math.max(t0, end - 8), end]);
    clips.sort((a, b) => a[0] - b[0]);
    const kept = []; for (const c of clips) { const p = kept[kept.length - 1]; if (p && c[0] <= p[1] + 1) p[1] = Math.max(p[1], c[1]); else kept.push(c.slice()); } // overlapping moments run on as one clip
    this.clips = kept; this.clipK = 0;
    return this.clips[0][0];
  },
  frame(dt) {
    const R = this.rec, S = App.session, race = S.race, end = R.times.at(-1);
    const slow = this.camMode === 'director' && this.speed === 1 && this.t > (this.slowFrom || 0) && this.t < (this.slowUntil || 0); // slow motion round an incident
    if (this.playing) this.t += dt * this.speed * (slow ? 0.35 : 1);
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
      const fl = d[p + 10]; c.lockF = !!(fl & 1); c.lockR = !!(fl & 2); c.spin = !!(fl & 4); c.kerbHit = fl & 8 ? 1 : 0; c.rpPit = !!(fl & 16);
      c.surface = SURF[d[p + 11]] || 'tarmac'; c.slipR = 0; c.harvesting = false; c.dist = L(12);
      c.wheelAng = (c.wheelAng || 0) + (this.playing ? c.vx * dt * this.speed / 0.36 : 0);
      c.locate(Math.abs(this.t - (this.lastT ?? -9)) > 1); // station along the lap, for the TV camera choice
    });
    race._stT = -1; // the order from the recorded positions, not the live race's
    this.lastT = this.t; this.ui();
  },
  // TV cameras: fixed points round the lap, a little outside the walls, that pan and zoom to follow
  tvCams(T) {
    if (this.tvT === T) return this.tv;
    const out = [];
    for (let s = 40; s < T.length; s += 170) {
      const i = Math.round(s / T.ds) % T.n, side = (out.length % 2 ? 1 : -1), off = (side > 0 ? T.wallL[i] : T.wallR[i]) + 12;
      out.push({ s, x: T.px[i] + T.nx[i] * off * side, y: T.py[i] + T.ny[i] * off * side, z: 8 + (out.length % 3) * 3 + roadZ(T, i, off * side) });
    }
    this.tvT = T; this.tv = out; return out;
  },
  // ---- the director ------------------------------------------------------------------------------
  // what happens next (replay: it knows the future; live: what just happened), and the shot to cut to
  story(t, live) {
    const R = this.rec, race = race0(); if (!R || !race) return null;
    const lo = live ? t - 4 : t - 0.5, hi = live ? t + 0.1 : t + 6;
    const inc = R.marks.find((m) => m.kind === 'incident' && m.t >= lo && m.t <= (live ? hi : t + 4));
    if (inc) return { kind: 'incident', car: inc.car, t: inc.t };
    const pass = R.marks.find((m) => m.kind === 'pass' && m.t >= lo && m.t <= hi);
    if (pass) return { kind: 'pass', car: pass.car, other: pass.other };
    // battles: consecutive cars within a second; the player's battle first, then the one furthest up the order
    const ord = race.standings().filter((c) => !c.finished && !c.pit && !c.dnf), P = race.player; let best = null;
    for (let k = 1; k < ord.length; k++) {
      const a = ord[k - 1], b = ord[k], gap = (a.dist - b.dist) / Math.max(20, b.vx);
      if (gap > 0 && gap < 1.0) { const score = (a === P || b === P ? 100 : 0) - k * 2 - gap * 5; if (!best || score > best.score) best = { kind: 'battle', car: race.cars.indexOf(b), other: race.cars.indexOf(a), gap, score }; }
    }
    if (best) return best;
    return { kind: Math.random() < 0.4 ? 'leader' : 'player', car: race.cars.indexOf(Math.random() < 0.4 && ord[0] ? ord[0] : P) };
  },
  // the camera for a shot: what fits the story, never the same twice running
  shotCam(kind) {
    const pick = { incident: ['tv', 'apex', 'heli'], pass: ['apex', 'tv', 'chase', 'tcam'], battle: ['tv', 'apex', 'heli', 'tcam', 'rear', 'kerb', 'chase'], leader: ['heli', 'tv', 'tcam', 'wing'], player: ['tv', 'onboard', 'apex', 'tcam', 'wing', 'chase'], start: ['heli'] }[kind] || ['tv'];
    const opts = pick.filter((m) => m !== this.lastCam); return opts[(Math.random() * opts.length) | 0] || pick[0];
  },
  direct(t, live) {
    const race = race0(); if (!race) return 'tv';
    this.dirT += 1 / 60;
    const start = (this.rec.green ?? 0) + 2 > t && t > (this.rec.green ?? 0) - 6;
    if (start && this.shot && this.shot.kind !== 'start') this.dirT = 99;
    if (!this.shot || this.dirT > this.shot.len || (this.shot.kind === 'battle' && this.dirT > 3 && !live && this.story(t, live)?.kind === 'incident')) {
      const st = start ? { kind: 'start', car: race.cars.indexOf(race.leader ? race.leader() || race.player : race.player) } : this.story(t, live) || { kind: 'player', car: race.cars.indexOf(race.player) };
      const mode = this.shotCam(st.kind);
      this.shot = Object.assign(st, { mode, len: { incident: 6, pass: 6, battle: 8, leader: 6, player: 7, start: 9 }[st.kind] || 7 });
      this.dirT = 0; this.lastCam = mode;
      if (Date.now() > (this.manualUntil || 0)) this.focus = st.car;
      this.cut(st);
      // a big moment in a replay: a little slow motion
      if (!live && st.kind === 'incident') { this.slowUntil = st.t + 2; this.slowFrom = st.t - 1.5; }
    }
    return this.shot.mode;
  },
  // broadcast graphics on a cut: a wipe, the driver's name strip, the gap in a battle
  cut(st) {
    const race = race0(), c = race && race.cars[this.focus]; if (!c) return;
    const w = document.getElementById('rp-wipe'); if (w) { w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); }
    const nm = document.getElementById('rp-name');
    if (nm) {
      const pos = race.standings().indexOf(c) + 1;
      nm.innerHTML = `<i style="background:${c.team.c1}"></i><b>${pos ? 'P' + pos : ''}</b><span>${c.driver.num != null ? '#' + c.driver.num + ' ' : ''}${c.driver.name || c.driver.code}</span><small>${c.team.name}</small>`;
      nm.classList.remove('show'); void nm.offsetWidth; nm.classList.add('show');
    }
    const gp = document.getElementById('rp-gap');
    if (gp) {
      if ((st.kind === 'battle' || st.kind === 'pass') && race.cars[st.other]) { const o = race.cars[st.other], g = Math.abs(o.dist - c.dist) / Math.max(20, c.vx); gp.innerHTML = `<span style="border-color:${o.team.c1}">${o.driver.abbr || o.driver.code}</span><b>${st.kind === 'pass' ? 'OVERTAKE' : '+' + g.toFixed(1) + ' s'}</b><span style="border-color:${c.team.c1}">${c.driver.abbr || c.driver.code}</span>`; gp.hidden = false; }
      else if (st.kind === 'incident') { gp.innerHTML = `<b class="inc">INCIDENT</b><span style="border-color:${c.team.c1}">${c.driver.abbr || c.driver.code}</span>`; gp.hidden = false; }
      else gp.hidden = true;
    }
  },
  // corner apexes round the lap (for the long-lens and kerb cameras)
  apexes(T) {
    if (this.apT === T) return this.ap;
    const out = [], n = T.n; let last = -1e9;
    for (let i = 0; i < n; i++) { const k = Math.abs(T.lineK[i]); if (k > 1 / 220 && k >= Math.abs(T.lineK[(i - 3 + n) % n]) && k >= Math.abs(T.lineK[(i + 3) % n]) && i * T.ds - last > 120) { out.push({ s: i * T.ds, i, side: -Math.sign(T.lineK[i]) }); last = i * T.ds; } }
    this.apT = T; this.ap = out; return out;
  },
  nextAt(list, s, L, back = 30) { let best = list[0], bd = 1e9; for (const p of list) { let ahead = p.s - s; if (ahead < -back) ahead += L; if (ahead < bd) { bd = ahead; best = p; } } return best; },
  camera(cam, live) {
    const S = App.session, race = S.race, T = race.track, dt = 1 / 60;
    let mode = this.camMode;
    if (mode === 'director') mode = this.direct(live ? race.time : this.t, live);
    const c = race.cars[this.focus] || race.player;
    App.rpFocus = c; // the car on screen gets the detailed body
    const base = new THREE.Vector3(c.x, 0.7 + c.mesh.grp.position.y, -c.y), fwd = new THREE.Vector3(Math.cos(c.h), 0, -Math.sin(c.h));
    const s = ((c.s ?? 0) + T.length) % T.length;
    cam.up.set(0, 1, 0); cam.near = 0.1;
    const onCar = (x, y, z, look, fov) => { c.mesh.body.updateMatrixWorld(); const eye = new THREE.Vector3(x, y, z).applyMatrix4(c.mesh.body.matrixWorld); cam.position.copy(eye); cam.lookAt(new THREE.Vector3(...look).applyMatrix4(c.mesh.body.matrixWorld)); cam.fov = fov; };
    if ((live ? c.pit : c.rpPit) && mode !== 'onboard' && mode !== 'tcam') mode = 'pit'; // in a replay: the recorded pit state
    if (mode === 'tv') {
      // the camera just ahead of the car; switch as the car passes it
      const best = this.nextAt(this.tvCams(T), s, T.length);
      cam.position.set(best.x, best.z, -best.y); cam.lookAt(base);
      const dist = cam.position.distanceTo(base); cam.fov = clamp((2 * Math.atan(7 / dist) * 180) / Math.PI, 6, 55);
    } else if (mode === 'apex' || mode === 'kerb') {
      // a long lens behind the barrier at the next corner, or low on the kerb at its exit
      const a = this.nextAt(this.apexes(T), s, T.length, 25), i = a.i, sd = a.side, k = mode === 'kerb' ? (i + Math.round(30 / T.ds)) % T.n : i;
      const off = mode === 'kerb' ? T.hw + 1.2 : (sd > 0 ? T.wallL[k] : T.wallR[k]) + 6;
      const px = T.px[k] + T.nx[k] * off * sd, py = T.py[k] + T.ny[k] * off * sd;
      cam.position.set(px, (mode === 'kerb' ? 0.35 : 2.2) + roadZ(T, k, off * sd), -py); cam.lookAt(base);
      const dist = cam.position.distanceTo(base); cam.fov = clamp((2 * Math.atan((mode === 'kerb' ? 3.2 : 4.5) / dist) * 180) / Math.PI, 4, mode === 'kerb' ? 70 : 40);
    } else if (mode === 'heli') {
      // the helicopter tracks along the lap: behind, high, a little to the side
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x), tgt = base.clone().addScaledVector(fwd, -38).addScaledVector(side, 22).add(new THREE.Vector3(0, 34, 0));
      this.heli = this.heli && this.heli.distanceTo(tgt) < 80 ? this.heli.lerp(tgt, 0.04) : tgt.clone();
      cam.position.copy(this.heli); cam.lookAt(base.clone().addScaledVector(fwd, 12)); cam.fov = 28;
    } else if (mode === 'onboard') onCar(-0.35, 1.22, 0, [10, 0.3, 0], 62);
    else if (mode === 'tcam') onCar(-0.75, 1.32, 0, [12, 0.6, 0], 58);
    else if (mode === 'wing') onCar(2.4, 0.3, 0.22, [14, 0.22, 0.1], 72);
    else if (mode === 'rear') onCar(-0.75, 1.3, 0, [-14, 0.5, 0], 58);
    else if (mode === 'pit') {
      const k = (c.idx + Math.round(25 / T.ds)) % T.n; // on the pit wall, a little ahead of the car
      cam.position.set(T.px[k] - T.nx[k] * (T.wallR[k] - 0.5), 1.6, -(T.py[k] - T.ny[k] * (T.wallR[k] - 0.5))); cam.lookAt(base); cam.fov = 40;
    } else {
      cam.position.copy(base).addScaledVector(fwd, -7.5).add(new THREE.Vector3(0, 2.3, 0)); cam.lookAt(base.clone().addScaledVector(fwd, 3).add(new THREE.Vector3(0, 0.3, 0))); cam.fov = 58;
    }
    cam.updateProjectionMatrix();
    if (App.grade) App.grade.uniforms.heatR.value = 0; // the shimmer is placed for the live camera
    this.shown = mode;
  },
  // where a car was in the order at time t (for the highlights)
  posAt(t, i) { const race = race0(); if (!race) return 99; const c = race.cars[i]; return c ? race.standings().indexOf(c) + 1 : 99; },
  // ---- live TV: the AI drives your car, the director films the race -------------------------------
  tvOn: false,
  setTV(on) {
    const S = App.session; if (!S) return;
    if (!on) App.rpFocus = null;
    this.tvOn = on; S.tvAI = on ? new AIDriver(S.race.player, 0.98, 7) : null;
    this.camMode = 'director'; this.shot = null; this.dirT = 99; this.focus = S.race.cars.indexOf(S.race.player);
    document.body.classList.toggle('tv-live', on); $('#replay').hidden = !on; $('#rp-tag').textContent = 'LIVE';
    if (on && !this.rec) this.reset(S.race);
  },
  // ---- controls --------------------------------------------------------------------------------
  ui() {
    const R = this.rec, S = App.session; if (!R || !S) return;
    const t0 = R.times[0], end = R.times.at(-1), c = S.race.cars[this.focus];
    $('#rp-play').textContent = this.playing ? '❚❚' : '▶'; $('#rp-play').setAttribute('aria-label', this.playing ? 'Pause replay' : 'Play replay');
    $('#rp-speed').textContent = this.speed === 1 ? '1×' : this.speed === 0.5 ? '½×' : '¼×';
    $('#rp-car').textContent = `${c.driver.abbr || c.driver.code} · ${c.team.name}`; $('#rp-car').style.borderColor = c.team.c1;
    $('#rp-cam').textContent = { director: 'Auto', tv: 'TV', apex: 'Apex', kerb: 'Kerb', heli: 'Heli', tcam: 'T-cam', onboard: 'On-board', wing: 'Wing', rear: 'Rear', chase: 'Chase' }[this.camMode];
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
    $('#rp-prev').onclick = () => { R.focus = (R.focus - 1 + n()) % n(); R.manualUntil = Date.now() + 15000; R.cut({}); R.ui(); };
    $('#rp-next').onclick = () => { R.focus = (R.focus + 1) % n(); R.manualUntil = Date.now() + 15000; R.cut({}); R.ui(); };
    $('#rp-cam').onclick = () => { const m = ['director', 'tv', 'apex', 'kerb', 'heli', 'tcam', 'onboard', 'wing', 'rear', 'chase']; R.camMode = m[(m.indexOf(R.camMode) + 1) % m.length]; R.dirT = 0; R.ui(); };
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
function race0() { return App.session && App.session.race; }
function fmtClock(s) { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; }

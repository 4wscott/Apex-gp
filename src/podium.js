// ==== After the flag: parc fermé, the podium ceremony and the season finale ======================
// A top-3 finish: the first three cars park under their numbered boards, then the drivers stand on a podium built on
// the main straight in front of the grandstand: champagne, fireworks, the crowd, a slow camera sweep and a close shot
// of the winner. P4 and lower: the car is taken to its pit box with a radio message. The last race of a career
// season adds the World Champion finale. A tap, click or key skips straight to the results.
const Podium = {
  on: false,
  eligible(race, S) { return race.mode === 'race' && !race.quali && !S.online && !race.player.dnf && !race.endedEarly && !!race.track; },
  start(race, S) {
    const rows = race.results(), P = race.player;
    this.S = S; this.race = race; this.on = true; this.t = 0; this.pos = rows.findIndex((r) => r.car === P) + 1;
    this.top = rows.slice(0, 3).map((r) => r.car); this.finale = this.titleCheck(race, rows);
    S.camWas = S.camMode; S.camMode = 'chase';
    document.body.classList.add('ceremony'); $('#podium-ui').hidden = false; $('#pd-final').hidden = true;
    $('#pd-skip').textContent = this.touch() ? 'Tap to skip' : 'Click or press Enter to skip';
    const sur = (c) => c.driver.name.split(' ').pop();
    Radio.q.length = 0; Radio.until = 0; // older queued lines give way to the finish message
    if (this.pos <= 3) {
      this.stage = 'parc'; this.build(); this.park();
      Radio.say(this.pos === 1 ? 'Yes! You win! What a drive. Park it under the number one board.' : `P${this.pos}, on the podium! Great job. Park it under the P${this.pos} board.`, 2);
    } else {
      this.stage = 'box'; race.toBox(P, P.compound, true);
      const ahead = rows[this.pos - 2] && rows[this.pos - 2].car;
      Radio.say(`P${this.pos}${this.pos <= 10 ? ', in the points' : ''}. ${ahead ? `${sur(ahead)} just ahead. ` : ''}Bring it into the pits, well done today.`, 2);
    }
    this.keyH = (e) => { if (['Enter', ' ', 'Escape', 'Space'].includes(e.key) || e.code === 'Space') { e.preventDefault(); this.end(); } };
    addEventListener('keydown', this.keyH);
  },
  touch() { return App.touchOn || matchMedia('(pointer: coarse)').matches; },
  // the last round of a career season: is this race deciding the title?
  titleCheck(race, rows) {
    if (!App.cfg || !App.cfg.career || App.cfg.sprint || !Career.data) return null;
    const d = Career.data; if (d.round !== d.calendar.length - 1) return null;
    const L = Champ.live(race, false), team = Object.assign({}, d.teamPoints);
    rows.forEach((r, i) => { team[r.car.team.id] = (team[r.car.team.id] || 0) + (r.car.finished && !r.car.dnf ? POINTS[i] || 0 : 0); });
    const consTop = Object.keys(team).sort((a, b) => team[b] - team[a])[0];
    if (L.pos !== 1 && consTop !== d.teamId) return null;
    const res = (d.results || []).concat([{ pos: this.pos }]);
    return { champ: L.pos === 1, cons: consTop === d.teamId, pts: L.pts, wins: res.filter((x) => x.pos === 1).length, podiums: res.filter((x) => x.pos && x.pos <= 3).length, season: d.season };
  },
  // ---- the set: podium steps, a team-coloured backdrop, sponsor boards, numbered parc fermé boards ----
  frameAt() {
    const T = this.race.track, st = GFX.mainStand, mid = st ? st.mid : 0, s = st ? Math.sign(st.lat) || 1 : 1;
    const i = mid, lat0 = -s * T.hw * 0.35; // on the far half of the straight, facing the stand
    const at = (lx, lz) => new THREE.Vector3(T.px[i] + T.tx[i] * lx + T.nx[i] * (lat0 + s * lz), 0, -(T.py[i] + T.ty[i] * lx + T.ny[i] * (lat0 + s * lz)));
    return { at, s, i, st };
  },
  build() {
    const F = this.frameAt(), g = new THREE.Group(), win = this.top[0].team, lowGfx = PHONE_GFX || settings.quality === 0;
    g.position.copy(F.at(0, 0)); g.lookAt(F.at(0, 10)); App.worldRoot.add(g); this.g = g; this.tex = [];
    const ctex = (w, h, draw) => { const t = canvasTex(w, h, draw); this.tex.push(t); return t; };
    const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    const white = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.45 }), dark = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.6 });
    const carpet = new THREE.MeshStandardMaterial({ color: new THREE.Color(win.c1).multiplyScalar(0.55), roughness: 0.95 });
    box(9.5, 0.12, 3.6, carpet, 0, 0.06, 0.1);
    // steps: P2 left, P1 centre, P3 right (as the crowd sees it), with the numbers on the front
    this.steps = [[0, 1.25], [-2.3, 0.9], [2.3, 0.65]].map(([x, h], k) => {
      box(2.2, h, 1.8, white, x, 0.12 + h / 2, 0);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(1.0, Math.min(0.8, h * 0.75)), new THREE.MeshStandardMaterial({ map: ctex(256, 200, (c, w, hh) => { c.fillStyle = '#e9ecef'; c.fillRect(0, 0, w, hh); c.fillStyle = ['#c9a033', '#9aa3ad', '#b0703a'][k]; c.font = '900 170px "Saira Condensed", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(k + 1), w / 2, hh / 2 + 8); }), roughness: 0.5 }));
      num.position.set(x, 0.12 + h / 2, 0.905); g.add(num);
      return { x, top: 0.12 + h };
    });
    // backdrop: the winning team's colours, the event name and a step-and-repeat of sponsors
    const sp = (GFX.tex && GFX.tex.sponsors) || [['APEX GP', '#111', '#fff']];
    const back = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshStandardMaterial({ map: ctex(lowGfx ? 1024 : 2048, lowGfx ? 512 : 1024, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, win.c1); gr.addColorStop(0.6, new THREE.Color(win.c1).multiplyScalar(0.55).getStyle()); gr.addColorStop(1, win.c2); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.globalAlpha = 0.22; c.fillStyle = '#fff'; c.font = `800 ${w / 40}px "Saira Condensed", Arial`; c.textAlign = 'center';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) c.fillText(sp[(x + y * 3) % sp.length][0], (x + (y % 2) * 0.5) * w / 7.5, (y + 0.7) * h / 8);
      c.globalAlpha = 1; c.font = `900 ${w / 13}px "Saira Condensed", Arial`; c.fillStyle = '#fff'; c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = w / 100;
      c.fillText('APEX GRAND PRIX', w / 2, h * 0.2); c.font = `700 ${w / 30}px "Saira Condensed", Arial`; c.fillText(this.race.track.spec.name.toUpperCase(), w / 2, h * 0.3);
    }), roughness: 0.7 }));
    back.position.set(0, 3, -1.7); back.receiveShadow = true; g.add(back);
    box(12.4, 0.3, 0.3, dark, 0, 6.05, -1.72); box(0.3, 6.2, 0.3, dark, -6.1, 3, -1.72); box(0.3, 6.2, 0.3, dark, 6.1, 3, -1.72);
    // sponsor boards either side
    for (const [x, k] of [[-5.4, 1], [5.4, 4]]) {
      const [name, bg, fg] = sp[k % sp.length];
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), new THREE.MeshStandardMaterial({ map: ctex(256, 384, (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = '800 44px "Saira Condensed", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.save(); c.translate(w / 2, h / 2); c.rotate(-Math.PI / 2); c.fillText(name, 0, 0); c.restore(); }), roughness: 0.6 }));
      b.position.set(x, 1.45, -0.6); b.rotation.y = x < 0 ? 0.35 : -0.35; g.add(b);
    }
    // parc fermé boards on posts, one for each of the first three
    this.boards = [];
    this.slots = [[0, 1], [-4.6, 2], [4.6, 3]].map(([x, n]) => {
      this.boards.push(box(0.12, 2.6, 0.12, dark, x, 1.3, 3.6));
      const sgn = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.85), new THREE.MeshStandardMaterial({ map: ctex(256, 200, (c, w, h) => { c.fillStyle = '#111'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffd21f'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10); c.fillStyle = '#fff'; c.font = '900 150px "Saira Condensed", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), w / 2, h / 2 + 8); }), roughness: 0.5, emissive: 0x222222 }));
      sgn.position.set(x, 2.75, 3.6); sgn.rotation.y = Math.PI; g.add(sgn); // faces the cars, which face the podium
      const sgn2 = sgn.clone(); sgn2.rotation.y = 0; sgn2.position.z = 3.62; g.add(sgn2); this.boards.push(sgn, sgn2);
      return { x, z: 5.6 };
    });
    // the three drivers, in team kit, on their steps
    this.people = [];
    g.updateMatrixWorld(true);
    if (GFX.models && GFX.models.crew) this.top.forEach((c, k) => {
      const p = PitCrew.makePerson(c.team, c.team.c1), stp = this.steps[k];
      p.holder.position.set(stp.x, stp.top, 0.15); g.add(p.holder); p.holder.updateMatrixWorld(true);
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 10).translate(0, 0.15, 0), new THREE.MeshPhysicalMaterial({ color: 0x1d4a2a, roughness: 0.15, clearcoat: 1, transmission: 0 }));
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.12, 8).translate(0, 0.36, 0), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 })); bottle.add(neck);
      bottle.visible = false; g.add(bottle); p.bottle = bottle; p.k = k; this.people.push(p);
    });
    // champagne: soft golden droplets with their own fade
    const N = lowGfx ? 600 : 1800, geo = new THREE.BufferGeometry();
    this.sp = { N, pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), alpha: new Float32Array(N), next: 0 };
    geo.setAttribute('position', new THREE.BufferAttribute(this.sp.pos, 3)); geo.setAttribute('alpha', new THREE.BufferAttribute(this.sp.alpha, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { scale: { value: innerHeight * 0.5 } }, transparent: true, depthWrite: false,
      vertexShader: 'attribute float alpha; varying float vA; uniform float scale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(0.09 * scale / -mv.z, 1.5, 14.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0 || vA <= 0.0) discard; gl_FragColor = vec4(mix(vec3(1.0, 0.93, 0.62), vec3(1.0), 0.35 * (1.0 - d)), vA * (1.0 - d * d) * 0.85); }' });
    this.spray = new THREE.Points(geo, mat); this.spray.frustumCulled = false; App.worldRoot.add(this.spray);
    // fireworks behind the podium (the far side of the track from the grandstand)
    this.fw = new Fireworks(App.worldRoot, this.race.track, { mid: F.i, lat: -F.s * (this.race.track.hw + 34), top: 9 });
  },
  // the first three cars under their boards, facing the podium
  park() {
    const g = this.g, fwd = new THREE.Vector3(0, 0, -1).transformDirection(g.matrixWorld);
    this.top.forEach((c, k) => {
      const w = g.localToWorld(new THREE.Vector3(this.slots[k].x, 0, this.slots[k].z));
      c.pit = null; c.x = w.x; c.y = -w.z; c.h = Math.atan2(-fwd.z, fwd.x); c.vx = c.vy = c.r = 0; c.delta = 0; c.throttle = 0; c.brake = 1; c._px = undefined;
      c.locate(true);
    });
  },
  pose(p, t) {
    const k = p.k, wave = Math.sin(t * 3 + k * 1.7) * 0.08, spraying = this.t > 2.6 && this.stage === 'podium';
    const hands = spraying
      ? [[0.22 + wave * 0.5, 1.4 + wave, 0.58], [0.02, 1.48, 0.66]] // both hands on the bottle, held out and aimed at the crowd
      : [[0.34 + wave, 2.02 + wave, 0.12], [-0.34 - wave, 2.02 - wave, 0.12]];
    PitCrew.pose(p, { hands });
    p.bottle.visible = spraying;
    if (spraying) {
      const hand = PitCrew.handsMid(p), local = this.g.worldToLocal(hand.clone());
      p.bottle.position.copy(local); p.bottle.rotation.set(-1.0 - wave, 0, 0);
      return hand;
    }
    return null;
  },
  sprayFrom(origin, dt) {
    const S = this.sp, dir = new THREE.Vector3(0, 0.55, 1).transformDirection(this.g.matrixWorld), n = Math.floor((PHONE_GFX ? 90 : 260) * dt + Math.random());
    for (let j = 0; j < n; j++) {
      const k = S.next, sp = 6 + Math.random() * 4; S.next = (S.next + 1) % S.N;
      S.pos.set([origin.x, origin.y + 0.3, origin.z], k * 3);
      S.vel.set([dir.x * sp + (Math.random() - 0.5) * 2.4, dir.y * sp + (Math.random() - 0.3) * 2, dir.z * sp + (Math.random() - 0.5) * 2.4], k * 3);
      S.life[k] = 1.1 + Math.random() * 0.5;
    }
  },
  // the camera, in the podium's own frame (+z toward the grandstand)
  cam(eye, tgt, fov = 42) { const c = App.camera; c.position.copy(this.g.localToWorld(new THREE.Vector3(...eye))); c.up.set(0, 1, 0); c.lookAt(this.g.localToWorld(new THREE.Vector3(...tgt))); c.fov = fov; c.near = 0.1; c.updateProjectionMatrix(); },
  // any controller button skips too (ignoring one already held when the ceremony began)
  padSkip() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [], down = pads.some((p) => p.buttons.some((b, i) => (i === 0 || i === 1 || i === 9) && b.pressed));
    if (this.padHeld === undefined) this.padHeld = down; else if (!down) this.padHeld = false; else if (!this.padHeld) return true;
    return false;
  },
  frame(dt) {
    // the ceremony runs on the clock, not the frame count, so a slow phone sees the same timing
    const now = performance.now(); dt = Math.min(0.25, (now - (this.last || now)) / 1000) || dt; this.last = now;
    if (this.hold) dt = 0; // held still (tests and screenshots)
    const S = this.S, race = this.race, P = race.player; this.t += dt;
    if (this.padSkip()) return this.end();
    const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }, mix = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
    if (this.stage === 'box') {
      // the race finishes behind us: the field rolls round to the flag while the car is pushed back into the garage
      const h = 1 / 360; S.acc += dt; let k = 0; while (S.acc >= h && k < 40) { race.step(h, { steer: 0, throttle: 0, brake: 1 }); S.acc -= h; k++; }
      if (P.pit && P.pit.phase === 'stop') P.pit.phase = 'parked';
      race.events.length = 0; Radio.frame(race);
    } else Radio.frame(race);
    App.updateVisuals(dt, S, {});
    // parc fermé shows the three cars under their boards; for the podium they are pushed away so nothing blocks the view
    const parc = this.stage === 'parc';
    if (this.g) { for (const c of race.cars) if (c.mesh) c.mesh.grp.visible = parc && this.top.includes(c); this.boards.forEach((b) => (b.visible = parc)); }
    if (this.stage === 'parc') {
      const f = ease(this.t / 3.6); this.cam(mix([10.5, 1.7, 11.5], [6.5, 2.1, 9.5], f), [0, 0.8, 4.6], 44);
      if (this.t > 3.6) { this.stage = 'podium'; this.t = 0; App.audio.cheer(1.5); }
    } else if (this.stage === 'podium') {
      const t = this.t;
      if (t < 5) this.cam(mix([-9, 3.2, 13], [6, 2.5, 9], ease(t / 5)), [0, 1.9, 0], 42);
      else if (t < 8.5) this.cam(mix([6, 2.5, 9], [0.4, 2.55, 4.4], ease((t - 5) / 3.5)), mix([0, 1.9, 0], [0, 2.4, 0], ease((t - 5) / 3.5)), 42);
      else this.cam(mix([0.4, 2.55, 4.4], [0, 3.6, 14], ease((t - 8.5) / 3)), mix([0, 2.4, 0], [0, 3.8, -1], ease((t - 8.5) / 3)), 46);
      if (t > 11.5) { if (this.finale) this.showFinale(); else return this.end(); }
    } else if (this.stage === 'box') {
      if (this.t > 4.8) { if (this.finale) this.showFinale(); else return this.end(); }
    } else if (this.stage === 'final') {
      if (this.g) this.cam([0, 4.2 + Math.sin(this.t * 0.4) * 0.3, 15], [0, 4.5, -1], 50);
      if (this.fw && Math.random() < dt * 2.5) this.fw.launch();
      if (this.t > 7) return this.end();
    }
    // the people and the champagne
    if (this.people) for (const p of this.people) { const o = this.pose(p, performance.now() * 0.001); if (o) this.sprayFrom(o, dt); }
    if (this.sp) {
      const s = this.sp; let live = 0;
      for (let k = 0; k < s.N; k++) {
        if (s.life[k] <= 0) { s.alpha[k] = 0; continue; }
        s.life[k] -= dt; live++;
        s.vel[k * 3 + 1] -= 9.8 * dt; for (let a = 0; a < 3; a++) s.pos[k * 3 + a] += s.vel[k * 3 + a] * dt;
        s.alpha[k] = Math.min(1, s.life[k] * 1.5);
      }
      this.spray.geometry.attributes.position.needsUpdate = true; this.spray.geometry.attributes.alpha.needsUpdate = true;
    }
    if (this.fw) this.fw.update(dt, App.audio); if (App.fireworks) App.fireworks.update(dt, App.audio);
    Crowd.update(dt, race, P);
    App.render();
  },
  // the champion's moment: banner, extra fireworks and a short gallery of the season
  showFinale() {
    const F = this.finale; this.stage = 'final'; this.t = 0; App.audio.cheer(1.8);
    const el = $('#pd-final'); el.hidden = false;
    el.innerHTML = `${F.champ ? '<b class="pd-title">World Champion</b>' : '<b class="pd-title">Constructors\' Champions</b>'}
      <span class="pd-sub">Season ${F.season}${F.champ && F.cons ? ' · and the constructors\' title for ' + Career.team().name : F.cons ? ' · ' + Career.team().name : ''}</span>
      ${F.cons ? `<div class="pd-cups">${Ach.cup('gold', 40)}${Ach.cup('silver', 40)}</div>` : `<div class="pd-cups">${Ach.cup('gold', 48)}</div>`}
      <div class="pd-stats"><div><b>${F.pts}</b><small>points</small></div><div><b>${F.wins}</b><small>wins</small></div><div><b>${F.podiums}</b><small>podiums</small></div></div>`;
    Radio.say(F.champ ? 'You are the World Champion! World Champion! Thank you for everything this year.' : 'We are constructors\' champions! Incredible work from everyone.', 2);
  },
  end() {
    if (!this.on) return; this.on = false;
    removeEventListener('keydown', this.keyH); this.padHeld = undefined; this.last = 0;
    const S = this.S, race = this.race;
    if (this.g) { App.worldRoot.remove(this.g); this.g.traverse((o) => { if (o.geometry && !o.isSkinnedMesh) o.geometry.dispose(); }); }
    if (this.spray) { App.worldRoot.remove(this.spray); this.spray.geometry.dispose(); this.spray.material.dispose(); }
    if (this.fw) { App.worldRoot.remove(this.fw.pts); }
    (this.tex || []).forEach((t) => t.dispose());
    this.g = this.spray = this.fw = this.sp = null; this.people = null; this.tex = [];
    for (const c of race.cars) if (c.mesh) c.mesh.grp.visible = true;
    S.camMode = S.camWas || S.camMode; S.podiumDone = true;
    document.body.classList.remove('ceremony'); $('#podium-ui').hidden = true;
    Results.show(race);
  },
};

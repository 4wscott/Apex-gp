// ==== PC: an F1 steering wheel on screen, steered with the mouse =================================
// Two ways to drive it (Settings → Controls → Mouse steering):
//  'grab'   press on the wheel and turn it like a real one (it springs back to centre when you let go);
//           throttle and brake stay on the keys or a controller
//  'follow' the wheel follows the mouse left and right across the screen; hold the left button to accelerate and
//           the right button to brake, so the whole car is driven with the mouse
// Full lock is 100 degrees each way, like the touch wheel. Rev lights, gear and speed show on the wheel's display.
const MouseWheel = {
  steer: 0, tgt: 0, thr: 0, brk: 0, used: false, grabbing: false, built: false,
  mode() { return settings.mouseSteer || 'off'; },
  // ---- the wheel's look: painted once onto a canvas at the screen's full sharpness (carbon fibre, rubber grips,
  // anodised rotaries, rubber buttons, shift paddles), so turning it only rotates a picture. The screen and rev lights
  // are a small second canvas on top, redrawn only when what they show changes (at most 15 times a second).
  paint(cv, W, H) {
    const dpr = Math.min(3, devicePixelRatio || 1), g = cv.getContext('2d');
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    g.setTransform(dpr * W / 236, 0, 0, dpr * H / 160, dpr * W / 2, dpr * H / 2 + dpr * 4); // wheel units: x -118..118, y -80..80
    const path = (pts) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; };
    const rr = (x, y, w, h, r) => { const p = new Path2D(); p.roundRect(x, y, w, h, r); return p; };
    // carbon twill weave
    const cc = document.createElement('canvas'); cc.width = cc.height = 16; const c2 = cc.getContext('2d');
    c2.fillStyle = '#121418'; c2.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 4) { const dia = ((x + y) / 4) % 2; const gr = c2.createLinearGradient(x, y, x + 4, y + 4); gr.addColorStop(0, dia ? '#2b2f36' : '#1a1d22'); gr.addColorStop(1, dia ? '#17191d' : '#262a30'); c2.fillStyle = gr; c2.fillRect(x, y, 4, 4); }
    const carbon = g.createPattern(cc, 'repeat'); carbon.setTransform(new DOMMatrix().scale(0.55));
    // shift paddles behind the wheel (carbon, sticking out at the top corners)
    for (const s of [-1, 1]) {
      const pd = path([[s * 58, -56], [s * 104, -66], [s * 112, -52], [s * 70, -38]]);
      g.fillStyle = carbon; g.fill(pd); g.strokeStyle = '#3c424b'; g.lineWidth = 1; g.stroke(pd);
    }
    // body, with a baked shadow
    const body = path([[-72, -50], [72, -50], [86, -42], [94, -24], [101, -30], [109, -12], [105, 30], [86, 48], [60, 56], [-60, 56], [-86, 48], [-105, 30], [-109, -12], [-101, -30], [-94, -24], [-86, -42]]);
    g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 10; g.shadowOffsetY = 4; g.fillStyle = '#0d0f12'; g.fill(body); g.restore();
    g.fillStyle = carbon; g.fill(body);
    const gloss = g.createLinearGradient(0, -50, 0, 56); gloss.addColorStop(0, 'rgba(255,255,255,0.16)'); gloss.addColorStop(0.35, 'rgba(255,255,255,0.03)'); gloss.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gloss; g.fill(body); g.strokeStyle = 'rgba(160,170,185,0.55)'; g.lineWidth = 1.2; g.stroke(body);
    // rubber grips with finger ridges
    for (const s of [-1, 1]) {
      const gp = rr(s > 0 ? 88 : -116, -34, 28, 74, 13);
      g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 6; g.fillStyle = '#0b0c0e'; g.fill(gp); g.restore();
      const gg = g.createLinearGradient(s > 0 ? 88 : -116, 0, s > 0 ? 116 : -88, 0); gg.addColorStop(0, '#18191c'); gg.addColorStop(s > 0 ? 0.35 : 0.65, '#2a2c31'); gg.addColorStop(1, '#0e0f11');
      g.fillStyle = gg; g.fill(gp);
      g.save(); g.clip(gp); g.fillStyle = 'rgba(255,255,255,0.035)'; for (let k = 0; k < 160; k++) g.fillRect(s * 102 + (Math.random() - 0.5) * 28, -34 + Math.random() * 74, 0.6, 0.6);
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1.4; for (let y = -22; y <= 30; y += 9) { g.beginPath(); g.moveTo(s * 89, y); g.quadraticCurveTo(s * 102, y + 3, s * 115, y); g.stroke(); } g.restore();
    }
    // the screen surround and the rev-light bar (lit by the display canvas)
    const bez = rr(-46, -38, 92, 52, 6), bg = g.createLinearGradient(0, -38, 0, 14); bg.addColorStop(0, '#3a3f47'); bg.addColorStop(1, '#16191d');
    g.fillStyle = bg; g.fill(bez); g.fillStyle = '#020203'; g.fill(rr(-41, -33, 82, 42, 3));
    g.fillStyle = '#08090b'; g.fill(rr(-56, -48, 112, 8, 4));
    // anodised rotary dials with knurled edges and a pointer
    const dial = (x, y, r, col) => {
      g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 3; g.shadowOffsetY = 1.5; g.beginPath(); g.arc(x, y, r + 1.2, 0, 7); g.fillStyle = '#0a0a0a'; g.fill(); g.restore();
      for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.strokeStyle = k % 2 ? '#5c636d' : '#9aa2ad'; g.lineWidth = 0.9; g.stroke(); }
      const cg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 0.8); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.25, col); cg.addColorStop(1, '#111'); g.beginPath(); g.arc(x, y, r * 0.74, 0, 7); g.fillStyle = cg; g.fill();
      g.beginPath(); g.moveTo(x, y - r * 0.15); g.lineTo(x, y - r * 0.7); g.strokeStyle = '#fff'; g.lineWidth = 1.1; g.stroke();
    };
    dial(-66, -16, 8, '#d81e2a'); dial(-66, 4, 8, '#1f6fe0'); dial(66, -16, 8, '#f2b705'); dial(66, 4, 8, '#9aa3ad');
    dial(-30, 33, 7, '#2bb673'); dial(30, 33, 7, '#e8661c');
    // rubber push buttons with their labels
    const btn = (x, y, col, label) => {
      const bgr = g.createRadialGradient(x - 1.5, y - 2, 0.5, x, y, 5.6); bgr.addColorStop(0, '#ffffffb0'); bgr.addColorStop(0.3, col); bgr.addColorStop(1, '#000');
      g.beginPath(); g.arc(x, y, 6, 0, 7); g.fillStyle = '#050505'; g.fill(); g.beginPath(); g.arc(x, y, 4.8, 0, 7); g.fillStyle = bgr; g.fill();
      g.fillStyle = 'rgba(235,240,245,0.85)'; g.font = '600 4.2px Arial'; g.textAlign = 'center'; g.fillText(label, x, y + 10.5);
    };
    btn(-84, 22, '#f2f2f2', 'PIT'); btn(84, 22, '#b46bff', 'OT'); btn(-50, 46, '#ffd21f', 'DRS'); btn(50, 46, '#2bd46a', 'RADIO');
    btn(-12, 26, '#c4c9cf', 'BB−'); btn(12, 26, '#c4c9cf', 'BB+'); btn(0, 44, '#ff4d4d', 'N');
    // dial labels and a team-style accent stripe along the bottom
    g.fillStyle = 'rgba(235,240,245,0.75)'; g.font = '600 4px Arial'; g.textAlign = 'center';
    [['ERS', -66, -26], ['DIFF', -66, 14.5], ['BAL', 66, -26], ['MAP', 66, 14.5]].forEach(([t, x, y]) => g.fillText(t, x, y));
    g.strokeStyle = '#ffd21f'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-58, 54); g.lineTo(58, 54); g.stroke();
    // a centre-top marker so you can see how far it is turned
    g.fillStyle = '#ffd21f'; g.fill(rr(-3, -60, 6, 9, 2));
  },
  build() {
    if (this.built) return; this.built = true;
    const el = document.createElement('div'); el.id = 'mwheel'; el.hidden = true;
    el.innerHTML = `<div id="mw-hint"></div><div id="mw-rot" aria-label="Steering wheel: press on it and turn with the mouse"><canvas id="mw-base"></canvas><canvas id="mw-lcd"></canvas></div>`;
    $('#hud').appendChild(el);
    this.el = el; this.rot = el.querySelector('#mw-rot');
    this.W = 290; this.H = 197;
    this.paint(el.querySelector('#mw-base'), this.W, this.H);
    // the display canvas sits over the screen and the rev-light bar (wheel units x -56..56, y -48..9)
    const lcd = el.querySelector('#mw-lcd'), k = this.W / 236, dpr = Math.min(3, devicePixelRatio || 1);
    this.lcd = { cv: lcd, g: lcd.getContext('2d'), k, dpr };
    lcd.width = 112 * k * dpr; lcd.height = 57 * k * dpr; lcd.style.width = 112 * k + 'px'; lcd.style.height = 57 * k + 'px';
    lcd.style.left = (this.W / 2 - 56 * k) + 'px'; lcd.style.top = (this.H / 2 + 4 - 48 * (this.H / 160)) + 'px';
    // grab and turn: the angle of the pointer round the wheel's centre, relative to where it was grabbed
    let a0 = 0, s0 = 0, sid = null;
    const ang = (e) => { const r = this.rot.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
    el.addEventListener('pointerdown', (e) => {
      if (this.mode() !== 'grab' || e.button !== 0) return;
      sid = e.pointerId; a0 = ang(e); s0 = this.tgt; el.setPointerCapture(sid); this.grabbing = true; this.used = true; e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== sid) return;
      let d = ang(e) - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      this.tgt = clamp(s0 - (d * (settings.mouseSens || 1)) / 1.75, -1, 1); // clockwise (to the right) is negative steer
    });
    const end = (e) => { if (e.pointerId !== sid) return; sid = null; this.grabbing = false; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
    // follow the mouse: anywhere on the screen that isn't a button or panel
    const free = (e) => !e.target.closest('button, input, select, .overlay, #menu, #pc-btns, #replay');
    addEventListener('pointermove', (e) => {
      if (this.mode() !== 'follow' || e.pointerType === 'touch' || !App.session || App.paused) return;
      const x = (e.clientX - innerWidth / 2) / (innerWidth * 0.32 / (settings.mouseSens || 1));
      this.tgt = -clamp(Math.sign(x) * Math.min(1, Math.abs(x)) ** 1.25, -1, 1); this.used = true;
    });
    addEventListener('pointerdown', (e) => {
      if (this.mode() !== 'follow' || e.pointerType === 'touch' || !App.session || App.paused || !free(e)) return;
      if (e.button === 0) this.thrOn = true; if (e.button === 2) this.brkOn = true; this.used = true;
    });
    addEventListener('pointerup', (e) => { if (e.button === 0) this.thrOn = false; if (e.button === 2) this.brkOn = false; });
    addEventListener('blur', () => { this.thrOn = this.brkOn = false; this.grabbing = false; });
    addEventListener('contextmenu', (e) => { if (this.mode() === 'follow' && App.session && !App.paused) e.preventDefault(); }); // the right button brakes, no menu
  },
  // the screen and rev lights: gear, speed, an ERS bar; drawn only when something on it changed
  drawLcd(gear, spd, lit, ers) {
    const L = this.lcd, key = gear + '|' + spd + '|' + lit + '|' + ers, now = performance.now();
    if (key === L.key || now - (L.t || 0) < 66) return; L.key = key; L.t = now;
    const g = L.g, k = L.k * L.dpr, kx = k, ky = (this.H / 160) * L.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, L.cv.width, L.cv.height); g.setTransform(kx, 0, 0, ky, 56 * kx, 48 * ky); // wheel units again
    for (let i = 0; i < 15; i++) { const on = i < lit, col = i < 5 ? '#22ff55' : i < 10 ? '#ff2a2a' : '#3a7bff'; g.beginPath(); g.arc(-49 + i * 7, -44, 2.6, 0, 7); g.fillStyle = on ? col : '#1c1e22'; if (on) { g.shadowColor = col; g.shadowBlur = 5; } g.fill(); g.shadowBlur = 0; }
    g.fillStyle = '#0a1a10'; g.fillRect(-41, -33, 82, 42);
    const lg = g.createLinearGradient(0, -33, 0, 9); lg.addColorStop(0, 'rgba(120,255,170,0.06)'); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.fillRect(-41, -33, 82, 42);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#ffffff'; g.font = '800 30px "Saira Condensed", Arial'; g.fillText(gear, 0, -3);
    g.fillStyle = '#ffd21f'; g.font = '700 9px "JetBrains Mono", monospace'; g.fillText(spd, -24, -20); g.fillStyle = '#9aa3ad'; g.font = '600 4.5px Arial'; g.fillText(settings.units === 'mph' ? 'MPH' : 'KM/H', -24, -14);
    g.fillStyle = '#9aa3ad'; g.fillText('ERS', 24, -14); g.fillStyle = '#1f2a24'; g.fillRect(14, -25, 20, 5); g.fillStyle = '#2bd46a'; g.fillRect(14, -25, 20 * ers, 5);
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.strokeRect(-40.5, -32.5, 81, 41);
  },
  // called every frame by the input: what the mouse wants, smoothed like a real wheel's movement
  read(dt) {
    const m = this.mode();
    if (m === 'off') return null;
    if (m === 'grab' && !this.grabbing) this.tgt += clamp(-this.tgt, -3.2 * dt, 3.2 * dt); // springs back to centre
    this.steer += clamp(this.tgt - this.steer, -9 * dt, 9 * dt);
    this.thr += clamp((m === 'follow' && this.thrOn ? 1 : 0) - this.thr, -10 * dt, 5 * dt);
    this.brk += clamp((m === 'follow' && this.brkOn ? 1 : 0) - this.brk, -10 * dt, 8 * dt);
    return { steer: this.steer, thr: this.thr, brk: this.brk, active: this.used };
  },
  // shown in races on a PC (not on touch screens, not in replays or the podium)
  show(on) {
    this.build();
    const vis = on && this.mode() !== 'off';
    this.el.hidden = !vis; document.body.classList.toggle('mwheel', vis);
    if (vis) {
      this.el.dataset.mode = this.mode();
      clearTimeout(this.hintT); this.el.classList.remove('quiet'); this.hintT = setTimeout(() => this.el.classList.add('quiet'), 9000); // the how-to fades after a few seconds
      $('#mw-hint').textContent = this.mode() === 'grab' ? 'Press on the wheel and turn · W/S or ↑/↓ for the pedals' : 'Mouse left/right steers · left button accelerate · right button brake';
    }
    if (!on) { this.tgt = this.steer = 0; this.thrOn = this.brkOn = false; this.used = false; }
  },
  draw(P) {
    if (!this.el || this.el.hidden) return;
    const deg = Math.round(-this.steer * 1000) / 10; if (deg !== this.deg) { this.deg = deg; this.rot.style.transform = `rotate(${deg}deg)`; }
    const lit = Math.round(clamp((P.rpm - 9500) / (P.p.redline - 9500), 0, 1) * 15);
    this.drawLcd(P.reverse ? 'R' : String(P.gear), String(Math.round(Math.max(0, P.vx) * (settings.units === 'mph' ? 2.237 : 3.6))), lit, Math.round(clamp(P.soc / SOC_MAX, 0, 1) * 20) / 20);
    if (this.mode() === 'follow') this.el.classList.toggle('pedal', this.thrOn || this.brkOn);
  },
};

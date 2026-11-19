// ==== Force feedback: the car's steering torque to a Logitech wheel, road feel to controllers ======================
// The simulation works out the front tyres' aligning torque every step (Car.steerTq, with frontSat / rearSat telling how
// close each axle is to its grip peak). Here it becomes:
//  - real force on Logitech wheels that speak the classic Logitech protocol (G29, G27, G25, Driving Force GT, Driving
//    Force Pro, G923 PlayStation), through WebHID in Chrome and Edge on a computer. The browser asks once ("Connect wheel
//    for force feedback"); after that the wheel is picked up by itself. The wheel pulls with the aligning torque, goes
//    light when the front washes out, kicks on kerbs, shudders when a tyre locks, and has a little damping.
//  - controller rumble that never stops telling you what the tyres are doing: the scrub of the fronts at the limit, the
//    rear stepping out, grass and gravel, plus the one-off pulses (impacts, kerbs, lock-ups, wheelspin, the limiter);
//    and on Xbox controllers (Chrome, Edge) the triggers: the left one pulses when the fronts lock or ABS works, the
//    right one when the rears spin or traction control cuts in.
// Settings: Vibration Off / Light / Strong, Trigger rumble, and the wheel's strength, damping and direction.
const FFB = {
  dev: null, rid: 0, busy: false, lastByte: -1, released: true, steerPrev: 0, dSteer: 0, jolt: 0, joltT: 0, t: 0,
  pulseS: 0, pulseW: 0, pulseUntil: 0, padT: 0,
  // the wheels that take the classic Logitech force commands (the G920 and the Xbox G923 use a different protocol)
  IDS: [0xc24f, 0xc260, 0xc29b, 0xc299, 0xc29a, 0xc298, 0xc294, 0xc295, 0xc266, 0xc267],
  supported() { return !!(navigator.hid && window.isSecureContext); },
  init() {
    if (!this.supported()) return;
    // a wheel allowed before is used straight away
    navigator.hid.getDevices().then((ds) => { const d = ds.find((x) => x.vendorId === 0x046d && this.IDS.includes(x.productId)); if (d) this.attach(d); }).catch(() => {});
    navigator.hid.addEventListener('disconnect', (e) => { if (e.device === this.dev) { this.dev = null; this.ui(); } });
    addEventListener('pagehide', () => this.release());
  },
  async connect() {
    if (!this.supported()) { this.ui('Force feedback for wheels needs Chrome or Edge on a computer.'); return; }
    try {
      const ds = await navigator.hid.requestDevice({ filters: this.IDS.map((productId) => ({ vendorId: 0x046d, productId })) });
      if (ds && ds[0]) await this.attach(ds[0]); else this.ui();
    } catch (e) { this.ui('The wheel could not be opened: ' + (e.message || e)); }
  },
  async attach(d) {
    try {
      if (!d.opened) await d.open();
      // the output report this wheel listens on (most have no report number)
      let rid = 0; const walk = (cs) => { for (const c of cs || []) { if (c.outputReports && c.outputReports.length && !rid) rid = c.outputReports[0].reportId || 0; walk(c.children); } }; walk(d.collections);
      this.dev = d; this.rid = rid; this.lastByte = -1; this.released = true;
      this.ui();
    } catch (e) { this.ui('The wheel could not be opened: ' + (e.message || e)); }
  },
  send(bytes) {
    if (!this.dev || this.busy) return false;
    this.busy = true;
    this.dev.sendReport(this.rid, new Uint8Array(bytes)).catch(() => {}).finally(() => { this.busy = false; });
    return true;
  },
  // a constant force: -1 .. 1, + turns the wheel to the left
  force(f) {
    const inv = settings.wheelInvert ? -1 : 1, b = Math.round(clamp(128 - f * inv * 127, 1, 255));
    if (b === this.lastByte) return;
    if (this.released) { if (!this.send([0xf5, 0, 0, 0, 0, 0, 0])) return; this.released = false; return; } // the wheel's own centring spring off
    if (this.send([0x11, 0x08, b, 0x80, 0, 0, 0])) this.lastByte = b;
  },
  // back to the wheel's own behaviour (menus, pause, replays, leaving the page)
  release() {
    if (!this.dev || this.released) return;
    const d = this.dev, rid = this.rid;
    d.sendReport(rid, new Uint8Array([0x13, 0, 0, 0, 0, 0, 0])).then(() => d.sendReport(rid, new Uint8Array([0xfe, 0x0d, 0x03, 0x03, 0x80, 0, 0]))).then(() => d.sendReport(rid, new Uint8Array([0x14, 0, 0, 0, 0, 0, 0]))).catch(() => {});
    this.released = true; this.lastByte = -1;
  },
  // a one-off controller pulse (impacts, kerbs, lock-ups...): mixed with the continuous feel below
  pulse(strong, weak, dur) {
    const now = performance.now();
    if (now < this.pulseUntil && strong <= this.pulseS && weak <= this.pulseW) return;
    this.pulseS = strong; this.pulseW = weak; this.pulseUntil = now + dur;
  },
  idle() { this.release(); },
  update(dt, P, race, inp) {
    this.t += dt;
    const v = Math.max(0, P.vx), off = P.surface === 'grass' ? 0.3 : P.surface === 'gravel' ? 0.55 : 0;
    // ---- the wheel
    if (this.dev) {
      const k = settings.wheelFfb ?? 0.7;
      const st = inp.steer || 0; this.dSteer = lerp(this.dSteer, (st - this.steerPrev) / Math.max(dt, 1e-3), Math.min(1, dt * 20)); this.steerPrev = st;
      let f = Math.tanh((P.steerTq || 0) / 700) * 0.9;
      f -= st * 0.35 * (1 - Math.min(1, v / 12)); // standing still or crawling: the tyres scrub, the wheel feels heavy and centres
      f -= this.dSteer * 0.06 * (settings.wheelDamp ?? 0.3); // damping: no oscillation when you let go
      // kerbs and the run-off: short kicks either way
      this.joltT -= dt; if ((P.kerbHit || off) && this.joltT <= 0) { this.jolt = (Math.random() - 0.5) * (P.kerbHit ? 0.35 : off * 0.5); this.joltT = 0.035 + Math.random() * 0.03; }
      if (!P.kerbHit && !off) this.jolt *= Math.max(0, 1 - dt * 30);
      f += this.jolt;
      if (P.lockF) f += Math.sin(this.t * 2 * Math.PI * 22) * 0.07; // a locked front shudders
      const hit = P.impact || 0; if (hit > 4) f += Math.sign(Math.random() - 0.5) * Math.min(0.8, hit / 25);
      this.force(clamp(f * k, -1, 1));
    }
    // ---- controllers: the continuous feel plus any pulse, sent as one effect a few times a second
    const p = App.input.pad(), act = p && p.vibrationActuator, K = Pads.strength();
    if (!act || !K || App.input.lastDevice === 'touch') return;
    this.padT -= dt; if (this.padT > 0) return; this.padT = 0.07;
    const now = performance.now(), pulse = now < this.pulseUntil;
    const scrub = clamp(((P.frontSat || 0) - 0.82) * 1.6, 0, 0.45), slide = clamp(((P.rearSat || 0) - 0.85) * 1.4, 0, 0.5);
    let strong = Math.max(off * 0.6, slide * 0.6, pulse ? this.pulseS : 0), weak = Math.max(scrub, off, pulse ? this.pulseW : 0, v > 5 ? Math.min(0.04, v / 2500) : 0);
    strong = Math.min(1, strong * K); weak = Math.min(1, weak * K);
    const trig = settings.triggerRumble !== false && act.effects && act.effects.includes && act.effects.includes('trigger-rumble');
    const lt = trig && v > 3 && (P.lockF || P.lockR || P.absAct) ? (P.lockF || P.lockR ? 0.9 : 0.45) * K : 0, rt = trig && (P.spin || P.tcAct) ? (P.spin ? 0.8 : 0.35) * K : 0;
    if (strong < 0.01 && weak < 0.01 && !lt && !rt) return;
    const opts = { duration: 110, startDelay: 0, strongMagnitude: strong, weakMagnitude: weak };
    if (trig) { opts.leftTrigger = lt; opts.rightTrigger = rt; act.playEffect('trigger-rumble', opts).catch(() => {}); } else act.playEffect('dual-rumble', opts).catch(() => {});
  },
  // the settings row: connected or not, and why
  ui(msg) {
    const el = document.getElementById('ffb-status'), b = document.getElementById('ffb-connect'); if (!el) return;
    if (!this.supported()) { el.textContent = 'Force feedback for wheels works in Chrome or Edge on a computer.'; if (b) b.disabled = true; return; }
    el.textContent = msg || (this.dev ? `Connected: ${this.dev.productName || 'Logitech wheel'}. It pulls with the tyres in races.` : 'Logitech G29, G27, G25, Driving Force GT, G923 (PlayStation). Experimental.');
    if (b) b.textContent = this.dev ? 'Reconnect wheel' : 'Connect wheel for force feedback';
  },
};

// ==== Audio: synthesised V6 hybrid, tyres, wind, kerbs ======================
class AudioEngine {
  constructor() { this.ctx = null; this.vol = 0.7; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(this.master);
    this.out = comp;
    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.player = this.makeEngine(1);
    this.other = this.makeEngine(0.6);
    const mkNoise = (type, f, q) => {
      const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0; src.connect(fl); fl.connect(g); g.connect(this.out); src.start();
      return { g, fl };
    };
    this.wind = mkNoise('lowpass', 900, 0.5);
    this.squeal = mkNoise('bandpass', 1400, 6);
    this.rumble = mkNoise('lowpass', 140, 1);
    this.gravel = mkNoise('bandpass', 600, 0.8);
    this.crowd = mkNoise('bandpass', 1100, 0.3);
  }
  makeEngine(level) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000; lp.Q.value = 1.5;
    const shaper = ctx.createWaveShaper(); const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.4); }
    shaper.curve = curve;
    const oscs = [['sawtooth', 1, 0.5], ['square', 0.5, 0.28], ['sawtooth', 2, 0.18], ['triangle', 1.5, 0.22]].map(([type, mul, amp]) => {
      const o = ctx.createOscillator(); o.type = type; const og = ctx.createGain(); og.gain.value = amp; o.connect(og); og.connect(shaper); o.start(); return { o, mul };
    });
    // MGU-H / turbo whine
    const whine = ctx.createOscillator(); whine.type = 'sine'; const wg = ctx.createGain(); wg.gain.value = 0; whine.connect(wg); whine.start();
    shaper.connect(lp); lp.connect(g); wg.connect(g);
    if (pan) { g.connect(pan); pan.connect(this.out); } else g.connect(this.out);
    return { g, lp, oscs, whine, wg, pan, level, cut: 0 };
  }
  setEngine(e, rpm, thr, gain, panV = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = (rpm / 60) * 3; // 6 cylinders: 3 firing pulses per rev
    e.oscs.forEach(({ o, mul }) => o.frequency.setTargetAtTime(f * mul, t, 0.015));
    e.lp.frequency.setTargetAtTime(600 + thr * 3400 + rpm * 0.12, t, 0.03);
    const cut = e.cut > 0 ? 0.25 : 1;
    e.g.gain.setTargetAtTime(gain * e.level * (0.25 + 0.75 * thr) * cut, t, 0.02);
    e.whine.frequency.setTargetAtTime(2800 + rpm * 0.35, t, 0.05);
    e.wg.gain.setTargetAtTime(gain * 0.03 * thr, t, 0.05);
    if (e.pan) e.pan.pan.setTargetAtTime(panV, t, 0.05);
  }
  update(dt, st) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = st.player;
    if (p.justShifted) { this.player.cut = 0.06; p.justShifted = 0; }
    this.player.cut -= dt;
    this.setEngine(this.player, p.rpm, Math.max(p.throttle, 0.05), st.inCockpit ? 0.55 : 0.42);
    if (st.other) this.setEngine(this.other, st.other.car.rpm, Math.max(st.other.car.throttle, 0.1), st.other.gain, st.other.pan);
    else this.setEngine(this.other, 4000, 0, 0);
    const v = Math.max(0, p.vx);
    this.wind.g.gain.setTargetAtTime(Math.min(0.35, (v / 90) ** 2 * 0.3), t, 0.1);
    this.wind.fl.frequency.setTargetAtTime(400 + v * 12, t, 0.1);
    const slip = Math.max(Math.abs(p.slipF) - 0.07, Math.abs(p.slipR) - 0.07, 0) * 4 + (p.lockF || p.lockR ? 0.6 : 0) + (p.spin ? 0.4 : 0);
    this.squeal.g.gain.setTargetAtTime(p.surface === 'tarmac' || p.surface === 'kerb' ? Math.min(0.25, slip * (v > 3 ? 0.4 : 0)) : 0, t, 0.04);
    this.rumble.g.gain.setTargetAtTime(p.surface === 'kerb' && v > 3 ? 0.6 : 0, t, 0.02);
    this.gravel.g.gain.setTargetAtTime((p.surface === 'gravel' || p.surface === 'grass') && v > 2 ? 0.35 : 0, t, 0.05);
    this.crowd.g.gain.setTargetAtTime(st.crowd || 0, t, 0.5);
  }
  thud(strength) {
    if (!this.ctx || strength < 2) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 300 + strength * 40;
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(1, strength / 15), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(fl); fl.connect(g); g.connect(this.out); src.start(t); src.stop(t + 0.4);
  }
  beep(freq, dur = 0.12, vol = 0.25) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; o.type = 'sine'; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  }
  silence() { if (!this.ctx) return; this.setEngine(this.player, 4000, 0, 0); this.setEngine(this.other, 4000, 0, 0); ['wind', 'squeal', 'rumble', 'gravel', 'crowd'].forEach((k) => this[k].g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)); }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
}

// ==== Input: keyboard, gamepads and wheels ===================================
const ACTIONS = [
  ['steerLeft', 'Steer left', 'axis'], ['steerRight', 'Steer right', 'axis'], ['throttle', 'Throttle', 'axis'], ['brake', 'Brake', 'axis'],
  ['shiftUp', 'Shift up', 'button'], ['shiftDown', 'Shift down', 'button'], ['aero', 'Active aero', 'button'], ['overtake', 'Overtake (hold)', 'button'],
  ['ers', 'ERS mode', 'button'], ['biasF', 'Brake bias forward', 'button'], ['biasR', 'Brake bias rearward', 'button'],
  ['camera', 'Change camera', 'button'], ['lookBack', 'Look back (hold)', 'button'], ['reset', 'Reset to track', 'button'], ['pause', 'Pause', 'button'],
];
const KEYMAP = {
  steerLeft: ['ArrowLeft', 'KeyA'], steerRight: ['ArrowRight', 'KeyD'], throttle: ['ArrowUp', 'KeyW'], brake: ['ArrowDown', 'KeyS'],
  shiftUp: ['KeyE', 'ShiftRight'], shiftDown: ['KeyQ', 'ControlRight'], aero: ['Space'], overtake: ['KeyF'], ers: ['KeyX'],
  biasF: ['BracketLeft'], biasR: ['BracketRight'], camera: ['KeyC'], lookBack: ['KeyB'], reset: ['KeyR'], pause: ['Escape', 'KeyP'],
};
// default for the "standard" gamepad mapping
const PAD_DEFAULT = {
  steerLeft: { type: 'axis', index: 0, rest: 0, full: -1 }, steerRight: { type: 'axis', index: 0, rest: 0, full: 1 },
  throttle: { type: 'button', index: 7 }, brake: { type: 'button', index: 6 },
  shiftUp: { type: 'button', index: 5 }, shiftDown: { type: 'button', index: 4 }, aero: { type: 'button', index: 0 }, overtake: { type: 'button', index: 2 },
  ers: { type: 'button', index: 1 }, biasF: { type: 'button', index: 12 }, biasR: { type: 'button', index: 13 }, camera: { type: 'button', index: 3 },
  lookBack: { type: 'button', index: 10 }, reset: { type: 'button', index: 8 }, pause: { type: 'button', index: 9 },
};

class Input {
  constructor() {
    this.keys = new Set(); this.hits = new Set(); this.prev = {}; this.state = {};
    this.binds = store.get('binds', null) || { pad: null, map: JSON.parse(JSON.stringify(PAD_DEFAULT)) };
    this.kbSteer = 0; this.kbThr = 0; this.kbBrk = 0; this.lastDevice = 'keyboard';
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code); this.hits.add(e.code); this.lastDevice = 'keyboard';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.capture = null;
    this.touch = { steer: 0, thr: 0, brk: 0, btn: {} };
  }
  // on-screen controls for phones and tablets, built from the touch settings
  buildTouch(root, o) {
    const st = this.touch; st.steer = 0; st.thr = 0; st.brk = 0; st.btn = {};
    const big = { S: 0.8, M: 1, L: 1.25 }[o.touchSize] || 1;
    root.style.setProperty('--tb', big);
    // arrows sit under the left thumb, so both pedals go to the right (brake left of throttle)
    root.className = 'tside-' + (o.touchSteer === 'buttons' ? 'std' : o.touchLayout || 'split');
    this.touchArrows = o.touchSteer === 'buttons';
    const btn = (act, label, extra = '') => `<button type="button" data-act="${act}" ${extra}>${label}</button>`;
    root.innerHTML = `
      <div id="t-steer" class="steer-${o.touchSteer}">
        ${o.touchSteer === 'wheel' ? `<svg id="t-wheel" viewBox="-110 -70 220 140" aria-label="Steering wheel: put your thumb on it and turn">
            <path d="M-70,-48 L70,-48 L84,-40 L92,-22 L100,-28 L108,-10 L104,30 L84,46 L58,54 L-58,54 L-84,46 L-104,30 L-108,-10 L-100,-28 L-92,-22 L-84,-40 Z" fill="#17191d" stroke="#3a3f47" stroke-width="2"/>
            <rect x="-112" y="-30" width="22" height="64" rx="10" fill="#0b0b0c"/><rect x="90" y="-30" width="22" height="64" rx="10" fill="#0b0b0c"/>
            <rect x="-38" y="-30" width="76" height="38" rx="4" fill="#050506" stroke="#2a2d33"/>
            ${[...Array(15)].map((_, k) => `<circle cx="${-49 + k * 7}" cy="-40" r="2.6" fill="${k < 5 ? '#22ff55' : k < 10 ? '#ff2222' : '#3366ff'}" opacity="0.35" class="t-led"/>`).join('')}
            <text id="t-gear" x="0" y="0" fill="#fff" font-size="26" font-weight="800" text-anchor="middle" font-family="Saira Condensed, Arial">1</text>
            <circle cx="-62" cy="-16" r="6" fill="#f2f2f2"/><circle cx="-62" cy="2" r="6" fill="#f6c400"/><circle cx="62" cy="-16" r="6" fill="#b46bff"/><circle cx="62" cy="2" r="6" fill="#2b2b2b"/>
            <circle cx="-22" cy="30" r="7" fill="#b8bec6"/><circle cx="0" cy="30" r="7" fill="#b8bec6"/><circle cx="22" cy="30" r="7" fill="#b8bec6"/>
            <circle cx="-48" cy="42" r="6" fill="#2bd46a"/><circle cx="48" cy="42" r="6" fill="#ff7a00"/>
          </svg>` : o.touchSteer === 'pad' ? '<span id="t-rail"></span><span id="t-knob"></span><span class="t-label">Drag to steer</span>'
          : '<div class="t-arrows"><button type="button" id="t-left" aria-label="Steer left">◀</button><button type="button" id="t-right" aria-label="Steer right">▶</button></div>'}
      </div>
      <div class="t-pedals">
        ${o.autoGear ? '' : `<div class="t-shift">${btn('shiftDown', '−', 'aria-label="Shift down"')}${btn('shiftUp', '+', 'aria-label="Shift up"')}</div>`}
        <button type="button" id="t-brk" aria-label="Brake">Brake</button>
        <button type="button" id="t-thr" aria-label="Throttle">Throttle</button>
      </div>
      <div class="t-top">
        ${btn('pause', 'II', 'aria-label="Pause"')}${btn('camera', 'Cam')}${btn('lookBack', 'Back')}${btn('ers', 'ERS')}${btn('overtake', 'OT')}${o.aeroAuto ? '' : btn('aero', 'Aero')}${btn('biasR', 'BB−')}${btn('biasF', 'BB+')}${btn('reset', 'Reset')}
      </div>`;
    const sens = o.touchSens || 1, buzz = (ms) => { if (o.haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* not supported */ } };
    this.buzz = buzz;
    const pad = root.querySelector('#t-steer');
    if (o.touchSteer === 'wheel') {
      const svg = root.querySelector('#t-wheel'); let sid = null, a0 = 0, s0 = 0;
      const ang = (e) => { const r = svg.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
      pad.addEventListener('pointerdown', (e) => { sid = e.pointerId; a0 = ang(e); s0 = st.steer; pad.setPointerCapture(sid); this.lastDevice = 'touch'; e.preventDefault(); });
      pad.addEventListener('pointermove', (e) => {
        if (e.pointerId !== sid) return;
        let d = ang(e) - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        st.steer = clamp(s0 - (d * sens) / 1.75, -1, 1);
      });
      const end = (e) => { if (e.pointerId !== sid) return; sid = null; st.steer = 0; };
      pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
      this.drawTouchWheel = (steer, gear, rpmFrac) => {
        svg.style.transform = `rotate(${-steer * 100}deg)`;
        const g = root.querySelector('#t-gear'); if (g.textContent !== String(gear)) g.textContent = gear;
        const lit = Math.round(rpmFrac * 15); root.querySelectorAll('.t-led').forEach((l, k) => l.setAttribute('opacity', k < lit ? 1 : 0.25));
      };
    } else if (o.touchSteer === 'pad') {
      const knob = root.querySelector('#t-knob'); let sid = null, x0 = 0;
      pad.addEventListener('pointerdown', (e) => { sid = e.pointerId; x0 = e.clientX; pad.setPointerCapture(sid); this.lastDevice = 'touch'; e.preventDefault(); });
      pad.addEventListener('pointermove', (e) => { if (e.pointerId !== sid) return; const range = Math.min(140, innerWidth * 0.14) / sens; st.steer = clamp(-(e.clientX - x0) / range, -1, 1); knob.style.transform = `translateX(${-st.steer * range}px)`; });
      const end = (e) => { if (e.pointerId !== sid) return; sid = null; st.steer = 0; knob.style.transform = ''; };
      pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
      this.drawTouchWheel = null;
    } else {
      const hold = (el, v) => { el.addEventListener('pointerdown', (e) => { st.steer = v * Math.min(1, sens); el.classList.add('down'); el.setPointerCapture(e.pointerId); this.lastDevice = 'touch'; e.preventDefault(); }); const off = () => { st.steer = 0; el.classList.remove('down'); }; el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); };
      hold(root.querySelector('#t-left'), 1); hold(root.querySelector('#t-right'), -1); this.drawTouchWheel = null;
    }
    // pedals: full press, or analogue by finger height when enabled
    const pedal = (el, key) => {
      const val = (e) => { if (!o.analogPedals) return 1; const r = el.getBoundingClientRect(); return clamp(((r.bottom - e.clientY) / r.height) * 1.25, 0.2, 1); };
      el.addEventListener('pointerdown', (e) => { st[key] = val(e); el.classList.add('down'); el.setPointerCapture(e.pointerId); this.lastDevice = 'touch'; buzz(8); e.preventDefault(); });
      el.addEventListener('pointermove', (e) => { if (el.classList.contains('down')) st[key] = val(e); });
      const off = () => { st[key] = 0; el.classList.remove('down'); };
      el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off);
    };
    pedal(root.querySelector('#t-thr'), 'thr'); pedal(root.querySelector('#t-brk'), 'brk');
    root.querySelectorAll('[data-act]').forEach((b2) => {
      const a = b2.dataset.act;
      b2.addEventListener('pointerdown', (e) => { st.btn[a] = 2; b2.classList.add('down'); this.lastDevice = 'touch'; buzz(10); e.preventDefault(); });
      const up = () => { st.btn[a] = st.btn[a] === 2 ? 1 : 0; b2.classList.remove('down'); };
      b2.addEventListener('pointerup', up); b2.addEventListener('pointercancel', up);
    });
  }
  pads() { return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : []; }
  pad() {
    const pads = this.pads(); if (!pads.length) return null;
    if (this.binds.padId) { const p = pads.find((p) => p.id === this.binds.padId); if (p) return p; }
    return pads[0];
  }
  readBind(p, b) {
    if (!p || !b) return 0;
    if (b.type === 'axis') {
      const v = p.axes[b.index]; if (v === undefined) return 0;
      const span = b.full - b.rest; if (Math.abs(span) < 1e-3) return 0;
      return clamp((v - b.rest) / span, 0, 1);
    }
    const btn = p.buttons[b.index]; return btn ? (typeof btn === 'object' ? btn.value : btn) : 0;
  }
  key(action) { return (KEYMAP[action] || []).some((k) => this.keys.has(k)); }
  poll(dt, speed, opts) {
    const p = this.pad(), m = this.binds.map, s = {};
    const padVal = (a) => this.readBind(p, m[a]);
    let padSteer = 0, padThr = 0, padBrk = 0;
    if (p) {
      padSteer = padVal('steerLeft') - padVal('steerRight');
      padThr = padVal('throttle'); padBrk = padVal('brake');
      const dz = opts.deadzone ?? 0.06;
      padSteer = Math.sign(padSteer) * Math.pow(Math.max(0, Math.abs(padSteer) - dz) / (1 - dz), opts.linearity ?? 1.4);
      if (Math.abs(padSteer) > 0.05 || padThr > 0.05 || padBrk > 0.05) this.lastDevice = p.mapping === 'standard' ? 'gamepad' : 'wheel';
    }
    // keyboard smoothing
    const kl = this.key('steerLeft'), kr = this.key('steerRight');
    const target = (kl ? 1 : 0) - (kr ? 1 : 0);
    const rate = target === 0 ? 5 : Math.sign(target) !== Math.sign(this.kbSteer) && this.kbSteer !== 0 ? 6 : 2.6;
    this.kbSteer += clamp(target - this.kbSteer, -rate * dt, rate * dt);
    this.kbThr += clamp((this.key('throttle') ? 1 : 0) - this.kbThr, -8 * dt, 6 * dt);
    this.kbBrk += clamp((this.key('brake') ? 1 : 0) - this.kbBrk, -8 * dt, 9 * dt);
    const useKb = this.lastDevice === 'keyboard', useTouch = this.lastDevice === 'touch';
    if (useTouch) {
      // arrows build steering up gradually (like a keyboard); wheel and pad follow the thumb directly
      const tgt = this.touch.steer, cur = this.tSteer || 0;
      const rate = this.touchArrows ? (tgt === 0 ? 5 : Math.sign(tgt) !== Math.sign(cur) && cur !== 0 ? 6 : 2.4) : 9;
      this.tSteer = cur + clamp(tgt - cur, -rate * dt, rate * dt);
    }
    let steer = useTouch ? this.tSteer : useKb ? this.kbSteer : padSteer;
    // speed-sensitive steering for keyboard and gamepad (off for wheels by default)
    const assistOn = this.lastDevice === 'wheel' ? opts.wheelAssist : useTouch ? opts.touchAssist !== false : opts.steerAssist;
    if (assistOn) steer *= 1 / (1 + (Math.max(0, speed) / 40) ** 2) ** 0.5 * (useKb ? 1 : 1);
    s.steer = steer; s.steerFast = !useKb;
    s.throttle = Math.max(useKb ? this.kbThr : 0, padThr);
    s.brake = Math.max(useKb ? this.kbBrk : 0, padBrk);
    if (!useKb) { s.throttle = Math.max(s.throttle, this.kbThr); s.brake = Math.max(s.brake, this.kbBrk); }
    if (useTouch) { this.tThr = (this.tThr || 0) + clamp(this.touch.thr - (this.tThr || 0), -10 * dt, 5 * dt); this.tBrk = (this.tBrk || 0) + clamp(this.touch.brk - (this.tBrk || 0), -10 * dt, 8 * dt); s.throttle = Math.max(s.throttle, this.tThr); s.brake = Math.max(s.brake, this.tBrk); s.steerFast = false; }
    for (const [a, , kind] of ACTIONS) {
      if (kind !== 'button') continue;
      const tapped = (KEYMAP[a] || []).some((k) => this.hits.has(k));
      const tb = this.touch.btn[a]; if (tb === 1) this.touch.btn[a] = 0;
      const down = this.key(a) || padVal(a) > 0.5 || tb === 2 || (tb === 1 && !this.prev[a]);
      s[a] = down || tapped; s[a + 'Pressed'] = (down && !this.prev[a]) || (tapped && !this.prev[a]); this.prev[a] = down;
    }
    this.hits.clear();
    s.shiftUp = s.shiftUpPressed; s.shiftDown = s.shiftDownPressed; // one gear per press
    this.state = s;
    return s;
  }
  // binding capture: call begin, then tick each frame until it resolves
  beginCapture(action, kind, done) {
    const p = this.pad(); if (!p) { done(null, 'Connect a controller or wheel, then press any button on it.'); return; }
    this.capture = { action, kind, done, pad: p.id, rest: p.axes.slice(), btn: p.buttons.map((b) => b.value), best: null, t0: performance.now() };
  }
  tickCapture() {
    const c = this.capture; if (!c) return;
    const p = this.pads().find((q) => q.id === c.pad); if (!p) return;
    if (performance.now() - c.t0 > 8000) { this.capture = null; c.done(null, 'Nothing moved. Try again.'); return; }
    for (let i = 0; i < p.axes.length; i++) {
      const d = p.axes[i] - c.rest[i];
      if (Math.abs(d) > 0.45 && (!c.best || Math.abs(d) > Math.abs(c.best.d))) c.best = { i, d, v: p.axes[i] };
    }
    for (let i = 0; i < p.buttons.length; i++) if (p.buttons[i].value > 0.6 && c.btn[i] < 0.3) {
      this.capture = null; this.binds.padId = c.pad;
      const b = { type: 'button', index: i }; this.binds.map[c.action] = b; store.set('binds', this.binds); c.done(b); return;
    }
    if (c.best && Math.abs(p.axes[c.best.i] - c.best.v) < 0.05 && performance.now() - c.t0 > 400 && Math.abs(c.best.d) > 0.6) {
      this.capture = null; this.binds.padId = c.pad;
      const full = Math.sign(c.best.d) * Math.max(Math.abs(c.best.v), 0.95) * (Math.abs(c.best.v) > 0.95 ? 1 : 1);
      const b = { type: 'axis', index: c.best.i, rest: c.rest[c.best.i], full: Math.abs(c.best.v) > 0.98 ? Math.sign(c.best.v) : c.best.v };
      this.binds.map[c.action] = b; store.set('binds', this.binds); c.done(b);
    }
  }
  resetBinds() { this.binds = { pad: null, map: JSON.parse(JSON.stringify(PAD_DEFAULT)) }; store.set('binds', this.binds); }
}

const store = {
  get(k, d) { try { const v = localStorage.getItem('apexgp.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('apexgp.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

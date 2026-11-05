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
  build() {
    if (this.built) return; this.built = true;
    const el = document.createElement('div'); el.id = 'mwheel'; el.hidden = true;
    el.innerHTML = `<svg id="mw-svg" viewBox="-118 -74 236 148" aria-label="Steering wheel: press on it and turn with the mouse">
      <defs><linearGradient id="mw-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2e35"/><stop offset="1" stop-color="#121418"/></linearGradient>
      <pattern id="mw-carbon" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#16181c"/><path d="M0 0h3v3H0zM3 3h3v3H3z" fill="#1d2025"/></pattern></defs>
      <path d="M-70,-48 L70,-48 L84,-40 L92,-22 L100,-28 L108,-10 L104,30 L84,46 L58,54 L-58,54 L-84,46 L-104,30 L-108,-10 L-100,-28 L-92,-22 L-84,-40 Z" fill="url(#mw-carbon)" stroke="#454b55" stroke-width="2"/>
      <rect x="-114" y="-32" width="26" height="70" rx="12" fill="#0b0b0c" stroke="#26292e"/><rect x="88" y="-32" width="26" height="70" rx="12" fill="#0b0b0c" stroke="#26292e"/>
      <path d="M-112 -20h22M-112 -8h22M-112 4h22M-112 16h22M90 -20h22M90 -8h22M90 4h22M90 16h22" stroke="#1c1e22" stroke-width="2"/>
      <rect x="-42" y="-33" width="84" height="44" rx="5" fill="#050506" stroke="#2a2d33"/>
      ${[...Array(15)].map((_, k) => `<circle cx="${-49 + k * 7}" cy="-41" r="2.8" fill="${k < 5 ? '#22ff55' : k < 10 ? '#ff2222' : '#3a6bff'}" opacity="0.25" class="mw-led"/>`).join('')}
      <text id="mw-gear" x="0" y="-2" fill="#fff" font-size="28" font-weight="800" text-anchor="middle" font-family="Saira Condensed, Arial">1</text>
      <text id="mw-speed" x="0" y="7" fill="#9aa3ad" font-size="9" text-anchor="middle" font-family="JetBrains Mono, monospace">0</text>
      <circle cx="-64" cy="-17" r="6.5" fill="#f2f2f2"/><circle cx="-64" cy="1" r="6.5" fill="#f6c400"/><circle cx="64" cy="-17" r="6.5" fill="#b46bff"/><circle cx="64" cy="1" r="6.5" fill="#2b2b2b" stroke="#555"/>
      <circle cx="-24" cy="30" r="7" fill="#b8bec6"/><circle cx="0" cy="30" r="7" fill="#b8bec6"/><circle cx="24" cy="30" r="7" fill="#b8bec6"/>
      <circle cx="-50" cy="42" r="6" fill="#2bd46a"/><circle cx="50" cy="42" r="6" fill="#ff7a00"/>
      <rect x="-3" y="-74" width="6" height="12" rx="2" fill="#ffd21f"/>
    </svg><div id="mw-hint"></div>`;
    $('#hud').appendChild(el);
    this.el = el; this.svg = el.querySelector('#mw-svg'); this.leds = [...el.querySelectorAll('.mw-led')]; this.gearEl = el.querySelector('#mw-gear'); this.spdEl = el.querySelector('#mw-speed');
    // grab and turn: the angle of the pointer round the wheel's centre, relative to where it was grabbed
    let a0 = 0, s0 = 0, sid = null;
    const ang = (e) => { const r = el.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
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
    this.svg.style.transform = `rotate(${-this.steer * 100}deg)`;
    const g = P.reverse ? 'R' : String(P.gear); if (this.gearEl.textContent !== g) this.gearEl.textContent = g;
    const sp = String(Math.round(Math.max(0, P.vx) * (settings.units === 'mph' ? 2.237 : 3.6))); if (this.spdEl.textContent !== sp) this.spdEl.textContent = sp;
    const lit = Math.round(clamp((P.rpm - 9500) / (P.p.redline - 9500), 0, 1) * 15);
    if (lit !== this.lit) { this.lit = lit; this.leds.forEach((l, k) => l.setAttribute('opacity', k < lit ? 1 : 0.22)); }
    if (this.mode() === 'follow') this.el.classList.toggle('pedal', this.thrOn || this.brkOn);
  },
};

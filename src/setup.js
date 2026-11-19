// ==== Car setup: wings, suspension, alignment, differential, brakes, tyres and gearing =============================
// Every item is a step from 1 to 11 (6 is the standard car, which is the car the AI's speed profile is built for) and
// changes the physics (src/sim.js) through applySetup. Setups are kept per circuit; three presets (low, medium and high
// downforce) and the engineer's suggestion from what the car did on the last lap.
const SETUP_DEF = [
  // group, key, label, real units at step 1 and 11, unit, what more of it does
  ['Aero', 'fw', 'Front wing', 3, 13, '°', 'More front grip in fast corners (less understeer), a little more drag'],
  ['Aero', 'rw', 'Rear wing', 4, 14, '°', 'More rear grip in fast corners (stability) and more drag: lower top speed'],
  ['Suspension', 'sprF', 'Front springs', 90, 190, 'N/mm', 'Stiffer: sharper response, steadier aero, worse over kerbs and bumps, more understeer'],
  ['Suspension', 'sprR', 'Rear springs', 80, 170, 'N/mm', 'Stiffer: sharper response, steadier aero, worse over kerbs and bumps, more oversteer'],
  ['Suspension', 'arbF', 'Front anti-roll bar', 1, 11, '', 'Stiffer: more understeer in slow and medium corners, quicker turn-in'],
  ['Suspension', 'arbR', 'Rear anti-roll bar', 1, 11, '', 'Stiffer: more oversteer in slow and medium corners'],
  ['Suspension', 'rhF', 'Front ride height', 25, 45, 'mm', 'Lower: more downforce from the floor, but it bottoms out over kerbs and crests'],
  ['Suspension', 'rhR', 'Rear ride height', 60, 90, 'mm', 'Higher than the front (rake): more front balance at speed'],
  ['Alignment', 'camF', 'Front camber', -2.5, -3.5, '°', 'More negative: more front grip in corners, less under braking, hotter fronts, more wear'],
  ['Alignment', 'camR', 'Rear camber', -1.0, -2.0, '°', 'More negative: more rear grip in corners, less traction, hotter rears'],
  ['Alignment', 'toeF', 'Front toe-out', 0.0, 0.20, '°', 'More: sharper turn-in, more tyre wear'],
  ['Alignment', 'toeR', 'Rear toe-in', 0.10, 0.50, '°', 'More: a steadier rear, a little drag and wear'],
  ['Differential', 'diffOn', 'On-throttle diff', 50, 100, '%', 'More locking: better traction, but understeer on the power'],
  ['Differential', 'diffOff', 'Off-throttle diff', 50, 100, '%', 'More locking: steadier on entry, less rotation off the throttle'],
  ['Brakes', 'bias', 'Brake bias', 51, 61, '% front', 'More front: stable under braking, may lock the fronts; less: rotates, the rear can lock'],
  ['Brakes', 'press', 'Brake pressure', 90, 110, '%', 'Higher: shorter braking, but easier to lock'],
  ['Tyres', 'presF', 'Front tyre pressure', 21.0, 25.0, 'psi', 'Lower: more front grip, hotter, more wear'],
  ['Tyres', 'presR', 'Rear tyre pressure', 19.5, 23.5, 'psi', 'Lower: more rear grip and traction, hotter, more wear'],
  ['Gearing', 'final', 'Final drive', 1, 11, '', 'Longer: higher top speed, slower acceleration'],
];
const SETUP_STD = Object.fromEntries(SETUP_DEF.map((d) => [d[1], 6]));
const SETUP_PRESETS = {
  low: Object.assign({}, SETUP_STD, { fw: 3, rw: 2, rhF: 7, rhR: 6, final: 9, sprF: 7, sprR: 7 }),
  std: Object.assign({}, SETUP_STD),
  high: Object.assign({}, SETUP_STD, { fw: 10, rw: 10, rhF: 5, rhR: 6, final: 4, arbF: 5, camF: 8, camR: 7 }),
};
const Setup = {
  key(trackId) { return 'setup.' + trackId; },
  // the setup for a circuit: saved, else the standard car (older saves' four controls carried over once)
  get(trackId) {
    const saved = store.get(this.key(trackId), null);
    if (saved) return Object.assign({}, SETUP_STD, saved);
    const su = Object.assign({}, SETUP_STD);
    if (settings.setupWing) su.fw = su.rw = clamp(6 + settings.setupWing, 1, 11);
    if (settings.setupBias && settings.setupBias !== 56) su.bias = clamp(settings.setupBias - 50, 1, 11);
    if (settings.setupPress && settings.setupPress !== 'mid') su.presF = su.presR = settings.setupPress === 'low' ? 3 : 9;
    if (settings.setupGear && settings.setupGear !== 'mid') su.final = settings.setupGear === 'short' ? 3 : 9;
    return su;
  },
  save(trackId, su) { store.set(this.key(trackId), su); },
  real(d, v) { const x = d[3] + ((d[4] - d[3]) * (v - 1)) / 10; return Math.abs(d[4] - d[3]) >= 20 ? Math.round(x) : Math.abs(d[4] - d[3]) >= 2 ? x.toFixed(1) : x.toFixed(2); },
  label(d, v) { return d[5] ? `${this.real(d, v)} ${d[5]}` : `${v}`; },
  // the setup into the car's numbers (from the car's own base numbers, so it can be applied again any time)
  apply(P, su) {
    if (!P.pBase) P.pBase = Object.assign({}, P.p, { gears: P.p.gears.slice() });
    Object.assign(P.p, P.pBase, { gears: P.pBase.gears.slice() });
    const p = P.p, o = (k) => (su[k] ?? 6) - 6; // -5 .. +5 from standard
    // aero: each wing step ~1.25 % downforce; the rear wing carries most of the drag; the front/rear split moves the balance
    const rh = (o('rhF') + o('rhR')) / 2, sp = (o('sprF') + o('sprR')) / 2;
    p.ClA *= 1 + 0.0125 * (o('fw') + o('rw')) - 0.012 * rh + 0.004 * sp;
    p.CdA *= 1 + 0.006 * o('fw') + 0.016 * o('rw') + 0.002 * o('toeR');
    p.aeroBal += 0.007 * o('fw') - 0.007 * o('rw') - 0.004 * o('rhF') + 0.004 * o('rhR');
    p.bottomK = Math.max(0, -rh - 0.25 * sp) * 0.06; // too low (and too soft): the floor touches over kerbs and crests
    // roll stiffness split from the springs and anti-roll bars (the slow-corner balance)
    const KF = ROLL_F0 * (1 + 0.07 * o('arbF') + 0.035 * o('sprF')), KR = (1 - ROLL_F0) * (1 + 0.07 * o('arbR') + 0.035 * o('sprR'));
    p.rollF = KF / (KF + KR); p.rollTau = 0.09 * (1 - 0.035 * sp - 0.02 * (o('arbF') + o('arbR')) / 2);
    p.kerbMu = 0.92 - 0.012 * sp - 0.006 * Math.max(0, -rh) + 0.004 * Math.max(0, rh);
    // alignment: camber is cornering grip against braking / traction grip and heat; toe is response against wear
    p.mu *= 1 + 0.004 * o('camF') - 0.004 * o('presF'); p.muR *= (1 + 0.004 * o('camR') - 0.004 * o('presR')) / (1 + 0.004 * o('camF') - 0.004 * o('presF'));
    p.longF = 1 - 0.006 * o('camF'); p.longR = 1 - 0.006 * o('camR');
    p.BF *= 1 + 0.025 * o('toeF'); p.steerRate *= 1 + 0.03 * o('toeF'); p.BR *= 1 + 0.03 * o('toeR');
    // differential: locking 0 .. 1 (0.5 standard), and traction on the power
    p.diffOn = 0.5 + 0.08 * o('diffOn'); p.diffOff = 0.5 + 0.08 * o('diffOff'); p.tracR = 1 + 0.01 * o('diffOn') - 0.004 * o('camR') - 0.005 * o('presR');
    // brakes
    P.bias = (50 + su.bias) / 100; p.brakeMax *= 0.9 + 0.02 * (su.press - 1);
    // tyres: lower pressure and more camber run hotter and wear faster
    p.heatF = 1 - 0.05 * o('presF') + 0.03 * o('camF'); p.heatR = 1 - 0.05 * o('presR') + 0.03 * o('camR');
    P.setupWear = 1 - 0.035 * (o('presF') + o('presR')) / 2 + 0.03 * (o('camF') + o('camR')) / 2 + 0.03 * o('toeF') + 0.02 * o('toeR');
    // gearing: each final-drive step ~1.2 %
    p.gears = p.gears.map((v) => v * (1 + 0.012 * o('final')));
  },
  // balance from the setup alone: + oversteer, - understeer (slow corners: mechanical; fast: aero)
  balance(su) {
    const o = (k) => (su[k] ?? 6) - 6;
    const slow = -0.1 * (o('arbF') - o('arbR')) - 0.05 * (o('sprF') - o('sprR')) + 0.04 * (o('camF') - o('camR')) - 0.04 * (o('presF') - o('presR')) - 0.06 * o('diffOn') + 0.03 * o('toeF') - 0.03 * o('toeR');
    const fast = 0.12 * (o('fw') - o('rw')) + 0.05 * (o('rhR') - o('rhF')) + 0.12 * slow;
    return { slow: clamp(slow, -1, 1), fast: clamp(fast, -1, 1), speed: -(o('fw') + o('rw')) * 0.5 - o('rw') * 0.6 + o('final') * 0.6 - o('rhF') * 0.1 };
  },
  // what the setup does, in a sentence (the effect line under the setup)
  summary(su) {
    const b = this.balance(su), w = (su.fw + su.rw) / 2 - 6, parts = [];
    const bal = (x) => (Math.abs(x) < 0.12 ? 'neutral' : x > 0 ? (x > 0.45 ? 'strong oversteer' : 'a little oversteer') : x < -0.45 ? 'strong understeer' : 'a little understeer');
    parts.push(`slow corners: ${bal(b.slow)}`, `fast corners: ${bal(b.fast)}`);
    if (Math.abs(w) >= 1) parts.push(w > 0 ? `high downforce (about ${Math.round(w * 2.5)} km/h less top speed)` : `low downforce (about ${Math.round(-w * 2.5)} km/h more top speed)`);
    if ((su.rhF + su.rhR) / 2 < 4.5) parts.push('low ride height: watch the kerbs');
    return 'Balance: ' + parts.join(' · ') + '.';
  },
  // ---- the engineer: what the car did on a lap, and what to change ----------------------------------------------
  // samples every physics step: under/oversteer in slow (<160 km/h) and fast corners, lock-ups, wheelspin, tyre heat
  telemetry(P, dt) {
    const L = P.tele || (P.tele = { n: 0, usS: 0, usF: 0, osS: 0, osF: 0, lockF: 0, lockR: 0, spin: 0, tF: 0, tR: 0, bottom: 0, corner: 0, top: 0, lim: 0 });
    if (P.vx < 12 || P.pit) return;
    L.n += dt; const fast = P.vx > 44, c = Math.abs(P.ayR || P.ay || 0) > 12;
    if (c) { L.corner += dt; const us = (P.frontSat || 0) > 1.0 && (P.rearSat || 0) < 0.9, os = (P.rearSat || 0) > 1.0 && (P.frontSat || 0) < 1.0; if (us) L[fast ? 'usF' : 'usS'] += dt; if (os) L[fast ? 'osF' : 'osS'] += dt; }
    if (P.lockF) L.lockF += dt; if (P.lockR) L.lockR += dt; if (P.spin) L.spin += dt; if (P.bottoming) L.bottom += dt;
    L.tF += P.tempF * dt; L.tR += P.tempR * dt; L.top = Math.max(L.top, P.vx * 3.6);
    if (P.rpm > P.p.redline - 50 && P.gear === 8) L.lim += dt;
  },
  // one finding and its fix (or null): the biggest problem first
  advise(P) {
    const L = P.teleLast || P.tele; if (!L || L.n < 20 || !L.corner) return null;
    const su = this.get(App.session ? App.session.race.track.spec.id : settings.track), cp = COMPOUNDS[P.compound] || { temp: 95 };
    const f = (x) => x / L.corner, tF = L.tF / L.n, tR = L.tR / L.n, out = [];
    const step = (k, d) => { const v = clamp((su[k] ?? 6) + d, 1, 11); return v !== su[k] ? { [k]: v } : null; };
    if (f(L.usS) > 0.08) out.push([f(L.usS), 'Understeer in the slow corners', 'soften the front anti-roll bar', step('arbF', -2) || step('arbR', 2)]);
    if (f(L.osS) > 0.06) out.push([f(L.osS) * 1.2, 'The rear is loose in slow corners and on the exits', 'soften the rear anti-roll bar', step('arbR', -2) || step('arbF', 2)]);
    if (f(L.usF) > 0.06) out.push([f(L.usF), 'Understeer in the fast corners', 'add front wing', step('fw', 2)]);
    if (f(L.osF) > 0.05) out.push([f(L.osF) * 1.3, 'The rear is nervous in the fast corners', 'add rear wing', step('rw', 2)]);
    if (L.lockF / L.n > 0.012) out.push([L.lockF / L.n * 6, 'Locking the fronts under braking', 'move the brake bias back', step('bias', -2)]);
    if (L.lockR / L.n > 0.01) out.push([L.lockR / L.n * 6, 'Locking the rears under braking', 'move the brake bias forward', step('bias', 2)]);
    if (L.spin / L.n > 0.015) out.push([L.spin / L.n * 5, 'Wheelspin on the exits', 'lock the on-throttle differential more', step('diffOn', 2)]);
    if (L.bottom / L.n > 0.05) out.push([L.bottom / L.n * 2, 'The floor is hitting the ground', 'raise the ride height', Object.assign({}, step('rhF', 1), step('rhR', 1))]);
    if (tF > cp.temp + 14) out.push([0.15, 'The front tyres are running hot', 'raise the front pressures', step('presF', 2)]);
    if (tR > cp.temp + 14) out.push([0.15, 'The rear tyres are running hot', 'raise the rear pressures', step('presR', 2)]);
    if (L.lim > 1.5) out.push([0.2, 'On the rev limiter at the end of the straights', 'lengthen the final drive', step('final', 2)]);
    out.sort((a, b) => b[0] - a[0]);
    const best = out.find((o) => o[3]);
    if (!best) return { text: 'The car is well balanced. No changes needed.', change: null };
    return { text: `${best[1]}: ${best[2]}.`, change: best[3] };
  },
  // ---- the setup screen ----------------------------------------------------------------------------------------
  trackNow() { return App.session ? App.session.race.track.spec.id : settings.track; },
  build() {
    const root = $('#su-rows'); if (!root) return;
    const su = this.get(this.trackNow()); let html = '', grp = '';
    for (const d of SETUP_DEF) {
      if (d[0] !== grp) { grp = d[0]; html += `<h3>${grp}</h3>`; }
      html += `<div class="row su-row" title="${d[6]}"><label for="su-${d[1]}">${d[2]}</label><div class="ctl"><input id="su-${d[1]}" data-k="${d[1]}" type="range" min="1" max="11" step="1" value="${su[d[1]]}"><output>${this.label(d, su[d[1]])}</output></div><p class="hint su-hint">${d[6]}</p></div>`;
    }
    root.innerHTML = html;
    root.querySelectorAll('input[type=range]').forEach((el) => el.addEventListener('input', () => this.set({ [el.dataset.k]: +el.value })));
    this.sync();
  },
  set(change) {
    const id = this.trackNow(), su = Object.assign(this.get(id), change);
    if (App.session && !App.setupAllowed()) { Hud.flash(App.setupLockText()); this.sync(); return; }
    this.save(id, su); this.sync();
    if (App.session) { this.apply(App.session.race.player, su); Hud.flash('Car setup changed'); }
  },
  preset(k) { this.set(Object.assign({}, SETUP_PRESETS[k])); },
  sync() {
    const root = $('#su-rows'); if (!root) return;
    const id = this.trackNow(), su = this.get(id), spec = TRACKS.find((t) => t.id === id);
    for (const d of SETUP_DEF) { const el = $('#su-' + d[1]); if (!el) continue; el.value = su[d[1]]; el.nextElementSibling.textContent = this.label(d, su[d[1]]); }
    const b = this.balance(su), pct = (x) => `${50 + x * 50}%`;
    $('#su-bal-slow').style.left = pct(b.slow); $('#su-bal-fast').style.left = pct(b.fast);
    $('#su-effect').textContent = this.summary(su);
    $('#su-track').textContent = spec ? `Setup for ${spec.name}` : 'Setup';
    const lock = App.session && !App.setupAllowed(); $('#su-lock').hidden = !lock; if (lock) $('#su-lock').textContent = App.setupLockText();
    const P = App.session && App.session.race.player, adv = P && this.advise(P);
    $('#su-eng').hidden = !adv; if (adv) { $('#su-eng-text').textContent = 'Engineer: ' + adv.text; $('#su-eng-apply').hidden = !adv.change; this.pending = adv.change; }
  },
  init() {
    this.build();
    $('#su-reset').onclick = () => this.set(Object.assign({}, SETUP_STD));
    $$('[data-preset]').forEach((b) => (b.onclick = () => this.preset(b.dataset.preset)));
    $('#su-eng-apply').onclick = () => { if (this.pending) { this.set(this.pending); Hud.flash('Engineer\'s change applied'); } };
  },
};
function applySetup(P, trackId) { Setup.apply(P, Setup.get(trackId || (P.track && P.track.spec.id) || settings.track)); }

// Bike physics (docs/PLAN-bikes.md, phase 1): lean against cornering, the wheelie and stoppie limits, flick time, lap
// times against the F1 car on every circuit, top speed, and the crashes (too much lean, throttle or brake while leaned).
// usage: node test/bikephys.js [track,track,...]
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../src/data.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../src/sim.js'), 'utf8');
const m = { exports: {} }; new Function('module', src)(m); const S = m.exports, G = 9.81;
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
const tm = S.TEAMS[3], dt = 1 / 240;
const mk = (T, opts = {}) => { const b = new S.Bike(S.bikeTrack(T), tm, tm.drivers[0], opts); b.tempF = b.tempR = 95; return b; };
const straight = (T) => { // the longest stretch of nearly straight track
  let best = 0, bi = 0, run = 0; for (let k = 0; k < T.n * 2; k++) { const i = k % T.n; if (Math.abs(T.lineK[i]) < 1 / 2000) { run++; if (run > best) { best = run; bi = (i - run + 1 + T.n) % T.n; } } else run = 0; }
  return { i: bi, len: Math.min(best, T.n) * T.ds };
};
const T0 = S.buildTrack(S.TRACKS.find((t) => t.id === 'silver'));
const st = straight(T0);
// --- wheelie: anti-wheelie off, full throttle from 60 km/h on the straight
{ const b = mk(T0, { assist: { aw: false, tc: 0 } }); b.place(st.i, 0, 60 / 3.6); let axAt = null, t = 0;
  while (t < 3 && axAt === null) { b.step(dt, { throttle: 1, brake: 0, lean: 0 }); t += dt; if (b.wheelie > 0.02) axAt = b.axS; }
  ok(axAt !== null && Math.abs(axAt / G - 1.15) < 0.12, `wheelie: the front lifts at ${(axAt / G).toFixed(2)} g (target about 1.15 g)`);
  const b2 = mk(T0); b2.place(st.i, 0, 60 / 3.6); let maxW = 0; for (let t2 = 0; t2 < 3; t2 += dt) { b2.step(dt, { throttle: 1, brake: 0, lean: 0 }); maxW = Math.max(maxW, b2.wheelie); }
  ok(maxW < 0.05, `anti-wheelie on: the front stays down (${(maxW * 57.3).toFixed(1)} degrees at most)`); }
// --- stoppie: ABS and combined brakes off, full front brake from 200 km/h
{ const b = mk(T0, { assist: { abs: false, comb: false } }); b.place(st.i, 0, 200 / 3.6); let at = null;
  for (let t = 0; t < 3 && at === null; t += dt) { b.step(dt, { throttle: 0, brake: Math.min(1, t / 1.5), lean: 0 }); if (b.stoppie > 0.005 || b.down) at = b.down ? 'crash' : -b.axTyre; } // the brake squeezed on over 1.5 s
  ok(typeof at === 'number' && at / G > 1.3 && at / G < 1.55, `stoppie: the rear lifts at ${typeof at === 'number' ? (at / G).toFixed(2) + ' g' : at} of braking (target 1.3-1.55 g)`);
  const b2 = mk(T0); b2.place(st.i, 0, 200 / 3.6); let maxS = 0, peak = 0; for (let t = 0; t < 2.5 && b2.vx > 8; t += dt) { b2.step(dt, { throttle: 0, brake: 1, lean: 0 }); maxS = Math.max(maxS, b2.stoppie); peak = Math.max(peak, -b2.axS); }
  ok(maxS < 0.05 && !b2.down && peak / G > 1.2, `ABS on: hard braking (${(peak / G).toFixed(2)} g peak) keeps the rear down`); }
// --- flick: full lean left to full lean right at 120 km/h
{ const b = mk(T0); b.place(st.i, 0, 120 / 3.6); b.lean = 0.8; let t = 0; while (b.lean > -0.75 && t < 3) { b.step(dt, { throttle: 0.4, brake: 0, lean: -0.8 }); b.x = T0.px[st.i]; b.y = T0.py[st.i]; b.h = Math.atan2(T0.ty[st.i], T0.tx[st.i]); t += dt; }
  ok(t > 0.65 && t < 0.95, `flick: full lean one way to the other in ${t.toFixed(2)} s at 120 km/h (target 0.7-0.9 s)`); }
// --- laps on every circuit: the bot rider against the F1 car's reference lap
const ids = process.argv[2] ? process.argv[2].split(',') : S.TRACKS.map((t) => t.id);
let vmax = 0, crashes = 0, ratios = [];
for (const id of ids) {
  const T = S.buildTrack(S.TRACKS.find((t) => t.id === id)), ref = S.referenceLap(T);
  const b = mk(T), ai = new S.AIDriver(b, 1.0, 7); ai.pace = 1; ai.noise = 0; ai.noiseT = 1e9;
  const BT = b.track; b.place(T.n - 40, T.lineO[T.n - 40], BT.lineV[T.n - 40] * 0.9); b.dist = b.s - T.length;
  let t = 0, t0 = null, lv = 0, leanErr = [], maxLean = 0;
  while (t < 500) {
    b.step(dt, ai.control(dt, [b], null)); t += dt; if (b.down) { crashes++; console.log('    crash', id, b.down.kind, 'at', b.idx, (b.down.speed * 3.6).toFixed(0), 'km/h'); break; }
    if (t0 === null && b.dist >= 0) t0 = t;
    if (t0 !== null) { lv = Math.max(lv, b.vx); maxLean = Math.max(maxLean, Math.abs(b.lean)); if (Math.abs(b.lean) > 0.3 && Math.abs(b.slideYaw) < 0.02 && !b.lockF) leanErr.push(Math.abs(Math.abs(b.ay) / (G * Math.tan(Math.abs(b.lean))) - 1)); }
    if (t0 !== null && b.dist >= T.length) break;
  }
  const lap = t - t0, ratio = lap / ref; ratios.push(ratio); vmax = Math.max(vmax, lv);
  const le = leanErr.length ? leanErr.reduce((a, c) => a + c, 0) / leanErr.length : 0;
  console.log(`    ${id.padEnd(10)} bike ${lap.toFixed(2)} s, F1 ${ref.toFixed(2)} s, +${((ratio - 1) * 100).toFixed(0)}%, top ${(lv * 3.6).toFixed(0)} km/h, max lean ${(maxLean * 57.3 + 6).toFixed(0)} deg (bike), lean fit ${(le * 100).toFixed(1)}%`);
  ok(!b.down && ratio > 1.19 && ratio < 1.37, `${id}: bike lap ${((ratio - 1) * 100).toFixed(0)}% slower than the F1 car (target 20-35%; real gaps are 25-35%)`);
  ok(le < 0.03, `${id}: cornering matches the lean (g * tan lean) within 3%`);
}
if (!process.argv[2]) ok(vmax * 3.6 > 330 && vmax * 3.6 < 366, `top speed ${(vmax * 3.6).toFixed(0)} km/h on the longest straight (target 340-365)`);
// --- crashes
const T1 = T0;
const tryCrash = (opts, setup, inp, secs = 2.5) => { const b = mk(T1, opts); b.place(st.i, 0, setup.v / 3.6); Object.assign(b, setup.state || {}); if (setup.env) b.env = setup.env; for (let t = 0; t < secs && !b.down; t += dt) { b.step(dt, inp); b.x = T1.px[st.i]; b.y = T1.py[st.i]; b.h = Math.atan2(T1.ty[st.i], T1.tx[st.i]); } return b.down ? b.down.kind : null; };
let k = tryCrash({}, { v: 150, env: { wet: 0.7 } }, { throttle: 0.5, brake: 0, lean: 0.95 });
ok(!!k, `too much lean on slicks in the wet: down (${k})`);
k = tryCrash({}, { v: 150, state: { tempF: 30, tempR: 30 } }, { throttle: 0.5, brake: 0, lean: 1.0 });
ok(!!k, `full lean on cold tyres: down (${k})`);
k = tryCrash({ assist: { tc: 0, aw: false } }, { v: 90, state: { lean: 0.85, gear: 2 } }, { throttle: 1, brake: 0, lean: 0.85 });
ok(!!k, `full throttle while leaned, traction control off: down (${k})`);
k = tryCrash({ assist: { tc: 2 } }, { v: 90, state: { lean: 0.85, gear: 2 } }, { throttle: 1, brake: 0, lean: 0.85 });
ok(!k, `the same with traction control on: stays up`);
k = tryCrash({ assist: { abs: false } }, { v: 150, state: { lean: 0.8 } }, { throttle: 0, brake: 1, lean: 0.8 });
ok(!!k, `grabbing the front brake while leaned, ABS off: down (${k})`);
ok(crashes === 0, `no crashes on normal bot laps (${crashes})`);
// --- remount: a crash at low speed, the rider gets back on
{ const b = mk(T1); b.place(st.i, 0, 80 / 3.6); b.crash('lowside'); let t = 0; while (b.down && t < 40) { b.step(dt, { throttle: 0, brake: 0 }); t += dt; }
  ok(!b.down && !b.dnf && t > 4 && t < 25, `remount after an 80 km/h lowside: back on the bike after ${t.toFixed(1)} s`); }
{ const b = mk(T1, { remount: false }); b.place(st.i, 0, 80 / 3.6); b.crash('lowside'); for (let t = 0; t < 30; t += dt) b.step(dt, { throttle: 0, brake: 0 }); ok(b.dnf === 'Crashed', '"Crash ends race": out of the race'); }
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);

// Car setup physics (headless): the standard setup leaves the car unchanged; the presets and a few extreme setups keep it
// driveable (AI driving: lap times, top speed, spins); the balance items move the balance the right way.
// usage: node test/setupphys.js
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '../src/');
const src = ['data.js', 'sim.js', 'setup.js'].map((f) => fs.readFileSync(R + f, 'utf8')).join('\n');
const m = { exports: {} };
new Function('module', 'store', 'settings', '$', '$$', 'App', 'Hud', src + '\nmodule.exports={buildTrack,TRACKS,Race,AIDriver,TEAMS,Setup,SETUP_STD,SETUP_PRESETS};')(m, { get: () => null, set() {} }, {}, () => null, () => [], {}, {});
const S = m.exports;
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
function run(tid, su, laps = 2, skill = 1.0) {
  const T = S.buildTrack(S.TRACKS.find((t) => t.id === tid));
  const race = new S.Race(T, { mode: 'practice', laps: 3, opponents: 0, team: S.TEAMS[0], driver: S.TEAMS[0].drivers[0], assist: { tc: 1, abs: true, autoGear: true } });
  const P = race.player; if (su) S.Setup.apply(P, su);
  const ai = new S.AIDriver(P, skill, 5); let top = 0, spins = 0, was = false, fs = 0, rs = 0, n = 0;
  for (let k = 0; k < 360 * 300 && P.lapTimes.length < laps; k++) {
    const c = ai.control(1 / 360, race.cars, race); race.step(1 / 360, c); top = Math.max(top, P.vx * 3.6);
    const sp = Math.abs(Math.atan2(P.vy, Math.max(0.1, P.vx))) > 0.6 && P.vx > 5; if (sp && !was) spins++; was = sp;
    if (P.vx > 15 && Math.abs(P.ay) > 12) { fs += P.frontSat; rs += P.rearSat; n++; }
  }
  return { laps: P.lapTimes.map((t) => +t.toFixed(2)), top: Math.round(top), spins, bal: +(fs / n - rs / n).toFixed(3) };
}
for (const tid of ['silver', 'riviera', 'parco']) {
  const base = run(tid, null), std = run(tid, S.SETUP_STD);
  ok(JSON.stringify(base.laps) === JSON.stringify(std.laps), `${tid}: the standard setup changes nothing (${base.laps.join(' ')})`);
  // the AI drives from the standard car's speed profile: a little margin for the presets
  const b9 = run(tid, null, 2, 0.9); // slides counted the same way for the standard car (Riviera's hairpins count some)
  for (const k of ['low', 'high']) { const r = run(tid, S.SETUP_PRESETS[k], 2, 0.9); ok(r.spins <= Math.ceil(b9.spins * 1.35) + 1 && r.laps.length === 2, `${tid}: ${k} downforce preset: laps ${r.laps.join(' ')}, top ${r.top} km/h (standard ${base.top}), big slides ${r.spins} (standard ${b9.spins})`); }
  // balance: front anti-roll bar stiff = more front saturation relative to the rear (understeer)
  const us = run(tid, Object.assign({}, S.SETUP_STD, { arbF: 11, arbR: 1 }), 1), os = run(tid, Object.assign({}, S.SETUP_STD, { arbF: 1, arbR: 11 }), 1);
  ok(us.bal > os.bal, `${tid}: anti-roll bars move the balance (stiff front ${us.bal}, stiff rear ${os.bal}; + = understeer)`);
}
const lo = run('silver', S.SETUP_PRESETS.low), hi = run('silver', S.SETUP_PRESETS.high);
ok(lo.top > hi.top + 8, `top speed: low downforce ${lo.top} km/h vs high ${hi.top} km/h`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);

// Graphics plan, phase 4 (docs/PLAN-visuals.md): hills, crests, compressions and banking, checked in the simulation
// itself (no browser): the road is continuous and the pit straight level; a car holds on a slope with the brakes and
// rolls back without them; climbing costs speed and descending adds it; a crest lightens the car and a compression
// loads it; banking makes a corner faster; full AI races still finish.  usage: node test/hills.js
const fs = require('fs'), path = require('path');
const load = (dataSrc) => { const src = (dataSrc || fs.readFileSync(path.join(__dirname, '../src/data.js'), 'utf8')) + '\n' + fs.readFileSync(path.join(__dirname, '../src/sim.js'), 'utf8'); const m = { exports: {} }; new Function('module', src + '\nmodule.exports={buildTrack,TRACKS,Race,AIDriver,TEAMS,pitLane,roadAt,roadZ,ELEV};')(m); return m.exports; };
const S = load();
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
const seedRandom = (s) => { Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647); };

// ---- the road: continuous, slopes within limits, level pit straight, the planned height ranges
for (const spec of S.TRACKS) {
  const T = S.buildTrack(spec), n = T.n, PL = S.pitLane(T);
  let step = 0, grade = 0, lo = 1e9, hi = -1e9;
  for (let i = 0; i < n; i++) { step = Math.max(step, Math.abs(T.h[(i + 1) % n] - T.h[i])); grade = Math.max(grade, Math.abs(T.grade[i])); lo = Math.min(lo, T.h[i]); hi = Math.max(hi, T.h[i]); }
  let pit = 0; for (let s = PL.mainStart; s <= PL.mainEnd; s += T.ds) pit = Math.max(pit, Math.abs(T.h[PL.idx(s)]));
  ok(T.hasElev && step < 0.45 && grade <= 0.185 && pit < 0.01, `${spec.id.padEnd(10)} height ${lo.toFixed(0)}..${hi.toFixed(0)} m, steepest ${(grade * 100).toFixed(1)} %, biggest step between samples ${step.toFixed(2)} m, pit straight level (${pit.toFixed(3)} m)`);
}
{ const T = S.buildTrack(S.TRACKS.find((t) => t.id === 'ardenne')); let lo = 1e9, hi = -1e9; for (const h of T.h) { lo = Math.min(lo, h); hi = Math.max(hi, h); } ok(hi - lo > 70, 'Ardenne climbs and falls about 90 m (' + (hi - lo).toFixed(0) + ' m)'); }

// a car on a chosen sample, pointing along the track (dir 1) or against it (-1)
const T = S.buildTrack(S.TRACKS.find((t) => t.id === 'ardenne'));
let steep = 0; for (let i = 0; i < T.n; i++) if (T.grade[i] > T.grade[steep]) steep = i;
const place = (i, dir, v = 0) => {
  seedRandom(3);
  const race = new S.Race(T, { mode: 'trial', laps: 3, opponents: 0, team: S.TEAMS[0], driver: S.TEAMS[0].drivers[0], assist: { tc: 2, abs: true, autoGear: true }, damage: 'off' });
  const P = race.player; race.lightsOutAt = 0; race.phase = 'green';
  P.x = T.px[i]; P.y = T.py[i]; P.h = Math.atan2(T.ty[i], T.tx[i]) + (dir < 0 ? Math.PI : 0); P.vx = v; P.vy = 0; P.r = 0; P.idx = i; P.locate(true);
  return { race, P };
};
const run = (race, inp, secs) => { for (let k = 0; k < secs * 360; k++) race.player.step(1 / 360, inp); };

// ---- at rest on the steepest climb (Ardenne's long hill)
{
  const { race, P } = place(steep, 1); const x0 = P.x, y0 = P.y;
  run(race, { steer: 0, throttle: 0, brake: 1, noReverse: true }, 3);
  const held = Math.hypot(P.x - x0, P.y - y0);
  run(race, { steer: 0, throttle: 0, brake: 0, noReverse: true }, 3);
  const back = (P.x - x0) * T.tx[steep] + (P.y - y0) * T.ty[steep];
  ok(held < 0.05, `on a ${(T.grade[steep] * 100).toFixed(0)} % slope the brakes hold the car (moved ${held.toFixed(3)} m)`);
  ok(back < -1, `brakes off: it rolls back down (${back.toFixed(1)} m in 3 s)`);
}
// ---- climbing costs speed, descending adds it (same start speed, full throttle, 2 s)
{
  const a = place(steep, 1, 40), b = place(steep, -1, 40);
  run(a.race, { steer: 0, throttle: 1, brake: 0 }, 1.5); run(b.race, { steer: 0, throttle: 1, brake: 0 }, 1.5);
  ok(b.P.vx > a.P.vx + 1.5, `full throttle from 144 km/h for 1.5 s: uphill ${(a.P.vx * 3.6).toFixed(0)} km/h, downhill ${(b.P.vx * 3.6).toFixed(0)} km/h`);
}
// ---- crests and compressions: the load on the tyres follows the road's curve
{
  let crest = 0, comp = 0; for (let i = 0; i < T.n; i++) { if (T.kv[i] < T.kv[crest]) crest = i; if (T.kv[i] > T.kv[comp]) comp = i; }
  const c = place(crest, 1, 60), d = place(comp, 1, 60);
  run(c.race, { steer: 0, throttle: 0.6, brake: 0 }, 1 / 360); run(d.race, { steer: 0, throttle: 0.6, brake: 0 }, 1 / 360);
  ok(c.P.loadK < 0.9 && d.P.loadK > 1.2, `at 216 km/h: over a crest the car weighs ${(c.P.loadK * 100).toFixed(0)} % of normal, in a compression ${(d.P.loadK * 100).toFixed(0)} %`);
}
// ---- banking: Lakeside's banked corners make the lap faster than the same circuit without banking
{
  const solo = (Sx) => {
    const TT = Sx.buildTrack(Sx.TRACKS.find((t) => t.id === 'lakeside')); seedRandom(5);
    const race = new Sx.Race(TT, { mode: 'trial', laps: 3, opponents: 0, team: Sx.TEAMS[0], driver: Sx.TEAMS[0].drivers[0], assist: { tc: 2, abs: true, autoGear: true }, damage: 'off' });
    const P = race.player, ai = new Sx.AIDriver(P, 1.0, 7); P.isPlayer = false; race.lightsOutAt = 0;
    for (let t = 0; t < 300 && P.lapTimes.length < 2; t += 1 / 360) race.step(1 / 360, ai.control(1 / 360, race.cars, race));
    return P.lapTimes[1];
  };
  const flatSrc = fs.readFileSync(path.join(__dirname, '../src/data.js'), 'utf8').replace(/bank: \[\[0\.027[^\]]*\][^\n]*\]\]/, 'nobank: 1');
  const banked = solo(S), flat = solo(load(flatSrc));
  ok(banked < flat - 0.5 && banked > flat - 4, `Lakeside lap with banking ${banked.toFixed(2)} s, without ${flat.toFixed(2)} s`);
}
// ---- full AI races on the hilliest circuits: everyone finishes (or nearly)
for (const [id, seed] of (process.env.QUICK ? [] : [['ardenne', 1], ['lakeside', 3], ['lonestar', 3], ['riviera', 1]])) {
  const TT = S.buildTrack(S.TRACKS.find((t) => t.id === id)); seedRandom(seed);
  const race = new S.Race(TT, { mode: 'race', laps: 3, opponents: 21, team: S.TEAMS[3], driver: S.TEAMS[3].drivers[0], gridSlot: 21, assist: { tc: 2, abs: true, autoGear: true }, damage: 'real' });
  const pai = new S.AIDriver(race.player, 0.96, 99); race.player.isPlayer = false;
  let t = 0; while (t < 600) { race.step(1 / 360, pai.control(1 / 360, race.cars, race)); t += 1 / 360; if (race.finishOrder.length >= race.cars.length - race.cars.filter((c) => c.dnf).length && race.finishOrder.length > 0) break; }
  const dnf = race.cars.filter((c) => c.dnf).length;
  ok(race.finishOrder.length >= 19 && dnf <= 3, `${id}: a 3-lap, 22-car AI race: ${race.finishOrder.length} finish, ${dnf} retire, ${t.toFixed(0)} s`);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);

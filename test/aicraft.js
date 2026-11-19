// AI racecraft numbers (headless): a 22-car race per circuit. Counts clean overtakes (a pass that sticks for 3 s), car
// contacts by kind (from behind / side by side), wall hits, mistakes, pit stops and how they were decided.
// usage: node test/aicraft.js [tracks] [laps]   (SIM=path to compare another sim.js)
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../src/data.js'), 'utf8') + '\n' + fs.readFileSync(process.env.SIM || path.join(__dirname, '../src/sim.js'), 'utf8');
const m = { exports: {} }; new Function('module', src + '\nmodule.exports={buildTrack,TRACKS,Race,AIDriver,TEAMS};')(m); const S = m.exports;
const tracks = (process.argv[2] || 'parco,silver,riviera').split(','), laps = +(process.argv[3] || 4);
function run(id, seed0) {
  const T = S.buildTrack(S.TRACKS.find((t) => t.id === id));
  let seed = seed0; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const race = new S.Race(T, { mode: 'race', laps, opponents: 21, team: S.TEAMS[3], driver: S.TEAMS[3].drivers[0], gridSlot: 21, assist: { tc: 2, abs: true, autoGear: true }, damage: 'real', seed: seed0 });
  const pai = new S.AIDriver(race.player, 0.96, 99); race.player.isPlayer = false;
  const was = new Map(); let t = 0, k = 0, rear = 0, side = 0, wall = 0, mistakes = 0, passes = 0, stops = 0; const pend = [];
  let prev = null;
  while (t < laps * 130) {
    race.step(1 / 360, pai.control(1 / 360, race.cars, race)); t += 1 / 360; k++;
    for (const c of race.cars) {
      const hit = c.impact > 4;
      if (hit && !was.get(c)) {
        let other = null, bd = 9; for (const o of race.cars) { if (o === c) continue; const dd = Math.hypot(o.x - c.x, o.y - c.y); if (dd < bd) { bd = dd; other = o; } }
        if (!other || bd > 7.5) wall++; else if (c.dist < other.dist) { const ds = other.dist - c.dist; if (ds > 3.8 && Math.abs(other.d - c.d) < 1.6) rear++; else side++; }
      }
      was.set(c, hit);
    }
    for (const a of race.ais) if (a.errT > 0 && !a._e) { a._e = true; mistakes++; } else if (a.errT <= 0) a._e = false;
    if (k % 90 === 0 && race.phase === 'green' && race.greenT > 15) {
      const ord = race.standings().filter((c) => !c.finished && !c.pit && !c.dnf);
      if (prev) for (let i = 0; i < ord.length; i++) { const c = ord[i], pi = prev.indexOf(c); if (pi > i && pi - i <= 2) pend.push({ c, by: prev[i], t, at: i }); }
      // a pass counts when it still holds 3 s later
      for (let j = pend.length - 1; j >= 0; j--) { const p = pend[j]; if (t - p.t >= 3) { const a = ord.indexOf(p.c), b = ord.indexOf(p.by); if (a >= 0 && b >= 0 && a < b) passes++; pend.splice(j, 1); } }
      prev = ord;
    }
    if (race.finishOrder.length >= race.cars.length - race.cars.filter((c) => c.dnf).length && race.finishOrder.length > 0) break;
  }
  race.cars.forEach((c) => (stops += c.stops || 0));
  return { passes, rear, side, wall, mistakes, stops, dnf: race.cars.filter((c) => c.dnf).length, t: Math.round(t), why: race.stratLog || null, plans: race.cars.slice(0, 4).map((c) => race.planText(race.planStrategy(c, 1))) };
}
const tot = {};
for (const id of tracks) for (const s of [1, 2]) {
  const r = run(id, s); console.log(`${id.padEnd(8)} seed ${s}: clean passes ${r.passes} | contacts from behind ${r.rear}, side by side ${r.side} | wall ${r.wall} | mistakes ${r.mistakes} | stops ${r.stops} | DNF ${r.dnf} | ${r.t} s`);
  for (const k of ['passes', 'rear', 'side', 'wall', 'mistakes', 'stops', 'dnf']) tot[k] = (tot[k] || 0) + r[k];
}
console.log('TOTAL', JSON.stringify(tot));
// strategy: a 20-lap race at Silverwood (two compounds, tyres that need managing), and one with a Safety Car
{
  const T = S.buildTrack(S.TRACKS.find((t) => t.id === 'silver'));
  let seed = 3; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const race = new S.Race(T, { mode: 'race', laps: 20, opponents: 21, team: S.TEAMS[3], driver: S.TEAMS[3].drivers[0], gridSlot: 21, assist: { tc: 2, abs: true, autoGear: true }, damage: 'real', seed: 3 });
  const pai = new S.AIDriver(race.player, 0.96, 99); race.player.isPlayer = false;
  console.log('plans at the start:', race.cars.slice(0, 5).map((c) => `${c.driver.code} ${c.compound}: ${race.planText(c.plan)}`).join(' | '));
  let t = 0, scDone = false;
  while (t < 20 * 115 && !(race.finishOrder.length && race.finishOrder.length >= race.cars.length - race.cars.filter((c) => c.dnf).length)) {
    race.step(1 / 360, pai.control(1 / 360, race.cars, race)); t += 1 / 360;
    if (!scDone && race.leader() && race.leader().lap === 9 && race.phase === 'green') { scDone = true; race.rc = race.rc || { yellowUntil: [0, 0, 0], vscCool: 0, blueT: 0, vscWarn: 0, over: 0 }; race.deploySC(); console.log('safety car on lap 9'); }
  }
  const why = {}; race.stratLog.forEach((e) => (why[e.why] = (why[e.why] || 0) + 1));
  console.log('stops by reason:', JSON.stringify(why), '| total stops', race.cars.reduce((a, c) => a + c.stops, 0), '| two compounds used by all AI finishers:', race.cars.filter((c) => c.finished && c !== race.player).every((c) => new Set(c.usedCompounds || [c.compound]).size > 1), '| finished', race.finishOrder.length, '| t', Math.round(t));
}

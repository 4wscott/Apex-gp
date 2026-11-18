// A full bike race in the simulation (docs/PLAN-bikes.md, phase 4): 22 bikes, every circuit, dry (and RAIN=1 wet).
// Checks: nothing invalid (NaN), every bike finishes or is out with a reason, realistic crash numbers, sensible gaps.
// usage: node test/bikerace.js [track,track] [laps]
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../src/data.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../src/sim.js'), 'utf8');
const m = { exports: {} }; new Function('module', src)(m); const S = m.exports;
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
const ids = process.argv[2] ? process.argv[2].split(',') : S.TRACKS.map((t) => t.id), laps = +(process.argv[3] || 3), wet = !!process.env.RAIN;
let totalCrash = 0, races = 0, L1 = 0, LN = 0;
for (const id of ids) {
  const T = S.buildTrack(S.TRACKS.find((t) => t.id === id)), tm = S.BIKE_TEAMS[0];
  const race = new S.Race(T, { mode: 'race', laps, opponents: 21, team: tm, driver: tm.drivers[0], gridSlot: 10, aiPace: 1, series: 'bike', weather: wet ? 'rain' : 'dry', damage: 'real', assist: { tc: 2, abs: true, autoGear: true } });
  const P = race.player, ai = new S.AIDriver(P, 1, 99); P.isPlayer = false; // the "player" is a bot here
  if (!race.cars.every((c) => S.BIKE_TEAMS.includes(c.team) || c === P)) ok(false, 'the field is the bike championship')
  const dt = 1 / 120; let t = 0, nan = null, lap1 = 0; const crashes = []; const seen = new Set();
  race.lightsT = race.lightsOutAt - 0.01;
  while (t < laps * 200 && !race.cars.every((c) => c.finished || c.dnf)) {
    race.step(dt, ai.control(dt, race.cars, race)); t += dt;
    for (const c of race.cars) {
      if (!nan && !(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.vx) && Number.isFinite(c.lean))) nan = `${c.driver.code} at ${t.toFixed(1)} s`;
      if (c.down && !seen.has(c.down)) { seen.add(c.down); crashes.push(`${c.driver.code} ${c.down.kind} ${(c.down.speed * 3.6).toFixed(0)} km/h @${c.idx} L${c.lap}`); if (c.lap <= 1) lap1++; }
    }
    if (nan) break;
  }
  const fin = race.cars.filter((c) => c.finished).length, out = race.cars.filter((c) => c.dnf).length, st = race.standings ? race.standings() : race.cars;
  const lead = st[0], last = st.filter((c) => c.finished).slice(-1)[0];
  console.log(`    ${id.padEnd(10)} ${t.toFixed(0)} s, finished ${fin}, out ${out}, crashes ${crashes.length}${crashes.length ? ': ' + crashes.slice(0, 4).join('; ') : ''}`);
  ok(!nan, `${id}: no invalid numbers${nan ? ' (' + nan + ')' : ''}`);
  ok(fin + out === race.cars.length, `${id}: every bike finished or is out (${fin} + ${out} of ${race.cars.length})`);
  const later = crashes.length - lap1; L1 += lap1; LN += later;
  ok(lap1 <= (wet ? 6 : 4), `${id}: ${lap1} crashes on the opening lap (the pack together: a few happen in real racing)`);
  ok(later <= (wet ? 4 : 2) * (laps - 1) / 2, `${id}: ${later} crashes in the ${laps - 1} laps after (target about one in two laps for the field, 0-3 in a full race)`);
  const kinds = {}; crashes.forEach((c) => { const k = c.split(' ')[1]; kinds[k] = (kinds[k] || 0) + 1; }); console.log('      by kind', JSON.stringify(kinds));
  totalCrash += crashes.length; races++;
}
console.log(`    ${totalCrash} crashes in ${races} races: ${L1} on opening laps, ${LN} after`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);

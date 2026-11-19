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
// the Long Lap: a rider given one rides the lane and it is served (circuits with a lane), or 3 s are added
{
  let served = 0, tried = 0;
  for (const id of ['silver', 'sakhir', 'baia', 'lonestar']) {
    const T = S.buildTrack(S.TRACKS.find((t) => t.id === id)), tm = S.BIKE_TEAMS[0];
    const race = new S.Race(T, { mode: 'race', laps: 4, opponents: 0, team: tm, driver: tm.drivers[0], series: 'bike', weather: 'dry' });
    const P = race.player, ai = new S.AIDriver(P, 1, 5); race.lightsT = race.lightsOutAt - 0.01;
    let msgs = []; race.emit = ((e0) => (type, ev) => { if (type === 'msg') msgs.push(ev.text); })(race.emit);
    for (let t = 0; t < 30; t += 1 / 120) race.step(1 / 120, ai.control(1 / 120, race.cars, race));
    P.longLapDue = P.lap + 3; tried++; let t = 0;
    while (P.longLapDue && t < 400 && !P.down) { race.step(1 / 120, ai.control(1 / 120, race.cars, race)); t += 1 / 120; }
    const ok1 = !P.longLapDue && msgs.includes('Long Lap served'); if (ok1) served++;
    console.log(`    ${id}: Long Lap ${ok1 ? 'served after ' + t.toFixed(0) + ' s' : 'not served (' + (P.down ? 'crashed' : msgs.slice(-1)[0]) + ')'}`);
  }
  ok(served === tried, `Long Lap: the lane can be ridden and the penalty is served (${served} of ${tried} circuits)`);
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
}
// flag to flag: rain arrives mid-race, riders come in and swap to the wet bike
{
  const T = S.buildTrack(S.TRACKS.find((t) => t.id === 'silver')), tm = S.BIKE_TEAMS[0];
  const race = new S.Race(T, { mode: 'race', laps: 6, opponents: 11, team: tm, driver: tm.drivers[0], series: 'bike', weather: 'dry' });
  const P = race.player, ai = new S.AIDriver(P, 1, 5); P.isPlayer = false; race.lightsT = race.lightsOutAt - 0.01;
  let t = 0; while (t < 260) { race.step(1 / 120, ai.control(1 / 120, race.cars, race)); t += 1 / 120; if (t > 60) { race.env.rain = 1; race.env.wet = Math.min(1, race.env.wet + 0.004 / 120 * 60); } }
  const swapped = race.cars.filter((c) => S.COMPOUNDS[c.compound].wet).length, crashed = race.cars.filter((c) => c.crashes > 0).length;
  console.log(`    flag to flag: ${swapped} of ${race.cars.length} on the wet bike after the rain, ${crashed} crashed, track wetness ${race.env.wet.toFixed(2)}`);
  ok(swapped >= race.cars.length - 2, `flag to flag: when it rains the riders swap to the wet bike (${swapped} of ${race.cars.length})`);
}
process.exit(fails ? 1 : 0);

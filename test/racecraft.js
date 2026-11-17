// a 22-car AI race: overtakes, contacts, recoveries, mistakes, finishers. usage: node test/racecraft.js [track] [seed] (SIM=path to compare another sim.js)
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '../src/data.js'), 'utf8') + '\n' + fs.readFileSync(process.env.SIM || require('path').join(__dirname, '../src/sim.js'), 'utf8');
const m = { exports: {} }; new Function('module', src + '\nmodule.exports={buildTrack,TRACKS,Race,AIDriver,TEAMS};')(m); const S = m.exports;
const id = process.argv[2] || 'parco'; const T = S.buildTrack(S.TRACKS.find((t) => t.id === id));
let seed = +(process.argv[3] || 1); Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const race = new S.Race(T, { mode: 'race', laps: 3, opponents: 21, team: S.TEAMS[3], driver: S.TEAMS[3].drivers[0], gridSlot: 21, assist: { tc: 2, abs: true, autoGear: true }, damage: 'real' });
const pai = new S.AIDriver(race.player, 0.96, 99); race.player.isPlayer = false; // the 'player' is just another AI car here
let rec = 0; race.ais.concat([pai]).forEach((a) => { const o = a.recover.bind(a); a.recover = () => { rec++; o(); }; });
let t = 0, overtakes = 0, contacts = 0, mistakes = 0, prevOrder = null, k = 0; const was = new Map();
while (t < 600) {
  race.step(1 / 360, pai.control(1 / 360, race.cars, race)); t += 1 / 360; k++;
  for (const c of race.cars) { const hit = c.impact > 4; if (hit && !was.get(c)) contacts++; was.set(c, hit); }
  for (const a of race.ais) if (a.errT > 0 && !a._e) { a._e = true; mistakes++; } else if (a.errT <= 0) a._e = false;
  if (k % 180 === 0 && race.phase === 'green' && race.greenT > 20) { const ord = race.standings().filter((c) => !c.finished && !c.pit && !c.dnf).map((c) => c.driver.code); if (prevOrder) { const pos = new Map(prevOrder.map((c, i) => [c, i])); for (let i = 0; i < ord.length; i++) for (let j = i + 1; j < ord.length; j++) if (pos.has(ord[i]) && pos.has(ord[j]) && pos.get(ord[i]) > pos.get(ord[j])) overtakes++; } prevOrder = ord; }
  if (race.finishOrder.length >= race.cars.length - race.cars.filter((c) => c.dnf).length && race.finishOrder.length > 0) break;
}
console.log(`${id} seed ${process.argv[3] || 1}: time ${t.toFixed(0)} s | overtakes ${overtakes} | contact/impact events ${contacts} | mistakes ${mistakes} | rescues ${rec} | finished ${race.finishOrder.length} | retired ${race.cars.filter((c) => c.dnf).length}`);

// Practice with traffic (a career weekend's practice: 15 AI cars on track): how often the AI runs into the player, who
// drives slowly, lifts, stops after a spin and pulls away again. usage: node test/practicehits.js [tracks]
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../src/data.js'), 'utf8') + '\n' + fs.readFileSync(process.env.SIM || path.join(__dirname, '../src/sim.js'), 'utf8');
const m = { exports: {} }; new Function('module', src + '\nmodule.exports={buildTrack,TRACKS,Race,AIDriver,TEAMS};')(m); const S = m.exports;
let total = 0, totalStop = 0;
for (const id of (process.argv[2] || 'silver,ardenne,riviera').split(',')) for (const seed of [1, 2]) {
  let s0 = seed; Math.random = () => ((s0 = (s0 * 16807) % 2147483647) / 2147483647);
  const T = S.buildTrack(S.TRACKS.find((t) => t.id === id));
  const race = new S.Race(T, { mode: 'practice', laps: 99, opponents: 15, team: S.TEAMS[3], driver: S.TEAMS[3].drivers[0], assist: { tc: 2, abs: true, autoGear: true } });
  const P = race.player, ai = new S.AIDriver(P, 0.9, 7); let hits = 0, was = false, t = 0, startHit = 0, stopHit = 0;
  // the player: slow (pace 0.9), a full stop for 4 s every 50 s (a spin), then pulls away again
  while (t < 300) {
    let inp = ai.control(1 / 360, race.cars, race);
    const cyc = t % 50; if (cyc > 40 && cyc < 44) inp = { steer: 0, throttle: 0, brake: 1 };
    race.step(1 / 360, inp); t += 1 / 360;
    // an AI car running into you: it was behind you on the track (whichever lap) and faster, and the two touched
    let into = false; for (const o of race.cars) { if (o === P || Math.hypot(o.x - P.x, o.y - P.y) > 6.5) continue; let g = (((o.dist - P.dist) % T.length) + T.length) % T.length; if (g > T.length / 2) g -= T.length; if (g < -0.5 && o.vx > P.vx + 1) into = true; }
    const hit = (P.impact || 0) > 3 && into; if (hit && !was) { hits++; if (t < 20) startHit++; const cy = t % 50; if (cy > 40 && cy < 47) stopHit++; } was = hit;
  }
  total += hits; totalStop += stopHit; console.log(`${id.padEnd(8)} seed ${seed}: an AI car ran into you ${hits} times in 5 minutes (${startHit} in the first 20 s, ${stopHit} when you had stopped dead on the racing line or were pulling away)`);
}
console.log('TOTAL', total, 'of which after a stop on the line:', totalStop, '· in normal driving:', total - totalStop);

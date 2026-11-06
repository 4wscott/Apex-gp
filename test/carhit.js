// car-to-car contact: how deep two cars' footprints sink into each other, how they leave the hit (bounce or stay
// together), how much they spin, and where the damage lands. Rear-end, side swipe and a nose into a sidepod.
// usage: node test/carhit.js [path to sim.js]
const fs = require('fs'), path = require('path');
const simPath = process.argv[2] || path.join(__dirname, '../src/sim.js');
const src = fs.readFileSync(path.join(__dirname, '../src/data.js'), 'utf8') + '\n' + fs.readFileSync(simPath, 'utf8');
const m = { exports: {} }; new Function('module', src + '\nmodule.exports={buildTrack,TRACKS,Car,TEAMS,collideCars};')(m); const S = m.exports;
const T = S.buildTrack(S.TRACKS.find((t) => t.id === 'silver'));
const OFF = 0.25, HL = 2.9, HW = 1.02;
const box = (c) => { const u = [Math.cos(c.h), Math.sin(c.h)], v = [-u[1], u[0]]; return { c: [c.x + u[0] * OFF, c.y + u[1] * OFF], u, v }; };
const overlap = (A, B) => { const a = box(A), b = box(B); let mn = Infinity; for (const ax of [a.u, a.v, b.u, b.v]) { const d = Math.abs((b.c[0] - a.c[0]) * ax[0] + (b.c[1] - a.c[1]) * ax[1]); const r = (o) => HL * Math.abs(o.u[0] * ax[0] + o.u[1] * ax[1]) + HW * Math.abs(o.v[0] * ax[0] + o.v[1] * ax[1]); mn = Math.min(mn, r(a) + r(b) - d); } return Math.max(0, mn); };
const mk = () => { const c = new S.Car(T, S.TEAMS[3], S.TEAMS[3].drivers[0], { damage: 'real', assist: { tc: 2, abs: true, autoGear: true } }); return c; };
const i0 = Math.round(820 / T.ds), hd = Math.atan2(T.ty[i0], T.tx[i0]), fw = [Math.cos(hd), Math.sin(hd)], lf = [-fw[1], fw[0]];
const run = (label, setup) => {
  const A = mk(), B = mk(); A.isPlayer = true; A.place(i0, 0, 0); B.place(i0, 0, 0); setup(A, B); const h0 = [A.h, B.h];
  let worst = 0, t = 0, apart = null; const v0 = [A.vx, B.vx];
  for (let n = 0; n < 360 * 1.2; n++) {
    A.step(1 / 360, { steer: 0, throttle: 0, brake: 0 }); B.step(1 / 360, { steer: 0, throttle: 0, brake: 0 }); S.collideCars([A, B]);
    const o = overlap(A, B); worst = Math.max(worst, o);
  }
  const relAfter = Math.hypot(A.vx * Math.cos(A.h) - B.vx * Math.cos(B.h), A.vx * Math.sin(A.h) - B.vx * Math.sin(B.h));
  const dm = (c) => ['fwL', 'fwR', 'rw', 'floor'].map((k) => k + ' ' + c.dmg[k].toFixed(2)).join(' ') + ' sus ' + c.dmg.sus.map((x) => x.toFixed(2)).join('/') + ' punct ' + c.dmg.punct.join('');
  console.log(label.padEnd(28), `deepest overlap ${worst.toFixed(2)} m | after 1.2 s: speeds ${(A.vx * 3.6).toFixed(0)} / ${(B.vx * 3.6).toFixed(0)} km/h, turned ${((A.h - h0[0]) * 57.3).toFixed(0)} / ${((B.h - h0[1]) * 57.3).toFixed(0)} deg`);
  console.log('   A:', dm(A)); console.log('   B:', dm(B));
};
// A runs into the back of B at 25 m/s closing speed
run('rear-end, 90 vs 65 km/h... ', (A, B) => { B.x += fw[0] * 7; B.y += fw[1] * 7; A.vx = 25 + 18; B.vx = 18; });
// side by side, A moves sideways into B (a squeeze)
run('side swipe, 6 m/s across', (A, B) => { B.x += lf[0] * 2.4 + fw[0] * 0.3; B.y += lf[1] * 2.4 + fw[1] * 0.3; A.vx = B.vx = 50; A.vy = 6; });
// A's nose into B's sidepod at an angle
run('nose into the sidepod 45deg', (A, B) => { B.x += fw[0] * 5 + lf[0] * 2.5; B.y += fw[1] * 5 + lf[1] * 2.5; A.vx = 30; B.vx = 18; A.h += 0.45; });

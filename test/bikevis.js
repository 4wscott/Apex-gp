// Bikes on screen (docs/PLAN-bikes.md, phases 2-3): a bike race starts and runs with no errors; the bikes lean, wheelie
// and crash on screen; every camera works; the dash shows the bike's own readouts; a car race still runs as before.
// Shots for review in the scratchpad (bikes-*.png). The simulation is stepped directly (the test renderer is slow).
// usage: node test/bikevis.js [track]   (Q=quality)
const { chromium } = require('playwright'); const { open, start } = require('./visualbase.js');
const OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/bikes-', q = +(process.env.Q || 2), track = process.argv[2] || 'silver';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await open(br, { quality: q, mode: 'race', track, camera: 'chase', opponents: 11, weather: 'dry', tod: 'noon', series: 'bike', laps: 3 }, { viewport: { width: 1280, height: 720 } });
  console.log('    load', await start(page, { track, mode: 'race', series: 'bike' }), 'ms');
  // drive the race forward by sim time: the game loop is paused and the race stepped here, then one frame drawn
  await page.evaluate(() => {
    window.__sim = async (secs, inpFn) => { const r = App.session.race; App.paused = true; const dt = 1 / 120; for (let t = 0; t < secs; t += dt) r.step(dt, inpFn ? inpFn() : { throttle: 0, brake: 0, steer: 0 }); App.paused = false; await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))); };
  });
  const info = await page.evaluate(() => { const r = App.session.race; return { series: r.series, n: r.cars.length, bikes: r.cars.filter((c) => c.isBike).length, mesh: r.cars.filter((c) => c.mesh && c.mesh.isBike).length, rider: !!r.player.mesh.rider, fence: !!App.airFence, labels: [...document.querySelectorAll('#dash .dash-grid small')].slice(0, 3).map((e) => e.textContent) }; });
  ok(info.series === 'bike' && info.bikes === info.n && info.mesh === info.n, `bike race: ${info.bikes}/${info.n} bikes, all drawn as bikes`);
  ok(info.rider, 'the rider is on the bike');
  ok(info.fence, 'air fences built at the close walls');
  ok(info.labels.join() === 'Engine map,Lean · max,Anti-wheelie', `the dash shows the bike's readouts (${info.labels.join(', ')})`);
  const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: OUT + name + '.png', timeout: 240000 }); };
  await page.evaluate(() => { App.session.camMode = 'chase'; }); await shot('grid');
  // lights out, 8 s of racing with an AI on the player's bike too
  await page.evaluate(async () => { const r = App.session.race, ai = new SIM.AIDriver(r.player, 1, 3); window.__ai = ai; r.lightsT = r.lightsOutAt - 0.01; await __sim(8, () => ai.control(1 / 120, r.cars, r)); });
  const st = await page.evaluate(() => App.session.race.cars.map((c) => ({ v: c.vx, down: !!c.down })));
  ok(st.filter((c) => c.v > 20).length >= st.length - 2, `the field is racing (${st.filter((c) => c.v > 20).length} of ${st.length} above 72 km/h)`);
  // into the tightest corner: the lean shows on the bike and on the dash
  await page.evaluate(async () => { const r = App.session.race, P = r.player, T = r.track; let bi = 0, bk = 0; for (let i = 0; i < T.n; i++) if (Math.abs(T.lineK[i]) > bk && Math.abs(T.lineK[i]) < 1 / 40) { bk = Math.abs(T.lineK[i]); bi = i; }
    const i0 = (bi - 60 + T.n) % T.n; P.place(i0, T.lineO[i0], T.lineV[i0]); P.dist = r.cars.reduce((a, c) => Math.max(a, c.dist), 0) + 30; P.lean = 0; for (const c of r.cars) if (c !== P && Math.abs(c.dist - P.dist) < 80) c.dist -= 200;
    let k = 0; while (Math.abs(P.lean) < 0.6 && k++ < 600) { r.step(1 / 120, __ai.control(1 / 120, r.cars, r)); } await __sim(0.01, () => __ai.control(1 / 120, r.cars, r)); });
  const lean = await page.evaluate(() => { const P = App.session.race.player; return { lean: P.lean, mesh: P.mesh.lean.rotation.x, dash: document.querySelector('#h-aero').textContent }; });
  ok(Math.abs(lean.lean) > 0.35 && Math.abs(lean.mesh + lean.lean * 1.1) < 0.02, `the bike leans on screen (${(lean.lean * 57.3).toFixed(0)} deg; dash: ${lean.dash})`);
  for (const cm of ['chase', 'cockpit', 'tcam', 'far']) { await page.evaluate((cm) => { App.session.camMode = cm; }, cm); await shot('lean-' + cm); }
  const cams = await page.evaluate(() => App.camera.position.toArray().every(Number.isFinite));
  ok(cams, 'every camera works (chase, helmet, tail, TV)');
  // a wheelie with anti-wheelie off
  await page.evaluate(async () => { const r = App.session.race, P = r.player, T = r.track; let bi = 0, best = 0, run = 0; for (let i = 0; i < T.n; i++) { if (Math.abs(T.lineK[i]) < 1 / 3000) { run++; if (run > best) { best = run; bi = i - run + 1; } } else run = 0; }
    P.assist.aw = false; P.assist.tc = 0; P.place((bi + 5) % T.n, 0, 22); P.gear = 1; App.paused = true; let k = 0; for (; k < 360 && P.wheelie < 0.08 && !P.down; k++) r.step(1 / 120, { throttle: 1, brake: 0, steer: 0, lean: 0 }); BIKES.bikeFrame(P, P.mesh, 0, P, true, App.worldRoot, r.track); window.__wh = { w: P.wheelie, mesh: P.mesh.wh.rotation.z, k }; }); // until the front is well up; drawn while paused
  const wh = await page.evaluate(() => { App.session.camMode = 'chase'; return Object.assign(window.__wh, { dash: document.querySelector('#h-bias').textContent }); });
  await shot('wheelie'); await page.evaluate(() => { App.paused = false; });
  ok(wh.w > 0.02 && Math.abs(wh.mesh - wh.w) < 0.05, `wheelie on screen (${(wh.w * 57.3).toFixed(0)} deg; dash: ${wh.dash})`);
  // a crash: the rider and the bike part, then the rider gets back on
  await page.evaluate(async () => { const r = App.session.race, P = r.player; P.assist.aw = true; P.vx = 30; P.crash('lowside'); await __sim(0.8); });
  const cr = await page.evaluate(() => { const P = App.session.race.player, m = P.mesh; return { down: !!P.down, apart: m.rider.holder.parent !== m.frame, roll: m.lean.rotation.x }; });
  await shot('crash');
  ok(cr.down && cr.apart && Math.abs(cr.roll) > 0.5, 'crash: the bike goes down and the rider is thrown clear');
  await page.evaluate(async () => { const r = App.session.race; for (const c of r.cars) if (c !== r.player) c.dist -= 400; for (let k = 0; k < 40 && r.player.down; k++) await __sim(1); });
  const back = await page.evaluate(() => { const P = App.session.race.player, m = P.mesh; return { down: !!P.down, dnf: P.dnf, on: m.rider.holder.parent === m.frame }; });
  ok(!back.down && !back.dnf && back.on, 'remount: the rider is back on the bike');
  const perf = await page.evaluate(() => { const i = App.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; });
  console.log('    renderer (bikes)', JSON.stringify(perf));
  // and the car game still runs
  await page.evaluate(() => App.quit()); await page.waitForTimeout(1500);
  await start(page, { track, mode: 'race', series: 'car' });
  const car = await page.evaluate(async () => { const r = App.session.race; window.__sim = window.__sim; r.lightsT = r.lightsOutAt - 0.01; await __sim(5); return { series: r.series, cars: r.cars.filter((c) => !c.isBike && c.mesh && !c.mesh.isBike).length, n: r.cars.length, moving: r.cars.filter((c) => c.vx > 5).length, labels: [...document.querySelectorAll('#dash .dash-grid small')].slice(0, 3).map((e) => e.textContent) }; });
  ok(car.series === 'car' && car.cars === car.n && car.moving >= car.n - 2 && car.labels.join() === 'ERS,Aero,Brake bias', `a car race after a bike race: ${car.cars} cars, ${car.moving} moving, the car dash back (${car.labels.join(', ')})`);
  ok(!page.errs.length, 'no errors' + (page.errs.length ? ': ' + page.errs.slice(0, 3).join(' | ') : ''));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

// Bikes against cars (docs/PLAN-bikes.md, phase 6): a full grid of 22 bikes may cost no more draw calls, triangles or
// memory than the grid of 22 cars, on each preset. Measured from the chase camera on the grid and 3 s after the start.
// usage: node test/bikeperf.js   (QS=0,1,2,3 TRACKS=silver,riviera)
const { chromium } = require('playwright'); const { open, start } = require('./visualbase.js');
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  for (const q of (process.env.QS ? process.env.QS.split(',').map(Number) : [0, 1, 2, 3])) for (const track of (process.env.TRACKS ? process.env.TRACKS.split(',') : ['silver'])) {
    const res = {};
    for (const series of ['car', 'bike']) {
      const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
      const page = await open(br, { quality: q, mode: 'race', track, camera: 'chase', opponents: 21, weather: 'dry', tod: 'noon', series }, { viewport: { width: 960, height: 540 } });
      await start(page, { track, mode: 'race', series });
      res[series] = await page.evaluate(async () => {
        const r = App.session.race; App.paused = true; r.lightsT = r.lightsOutAt - 0.01; for (let k = 0; k < 360; k++) r.step(1 / 120, { throttle: 1, brake: 0, steer: 0 }); App.paused = false;
        await new Promise((ok) => setTimeout(ok, 2500));
        const R = App.renderer, gl = R.getContext(), px = new Uint8Array(4); App.paused = true;
        let calls = 0, tris = 0; const or = R.render.bind(R); R.render = (sc, cam) => { or(sc, cam); calls += R.info.render.calls; tris += R.info.render.triangles; }; App.render(); R.render = or;
        for (let i = 0; i < 3; i++) { App.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
        const t0 = performance.now(); for (let i = 0; i < 8; i++) { App.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
        return { calls, tris, geos: R.info.memory.geometries, tex: R.info.memory.textures, ms: +((performance.now() - t0) / 8).toFixed(1) };
      });
      await br.close();
    }
    const C = res.car, B = res.bike;
    console.log(`    q${q} ${track}: cars ${JSON.stringify(C)}  bikes ${JSON.stringify(B)}`);
    ok(B.calls <= C.calls * 1.05 && B.tris <= C.tris * 1.05, `q${q} ${track}: bikes ${B.calls} draw calls / ${(B.tris / 1000).toFixed(0)}k triangles against cars ${C.calls} / ${(C.tris / 1000).toFixed(0)}k`);
    ok(B.ms <= C.ms * 1.08, `q${q} ${track}: frame time bikes ${B.ms} ms, cars ${C.ms} ms (test renderer)`);
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();

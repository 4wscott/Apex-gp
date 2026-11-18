// Graphics plan, phases 2 and 3 (docs/PLAN-visuals.md): street buildings, barriers, trees and grass. Builds each
// circuit, checks what was placed (buildings, foam and tyre walls, guardrail, distant trees, marshal panels), checks no
// building stands on the track, and takes eye-level shots at fixed spots for review (HTML=... for the old build).
// usage: node test/visual23.js [tag]   (Q=quality, TRACKS=a,b,...)
const { chromium } = require('playwright'); const { open, start } = require('./visualbase.js');
const OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/v23-', tag = process.argv[2] || 'new', q = +(process.env.Q || 2);
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
const SPOTS = { riviera: [0.2, 0.45, 0.66], montealto: [0.3, 0.6], parco: [0.13, 0.55], ardenne: [0.12, 0.38, 0.62], serra: [0.2, 0.7], lakeside: [0.35, 0.88], baia: [0.4], lonestar: [0.1, 0.4] };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await open(br, { quality: q, mode: 'trial', track: 'riviera', camera: 'chase', weather: 'dry', tod: 'auto', team: 'ardent' }, { viewport: { width: 1280, height: 720 } });
  for (const track of (process.env.TRACKS ? process.env.TRACKS.split(',') : Object.keys(SPOTS))) {
    await start(page, { track, mode: 'trial' }); await page.waitForTimeout(2000);
    if (tag === 'new') {
      const r = await page.evaluate(() => {
        const T = App.session.race.track, out = { city: GFX.city, barriers: GFX.barriers, marshal: GFX.marshal ? GFX.marshal.idx.length : 0, billboards: 0, onTrack: 0 };
        App.scene.traverse((o) => { if (o.isInstancedMesh && o.material && o.material.customProgramCacheKey && o.material.customProgramCacheKey() === 'treeBillboard') out.billboards += o.count; });
        // no building footprint centre on the track or its verges
        App.scene.traverse((o) => { if (!o.isInstancedMesh || !o.geometry.attributes.aStyle) return; const m = new THREE.Matrix4(), p = new THREE.Vector3(); for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, m); p.setFromMatrixPosition(m); const q = trackDistance(T, p.x, -p.z, -1, 0, 2); if (q.i >= 0 && q.d < Math.max(T.wallL[q.i], T.wallR[q.i]) + 1) out.onTrack++; } });
        return out;
      });
      console.log('   ', track, JSON.stringify(r));
      ok(r.barriers && r.barriers.foam + r.barriers.tyres > 50, `${track}: foam blocks and tyre walls at the big stops (${r.barriers && r.barriers.foam} blocks, ${r.barriers && r.barriers.tyres} tyre-wall sections)`);
      ok(r.onTrack === 0, `${track}: no building on the track`);
      if (track === 'riviera' || track === 'montealto') ok(r.city && r.city.count > 300 && (q < 2 || (r.city.details > 200 && r.city.lamps > 20)), `${track}: a city of ${r.city && r.city.count} buildings` + (q >= 2 ? `, ${r.city && r.city.details} balconies, cornices and roof units, ${r.city && r.city.lamps} lamp posts` : ''));
      if (track === 'ardenne') ok(r.barriers.armco, 'Ardenne: steel guardrail');
      if (['parco', 'ardenne', 'serra', 'lakeside'].includes(track)) ok(r.billboards > 100, `${track}: ${r.billboards} distant trees drawn as pictures`);
      ok(r.marshal > 4, `${track}: ${r.marshal} marshal posts with flag panels`);
    }
    for (const f of SPOTS[track] || [0.3]) {
      await page.evaluate((f) => {
        const r = App.session.race, P = r.player, T = r.track, i = Math.floor(T.n * f) % T.n; P.x = T.px[i]; P.y = T.py[i]; P.h = Math.atan2(T.ty[i], T.tx[i]); P.vx = P.vy = 0; P.idx = i; P.locate(true);
        App.paused = true; document.querySelector('#hud').style.visibility = 'hidden'; const pz = document.querySelector('#pause'); if (pz) pz.hidden = true; if (window.MouseWheel) MouseWheel.show(false);
        const cam = App.camera, h = P.h, rz = window.roadZ || (() => 0), z0 = rz(T, i, 0), z1 = rz(T, (i + 12) % T.n, 0);
        window.__fix = () => { cam.position.set(P.x - Math.cos(h) * 7, z0 + 2.2, -(P.y - Math.sin(h) * 7)); cam.lookAt(P.x + Math.cos(h) * 25, z1 + 1.8, -(P.y + Math.sin(h) * 25)); cam.fov = 62; cam.updateProjectionMatrix(); };
        if (!window.__wrapped) { const r0 = App.render.bind(App); App.render = (c) => { if (window.__fix) window.__fix(); r0(c); }; window.__wrapped = true; }
      }, f);
      await page.waitForTimeout(2500); await page.screenshot({ path: OUT + `${track}-${Math.round(f * 100)}-q${q}-${tag}.png`, timeout: 240000 });
    }
    await page.evaluate(() => { window.__fix = null; App.paused = false; document.querySelector('#hud').style.visibility = ''; App.quit(); }); await page.waitForTimeout(1000);
  }
  ok(!page.errs.length, 'no errors' + (page.errs.length ? ': ' + page.errs.slice(0, 3).join(' | ') : ''));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

// Visual baseline for the graphics plan (docs/PLAN-visuals.md): numbers and pictures to compare every phase against.
//   node test/visualbase.js perf   [tag]  draw calls, triangles, memory, load and frame time per preset (Silverwood and Riviera, full grid)
//   node test/visualbase.js bright [tag]  how bright your car is from 8 directions round it, on all 12 circuits (Q=quality, default 2)
//   node test/visualbase.js shots  [tag]  chase, cockpit and TV shots on all 12 circuits, plus rain and night (MOBILE=1: phone size)
//   node test/visualbase.js compare base new   the new numbers against the old ones
// Results go to the scratchpad: vb/<tag>/ (tag defaults to "base").
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/', OUT0 = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/vb/';
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(process.env.HTML || path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
const mode = process.argv[2] || 'perf', tag = process.argv[3] || 'base', OUT = OUT0 + tag + '/', mob = !!process.env.MOBILE;
const TRACK_IDS = ['parco', 'silver', 'ardenne', 'riviera', 'serra', 'ile', 'sakhir', 'baia', 'nordhang', 'montealto', 'lakeside', 'lonestar'];
if (require.main === module) fs.mkdirSync(OUT, { recursive: true });

async function open(br, settings, view) {
  const page = await br.newPage(view || { viewport: { width: 1280, height: 720 } });
  page.errs = []; page.on('pageerror', (e) => page.errs.push(e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript((s) => { Math.random = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })(); localStorage.setItem('apexgp.settings', JSON.stringify(Object.assign({ v: 10, radio: 'off', mouseSteer: 'off', laps: 3 }, s))); }, settings);
  await page.goto('http://local/', { timeout: 180000 }); await page.waitForFunction(() => window.App && window.Menu, null, { timeout: 180000 }); await page.waitForTimeout(3000);
  return page;
}
// start a session from the menu's settings and wait until the race exists; returns the load time in ms
async function start(page, set) {
  const t0 = Date.now();
  await page.evaluate((s) => { Object.assign(SIM.settings, s); App.start(); }, set);
  await page.waitForFunction(() => App.session && App.session.race && App.worldRoot, null, { timeout: 240000 });
  return Date.now() - t0;
}

async function perf() {
  const res = {};
  for (const q of (process.env.QS ? process.env.QS.split(',').map(Number) : [0, 1, 2, 3])) for (const track of (process.env.TRACKS ? process.env.TRACKS.split(',') : ['silver', 'riviera', 'ardenne'])) {
    const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const page = await open(br, { quality: q, mode: 'race', track, camera: 'chase', opponents: 21, mirrors: q >= 2, weather: 'dry', tod: 'noon' }, { viewport: { width: 960, height: 540 } });
    const load = await start(page, { track, mode: 'race' });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => {
      const R = App.renderer, gl = R.getContext(), px = new Uint8Array(4);
      let calls = 0, tris = 0; const or = R.render.bind(R);
      R.render = (sc, cam) => { or(sc, cam); calls += R.info.render.calls; tris += R.info.render.triangles; };
      App.render(); R.render = or;
      // texture memory by what is on screen (each texture once, mipmaps counted)
      const seen = new Set(); let mb = 0;
      const add = (t) => { if (!t || seen.has(t)) return; seen.add(t); const im = t.image; const w = (im && im.width) || 0, h = (im && im.height) || 0; const b = t.type === 1016 ? 8 : t.type === 1015 ? 16 : 4; mb += (w * h * b * (t.generateMipmaps !== false ? 1.33 : 1)) / 1e6; };
      App.scene.traverse((o) => { if (!o.material) return; for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'metalnessMap', 'aoMap', 'clearcoatNormalMap']) add(m[k]); });
      let geoMB = 0; const gs = new Set(); App.scene.traverse((o) => { const g = o.geometry; if (!g || gs.has(g)) return; gs.add(g); for (const a of Object.values(g.attributes)) geoMB += a.array.byteLength / 1e6; if (g.index) geoMB += g.index.array.byteLength / 1e6; if (o.isInstancedMesh) geoMB += o.instanceMatrix.array.byteLength / 1e6; });
      // frame time: 24 renders, each forced to finish with a 1-pixel read
      for (let i = 0; i < 2; i++) { App.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      const t0 = performance.now(); for (let i = 0; i < 8; i++) { App.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      const ms = (performance.now() - t0) / 8;
      return { calls, tris, textures: R.info.memory.textures, geometries: R.info.memory.geometries, programs: R.info.programs.length, texMB: Math.round(mb), geoMB: Math.round(geoMB), frameMs: +ms.toFixed(1), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, px: App.renderPx };
    });
    r.loadMs = load; res['q' + q + ':' + track] = r;
    console.log('q' + q, track.padEnd(8), JSON.stringify(r), page.errs.length ? 'ERRORS ' + page.errs.join(' | ') : '');
    await br.close();
  }
  fs.writeFileSync(OUT + 'perf.json', JSON.stringify(res, null, 1));
}

// your car's brightness from 8 directions: mean displayed brightness of the car's pixels (the car alone is drawn white on
// black for the mask), and the darkest direction as a share of the brightest
// runs in the page: park your car on a straight and measure it from 8 directions
const PROBE = async () => {
      const S = App.session, r = S.race, P = r.player;
      // move the car onto a straight, away from walls and the pits: a third of the way round the lap
      const T = r.track, n = T.px.length; let best = Math.round(n / 3);
      for (let i = Math.round(n / 3); i < Math.round(n * 0.6); i++) if (Math.abs(T.kapW[i]) < 1 / 2000) { best = i; break; }
      P.x = T.px[best]; P.y = T.py[best]; P.h = Math.atan2(T.ty[best], T.tx[best]); P.vx = P.vy = P.r = 0; P.idx = best; if (P.locate) P.locate(true);
      App.paused = true; document.querySelector('#hud').style.visibility = 'hidden'; const pz = document.querySelector('#pause'); if (pz) pz.hidden = true;
      if (window.MouseWheel) MouseWheel.show(false);
      await new Promise((ok) => { let k = 0; const f = () => (++k > 20 ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); }); // let the car's pose, shadows and reflections settle
      const R = App.renderer, gl = R.getContext(), cam = App.camera, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const img = new Uint8Array(w * h * 4), mask = new Uint8Array(w * h * 4), out = [];
      const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const carSet = new Set(); P.mesh.grp.traverse((o) => carSet.add(o));
      const rafs = []; const oldRaf = window.requestAnimationFrame; // keep the game loop from moving the camera in between
      for (let k = 0; k < 8; k++) {
        const a = P.h + (k * Math.PI) / 4; // k=0: camera in front of the car, k=4: behind it
        const z = P.mesh.grp.position.y; // the car's height on the hills
        cam.position.set(P.x + Math.cos(a) * 7, z + 2.2, -(P.y + Math.sin(a) * 7)); cam.lookAt(P.x, z + 0.45, -P.y); cam.fov = 50; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        App.render(); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, img);
        const hidden = []; App.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && !carSet.has(o) && o.visible) { o.visible = false; hidden.push(o); } });
        const bg = App.scene.background, fog = App.scene.fog; App.scene.background = new THREE.Color(0); App.scene.fog = null; App.scene.overrideMaterial = white;
        const tm = R.toneMapping; R.toneMapping = THREE.NoToneMapping; R.setRenderTarget(null); R.render(App.scene, cam); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, mask);
        R.toneMapping = tm; App.scene.overrideMaterial = null; App.scene.background = bg; App.scene.fog = fog; hidden.forEach((o) => (o.visible = true));
        let sum = 0, cnt = 0, cr = 0, cg = 0, cb = 0;
        for (let i = 0; i < w * h; i++) if (mask[i * 4] > 128) { const R0 = img[i * 4], G0 = img[i * 4 + 1], B0 = img[i * 4 + 2]; sum += 0.2126 * R0 + 0.7152 * G0 + 0.0722 * B0; cr += R0; cg += G0; cb += B0; cnt++; }
        out.push({ dir: k * 45, lum: cnt ? +(sum / cnt).toFixed(1) : 0, px: cnt, rgb: cnt ? [Math.round(cr / cnt), Math.round(cg / cnt), Math.round(cb / cnt)] : null });
      }
      const sun = App.sunDir ? [+App.sunDir.x.toFixed(2), +App.sunDir.y.toFixed(2), +App.sunDir.z.toFixed(2)] : null;
      const lums = out.filter((o) => o.px > 200).map((o) => o.lum), ratio = lums.length ? Math.min(...lums) / Math.max(...lums) : 0;
      App.paused = false; document.querySelector('#hud').style.visibility = '';
      return { ratio: +ratio.toFixed(2), min: Math.min(...lums), max: Math.max(...lums), sun, dirs: out };
};

async function bright() {
  const q = +(process.env.Q || 2), res = {};
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await open(br, { quality: q, mode: 'trial', track: 'parco', camera: 'chase', weather: 'dry', tod: 'auto', team: 'ardent' }, { viewport: { width: 640, height: 360 } });
  for (const track of (process.env.TRACKS ? process.env.TRACKS.split(',') : TRACK_IDS)) {
    await start(page, { track, mode: 'trial' });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(PROBE);
    res[track] = r;
    console.log(track.padEnd(10), 'darkest/brightest', r.ratio, 'min', r.min, 'max', r.max, ' ', r.dirs.map((d) => d.dir + ':' + d.lum).join(' '));
    // a picture of the darkest direction, for the eye
    await page.evaluate(() => App.quit()); await page.waitForTimeout(1200);
  }
  const all = Object.values(res).map((r) => r.ratio);
  console.log('worst circuit ratio', Math.min(...all).toFixed(2), 'average', (all.reduce((a, b) => a + b, 0) / all.length).toFixed(2));
  if (page.errs.length) console.log('ERRORS', page.errs.join(' | '));
  fs.writeFileSync(OUT + 'bright-q' + q + '.json', JSON.stringify(res, null, 1));
  await br.close();
}

async function shots() {
  const q = +(process.env.Q || 2);
  const view = mob ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } };
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await open(br, { quality: q, mode: 'race', track: 'parco', camera: 'chase', opponents: 5, weather: 'dry', tod: 'auto', grid: 'mid', team: 'ardent' }, view);
  const shot = (n) => page.screenshot({ path: OUT + n + (mob ? '-m' : '') + '-q' + q + '.png', timeout: 240000 });
  const list = (process.env.TRACKS ? process.env.TRACKS.split(',') : TRACK_IDS).map((t) => [t, 'dry', 'auto']).concat(process.env.TRACKS ? [] : [['silver', 'wet', 'auto'], ['sakhir', 'dry', 'auto'], ['riviera', 'dry', 'night']]);
  for (const [track, weather, tod] of list) {
    await start(page, { track, mode: 'race', weather, tod, opponents: 5 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const r = App.session.race; r.lightsOutAt = 0; const ai = new SIM.AIDriver(r.player, 1.0, 4); for (let n = 0; n < 360 * 22; n++) r.step(1 / 360, ai.control(1 / 360, r.cars, r)); });
    const cams = mob ? ['chase'] : weather !== 'dry' || tod !== 'auto' ? ['chase'] : ['chase', 'cockpit', 'tcam'];
    for (const cam of cams) { await page.evaluate((c) => { App.session.camMode = c; }, cam); await page.waitForTimeout(3000); await shot(track + (weather !== 'dry' ? '-' + weather : '') + (tod !== 'auto' ? '-' + tod : '') + '-' + cam); }
    await page.evaluate(() => App.quit()); await page.waitForTimeout(1200);
    console.log('shots', track, weather, tod);
  }
  console.log(page.errs.length ? 'ERRORS ' + page.errs.join(' | ') : 'no errors');
  await br.close();
}

async function compare() {
  const a = process.argv[3] || 'base', b = process.argv[4] || 'new';
  const A = JSON.parse(fs.readFileSync(OUT0 + a + '/perf.json')), B = JSON.parse(fs.readFileSync(OUT0 + b + '/perf.json'));
  for (const k of Object.keys(A)) {
    if (!B[k]) continue; const d = (f) => `${f} ${A[k][f]}→${B[k][f]}`;
    console.log(k.padEnd(12), ['calls', 'tris', 'texMB', 'geoMB', 'frameMs', 'loadMs'].map(d).join('  '));
  }
}

if (require.main === module) ({ perf, bright, shots, compare })[mode]().catch((e) => { console.error(e); process.exit(1); });
module.exports = { open, start, PROBE, TRACK_IDS };

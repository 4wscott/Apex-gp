// where a race frame's time goes (script side): physics steps, visuals, HUD, the render call. Compare two builds:
// node test/perfprobe.js path/to/index.html [quality]
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const src = process.argv[2] || path.join(__dirname, '../index.html'), q = +(process.argv[3] || 2);
const html = '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(src, 'utf8') + '</body></html>';
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await br.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript((q) => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: q, mirrors: false, v: 9, mode: 'race', track: 'silver', camera: 'chase', laps: 5, opponents: 21, radio: 'text', grid: 'mid', autoRes: false })); }, q);
  if (process.env.CPU) await page.addInitScript(() => { window.__cpu = true; });
  const t0 = Date.now(); await page.goto('http://local/'); await page.waitForFunction(() => window.App && App.scene, null, { timeout: 120000 }); const load = Date.now() - t0;
  await page.waitForTimeout(4000);
  await page.evaluate(() => document.querySelector('#start').click());
  await page.waitForFunction(() => App.session && App.session.race, null, { timeout: 180000 });
  await page.evaluate(() => { const r = App.session.race; r.lightsOutAt = 0; for (let k = 0; k < 360 * 3; k++) r.step(1 / 360, { steer: 0, throttle: 0, brake: 1 }); });
  const r = await page.evaluate(() => new Promise((res) => {
    const T = { step: 0, vis: 0, hud: 0, render: 0, frame: 0, n: 0 }, w = (o, k, key) => { const f = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); try { return f(...a); } finally { T[key] += performance.now() - t; } }; };
    const race = App.session.race; w(race, 'step', 'step'); w(App, 'updateVisuals', 'vis'); w(Hud, 'update', 'hud'); w(App, 'render', 'render'); if (window.__cpu) { App.render = () => {}; App.renderer.render = () => {}; if (App.composer) App.composer.render = () => {}; } w(App, 'frame', 'frame');
    const ai = new SIM.AIDriver(race.player, 1, 5); App.input.poll = () => ai.control(1 / 60, race.cars, race); // the AI drives the player's car
    const t0 = performance.now(); const tick = () => { T.n++; if (performance.now() - t0 < (window.__cpu ? 15000 : 40000)) requestAnimationFrame(tick); else res(T); }; requestAnimationFrame(tick);
  }));
  const per = (k) => (r[k] / r.n).toFixed(2);
  console.log(path.basename(path.dirname(src)), 'q' + q, 'load', load, 'ms | frames', r.n, '| per frame ms: total', per('frame'), 'physics', per('step'), 'visuals', per('vis'), 'hud', per('hud'), 'render', per('render'), '| errs', errs.length);
  await br.close();
})();

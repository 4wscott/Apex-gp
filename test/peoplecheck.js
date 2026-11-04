// renders the same driver / helmet / pit crew shots from a given build, for before-and-after comparison
// usage: node test/peoplecheck.js path/to/index.html outPrefix
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const SP0 = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const src = process.argv[2] || path.join(__dirname, '../index.html'), out = process.argv[3] || SP0 + 'people-';
const html = '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(src, 'utf8') + '</body></html>';
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await br.newContext({ viewport: { width: 640, height: 360 } }); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP0 + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await ctx.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript(() => { Math.random = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(); localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 1, v: 8, mode: 'practice', track: 'silver', camera: 'chase', mirrors: false, tod: 'auto' })); });
  await page.goto('http://local/'); await page.waitForTimeout(8000);
  await page.evaluate(() => document.querySelector('#start').click()); await page.waitForTimeout(8000);
  const shot = async (name, setup) => { await page.evaluate(setup); await page.waitForTimeout(2500); await page.screenshot({ path: out + name + '.png', timeout: 180000 }); };
  await page.evaluate(() => { App.paused = true; document.querySelector('#hud').style.visibility = 'hidden'; document.querySelector('#pause').hidden = true; });
  // close-up of the driver's helmet from above-behind, and the cockpit view with the gloves
  await shot('helmet', () => { const P = App.session.race.player, m = P.mesh.grp; window.__fix = () => { const c = App.camera, h = P.h; c.position.set(P.x - Math.cos(h) * 1.6, 1.7, -P.y + Math.sin(h) * 1.6); c.lookAt(P.x + Math.cos(h) * 0.2, 0.85, -P.y - Math.sin(h) * 0.2); c.fov = 40; c.updateProjectionMatrix(); }; const r = App.render.bind(App); App.render = () => { window.__fix(); r(); }; });
  await shot('cockpit', () => { App.render = App.__r || App.render; App.session.camMode = 'cockpit'; window.__fix = () => {}; });
  // pit stop with the crew around the car
  await shot('crew', () => { const r = App.session.race, P = r.player; r.toBox(P, 'S'); for (let n = 0; n < 360 * 12 && !(P.pit && P.pit.phase === 'stop' && P.pit.t > 0.8); n++) r.step(1 / 360, { steer: 0, throttle: 0, brake: 0 }); App.paused = false; App.session.camMode = 'chase'; });
  console.log('errs', errs); await br.close();
})();

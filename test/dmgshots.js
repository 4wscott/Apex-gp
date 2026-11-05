// close-ups of a damaged car (practice, standing still) from several angles, on the imported car body
// usage: node test/dmgshots.js
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/', OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await br.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript(() => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 1, mirrors: false, v: 9, mode: 'practice', track: 'silver', camera: 'chase', radio: 'off' })); });
  await page.goto('http://local/'); await page.waitForTimeout(6000);
  await page.evaluate(() => document.querySelector('#start').click()); await page.waitForTimeout(9000);
  await page.evaluate(() => { const r = App.session.race, P = r.player; P.place(200, 0, 0); P._px = undefined; const D = P.dmg; D.fwR = 0.15; D.fwL = 0.5; D.rw = 0.2; D.sus[0] = 0.45; D.pu = 0.35; P.puncture(3); D.tyre[3] = 0.05;
    document.querySelector('#hud').style.visibility = 'hidden'; window.__ang = 0;
    window.__fix = () => { const c = App.camera, h = P.h + window.__ang, R = window.__R || 5.2; c.position.set(P.x + Math.cos(h) * R, window.__Y || 1.5, -(P.y + Math.sin(h) * R)); c.lookAt(P.x, 0.35, -P.y); c.fov = 45; c.updateProjectionMatrix(); };
    const r0 = App.render.bind(App); App.render = () => { window.__fix(); r0(); }; });
  for (const [name, ang, R, Y] of [['fr', -0.7, 5.2, 1.4], ['fl', 0.7, 5.2, 1.4], ['rr', -2.4, 5.4, 1.6], ['top', -0.3, 3.5, 4.5]]) {
    await page.evaluate(([a, R, Y]) => { window.__ang = a; window.__R = R; window.__Y = Y; }, [ang, R, Y]); await page.waitForTimeout(2500);
    await page.screenshot({ path: OUT + 'dmgshot-' + name + '.png' });
  }
  console.log('errs', errs); await br.close();
})();

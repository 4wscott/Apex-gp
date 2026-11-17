// a real 120 km/h crash into a wall: pieces fly off and stay on the track, a broken corner loses its wheel, sparks,
// the crash sound is called. Screenshots mid-crash and after. usage: node test/crashvis.js
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/', OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await br.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript(() => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 1, v: 10, mode: 'practice', track: 'silver', camera: 'chase', radio: 'off', damage: 'real', mouseSteer: 'off' })); });
  await page.goto('http://local/'); await page.waitForTimeout(5000);
  await page.evaluate(() => document.querySelector('#start').click()); await page.waitForFunction(() => App.session && App.session.race, null, { timeout: 120000 }); await page.waitForTimeout(2500);
  // aim the car at the left wall at 120 km/h, a little off head-on, and step the race in real frames
  const r = await page.evaluate(() => new Promise((res) => {
    const race = App.session.race, P = race.player, T = race.track, i = 300;
    window.__crashCalls = 0; const cr = App.audio.crash.bind(App.audio); App.audio.crash = (...a) => { window.__crashCalls++; return cr(...a); };
    P.place(i, T.wallL[i] - 9, 34); P.h += 1.2; P._px = undefined;
    const hold = { steer: 0, throttle: 0, brake: 0 }; App.input.poll = () => hold; App.applyPlayerControls = () => {};
    let f = 0; const tick = () => { f++; if (f < 40) requestAnimationFrame(tick); else res(true); }; requestAnimationFrame(tick);
  }));
  // freeze the scene just after the hit and look at it from the side
  const frozen = await page.evaluate(() => { const P = App.session.race.player; return { impact: P.dmg ? { fwL: P.dmg.fwL, fwR: P.dmg.fwR, sus: P.dmg.sus } : null, parts: App.fparts ? App.fparts.list.length : 0, lost: App.session.race.player.mesh.lostWheel }; });
  console.log(JSON.stringify(frozen));
  await page.evaluate(() => { const P = App.session.race.player, h = P.h; window.__fix = () => { const c = App.camera; c.position.set(P.x + Math.cos(h + 0.9) * 8, 3.4, -(P.y + Math.sin(h + 0.9) * 8)); c.lookAt(P.x, 0.4, -P.y); c.fov = 55; c.updateProjectionMatrix(); }; const r0 = App.render.bind(App); App.render = () => { window.__fix(); r0(); }; document.querySelector('#hud').style.visibility = 'hidden'; });
  await page.waitForTimeout(300); await page.screenshot({ path: OUT + 'crash-mid.png', timeout: 120000 });
  await page.waitForTimeout(4000); await page.screenshot({ path: OUT + 'crash-after.png', timeout: 120000 });
  const after = await page.evaluate(() => ({ parts: App.fparts ? App.fparts.list.length : 0, resting: App.fparts ? App.fparts.list.filter((p) => p.rest).length : 0, wheels: App.fparts ? App.fparts.list.filter((p) => p.wheel).length : 0, crashSound: window.__crashCalls }));
  console.log(JSON.stringify(after));
  ok(frozen.parts > 0 || after.parts > 0, 'pieces fly off the car (' + after.parts + ')');
  ok(after.crashSound > 0, 'the crash sound plays');
  ok(after.resting > 0, 'pieces come to rest on the track (' + after.resting + ')');
  ok(!errs.length, 'errors: ' + (errs.join(' | ') || 'none'));
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close();
})();

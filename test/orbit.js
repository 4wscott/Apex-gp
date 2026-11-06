// free camera: a finger drag (phone) and a mouse drag (PC) swing the camera round the car, pinch / scroll zoom, and it
// drifts back behind the car after letting go. usage: node test/orbit.js   (MOBILE=1 for a phone)
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/', OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
const mob = !!process.env.MOBILE, tag = mob ? 'm' : 'pc';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await br.newContext(mob ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript(() => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 0, v: 10, mode: 'practice', track: 'silver', camera: 'chase', radio: 'off', mouseSteer: 'grab' })); });
  await page.goto('http://local/'); await page.waitForTimeout(5000);
  await page.evaluate(() => document.querySelector('#start').click()); await page.waitForFunction(() => App.session && App.session.race, null, { timeout: 120000 }); await page.waitForTimeout(3000);
  const frames = (n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const camAng = () => page.evaluate(() => { const P = App.session.race.player, c = App.camera.position; return Math.atan2(-c.z + P.y, c.x - P.x) - P.h; });
  const a0 = await camAng();
  // drag across the upper middle of the screen (clear of the controls)
  const W = mob ? 844 : 1280, H = mob ? 390 : 720, y = H * 0.35;
  if (mob) {
    const cdp = await ctx.newCDPSession(page); const tp = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await tp('touchStart', W * 0.6); for (let k = 1; k <= 12; k++) { await tp('touchMove', W * 0.6 - k * 25); await frames(1); } await frames(4);
    var during = await page.evaluate(() => ({ on: App.session.orbit && App.session.orbit.on, yaw: App.session.orbit && App.session.orbit.yaw }));
    await page.screenshot({ path: OUT + `orbit-${tag}.png`, timeout: 120000 });
    await tp('touchEnd');
  } else {
    await page.mouse.move(W * 0.6, y); await page.mouse.down(); for (let k = 1; k <= 12; k++) { await page.mouse.move(W * 0.6 - k * 30, y + k * 2); await frames(1); } await frames(4);
    var during = await page.evaluate(() => ({ on: App.session.orbit && App.session.orbit.on, yaw: App.session.orbit && App.session.orbit.yaw, pitch: App.session.orbit.pitch }));
    await page.screenshot({ path: OUT + `orbit-${tag}.png`, timeout: 120000 });
    await page.mouse.up();
    await page.mouse.move(W * 0.5, y); await page.mouse.wheel(0, -400); await frames(3);
    var zoom = await page.evaluate(() => App.session.orbit.dist);
  }
  const a1 = await camAng();
  console.log(JSON.stringify(during), 'camera angle', (a0 * 57.3).toFixed(0), '->', (a1 * 57.3).toFixed(0), zoom !== undefined ? 'zoom dist ' + zoom.toFixed(1) : '');
  ok(during.on && Math.abs(during.yaw) > 1, 'dragging swings the camera round the car (' + (during.yaw * 57.3).toFixed(0) + ' deg)');
  if (!mob) ok(zoom < 7, 'scroll zooms in');
  await page.waitForTimeout(3500); await frames(90);
  const back = await page.evaluate(() => ({ on: App.session.orbit.on, yaw: App.session.orbit.yaw }));
  ok(!back.on || Math.abs(back.yaw) < 0.3, 'drifts back behind the car after letting go ' + JSON.stringify(back));
  ok(!errs.length, 'errors: ' + (errs.join(' | ') || 'none'));
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close();
})();

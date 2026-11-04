// memory: replay storage stays one fixed block in a long session (phone and PC), replays still play, and a crash mid-session is noticed at the next launch
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const SP0 = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, vp, touch] of [['iphone', { width: 844, height: 390 }, true], ['pc', { width: 1280, height: 720 }, false]]) {
    const ctx = await br.newContext({ viewport: vp, hasTouch: touch, isMobile: touch }); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP0 + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
    await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
    await ctx.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
    await ctx.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
    await page.addInitScript(() => { if (!localStorage.getItem('apexgp.settings')) localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 2, v: 7, mode: 'practice', track: 'silver', camera: 'chase', traffic: 21 })); });
    await page.goto('http://local/'); await page.waitForTimeout(6000);
    const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { SIM.settings.quality = 0; document.querySelector('#start').click(); }); await page.waitForTimeout(8000);
    // 45 minutes of recording with 22 cars, sampled as the game does
    const r = await ev(() => { const race = App.session.race; const mb0 = (Replay.rec.data.byteLength / 1e6).toFixed(1); let grew = false; const buf0 = Replay.rec.data;
      for (let k = 0; k < 20 * 60 * 45; k++) { race.time += 0.05; Replay.sample(race); if (Replay.rec.data !== buf0) grew = true; }
      return { cars: race.cars.length, mbFixed: mb0, grewOrCopied: grew, keptMinutes: ((Replay.rec.times.at(-1) - Replay.rec.times[0]) / 60).toFixed(1) }; });
    console.log(name, 'replay storage', JSON.stringify(r));
    await ev(() => { App.togglePause(true); Replay.open('pause'); }); await page.waitForTimeout(1500);
    console.log(' replay opens after a long session:', await ev(() => Replay.on && document.querySelector('#rp-time').textContent));
    await ev(() => Replay.close());
    // simulate the phone killing the page mid-session: the 'running' flag is still set, then the app is opened again
    console.log(' running flag during session:', await ev(() => !!JSON.parse(localStorage.getItem('apexgp.running'))));
    // a crash leaves the flag behind (no clean exit): open the game fresh with the flag still set
    const flag = await ev(() => localStorage.getItem('apexgp.running')); await page.close(); const page2 = await ctx.newPage(); page2.on('pageerror', (e) => errs.push(e.message));
    await page2.addInitScript((f) => { localStorage.setItem('apexgp.running', f); }, flag);
    await page2.goto('http://local/', { timeout: 120000, waitUntil: 'domcontentloaded' }); await page2.waitForTimeout(12000);
    console.log(' next launch:', JSON.stringify(await page2.evaluate(() => ({ toast: document.querySelector('#pad-toast').hidden ? '' : document.querySelector('#pad-toast').textContent, quality: SIM.settings.quality, lastError: (JSON.parse(localStorage.getItem('apexgp.lastError')) || {}).msg }))));
    console.log(' errs', errs); await ctx.close();
  }
  await br.close();
})();

// race screen: start lights at the top with the buttons out of the way, messages in the top strip, radio at the side on a phone
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const SP0 = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, vp, touch] of [['iphone', { width: 844, height: 390 }, true], ['pc', { width: 1280, height: 720 }, false]]) {
    const ctx = await br.newContext({ viewport: vp, hasTouch: touch, isMobile: touch }); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP0 + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
    await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
    await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
    await page.addInitScript(() => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 0, v: 7, mode: 'race', track: 'silver', camera: 'chase', opponents: 5, laps: 3, radio: 'text' })); });
    await page.goto('http://local/'); await page.waitForTimeout(6000);
    const ev = (f, a) => page.evaluate(f, a);
    await ev(() => document.querySelector('#start').click()); await page.waitForTimeout(7000);
    await ev(() => { const r = App.session.race; r.lightsT = Math.max(r.lightsT, 2.6); }); await page.waitForTimeout(2500);
    const box = (sel) => ev((s) => { const e = document.querySelector(s); if (!e || e.hidden || !e.offsetParent) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }, sel);
    console.log(name, 'lights', JSON.stringify(await box('#lightsbar')), 'buttons stepped aside during the start:', await ev(() => document.body.classList.contains('starting')));
    await page.screenshot({ path: SP0 + 'vis-' + name + '-start.png', timeout: 180000 });
    await ev(() => { App.session.race.lightsT = 99; }); await page.waitForTimeout(3000);
    await ev(() => { Hud.banner('Track limits warning 1 of 3', 'info'); Radio.say('Nice move, P3. Gap ahead 1.2 seconds.', 2); Hud.flash('Brake bias 57.0%'); }); await page.waitForTimeout(1500);
    console.log(' banner', JSON.stringify(await box('#banner')), 'radio', JSON.stringify(await box('#radio')), 'flash', JSON.stringify(await box('#flash')), 'buttons back:', !(await ev(() => document.body.classList.contains('starting'))));
    await page.screenshot({ path: SP0 + 'vis-' + name + '-msgs.png', timeout: 180000 });
    console.log(' errs', errs); await ctx.close();
  }
  await br.close();
})();

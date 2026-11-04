// the installed-app build (site/) served over http: assets load from a/, a race starts, and after one visit it works offline
// usage: (cd site && python3 -m http.server 8766) & node test/sitecheck.js
const fs = require('fs'); const { chromium } = require('playwright');
const SP0 = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await br.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = [], fails = [], aFiles = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('response', (r) => { if (r.status() >= 400 && !/youtube|googlevideo|favicon|peerjs/.test(r.url())) fails.push(r.status() + ' ' + r.url()); });
  page.on('request', (r) => { if (r.url().includes('/a/')) aFiles.push(r.url().split('/').pop()); });
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP0 + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.addInitScript(() => { if (!localStorage.getItem('apexgp.settings')) localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 0, v: 8, mode: 'practice', track: 'silver', camera: 'chase' })); });
  await page.goto('http://localhost:8766/', { timeout: 120000 }); await page.waitForTimeout(12000);
  const st = () => page.evaluate(() => ({ models: !!(GFX.models && GFX.models.car && GFX.models.driver && GFX.models.crew && GFX.models.helmet), hdri: Object.keys(HDRI_BUF).length, envOk: !!App.scene.environment, asphaltPhoto: GFX.tex.asphalt.image && (GFX.tex.asphalt.image.src || '').slice(-24), engineLoops: !!(App.audio && (App.audio.loops || []).length) }));
  console.log('online first visit', JSON.stringify(await st()), '| files from a/:', aFiles.length);
  await page.evaluate(() => document.querySelector('#start').click()); await page.waitForTimeout(9000);
  console.log(' race started:', await page.evaluate(() => !!App.session && App.session.race.cars.length + ' cars, model body: ' + !!App.session.race.player.mesh.modelBody));
  await page.screenshot({ path: SP0 + 'site-race.png', timeout: 180000 });
  // offline: the service worker must serve the page and every a/ file
  await page.waitForTimeout(3000); await ctx.setOffline(true);
  await page.reload({ timeout: 120000 }); await page.waitForTimeout(14000);
  console.log('offline reload', JSON.stringify(await st()));
  console.log('fails', fails.slice(0, 6), 'errs', errs.slice(0, 4)); await br.close();
})();

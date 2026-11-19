// The menu showroom: the car and the bike, on a PC screen and a phone. usage: node test/menushot.js [tag]
const { chromium } = require('playwright'); const { open } = require('./visualbase.js');
const OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/menu-' + (process.argv[2] || 'new') + '-';
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const views = (process.env.VIEWS || 'pc,phone').split(',');
  for (const v of views) {
    const view = v === 'pc' ? { viewport: { width: 1280, height: 720 } } : { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
    const page = await open(br, { quality: 2, mode: 'race', track: process.env.TRACK || 'silver', opponents: 5, weather: 'dry', tod: 'noon', series: 'car' }, view);
    await page.evaluate((e) => { if (e.side) window.MENU_SIDE = +e.side; if (e.ang) window.MENU_ANG = +e.ang; }, { side: process.env.SIDE, ang: process.env.ANG });
    await page.waitForTimeout(4000);
    const spin = +(process.env.SPIN || 0.6);
    await page.evaluate((s) => { App.spinTouched = performance.now() + 1e7; App.previewSpin = s; }, spin); await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + v + '-car.png', timeout: 240000 });
    if (!process.env.NOBIKE) {
      await page.evaluate(() => setTimeout(() => document.querySelector('#topbar .series button[data-v="bike"]').click(), 0));
      await page.waitForFunction(() => App.previewCar && App.previewCar.isBike, null, { timeout: 240000 });
      await page.evaluate((s) => { App.spinTouched = performance.now() + 1e7; App.previewSpin = s; }, spin); await page.waitForTimeout(3000);
      await page.screenshot({ path: OUT + v + '-bike.png', timeout: 240000 });
    }
    console.log(v, page.errs.length ? 'ERRORS ' + page.errs.slice(0, 3).join(' | ') : 'no errors');
    await page.close();
  }
  await br.close();
})();

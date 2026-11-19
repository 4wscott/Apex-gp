// Quick check after big changes: the menu, a race, a time trial and a career qualifying all start and run without errors.
// usage: node test/smoke.js
const { chromium } = require('playwright'); const { open, start } = require('./visualbase.js');
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await open(br, { quality: 1, mode: 'race', track: 'silver', camera: 'chase', opponents: 5, weather: 'dry', tod: 'noon', laps: 2 }, { viewport: { width: 960, height: 540 } });
  const m = await page.evaluate(() => ({ preview: !!App.previewCar, driver: !!App.showDriver, teams: document.querySelectorAll('#teams .team').length, series: !!document.querySelector('#topbar .series') }));
  ok(m.preview && m.driver, 'menu: the showroom car and its driver');
  ok(m.teams > 0 && !m.series, `menu: ${m.teams} teams, no Cars / Bikes switch`);
  for (const mode of ['race', 'trial']) {
    await start(page, { mode, track: 'silver' });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 6000)));
    const r = await page.evaluate(() => { const R = App.session.race; return { cars: R.cars.length, moved: R.cars.some((c) => c.v > 1 || c.dist > 5), t: R.time }; });
    ok(r.cars > 0, `${mode}: ${r.cars} cars, race time ${(+r.t).toFixed(1)} s`);
    await page.evaluate(() => App.quit()); await page.waitForTimeout(1500);
  }
  const c = await page.evaluate(async () => {
    Career.newCareer({ name: 'Test Driver', team: 'ardent', replaces: 'LAM', num: 77, laps: 2 });
    Career.startQuali(); await new Promise((ok) => { const t = setInterval(() => { if (App.session && App.session.race) { clearInterval(t); ok(); } }, 200); });
    return { quali: !!App.session.race.quali, team: App.session.race.player.team.name };
  });
  ok(c.quali, `career qualifying starts (${c.team})`);
  ok(!page.errs.length, 'no errors' + (page.errs.length ? ': ' + page.errs.slice(0, 4).join(' | ') : ''));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

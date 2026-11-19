// The bike series in the menus (docs/PLAN-bikes.md, phases 4-6): the Cars / Bikes switch, the bike grid in the team
// picker, a bike career kept apart from the car career, a bike Grand Prix qualifying, a bike time trial and the online
// room settings. usage: node test/bikemenu.js
const { chromium } = require('playwright'); const { open } = require('./visualbase.js');
const OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/bikemenu-';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await open(br, { quality: 1, mode: 'race', track: 'silver', camera: 'chase', opponents: 5, weather: 'dry', tod: 'noon', series: 'car', laps: 2 }, { viewport: { width: 1280, height: 720 } });
  // a car career exists before the switch
  await page.evaluate(() => { Career.newCareer({ name: 'Car Driver', team: 'ardent', replaces: 'LAM', num: 77, laps: 3 }); });
  // the switch
  await page.evaluate(() => setTimeout(() => document.querySelector('#topbar .series button[data-v="bike"]').click(), 0));
  await page.waitForFunction(() => window.GFX && GFX.bikes, null, { timeout: 240000 });
  await page.waitForTimeout(3000);
  const m = await page.evaluate(() => ({ series: SIM.settings.series, pressed: document.querySelector('#topbar .series button[data-v="bike"]').getAttribute('aria-pressed'), teams: [...document.querySelectorAll('#teams .team .t-name')].map((e) => e.textContent), preview: !!(App.previewCar && App.previewCar.isBike), career: Career.data && Career.data.name, sum: document.querySelector('#sum').textContent }));
  ok(m.series === 'bike' && m.pressed === 'true', 'the Cars / Bikes switch selects bikes');
  ok(m.teams.length === 11 && m.teams.includes('Orvane Factory Racing') && !m.teams.includes('Ardent GP'), `the team picker shows the bike championship (${m.teams.slice(0, 3).join(', ')}, ...)`);
  ok(m.preview, 'the showroom shows a bike');
  ok(!m.career, 'the bike career is separate (none yet, the car career is not shown)');
  await page.screenshot({ path: OUT + 'menu.png', timeout: 240000 });
  // a bike career: create it, start the first qualifying
  const c = await page.evaluate(async () => {
    Career.newCareer({ name: 'Bike Rider', team: 'orvane', replaces: 'DOH', num: 99, laps: 3 });
    Career.startQuali(); await new Promise((ok) => { const t = setInterval(() => { if (App.session && App.session.race) { clearInterval(t); ok(); } }, 200); });
    const r = App.session.race; return { series: r.series, quali: !!r.quali, bikes: r.cars.every((x) => x.isBike), team: r.player.team.name, me: r.player.driver.name, key: Career.key(), stored: !!localStorage.getItem('apexgp.careerBike') || !!JSON.stringify(localStorage).includes('Bike Rider') };
  });
  ok(c.series === 'bike' && c.quali && c.bikes, `bike career qualifying: a bike session (${c.me}, ${c.team})`);
  ok(c.key === 'careerBike' && c.stored, 'the bike career has its own save');
  await page.evaluate(() => App.quit()); await page.waitForTimeout(1500);
  // back to cars: the car career is still there, untouched
  await page.evaluate(() => setTimeout(() => document.querySelector('#topbar .series button[data-v="car"]').click(), 0)); await page.waitForFunction(() => SIM.settings.series === 'car' && document.querySelector('#teams .team .t-name') && document.querySelector('#teams .team .t-name').textContent === 'Scuderia Rossa', null, { timeout: 240000 }); await page.waitForTimeout(1500);
  const back = await page.evaluate(() => ({ career: Career.data && Career.data.name, team: Career.team() && Career.team().name, teams: [...document.querySelectorAll('#teams .team .t-name')].map((e) => e.textContent).slice(0, 2) }));
  ok(back.career === 'Car Driver' && back.team === 'Ardent GP', `back on cars: the car career is untouched (${back.career}, ${back.team})`);
  ok(back.teams.includes('Scuderia Rossa'), 'the team picker shows the car teams again');
  // a bike Grand Prix weekend: qualifying uses bikes and a bike reference lap
  await page.evaluate(() => setTimeout(() => document.querySelector('#topbar .series button[data-v="bike"]').click(), 0)); await page.waitForTimeout(1500);
  const gp = await page.evaluate(async () => {
    Weekend.start(); await new Promise((ok) => { const t = setInterval(() => { if (App.session && App.session.race) { clearInterval(t); ok(); } }, 200); });
    const r = App.session.race, P = r.player; P.bestLap = 120; Weekend.finishQuali(r);
    return { series: r.series, rows: document.querySelectorAll('#res-body tr').length, grid: Weekend.pendingGrid.length, title: document.querySelector('#res-title').textContent, team: document.querySelector('#res-body tr td:nth-child(3)').textContent };
  });
  ok(gp.series === 'bike' && gp.rows > 1, `bike Grand Prix qualifying: ${gp.title} (${gp.rows} riders, e.g. ${gp.team})`);
  await page.evaluate(() => { document.querySelector('#results').hidden = true; App.quit(); }); await page.waitForTimeout(1500);
  // the online room tells guests it is a bike race
  const net = await page.evaluate(() => ({ cfg: Net.cfg(), entry: Net.myEntry('Me') }));
  ok(net.cfg.series === 'bike' && net.entry.bikeTeam, `online: the room settings carry the series (${net.cfg.series}), players send their bike team (${net.entry.bikeTeam})`);
  ok(!page.errs.length, 'no errors' + (page.errs.length ? ': ' + page.errs.slice(0, 3).join(' | ') : ''));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

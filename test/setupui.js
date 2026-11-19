// The car setup screen: rows, presets, saved per circuit, applied to the car, the engineer's advice after a practice
// lap, and locked once a race is under way. usage: node test/setupui.js
const { chromium } = require('playwright'); const { open, start } = require('./visualbase.js');
const OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/setup-';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await open(br, { quality: 0, mode: 'practice', track: 'silver', camera: 'chase', opponents: 0, weather: 'dry', tod: 'noon' }, { viewport: { width: 1280, height: 800 } });
  await page.evaluate(() => { Menu.drawer('settings'); document.querySelector('.tab[data-panel="p-setup"]').click(); });
  await page.waitForTimeout(800);
  const u = await page.evaluate(() => ({ rows: document.querySelectorAll('#su-rows .su-row').length, title: document.querySelector('#su-track').textContent, eff: document.querySelector('#su-effect').textContent }));
  ok(u.rows === 19, `${u.rows} setup items (${u.title}); ${u.eff}`);
  await page.screenshot({ path: OUT + 'menu.png' });
  const p = await page.evaluate(() => { document.querySelector('[data-preset="high"]').click(); return { saved: JSON.parse(localStorage.getItem('apexgp.setup.silver') || 'null'), eff: document.querySelector('#su-effect').textContent, other: localStorage.getItem('apexgp.setup.riviera') }; });
  ok(p.saved && p.saved.fw === 10 && !p.other, `the high downforce preset is saved for Silverwood only (${p.eff})`);
  await start(page, { mode: 'practice', track: 'silver' });
  const c = await page.evaluate(() => { const P = App.session.race.player; return { ClA: +P.p.ClA.toFixed(3), base: +P.pBase.ClA.toFixed(3), bias: P.bias }; });
  ok(c.ClA > c.base, `applied to the car: downforce ${c.base} -> ${c.ClA}`);
  // a practice lap driven by the AI, with understeer forced (stiff front bar), then the engineer's view
  const e = await page.evaluate(async () => {
    Setup.set(Object.assign({}, SETUP_STD, { arbF: 11, arbR: 1, sprF: 11 }));
    const race = App.session.race, P = race.player, ai = new SIM.AIDriver(P, 1.04, 3); App.paused = true; const lap0 = P.lapTimes.length;
    for (let f = 0; f < 60 * 200 && P.lapTimes.length < lap0 + 2; f++) { for (let k = 0; k < 6; k++) { const c = ai.control(1 / 360, race.cars, race); race.step(1 / 360, c); } Setup.telemetry(P, 1 / 60); App.handleEvents(race); }
    App.paused = false; Setup.sync();
    return { laps: P.lapTimes.length - lap0, adv: Setup.advise(P), shown: !document.querySelector('#su-eng').hidden, text: document.querySelector('#su-eng-text').textContent };
  });
  ok(e.laps >= 1 && e.adv && e.adv.text, `engineer after ${e.laps} laps: "${e.adv && e.adv.text}" change ${JSON.stringify(e.adv && e.adv.change)}`);
  await page.evaluate(() => App.quit()); await page.waitForTimeout(1000);
  // a race under way: locked
  await start(page, { mode: 'race', track: 'silver', opponents: 3 });
  const l = await page.evaluate(() => { const r = App.session.race; r.phase = 'green'; const before = localStorage.getItem('apexgp.setup.silver'); Setup.set({ fw: 1 }); return { same: before === localStorage.getItem('apexgp.setup.silver'), allowed: App.setupAllowed() }; });
  ok(l.same && !l.allowed, 'locked once the race is under way');
  ok(!page.errs.length, 'no errors' + (page.errs.length ? ': ' + page.errs.slice(0, 3).join(' | ') : ''));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

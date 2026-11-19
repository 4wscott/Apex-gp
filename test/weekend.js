// Race weekends: a full Grand Prix weekend (practice, Q1-Q3, race) with parc fermé, and a career weekend.
// usage: node test/weekend.js
const { chromium } = require('playwright'); const { open } = require('./visualbase.js');
const OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/wk-';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
const waitRace = (page) => page.waitForFunction(() => App.session && App.session.race && App.worldRoot, null, { timeout: 240000 });
// drive the player's car with the AI until n more laps are done (fast, without rendering)
const drive = (page, laps) => page.evaluate(async (laps) => {
  const race = App.session.race, P = race.player, ai = new SIM.AIDriver(P, 1.04, 3), l0 = P.lapTimes.length; App.paused = true;
  for (let f = 0; f < 60 * 400 && P.lapTimes.length < l0 + laps; f++) { for (let k = 0; k < 6; k++) { const c = ai.control(1 / 360, race.cars, race); race.step(1 / 360, c); } Setup.telemetry(P, 1 / 60); App.handleEvents(race); }
  App.paused = false; return P.lapTimes.slice(l0);
}, laps);
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await open(br, { quality: 0, mode: 'race', track: 'silver', camera: 'chase', opponents: 11, weather: 'dry', tod: 'noon', laps: 3, weekend: 'full', pracLen: 5 }, { viewport: { width: 1280, height: 760 } });
  await page.evaluate(() => document.querySelector('#start').click());
  await page.waitForTimeout(500);
  const h = await page.evaluate(() => ({ shown: !document.querySelector('#results').hidden, strip: [...document.querySelectorAll('.wk-s')].map((e) => e.textContent), btn: document.querySelector('#r-again').textContent }));
  ok(h.shown && h.strip.join(',') === 'Practice,Q1,Q2,Q3,Race', `the hub: ${h.strip.join(' → ')} ("${h.btn}")`);
  await page.screenshot({ path: OUT + 'hub.png' });
  // practice
  await page.evaluate(() => document.querySelector('#r-again').click()); await waitRace(page); await page.waitForTimeout(1500);
  const p = await page.evaluate(() => ({ mode: App.session.race.mode, cars: App.session.race.cars.length, label: document.querySelector('#h-pos').textContent, end: !document.querySelector('#p-finishq').hidden }));
  ok(p.mode === 'practice' && p.cars === 12 && /^Practice \d:\d\d/.test(p.label) && p.end, `practice: ${p.cars} cars on track, HUD "${p.label}", End session in the pause menu`);
  const pl = await drive(page, 2);
  await page.evaluate(() => document.querySelector('#p-finishq').click()); await page.waitForTimeout(800);
  const pr = await page.evaluate(() => ({ title: document.querySelector('#res-title').textContent, rows: document.querySelectorAll('#res-body tr').length, extra: document.querySelector('#res-extra').textContent, btn: document.querySelector('#r-again').textContent }));
  ok(pr.rows === 12 && /Practice/.test(pr.title) && pr.btn === 'Drive Q1', `practice classified (${pr.rows} drivers, laps ${pl.map((t) => t.toFixed(1)).join(' ')}): "${pr.extra.slice(0, 140)}"`);
  // setup still open before qualifying
  const open1 = await page.evaluate(() => { Setup.set({ arbF: 7 }); return Setup.get('silver').arbF; });
  ok(open1 === 7, 'before qualifying the setup can change freely');
  // Q1: driven
  await page.evaluate(() => document.querySelector('#r-again').click()); await waitRace(page); await page.waitForTimeout(1000);
  const q = await page.evaluate(() => ({ quali: App.session.race.quali, label: document.querySelector('#h-pos').textContent, cutoff: App.cfg.cutoff, pf: !!Weekend.w.pf }));
  ok(q.quali && q.label === 'Q1' && q.cutoff > 0 && q.pf, `Q1: a qualifying run, cut-off ${q.cutoff && q.cutoff.toFixed(3)} s, parc fermé from now`);
  await drive(page, 2); await page.waitForTimeout(2600);
  const q1 = await page.evaluate(() => ({ title: document.querySelector('#res-title').textContent, msg: (document.querySelector('.wk-msg') || {}).textContent, ko: document.querySelectorAll('#res-body tr.ko').length, next: document.querySelector('#r-again').textContent }));
  ok(/Q1/.test(q1.title) && q1.ko === 3, `Q1 classified: "${q1.msg}", ${q1.ko} knocked out, next "${q1.next}"`);
  // simulate whatever is left of qualifying
  for (let k = 0; k < 3; k++) { const s = await page.evaluate(() => Weekend.cur()); if (!/^Q/.test(s)) break; await page.evaluate(() => document.querySelector('#r-skip').click()); await page.waitForTimeout(300); }
  const g = await page.evaluate(() => ({ grid: Weekend.w.grid, qpos: Weekend.w.qpos, msg: (document.querySelector('.wk-msg') || {}).textContent, next: Weekend.cur() }));
  ok(g.grid && g.grid.length === 12 && g.next === 'R', `qualifying done: "${g.msg}" (grid of ${g.grid && g.grid.length})`);
  await page.screenshot({ path: OUT + 'quali.png' });
  // parc fermé: a bias change is fine, a spring change asks, and going ahead means a pit lane start
  const pf = await page.evaluate(() => {
    Setup.set({ bias: 8 }); const biasOk = Setup.get('silver').bias === 8 && !Weekend.w.pitStart;
    Setup.set({ sprF: 9 }); const asked = !document.querySelector('#su-pf').hidden, unchanged = Setup.get('silver').sprF === 6;
    document.querySelector('#su-pf-ok').click(); return { biasOk, asked, unchanged, after: Setup.get('silver').sprF, pit: Weekend.w.pitStart };
  });
  ok(pf.biasOk && pf.asked && pf.unchanged && pf.after === 9 && pf.pit, 'parc fermé: brake bias free; a spring change asks first, then means a pit lane start');
  // the race: from the pit lane (last), held at the start
  await page.evaluate(() => document.querySelector('#r-again').click()); await waitRace(page); await page.waitForTimeout(1000);
  const r = await page.evaluate(() => { const R = App.session.race; return { mode: R.mode, last: R.player.gridPos === R.cars.length, pit: !!App.cfg.pitStart, wk: !!Weekend.w }; });
  ok(r.mode === 'race' && r.last && r.pit && !r.wk, 'the race starts with you from the pit lane (back of the grid); the Grand Prix weekend is closed');
  await page.evaluate(() => App.quit()); await page.waitForTimeout(1000);
  // career weekend: start it from the career page, simulate to the race
  const c = await page.evaluate(async () => {
    SIM.settings.mode = 'career'; Career.newCareer({ name: 'Test Driver', team: 'ardent', replaces: 'LAM', num: 77, laps: 3 }); Career.render();
    document.querySelector('#cr-weekend').click(); const strip = [...document.querySelectorAll('.wk-s')].map((e) => e.textContent);
    for (let k = 0; k < 6 && /^(P|SQ|Q)/.test(Weekend.cur()); k++) document.querySelector('#r-skip').click();
    const out = { strip, next: Weekend.cur(), qpos: Weekend.w.qpos, saved: !!Career.data.wk };
    document.querySelector('#r-again').click(); await new Promise((ok) => { const t = setInterval(() => { if (App.session && App.session.race && App.session.race.mode === 'race') { clearInterval(t); ok(); } }, 200); });
    out.grid = App.session.race.player.gridPos; out.d = Career.data.qpos; return out;
  });
  ok(c.strip[0] === 'Practice' && c.next === 'R' && c.saved && c.grid === c.qpos && c.d === c.qpos, `career weekend: ${c.strip.join(' → ')}; simulated to the race, P${c.qpos} on the grid`);
  ok(!page.errs.length, 'no errors' + (page.errs.length ? ': ' + page.errs.slice(0, 3).join(' | ') : ''));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

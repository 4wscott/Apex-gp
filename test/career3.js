// Career phase 3: every achievement unlocks from simulated race records; rewards apply (development points, cosmetics
// in the livery editor, the finish on the car); stats add up across seasons; saves keep everything (older saves too).
// usage: node test/career3.js   (MOBILE=1 for the phone size)
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/', OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
const mob = !!process.env.MOBILE, tag = mob ? 'm' : 'pc';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await br.newPage(mob ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/status of (403|429)/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript(() => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 0, mirrors: false, v: 9, mode: 'career' })); });
  await page.goto('http://local/'); await page.waitForTimeout(5000);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { Career.retire(); Career.newCareer({ name: 'Test Driver', num: 42, team: 'grove', replaces: 'SIN', laps: 5 }); Career.render(); });

  // drive the achievement checks with made-up race records
  const res = await ev(() => {
    const d = Career.data, got = new Set(), add = (l) => l.forEach((a) => got.add(a.id));
    const fake = (o = {}) => ({ track: { spec: { id: o.track || d.calendar[0] } }, laps: 5, weather: o.weather || 'dry', player: { lapsLed: o.led || 0, dnf: o.dnf || null, damageMode: 'real', damageLevel: () => o.dmg || 0, dmg: { noses: o.noses || 0 } } });
    const sum = (o = {}) => Object.assign({ pos: 12, grid: 12, finished: true, pens: 0, stops: 1, qpos: 12, matePos: 15, rivalPos: 13, fastest: false, pole: false, pts: 0 }, o);
    const dev0 = d.rd.points;
    add(Ach.afterRace(sum({ pos: 9, pts: 2, grid: 14 }), fake()));                                   // points, charge, clean, mate, rival
    add(Ach.afterRace(sum({ pos: 3, pts: 15, grid: 5, pens: 1 }), fake({ noses: 1 })));                // podium, damage limitation
    add(Ach.afterRace(sum({ pos: 1, pts: 25, grid: 1, pole: true, fastest: true }), fake({ led: 5 }))); // win, pole, fastest, hat-trick, grand slam, lead
    add(Ach.afterRace(sum({ pos: 1, pts: 25, grid: 14 }), fake({ weather: 'mixed' })));               // from the back, rain, comeback
    add(Ach.afterRace(sum({ pos: 6, pts: 8, grid: 8 }), fake()));                                     // streak of 5 in the points
    const st = Ach.stats(); add(Ach.afterSprint(1));
    d.conf = 95; add(Ach.afterRace(sum({ pos: 5, pts: 10 }), fake()));                                // trust
    // long term: pretend the numbers are already there
    st.starts = 99; st.wins = 9; st.podiums = 24; st.wonAt = d.calendar.slice(0, -1); st.teams = ['grove', 'rossa', 'argento'];
    add(Ach.afterRace(sum({ pos: 1, pts: 25, grid: 3 }), fake({ track: d.calendar[d.calendar.length - 1] })));
    // season: champion twice, constructors, beat the team-mate, all goals
    const mate = CareerGoals.mate(); d.points[d.code] = 300; d.points[mate.dr.code] = 100;
    add(Ach.afterSeason({ champMe: true, consMe: true }, { goals: [{ done: true }, { done: true }] }));
    d.season++; add(Ach.afterSeason({ champMe: true, consMe: false }, { goals: [{ done: false }] }));
    const missing = ACH.filter((a) => !got.has(a.id)).map((a) => a.id);
    return { n: got.size, total: ACH.length, missing, dev: d.rd.points - dev0, expectDev: ACH.reduce((a, x) => a + x.dev, 0), unlocks: d.unlocks.slice(), stats: { starts: st.starts, wins: st.wins, titles: st.titles, cTitles: st.cTitles, sprintWins: st.sprintWins } };
  });
  console.log(JSON.stringify(res));
  ok(res.n === res.total, `every achievement unlocks from race records (${res.n} of ${res.total})${res.missing.length ? ' missing: ' + res.missing.join(',') : ''}`);
  ok(res.dev === res.expectDev, `development points paid for each (${res.dev} of ${res.expectDev})`);
  ok(res.unlocks.length === 9, 'all 9 cosmetics unlocked: ' + res.unlocks.join(', '));
  ok(res.stats.titles === 2 && res.stats.cTitles === 1 && res.stats.sprintWins === 1, 'titles, constructors titles and sprint wins counted');
  // no double rewards
  ok(await ev(() => { const before = Career.data.rd.points; Ach.give('win'); Ach.give('champ'); return Career.data.rd.points === before; }), 'an achievement pays only once');
  // the livery editor: unlocked styles are selectable, and the finish reaches the car
  await ev(() => { Career.data.season = 1; Career.save(); Career.render(); Menu.drawer('career'); }); await page.waitForTimeout(800);
  const ed = await ev(() => ({ locked: document.querySelectorAll('#career .livery-ed [data-lock]').length, chrome: !!document.querySelector('#lv-finish [data-v="chrome"]:not([disabled])') }));
  ok(ed.locked === 0 && ed.chrome, 'livery editor: unlocked styles are selectable');
  await ev(() => { document.querySelector('#lv-finish [data-v="chrome"]').click(); document.querySelector('#lv-helmet [data-v="chequer"]').click(); document.querySelector('#lv-number [data-v="gold"]').click(); });
  await page.waitForTimeout(2500);
  const lv = await ev(() => ({ lv: Career.livery(), metal: App.previewCar && App.previewCar.modelBody ? App.previewCar.modelBody.material.metalness : App.previewCar && App.previewCar.paint && App.previewCar.paint.metalness }));
  console.log(JSON.stringify(lv));
  ok(lv.lv.finish === 'chrome' && lv.lv.helmet === 'chequer' && lv.lv.numStyle === 'gold' && lv.metal > 0.8, 'chrome finish, chequered helmet and gold numbers on the showroom car');
  await ev(() => { document.querySelector('#menu').dataset.drawer && Menu.drawer(null); }); await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + `c3-chrome-${tag}.png` });
  // a fresh career: locked styles show the lock and what unlocks them
  const fresh = await ev(() => { const keep = JSON.stringify(Career.data); Career.retire(); Career.newCareer({ name: 'Test Driver', num: 42, team: 'grove', replaces: 'SIN', laps: 5 }); Career.render(); const n = document.querySelectorAll('#career [data-lock]').length, t = (document.querySelector('#lv-finish [data-v="gold"]') || {}).title; Career.data = JSON.parse(keep); Career.save(); Career.render(); return { n, t }; });
  ok(fresh.n === 9 && /World Champion/.test(fresh.t || ''), 'new career: 9 locked styles, each says how to unlock it (' + fresh.t + ')');
  // trophy room and stats on the hub
  await ev(() => { Menu.drawer('career'); }); await page.waitForTimeout(600);
  const hub = await ev(() => ({ slots: document.querySelectorAll('.trophy-slot').length, got: document.querySelectorAll('.trophy-slot.got').length, stats: document.querySelectorAll('.stat-grid > div').length }));
  ok(hub.slots === res.total && hub.got === res.total && hub.stats === 10, 'trophy room shelves and the career stats page ' + JSON.stringify(hub));
  await ev(() => document.querySelector('.trophies').scrollIntoView()); await page.waitForTimeout(400); await page.screenshot({ path: OUT + `c3-trophies-${tag}.png` });
  await ev(() => document.querySelector('.cstats').scrollIntoView()); await page.waitForTimeout(400); await page.screenshot({ path: OUT + `c3-stats-${tag}.png` });
  // saves: a reload keeps it all; an older save without stats is rebuilt from its results
  await page.reload(); await page.waitForTimeout(5000);
  const kept = await ev(() => ({ ach: Object.keys(Career.data.ach || {}).length, unlocks: (Career.data.unlocks || []).length, starts: Career.data.stats.starts }));
  ok(kept.ach === res.total && kept.unlocks === 9 && kept.starts === res.stats.starts, 'reload keeps achievements, unlocks and stats');
  const old = await ev(() => { const d = Career.data; delete d.stats; delete d.ach; delete d.unlocks; d.results = [{ track: d.calendar[0], pos: 1, pts: 25 }, { track: d.calendar[1], pos: 4, pts: 12 }]; Career.render(); return { starts: d.stats.starts, wins: d.stats.wins, ach: Object.keys(d.ach).length }; });
  ok(old.starts === 2 && old.wins === 1 && old.ach === 0, 'older save: stats rebuilt from its results');
  // a real career race: the results screen shows what was unlocked
  await ev(() => { Career.retire(); Career.newCareer({ name: 'Test Driver', num: 42, team: 'rossa', replaces: 'COR', laps: 1 }); Career.startRace(null); });
  for (let i = 0; i < 120 && !(await ev(() => !!(App.session && App.session.race))); i++) await page.waitForTimeout(500);
  await page.waitForTimeout(1500);
  await ev(() => { const r = App.session.race; r.lightsOutAt = 0; const ai = new SIM.AIDriver(r.player, 1.03, 11); let n = 0; while (!r.player.finished && n < 360 * 900) { r.step(1 / 360, ai.control(1 / 360, r.cars, r)); n++; } App.handleEvents(r); });
  for (let i = 0; i < 60 && (await ev(() => { if (window.Podium && Podium.on) Podium.end(); return document.querySelector('#results').hidden; })); i++) await page.waitForTimeout(500);
  const rr = await ev(() => ({ toasts: document.querySelectorAll('#res-extra .ach-toast > div').length, starts: Career.data.stats.starts, ach: Object.keys(Career.data.ach) }));
  console.log(JSON.stringify(rr));
  ok(rr.starts === 1 && (rr.toasts > 0) === (rr.ach.length > 0), 'race results show the achievements just unlocked (' + rr.ach.join(', ') + ')');
  await page.screenshot({ path: OUT + `c3-results-${tag}.png` });
  ok(!errs.length, 'errors: ' + (errs.slice(0, 4).join(' | ') || 'none'));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

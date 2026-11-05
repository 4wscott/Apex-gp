// Career phase 1: season goals per tier, every objective type (pass and fail), team confidence, warning and release,
// team-mate record; then a real career race with screenshots of the hub, loading screen, pause card and results.
// usage: node test/career1.js   (MOBILE=1 for the phone size)
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
  await page.addInitScript(() => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 0, mirrors: false, v: 8, mode: 'career' })); });
  await page.goto('http://local/'); await page.waitForTimeout(5000);
  const ev = (f, a) => page.evaluate(f, a);

  // --- goals by tier
  const tiers = await ev(() => { const out = {}; for (const id of ['rossa', TEAMS[5].id, TEAMS[TEAMS.length - 1].id]) { Career.retire(); const t = TEAMS.find((x) => x.id === id); Career.newCareer({ name: 'Test Driver', num: 42, team: id, replaces: t.drivers[0].code, laps: 5 }); CareerGoals.ensure(); out[teamStats(t).tier + ':' + id] = Career.data.goals.list.map((g) => g.text); } return out; });
  console.log(JSON.stringify(tiers));
  ok(Object.keys(tiers).some((k) => k.startsWith('front')) && Object.values(tiers)[0].includes('Win the drivers\' title'), 'front-runner goal: win the title');
  ok(Object.entries(tiers).some(([k, v]) => k.startsWith('back') && v.includes('Beat your team-mate on points')), 'backmarker goal: beat the team-mate');

  // --- every objective type, pass and fail
  const types = await ev(() => {
    const G = CareerGoals, base = { pos: 5, grid: 9, finished: true, pens: 0, stops: 1, qpos: 9, matePos: 7, rivalPos: 3, fastest: false };
    const cases = [[{ k: 'top', n: 6 }, {}, true], [{ k: 'top', n: 3 }, {}, false], [{ k: 'mate' }, {}, true], [{ k: 'mate' }, { matePos: 2 }, false], [{ k: 'rival' }, {}, false], [{ k: 'rival' }, { rivalPos: 8 }, true],
      [{ k: 'gain', n: 3 }, {}, true], [{ k: 'gain', n: 3 }, { grid: 6 }, false], [{ k: 'quali', n: 10 }, {}, true], [{ k: 'quali', n: 5 }, {}, false], [{ k: 'clean' }, {}, true], [{ k: 'clean' }, { pens: 1 }, false],
      [{ k: 'fastest' }, {}, false], [{ k: 'fastest' }, { fastest: true }, true], [{ k: 'onestop' }, {}, true], [{ k: 'onestop' }, { stops: 2 }, false], [{ k: 'top', n: 6 }, { finished: false }, false]];
    return cases.map(([o, ch, want]) => ({ o: o.k + (o.n || ''), got: G.met(o, Object.assign({}, base, ch)), want }));
  });
  ok(types.every((t) => t.got === t.want), 'objective checks: ' + (types.filter((t) => t.got !== t.want).map((t) => t.o).join(',') || 'all 17 pass/fail cases right'));

  // --- weekend objectives exist and differ through a season
  const wk = await ev(() => { const out = []; for (let r = 0; r < 12; r++) { Career.data.round = r; CareerGoals.ensure(); out.push(Career.data.obj.main.text + ' | ' + Career.data.obj.bonus.text); } Career.data.round = 0; Career.data.obj = null; CareerGoals.ensure(); return out; });
  console.log(wk.slice(0, 6).join('\n'));
  ok(new Set(wk).size >= 5 && wk.every((w) => !/undefined/.test(w)), 'weekend objectives vary across rounds: ' + new Set(wk).size + ' different');

  // --- confidence: rises with objectives, falls without; warning then release
  const conf = await ev(() => {
    const G = CareerGoals, d = Career.data; d.conf = 50; d.obj = { key: 'x', main: { k: 'top', n: 5, text: 'a', reward: 10 }, bonus: { k: 'clean', text: 'b', reward: 6 } };
    const good = G.scoreRace({ pos: 2, grid: 5, finished: true, pens: 0, stops: 1, qpos: 5, matePos: 9, rivalPos: 4 }); const after1 = d.conf;
    const bad = G.scoreRace({ pos: 12, grid: 5, finished: true, pens: 1, stops: 1, qpos: 5, matePos: 9, rivalPos: 4 }); const after2 = d.conf;
    // a bad season: below 20 means a warning, a second one a release
    d.round = d.calendar.length; d.conf = 22; d.warned = false; d.seasonEval = 0; const s1 = G.endSeason();
    d.season++; d.conf = 22; d.seasonEval = 0; d.goals = null; G.ensure(); const s2 = G.endSeason();
    return { good, after1, bad, after2, v1: s1.verdict, v2: s2.verdict, budget: G.seasonBudget() };
  });
  console.log(JSON.stringify(conf));
  ok(conf.after1 > 50 && conf.good.dev === 16, 'objectives met: confidence up (' + conf.after1 + '), +16 development');
  ok(conf.after2 < conf.after1, 'objectives missed: confidence down (' + conf.after2 + ')');
  ok(conf.v1 === 'warning' && conf.v2 === 'released', 'low confidence: warning, then release (' + conf.v1 + ', ' + conf.v2 + ')');
  await ev(() => Career.render()); await page.waitForTimeout(400);
  const rel = await ev(() => ({ stay: !!document.querySelector('#cr-next'), offers: document.querySelectorAll('[data-offer]').length, warn: (document.querySelector('.warn-box') || {}).textContent }));
  ok(!rel.stay && rel.offers > 0 && /released/.test(rel.warn || ''), 'released: no "stay" button, offers to sign');
  await page.screenshot({ path: OUT + `c1-released-${tag}.png`, fullPage: false });

  // --- a real career race: hub, loading screen, pause card and results
  await ev(() => { Career.retire(); Career.newCareer({ name: 'Test Driver', num: 42, team: 'grove', replaces: 'SIN', laps: 1 }); Menu.sync(); });
  await page.waitForTimeout(1500);
  const hub = await ev(() => ({ goals: document.querySelectorAll('#career .sgoals li').length, objs: document.querySelectorAll('#career .objs li').length, mate: !![...document.querySelectorAll('#career h2')].find((h) => h.textContent === 'Team-mate'), conf: (document.querySelector('#career .conf b') || {}).textContent }));
  ok(hub.goals === 3 && hub.objs === 2 && hub.mate && /50/.test(hub.conf), 'hub shows 3 goals, 2 objectives, the team-mate and confidence ' + JSON.stringify(hub));
  await ev(() => { document.querySelector('#menu').dataset.drawer || Menu.drawer('career'); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + `c1-hub-${tag}.png` });
  await ev(() => { const g = document.querySelector('#career .goals'); g && g.scrollIntoView(); });
  await page.waitForTimeout(300); await page.screenshot({ path: OUT + `c1-hub2-${tag}.png` });
  const load = await ev(() => { Career.startRace(null); return document.querySelector('#loading').textContent; });
  ok(/Weekend objectives/.test(load), 'loading screen lists the objectives');
  await page.screenshot({ path: OUT + `c1-loading-${tag}.png` });
  for (let i = 0; i < 120 && !(await ev(() => !!(App.session && App.session.race))); i++) await page.waitForTimeout(500);
  await page.waitForTimeout(1500);
  await ev(() => App.togglePause(true)); await page.waitForTimeout(300);
  ok(await ev(() => !document.querySelector('#p-obj').hidden && /Main/.test(document.querySelector('#p-obj').textContent)), 'pause card shows the objectives');
  await page.screenshot({ path: OUT + `c1-pause-${tag}.png` });
  await ev(() => App.togglePause(false));
  const res = await ev(() => { const r = App.session.race; r.lightsOutAt = 0; const ai = new SIM.AIDriver(r.player, 1.0, 11); let n = 0; while (!r.player.finished && n < 360 * 900) { r.step(1 / 360, ai.control(1 / 360, r.cars, r)); n++; } App.handleEvents(r); return r.finishOrder.indexOf(r.player) + 1; });
  for (let i = 0; i < 60 && (await ev(() => { if (window.Podium && Podium.on) Podium.end(); return document.querySelector('#results').hidden; })); i++) await page.waitForTimeout(500);
  const rs = await ev(() => ({ rows: document.querySelectorAll('#res-extra .res-obj > div').length, conf: Career.data.conf, h2h: Career.data.mateH2h, last: Career.data.last.score }));
  console.log('race P' + res, JSON.stringify(rs));
  ok(rs.rows >= 3 && rs.h2h.ra + rs.h2h.rb === 1, 'results list both objectives and the confidence change; team-mate race record counted');
  await page.screenshot({ path: OUT + `c1-results-${tag}.png` });
  await page.click('#r-again'); await page.waitForTimeout(2000);
  ok(await ev(() => Career.data.round === 1 && Career.data.obj && Career.data.obj.key.startsWith('1-1')), 'next round has new objectives');
  // older saves (no goals, no confidence) still load
  const old = await ev(() => { const d = Career.data; delete d.conf; delete d.goals; delete d.obj; delete d.mateH2h; Career.render(); return { conf: d.conf, goals: d.goals.list.length, obj: !!d.obj }; });
  ok(old.conf === 50 && old.goals === 3 && old.obj, 'an older save gains goals and confidence');
  ok(!errs.length, 'errors: ' + (errs.slice(0, 4).join(' | ') || 'none'));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

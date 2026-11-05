// Phase 2, podium and celebrations: a win plays parc fermé then the podium (drivers, champagne, fireworks, camera
// sweep) and a tap skips to the results; P4 and lower go to the pit box instead; the career finale appears only for
// the champion. Screenshots on PC and phone.  usage: node test/podium.js   (MOBILE=1 for the phone size)
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/', OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
const mob = !!process.env.MOBILE, tag = mob ? 'm' : 'pc';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await br.newPage(mob ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/status of (403|429)/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript(() => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 1, mirrors: false, v: 9, mode: 'race', track: 'silver', camera: 'chase', laps: 1, opponents: 5, aiPace: 0.85, radio: 'text', grid: 'pole' })); });
  await page.goto('http://local/'); await page.waitForTimeout(5000);
  const ev = (f, a) => page.evaluate(f, a);
  const startRace = async (pace) => {
    await ev(() => document.querySelector('#start').click());
    for (let i = 0; i < 120 && !(await ev(() => !!(App.session && App.session.race && App.session.race.cars.length > 3))); i++) await page.waitForTimeout(500);
    await page.waitForTimeout(1500);
    return ev((pace) => { const r = App.session.race; r.lightsOutAt = 0; const ai = new SIM.AIDriver(r.player, pace, 11); let n = 0; while (!r.player.finished && n < 360 * 600) { r.step(1 / 360, ai.control(1 / 360, r.cars, r)); n++; } App.handleEvents(r); return r.results().findIndex((x) => x.car === r.player) + 1; }, pace);
  };
  // --- a win
  const pos = await startRace(1.08);
  console.log('finished P' + pos);
  const stages = [];
  for (let i = 0; i < 60; i++) { const s = await ev(() => (Podium.on ? Podium.stage : document.querySelector('#results').hidden ? 'wait' : 'results')); if (stages[stages.length - 1] !== s) stages.push(s); if (s === 'parc') break; await page.waitForTimeout(250); }
  await ev(() => { Podium.t = 2.5; Podium.hold = true; }); await page.waitForTimeout(1500); await page.screenshot({ path: OUT + `pd-parc-${tag}.png`, timeout: 180000 });
  const parc = await ev(() => ({ vis: App.session.race.cars.filter((c) => c.mesh.grp.visible).length, people: (Podium.people || []).length }));
  console.log(JSON.stringify(parc));
  ok(pos <= 3 && stages.includes('parc'), 'top-3 finish: parc fermé first (' + stages.join(' → ') + ')');
  ok(parc.vis === 3 && parc.people === 3, 'only the first three cars, three drivers on the podium');
  await ev(() => { Podium.hold = false; Podium.t = 3.5; });
  for (let i = 0; i < 160 && (await ev(() => Podium.stage)) !== 'podium'; i++) await page.waitForTimeout(250);
  ok(await ev(() => Podium.stage === 'podium'), 'then the podium');
  for (const [t, name] of [[1.5, 'wide'], [4.5, 'champagne'], [8.4, 'winner']]) { await ev((t) => { Podium.hold = false; Podium.t = t; }, t); await page.waitForTimeout(1200); await ev(() => { Podium.hold = true; }); if (name === 'champagne') globalThis.__live = await ev(() => Array.from(Podium.sp.life).filter((x) => x > 0).length); await page.screenshot({ path: OUT + `pd-${name}-${tag}.png`, timeout: 180000 }); }
  const spray = await ev(() => ({ live: 0, N: Podium.sp.N, bottles: Podium.people.filter((p) => p.bottle.visible).length, fw: (() => { for (let k = 0; k < 60; k++) Podium.fw.update(0.05, App.audio); return Podium.fw.shells.length + Array.from(Podium.fw.life).filter((x) => x > 0).length; })() }));
  spray.live = globalThis.__live;
  console.log(JSON.stringify(spray));
  ok(spray.live > 50 && spray.bottles === 3 && spray.fw > 0, 'champagne spraying from three bottles, fireworks overhead');
  ok(spray.N === (mob ? 600 : 1800), 'particle budget: ' + spray.N + (mob ? ' on a phone' : ' on PC'));
  // the ceremony's own script cost per frame (everything but the GPU)
  const cost = await ev(() => { const r0 = App.render; App.render = () => {}; const t0 = performance.now(); for (let k = 0; k < 20; k++) { Podium.last = performance.now() - 16; Podium.frame(1 / 60); } App.render = r0; return (performance.now() - t0) / 20; });
  console.log('ceremony script ms/frame', cost.toFixed(2));
  ok(cost < 8, 'ceremony script cost per frame ' + cost.toFixed(1) + ' ms');
  await ev(() => { Podium.hold = false; });
  // skip with a tap / click
  await page.mouse.click(400, 200); await page.waitForTimeout(800);
  const after = await ev(() => ({ on: Podium.on, results: !document.querySelector('#results').hidden, hud: document.body.classList.contains('ceremony'), objs: App.worldRoot.children.length }));
  ok(!after.on && after.results && !after.hud, 'tap/click skips to the results');
  await page.screenshot({ path: OUT + `pd-results-${tag}.png`, timeout: 180000 });
  // --- a P4-or-lower finish: the pit box instead
  await ev(() => { document.querySelector('#r-menu').click(); }); await page.waitForTimeout(2500);
  await ev(() => { SIM.settings.grid = 'back'; SIM.settings.aiPace = 1.0; });
  const pos2 = await startRace(0.82);
  const st2 = [];
  for (let i = 0; i < 60; i++) { const s = await ev(() => (Podium.on ? Podium.stage : document.querySelector('#results').hidden ? 'wait' : 'results')); if (st2[st2.length - 1] !== s) st2.push(s); if (s === 'box' || s === 'results') break; await page.waitForTimeout(250); }
  await page.waitForTimeout(2500); await page.screenshot({ path: OUT + `pd-box-${tag}.png`, timeout: 180000 });
  const box = await ev(() => ({ phase: App.session.race.player.pit && App.session.race.player.pit.phase, radio: document.querySelector('#radio-text').textContent }));
  console.log('P' + pos2, st2.join(' → '), JSON.stringify(box));
  ok(pos2 > 3 && st2.includes('box') && !st2.includes('podium'), 'P4 or lower: no podium, the car goes to its pit box');
  ok(/Bring it into the pits/.test(box.radio), 'radio message for the finish');
  for (let i = 0; i < 40 && (await ev(() => document.querySelector('#results').hidden)); i++) await page.waitForTimeout(500);
  ok(await ev(() => !document.querySelector('#results').hidden && !Podium.on), 'then the results by themselves');
  // --- the career finale only for the champion
  const fin = await ev(() => {
    const fake = (mePts, other) => { SIM.settings.mode = 'career'; Career.retire(); Career.newCareer({ name: 'Test Driver', num: 42, team: 'rossa', replaces: 'COR', laps: 1 }); const d = Career.data; d.round = d.calendar.length - 1; d.points = { [d.code]: mePts, NAV: other }; d.teamPoints = { rossa: mePts, argento: other * 2 }; App.cfg = { career: true }; return Podium.titleCheck(App.session.race, App.session.race.results()); };
    return { champ: fake(300, 100), not: fake(10, 300) };
  });
  console.log(JSON.stringify(fin));
  ok(fin.champ && fin.champ.champ && !fin.not, 'finale only when the title is won');
  ok(!errs.length, 'errors: ' + (errs.slice(0, 4).join(' | ') || 'none'));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

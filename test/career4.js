// Career phase 4: title maths (ties, decided early, last-round decider), prize money by constructors' place, the
// season-end ceremony, the hall of fame across seasons, and the live championship line in a race.
// usage: node test/career4.js   (MOBILE=1 for the phone size)
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
  await ev(() => { Career.retire(); Career.newCareer({ name: 'Test Driver', num: 42, team: 'rossa', replaces: 'COR', laps: 5 }); });
  // a helper in the page: put the table at a given round with the given points (me, leader/challenger, third)
  await ev(() => { window.setTable = (round, me, other, third, sprintsLeft) => { const d = Career.data, codes = Career.roster().filter((e) => !e.me).map((e) => e.dr.code); d.round = round; d.sprints = sprintsLeft || []; d.sprintDone = -1; d.points = { [d.code]: me, [codes[0]]: other, [codes[1]]: third }; d.results = [{ pos: 1, pts: 25 }]; d.teamPoints = { rossa: me + 10 }; return codes; }; });
  const n = await ev(() => Career.data.calendar.length);
  const cases = await ev((n) => {
    const out = {};
    setTable(n - 2, 200, 140, 100); out.decided = Champ.titleMaths();            // lead 60 > 50 left: settled
    setTable(n - 2, 200, 150, 100); out.tie = Champ.titleMaths();                // lead 50 = 50 left: still open (a tie goes to count-back)
    setTable(n - 1, 200, 185, 100); out.last = Champ.titleMaths();               // last round, lead 15
    setTable(n - 1, 160, 200, 100); out.chase = Champ.titleMaths();              // 40 behind with 25 left: settled for the leader
    setTable(n - 2, 160, 200, 100); out.must = Champ.titleMaths();               // 40 behind with 50 left: must win
    setTable(n - 2, 200, 170, 100); out.safe = Champ.titleMaths();               // lead 30, 50 left: P2 or better settles it
    setTable(n - 3, 180, 200, 100); out.mid = Champ.titleMaths();                // 20 behind, 75 left
    setTable(n - 2, 200, 150, 100, [n - 1]); out.sprint = Champ.titleMaths();    // a sprint still to come: 58 left, lead 50 open
    return out;
  }, n);
  for (const k in cases) console.log(k.padEnd(8), cases[k].decided, cases[k].rem, cases[k].lead, '|', cases[k].lines.join(' '));
  ok(cases.decided.decided && /champion/.test(cases.decided.lines[0]), 'title decided early when the lead is bigger than the points left');
  ok(!cases.tie.decided, 'a lead equal to the points left is not yet decided (count-back)');
  ok(/Win and you're champion, whatever Navarro does|Finish P\d+ or higher/.test(cases.last.lines[0]), 'last-round decider: what it takes');
  ok(cases.chase.decided && /won the title/.test(cases.chase.lines[0]), 'too far behind with one round left: the leader is champion');
  ok(/Must win/.test(cases.must.lines[0]) && /Win and you're champion, whatever/.test(cases.safe.lines[0]), 'must-win and settle-it lines');
  ok(cases.sprint.rem === 58 && !cases.sprint.decided, 'sprint points count in the points left');
  // prize money and the ceremony
  const prize = await ev(() => { const d = Career.data, codes = setTable(d.calendar.length, 300, 250, 200); d.teamPoints = {}; TEAMS.forEach((t, i) => (d.teamPoints[t.id] = 500 - i * 30)); const before = d.rd.points; const r = Champ.closeSeason(); const again = Champ.closeSeason(); return { r, gained: d.rd.points - before, same: r === again, last: Champ.teamPicture().prize, hof: d.hof.length }; });
  console.log(JSON.stringify(prize));
  ok(prize.r.teamPos === 1 && prize.r.prize === 60 && prize.gained === 60 && prize.same, 'constructors\' P1 pays 60 development points, once');
  ok(await ev(() => { const d = Career.data, n = TEAMS.length; return [1, n].map((p) => Math.round(60 - ((p - 1) / Math.max(1, n - 1)) * 50)).join() === '60,10'; }), 'last place pays 10');
  await ev(() => { Career.render(); Menu.drawer('career'); }); await page.waitForTimeout(800);
  const cer = await ev(() => ({ shown: !document.querySelector('#season-end').hidden, text: document.querySelector('#season-end').innerText }));
  ok(cer.shown && /World Champion/i.test(cer.text) && /Constructors' champion/i.test(cer.text), 'season-end ceremony shows both champions');
  await page.screenshot({ path: OUT + `c4-ceremony-${tag}.png` });
  await ev(() => document.querySelector('#se-ok').click()); await page.waitForTimeout(300);
  ok(await ev(() => document.querySelector('#season-end').hidden), 'ceremony closes to the season review');
  await page.screenshot({ path: OUT + `c4-review-${tag}.png` });
  await ev(() => { Career.render(); }); await page.waitForTimeout(200);
  ok(await ev(() => document.querySelector('#season-end').hidden), 'ceremony shows only once');
  // two more seasons: the hall of fame keeps all of them
  const hof = await ev(() => { Career.nextSeason(); const d = Career.data; for (let s = 0; s < 1; s++) { setTable(d.calendar.length, 10, 300, 200); d.teamPoints = { argento: 400 }; Career.render(); Career.nextSeason(); } return { n: Career.data.hof.length, seasons: Career.data.hof.map((h) => h.season + ':' + h.driver + (h.meChamp ? '*' : '')) }; });
  console.log(JSON.stringify(hof));
  ok(hof.n === 2 && hof.seasons[0].endsWith('*') && !hof.seasons[1].endsWith('*'), 'hall of fame keeps every season');
  await ev(() => { document.querySelector('#season-end').hidden = true; const d = Career.data; setTable(Math.ceil(d.calendar.length / 2) + 1, 120, 131, 90); d.teamPoints = { rossa: 200, argento: 230, [TEAMS[2].id]: 170 }; Career.render(); }); await page.waitForTimeout(500);
  const hub = await ev(() => ({ maths: !!document.querySelector('.champ-maths .tm-lines li'), gap: document.querySelectorAll('.gap-row').length, hof: !![...document.querySelectorAll('#career h2')].find((h) => h.textContent === 'Hall of fame') }));
  ok(hub.maths && hub.gap === 3 && hub.hof, 'hub: title maths, constructors gap chart (3 teams), hall of fame ' + JSON.stringify(hub));
  await ev(() => document.querySelector('.champ-maths').scrollIntoView()); await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + `c4-hub-${tag}.png` });
  // live championship during a race
  await ev(() => Career.startRace(null));
  for (let i = 0; i < 120 && !(await ev(() => !!(App.session && App.session.race))); i++) await page.waitForTimeout(500);
  await ev(() => { const r = App.session.race; r.lightsOutAt = 0; const ai = new SIM.AIDriver(r.player, 1.0, 11); for (let n = 0; n < 360 * 20; n++) r.step(1 / 360, ai.control(1 / 360, r.cars, r)); App.togglePause(true); });
  await page.waitForTimeout(300);
  const live = await ev(() => document.querySelector('#p-obj').innerText);
  console.log(live.replace(/\n/g, ' | '));
  ok(/Championship if the race ended now/i.test(live) && /P\d+ · \d+ pts/.test(live), 'pause card: live championship position');
  await page.screenshot({ path: OUT + `c4-live-${tag}.png` });
  ok(!errs.length, 'errors: ' + (errs.slice(0, 4).join(' | ') || 'none'));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

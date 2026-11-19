// Broadcast replays and live TV: the director's stories and cameras, the name strip and gap, highlights, and
// "Watch on TV" (the AI drives your car while the director films). usage: node test/broadcast.js
const { chromium } = require('playwright'); const { open, start } = require('./visualbase.js');
const OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/tv-';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await open(br, { quality: 1, mode: 'race', track: 'silver', camera: 'chase', opponents: 11, weather: 'dry', tod: 'noon', laps: 5 }, { viewport: { width: 1280, height: 720 } });
  await start(page, { mode: 'race', track: 'silver', laps: 5, opponents: 11 });
  // 90 s of racing (the AI drives you), recorded as the game does
  await page.evaluate(() => {
    const race = App.session.race, P = race.player, ai = new SIM.AIDriver(P, 0.97, 3); App.paused = true;
    for (let f = 0; f < 60 * 90; f++) { for (let k = 0; k < 6; k++) { const c = ai.control(1 / 360, race.cars, race); race.step(1 / 360, c); } App.handleEvents(race); Replay.sample(race); }
    App.paused = false;
  });
  const r = await page.evaluate(async () => {
    const R = Replay.rec, kinds = {}; R.marks.forEach((m) => (kinds[m.kind] = (kinds[m.kind] || 0) + 1));
    Replay.open('results'); Replay.t = R.times[0] + 2; // from the start
    const shots = []; let last = null;
    for (let f = 0; f < 60 * 70; f++) { Replay.frame(1 / 60); Replay.camera(App.camera); const s = Replay.shot; if (s && s !== last) { shots.push(s.kind + ':' + s.mode); last = s; } }
    const name = document.querySelector('#rp-name').textContent;
    return { kinds, shots, name };
  });
  const cams = new Set(r.shots.map((s) => s.split(':')[1])), stories = new Set(r.shots.map((s) => s.split(':')[0]));
  ok(r.kinds.pass > 0, `the recording marks the story: ${JSON.stringify(r.kinds)}`);
  ok(cams.size >= 4 && stories.size >= 2, `director over 70 s of replay: ${r.shots.length} shots, cameras ${[...cams].join(', ')}, stories ${[...stories].join(', ')}`);
  ok(r.name.length > 3, `the name strip: "${r.name}"`);
  for (const m of ['apex', 'heli', 'tcam', 'wing']) { await page.evaluate((m) => { Replay.camMode = m; }, m); await page.waitForTimeout(1200); await page.screenshot({ path: OUT + m + '.png', timeout: 240000 }); }
  await page.evaluate(() => { Replay.camMode = 'director'; Replay.shot = null; }); await page.waitForTimeout(1500); await page.screenshot({ path: OUT + 'director.png', timeout: 240000 });
  const hl = await page.evaluate(() => { Replay.close(); Replay.open('highlights'); const n = Replay.clips.length; Replay.close(); return n; });
  ok(hl >= 3, `highlights: ${hl} clips`);
  // live TV
  await page.evaluate(() => { document.querySelector('#results').hidden = true; App.togglePause(true); document.querySelector('#p-tv').click(); });
  const d0 = await page.evaluate(() => App.session.race.player.dist);
  await page.waitForTimeout(6000);
  const tv = await page.evaluate((d0) => ({ on: Replay.tvOn, moved: App.session.race.player.dist - d0, tag: document.querySelector('#rp-tag').textContent, live: document.body.classList.contains('tv-live'), mode: Replay.shown, btn: document.querySelector('#p-tv').textContent }), d0);
  ok(tv.on && tv.live && tv.tag === 'LIVE' && tv.moved > 1, `live TV: the AI drove your car ${tv.moved.toFixed(0)} m, camera "${tv.mode}", tag ${tv.tag}, pause button now "${tv.btn}"`);
  await page.screenshot({ path: OUT + 'live.png', timeout: 240000 });
  ok(!page.errs.length, 'no errors' + (page.errs.length ? ': ' + page.errs.slice(0, 3).join(' | ') : ''));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

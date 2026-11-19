// The race engineer: the plan on the radio after the start, the strategy line on the pause screen, a Safety Car call.
// usage: node test/strategy.js
const { chromium } = require('playwright'); const { open, start } = require('./visualbase.js');
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await open(br, { quality: 0, mode: 'race', track: 'silver', camera: 'chase', opponents: 9, weather: 'dry', tod: 'noon', laps: 12, radio: 'text' }, { viewport: { width: 1100, height: 650 } });
  await start(page, { mode: 'race', track: 'silver', laps: 12, opponents: 9 });
  const r = await page.evaluate(async () => {
    const said = []; const o = Radio.say.bind(Radio); Radio.say = (t, p, k) => { said.push(t); return o(t, p, k); };
    const race = App.session.race, P = race.player, ai = new SIM.AIDriver(P, 1.0, 3); App.paused = true;
    for (let f = 0; f < 60 * 400 && P.lap < 4; f++) { for (let k = 0; k < 6; k++) { const c = ai.control(1 / 360, race.cars, race); race.step(1 / 360, c); } App.handleEvents(race); }
    race.rc = race.rc || { yellowUntil: [0, 0, 0], vscCool: 0, blueT: 0, vscWarn: 0, over: 0 }; race.deploySC();
    for (let f = 0; f < 60 * 3; f++) { for (let k = 0; k < 6; k++) { const c = ai.control(1 / 360, race.cars, race); race.step(1 / 360, c); } App.handleEvents(race); }
    App.paused = false; App.togglePause(true);
    return { said, strat: document.querySelector('#p-strat').textContent, shown: !document.querySelector('#p-strat').hidden, lap: P.lap };
  });
  ok(r.said.some((t) => /^Plan A:/.test(t)), `the plan on the radio: "${(r.said.find((t) => /^Plan A/.test(t)) || '').slice(0, 120)}"`);
  ok(r.shown && /^Strategy:/.test(r.strat), `pause screen: "${r.strat}"`);
  ok(r.said.some((t) => /safety car/i.test(t)), `Safety Car call: "${r.said.find((t) => /safety car/i.test(t)) || 'none'}"`);
  ok(!page.errs.length, 'no errors' + (page.errs.length ? ': ' + page.errs.slice(0, 3).join(' | ') : ''));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

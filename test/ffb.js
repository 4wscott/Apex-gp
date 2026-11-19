// Force feedback with a pretend Logitech wheel and a pretend Xbox controller: the commands the game sends while the
// AI drives the player's car round Silverwood. usage: node test/ffb.js
const { chromium } = require('playwright'); const { open, start } = require('./visualbase.js');
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await open(br, { quality: 0, mode: 'practice', track: 'silver', camera: 'chase', opponents: 0, weather: 'dry', tod: 'noon' }, { viewport: { width: 800, height: 450 } });
  const ui = await page.evaluate(() => ({ btn: !!document.querySelector('#ffb-connect'), status: document.querySelector('#ffb-status').textContent, rows: !!document.querySelector('[data-set="triggerRumble"]') }));
  ok(ui.btn && ui.rows, `settings: the force feedback rows are there ("${ui.status}")`);
  await start(page, { mode: 'practice', track: 'silver' });
  const r = await page.evaluate(async () => {
    const hid = [], pad = [];
    await FFB.attach({ opened: true, productName: 'Pretend G29', collections: [{ outputReports: [{ reportId: 0 }], children: [] }], sendReport: (id, d) => { hid.push(Array.from(d)); return Promise.resolve(); } });
    const fake = { id: 'Xbox Wireless Controller (045e)', index: 0, mapping: 'standard', buttons: [], axes: [0, 0, 0, 0], vibrationActuator: { effects: ['dual-rumble', 'trigger-rumble'], playEffect: (t, o) => { pad.push([t, o]); return Promise.resolve('complete'); } } };
    App.input.pad = () => fake; App.input.lastDevice = 'gamepad';
    // drive with the AI for 25 simulated seconds, calling the force feedback as the game does each frame
    const race = App.session.race, P = race.player, ai = new SIM.AIDriver(P, 1.0, 3); App.paused = true;
    let maxTq = 0;
    for (let f = 0; f < 25 * 60; f++) {
      for (let k = 0; k < 6; k++) { const c = ai.control(1 / 360, race.cars, race); race.step(1 / 360, c); }
      maxTq = Math.max(maxTq, Math.abs(P.steerTq || 0)); FFB.busy = false;
      FFB.update(1 / 60, P, race, ai.control(1 / 360, race.cars, race));
    }
    FFB.release(); await new Promise((r) => setTimeout(r, 100)); App.paused = false;
    const forces = hid.filter((d) => d[0] === 0x11).map((d) => d[2]);
    return { first: hid[0], n: hid.length, forces: forces.length, lo: Math.min(...forces), hi: Math.max(...forces), stop: hid.map((d) => d[0]).join(',').includes('19,254,20'), pad: pad.length, kinds: [...new Set(pad.map((p) => p[0]))], maxTq: Math.round(maxTq), trig: pad.some((p) => p[1].leftTrigger > 0 || p[1].rightTrigger > 0) };
  });
  ok(r.first && r.first[0] === 0xf5, 'the wheel: its own centring spring is switched off first');
  ok(r.forces > 100 && r.lo < 100 && r.hi > 156, `the wheel: ${r.forces} force commands, from ${r.lo} to ${r.hi} (128 = none; steering torque up to ${r.maxTq} N m)`);
  ok(r.stop, 'the wheel: released afterwards (force stopped, its centring spring back)');
  ok(r.pad > 20 && r.kinds.includes('trigger-rumble'), `controller: ${r.pad} rumble effects (${r.kinds.join(', ')}), triggers used: ${r.trig}`);
  ok(!page.errs.length, 'no errors' + (page.errs.length ? ': ' + page.errs.slice(0, 3).join(' | ') : ''));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

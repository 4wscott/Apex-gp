// PC mouse steering: the F1 wheel shows bottom right; grabbing and turning it steers the car (and it springs back);
// follow mode steers with the mouse position and drives the pedals with the buttons; keys take over again.
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/', OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await br.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript(() => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 0, mirrors: false, v: 9, mode: 'practice', track: 'silver', camera: 'chase', radio: 'off' })); });
  await page.goto('http://local/'); await page.waitForTimeout(5000);
  const ev = (f, a) => page.evaluate(f, a);
  const frames = (n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  await ev(() => document.querySelector('#start').click()); await page.waitForTimeout(9000);
  const box = await ev(() => { const r = document.querySelector('#mwheel').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, vis: !document.querySelector('#mwheel').hidden }; });
  console.log(JSON.stringify(box));
  ok(box.vis && box.x > 900 && box.y > 450, 'wheel shows in the bottom right');
  const dash = await ev(() => document.querySelector('#dash').getBoundingClientRect().right);
  ok(dash < box.x, 'the dashboard moves left of the wheel');
  await page.screenshot({ path: OUT + 'mw-straight.png' });
  // grab the right grip and pull it down: a right turn
  const cx = box.x + box.w / 2, cy = box.y + (box.h - 18) / 2;
  await page.mouse.move(cx + 110, cy); await page.mouse.down();
  for (let k = 1; k <= 10; k++) { const a = (k / 10) * 0.9; await page.mouse.move(cx + 110 * Math.cos(a), cy + 110 * Math.sin(a)); await frames(8); }
  await frames(10);
  const turning = await ev(() => ({ steer: App.input.state.steer, delta: App.session.race.player.delta, rot: document.querySelector('#mw-rot').style.transform }));
  console.log(JSON.stringify(turning));
  ok(turning.steer < -0.3 && turning.delta < -0.02, 'turning the wheel clockwise steers right');
  await page.screenshot({ path: OUT + 'mw-turn.png' });
  await page.locator('#mwheel').screenshot({ path: OUT + 'mw-close.png' });
  await page.mouse.up(); await frames(20);
  console.log('after release', JSON.stringify(await ev(() => ({ g: MouseWheel.grabbing, tgt: MouseWheel.tgt, st: MouseWheel.steer, s: App.input.state.steer }))));
  ok(await ev(() => Math.abs(App.input.state.steer) < 0.05), 'let go: the wheel springs back to centre');
  // keys still drive the pedals while the mouse steers
  await page.keyboard.down('ArrowUp'); await frames(11);
  ok(await ev(() => App.input.state.throttle > 0.5), 'throttle on the keyboard with the mouse wheel');
  await page.keyboard.up('ArrowUp');
  // reverse: stopped, hold S (the brake) and the car backs up
  await ev(() => { const P = App.session.race.player; P.vx = P.vy = P.r = 0; });
  await page.keyboard.down('KeyS'); await frames(60); await page.waitForTimeout(1500); await frames(30);
  const rev = await ev(() => ({ rev: App.session.race.player.reverse, vx: App.session.race.player.vx }));
  await page.keyboard.up('KeyS'); console.log(JSON.stringify(rev));
  ok(rev.rev && rev.vx < -0.3, 'hold S when stopped: the car reverses');
  // follow mode: mouse position steers, left button accelerates, right button brakes
  await ev(() => { SIM.settings.mouseSteer = 'follow'; App.applyLive('mouseSteer'); });
  await page.mouse.move(200, 300); await frames(10);
  const left = await ev(() => App.input.state.steer);
  await page.mouse.down({ button: 'left' }); await frames(11);
  const thr = await ev(() => App.input.state.throttle); await page.mouse.up({ button: 'left' });
  await page.mouse.down({ button: 'right' }); await frames(11);
  const brk = await ev(() => App.input.state.brake); console.log('brk', JSON.stringify(await ev(() => ({ on: MouseWheel.brkOn, b: MouseWheel.brk })))); await page.mouse.up({ button: 'right' });
  console.log({ left, thr, brk });
  ok(left > 0.5 && thr > 0.5 && brk > 0.5, 'follow mode: mouse left steers left, left button throttle, right button brake');
  // steering keys take back over
  await page.keyboard.down('ArrowRight'); await frames(8);
  ok(await ev(() => App.input.state.steer < -0.2), 'a steering key takes over from the mouse'); await page.keyboard.up('ArrowRight');
  await ev(() => { SIM.settings.mouseSteer = 'off'; App.applyLive('mouseSteer'); });
  ok(await ev(() => document.querySelector('#mwheel').hidden), 'Off hides the wheel');
  ok(!errs.length, 'errors: ' + (errs.join(' | ') || 'none'));
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close();
})();

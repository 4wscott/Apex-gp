// Phase 5, real car damage: each kind of hit damages the right part; each kind of damage changes the handling the way it
// should (measured with the test driver); punctures deflate and are fixed by new tyres; a nose change costs ~8 s;
// retirements park the car and classify the race; the three damage settings; screenshots on PC and phone.
// usage: node test/damage.js   (MOBILE=1 for the phone size)
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
  await page.addInitScript(() => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 0, mirrors: false, v: 9, mode: 'race', track: 'silver', camera: 'chase', laps: 3, opponents: 5, radio: 'text' })); });
  await page.goto('http://local/'); await page.waitForTimeout(5000);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => {
    const { Car, AIDriver } = SIM, T = App.getTrack('silver'), tm = TEAMS[3];
    window.mk = (mode) => { const c = new Car(T, tm, tm.drivers[0], { damage: mode || 'real', assist: { tc: 2, abs: true, autoGear: true } }); c.place(0, T.lineO[0], 0); return c; };
    window.T = T;
    // a straight run at a fixed speed with the wheel held straight: how far the car drifts sideways in 3 s
    window.drift = (c) => { let i = 0; for (; i < T.n; i++) if (Math.abs(T.kapW[i]) < 1 / 3000 && Array.from({ length: 60 }, (_, k) => Math.abs(T.kapW[(i + k) % T.n])).every((x) => x < 1 / 3000)) break; c.place(i, 0, 70); const d0 = c.d; for (let n = 0; n < 360 * 2; n++) { c.step(1 / 360, { steer: 0, throttle: 0.75, brake: 0 }); } return c.d - d0; };
    // the AI test driver's flying lap (seconds), from a standing start a lap earlier
    window.lap = (c) => { const ai = new AIDriver(c, 1, 3); ai.noise = 0; ai.noiseT = 1e9; c.place(0, T.lineO[0], 40); let t = 0, s0 = null; const L = T.length; c.dist = 0; c.lastS = c.s; for (let n = 0; n < 360 * 400; n++) { c.step(1 / 360, ai.control(1 / 360, [c], null)); t += 1 / 360; if (s0 === null && c.dist > 200) s0 = t; if (c.dist > 200 + L) return t - s0; } return NaN; };
    window.vmax = (c) => { let i = 0, best = 0; c.place(0, T.lineO[0], 40); const ai = new AIDriver(c, 1, 3); ai.noise = 0; ai.noiseT = 1e9; c.dist = 0; c.lastS = c.s; for (let n = 0; n < 360 * 120 && c.dist < T.length; n++) { c.step(1 / 360, ai.control(1 / 360, [c], null)); best = Math.max(best, c.vx); } return best * 3.6; };
  });

  // --- 1. each kind of hit damages the right part
  const hits = await ev(() => {
    const o = {};
    let c = mk(); c.damageHit(1, 0.6, 30, 'wall'); o.frontLeft = { fwL: c.dmg.fwL, fwR: c.dmg.fwR, sus0: c.dmg.sus[0] };
    c = mk(); c.damageHit(1, -0.6, 22, 'wall'); o.frontRight = { fwL: c.dmg.fwL, fwR: c.dmg.fwR };
    c = mk(); c.damageHit(-1, 0.1, 34, 'car'); o.rear = { rw: c.dmg.rw, sus2: c.dmg.sus[2], pu: c.dmg.pu, fw: c.wingHealth };
    c = mk(); c.damageHit(0.2, -1, 28, 'wall'); o.sideRight = { sus1: c.dmg.sus[1], floor: c.dmg.floor, fw: c.wingHealth };
    c = mk(); c.damageHit(-0.2, 1, 28, 'wall'); o.sideRearLeft = { sus2: c.dmg.sus[2] };
    c = mk(); c.damageHit(1, 0.6, 11, 'wall'); o.light = c.damageLevel();
    // a real wall impact: nose first into the left wall at 45 degrees
    c = mk(); let i = 300; const side = 1; c.place(i, T.wallL[i] - 6, 45); c.h += 0.75; for (let n = 0; n < 360 * 2 && !c.impact; n++) c.step(1 / 360, { steer: 0, throttle: 0.6, brake: 0 }); o.wall = { impact: +c.impact.toFixed(1), fwL: +c.dmg.fwL.toFixed(2), fwR: +c.dmg.fwR.toFixed(2) };
    // car to car: B runs into the back of A
    const A = mk(), B = mk(); A.place(400, 0, 30); B.place(400, 0, 30); const back = 4.6; B.x -= Math.cos(A.h) * back; B.y -= Math.sin(A.h) * back; B.vx = 52;
    for (let n = 0; n < 360; n++) { A.step(1 / 360, { steer: 0, throttle: 0, brake: 0 }); B.step(1 / 360, { steer: 0, throttle: 1, brake: 0 }); collideCarsT([A, B]); }
    o.car = { Brw: +B.dmg.rw.toFixed(2), Bfw: +B.wingHealth.toFixed(2), Arw: +A.dmg.rw.toFixed(2), Afw: +A.wingHealth.toFixed(2) };
    return o;
  });
  console.log(JSON.stringify(hits));
  ok(hits.frontLeft.fwL < 0.5 && hits.frontLeft.fwL < hits.frontLeft.fwR && hits.frontLeft.sus0 < 1, 'front-left hit: left wing half (and front-left suspension at 30 m/s)');
  ok(hits.frontRight.fwR < hits.frontRight.fwL, 'front-right hit: right wing half');
  ok(hits.rear.rw < 0.6 && hits.rear.sus2 < 1 && hits.rear.pu < 1 && hits.rear.fw === 1, 'hit from behind: rear wing, rear suspension, gearbox; front untouched');
  ok(hits.sideRight.sus1 < 1 && hits.sideRight.floor < 1 && hits.sideRight.fw === 1, 'side hit: that corner and the floor');
  ok(hits.sideRearLeft.sus2 < 1, 'side hit further back: the rear corner');
  ok(hits.light === 0, 'a light touch (under 12 m/s) does nothing');
  ok(hits.wall.impact > 12 && hits.wall.fwL < hits.wall.fwR, 'real wall crash, nose first into the left wall: left wing ' + JSON.stringify(hits.wall));
  ok(hits.car.Bfw < 1 && hits.car.Arw < 1 && hits.car.Afw === 1, 'car into the back of another: its nose, the other car\'s rear wing ' + JSON.stringify(hits.car));

  // --- 2. the handling changes (and only in realistic mode)
  const feel = await ev(() => {
    const o = {};
    o.driftOk = drift(mk());
    let c = mk(); c.dmg.fwL = 0; o.driftWingL = drift(c);
    c = mk(); c.dmg.fwR = 0; o.driftWingR = drift(c);
    c = mk('visual'); c.dmg.fwL = 0; o.driftVisual = drift(c);
    c = mk(); c.dmg.sus[1] = 0.4; o.driftSusFR = drift(c);
    c = mk(); c.dmg.punct[0] = 1; c.dmg.tyre[0] = 0.05; o.driftFlatFL = drift(c);
    o.lapOk = lap(mk());
    c = mk(); c.dmg.floor = 0.2; o.lapFloor = lap(c);
    c = mk(); c.dmg.rw = 0.1; o.lapRw = lap(c); c = mk(); c.dmg.rw = 0.1; o.vRw = vmax(c); o.vOk = vmax(mk());
    c = mk(); c.dmg.pu = 0.3; o.vPu = vmax(c);
    c = mk(); c.dmg.fwL = c.dmg.fwR = 0.1; o.lapFw = lap(c);
    c = mk('visual'); c.dmg.floor = 0.2; c.dmg.fwL = 0; o.lapVisual = lap(c);
    return o;
  });
  console.log(JSON.stringify(feel, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
  ok(Math.abs(feel.driftOk) < 0.3, 'healthy car runs straight (' + feel.driftOk.toFixed(2) + ' m)');
  ok(feel.driftWingL > 0.8 && feel.driftWingR < -0.8, 'missing wing half: pulls toward that side (left +' + feel.driftWingL.toFixed(1) + ' m, right ' + feel.driftWingR.toFixed(1) + ' m in 2 s)');
  ok(feel.driftSusFR < -0.5, 'bent front-right suspension pulls right (' + feel.driftSusFR.toFixed(1) + ' m)');
  ok(feel.driftFlatFL > 1, 'flat front-left tyre pulls left (' + feel.driftFlatFL.toFixed(1) + ' m)');
  ok(Math.abs(feel.driftVisual) < 0.3 && Math.abs(feel.lapVisual - feel.lapOk) < 0.3, 'visual-only damage does not change the handling');
  ok(feel.lapFloor > feel.lapOk + 1, 'floor damage: slower lap (+' + (feel.lapFloor - feel.lapOk).toFixed(1) + ' s)');
  ok(feel.lapFw > feel.lapOk + 0.3, 'front wing gone: slower lap (+' + (feel.lapFw - feel.lapOk).toFixed(1) + ' s)');
  ok(feel.vRw > feel.vOk && feel.lapRw > feel.lapOk, 'rear wing damage: higher top speed (' + feel.vRw.toFixed(0) + ' vs ' + feel.vOk.toFixed(0) + ' km/h), slower lap');
  ok(feel.vPu < feel.vOk - 8, 'power unit damage: lower top speed (' + feel.vPu.toFixed(0) + ' km/h)');

  // --- 3. punctures, nose changes, retirements, the three settings
  const misc = await ev(() => {
    const o = {};
    let c = mk(); c.puncture(2); for (let n = 0; n < 360 * 2; n++) c.step(1 / 360, { steer: 0, throttle: 0, brake: 0 }); o.half = +c.dmg.tyre[2].toFixed(2); for (let n = 0; n < 360 * 3; n++) c.step(1 / 360, { steer: 0, throttle: 0, brake: 0 }); o.flat = +c.dmg.tyre[2].toFixed(2);
    c = mk(); c.dmg.sus[3] = 0.3; c.damageHit(-0.2, -1, 30, 'wall'); o.dnf = c.dnf;
    c = mk('visual'); c.dmg.sus[3] = 0.3; c.damageHit(-0.2, -1, 30, 'wall'); o.dnfVisual = c.dnf; o.visualRecorded = c.dmg.sus[3] < 0.3;
    c = mk('off'); c.damageHit(1, 0.5, 40, 'wall'); c.puncture(0); o.off = c.damageLevel();
    return o;
  });
  console.log(JSON.stringify(misc));
  ok(misc.half < 0.6 && misc.half > 0.3 && misc.flat <= 0.06, 'puncture deflates over about 4 s (' + misc.half + ' at 2 s, ' + misc.flat + ' at 5 s)');
  ok(misc.dnf === 'Suspension damage' && !misc.dnfVisual && misc.visualRecorded, 'terminal suspension damage retires the car in realistic mode only');
  ok(misc.off === 0, 'damage off: nothing is damaged');

  // a race: the nose change, the puncture fixed by new tyres, and a retirement (AI and player)
  await ev(() => document.querySelector('#start').click());
  for (let i = 0; i < 120 && !(await ev(() => !!(App.session && App.session.race && App.session.race.cars.length > 3))); i++) await page.waitForTimeout(500);
  await page.waitForTimeout(1500);
  const race = await ev(() => {
    const r = App.session.race, P = r.player, o = {}; r.lightsOutAt = 0;
    const ai = new SIM.AIDriver(P, 1, 9);
    for (let n = 0; n < 360 * 12; n++) r.step(1 / 360, ai.control(1 / 360, r.cars, r));
    // the player: front wing damage and a puncture, then a pit stop
    P.dmg.fwL = 0.3; P.puncture(1); r.damageReport(P); App.handleEvents(r);
    o.radio = document.querySelector('#radio-text').textContent; o.banner = document.querySelector('#banner').textContent;
    r.requestPit(P, 'H');
    let svc = null; for (let n = 0; n < 360 * 240 && !(P.stops > 0); n++) { r.step(1 / 360, ai.control(1 / 360, r.cars, r)); if (P.pit && P.pit.phase === 'stop' && svc === null) svc = P.pit.service; }
    o.service = svc; o.afterPit = { fw: P.wingHealth, tyre: P.dmg.tyre.slice(), punct: P.dmg.punct.slice(), noses: P.dmg.noses };
    // an AI car retires: it pulls over and parks off the racing line
    const A = r.cars.find((c) => c !== P && !c.pit); A.dmg.sus[0] = 0.05; A.dnf = 'Suspension damage';
    for (let n = 0; n < 360 * 10; n++) r.step(1 / 360, ai.control(1 / 360, r.cars, r));
    o.ai = { parked: A.parked, d: +A.d.toFixed(1), hw: r.track.hw, last: r.standings()[r.standings().length - 1] === A };
    return o;
  });
  console.log(JSON.stringify(race));
  ok(/Front left wing/.test(race.radio + race.banner) && /Puncture/.test(race.radio + ' ' + race.banner + ' ' + (await ev(() => Radio.q.join(' ')))), 'damage reported on team radio / banner');
  ok(race.service > 9.5 && race.service < 13, 'nose change makes the stop about 8 s longer (' + (race.service || 0).toFixed(1) + ' s)');
  ok(race.afterPit.fw === 1 && race.afterPit.punct.every((x) => !x) && race.afterPit.tyre.every((x) => x === 1) && race.afterPit.noses === 1, 'pit stop: new nose and the puncture fixed');
  ok(race.ai.parked && Math.abs(race.ai.d) > race.ai.hw && race.ai.last, 'AI retirement: parks off the track, classified last ' + JSON.stringify(race.ai));
  // HUD damage diagram and the visuals
  await ev(() => { const r = App.session.race, P = r.player; P.dmg.fwR = 0.2; P.dmg.rw = 0.3; P.dmg.sus[2] = 0.5; P.puncture(0); P.dmg.pu = 0.4; App.paused = false; });
  await page.waitForTimeout(2500);
  ok(await ev(() => !document.querySelector('#h-dmg').hidden), 'HUD damage diagram shows');
  await page.screenshot({ path: OUT + `dmg-hud-${tag}.png` });
  await ev(() => { App.paused = true; const P = App.session.race.player, h = P.h; window.__fix = () => { const c = App.camera; c.position.set(P.x + Math.cos(h + 0.9) * 5.5, 1.8, -(P.y + Math.sin(h + 0.9) * 5.5)); c.lookAt(P.x, 0.4, -P.y); }; const r0 = App.render.bind(App); App.render = () => { window.__fix(); r0(); };  });
  await page.waitForTimeout(1500); await page.screenshot({ path: OUT + `dmg-car-${tag}.png` });
  // the player retires: the race is classified and the results show
  await ev(() => { const r = App.session.race, P = r.player; App.paused = false; P.dmg.sus[0] = 0.05; P.dnf = 'Suspension damage'; });
  for (let i = 0; i < 120 && (await ev(() => document.querySelector('#results').hidden)); i++) await page.waitForTimeout(500);
  const res = await ev(() => { const P = App.session.race.player; return { shown: !document.querySelector('#results').hidden, title: document.querySelector('#res-title').textContent, dnf: [...document.querySelectorAll('#res-body tr')].filter((tr) => /DNF/.test(tr.textContent)).length, parked: P.parked, vx: P.vx, pit: !!P.pit, ended: App.session.race.endedEarly }; });
  console.log(JSON.stringify(res));
  ok(res.shown && /retired/.test(res.title) && res.dnf >= 2, 'player retirement: results show DNF, the race is classified');
  await page.screenshot({ path: OUT + `dmg-results-${tag}.png` });
  // the setting is in the menu and applies on the go
  ok(await ev(() => !!document.querySelector('[data-set="damage"] [data-v="visual"]')), 'Car damage setting (Off / Visual only / Realistic) in Driving');
  ok(await ev(() => { Menu.applyLevel('beginner'); const a = SIM.settings.damage; Menu.applyLevel('pro'); return a === 'visual' && SIM.settings.damage === 'real' && Menu.levelOf() === 'pro'; }), 'difficulty presets set the damage level (Beginner: visual only)');
  ok(!errs.length, 'errors: ' + (errs.slice(0, 4).join(' | ') || 'none'));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

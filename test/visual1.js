// Graphics plan, phase 1 (docs/PLAN-visuals.md): cars lit from every angle, lens effects, the compact timing tower,
// the mouse wheel in cockpit view, and phone-menu text that never gets cut off.
// usage: node test/visual1.js            (BRIGHT=0 skips the brightness part, which takes a few minutes)
const fs = require('fs'); const { chromium } = require('playwright');
const { open, start, PROBE } = require('./visualbase.js');
const OUT = '/tmp/claude-0/-home-user-apex-gp/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/v1-';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((ok) => { let k = 0; const f = () => (++k >= n ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  // ---- 1. the car is lit from every angle, and as bright on Balanced as on Smooth (the paint's reflection is live)
  if (process.env.BRIGHT !== '0') {
    const res = {};
    for (const q of [1, 2]) {
      const br = await launch();
      const page = await open(br, { quality: q, mode: 'trial', track: 'riviera', camera: 'chase', weather: 'dry', tod: 'auto', team: 'ardent' }, { viewport: { width: 640, height: 360 } });
      for (const track of ['riviera', 'parco', 'ardenne']) {
        await start(page, { track, mode: 'trial' }); await page.waitForTimeout(2000);
        res[q + track] = await page.evaluate(PROBE);
        await page.evaluate(() => App.quit()); await page.waitForTimeout(800);
      }
      ok(!page.errs.length, 'no errors (quality ' + q + ')' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
      await br.close();
    }
    for (const t of ['riviera', 'parco', 'ardenne']) {
      const a = res[1 + t], b = res[2 + t], mean = (r) => r.dirs.reduce((s, d) => s + d.lum, 0) / r.dirs.length;
      console.log('    ' + t.padEnd(8), 'Smooth', a.dirs.map((d) => d.lum).join(' '), '| Balanced', b.dirs.map((d) => d.lum).join(' '));
      ok(b.ratio >= 0.45 && a.ratio >= 0.45, `${t}: side away from the sun at least 45% of the sunlit side (Smooth ${a.ratio}, Balanced ${b.ratio})`);
      ok(mean(b) >= 0.8 * mean(a), `${t}: the car on Balanced is as bright as on Smooth (${mean(b).toFixed(0)} vs ${mean(a).toFixed(0)})`);
    }
  }

  // ---- 2. lens effects, 3. timing tower, 4. cockpit mouse wheel on PC
  {
    const br = await launch();
    const page = await open(br, { quality: 1, mode: 'race', track: 'silver', camera: 'chase', opponents: 21, grid: 'back', mouseSteer: 'grab', mwHints: 0, weather: 'dry' });
    await start(page, { mode: 'race' }); await page.waitForTimeout(2500);
    const ev = (f, a) => page.evaluate(f, a);
    // lens: nothing at a standstill; at speed a little; switched off, nothing at all
    const lens = await ev(async () => {
      const r = App.session.race, P = r.player, U = App.grade.uniforms, out = {}, two = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      await two(); out.still = U.speed.value;
      // a real start: the AI drives the car for 25 s, then the race runs on at speed while we look
      r.lightsOutAt = 0; const ai = new SIM.AIDriver(P, 1.05, 4); for (let n = 0; n < 360 * 25; n++) r.step(1 / 360, ai.control(1 / 360, r.cars, r));
      const hold = setInterval(() => { P.vx = 85; }, 5); await two(); await two(); out.fast = U.speed.value; out.vig = U.vig.value; out.phase = r.phase;
      SIM.settings.lens = false; await two(); out.offFast = U.speed.value; out.offVig = U.vig.value;
      SIM.settings.lens = true; clearInterval(hold);
      out.src = App.grade.material.fragmentShader.match(/float ca = [^;]+;/)[0];
      return out;
    });
    console.log('    lens', JSON.stringify(lens));
    ok(lens.still === 0 && lens.fast > 0.5 && /speed/.test(lens.src), 'lens fringe: none when stopped, only at speed');
    ok(lens.offFast === 0 && lens.offVig === 0, 'Lens effects off: no blur, fringe or vignette');
    ok(await ev(() => !!document.querySelector('[data-set="lens"]')), 'Lens effects row in Settings');

    // timing tower: compact (top 3, divider, the cars round you), never over the car panel or minimap
    const towerAt = async (label) => {
      await page.waitForTimeout(1300); await frames(page, 4);
      return ev(() => {
        const rows = [...document.querySelectorAll('#tower .trow')].filter((r) => r.style.display !== 'none'), wr = document.querySelector('#tower-wrap').getBoundingClientRect();
        const me = rows.some((r) => r.classList.contains('me')), div = !!document.querySelector('#tower .tdiv');
        const obst = [...document.querySelectorAll('#dash, #minimap, #mw-rot, #t-steer button, #t-wheel, #t-brk, #t-thr')].filter((e) => e.offsetParent && getComputedStyle(e).visibility !== 'hidden').map((e) => e.getBoundingClientRect()).filter((r) => r.width > 2);
        const hit = obst.some((r) => r.left < wr.right && r.right > wr.left && r.top < wr.bottom && r.bottom > wr.top);
        return { rows: rows.length, me, div, hit, cap: Hud.towerCapN, h: Math.round(wr.height) };
      });
    };
    let t = await towerAt();
    console.log('    tower (PC, grid back)', JSON.stringify(t));
    ok(t.rows <= 8 && t.rows >= 5 && t.me && t.div && !t.hit, 'tower compact: top 3, divider, the cars round you; clear of the car panel and minimap');
    await page.screenshot({ path: OUT + 'tower-pc.png', timeout: 240000 });
    // (the software renderer here draws a frame every few seconds, so once the click has opened the tower its
    // 8-second window is stretched before counting rows)
    const opened = await ev(() => { document.querySelector('#tower-wrap').click(); const o = Hud.towerOpenUntil - performance.now(); Hud.towerOpenUntil += 60000; return o; });
    t = await towerAt(); ok(opened > 7000 && t.rows === 22, 'click: all 22 cars (' + t.rows + ')');
    await page.screenshot({ path: OUT + 'tower-open-pc.png', timeout: 240000 });
    await ev(() => { Hud.towerOpenUntil = performance.now() - 1; }); t = await towerAt(); ok(t.rows <= 8, 'folds back after 8 seconds');
    await page.keyboard.press('KeyT'); const tk = await ev(() => { const o = Hud.towerOpenUntil - performance.now(); Hud.towerOpenUntil += 60000; return o; }); t = await towerAt(); ok(tk > 0 && t.rows === 22, 'T key opens it too');
    await page.keyboard.press('KeyT'); t = await towerAt(); ok(t.rows <= 8, 'T again folds it');
    // pit and out markers
    const marks = await ev(async () => { const r = App.session.race, c = r.cars.find((x) => x !== r.player); c.dnf = 'Test'; await new Promise((ok) => setTimeout(ok, 1200)); await new Promise((ok) => requestAnimationFrame(ok)); const txt = [...document.querySelectorAll('#tower .trow')].map((x) => x.textContent); c.dnf = null; return txt.some((x) => /OUT/.test(x)); });
    ok(marks, 'a retired car shows OUT');

    // cockpit view: the on-screen wheel hides, dragging low on the screen steers, the free camera stays off
    await ev(() => { App.session.camMode = 'cockpit'; }); await frames(page, 4);
    const ck = await ev(() => ({ cls: document.querySelector('#mwheel').classList.contains('cockpit'), vis: getComputedStyle(document.querySelector('#mw-rot')).visibility, hint: document.querySelector('#mw-hint').textContent }));
    ok(ck.cls && ck.vis === 'hidden' && /drag/.test(ck.hint), 'cockpit view: on-screen wheel hidden, hint explains the drag');
    await page.mouse.move(640, 560); await page.mouse.down(); await page.mouse.move(760, 560, { steps: 6 }); await frames(page, 6);
    const drag = await ev(() => ({ tgt: MouseWheel.tgt, steer: MouseWheel.steer, orbit: !!(App.session.orbit && App.session.orbit.on), ghost: document.querySelector('#mw-ghost').className }));
    await page.mouse.up(); await frames(page, 2);
    console.log('    cockpit drag', JSON.stringify(drag));
    ok(drag.tgt < -0.3 && !drag.orbit && drag.ghost === 'on', 'dragging right steers right (no free camera), with the grab ring showing');
    await page.screenshot({ path: OUT + 'cockpit-pc.png', timeout: 240000 });
    await ev(() => { App.session.camMode = 'chase'; }); await frames(page, 4);
    ok(await ev(() => getComputedStyle(document.querySelector('#mw-rot')).visibility === 'visible'), 'back in chase view the on-screen wheel returns');
    // the hint: counted per session, gone after three
    // sessions: the same session shown again doesn't count; new sessions do (faked here by swapping the session object)
    const hints = await ev(async () => { const n0 = SIM.settings.mwHints, S = App.session; MouseWheel.show(true); const same = SIM.settings.mwHints; for (let k = 0; k < 3; k++) { App.session = Object.assign({}, S); MouseWheel.show(true); } const n1 = SIM.settings.mwHints, gone = document.querySelector('#mwheel').classList.contains('nohint'); App.session = S; return { n0, same, n1, gone }; });
    ok(hints.n0 === 1 && hints.same === 1 && hints.n1 === 3 && hints.gone, 'wheel help shows in the first 3 sessions, then not again ' + JSON.stringify(hints));
    ok(!page.errs.length, 'no errors on PC' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
    await br.close();
  }

  // ---- 3b. the tower on a phone stays clear of the steering buttons
  for (const [w, h, steer] of (process.env.ONLY === 'pc' ? [] : [[844, 390, 'buttons'], [667, 375, 'buttons'], [844, 390, 'wheel']])) {
    const br = await launch();
    const page = await open(br, { quality: 0, mode: 'race', track: 'silver', camera: 'chase', opponents: 21, grid: 'back', touchSteer: steer, weather: 'dry' }, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    await start(page, { mode: 'race' }); await page.waitForTimeout(3500); await frames(page, 4);
    const t = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#tower .trow')].filter((r) => r.style.display !== 'none'), wr = document.querySelector('#tower-wrap').getBoundingClientRect();
      const obst = [...document.querySelectorAll('#t-steer button, #t-wheel, #t-brk, #t-thr, .t-shift button')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 2);
      return { rows: rows.length, me: rows.some((r) => r.classList.contains('me')), hit: obst.some((r) => r.left < wr.right && r.right > wr.left && r.top < wr.bottom && r.bottom > wr.top), h: Math.round(wr.bottom), n: obst.length };
    });
    console.log(`    tower phone ${w}x${h} ${steer}`, JSON.stringify(t));
    ok(t.rows >= 3 && t.me && !t.hit && t.n > 0, `phone ${w}×${h} (${steer}): tower shows you and stays clear of the controls`);
    await page.screenshot({ path: OUT + `tower-${w}x${h}-${steer}.png`, timeout: 240000 });
    ok(!page.errs.length, 'no errors' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
    await br.close();
  }

  // ---- 6. menu text is never cut off
  if (process.env.ONLY !== 'pc') {
    const br = await launch();
    for (const [w, h] of [[844, 390], [667, 375], [390, 844], [375, 667], [1280, 720]]) {
      const page = await open(br, { quality: 0, mode: 'race', track: 'riviera', team: 'ardent', opponents: 21, laps: 3, weather: 'dry' }, { viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
      const r = await page.evaluate(() => {
        const out = {};
        for (const id of ['parco', 'riviera', 'montealto', 'ile', 'lonestar']) { SIM.settings.track = id; Menu.sync(); for (const s of ['#pc-name', '#pt-name', '#opts-sum2']) { const el = document.querySelector(s); if (el.offsetParent && el.scrollWidth > el.clientWidth + 1) out[id + s] = el.textContent; } }
        SIM.settings.track = 'riviera'; Menu.sync();
        return { cut: out, name: document.querySelector('#pc-name').textContent, opts: document.querySelector('#opts-sum2').textContent };
      });
      ok(!Object.keys(r.cut).length, `menu ${w}×${h}: nothing cut off (shows "${r.name}", "${r.opts}")` + (Object.keys(r.cut).length ? ' CUT: ' + JSON.stringify(r.cut) : ''));
      if (w === 844 || w === 375) await page.screenshot({ path: OUT + `menu-${w}x${h}.png`, timeout: 240000 });
      await page.close();
    }
    await br.close();
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();

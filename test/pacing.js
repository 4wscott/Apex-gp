// frame pacing on big / fast monitors: refresh detection, time steps snapped to whole refreshes (with real time kept),
// half rate when a fast screen can't be kept up with (and back again), and the pixel budget on a large high-DPI screen
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await br.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1.5 }); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript(() => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 2, mirrors: false, v: 9, mode: 'practice', track: 'silver' })); });
  await page.goto('http://local/'); await page.waitForTimeout(5000);
  const ev = (f, a) => page.evaluate(f, a);
  const px = await ev(() => { const s = App.renderer.getDrawingBufferSize(new THREE_V2()); return [s.x, s.y]; }).catch(() => ev(() => { const c = App.renderer.domElement; return [c.width, c.height]; }));
  console.log('2560x1440 window at 150% scaling, High: drawing', px.join('×'), '(full would be 3840×2160)');
  ok(px[0] * px[1] <= 3.75e6 && px[0] >= 2400, 'High on a big high-DPI screen draws about 1440p, not 4K');
  const r = await ev(() => {
    const A = App, out = {}; A.fp = null; A.session = A.session || { fake: true }; const realSession = A.session.fake ? null : A.session; A.paused = false;
    let t = 1000, steps = [], sum = 0, real = 0; const rnd = (() => { let s = 3; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    // a 144 Hz screen, timestamps jittered by up to ±1 ms: refresh found, steps snapped, total time kept
    for (let k = 0; k < 400; k++) { const gap = 1000 / 144 + (rnd() - 0.5) * 2; t += gap; if (A.pacing(t)) continue; const raw = t - (A.__last || t - gap); A.__last = t; const d = A.smoothDt(raw); if (k > 200) { steps.push(d); sum += d; real += raw; } }
    out.hz = 1000 / A.fp.vs; out.spread = Math.max(...steps) - Math.min(...steps); out.drift = Math.abs(sum - real);
    // the game takes ~1.4 refreshes a frame: half rate (72 fps, every other refresh)
    A.__last = t; for (let k = 0; k < 400; k++) { t += 1000 / 144; if (A.pacing(t)) continue; if (rnd() < 0.5) t += 1000 / 144; const raw = t - A.__last; A.__last = t; A.smoothDt(raw); }
    out.capSlow = A.fp.cap;
    // it gets lighter (every rendered frame on time): back to every refresh after a calm spell
    for (let k = 0; k < 3000; k++) { t += 1000 / 144; if (A.pacing(t)) continue; const raw = t - A.__last; A.__last = t; A.smoothDt(raw); }
    out.capCalm = A.fp.cap;
    // a 60 Hz screen never goes to half rate
    A.fp = null; A.__last = t; for (let k = 0; k < 600; k++) { t += 1000 / 60; if (A.pacing(t)) continue; if (rnd() < 0.5) t += 1000 / 60; const raw = t - A.__last; A.__last = t; A.smoothDt(raw); }
    out.cap60 = A.fp.cap; out.hz60 = 1000 / A.fp.vs;
    if (!realSession) A.session = null; A.fp = null;
    return out;
  });
  console.log(JSON.stringify(r));
  ok(Math.abs(r.hz - 144) < 4, 'refresh rate found: ' + r.hz.toFixed(1) + ' Hz');
  ok(r.spread < 0.3 && r.drift < 8, `jittery timestamps become even steps (spread ${r.spread.toFixed(2)} ms), real time kept (${r.drift.toFixed(1)} ms over 200 frames)`);
  ok(r.capSlow === 2 && r.capCalm === 1, 'a 144 Hz screen it cannot keep up with: even half rate, then back to full when it can');
  ok(r.cap60 === 1 && Math.abs(r.hz60 - 60) < 2, 'a 60 Hz screen never halves');
  ok(!errs.length, 'errors: ' + (errs.join(' | ') || 'none'));
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await br.close();
})();

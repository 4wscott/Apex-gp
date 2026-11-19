// The home screen camera stays inside the barriers (no catch fence in front of the lens) on every circuit, on a PC, a
// phone sideways, a tablet and a phone held upright. usage: node test/menucam.js
const { chromium } = require('playwright'); const { open } = require('./visualbase.js');
let fails = 0;
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [w, h] of [[1280, 720], [844, 390], [1180, 820], [390, 844]]) {
    const page = await open(br, { quality: 0, mode: 'race', track: 'silver' }, { viewport: { width: w, height: h } });
    const bad = await page.evaluate(async () => {
      const out = [];
      for (const t of SIM.TRACKS) {
        App.preview(t.id); await new Promise((r) => setTimeout(r, 300));
        const T = App.previewTrack, i = App.previewSpot, c = App.camera.position; let bj = i, bd = 1e9;
        for (let k = -80; k <= 80; k++) { const j = (i + k + T.n) % T.n, dd = (T.px[j] - c.x) ** 2 + (T.py[j] + c.z) ** 2; if (dd < bd) { bd = dd; bj = j; } }
        const lat = (c.x - T.px[bj]) * T.nx[bj] + (-c.z - T.py[bj]) * T.ny[bj], wl = lat >= 0 ? T.wallL[bj] : T.wallR[bj];
        if (Math.abs(lat) > wl - 0.5) out.push(`${t.id} (${lat.toFixed(1)} m, barrier at ${wl.toFixed(1)} m)`);
      }
      return out;
    });
    console.log((bad.length ? 'FAIL' : 'ok  ') + ` ${w}x${h}: ` + (bad.length ? 'camera behind the barrier at ' + bad.join(', ') : 'inside the barriers on every circuit'));
    fails += bad.length; await page.close();
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await br.close(); process.exit(fails ? 1 : 0);
})();

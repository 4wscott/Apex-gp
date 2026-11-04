// where memory goes in a race: images by name and size (scenery and cars), geometry vertex counts by kind, and the code's own memory
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const SP0 = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const ctx = await br.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }); const page = await ctx.newPage();
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP0 + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await ctx.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript((t) => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 2, v: 8, mode: 'race', track: t, camera: 'chase', opponents: 21, laps: 3 })); }, process.argv[2] || 'silver');
  await page.goto('http://local/'); await page.waitForTimeout(7000);
  await page.evaluate(() => document.querySelector('#start').click()); await page.waitForTimeout(15000);
  const r = await page.evaluate(() => {
    const tex = new Map(), geo = new Map();
    const carRoots = new Set(App.session.race.cars.map((c) => c.mesh.grp));
    App.scene.traverse((o) => {
      let p = o, car = false; while (p) { if (carRoots.has(p)) { car = true; break; } p = p.parent; }
      if (o.geometry && !geo.has(o.geometry)) { const g = o.geometry, v = g.attributes.position ? g.attributes.position.count : 0; let bytes = 0; for (const a of Object.values(g.attributes)) bytes += a.array.byteLength; if (g.index) bytes += g.index.array.byteLength; geo.set(g, { v, bytes, inst: o.isInstancedMesh ? o.count : 1, car, name: o.name || o.type }); }
      if (!o.material) return;
      for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'metalnessMap', 'aoMap']) { const t = m[k]; if (!t || tex.has(t) || !t.image) continue; const w = t.image.width || 0, h = t.image.height || 0; tex.set(t, { w, h, mb: (w * h * 4 * 1.33) / 1e6, car, k, src: t.image.src ? t.image.src.slice(0, 40) : t.image.tagName || (t.image.data ? 'data' : '?') }); }
    });
    const tl = [...tex.values()], gl = [...geo.values()];
    const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
    const bySize = {}; tl.filter((t) => !t.car).forEach((t) => { const key = t.w + 'x' + t.h; bySize[key] = bySize[key] || { n: 0, mb: 0 }; bySize[key].n++; bySize[key].mb += t.mb; });
    const bigGeo = gl.filter((g) => !g.car).sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((g) => `${g.name} ${g.v}v ${(g.bytes / 1e6).toFixed(1)}MB x${g.inst}`);
    return {
      sceneryImagesMB: Math.round(sum(tl.filter((t) => !t.car), (t) => t.mb)), carImagesMB: Math.round(sum(tl.filter((t) => t.car), (t) => t.mb)),
      sceneryBySize: Object.entries(bySize).sort((a, b) => b[1].mb - a[1].mb).slice(0, 10).map(([k, v]) => `${k} x${v.n} = ${v.mb.toFixed(1)}MB`),
      geometryMB: (sum(gl, (g) => g.bytes) / 1e6).toFixed(1), carGeometryMB: (sum(gl.filter((g) => g.car), (g) => g.bytes) / 1e6).toFixed(1), geometries: gl.length, bigGeo,
      jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
      bundledStringsMB: ((typeof MODEL_DATA !== 'undefined' ? JSON.stringify(MODEL_DATA).length : 0) / 1e6).toFixed(1),
    };
  });
  console.log(JSON.stringify(r, null, 1)); await br.close();
})();

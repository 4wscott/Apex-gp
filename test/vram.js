// how much texture memory a full race uses (by kind), to find what pushes an iPhone over its limit
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const SP0 = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await br.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP0 + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await ctx.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript((q) => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: q, v: 10, mode: 'race', track: 'silver', camera: 'chase', opponents: 21, laps: 3 })); }, +(process.argv[2] || 2));
  await page.goto('http://local/'); await page.waitForTimeout(7000);
  const measure = () => page.evaluate(() => {
    const seen = new Set(), by = {}; let total = 0;
    const add = (t, kind) => { if (!t || seen.has(t)) return; seen.add(t); const im = t.image; let w = 0, h = 0, b = 4;
      if (im && im.width) { w = im.width; h = im.height; } else if (t.isRenderTargetTexture || (im && im.data)) { w = (im && im.width) || 0; h = (im && im.height) || 0; }
      if (t.type === THREE_HF) b = 8; if (im && im.data && im.data.BYTES_PER_ELEMENT === 4 && t.format === 1023) b = 16;
      const mb = (w * h * b * (t.generateMipmaps !== false ? 1.33 : 1)) / 1e6; total += mb; by[kind] = (by[kind] || 0) + mb; };
    var THREE_HF = 1016;
    App.scene.traverse((o) => { if (!o.material) return; const ms = Array.isArray(o.material) ? o.material : [o.material];
      let kind = 'scenery'; let p = o; while (p) { if (p.userData && p.userData.carMesh) { kind = 'cars'; break; } p = p.parent; }
      if (App.session && App.session.race.cars.some((c) => { let q = o; while (q) { if (q === c.mesh.grp) return true; q = q.parent; } return false; })) kind = 'cars';
      for (const m of ms) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'envMap', 'metalnessMap', 'aoMap', 'clearcoatNormalMap']) add(m[k], kind); });
    const info = App.renderer.info.memory;
    return { textures: info.textures, geometries: info.geometries, mbByKind: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v)])), mbTotal: Math.round(total), jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null };
  });
  console.log('menu', JSON.stringify(await measure()));
  await page.evaluate(() => document.querySelector('#start').click()); await page.waitForTimeout(15000);
  console.log('race', JSON.stringify(await measure()));
  console.log('livery canvas sizes', await page.evaluate(() => Object.keys(GFX.carLivery || {}).length + ' liveries, each ' + (Object.values(GFX.carLivery || {})[0] ? Object.values(GFX.carLivery)[0].image.width + 'x' + Object.values(GFX.carLivery)[0].image.height : '?')));
  console.log('suits/helmets cached', await page.evaluate(() => ({ suits: Object.keys(GFX.suitCache || {}).length, suitSize: Object.values(GFX.suitCache || {})[0] && Object.values(GFX.suitCache)[0].image.width })));
  console.log('one AI car textures:', await page.evaluate(() => { const c = App.session.race.cars.find((x) => x !== App.session.race.player), out = {}, seen = new Set();
    c.mesh.grp.traverse((o) => { if (!o.material) return; for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'metalnessMap', 'clearcoatNormalMap']) { const t = m[k]; if (!t || seen.has(t) || !t.image) continue; seen.add(t); const key = (o.name || o.type) + '.' + k + ' ' + t.image.width + 'x' + t.image.height; out[key] = (out[key] || 0) + 1; } });
    return JSON.stringify(out); }));
  console.log('errs', errs); await br.close();
})();

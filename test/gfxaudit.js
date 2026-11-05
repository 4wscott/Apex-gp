// what a race frame asks of the graphics chip at each quality level: draw calls, triangles, shadow and effect passes,
// lights, textures, the biggest scene parts. usage: node test/gfxaudit.js [quality...]
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const SP = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
(async () => {
  for (const q of (process.argv.slice(2).length ? process.argv.slice(2) : ['0', '1', '2']).map(Number)) {
    const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const page = await br.newPage({ viewport: { width: 1920, height: 1080 } }); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
    await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
    await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
    await page.addInitScript((q) => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: q, v: 10, mode: 'race', track: 'silver', camera: 'chase', laps: 3, opponents: 21, radio: 'off', mirrors: q >= 2 })); }, q);
    await page.goto('http://local/'); await page.waitForTimeout(5000);
    await page.evaluate(() => document.querySelector('#start').click());
    await page.waitForFunction(() => App.session && App.session.race, null, { timeout: 180000 }); await page.waitForTimeout(3000);
    const r = await page.evaluate(() => {
      const R = App.renderer, S = App.session, out = {};
      let calls = 0, tris = 0, passes = 0; const or = R.render.bind(R);
      R.render = (sc, cam) => { or(sc, cam); calls += R.info.render.calls; tris += R.info.render.triangles; passes++; };
      R.info.autoReset = true; App.render(); R.render = or;
      out.drawCallsPerFrame = calls; out.trianglesPerFrame = tris; out.renderPasses = passes;
      out.composerPasses = App.composer ? App.composer.passes.map((p) => p.constructor.name) : [];
      out.drawSize = App.renderPx; out.pixelRatio = +R.getPixelRatio().toFixed(2);
      out.shadow = { on: R.shadowMap.enabled, type: R.shadowMap.type, size: App.sun && App.sun.shadow.mapSize.x, autoUpdate: R.shadowMap.autoUpdate };
      let lights = 0, shadowCasters = 0, meshes = 0, physical = 0, transparent = 0, instanced = 0, inst = 0; const byName = {};
      App.scene.traverse((o) => { if (o.isLight) lights++; if (o.isMesh || o.isPoints) { if (!o.visible) return; meshes++; if (o.castShadow) shadowCasters++; const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m && m.isMeshPhysicalMaterial) physical++; if (m && m.transparent) transparent++; if (o.isInstancedMesh) { instanced++; inst += o.count; } } });
      out.scene = { lights, meshes, shadowCasters, physicalMaterials: physical, transparent, instancedMeshes: instanced, instances: inst };
      out.textures = R.info.memory.textures; out.geometries = R.info.memory.geometries; out.programs = R.info.programs.length;
      out.cars = S.race.cars.length; out.mirrors = !!S.mirror; out.crowd = typeof Crowd !== 'undefined' && Crowd.count ? Crowd.count : undefined;
      // where the work comes from: visible meshes in the camera's view, grouped by the top-level thing they belong to
      const cam = App.camera; cam.updateMatrixWorld(); const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const carRoots = new Map(S.race.cars.map((c, i) => [c.mesh.grp, c === S.race.player ? 'player car' : 'other cars']));
      const cat = {}; const tri = (g) => (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3;
      App.scene.traverse((o) => { if (!(o.isMesh || o.isPoints || o.isLine) || !o.visible) return; let p = o, vis = true; while (p) { if (!p.visible) { vis = false; break; } p = p.parent; } if (!vis) return;
        if (o.frustumCulled && o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (!fr.intersectsObject(o)) return; }
        let r = o, name = null; while (r) { if (carRoots.has(r)) { name = carRoots.get(r); break; } r = r.parent; }
        if (!name) { name = o.isSkinnedMesh ? 'people (skinned)' : o.isInstancedMesh ? 'instanced: ' + (o.name || o.material.name || o.material.type) : 'scenery'; }
        const e = (cat[name] = cat[name] || { draws: 0, tris: 0, shadow: 0 }); const n = tri(o.geometry) * (o.isInstancedMesh ? o.count : 1); e.draws++; e.tris += Math.round(n); if (o.castShadow) e.shadow++; });
      out.byPart = Object.fromEntries(Object.entries(cat).sort((a, b) => b[1].tris - a[1].tris).slice(0, 14));
      return out;
    });
    const bp = r.byPart; delete r.byPart; console.log('quality', q, JSON.stringify(r)); for (const k in bp) console.log('   ', k.padEnd(34), 'draws', String(bp[k].draws).padStart(5), 'tris', String(bp[k].tris).padStart(9), 'shadow casters', bp[k].shadow); if (errs.length) console.log('errs', errs);
    await br.close();
  }
})();

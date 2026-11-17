// renders the game's car for the app icon: a low front three-quarter view on a flat green backdrop (keyed out later)
// usage: node tools/icon/render_car.js <team> <out.png>   (needs index.html built and the three.js package used by the tests)
const fs = require('fs'), path = require('path'); const { chromium } = require('playwright');
const T160 = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/t160/package/';
const html = '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0;background:#000}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8') + '</body></html>';
const [team = 'ardent', out = 'car.png'] = process.argv.slice(2);
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await br.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(T160 + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.addInitScript((t) => { localStorage.setItem('apexgp.settings', JSON.stringify({ quality: 3, v: 10, mode: 'race', team: t, tod: 'noon' })); }, team);
  await page.goto('http://local/'); await page.waitForTimeout(7000);
  const data = await page.evaluate(() => {
    const R = App.renderer, car = App.previewCar.grp, par = car.parent, keep = { p: car.position.clone(), r: car.rotation.clone() };
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x00ff00); sc.environment = App.scene.environment;
    const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-4, 7, 5); sc.add(key);
    const rim = new THREE.DirectionalLight(0xffe2b0, 2.4); rim.position.set(6, 3, -6); sc.add(rim);
    sc.add(new THREE.HemisphereLight(0xdfe9f5, 0x303038, 0.9));
    sc.add(car); car.position.set(0, 0, 0); car.rotation.set(0, 0, 0); car.updateMatrixWorld(true);
    // low front three-quarter: the nose toward the viewer's lower left
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(8.2, 1.3, 7.0); cam.lookAt(0.75, 0.42, -0.1);
    R.setPixelRatio(1); R.setSize(1024, 1024, false); R.shadowMap.enabled = false;
    R.render(sc, cam); const url = R.domElement.toDataURL('image/png');
    par.add(car); car.position.copy(keep.p); car.rotation.copy(keep.r);
    return url;
  });
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64')); console.log('wrote', out); await br.close();
})();

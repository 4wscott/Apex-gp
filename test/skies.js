// sky looks: default sunny on Silverwood (was overcast), Overcast and Sunset options, rain still greys the sky
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const SP0 = '/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html = '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8') + '</body></html>';
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, pre] of [['sunny', {}], ['overcast', { tod: 'overcast' }], ['sunset', { tod: 'sunset' }], ['rain', { weather: 'wet', compound: 'W' }]]) {
    const page = await br.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ body: fs.readFileSync(SP0 + 't160/package/' + u.pathname.replace('/npm/three@0.160.0/', ''), 'utf8'), contentType: 'application/javascript' }); });
    await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
    await page.route('**/iframe_api', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.route('http://local/', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
    await page.addInitScript((p) => { localStorage.setItem('apexgp.settings', JSON.stringify(Object.assign({ quality: 0, v: 7, mode: 'practice', track: 'silver', camera: 'chase' }, p))); }, pre);
    await page.goto('http://local/'); await page.waitForTimeout(6000);
    await page.evaluate(() => document.querySelector('#start').click()); await page.waitForTimeout(9000);
    await page.screenshot({ path: SP0 + 'sky-' + name + '.png', timeout: 180000 });
    console.log(name, 'errs', errs); await page.close();
  }
  await br.close();
})();

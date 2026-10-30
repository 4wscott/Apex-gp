// Joins src/ into a single self-contained index.html
const fs = require('fs'), path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
let js = ['hdri.js', 'photo.js', 'engine.js', 'models.js'].map((f) => fs.readFileSync(path.join(__dirname, 'assets', f), 'utf8')).join('\n') + '\n' + ['data.js', 'sim.js', 'gfx.js', 'audio.js', 'career.js', 'net.js', 'spotify.js', 'pitcrew.js', 'crowd.js', 'game.js'].map(src).join('\n');
js = js.replace(/\nif \(typeof module !== 'undefined'\)[^\n]*\n/, '\n');
const html = src('shell.html').replace('/*__SCRIPTS__*/', () => js);
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');

// Installable phone/desktop app (PWA) in site/: same game page plus a manifest, icons and an offline worker.
// Host the site/ folder on any static host (e.g. GitHub Pages); each new deploy reaches installed copies on their next launch.
const BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ');
const site = path.join(__dirname, 'site');
fs.rmSync(site, { recursive: true, force: true }); fs.mkdirSync(path.join(site, 'icons'), { recursive: true });
const head = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#0d1015">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Apex GP">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>html,body{margin:0;background:#0d1015}[hidden]{display:none!important}</style>
</head><body>
`;
const reg = `
<script>
window.APEX_BUILD = ${JSON.stringify(BUILD)};
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {});
addEventListener('load', () => { const m = document.querySelector('#menu'); if (m) { const v = document.createElement('div'); v.className = 'hint'; v.style.cssText = 'opacity:.55;font-size:11px;padding:8px 16px'; v.textContent = 'Version ' + window.APEX_BUILD; m.appendChild(v); } });
</script>
</body></html>`;
fs.writeFileSync(path.join(site, 'index.html'), head + html + reg);
fs.writeFileSync(path.join(site, 'sw.js'), fs.readFileSync(path.join(__dirname, 'pwa', 'sw.js'), 'utf8').replace('__BUILD__', BUILD));
fs.copyFileSync(path.join(__dirname, 'pwa', 'manifest.webmanifest'), path.join(site, 'manifest.webmanifest'));
for (const f of fs.readdirSync(path.join(__dirname, 'pwa', 'icons'))) fs.copyFileSync(path.join(__dirname, 'pwa', 'icons', f), path.join(site, 'icons', f));
fs.writeFileSync(path.join(site, '.nojekyll'), '');
console.log('site/ built', BUILD);

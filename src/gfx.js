// ==== Rendering: world, track dressing, car models (three r160) ============
// World mapping: sim (x, y) -> three (x, height, -y).
const W = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
const GFX = { maxAniso: 8 };

function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = GFX.maxAniso;
  if (opts.noFlip) t.flipY = false;
  return t;
}
function makeNoise(seed) {
  const rng = mulberry32(seed), P = new Float32Array(256 * 256);
  for (let i = 0; i < P.length; i++) P[i] = rng();
  const at = (x, y) => P[((y & 255) << 8) | (x & 255)];
  const sm = (t) => t * t * (3 - 2 * t);
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), xf), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), xf), yf);
  };
  const fbm = (x, y, oct = 5) => { let a = 0, amp = 0.5, f = 1; for (let o = 0; o < oct; o++) { a += amp * n2(x * f, y * f); f *= 2; amp *= 0.5; } return a; };
  return { n2, fbm };
}
const HASH = { hash: (i, j, o) => { let h = Math.imul(i * 374761393 + j * 668265263 + o * 1013904223, 1274126177); h = (h ^ (h >>> 13)) >>> 0; return (Math.imul(h, 1103515245) >>> 0) / 4294967296; } };
// tileable fbm over a period (for seamless textures)
function tileFbm(x, y, period, oct) {
  let a = 0, amp = 0.5, f = 1;
  const s = (t) => t * t * (3 - 2 * t);
  for (let o = 0; o < oct; o++) {
    const p = period * f, X = x * f, Y = y * f, xi = Math.floor(X), yi = Math.floor(Y), xf = s(X - xi), yf = s(Y - yi);
    const h = (i, j) => HASH.hash(((i % p) + p) % p, ((j % p) + p) % p, o);
    a += amp * lerp(lerp(h(xi, yi), h(xi + 1, yi), xf), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), xf), yf);
    f *= 2; amp *= 0.5;
  }
  return a;
}
// albedo + normal + roughness maps from a tileable height function
function pbrSet(size, heightFn, colorFn, roughFn, opts = {}) {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = heightFn(x / size, y / size);
  const mk = (fill, linear) => canvasTex(size, size, (g) => { const id = g.createImageData(size, size); fill(id.data); g.putImageData(id, 0, 0); }, { linear });
  const albedo = mk((d) => { for (let i = 0; i < size * size; i++) { const c = colorFn(H[i], (i % size) / size, Math.floor(i / size) / size); d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; } });
  const st = opts.normalStrength || 2;
  const normal = mk((d) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, l = H[y * size + ((x - 1 + size) % size)], r = H[y * size + ((x + 1) % size)], u = H[((y - 1 + size) % size) * size + x], dn = H[((y + 1) % size) * size + x];
      const nx = (l - r) * st, ny = (dn - u) * st, len = Math.hypot(nx, ny, 1);
      d[i * 4] = (nx / len * 0.5 + 0.5) * 255; d[i * 4 + 1] = (ny / len * 0.5 + 0.5) * 255; d[i * 4 + 2] = (1 / len * 0.5 + 0.5) * 255; d[i * 4 + 3] = 255;
    }
  }, true);
  const rough = roughFn ? mk((d) => { for (let i = 0; i < size * size; i++) { const v = roughFn(H[i]) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } }, true) : null;
  return { albedo, normal, rough };
}
function noiseFill(g, w, h, base, amp, n, rng, size = 1) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = (rng() - 0.5) * amp; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(rng() * w, rng() * h, size + rng() * size, size + rng() * size); }
}
const CLONES = new WeakMap();
const rep = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); if (!CLONES.has(t)) CLONES.set(t, []); CLONES.get(t).push(c); return c; };
// swap the procedural ground textures for the bundled CC0 photo scans once they decode (clones made by rep follow)
function applyPhotoTextures(tx) {
  if (typeof PHOTO_TEX === 'undefined') return;
  for (const [k, uri] of Object.entries(PHOTO_TEX)) {
    const t = tx[k]; if (!t) continue;
    const img = new Image();
    img.onload = () => { for (const u of [t, ...(CLONES.get(t) || [])]) { u.dispose(); u.image = img; u.needsUpdate = true; } }; // dispose first: GPU storage is sized for the old image
    img.src = uri;
  }
}

function makeGarageTex() {
  return canvasTex(2048, 256, (g, w, h) => {
    g.fillStyle = '#eceef0'; g.fillRect(0, 0, w, h);
    const bw = w / TEAMS.length;
    TEAMS.forEach((t, i) => {
      g.fillStyle = '#16181c'; g.fillRect(i * bw + 8, 54, bw - 16, h - 54);
      g.fillStyle = t.c1; g.fillRect(i * bw + 8, 14, bw - 16, 36); g.fillStyle = t.c2; g.fillRect(i * bw + 8, 46, bw - 16, 5);
      g.fillStyle = '#fff'; g.font = '700 22px "Saira Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t.name.toUpperCase(), i * bw + bw / 2, 32);
      const inner = g.createLinearGradient(0, 60, 0, h); inner.addColorStop(0, '#d9dde2'); inner.addColorStop(1, '#8c939c'); g.fillStyle = inner; g.fillRect(i * bw + 14, 62, bw - 28, h - 66);
      g.fillStyle = t.c1; g.fillRect(i * bw + 14, h - 40, bw - 28, 34);
    });
  });
}

function makeTextures() {
  const rng = mulberry32(7), tx = {};
  const asp = pbrSet(512, (u, v) => tileFbm(u * 4, v * 4, 4, 3) * 0.25 + tileFbm(u * 128, v * 128, 128, 2) * 0.75,
    (h) => { const k = 62 + h * 44; return [k, k + 1, k + 3]; },
    (h) => 0.8 + h * 0.18, { normalStrength: 2.5 });
  tx.asphalt = asp.albedo; tx.asphaltN = asp.normal; tx.asphaltR = asp.rough;
  const gr = pbrSet(256, (u, v) => tileFbm(u * 32, v * 32, 32, 3) * 0.45 + tileFbm(u * 128, v * 128, 128, 1) * 0.55, (h) => [58 + h * 52, 92 + h * 66, 34 + h * 26], null, { normalStrength: 3 });
  tx.grass = gr.albedo; tx.grassN = gr.normal;
  const gv = pbrSet(256, (u, v) => tileFbm(u * 48, v * 48, 48, 2) * 0.7 + tileFbm(u * 128, v * 128, 128, 1) * 0.3, (h) => [150 + h * 70, 132 + h * 62, 102 + h * 50], null, { normalStrength: 8 });
  tx.gravel = gv.albedo; tx.gravelN = gv.normal;
  const sd = pbrSet(256, (u, v) => tileFbm(u * 6, v * 6, 6, 4) * 0.8 + tileFbm(u * 64, v * 64, 64, 1) * 0.2, (h) => [198 + h * 30, 166 + h * 28, 120 + h * 24], null, { normalStrength: 3 });
  tx.sand = sd.albedo; tx.sandN = sd.normal;
  tx.runoff = pbrSet(256, (u, v) => tileFbm(u * 32, v * 32, 32, 3), (h) => { const k = 92 + h * 30; return [k, k + 2, k + 6]; }, null).albedo;
  tx.kerb = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#c8202a'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f1f1ee'; g.fillRect(0, h / 2, w, h / 2);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${rng() * 0.18})`; g.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h / 2 - 1, w, 2); g.fillRect(0, 0, w, 1);
  });
  tx.paintGreen = canvasTex(64, 64, (g, w, h) => noiseFill(g, w, h, '#2f7d4b', 0.12, 900, rng, 1));
  tx.checker = canvasTex(256, 32, (g) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#141414' : '#f4f4f4'; g.fillRect(x * 16, y * 16, 16, 16); } });
  const sponsors = [['VOLTA', '#0d47a1', '#fff'], ['KESTREL OIL', '#f6c400', '#111'], ['NOVA TEL', '#e53935', '#fff'], ['ORBIS', '#111', '#f0d58c'],
    ['ARC TYRES', '#ffdd00', '#c00'], ['ARCLIGHT', '#00897b', '#fff'], ['SKYLINE AIR', '#1e88e5', '#fff'], ['MERIDIAN BANK', '#263238', '#9ccc65'], ['HALCYON', '#5e35b1', '#fff'], ['TERRA', '#2e7d32', '#fff']];
  tx.sponsors = sponsors;
  tx.wall = canvasTex(4096, 128, (g, w, h) => {
    const bw = w / sponsors.length;
    sponsors.forEach((s, i) => {
      g.fillStyle = s[1]; g.fillRect(i * bw, 0, bw, h);
      g.fillStyle = s[2]; g.font = `800 ${h * 0.62}px "Saira Condensed", "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s[0], i * bw + bw / 2, h / 2 + 4);
    });
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, w, 4); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h - 6, w, 6);
  });
  tx.concrete = pbrSet(128, (u, v) => tileFbm(u * 16, v * 16, 16, 3), (h) => { const k = 168 + h * 40; return [k, k, k - 4]; }, null).albedo;
  tx.fence = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(205,210,215,0.9)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke(); });
  // seated crowd: 16 rows of people per tile, each ~12 px wide: head, hair, shoulders, shirt, some waving flags or arms
  tx.crowd = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#4a4f57'; g.fillRect(0, 0, w, h);
    const shirts = ['#e53935', '#fdd835', '#1e88e5', '#f4f4f4', '#ff7a00', '#43a047', '#8e24aa', '#f48fb1', '#202124', '#90caf9', '#ffcc80', '#c62828', '#00897b', '#5d4037'];
    const skin = ['#f1c9a5', '#e0b089', '#c68e63', '#8d5a3b', '#5b3a29'], hair = ['#2b1d14', '#5a3a1e', '#c9a063', '#1a1a1a', '#8a8a8a', '#a0522d'];
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = '#3a3e46'; g.fillRect(0, y + 13, w, 3); // seat row edge
      for (let x = 1; x < w; x += 6) {
        if (rng() < 0.06) continue;
        const sx = x + (rng() - 0.5), sh = shirts[(rng() * shirts.length) | 0];
        g.fillStyle = sh; g.beginPath(); g.ellipse(sx + 2.5, y + 11, 3, 4, 0, Math.PI, 0); g.fill(); g.fillRect(sx - 0.5, y + 10, 6, 3); // shoulders and torso
        g.fillStyle = skin[(rng() * skin.length) | 0]; g.beginPath(); g.arc(sx + 2.5, y + 5, 2.1, 0, 7); g.fill();          // head
        if (rng() < 0.7) { g.fillStyle = rng() < 0.25 ? sh : hair[(rng() * hair.length) | 0]; g.beginPath(); g.arc(sx + 2.5, y + 4.2, 2.2, Math.PI, 0); g.fill(); } // hair or cap
        if (rng() < 0.07) { g.fillStyle = shirts[(rng() * shirts.length) | 0]; g.fillRect(sx + 4, y - 3, 5, 4); g.fillStyle = '#ddd'; g.fillRect(sx + 4, y - 3, 0.6, 9); } // flag
        else if (rng() < 0.08) { g.fillStyle = sh; g.fillRect(sx + 5, y + 1, 1.2, 6); }                                       // raised arm
      }
    }
  });
  tx.windows = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d8d2c4'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, y + 28, w, 4);
      for (let x = 0; x < w; x += 32) { g.fillStyle = rng() < 0.25 ? '#a9bfcd' : '#36444f'; g.fillRect(x + 7, y + 6, 18, 20); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 7, y + 6, 18, 3); }
    }
  });
  tx.glass = canvasTex(256, 64, (g, w, h) => {
    const gr2 = g.createLinearGradient(0, 0, 0, h); gr2.addColorStop(0, '#5d7f99'); gr2.addColorStop(1, '#1a2836'); g.fillStyle = gr2; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8ced4'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h); g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
  });
  tx.garage = makeGarageTex();

  tx.carbon = pbrSet(64, (u, v) => { const x = Math.floor(u * 16), y = Math.floor(v * 16), tw = (x + y) % 4 < 2, fu = (u * 16) % 1, fv = (v * 16) % 1; return tw ? Math.sin(fu * Math.PI) * 0.6 : Math.sin(fv * Math.PI) * 0.6; },
    (h) => { const k = 20 + h * 24; return [k, k + 1, k + 3]; }, (h) => 0.3 + h * 0.2, { normalStrength: 1.5 });
  // tyre sidewalls per compound: u wraps around the wheel, v runs outer wall -> tread -> inner wall
  const tyreTex = (col, label) => canvasTex(2048, 256, (g, w, h) => {
    g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${rng() * 0.03})`; g.fillRect(rng() * w, rng() * h, 2, 1); }
    // tread: worn slick with scuffs and rubber pick-up
    g.fillStyle = '#131313'; g.fillRect(0, h * 0.36, w, h * 0.28);
    for (let i = 0; i < 3500; i++) { g.fillStyle = `rgba(95,95,95,${rng() * 0.13})`; g.fillRect(rng() * w, h * 0.36 + rng() * h * 0.28, 6 + rng() * 22, 1); }
    for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(40,36,32,0.6)'; g.beginPath(); g.arc(rng() * w, h * 0.37 + rng() * h * 0.26, 1 + rng() * 2.5, 0, 7); g.fill(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [y0, flip] of [[0.1, false], [0.9, true]]) {
      // compound band near the rim and branding mid-wall
      g.fillStyle = col; g.fillRect(0, h * (flip ? y0 - 0.075 : y0 + 0.045), w, h * 0.03);
      for (let k = 0; k < 2; k++) {
        g.save(); g.translate(w * (0.25 + k * 0.5), h * (flip ? y0 - 0.18 : y0 + 0.16)); g.scale(flip ? 1 : -1, flip ? -1 : 1);
        g.fillStyle = '#ececec'; g.font = '800 34px "Saira Condensed", Arial Narrow, sans-serif'; g.fillText('A P E X   R A C I N G', 0, 0); g.restore();
        g.save(); g.translate(w * (0.02 + k * 0.5), h * (flip ? y0 - 0.18 : y0 + 0.16)); g.scale(flip ? 1 : -1, flip ? -1 : 1);
        g.fillStyle = col; g.font = '800 34px "Saira Condensed", Arial Narrow, sans-serif'; g.fillText(label, 0, 0); g.restore();
        g.save(); g.translate(w * (0.13 + k * 0.5), h * (flip ? y0 - 0.21 : y0 + 0.19)); g.scale(flip ? 1 : -1, flip ? -1 : 1);
        g.fillStyle = '#9a9a9a'; g.font = '600 14px Arial, sans-serif'; g.fillText('305/705 R18', 0, 0); g.restore();
      }
    }
  });
  tx.tyre = { S: tyreTex('#e0262b', 'S O F T'), M: tyreTex('#f2c318', 'M E D I U M'), H: tyreTex('#f2f2f2', 'H A R D') };
  // radial blur used for spinning rims at speed
  tx.rimBlur = canvasTex(256, 256, (g, w) => {
    const c = w / 2, gr2 = g.createRadialGradient(c, c, c * 0.25, c, c, c);
    gr2.addColorStop(0, 'rgba(60,64,70,0.95)'); gr2.addColorStop(0.55, 'rgba(38,40,44,0.85)'); gr2.addColorStop(0.92, 'rgba(70,74,80,0.9)'); gr2.addColorStop(1, 'rgba(20,20,22,0.9)');
    g.fillStyle = gr2; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    g.fillStyle = 'rgba(150,155,160,0.9)'; g.beginPath(); g.arc(c, c, c * 0.18, 0, 7); g.fill();
  }, { clamp: true });
  tx.rimCover = canvasTex(256, 256, (g, w) => {
    const c = w / 2; g.fillStyle = '#1b1d21'; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    g.strokeStyle = '#2c2f35'; g.lineWidth = 14; g.beginPath(); g.arc(c, c, c * 0.82, 0, 7); g.stroke();
    g.fillStyle = '#9aa1aa'; g.beginPath(); g.arc(c, c, c * 0.16, 0, 7); g.fill();
    g.fillStyle = '#5f6670'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(c + Math.cos(k * 1.047) * c * 0.1, c + Math.sin(k * 1.047) * c * 0.1, 4, 0, 7); g.fill(); }
  }, { clamp: true });
  tx.spark = canvasTex(64, 64, (g) => { const gr2 = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr2.addColorStop(0, 'rgba(255,255,255,1)'); gr2.addColorStop(0.25, 'rgba(255,200,110,0.9)'); gr2.addColorStop(1, 'rgba(255,120,0,0)'); g.fillStyle = gr2; g.fillRect(0, 0, 64, 64); });
  tx.smoke = canvasTex(64, 64, (g) => { const gr2 = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr2.addColorStop(0, 'rgba(235,235,235,0.5)'); gr2.addColorStop(1, 'rgba(235,235,235,0)'); g.fillStyle = gr2; g.fillRect(0, 0, 64, 64); });
  tx.blob = canvasTex(128, 64, (g) => { const gr2 = g.createRadialGradient(64, 32, 4, 64, 32, 62); gr2.addColorStop(0, 'rgba(0,0,0,0.7)'); gr2.addColorStop(1, 'rgba(0,0,0,0)'); g.setTransform(1, 0, 0, 0.5, 0, 16); g.fillStyle = gr2; g.fillRect(0, -32, 128, 128); }, { clamp: true });
  tx.leaf = pbrSet(128, (u, v) => tileFbm(u * 24, v * 24, 24, 3), (h) => [40 + h * 50, 70 + h * 70, 28 + h * 30], null, { normalStrength: 9 });
  tx.foliage = canvasTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * w * 0.44, x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r * 0.9;
      const shade = 0.55 + 0.45 * (1 - r / (w * 0.44)) * rng() + (y < h / 2 ? 0.12 : -0.05);
      g.fillStyle = `rgb(${Math.round(70 * shade)},${Math.round(118 * shade)},${Math.round(44 * shade)})`;
      g.save(); g.translate(x, y); g.rotate(rng() * Math.PI); g.beginPath(); g.ellipse(0, 0, 7 + rng() * 7, 3 + rng() * 3, 0, 0, 7); g.fill(); g.restore();
    }
  });
  tx.needles = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let b2 = 0; b2 < 7; b2++) {
      const y0 = 20 + b2 * 32, sag = 10 + rng() * 10;
      g.strokeStyle = '#3a2c1e'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, y0); g.quadraticCurveTo(w / 2, y0 + sag, w - 8, y0 + sag * 1.6); g.stroke();
      for (let k = 0; k < 140; k++) {
        const t = rng(), x = 8 + t * (w - 16), y = y0 + sag * (2 * t * (1 - t) * 1 + t * t * 1.6) * 1;
        const shade = 0.6 + rng() * 0.5; g.strokeStyle = `rgb(${Math.round(46 * shade)},${Math.round(82 * shade)},${Math.round(48 * shade)})`; g.lineWidth = 1.6;
        const ang = (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.8), len = 10 + rng() * 12;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len * 0.4, y + Math.sin(ang) * len); g.stroke();
      }
    }
  });
  tx.grassBlades = canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = 8 + rng() * (w - 16), hh = h * (0.45 + rng() * 0.55), lean = (rng() - 0.5) * 30, wd = 2 + rng() * 3;
      const shade = 0.6 + rng() * 0.5;
      g.fillStyle = `rgb(${Math.round(78 * shade)},${Math.round(122 * shade)},${Math.round(46 * shade)})`;
      g.beginPath(); g.moveTo(x - wd, h); g.quadraticCurveTo(x + lean * 0.3, h - hh * 0.6, x + lean, h - hh); g.quadraticCurveTo(x + lean * 0.3 + wd * 0.4, h - hh * 0.6, x + wd, h); g.fill();
    }
  });
  tx.skid = canvasTex(64, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const x = 6 + rng() * (w - 12); g.fillStyle = `rgba(255,255,255,${0.1 + rng() * 0.3})`; g.fillRect(x, 0, 1 + rng() * 3, h); }
    const fade = g.createLinearGradient(0, 0, 0, h); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.2, 'rgba(0,0,0,0)'); fade.addColorStop(0.8, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, w, h);
  });
  tx.marshal = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff6a00'; g.fillRect(0, h * 0.18, w, h * 0.14); g.fillStyle = '#2a3440'; g.fillRect(w * 0.2, h * 0.42, w * 0.6, h * 0.28); });
  tx.bark = canvasTex(64, 128, (g, w, h) => { noiseFill(g, w, h, '#4e3b2a', 0.3, 2500, rng, 1); for (let x = 0; x < w; x += 6) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + rng() * 3, 0, 1, h); } });
  applyPhotoTextures(tx);
  return tx;
}

// ribbon along the track between two lateral offsets (functions of i); always faces up
function ribbon(T, from, to, opts) {
  const { y0 = 0, y1 = 0, vScale = 10, uScale = 0, include = null, cols = 2, color = null, profile = null } = opts;
  const pos = [], uv = [], col = [], idx = [];
  const n = T.n, flip = from(0) < to(0);
  let s = 0, prevInc = false;
  for (let k = 0; k <= n; k++) {
    const i = k % n, inc = include ? include(i) : true;
    if (inc) {
      const a = from(i), b = to(i);
      for (let c = 0; c < cols; c++) {
        const u = c / (cols - 1), lat = lerp(a, b, u), y = profile ? profile(u) : lerp(y0, y1, u);
        pos.push(T.px[i] + T.nx[i] * lat, y, -(T.py[i] + T.ny[i] * lat)); uv.push(uScale ? lat / uScale : u, s / vScale);
        if (color) { const v = color(i, lat); col.push(v[0], v[1], v[2]); }
      }
      if (prevInc) {
        const r1 = pos.length / 3 - cols, r0 = r1 - cols;
        for (let c = 0; c < cols - 1; c++) {
          if (!flip) idx.push(r0 + c, r0 + c + 1, r1 + c, r0 + c + 1, r1 + c + 1, r1 + c);
          else idx.push(r0 + c, r1 + c, r0 + c + 1, r0 + c + 1, r1 + c, r1 + c + 1);
        }
      }
    }
    prevInc = inc; s += T.ds;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function wallRibbon(T, off, side, h0, h1, vScale, include = null) {
  const pos = [], uv = [], idx = [];
  let s = 0;
  for (let k = 0; k <= T.n; k++) {
    const i = k % T.n, o = off[i] * side, x = T.px[i] + T.nx[i] * o, y = T.py[i] + T.ny[i] * o;
    const u = (side > 0 ? s : -s) / vScale; // the right wall is seen from the other side: run its texture backwards so text reads
    pos.push(x, h0, -y, x, h1, -y); uv.push(u, 0, u, 1);
    if (k && (!include || (include(i) && include((i - 1 + T.n) % T.n)))) { const b = k * 2; idx.push(b - 2, b, b - 1, b - 1, b, b + 1); }
    s += T.ds;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// layered ground decals are pulled toward the camera instead of stacked by height
const decal = (mat, layer) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -layer; mat.polygonOffsetUnits = -layer * 4; return mat; };
// break up tiling on huge surfaces by blending the map at three scales
function antiTile(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 tA = texture2D(map, vMapUv);
        vec4 tB = texture2D(map, vMapUv * 0.137 + vec2(0.31, 0.77));
        vec4 tC = texture2D(map, vMapUv * 0.021);
        vec4 sampledDiffuseColor = mix(tA, tB, 0.45);
        sampledDiffuseColor.rgb *= 0.78 + 0.45 * tC.g;
        diffuseColor *= sampledDiffuseColor;
      #endif`);
  };
}

// crowd shader: each figure in the texture is a 6 px column; columns get their own phase and jump/wave amount
function crowdMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  m.userData.excite = { value: 0 }; m.userData.time = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.excite = m.userData.excite; sh.uniforms.ctime = m.userData.time;
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      vec2 cuv = vMapUv; float col = floor(cuv.x * 1024.0 / 6.0); float row = floor(cuv.y * 16.0);
      float ph = fract(sin(col * 12.9898 + row * 78.233) * 43758.5453);
      float bob = max(0.0, sin(ctime * (4.0 + ph * 5.0) + ph * 30.0)) * (0.15 + excite * 0.85) * step(0.35, ph);
      cuv.y -= bob * (1.0 / 256.0) * 4.0;
      vec4 sampledDiffuseColor = texture2D(map, cuv);
      diffuseColor *= sampledDiffuseColor;`);
    sh.fragmentShader = 'uniform float excite; uniform float ctime;\n' + sh.fragmentShader;
  };
  return m;
}
// stepped stand with roof on columns, its crowd facing local -z (toward the track)
function cornerStand(L, rows, white, steel, crowdMat, rng, quality) {
  const depth = 0.85, rise = 0.5, shape = new THREE.Shape(); shape.moveTo(0, 0);
  for (let r = 0; r < rows; r++) { shape.lineTo(-r * depth, (r + 1) * rise); shape.lineTo(-(r + 1) * depth, (r + 1) * rise); }
  shape.lineTo(-rows * depth, 0); shape.lineTo(0, 0);
  const sg = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false }); sg.translate(0, 0, -L / 2);
  const uv = sg.attributes.uv, p = sg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getZ(i) / 30, p.getY(i) / (rise * 16));
  const fans3d = quality >= 1 && rng;
  const g = new THREE.Group(), stand = new THREE.Mesh(sg, fans3d ? Crowd.seatMaterial() : crowdMat); stand.rotation.y = -Math.PI / 2; stand.castShadow = stand.receiveShadow = true; g.add(stand);
  if (fans3d) g.userData.fill = () => Crowd.populate(stand, L, rows, depth, rise, rng, quality);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(L * 1.02, 0.4, rows * depth + 3), white); roof.position.set(0, rows * rise + 4, -(rows * depth) / 2 - 0.5); roof.castShadow = true; g.add(roof);
  for (let k = -3; k <= 3; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, rows * rise + 4, 0.4), steel); c.position.set(k * L / 7, (rows * rise + 4) / 2, -rows * depth - 0.3); g.add(c); }
  return g;
}
// ---- pit lane, team garages, pit wall stands, release lights (layout from pitLane in sim.js) ----------
function buildPitComplex(T, P, world, add, tx, steel, white, quality) {
  const n = T.n, sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const pitS = (i) => ((i - P.a + n) % n) * T.ds, inPit = (i) => pitS(i) <= P.L;
  const at = (sa, dist, h = 0) => { const i = P.idx(sa), j = (i + 1) % n, f = (sa % T.ds) / T.ds; return W(T.px[i] + (T.px[j] - T.px[i]) * f - T.nx[i] * dist, T.py[i] + (T.py[j] - T.py[i]) * f - T.ny[i] * dist, h); };
  const hd = (sa) => { const i = P.idx(sa); return Math.atan2(T.ty[i], T.tx[i]); };
  const place = (obj, sa, dist, h = 0) => { obj.position.copy(at(sa, dist, h)); obj.rotation.y = hd(sa); world.add(obj); return obj; }; // local +x along the lane, +z toward the garages
  const outer = (sa) => P.path(sa) + 4 + P.mainFactor(sa) * (P.garageDist + 16 - P.path(sa) - 4);
  // road surface (asphalt) from the pit wall / entry edge out to (and into) the garages
  const road = new THREE.MeshStandardMaterial({ map: rep(tx.asphalt, 1, 1), normalMap: rep(tx.asphaltN, 1, 1), roughnessMap: rep(tx.asphaltR, 1, 1), normalScale: new THREE.Vector2(0.3, 0.3), roughness: 1, color: 0xc4c6ca });
  add(ribbon(T, (i) => -(P.path(pitS(i)) - 4), (i) => -outer(pitS(i)), { vScale: 6, uScale: 6, include: inPit }), decal(road, 4));
  // white lines: road edges on the entry/exit roads, pit wall line, fast/working lane divider (dashed), speed lines
  const paint = decal(new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }), 5), yellow = decal(new THREE.MeshStandardMaterial({ color: 0xf4c20d, roughness: 0.6 }), 5);
  const line = (dist, inc, mat = paint, wdt = 0.14) => add(ribbon(T, (i) => -(dist(pitS(i)) - wdt / 2), (i) => -(dist(pitS(i)) + wdt / 2), { vScale: 4, include: inc }), mat);
  line((sa) => P.path(sa) - 3.8, (i) => inPit(i) && (pitS(i) < P.mainStart + 5 || pitS(i) > P.mainEnd - 5), paint, 0.2);
  line((sa) => P.path(sa) + 3.8, (i) => inPit(i) && (pitS(i) < P.mainStart + 5 || pitS(i) > P.mainEnd - 5), paint, 0.2);
  line(() => P.wallDist + 0.9, (i) => pitS(i) > P.mainStart && pitS(i) < P.mainEnd, paint, 0.2);
  line(() => P.lineDist, (i) => pitS(i) > P.mainStart && pitS(i) < P.mainEnd && Math.floor(pitS(i) / 3) % 2 === 0, paint, 0.16);
  line(() => P.garageDist - 0.4, (i) => pitS(i) > P.mainStart && pitS(i) < P.mainEnd, yellow, 0.18);
  const across = (sa, mat) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 7.4).rotateX(-Math.PI / 2), mat); place(g, sa, P.path(sa), 0.03); g.material.polygonOffset = true; };
  across(P.speedLine1, paint); across(P.speedLine2, paint);
  // concrete walls along the outside of the entry/exit roads, and the inner wall that leads into the pit wall
  const conc = new THREE.MeshStandardMaterial({ map: rep(tx.concrete, 1, 1), roughness: 0.9, side: THREE.DoubleSide });
  const wallAlong = (dist, s0, s1, hgt = 1.0) => {
    const pos = [], idx = []; let k = 0;
    for (let sa = s0; sa <= s1; sa += T.ds) { const a = at(sa, dist(sa), 0), b = at(sa, dist(sa), hgt); pos.push(a.x, a.y, a.z, b.x, b.y, b.z); if (k) idx.push(k * 2 - 2, k * 2, k * 2 - 1, k * 2 - 1, k * 2, k * 2 + 1); k++; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const uv = []; for (let q = 0; q < k; q++) uv.push(q * T.ds / 4, 0, q * T.ds / 4, 1); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); add(g, conc);
  };
  wallAlong((sa) => P.path(sa) + 4.6, 20, P.mainStart + 4); wallAlong((sa) => P.path(sa) + 4.6, P.mainEnd - 4, P.L - 15);
  wallAlong((sa) => P.path(sa) - 4.4, P.mainStart * 0.5, P.mainStart + 2); wallAlong((sa) => P.path(sa) - 4.4, P.mainEnd - 2, P.mainEnd + P.exitLen * 0.5);
  // signs: pit entry, speed limit start and end
  const sign = (sa, dist, draw) => {
    const g = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8).translate(0, 1.1, 0), steel); g.add(pole);
    const t = canvasTex(256, 256, draw, { clamp: true }), b = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); b.position.y = 2.4; b.rotation.y = -Math.PI / 2; g.add(b);
    place(g, sa, dist);
  };
  const ring = (txt, cross) => (g, w, h) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.48, 0, 7); g.fill(); g.lineWidth = w * 0.09; g.strokeStyle = cross ? '#222' : '#d50000'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.42, 0, 7); g.stroke(); g.fillStyle = '#111'; g.font = `800 ${w * 0.36}px "Saira Condensed", Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 4); if (cross) { g.strokeStyle = '#222'; g.lineWidth = w * 0.05; g.beginPath(); g.moveTo(w * 0.22, h * 0.78); g.lineTo(w * 0.78, h * 0.22); g.stroke(); } };
  sign(P.speedLine1 - 2, P.path(P.speedLine1) + 4.4, ring('80')); sign(P.speedLine2 + 2, P.path(P.speedLine2) + 4.4, ring('80', true));
  sign(8, P.path(8) + 4.4, (g, w, h) => { g.fillStyle = '#0b3d91'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `800 ${w * 0.4}px "Saira Condensed", Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PIT', w / 2, h * 0.42); g.font = `700 ${w * 0.15}px Arial`; g.fillText('ENTRY →', w / 2, h * 0.78); });

  // ---- garages: one bay per team behind its box, with white façade blocks between ----
  const sp = P.boxSpacing, bw = Math.min(sp - 2, 15), D = 18, Hb = 10, front = P.garageDist;
  const first = P.boxS(0) - sp / 2 - 12, last = P.boxS(10) + sp / 2 + 12;
  const block = (s0, s1, h0, h1) => { if (s1 - s0 < 0.2) return; const m = new THREE.Mesh(new THREE.BoxGeometry(s1 - s0, h1 - h0, D), white); m.castShadow = m.receiveShadow = true; place(m, (s0 + s1) / 2, front + D / 2, (h0 + h1) / 2); };
  let prev = first;
  const lights = [];
  TEAMS.forEach((tm, k) => {
    const c = P.boxS(k), s0 = c - bw / 2, s1 = c + bw / 2;
    block(prev, s0, 0, Hb); prev = s1;
    block(s0, s1, 7, Hb); // above the door
    const g = new THREE.Group(); place(g, c, front, 0);
    // interior: epoxy floor, team-coloured back wall with the team name, light ceiling, side walls
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(bw, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.25, metalness: 0.1 })); floor.position.set(0, 0.04, D / 2); g.add(floor);
    const backTex = canvasTex(1024, 512, (q, w, h) => { q.fillStyle = tm.c1; q.fillRect(0, 0, w, h); q.fillStyle = lum(tm.c2) > 0.18 ? tm.c2 : tm.c3; q.fillRect(0, h * 0.62, w, h * 0.08); q.fillStyle = lum(tm.c1) > 0.55 ? '#121417' : '#fff'; q.font = `800 ${h * 0.2}px "Saira Condensed", Arial`; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(tm.name.toUpperCase(), w / 2, h * 0.42); });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(bw, 7), new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.6 })); back.position.set(0, 3.5, D - 0.3); back.rotation.y = Math.PI; g.add(back);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(bw, D).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 })); ceil.position.set(0, 7, D / 2); g.add(ceil);
    for (const sd of [-1, 1]) { const w2 = new THREE.Mesh(new THREE.PlaneGeometry(D, 7), new THREE.MeshStandardMaterial({ color: tm.c1, roughness: 0.7 })); w2.position.set(sd * bw / 2, 3.5, D / 2); w2.rotation.y = -sd * Math.PI / 2; g.add(w2); }
    // name board over the door
    const signTex = canvasTex(1024, 160, (q, w, h) => { q.fillStyle = '#16181c'; q.fillRect(0, 0, w, h); q.fillStyle = tm.c1; q.fillRect(0, 0, w * 0.06, h); q.fillStyle = '#fff'; q.font = `800 ${h * 0.55}px "Saira Condensed", Arial`; q.textBaseline = 'middle'; q.fillText(tm.name.toUpperCase(), w * 0.09, h * 0.54); q.textAlign = 'right'; q.fillStyle = '#aab'; q.fillText(tm.drivers.map((d) => d.num).join(' · '), w * 0.97, h * 0.54); });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.9, bw * 0.9 * 160 / 1024), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.35 })); board.position.set(0, 8.4, -0.05); board.rotation.y = Math.PI; g.add(board);
    if (quality >= 1) {
      // tyre racks with tyres in blankets along the back wall, tool trolleys
      const blanket = new THREE.MeshStandardMaterial({ color: tm.c1, roughness: 0.9 }), tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.34, 18);
      for (let r = 0; r < 4; r++) for (let st = 0; st < 4; st++) { const ty = new THREE.Mesh(tyreGeo, blanket); ty.position.set(-bw / 2 + 1.4 + r * 0.85 + (r > 1 ? bw - 5.6 : 0), 0.2 + st * 0.36, D - 1.4); g.add(ty); }
      for (const x of [-2.5, 2.5]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.6), new THREE.MeshStandardMaterial({ color: lum(tm.c2) > 0.18 ? tm.c2 : tm.c1, roughness: 0.4, metalness: 0.3 })); tr.position.set(x, 0.55, D - 4); g.add(tr); }
      const scr = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 0.08), new THREE.MeshStandardMaterial({ color: 0x0b0d10, emissive: 0x1d3b5a, emissiveIntensity: 0.8 })); scr.position.set(0, 4.6, D - 0.5); g.add(scr);
    }
    // painted box on the working lane: outline in team colour with yellow front-wheel marks
    const boxTex = canvasTex(512, 256, (q, w, h) => { q.clearRect(0, 0, w, h); q.strokeStyle = tm.c1 === '#ffffff' ? '#888' : tm.c1; q.lineWidth = 14; q.strokeRect(8, 8, w - 16, h - 16); q.fillStyle = '#f4c20d'; for (const y of [h * 0.18, h * 0.82]) { q.fillRect(w * 0.79, y - 6, w * 0.12, 12); q.fillRect(w * 0.84, y - 22, 12, 44); } q.fillStyle = 'rgba(255,255,255,0.85)'; q.font = `800 ${h * 0.3}px "Saira Condensed", Arial`; q.textAlign = 'center'; q.textBaseline = 'middle'; q.save(); q.translate(w * 0.42, h / 2); q.fillText(tm.name.split(' ')[0].toUpperCase(), 0, 0); q.restore(); }, { clamp: true });
    const bx = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.4).rotateX(-Math.PI / 2), decal(new THREE.MeshStandardMaterial({ map: boxTex, transparent: true, roughness: 0.7 }), 6)); place(bx, c, P.workDist, 0.035);
    // release light hanging over the nose of the stopped car
    const rig = new THREE.Group(), post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 5, 0.15).translate(0, 2.5, 0), steel); rig.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, front - P.workDist).translate(0, 4.9, -(front - P.workDist) / 2), steel); rig.add(arm);
    const lampBox = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 })); lampBox.position.set(0, 4.5, -(front - P.workDist)); rig.add(lampBox);
    const red = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 0 }), green = new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x20ff40, emissiveIntensity: 0 });
    for (const [m, y] of [[red, 4.65], [green, 4.35]]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), m); l.position.set(-0.13, y, -(front - P.workDist)); rig.add(l); }
    place(rig, c + 3.6, front - 0.6, 0);
    // pit wall stand: desk, screens and a canopy in team colours
    const st = new THREE.Group(), tcol = new THREE.MeshStandardMaterial({ color: tm.c1, roughness: 0.5 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 1.2), tcol); desk.position.set(0, 1.5, 0.3); st.add(desk);
    const plat = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.15, 2.4), steel); plat.position.set(0, 1.05, 0.6); st.add(plat);
    for (let q2 = -1.5; q2 <= 1.5; q2 += 1) { const sc = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.06), new THREE.MeshStandardMaterial({ color: 0x0b0d10, emissive: 0x1b3550, emissiveIntensity: 0.9 })); sc.position.set(q2, 2.3, -0.05); sc.rotation.x = -0.2; st.add(sc); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 2.6), tcol); roof.position.set(0, 3.4, 0.5); roof.castShadow = true; st.add(roof);
    for (const x of [-2.6, 2.6]) { const pp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), steel); pp.position.set(x, 2.25, 1.6); st.add(pp); }
    place(st, c, P.wallDist + 0.5, 0);
    lights.push({ red, green, s: c });
  });
  block(prev, last, 0, Hb);
  // upper floor (team hospitality glass) and roof over the whole pit building
  const Lb = last - first, mid = (first + last) / 2;
  const glassMat = new THREE.MeshPhysicalMaterial({ map: rep(tx.glass, Lb / 8, 1), roughness: 0.05, metalness: 0.6, clearcoat: 1 });
  const upper = new THREE.Mesh(new THREE.BoxGeometry(Lb * 0.98, 6, 15), [glassMat, glassMat, white, white, glassMat, glassMat]); upper.castShadow = true; place(upper, mid, front + 9.5, Hb + 3);
  const roofP = new THREE.Mesh(new THREE.BoxGeometry(Lb, 0.6, 21), white); roofP.castShadow = true; place(roofP, mid, front + 8.5, Hb + 6.3);
  return { P, lights, at, hd };
}
function buildWorld(T, themeKey, quality) {
  const th = THEMES[themeKey], tx = GFX.tex, world = new THREE.Group();
  const night = th.time === 'night', rng = mulberry32(hashStr(T.spec.id)), hw = T.hw, n = T.n;
  const add = (geo, mat, o = {}) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = o.rs !== false; m.castShadow = !!o.cs; world.add(m); return m; };
  const desert = themeKey === 'desert', street = themeKey === 'street';
  // animated crowd: the texture's people bob and wave (two frames offset per column), more when cars pass
  Crowd.spots = [];
  const crowdMat = crowdMaterial(tx.crowd);
  GFX.crowdMat = crowdMat;
  const groundAlb = desert ? tx.sand : tx.grass, groundN = desert ? tx.sandN : tx.grassN;
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), p4 = new THREE.Vector3(), cc = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);

  // ---- terrain: flat infield, rolling hills beyond ----
  const b = T.bounds, cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const R0 = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2 + 380;
  const NZ = makeNoise(hashStr(T.spec.id) ^ 77);
  const size = R0 * 2 + 9000, segs = quality >= 2 ? 220 : 140;
  const hillAmp0 = { forest: 260, parkland: 120, airfield: 60, street: 220, tropical: 200, island: 0, desert: 90, prairie: 70 }[themeKey];
  // ground height at a sim (x, y) point, matching the terrain mesh below
  const hAt = (sx, sy) => {
    const x = sx, z = -sy, d = Math.hypot(x - cx, z + cy), k = clamp((d - R0) / 900, 0, 1), ks = k * k * (3 - 2 * k);
    return Math.max(-0.15 + ks * hillAmp0 * (NZ.fbm(x / 1400, z / 1400, 5) * 1.6 - 0.25), -0.15);
  };
  const tg = new THREE.PlaneGeometry(size, size, segs, segs); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, tcol = [];
  const hillAmp = { forest: 260, parkland: 120, airfield: 60, street: 220, tropical: 200, island: 0, desert: 90, prairie: 70 }[themeKey];
  const groundC = new THREE.Color(th.ground), forestC = new THREE.Color(th.hills), rockC = new THREE.Color('#8b8478');
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i) + cx, z = tp.getZ(i) - cy, d = Math.hypot(x - cx, z + cy);
    const k = clamp((d - R0) / 900, 0, 1), ks = k * k * (3 - 2 * k);
    let h = -0.15 + ks * hillAmp * (NZ.fbm(x / 1400, z / 1400, 5) * 1.6 - 0.25);
    if (th.water) h = d > R0 - 150 ? -2 - clamp((d - R0 + 150) / 300, 0, 1) * 10 : -0.15;
    tp.setXYZ(i, x, Math.max(h, th.water ? -14 : -0.15), z);
    const f = NZ.fbm(x / 300, z / 300, 3);
    const c = groundC.clone().lerp(forestC, clamp(ks * 1.2 * (0.5 + f), 0, 0.9)).lerp(rockC, clamp((h - 160) / 140, 0, 0.6));
    c.multiplyScalar(0.82 + f * 0.36); tcol.push(c.r, c.g, c.b);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(tcol, 3)); tg.computeVertexNormals();
  const tuv = tg.attributes.uv; for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tp.getX(i) / 9, tp.getZ(i) / 9);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundAlb, normalMap: groundN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, vertexColors: true });
  antiTile(groundMat); add(tg, groundMat);
  if (th.water) {
    const water = add(new THREE.PlaneGeometry(size * 2, size * 2), new THREE.MeshPhysicalMaterial({ color: 0x174256, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 }), { rs: false });
    water.rotation.x = -Math.PI / 2; water.position.set(cx, -1.0, -cy);
  }

  // ---- track surfaces ----
  const asphaltMat = decal(new THREE.MeshStandardMaterial({ map: tx.asphalt, normalMap: tx.asphaltN, roughnessMap: tx.asphaltR, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 1, vertexColors: true }), 3);
  tx.asphalt.repeat.set(hw * 2 / 3.5, 1); tx.asphaltN.repeat.set(hw * 2 / 3.5, 1); tx.asphaltR.repeat.set(hw * 2 / 3.5, 1);
  add(ribbon(T, () => hw, () => -hw, {
    vScale: 3.5, cols: 17, color: (i, lat) => {
      const o = T.lineO[i], rub = Math.exp(-(((lat - o) / 1.5) ** 2)), marbles = Math.exp(-(((Math.abs(lat - o) - 4.2) / 0.8) ** 2)) * 0.5;
      const v = 1 - 0.34 * rub + 0.1 * marbles - 0.05 * Math.sin(i * 0.13 + lat) ** 2;
      return [v, v, v * 1.01];
    },
  }), asphaltMat);
  const lineMat = decal(new THREE.MeshStandardMaterial({ color: 0xeeeee8, roughness: 0.6 }), 4);
  add(ribbon(T, () => hw - 0.02, () => hw - 0.22, { vScale: 4 }), lineMat);
  add(ribbon(T, () => -hw + 0.22, () => -hw + 0.02, { vScale: 4 }), lineMat);
  const grassVerge = T.spec.runoff === 'grass';
  const vergeMat = decal(new THREE.MeshStandardMaterial({ map: rep(grassVerge ? groundAlb : tx.runoff, 1, 1), normalMap: grassVerge ? groundN : null, roughness: 0.95, vertexColors: true, color: grassVerge ? new THREE.Color(th.ground).lerp(new THREE.Color('#ffffff'), 0.5) : 0xb4b8be }), 1);
  const mow = (i) => { const v = grassVerge ? (Math.floor((i * T.ds) / 12) % 2 ? 1.0 : 0.84) : 1; return [v, v, v]; };
  add(ribbon(T, () => hw, (i) => T.wallL[i] + 2, { vScale: 3, uScale: 3, cols: 3, color: mow }), vergeMat);
  add(ribbon(T, (i) => -T.wallR[i] - 2, () => -hw, { vScale: 3, uScale: 3, cols: 3, color: mow }), vergeMat);
  if (T.spec.runoff === 'tarmac') {
    const gm = decal(new THREE.MeshStandardMaterial({ map: tx.paintGreen, roughness: 0.7 }), 2);
    add(ribbon(T, () => hw + 1.4, () => hw + 3.4, { vScale: 4, include: (i) => T.kerb[i] && T.wallL[i] > hw + 4 }), gm);
    add(ribbon(T, () => -hw - 3.4, () => -hw - 1.4, { vScale: 4, include: (i) => T.kerb[i] && T.wallR[i] > hw + 4 }), gm);
  }
  const gravMat = decal(new THREE.MeshStandardMaterial({ map: tx.gravel, normalMap: tx.gravelN, roughness: 1 }), 2);
  add(ribbon(T, () => hw + 1.5, (i) => Math.max(hw + 1.7, T.wallL[i] - 1), { vScale: 5, uScale: 5, include: (i) => T.gravelL[i] }), gravMat);
  add(ribbon(T, (i) => -Math.max(hw + 1.7, T.wallR[i] - 1), () => -hw - 1.5, { vScale: 5, uScale: 5, include: (i) => T.gravelR[i] }), gravMat);
  // 3D kerbs: flat painted section rising to a rounded outer lip
  const kerbMat = decal(new THREE.MeshStandardMaterial({ map: tx.kerb, roughness: 0.5 }), 4);
  const kprof = (u) => (u < 0.7 ? u * 0.04 : 0.028 + Math.sin(((u - 0.7) / 0.3) * Math.PI) * 0.035);
  add(ribbon(T, () => hw - 0.15, () => hw + 1.35, { vScale: 2, cols: 8, include: (i) => T.kerb[i], profile: kprof }), kerbMat);
  add(ribbon(T, () => -hw + 0.15, () => -hw - 1.35, { vScale: 2, cols: 8, include: (i) => T.kerb[i], profile: kprof }), kerbMat);

  // ---- barriers: advertising wall, concrete backing, cap, catch fence ----
  const wallMat = new THREE.MeshStandardMaterial({ map: rep(tx.wall, 1, 1), roughness: 0.55, side: THREE.DoubleSide });
  const concMat = new THREE.MeshStandardMaterial({ map: rep(tx.concrete, 1, 1), roughness: 0.9, side: THREE.DoubleSide });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x9a9da2, roughness: 0.8, side: THREE.DoubleSide });
  // pit lane: the right-hand barrier opens where the pit entry and exit roads cross it
  const PL = pitLane(T), pitS = (i) => ((i - PL.a + n) % n) * T.ds;
  // keep trees, grass, posts and buildings out of the pit lane and the pit building
  const pitArea = (x, y) => {
    const q = trackDistance(T, x, y, -1, 0, 2); if (q.i < 0) return false;
    // and out of the main grandstand
    const ms = GFX.mainStand;
    if (ms) { let d = q.i - ms.mid; if (d > n / 2) d -= n; if (d < -n / 2) d += n; const lt = (x - T.px[q.i]) * T.nx[q.i] + (y - T.py[q.i]) * T.ny[q.i]; if (Math.abs(d) * T.ds < ms.L / 2 + 8 && lt > 0 && lt < ms.lat + 14) return true; }
    const sa = pitS(q.i); if (sa > PL.L + 15 && sa < T.length - 15) return false;
    const lat = (x - T.px[q.i]) * T.nx[q.i] + (y - T.py[q.i]) * T.ny[q.i]; if (lat > -T.hw + 1) return false;
    return -lat < PL.path(Math.min(sa, PL.L)) + 9 + PL.mainFactor(Math.min(sa, PL.L)) * 34;
  };
  const keepWall = (side) => (i) => side > 0 || (() => { const sa = pitS(i); return sa > PL.L + 4 || (sa > PL.mainStart - 2 && sa < PL.mainEnd + 2); })();
  for (const [off, side] of [[T.wallL, 1], [T.wallR, -1]]) {
    const inc = keepWall(side);
    add(wallRibbon(T, off, side, -0.2, 1.05, 160, inc), wallMat, { cs: quality >= 3 });
    add(wallRibbon(T, off.map((v) => v + 0.35), side, -0.2, 1.05, 12, inc), concMat);
    const capPos = [], capIdx = [];
    for (let k = 0; k <= n; k++) { const i = k % n; for (const o2 of [off[i], off[i] + 0.35]) { const o = o2 * side; capPos.push(T.px[i] + T.nx[i] * o, 1.05, -(T.py[i] + T.ny[i] * o)); } if (k && inc(i) && inc((i - 1 + n) % n)) { const bb = k * 2; capIdx.push(bb - 2, bb - 1, bb, bb - 1, bb + 1, bb); } }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3)); cg.setIndex(capIdx); cg.computeVertexNormals();
    add(cg, capMat);
  }
  if (quality >= 1) {
    const fenceMat = new THREE.MeshStandardMaterial({ map: rep(tx.fence, 1, 1), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.8 });
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 3.6, 6).translate(0, 2.85, 0), new THREE.MeshStandardMaterial({ color: 0x6d7278, metalness: 0.8, roughness: 0.4 }), Math.ceil(n / 2) * 2 + 8);
    let pk = 0;
    for (const [off, side] of [[T.wallL, 1], [T.wallR, -1]]) {
      const fg = wallRibbon(T, off.map((v) => v + 0.18), side, 1.05, 4.6, 1.1, keepWall(side));
      const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 3.2);
      add(fg, fenceMat, { rs: false });
      for (let i = 0; i < n; i += 2) { if (!keepWall(side)(i)) continue; const o = (off[i] + 0.18) * side; m4.makeTranslation(T.px[i] + T.nx[i] * o, 0, -(T.py[i] + T.ny[i] * o)); posts.setMatrixAt(pk++, m4); }
    }
    posts.count = pk; world.add(posts);
  }
  // TecPro blocks and stacked tyre walls on the outside of the big stops
  const tec = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.0, 1.0).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 1600);
  const tyres = new THREE.InstancedMesh(new THREE.TorusGeometry(0.26, 0.09, 8, 16).rotateX(Math.PI / 2).translate(0, 0.09, 0), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.95 }), 4000);
  let tk = 0, yk = 0;
  T.brakeZones.forEach((apex) => {
    const side = T.kapW[apex] > 0 ? -1 : 1, off = side > 0 ? T.wallL : T.wallR;
    for (let j = -25; j < 60 && tk < 1600; j++) {
      const i = (apex + j + n) % n, o = (off[i] - 0.75) * side;
      q4.setFromAxisAngle(UP, Math.atan2(T.ty[i], T.tx[i])); p4.set(T.px[i] + T.nx[i] * o, 0, -(T.py[i] + T.ny[i] * o)); m4.compose(p4, q4, s1); tec.setMatrixAt(tk, m4);
      cc.set(tk % 2 ? '#1565c0' : '#e53935'); tec.setColorAt(tk, cc); tk++;
    }
    for (let j = 20; j < 50; j++) {
      const i = (apex + j + n) % n, o = (off[i] - 1.6) * side;
      for (let r = 0; r < 4 && yk < 4000; r++) { m4.makeTranslation(T.px[i] + T.nx[i] * o, r * 0.18, -(T.py[i] + T.ny[i] * o)); tyres.setMatrixAt(yk++, m4); }
    }
  });
  tec.count = tk; tyres.count = yk; tec.castShadow = tec.receiveShadow = true; world.add(tec, tyres);

  // ---- start line, grid boxes, lights gantry ----
  const lineMesh = add(new THREE.PlaneGeometry(1.0, hw * 2), decal(new THREE.MeshStandardMaterial({ map: tx.checker, roughness: 0.7 }), 5));
  lineMesh.rotation.x = -Math.PI / 2; lineMesh.rotation.z = Math.atan2(T.ty[0], T.tx[0]); lineMesh.position.copy(W(T.px[0], T.py[0], 0));
  const slotMat = decal(new THREE.MeshStandardMaterial({ color: 0xe8e8e6, roughness: 0.6 }), 5);
  for (let k = 0; k < 22; k++) {
    const back = 12 + k * 8, i0 = Math.round((T.length - back) / T.ds) % n, lat = (k % 2 === 0 ? 1 : -1) * Math.min(2.8, hw - 1.5), i1 = (i0 + 1) % n, hd = Math.atan2(T.ty[i1], T.tx[i1]);
    for (const [w, d, dx, dl] of [[0.15, 2.2, 2.7, 0], [0.9, 0.15, 2.3, 1.05], [0.9, 0.15, 2.3, -1.05]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), slotMat); m.rotation.x = -Math.PI / 2; m.rotation.z = hd; m.receiveShadow = true;
      m.position.copy(W(T.px[i1] + T.nx[i1] * (lat + dl) + T.tx[i1] * dx, T.py[i1] + T.ny[i1] * (lat + dl) + T.ty[i1] * dx, 0)); world.add(m);
    }
  }
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.45, metalness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe4e7ea, roughness: 0.55 });
  const gantry = new THREE.Group(), gw = Math.max(T.wallL[0], T.wallR[0]) + 1;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, gw * 2), white); beam.position.y = 7.6; beam.castShadow = true; gantry.add(beam);
  for (const s of [1, -1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.3, 0.8), white); post.position.set(0, 4.15, s * gw); post.castShadow = true; gantry.add(post); }
  const lightMats = [];
  for (let k = 0; k < 5; k++) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.7, 0.75), new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.4 }));
    const z = (k - 2) * 1.0; pod.position.set(-0.65, 6.5, z); gantry.add(pod);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a0000, emissive: 0xff1010, emissiveIntensity: 0, roughness: 0.25 });
    for (const yy of [6.9, 6.25]) { const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), mat); bulb.position.set(-0.88, yy, z); bulb.rotation.y = -Math.PI / 2; gantry.add(bulb); }
    lightMats.push(mat);
  }
  const ig = Math.round(14 / T.ds);
  gantry.position.copy(W(T.px[ig], T.py[ig], 0)); gantry.rotation.y = Math.atan2(T.ty[ig], T.tx[ig]); world.add(gantry);

  // ---- pit lane, garages, pit wall ----
  GFX.pit = buildPitComplex(T, PL, world, add, tx, steel, white, quality);
  // ---- pit complex and main grandstand along the start straight ----
  GFX.mainStand = null;
  // the straight through the line; where the line sits in a kink, the nearest proper straight to it
  const straightAt = (i0) => { let a = i0, b = i0; while (a > i0 - n / 3 && Math.abs(T.kapW[(a - 1 + n) % n]) < 1 / 1500) a--; while (b < i0 + n / 3 && Math.abs(T.kapW[(b + 1) % n]) < 1 / 1500) b++; return [a + 8, b - 8]; };
  let [iA, iB] = straightAt(0);
  for (let d = 1; iB - iA <= 40 && d < Math.round(400 / T.ds); d++) for (const j of [d, -d]) { const [a, b] = straightAt(j); if (b - a > 40 && iB - iA <= 40) [iA, iB] = [a, b]; }
  if (iB - iA > 40) {
    const L = Math.min((iB - iA) * T.ds, 360), mid = (Math.round((iA + iB) / 2) + n) % n, hd = Math.atan2(T.ty[mid], T.tx[mid]);
    const place = (obj, lat, h) => { obj.position.copy(W(T.px[mid] + T.nx[mid] * lat, T.py[mid] + T.ny[mid] * lat, h)); obj.rotation.y = hd; world.add(obj); return obj; };
    const near = (i) => { let d = i - mid; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return Math.abs(d) * T.ds < L / 2 + 30; };
    const wr = T.wallR[mid];
    // stepped grandstand: profile rises away from the track
    const rows = 22, depth = 0.85, rise = 0.48, shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let r = 0; r < rows; r++) { shape.lineTo(-r * depth, (r + 1) * rise); shape.lineTo(-(r + 1) * depth, (r + 1) * rise); }
    shape.lineTo(-rows * depth, 0); shape.lineTo(0, 0);
    const sg = new THREE.ExtrudeGeometry(shape, { depth: L * 0.85, bevelEnabled: false }); sg.translate(0, 0, -L * 0.425);
    const suv = sg.attributes.uv, spos = sg.attributes.position;
    for (let i = 0; i < suv.count; i++) suv.setXY(i, spos.getZ(i) / 30, spos.getY(i) / (rise * 16));
    const stand = new THREE.Mesh(sg, quality >= 1 ? Crowd.seatMaterial() : crowdMat); stand.castShadow = stand.receiveShadow = true;
    stand.rotation.y = -Math.PI / 2;
    const standG = new THREE.Group(); standG.add(stand);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(L * 0.88, 0.5, rows * depth + 4), white); roof.position.set(0, rows * rise + 5, -(rows * depth) / 2 - 1); roof.castShadow = true; standG.add(roof);
    for (let k = -4; k <= 4; k++) { const col2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, rows * rise + 5, 0.5), steel); col2.position.set(k * L * 0.1, (rows * rise + 5) / 2, -rows * depth - 0.5); standG.add(col2); }
    place(standG, T.wallL[mid] + 7, 0);
    GFX.mainStand = { mid, lat: T.wallL[mid] + 7 + rows * depth / 2, L: L * 0.85, top: rows * rise + 5 };
    if (quality >= 1) { world.updateMatrixWorld(true); Crowd.populate(stand, L * 0.85, rows, depth, rise, rng, quality); }
    // flags on poles along the grandstand roof line
    for (let k = -5; k <= 5; k++) {
      const i = (mid + Math.round((k * L * 0.08) / T.ds) + n) % n, tm = TEAMS[(k + 5) % TEAMS.length];
      const o = T.wallL[i] + 5.5, base = W(T.px[i] + T.nx[i] * o, T.py[i] + T.ny[i] * o, 0);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 9, 8).translate(0, 4.5, 0), steel); pole.position.copy(base); world.add(pole);
      const flag = new THREE.Mesh(GFX.flagGeo, flagMaterial(tm)); flag.position.copy(base).add(new THREE.Vector3(0, 8.9, 0)); flag.rotation.y = hd + (k * 0.3); world.add(flag);
    }
  }

  // braking boards and corner grandstands
  const boardTex = {};
  [100, 200, 300].forEach((d) => { boardTex[d] = canvasTex(128, 128, (g) => { g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#111'; g.font = '800 70px "Saira Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(d), 64, 68); }, { clamp: true }); });
  T.brakeZones.forEach((apex, bzk) => {
    let entry = apex; const vmin = T.lineV[apex];
    for (let j = 1; j < 200; j++) { const k = (apex - j + n) % n; if (T.lineV[k] > vmin + 30) { entry = k; break; } }
    [100, 200, 300].forEach((d) => {
      const i = (entry + Math.round(-d / T.ds) + n * 2 + Math.round(60 / T.ds)) % n;
      const side = T.lineO[i] > 0 ? 1 : -1, off = (side > 0 ? T.wallL : T.wallR)[i] - 0.5;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: boardTex[d], roughness: 0.6 }));
      m.position.copy(W(T.px[i] + T.nx[i] * off * side, T.py[i] + T.ny[i] * off * side, 1.9)); m.rotation.y = Math.atan2(T.ty[i], T.tx[i]) - Math.PI / 2; world.add(m);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), steel); pole.position.copy(m.position); pole.position.y = 0.7; world.add(pole);
    });
    if (bzk % 2 === 0) {
      const side = T.kapW[apex] > 0 ? -1 : 1, off = (side > 0 ? T.wallL : T.wallR)[apex] + 10;
      const x = T.px[apex] + T.nx[apex] * off * side, y = T.py[apex] + T.ny[apex] * off * side;
      if (trackDistance(T, x, y, -1, 0, 2).d > off - 3 && !pitArea(x, y)) {
        const st = cornerStand(64, 12, white, steel, crowdMat, rng, quality);
        st.position.copy(W(x, y, 0)); st.rotation.y = Math.atan2(T.ty[apex], T.tx[apex]) + (side > 0 ? 0 : Math.PI); world.add(st); world.updateMatrixWorld(true); if (st.userData.fill) st.userData.fill();
        if (quality >= 1) {
          // TV camera tower beside the stand
          const tw = new THREE.Group(), leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8, 0.3), steel); leg.position.y = 4; tw.add(leg);
          const plat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), steel); plat.position.y = 8; tw.add(plat);
          const cam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.45), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5 })); cam.position.set(0, 8.6, 0); tw.add(cam);
          const ap = (apex + Math.round(25 / T.ds)) % n, o2 = off - 4;
          tw.position.copy(W(T.px[ap] + T.nx[ap] * o2 * side, T.py[ap] + T.ny[ap] * o2 * side, 0)); tw.lookAt(W(T.px[apex], T.py[apex], 8.6)); world.add(tw);
        }
      }
    }
  });
  // advertising bridge across the longest straight
  {
    let best = 0, bi = 0, run = 0;
    for (let i = 0; i < n * 2; i++) { const k = i % n; if (T.aeroZone[k]) { run++; if (run > best) { best = run; bi = k; } } else run = 0; }
    if (best > 40) {
      const i = (bi - Math.round(best / 2) + n) % n, wdt = T.wallL[i] + T.wallR[i] + 4, off = (T.wallL[i] - T.wallR[i]) / 2;
      const ad = new THREE.MeshStandardMaterial({ map: rep(tx.wall, 0.4, 1), roughness: 0.5 });
      const br = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 3.2, wdt), [ad, ad, white, white, white, white]); deck.position.y = 9; deck.castShadow = true; br.add(deck);
      for (const s of [1, -1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(2, 8, 2), white); leg.position.set(0, 4, s * (wdt / 2)); leg.castShadow = true; br.add(leg); }
      br.position.copy(W(T.px[i] + T.nx[i] * off, T.py[i] + T.ny[i] * off, 0)); br.rotation.y = Math.atan2(T.ty[i], T.tx[i]); world.add(br);
    }
  }

  // ---- vegetation and buildings ----
  const placeAround = (count, minExtra, spread, fn) => {
    let placed = 0;
    for (let a = 0; a < count * 6 && placed < count; a++) {
      const i = (rng() * n) | 0, side = rng() < 0.5 ? 1 : -1, wall = (side > 0 ? T.wallL : T.wallR)[i];
      const off = wall + minExtra + Math.pow(rng(), 1.5) * spread;
      const x = T.px[i] + T.nx[i] * off * side + (rng() - 0.5) * 30, y = T.py[i] + T.ny[i] * off * side + (rng() - 0.5) * 30;
      const q = trackDistance(T, x, y, -1, 0, 2);
      if (q.i >= 0 && q.d < Math.max(T.wallL[q.i], T.wallR[q.i]) + minExtra) continue;
      if (pitArea(x, y)) continue;
      if (fn(x, y, i)) placed++;
    }
  };
  const nTrees = Math.round(th.trees * [0.3, 0.6, 1, 1.5][quality]);
  if (nTrees > 0) {
    const kinds = th.treeKind === 'mixed' ? ['broad', 'pine'] : [th.treeKind];
    const barkMat = new THREE.MeshStandardMaterial({ map: tx.bark, roughness: 1 });
    kinds.forEach((kind) => {
      const cnt = Math.round(nTrees / kinds.length);
      const A = treeAssets(kind);
      const crown = new THREE.InstancedMesh(A.crown, A.mat, cnt), trunk = new THREE.InstancedMesh(A.trunk, barkMat, cnt);
      const base = new THREE.Color(kind === 'pine' ? '#5f7d52' : kind === 'palm' ? '#8fae5c' : '#86a65e'), tmp = new THREE.Color();
      let k = 0;
      placeAround(cnt, 6, kind === 'pine' ? 300 : 360, (x, y) => {
        // woods grow in patches; a few trees stand alone
        if (NZ.fbm(x / 260, y / 260, 3) < 0.47 && rng() > 0.12) return false;
        const sc = 0.7 + rng() * 0.65;
        q4.setFromAxisAngle(UP, rng() * 6.28); p4.set(x, hAt(x, y) - 0.3, -y); m4.compose(p4, q4, new THREE.Vector3(sc, sc * (0.85 + rng() * 0.35), sc));
        crown.setMatrixAt(k, m4); trunk.setMatrixAt(k, m4);
        tmp.copy(base).offsetHSL((rng() - 0.5) * 0.05, (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.14); crown.setColorAt(k, tmp);
        k++; return true;
      });
      crown.count = trunk.count = k; crown.castShadow = quality >= 2; crown.receiveShadow = true; trunk.castShadow = quality >= 3;
      world.add(crown, trunk);
    });
  }
  // grass tufts on the verges and just beyond the barriers
  const nGrass = desert || street ? 0 : [0, 7000, 18000, 32000][quality];
  if (nGrass > 0) {
    const tuft = new THREE.InstancedMesh(GFX.grassTuft, GFX.grassMat, nGrass);
    const gc = new THREE.Color(th.ground).lerp(new THREE.Color('#ffffff'), 0.5).multiplyScalar(1.7), tmp = new THREE.Color();
    let k = 0;
    for (let a = 0; a < nGrass * 3 && k < nGrass; a++) {
      const i = (rng() * n) | 0, side = rng() < 0.5 ? 1 : -1, wall = (side > 0 ? T.wallL : T.wallR)[i];
      const onVerge = grassVerge && rng() < 0.55 && !(side > 0 ? T.gravelL : T.gravelR)[i];
      const off = onVerge ? lerp(hw + 1.8, wall - 0.4, rng()) : wall + 0.8 + Math.pow(rng(), 1.8) * 26;
      if (onVerge && wall - 0.4 < hw + 1.8) continue;
      const x = T.px[i] + T.nx[i] * off * side + (rng() - 0.5) * 2, y = T.py[i] + T.ny[i] * off * side + (rng() - 0.5) * 2;
      if (pitArea(x, y)) continue;
      const q = trackDistance(T, x, y, i, 0, 1);
      if (q.i >= 0 && q.d < hw + 1.7) continue;
      const sc = 0.6 + rng() * 0.9;
      q4.setFromAxisAngle(UP, rng() * 6.28); p4.set(x, onVerge ? 0 : hAt(x, y) + 0.12, -y); m4.compose(p4, q4, new THREE.Vector3(sc, sc * (0.7 + rng() * 0.7), sc));
      tuft.setMatrixAt(k, m4); tmp.copy(gc).offsetHSL((rng() - 0.5) * 0.04, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.12); tuft.setColorAt(k, tmp); k++;
    }
    tuft.count = k; tuft.receiveShadow = true; world.add(tuft);
  }
  // rubber laid down under braking, on the racing line into each big stop
  const skidMat = decal(new THREE.MeshBasicMaterial({ map: tx.skid, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }), 3.5);
  T.brakeZones.forEach((apex) => {
    let entry = apex; const vmin = T.lineV[apex];
    for (let j = 1; j < 220; j++) { const k2 = (apex - j + n) % n; if (T.lineV[k2] > vmin + 45) { entry = k2; break; } }
    const span = (apex - entry + n) % n, inZone = (i) => ((i - entry + n) % n) <= span;
    for (const off of [-0.76, 0.76]) for (const lane of [0, 1]) {
      const o2 = off + (lane ? 0.5 : -0.5) * 0.3;
      add(ribbon(T, (i) => T.lineO[i] + o2 + 0.2, (i) => T.lineO[i] + o2 - 0.2, { vScale: 30, include: inZone }), skidMat, { rs: false });
    }
  });
  // marshal posts behind the barriers
  {
    const post = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 2.3, 1.8).translate(0, 1.15, 0), new THREE.MeshStandardMaterial({ map: tx.marshal, roughness: 0.7 }), 64);
    let k = 0;
    for (let i = 0; i < n && k < 64; i += Math.round(380 / T.ds)) {
      const side = k % 2 ? 1 : -1, off = ((side > 0 ? T.wallL : T.wallR)[i] + 2.4) * side;
      const x = T.px[i] + T.nx[i] * off, y = T.py[i] + T.ny[i] * off;
      if (trackDistance(T, x, y, -1, 0, 1).d < Math.abs(off) - 0.5 || pitArea(x, y)) continue;
      q4.setFromAxisAngle(UP, Math.atan2(T.ty[i], T.tx[i])); p4.set(x, 0, -y); m4.compose(p4, q4, s1); post.setMatrixAt(k++, m4);
    }
    post.count = k; post.castShadow = true; world.add(post);
  }
  const nB = Math.round(th.buildings * (quality >= 2 ? 1 : 0.5));
  if (nB > 0) {
    const mat = new THREE.MeshStandardMaterial({ map: tx.windows, roughness: 0.65, emissive: night ? 0xffd9a0 : 0x000000, emissiveMap: night ? tx.windows : null, emissiveIntensity: night ? 0.35 : 0 });
    // tile the window texture by each instance's real size
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_INSTANCING
          vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec2 fsz = abs(normal.x) > 0.5 ? isc.zy : abs(normal.z) > 0.5 ? isc.xy : vec2(0.0);
          vMapUv = uv * fsz / 8.0;
          #ifdef USE_EMISSIVEMAP
            vEmissiveMapUv = vMapUv;
          #endif
        #endif`);
    };
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat, nB);
    const palette = street ? ['#efe3cf', '#f4e9d8', '#e8cfab', '#f7f1e8', '#dcbc98', '#d5dde3', '#f0d9c4'] : ['#d1d4d8', '#c4c7cb', '#ddd6c9', '#b8c1c8'];
    let k = 0;
    placeAround(nB, street ? 4 : 30, street ? 120 : 500, (x, y, i) => {
      const w = 14 + rng() * 22, d = 14 + rng() * 22, h = (street ? 14 : 6) + rng() * (street ? 40 : 16);
      const q = trackDistance(T, x, y, -1, 0, 2);
      if (q.i >= 0 && q.d < Math.max(T.wallL[q.i], T.wallR[q.i]) + Math.max(w, d) * 0.72 + 2) return false;
      q4.setFromAxisAngle(UP, Math.atan2(T.ty[i], T.tx[i])); p4.set(x, hAt(x, y) - 0.6, -y); m4.compose(p4, q4, new THREE.Vector3(w, h + 0.6, d)); inst.setMatrixAt(k, m4);
      cc.set(palette[(rng() * palette.length) | 0]); inst.setColorAt(k, cc); k++;
      return true;
    });
    inst.count = k; inst.castShadow = quality >= 2; inst.receiveShadow = true; world.add(inst);
  }
  if (night) {
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 24, 8).translate(0, 12, 0), steel, 500);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 1.8, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dc, emissiveIntensity: 6 }), 500);
    let k = 0;
    for (let i = 0; i < n && k < 500; i += Math.round(60 / T.ds)) {
      const side = (k % 2) ? 1 : -1, off = ((side > 0 ? T.wallL : T.wallR)[i] + 6) * side;
      const x = T.px[i] + T.nx[i] * off, y = T.py[i] + T.ny[i] * off;
      if (trackDistance(T, x, y, -1, 0, 1).d < Math.abs(off) - 1 || pitArea(x, y)) continue;
      q4.setFromAxisAngle(UP, Math.atan2(T.ty[i], T.tx[i]) + Math.PI / 2);
      p4.set(x, 0, -y); m4.compose(p4, q4, s1); poles.setMatrixAt(k, m4);
      p4.y = 24; m4.compose(p4, q4, s1); heads.setMatrixAt(k, m4); k++;
    }
    poles.count = heads.count = k; world.add(poles, heads);
  }
  return { world, lightMats, wetMats: [asphaltMat] };
}

// trees built from painted foliage cards: normals point out from the crown centre,
// so the cards shade like a soft volume instead of flat planes
function treeAssets(kind) {
  if (GFX.trees && GFX.trees[kind]) return GFX.trees[kind];
  const rng = mulberry32(kind.length * 977), cards = [];
  const card = (w, h, pos, rot) => { const g = new THREE.PlaneGeometry(w, h); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot)); g.translate(pos.x, pos.y, pos.z); return g; };
  let center = new THREE.Vector3(0, 8.5, 0), radii = new THREE.Vector3(4.4, 3.8, 4.4), trunk, tex = GFX.tex.foliage;
  if (kind === 'pine') {
    tex = GFX.tex.needles; center = new THREE.Vector3(0, 10, 0); radii = new THREE.Vector3(3.6, 8, 3.6);
    for (let t = 0; t < 9; t++) {
      const y = 3 + t * 1.75, r = 3.8 * (1 - t / 9.5) + 0.35;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + t * 0.5 + rng() * 0.3;
        const p = new THREE.Vector3(Math.cos(a) * r * 0.5, y, Math.sin(a) * r * 0.5);
        cards.push(card(r * 1.25, r * 0.85, p, new THREE.Euler(0.55 + rng() * 0.2, -a + Math.PI / 2, 0, 'YXZ')));
      }
    }
    cards.push(card(1.2, 2.2, new THREE.Vector3(0, 18.8, 0), new THREE.Euler(0, 0, 0)), card(1.2, 2.2, new THREE.Vector3(0, 18.8, 0), new THREE.Euler(0, Math.PI / 2, 0)));
    trunk = new THREE.CylinderGeometry(0.18, 0.42, 18, 7).translate(0, 9, 0);
  } else if (kind === 'palm') {
    center = new THREE.Vector3(0, 10, 0); radii = new THREE.Vector3(4, 1.5, 4);
    for (let k = 0; k < 10; k++) {
      const leaf = new THREE.PlaneGeometry(4.6, 1.1, 8, 1).translate(2.3, 0, 0);
      const p = leaf.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setXYZ(i, x, -(x * x) * 0.1, p.getY(i) * (1 - x / 5.2)); }
      leaf.rotateY((k / 10) * Math.PI * 2 + rng() * 0.3); leaf.translate(0, 10.2, 0); cards.push(leaf);
    }
    trunk = new THREE.CylinderGeometry(0.2, 0.32, 10.4, 8).translate(0, 5.2, 0);
  } else {
    for (let k = 0; k < 34; k++) {
      const u = rng() * 2 - 1, a = rng() * Math.PI * 2, rr = 0.45 + rng() * 0.55, s2 = Math.sqrt(1 - u * u);
      const p = new THREE.Vector3(Math.cos(a) * s2 * radii.x * rr, center.y + u * radii.y * rr, Math.sin(a) * s2 * radii.z * rr);
      cards.push(card(3.2 + rng() * 1.2, 3.2 + rng() * 1.2, p, new THREE.Euler(rng() * 6.28, rng() * 6.28, rng() * 6.28)));
    }
    trunk = mergeGeos([new THREE.CylinderGeometry(0.22, 0.42, 6.5, 7).translate(0, 3.25, 0), new THREE.CylinderGeometry(0.06, 0.14, 3.2, 5).rotateZ(0.7).translate(0.9, 6.2, 0), new THREE.CylinderGeometry(0.06, 0.14, 3, 5).rotateZ(-0.8).rotateY(2).translate(-0.6, 6.4, 0.5)]);
  }
  const crown = mergeGeos(cards);
  const p = crown.attributes.position, nr = crown.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - center.x, (p.getY(i) - center.y) * (kind === 'pine' ? 0.25 : 1), p.getZ(i) - center.z).divide(radii);
    v.y += 0.35; v.normalize(); nr.setXYZ(i, v.x, v.y, v.z);
  }
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, envMapIntensity: 0.6 });
  windify(mat, kind === 'pine' ? 0.05 : 0.09, 3);
  GFX.trees = GFX.trees || {};
  return (GFX.trees[kind] = { crown, trunk, mat });
}
// gentle wind sway, stronger with height above the ground
function windify(mat, amp, y0) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GFX.wind;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.0);
      #endif
      float hgt = max(0.0, position.y - ${y0.toFixed(2)});
      float ph = uTime * 1.7 + ip.x * 0.045 + ip.z * 0.061;
      transformed.x += (sin(ph) + 0.4 * sin(ph * 2.7)) * ${amp.toFixed(3)} * hgt;
      transformed.z += cos(ph * 0.8) * ${(amp * 0.6).toFixed(3)} * hgt;`);
  };
}
function flagMaterial(team) {
  const tex = canvasTex(128, 80, (g, w, h) => { g.fillStyle = team.c1; g.fillRect(0, 0, w, h); g.fillStyle = team.c2; g.fillRect(0, h * 0.62, w, h * 0.2); g.fillStyle = '#fff'; g.font = '800 22px "Saira Condensed", Arial'; g.textAlign = 'center'; g.fillText(team.name.split(' ')[0].toUpperCase(), w / 2, h * 0.45); });
  const m = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GFX.wind;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float fx = position.x + 0.9;
      transformed.z += sin(fx * 3.2 - uTime * 6.0) * 0.12 * fx;
      transformed.y -= fx * fx * 0.04;`);
  };
  return m;
}

// ---- sky ----------------------------------------------------------------------
function buildSky(themeKey, sunDir) {
  const th = THEMES[themeKey], night = th.time === 'night', group = new THREE.Group();
  if (!night) {
    const sky = new Sky(); sky.scale.setScalar(20000);
    const u = sky.material.uniforms;
    u.turbidity.value = th.time === 'overcast' ? 9 : 3.5; u.rayleigh.value = th.time === 'overcast' ? 1.0 : 1.5; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(sunDir);
    group.add(sky);
  } else {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#03060f') }, hor: { value: new THREE.Color('#2a2238') } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec3 vD; uniform vec3 top, hor; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){ vec3 d = normalize(vD); vec3 c = mix(hor, top, pow(clamp(d.y,0.,1.), 0.4));
          vec2 g = floor(d.xz/(d.y+0.35)*320.); c += vec3(step(0.9975, h(g)) * clamp(d.y*4.,0.,1.))*0.9;
          gl_FragColor = vec4(c, 1.); }`,
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(18000, 32, 16), mat));
  }
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide,
    uniforms: { sunDir: { value: sunDir.clone() }, cover: { value: th.time === 'overcast' ? 0.5 : night ? 0.62 : 0.5 }, bright: { value: night ? 0.06 : 1.6 }, t: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vD; uniform vec3 sunDir; uniform float cover, bright, t;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=0., m=0.5; for(int i=0;i<6;i++){ a+=m*noise(p); p*=2.03; m*=0.5; } return a; }
      void main(){ vec3 d = normalize(vD); if (d.y < 0.005) discard;
        vec2 uv = d.xz / (d.y + 0.1) * 1.3 + vec2(t*0.003, 0.);
        float n = fbm(uv); float c = smoothstep(cover, cover + 0.25, n);
        float sh2 = fbm(uv + normalize(sunDir.xz + 1e-4)*0.08);
        float lit = clamp((n - sh2) * 4. + 0.55, 0.25, 1.0);
        float sunGlow = pow(max(dot(d, normalize(sunDir)), 0.), 6.);
        vec3 col = mix(vec3(0.55,0.58,0.64), vec3(1.0,0.98,0.95), lit) * (bright + sunGlow * bright);
        gl_FragColor = vec4(col, c * smoothstep(0.005, 0.18, d.y) * 0.95); }`,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(15000, 48, 24), cloudMat); clouds.renderOrder = -1;
  group.add(clouds); group.userData.clouds = cloudMat;
  return group;
}

// decode a bundled EXR; the sun direction is taken from its brightest texel
function loadHDRI(name) {
  const bin = atob(HDRI[name]), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const loader = new EXRLoader(); loader.setDataType(THREE.FloatType);
  const d = loader.parse(buf.buffer);
  const tex = new THREE.DataTexture(d.data, d.width, d.height, d.format, d.type);
  tex.colorSpace = THREE.LinearSRGBColorSpace; tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.flipY = false; tex.needsUpdate = true;
  const ch = d.format === THREE.RGBAFormat ? 4 : 3;
  let best = -1, bi = 0;
  for (let i = 0; i < d.width * d.height; i++) { const L = d.data[i * ch] + d.data[i * ch + 1] + d.data[i * ch + 2]; if (L > best) { best = L; bi = i; } }
  // the directional light supplies the sun, so cap the HDRI's sun hotspot to avoid blown highlights
  for (let i = 0; i < d.data.length; i++) if (d.data[i] > 6) d.data[i] = 6;
  tex.needsUpdate = true;
  const u = ((bi % d.width) + 0.5) / d.width, v = (Math.floor(bi / d.width) + 0.5) / d.height;
  // three's equirect lookup: u = atan(z, x)/2pi + 0.5, v = asin(y)/pi + 0.5
  const phi = (u - 0.5) * Math.PI * 2; let lat = (v - 0.5) * Math.PI;
  if (lat < 0) lat = -lat; // row order differs between EXR writers; the sun is always above the horizon
  const sunDir = new THREE.Vector3(Math.cos(lat) * Math.cos(phi), Math.sin(lat), Math.cos(lat) * Math.sin(phi)).normalize();
  return { tex, sunDir, peak: best };
}

// ---- car model ------------------------------------------------------------------
// smooth loft: key sections interpolated with Catmull-Rom; cross-sections are
// superellipses with separate top/bottom exponents. Key: [x, zc, w, yTop, yBot, eTop, eBot]
function loft(keys, rings = 48, segs = 28) {
  const K = keys.length, X0 = keys[0][0], X1 = keys[K - 1][0];
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const g2 = (j) => keys[clamp(j, 0, K - 1)];
  const sample = (u) => { const f = u * (K - 1), i = Math.min(K - 2, Math.floor(f)), t = f - i; const out = []; for (let c = 0; c < 7; c++) out.push(cr(g2(i - 1)[c], g2(i)[c], g2(i + 1)[c], g2(i + 2)[c], t)); return out; };
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const [x, zc, w, yT, yB, eT, eB] = sample(r / rings), yc = (yT + yB) / 2, hh = Math.max(0.001, (yT - yB) / 2);
    for (let j = 0; j <= segs; j++) {
      const t = (j / segs) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), e = s >= 0 ? eT : eB;
      pos.push(x, yc + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / e), zc + Math.max(0.001, w) * Math.sign(c) * Math.pow(Math.abs(c), 2 / e));
      uv.push((X0 - x) / (X0 - X1), j / segs);
    }
  }
  const R = segs + 1;
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * R + j, bb = a + R; idx.push(a, bb, a + 1, a + 1, bb, bb + 1); }
  for (const [ri, flip] of [[0, true], [rings, false]]) {
    const [x, zc, , yT, yB] = sample(ri / rings), c = pos.length / 3; pos.push(x, (yT + yB) / 2, zc); uv.push(ri ? 1 : 0, 0.5);
    for (let j = 0; j < segs; j++) { const a = ri * R + j; flip ? idx.push(c, a + 1, a) : idx.push(c, a, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function mergeGeos(list) {
  let total = 0;
  const parts = list.map((g) => { const ng = g.index ? g.toNonIndexed() : g; if (!ng.attributes.normal) ng.computeVertexNormals(); total += ng.attributes.position.count; return ng; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  parts.forEach((g) => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
const box = (sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.BoxGeometry(sx, sy, sz).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));
const strut = (a, b, r = 0.022, flat = 0.4) => {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, 10); g.scale(1, 1, flat);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
  const m = va.clone().add(vb).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); return g;
};
// inverted airfoil (NACA-style) extruded across the span; chord runs back from the leading edge.
// opts.tipRise lifts the element toward the tips (front wings sweep up to the endplates),
// opts.tipAoA adds twist at the tips.
function wingElement(chord, thick, span, x, y, aoaDeg, opts = {}) {
  const { camber = -0.05, tipRise = 0, tipAoA = 0, steps = 1 } = opts;
  const sh = new THREE.Shape(), N = 16, up = [], lo = [];
  for (let i = 0; i <= N; i++) {
    const t = (1 - Math.cos((i / N) * Math.PI)) / 2;
    const yt = 5 * thick * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4), yc = camber * 4 * t * (1 - t);
    up.push([-t * chord, (yc + yt) * chord]); lo.push([-t * chord, (yc - yt) * chord]);
  }
  sh.moveTo(up[0][0], up[0][1]); up.slice(1).forEach((p) => sh.lineTo(p[0], p[1])); lo.reverse().slice(1, -1).forEach((p) => sh.lineTo(p[0], p[1]));
  const g = new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, curveSegments: 4, steps: tipRise || tipAoA ? Math.max(steps, 24) : 1 });
  g.translate(0, 0, -span / 2);
  if (tipRise || tipAoA) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const zn = Math.abs(p.getZ(i)) / (span / 2), px = p.getX(i);
      p.setY(i, p.getY(i) + tipRise * zn ** 3 + -px * Math.tan((tipAoA * Math.PI / 180) * zn * zn));
    }
    g.computeVertexNormals();
  }
  g.rotateZ((-aoaDeg * Math.PI) / 180); g.translate(x, y, 0);
  return g;
}
const plate = (pts, thick, z) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((p) => s.lineTo(p[0], p[1])); const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false }); g.translate(0, 0, z - thick / 2); return g; };
// smooth plate outline from a few control points
const smoothPlate = (pts, thick, z, n = 40) => {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], 0)), true, 'centripetal');
  return plate(c.getPoints(n).map((v) => [v.x, v.y]), thick, z);
};
const rotY = (g, a, cx, cz) => g.translate(-cx, 0, -cz).rotateY(a).translate(cx, 0, cz);
// sweep an elliptical section (half-width a across, half-height b up) along a curve
function sweep(curve, n, a, b, segs = 14) {
  const pos = [], idx = [], UPV = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), T = curve.getTangentAt(t);
    let side = new THREE.Vector3().crossVectors(T, UPV); if (side.lengthSq() < 1e-4) side.set(0, 0, 1); side.normalize();
    const up = new THREE.Vector3().crossVectors(side, T).normalize();
    for (let j = 0; j <= segs; j++) { const th = (j / segs) * Math.PI * 2; pos.push(p.x + side.x * Math.cos(th) * a + up.x * Math.sin(th) * b, p.y + side.y * Math.cos(th) * a + up.y * Math.sin(th) * b, p.z + side.z * Math.cos(th) * a + up.z * Math.sin(th) * b); }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < segs; j++) { const q = i * (segs + 1) + j, r = q + segs + 1; idx.push(q, q + 1, r, q + 1, r + 1, r); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// wing uvs for printed logos: u runs across the span (left to right seen from behind), v from trailing to leading edge
function spanUV(g) {
  g.computeBoundingBox(); const b = g.boundingBox, p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getZ(i) - b.min.z) / (b.max.z - b.min.z); uv[i * 2 + 1] = (p.getX(i) - b.min.x) / (b.max.x - b.min.x); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}

// 2026-regulation car: 3.4 m wheelbase, 1.9 m wide, no wheel covers, narrower
// tyres on 18" rims, 3-element front wing on a low nose, no beam wing.
function makeCarGeometries() {
  const G2 = {};
  G2.body = loft([
    [2.7, 0, 0.045, 0.255, 0.19, 2.2, 2.2], [2.52, 0, 0.08, 0.31, 0.175, 2.4, 2.6], [2.2, 0, 0.125, 0.4, 0.155, 2.5, 3], [1.85, 0, 0.175, 0.5, 0.13, 2.6, 3.5],
    [1.45, 0, 0.24, 0.585, 0.1, 2.7, 4], [1.0, 0, 0.305, 0.65, 0.075, 2.8, 4.5], [0.6, 0, 0.355, 0.685, 0.065, 2.8, 5], [0.2, 0, 0.39, 0.695, 0.06, 2.8, 5],
    [-0.15, 0, 0.4, 0.73, 0.06, 2.6, 5], [-0.42, 0, 0.35, 0.98, 0.06, 1.9, 5], [-0.72, 0, 0.29, 0.94, 0.07, 1.9, 5], [-1.05, 0, 0.23, 0.84, 0.08, 1.9, 4.5],
    [-1.4, 0, 0.17, 0.7, 0.1, 2, 4], [-1.75, 0, 0.12, 0.56, 0.13, 2.2, 3.5], [-2.05, 0, 0.085, 0.48, 0.18, 2.4, 3], [-2.28, 0, 0.06, 0.44, 0.26, 2.4, 2.4],
  ], 72, 36);
  // downwash sidepods: high flat shoulder, deep undercut beneath the letterbox inlet, steep ramp to the floor
  const pod = (s) => loft([
    [0.97, 0.47 * s, 0.05, 0.6, 0.4, 2.4, 2.4], [0.88, 0.52 * s, 0.16, 0.63, 0.33, 3.2, 1.3], [0.55, 0.555 * s, 0.22, 0.625, 0.2, 3.4, 1.2], [0.1, 0.54 * s, 0.215, 0.575, 0.15, 3.2, 1.3],
    [-0.4, 0.48 * s, 0.18, 0.46, 0.12, 2.8, 1.6], [-0.85, 0.4 * s, 0.13, 0.34, 0.11, 2.4, 2], [-1.25, 0.32 * s, 0.075, 0.25, 0.12, 2.2, 2.2], [-1.55, 0.26 * s, 0.03, 0.2, 0.15, 2.2, 2.2],
  ], 56, 32);
  G2.pods = mergeGeos([pod(1), pod(-1)]);
  { const uv = G2.pods.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 0.06 + uv.getX(i) * 0.94); } // keep the nose-tip band off the sidepod inlets
  G2.fin = smoothPlate([[-0.6, 0.97], [-1.3, 0.93], [-1.95, 0.86], [-2.08, 0.6], [-1.6, 0.66], [-1.0, 0.82]], 0.008, 0, 50);
  const carbon = [];
  // floor: 150 mm narrower than before, with edge wings, forward fences, plank and a smaller diffuser
  const fs = new THREE.Shape(); [[1.3, 0.2], [1.05, 0.5], [0.72, 0.72], [-1.35, 0.72], [-1.62, 0.55], [-1.68, -0.55], [-1.35, -0.72], [0.72, -0.72], [1.05, -0.5], [1.3, -0.2]].forEach((p, i) => (i ? fs.lineTo(p[0], p[1]) : fs.moveTo(p[0], p[1])));
  const floor = new THREE.ExtrudeGeometry(fs, { depth: 0.022, bevelEnabled: false }); floor.rotateX(Math.PI / 2); floor.translate(0, 0.07, 0); carbon.push(floor);
  carbon.push(box(2.3, 0.012, 0.3, -0.25, 0.04, 0));
  for (const s of [1, -1]) {
    carbon.push(box(1.95, 0.05, 0.012, -0.32, 0.085, 0.72 * s));
    carbon.push(box(1.7, 0.01, 0.07, -0.35, 0.115, 0.69 * s, 0.25 * s));                     // floor edge wing
    for (let k = 0; k < 7; k++) carbon.push(box(0.012, 0.045, 0.06, 0.35 - k * 0.24, 0.1, 0.7 * s));  // edge-wing supports
    for (let k = 0; k < 4; k++) carbon.push(rotY(box(0.16, 0.035, 0.008, -0.55 - k * 0.2, 0.1, 0.62 * s), 0.35 * s, -0.55 - k * 0.2, 0.62 * s)); // floor-edge scroll vanes
    carbon.push(strut([0.15, 0.09, 0.71 * s], [0.25, 0.3, 0.55 * s], 0.006, 1));             // floor stay
    for (const z of [0.18, 0.3, 0.42]) carbon.push(rotY(box(0.45, 0.15, 0.01, 1.05, 0.13, z * s), 0.12 * s, 1.05, z * s)); // forward floor fences
    carbon.push(box(0.55, 0.012, 0.42, -1.92, 0.19, 0.24 * s, 0, 0, 0.42));                   // diffuser ramp
    for (const z of [0.05, 0.25, 0.45]) carbon.push(box(0.5, 0.17, 0.01, -1.9, 0.16, z * s, 0, 0, 0.42)); // strakes
    // in-washing wheel wake boards ahead of the sidepods
    carbon.push(rotY(smoothPlate([[1.32, 0.08], [1.34, 0.3], [1.22, 0.42], [1.02, 0.4], [0.98, 0.12]], 0.01, 0.63 * s, 24), -0.14 * s, 1.15, 0.63 * s));
  }
  // front wing: fixed mainplane, endplates, footplates, nose pylons
  G2.fwMain = spanUV(wingElement(0.42, 0.1, 1.76, 3.02, 0.085, 2, { tipRise: 0.05 }));
  G2.fwFlap3 = spanUV(wingElement(0.1, 0.09, 1.6, 2.4, 0.285, 36, { tipRise: 0.05, tipAoA: 8 }));
  for (const s of [1, -1]) {
    (G2.fwEnd = G2.fwEnd || {})[s] = plate([[3.03, 0.05], [3.03, 0.19], [2.98, 0.26], [2.88, 0.31], [2.62, 0.34], [2.44, 0.33], [2.36, 0.27], [2.35, 0.16], [2.4, 0.05]], 0.012, 0.89 * s);
    carbon.push(box(0.55, 0.01, 0.1, 2.72, 0.05, 0.85 * s));
    carbon.push(smoothPlate([[2.78, 0.1], [2.74, 0.24], [2.58, 0.27], [2.55, 0.12]], 0.01, 0.075 * s, 16));
  }
  // suspension: front push-rod, rear pull-rod, streamlined members
  for (const s of [1, -1]) {
    const zf = 0.72 * s, zr = 0.72 * s;
    carbon.push(strut([1.95, 0.42, 0.17 * s], [1.7, 0.43, zf]), strut([1.45, 0.45, 0.2 * s], [1.7, 0.43, zf]));
    carbon.push(strut([1.95, 0.2, 0.16 * s], [1.72, 0.24, zf]), strut([1.4, 0.2, 0.2 * s], [1.72, 0.24, zf]));
    carbon.push(strut([1.72, 0.25, 0.68 * s], [1.55, 0.55, 0.22 * s], 0.016, 0.8), strut([1.84, 0.33, 0.18 * s], [1.72, 0.32, zf], 0.014, 0.6));
    carbon.push(strut([-1.5, 0.43, 0.22 * s], [-1.7, 0.44, zr]), strut([-1.95, 0.43, 0.14 * s], [-1.7, 0.44, zr]));
    carbon.push(strut([-1.48, 0.2, 0.22 * s], [-1.7, 0.22, zr]), strut([-1.95, 0.22, 0.14 * s], [-1.7, 0.22, zr]));
    carbon.push(strut([-1.7, 0.42, 0.66 * s], [-1.75, 0.18, 0.2 * s], 0.016, 0.8));
    // brake ducts / drums (static, inside the rims)
    carbon.push(new THREE.CylinderGeometry(0.175, 0.175, 0.14, 24).rotateX(Math.PI / 2).translate(1.7, 0.3525, 0.6 * s));
    carbon.push(new THREE.CylinderGeometry(0.175, 0.175, 0.16, 24).rotateX(Math.PI / 2).translate(-1.7, 0.355, 0.58 * s));
    carbon.push(box(0.1, 0.07, 0.035, 1.86, 0.3, 0.6 * s, 0, 0.25 * s));   // front brake duct scoop
    // mirror stalks
    carbon.push(strut([0.78, 0.6, 0.4 * s], [0.84, 0.74, 0.55 * s], 0.01, 0.4), strut([0.68, 0.6, 0.42 * s], [0.8, 0.74, 0.55 * s], 0.008, 0.4));
    // rear wing endplates (simplified for 2026)
    (G2.rwEnd = G2.rwEnd || {})[s] = plate([[-1.98, 0.56], [-1.99, 0.98], [-2.03, 1.06], [-2.1, 1.1], [-2.46, 1.1], [-2.52, 1.06], [-2.55, 0.99], [-2.5, 0.68], [-2.42, 0.6], [-2.28, 0.55]], 0.016, 0.5 * s);
    // swan-neck pylons
    carbon.push(smoothPlate([[-2.16, 0.42], [-2.1, 0.86], [-2.24, 0.88], [-2.3, 0.44]], 0.012, 0.035 * s, 16));
  }
  // rear crash structure
  carbon.push(loft([[-2.2, 0, 0.07, 0.44, 0.26, 2.4, 2.4], [-2.4, 0, 0.055, 0.42, 0.3, 2.4, 2.4], [-2.52, 0, 0.04, 0.4, 0.32, 2.4, 2.4]], 6, 16));
  // halo with an aero fairing on the top hoop
  const halo = new THREE.CatmullRomCurve3([[-0.36, 0.72, 0.33], [-0.3, 0.93, 0.37], [0.12, 1.005, 0.33], [0.42, 1.0, 0.14], [0.48, 1.0, 0], [0.42, 1.0, -0.14], [0.12, 1.005, -0.33], [-0.3, 0.93, -0.37], [-0.36, 0.72, -0.33]].map((p) => new THREE.Vector3(...p)));
  carbon.push(sweep(halo, 72, 0.034, 0.022), sweep(new THREE.CatmullRomCurve3([[0.47, 1.0, 0], [0.62, 0.86, 0], [0.77, 0.7, 0]].map((p) => new THREE.Vector3(...p))), 20, 0.02, 0.04));
  // cockpit rim and headrest
  const rimC = new THREE.CatmullRomCurve3([...Array(24)].map((_, k) => { const a = (k / 24) * Math.PI * 2; return new THREE.Vector3(0.1 + Math.cos(a) * 0.42, 0.705, Math.sin(a) * 0.27); }), true);
  carbon.push(new THREE.TubeGeometry(rimC, 48, 0.03, 8, true));
  // nose pitot tube and antennae
  carbon.push(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 8).rotateZ(Math.PI / 2).translate(2.8, 0.225, 0), new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6).translate(1.4, 0.64, 0), new THREE.CylinderGeometry(0.004, 0.004, 0.1, 6).translate(-0.8, 0.98, 0.1));
  G2.carbon = mergeGeos(carbon);
  // dark details: cockpit opening, headrest, airbox and sidepod inlets, louvres, rear cooling outlet
  const dark = [];
  dark.push(new THREE.CircleGeometry(1, 32).scale(0.42, 0.27, 1).rotateX(-Math.PI / 2).translate(0.1, 0.708, 0));
  dark.push(new THREE.TorusGeometry(0.17, 0.05, 8, 20, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(-0.22, 0.72, 0));
  dark.push(new THREE.SphereGeometry(0.1, 16, 10).scale(0.3, 1, 1.2).translate(-0.36, 0.9, 0));
  for (const s of [1, -1]) {
    // sidepod inlet: a flat, rounded opening rather than a bulge
    dark.push(new THREE.CircleGeometry(1, 28).scale(0.15, 0.085, 1).rotateY(Math.PI / 2).translate(0.975, 0.5, 0.47 * s));
    for (let k = 0; k < 5; k++) { const x = -0.35 - k * 0.11, top = 0.47 - k * 0.022; dark.push(box(0.07, 0.006, 0.12, x, top + 0.005, 0.44 * s, 0.25 * s, 0, 0.12)); }
  }
  dark.push(new THREE.SphereGeometry(1, 12, 8).scale(0.02, 0.06, 0.07).translate(-2.06, 0.49, 0));
  G2.dark = mergeGeos(dark);
  // active aero: front flaps 1 and 2, rear flaps (both upper elements)
  G2.fwFlap1 = spanUV(wingElement(0.21, 0.09, 1.72, 0, 0, 16, { tipRise: 0.08, tipAoA: 8 }));
  G2.fwFlap2 = spanUV(wingElement(0.15, 0.09, 1.66, 0, 0, 28, { tipRise: 0.09, tipAoA: 10 }));
  G2.rwMain = spanUV(wingElement(0.3, 0.11, 0.98, -2.03, 0.87, 6));
  G2.rwFlap = spanUV(mergeGeos([wingElement(0.19, 0.1, 0.98, 0, 0, 0), wingElement(0.12, 0.1, 0.98, -0.16, 0.07, 14)]));
  // mirror housings (wing-shaped) and t-cam
  // rear-view mirrors: rounded aero housing with the glass on its rear face
  const mshape = new THREE.Shape(), mw = 0.085, mh = 0.032, mr = 0.018;
  mshape.moveTo(-mw + mr, -mh); mshape.lineTo(mw - mr, -mh); mshape.quadraticCurveTo(mw, -mh, mw, -mh + mr); mshape.lineTo(mw, mh - mr); mshape.quadraticCurveTo(mw, mh, mw - mr, mh);
  mshape.lineTo(-mw + mr, mh); mshape.quadraticCurveTo(-mw, mh, -mw, mh - mr); mshape.lineTo(-mw, -mh + mr); mshape.quadraticCurveTo(-mw, -mh, -mw + mr, -mh);
  G2.accent = mergeGeos([1, -1].map((s) => new THREE.ExtrudeGeometry(mshape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.006, bevelSegments: 3, curveSegments: 8 }).rotateY(Math.PI / 2).translate(0.832, 0.765, 0.56 * s)));
  G2.mirrorGlass = new THREE.PlaneGeometry(0.152, 0.05).rotateY(-Math.PI / 2);
  G2.tcam = box(0.16, 0.05, 0.08, -0.36, 1.02, 0);
  G2.exhaust = new THREE.CylinderGeometry(0.042, 0.048, 0.3, 18, 1, true).rotateZ(Math.PI / 2 - 0.12).translate(-2.15, 0.53, 0);
  // driver: helmet shell (longer than wide), chin guard, visor, rear spoiler, HANS collar, shoulders
  G2.helmet = loft([
    [0.158, 0, 0.03, -0.01, -0.1, 2.2, 2.6], [0.142, 0, 0.088, 0.06, -0.118, 2.3, 2.6], [0.1, 0, 0.112, 0.118, -0.122, 2.2, 2.7], [0.04, 0, 0.12, 0.148, -0.118, 2.15, 2.8],
    [-0.03, 0, 0.12, 0.15, -0.108, 2.15, 2.8], [-0.09, 0, 0.112, 0.135, -0.09, 2.2, 2.6], [-0.135, 0, 0.088, 0.1, -0.06, 2.3, 2.4], [-0.162, 0, 0.035, 0.05, -0.02, 2.4, 2.4],
  ], 40, 40);
  { // spherical uvs (front of the helmet at u = 0.5, top at v = 1) so the helmet livery wraps like a real paint scheme
    const p = G2.helmet.attributes.position, uv = G2.helmet.attributes.uv;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i) - 0.01, z = p.getZ(i), r = Math.hypot(x, y, z) || 1, ph = Math.atan2(z, -x); uv.setXY(i, (ph < 0 ? ph + Math.PI * 2 : ph) / (Math.PI * 2), 1 - Math.acos(clamp(y / r, -1, 1)) / Math.PI); }
  }
  // visor: a curved band across the eye port, standing just proud of the shell
  G2.visor = new THREE.CylinderGeometry(0.123, 0.12, 0.058, 40, 1, true, Math.PI / 2 - 1.15, 2.3).scale(1.04, 1, 1).translate(0.018, 0.04, 0);
  G2.chin = new THREE.BufferGeometry();
  G2.spoiler = mergeGeos([box(0.06, 0.008, 0.11, -0.15, 0.07, 0, 0, 0, -0.3), box(0.04, 0.018, 0.006, -0.145, 0.062, 0.05), box(0.04, 0.018, 0.006, -0.145, 0.062, -0.05)]);
  G2.hans = mergeGeos([new THREE.TorusGeometry(0.12, 0.028, 8, 18, Math.PI * 1.15).rotateX(Math.PI / 2).rotateY(Math.PI * 0.42).translate(-0.02, -0.15, 0), box(0.18, 0.02, 0.24, -0.1, -0.16, 0)]);
  G2.shoulders = new THREE.CapsuleGeometry(0.07, 0.26, 8, 16).rotateX(Math.PI / 2).translate(-0.12, -0.26, 0); // kept below the cockpit rim
  // tyres (705 mm front / 710 mm rear on 18" rims); v maps outer wall 0..0.35, tread 0.36..0.64, inner wall 0.65..1
  const r0 = 0.229;
  const tyre = (R, w) => {
    const prof = [[r0, -w / 2 + 0.012], [r0 + 0.02, -w / 2], [R - 0.05, -w / 2 - 0.01], [R - 0.02, -w / 2 + 0.006], [R, -w / 2 + 0.03], [R, w / 2 - 0.03], [R - 0.02, w / 2 - 0.006], [R - 0.05, w / 2 + 0.01], [r0 + 0.02, w / 2], [r0, w / 2 - 0.012]];
    const g = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 72); g.rotateX(Math.PI / 2);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i)), z = p.getZ(i), onTread = r > R - 0.018;
      uv.setY(i, onTread ? 0.36 + ((z + w / 2) / w) * 0.28 : z > 0 ? 0.35 * (1 - (r - r0) / (R - r0)) : 0.65 + 0.35 * ((r - r0) / (R - r0)));
    }
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); // sidewall print reads correctly from outside
    return g;
  };
  G2.tyreF = tyre(0.3525, 0.28); G2.tyreR = tyre(0.355, 0.375);
  // exposed 2026 rims: barrel, lip, ten spokes, hub; centre-lock nut is separate (coloured)
  const rimG = (w) => {
    const zf = w / 2 - 0.045, parts = [new THREE.CylinderGeometry(r0, r0, w - 0.03, 40, 1, true).rotateX(Math.PI / 2)];
    for (let k = 0; k < 10; k++) {
      // flat, tapered spokes dished slightly inward toward the hub
      const sh = new THREE.Shape(); sh.moveTo(0.06, -0.013); sh.lineTo(r0 - 0.012, -0.021); sh.lineTo(r0 - 0.012, 0.021); sh.lineTo(0.06, 0.013); sh.closePath();
      const sp = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1 });
      sp.rotateY(-0.12).translate(0, 0, zf - 0.012).rotateZ((k / 10) * Math.PI * 2 + 0.08); parts.push(sp);
    }
    parts.push(new THREE.CylinderGeometry(0.06, 0.068, 0.07, 24).rotateX(Math.PI / 2).translate(0, 0, zf - 0.01));
    parts.push(new THREE.RingGeometry(0.06, r0, 40).translate(0, 0, zf - 0.06));
    return mergeGeos(parts);
  };
  G2.rimLip = new THREE.TorusGeometry(r0 - 0.003, 0.009, 8, 48);
  G2.rimF = rimG(0.28); G2.rimR = rimG(0.375);
  G2.nut = new THREE.CylinderGeometry(0.034, 0.034, 0.03, 6).rotateX(Math.PI / 2);
  G2.blurDisc = new THREE.CircleGeometry(r0 - 0.006, 40);
  G2.swSimple = mergeGeos([box(0.035, 0.13, 0.27, 0.01, 0, 0), new THREE.CapsuleGeometry(0.022, 0.1, 4, 8).rotateX(0.22).translate(0.005, -0.005, 0.15), new THREE.CapsuleGeometry(0.022, 0.1, 4, 8).rotateX(-0.22).translate(0.005, -0.005, -0.15)]);
  G2.glove = new THREE.CapsuleGeometry(0.03, 0.05, 4, 10);
  // gloved fist closed around a wheel grip (grip runs along y): back of hand, wrapped fingers, thumb over the top; cuff separate
  G2.fist = {}; G2.cuff = {};
  for (const sd of [1, -1]) {
    G2.fist[sd] = mergeGeos([
      new THREE.SphereGeometry(1, 16, 12).scale(0.026, 0.045, 0.03).translate(-0.022, 0, 0.012 * sd),
      new THREE.TorusGeometry(0.026, 0.0125, 8, 18, Math.PI * 1.45).rotateX(Math.PI / 2).rotateY(sd > 0 ? 0.35 : Math.PI - 0.35 + Math.PI * 0.55).translate(0, 0.012, 0),
      new THREE.TorusGeometry(0.026, 0.012, 8, 18, Math.PI * 1.45).rotateX(Math.PI / 2).rotateY(sd > 0 ? 0.35 : Math.PI - 0.35 + Math.PI * 0.55).translate(0, -0.014, 0),
      new THREE.CapsuleGeometry(0.011, 0.032, 4, 10).rotateZ(Math.PI / 2).translate(0.012, 0.04, 0.004 * sd),
    ]);
    G2.cuff[sd] = new THREE.CylinderGeometry(0.034, 0.037, 0.05, 16).rotateZ(Math.PI / 2 - 0.5).translate(-0.05, -0.03, 0.02 * sd);
  }
  G2.limb = new THREE.LatheGeometry([[0.001, 0], [0.034, 0.025], [0.043, 0.22], [0.04, 0.55], [0.032, 0.9], [0.028, 0.975], [0.001, 1]].map(([r, y]) => new THREE.Vector2(r, y)), 20); // forearm: muscle near the elbow, narrow wrist
  G2.upperArm = new THREE.LatheGeometry([[0.001, 0], [0.046, 0.04], [0.053, 0.2], [0.05, 0.5], [0.043, 0.85], [0.038, 0.96], [0.001, 1]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  G2.elbow = new THREE.SphereGeometry(0.04, 16, 12);
  G2.disc = new THREE.CylinderGeometry(0.15, 0.15, 0.032, 28).rotateX(Math.PI / 2);
  G2.blob = new THREE.PlaneGeometry(6.4, 2.8).rotateX(-Math.PI / 2);
  return G2;
}

// relative luminance (0..1) of a #rrggbb colour
const lum = (c) => { const n = parseInt(c.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
// ---- imported driver and helmet (Sketchfab, CC BY 4.0) --------------------------------
function loadModels() {
  if (typeof MODEL_DATA === 'undefined') return Promise.resolve();
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  const get = (k) => fetch(MODEL_DATA[k]).then((r) => r.arrayBuffer()).then((b) => new Promise((ok, no) => L.parse(b, '', ok, no)));
  return Promise.all([get('helmet'), get('driver'), MODEL_DATA.car ? get('car') : null, MODEL_DATA.carhq ? get('carhq') : null, MODEL_DATA.crew ? get('crew') : null]).then(([h, d, c, hq, cr]) => { GFX.models = { helmet: prepHelmet(h.scene), driver: prepDriver(d.scene), car: c ? prepCar(c.scene) : null, carhq: hq ? prepCar(hq.scene) : null, crew: cr ? prepDriver(cr.scene) : null }; })
    .catch((e) => console.warn('driver models unavailable', e));
}
// helmet parts baked into car space: front faces +x, about 0.31 m long, centred on the head pivot
function prepHelmet(root) {
  root.updateMatrixWorld(true);
  const parts = { shell: [], visor: [], metal: [], dark: [], inner: [] };
  const kind = { Material: 'shell', 'Material.003': 'visor', metalser: 'metal', dershat: 'dark', 'Material.004': 'inner' };
  root.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone().applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); (parts[kind[o.material.name]] || parts.dark).push(g); } });
  const out = {};
  for (const [k, list] of Object.entries(parts)) if (list.length) out[k] = mergeGeometries(list.map((g) => (g.index ? g : g)), false);
  const box = new THREE.Box3(); out.shell.computeBoundingBox(); box.copy(out.shell.boundingBox);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), k = 0.31 / Math.max(size.x, size.z);
  const front = size.x >= size.z ? 'x' : 'z';
  for (const g of Object.values(out)) {
    g.translate(-c.x, -c.y, -c.z).scale(k, k, k);
    if (front === 'z') g.rotateY(-Math.PI / 2);
    g.rotateY(Math.PI); // the visor faces -x in the source
    g.computeVertexNormals(); g.computeBoundingSphere();
  }
  { // wrap-around uvs for the paint scheme: front at u = 0.5, crown at the top of the texture
    const p = out.shell.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, y, z) || 1, ph = Math.atan2(z, -x); uv[i * 2] = (ph < 0 ? ph + Math.PI * 2 : ph) / (Math.PI * 2); uv[i * 2 + 1] = 1 - Math.acos(clamp(y / r, -1, 1)) / Math.PI; }
    out.shell.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return out;
}
// each driver's own helmet design: team colours plus a personal colour and one of several classic patterns
function driverHelmetTexture(team, dr) {
  const hsh = hashStr(dr.code), pat = hsh % 5, hue = (hsh >> 3) % 360;
  const personal = `hsl(${hue}, 85%, ${45 + ((hsh >> 9) % 15)}%)`, base = lum(team.c2) > 0.18 && lum(team.c2) < 0.92 ? team.c2 : team.c1, alt = base === team.c1 ? team.c2 : team.c1;
  return canvasTex(1024, 512, (g, w, h) => {
    // u: 0..1 around the head (front/visor at 0.5), v: crown at the top
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = alt;
    if (pat === 0) { for (const dx of [-0.07, 0, 0.07]) g.fillRect(w * (0.5 + dx) - w * 0.02, 0, w * 0.04, h * 0.5); g.fillRect(0, 0, w * 0.03, h * 0.5); } // racing stripes over the crown
    if (pat === 1) { g.beginPath(); g.moveTo(0, h * 0.55); for (let k = 0; k <= 8; k++) g.lineTo(w * k / 8, h * (k % 2 ? 0.3 : 0.5)); g.lineTo(w, h); g.lineTo(0, h); g.fill(); } // zig-zag lower half
    if (pat === 2) { g.fillRect(0, h * 0.33, w, h * 0.12); g.fillStyle = personal; g.fillRect(0, h * 0.45, w, h * 0.05); } // band round the head
    if (pat === 3) { g.beginPath(); g.moveTo(w * 0.5, h * 0.05); g.lineTo(w * 0.15, h * 0.62); g.lineTo(w * 0.3, h * 0.62); g.lineTo(w * 0.5, h * 0.25); g.lineTo(w * 0.7, h * 0.62); g.lineTo(w * 0.85, h * 0.62); g.closePath(); g.fill(); } // chevron from the brow
    if (pat === 4) { g.fillRect(0, 0, w * 0.5, h); } // split left/right
    // personal colour accents: stars on the crown
    g.fillStyle = personal;
    const star = (cx, cy, r) => { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
    if (pat !== 2) for (let k = 0; k < 4; k++) star(w * (0.1 + k * 0.27), h * 0.12, h * 0.05);
    // brow strip above the visor carries the team name, numbers on both sides, dark chin
    g.fillStyle = '#121417'; g.fillRect(w * 0.38, h * 0.36, w * 0.24, h * 0.06);
    g.fillStyle = '#fff'; g.font = `700 ${h * 0.045}px "Saira Condensed", Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(team.name.toUpperCase().slice(0, 18), w * 0.5, h * 0.39);
    g.font = `800 ${h * 0.12}px "Saira Condensed", Arial`; g.lineWidth = h * 0.012; g.strokeStyle = '#121417';
    for (const u of [0.25, 0.75]) { g.strokeText(String(dr.num), w * u, h * 0.5); g.fillText(String(dr.num), w * u, h * 0.5); }
    g.fillStyle = '#16181b'; g.fillRect(0, h * 0.8, w, h * 0.2);
  });
}
// 2026-regulations car body (wheels removed in tools/prep_car.mjs): baked into car space, scaled so its axles
// sit on the game's wheel centres (wheelbase 3.4 m), split into livery and rear-light parts
function prepCar(root) {
  root.updateMatrixWorld(true);
  const S = 0.47, M = new THREE.Matrix4().makeTranslation(0.051, 0, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(S, S, S));
  const livery = [], light = []; let tex = null;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'uv', 'normal'].includes(k)) g.deleteAttribute(k);
    // dequantize (positions, normals and uvs are stored as normalized integers) before transforming and merging
    const get = ['getX', 'getY', 'getZ'];
    for (const k of ['position', 'uv', 'normal']) { const a = g.attributes[k]; if (a && !(a.array instanceof Float32Array)) { const f = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a[get[c]](i); g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize)); } }
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(M, o.matrixWorld));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (/light/i.test(o.material.name)) light.push(g); else { livery.push(g); tex = tex || o.material.map; }
  });
  const hasN = livery.every((g) => g.attributes.normal);
  if (!hasN) for (const g of livery.concat(light)) g.deleteAttribute('normal');
  const out = { livery: mergeGeometries(livery, false), light: light.length ? mergeGeometries(light, false) : null, tex };
  for (const g of [out.livery, out.light]) if (g) { if (!g.attributes.normal) g.computeVertexNormals(); else g.normalizeNormals(); g.computeBoundingSphere(); } // keep the model's own normals when it has them
  return out;
}
// team livery painted onto the model's own texture layout: base -> team colour, stripes and panels -> accents,
// carbon stays carbon, the original logos are painted out and our own sponsor names / race number added
function liveryFromModel(team, num) {
  GFX.carLivery = GFX.carLivery || {};
  const key = team.id + num; if (GFX.carLivery[key]) return GFX.carLivery[key];
  const img = GFX.models.car.tex.image, w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, w, h), p = d.data;
  const rgb = (hx) => [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16));
  const A = rgb(team.c1), B = rgb(lum(team.c2) > 0.15 ? team.c2 : team.c3), C = rgb(team.c3), K = [20, 22, 25];
  const pal = [[[0, 53, 114], A], [[0, 0, 0], K], [[255, 219, 150], B], [[255, 255, 255], A], [[220, 20, 20], B], [[255, 120, 0], C], [[255, 230, 0], lum(team.c1) > 0.6 ? K : [255, 255, 255]], [[255, 255, 146], B]];
  for (let i = 0; i < p.length; i += 4) {
    let best = 0, bd = 1e9;
    for (let k = 0; k < pal.length; k++) { const q = pal[k][0], dd = (p[i] - q[0]) ** 2 + (p[i + 1] - q[1]) ** 2 + (p[i + 2] - q[2]) ** 2; if (dd < bd) { bd = dd; best = k; } }
    const o = pal[best][1]; p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2];
  }
  g.putImageData(d, 0, 0);
  // our branding where the original logos were (several islands are mirrored in the texture layout)
  const sp = GFX.tex.sponsors, pick = hashStr(team.id), ink = lum(team.c1) > 0.55 ? '#121417' : '#ffffff';
  const text = (t, x, y, size, mirror, col = ink) => { g.save(); g.translate(x * w / 1024, y * h / 1024); if (mirror === 'v') g.scale(1, -1); else if (mirror === 'r') g.scale(-1, -1); else if (mirror) g.scale(-1, 1); g.fillStyle = col; g.font = `800 ${size * w / 1024}px "Saira Condensed", Arial Narrow, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 0, 0); g.restore(); };
  // paint out every original logo area with the base colour first (atlas pixel boxes)
  g.fillStyle = team.c1;
  for (const [x0, y0, x1, y1] of [[325, 45, 392, 92], [325, 195, 392, 238], [455, 80, 545, 135], [455, 230, 545, 285], [440, 118, 466, 142], [440, 268, 466, 292], [685, 310, 750, 352], [785, 310, 850, 352],
    [690, 195, 985, 240], [140, 378, 320, 402], [55, 588, 85, 609], [105, 613, 133, 634], [440, 140, 470, 160], [440, 290, 470, 305]]) g.fillRect(x0 * w / 1024, y0 * h / 1024, (x1 - x0) * w / 1024, (y1 - y0) * h / 1024);
  text(sp[pick % sp.length][0], 488, 106, 21, 'v'); text(sp[pick % sp.length][0], 488, 258, 21, 'r');
  text(String(num), 358, 70, 34, 'v'); text(String(num), 358, 216, 34, 'r');
  text(team.name.toUpperCase(), 835, 217, 26, true); text(sp[(pick + 2) % sp.length][0], 722, 331, 14, 'v'); text(sp[(pick + 2) % sp.length][0], 822, 331, 14, 'v');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = GFX.maxAniso; t.userData.keep = true;
  return (GFX.carLivery[key] = t);
}
function prepDriver(root) {
  root.traverse((o) => { if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; } });
  return root;
}
// team race suit: the source suit's shading and seams, recoloured to the team (cached per team)
function suitFromModel(img, team, part = '') {
  GFX.suitCache = GFX.suitCache || {};
  if (GFX.suitCache[team.id + part]) return GFX.suitCache[team.id + part];
  const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, w, h), p = d.data;
  const rgb = (hx) => [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16));
  const A = rgb(team.c1), B = rgb(lum(team.c2) > 0.18 ? team.c2 : team.c3);
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], gg = p[i + 1], b = p[i + 2], L = (0.3 * r + 0.59 * gg + 0.11 * b) / 255, sat = (Math.max(r, gg, b) - Math.min(r, gg, b)) / 255;
    const t = sat < 0.12 && L > 0.86 ? 1 : 0, shade = 0.84 + 0.2 * Math.min(1, L * 1.2);   // only the brightest trim takes the second colour; the rest is the team colour with soft shading
    for (let k = 0; k < 3; k++) p[i + k] = Math.min(255, (t ? B[k] : A[k]) * shade);
  }
  g.putImageData(d, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.userData.keep = true;
  return (GFX.suitCache[team.id + part] = tex);
}
// seated driver from the rigged model: reclined in the tub, hands reaching for the wheel (see updateArms)
function makeAvatar(team, body) {
  const av = SkeletonUtils.clone(GFX.models.driver), pivot = new THREE.Group(), seat = new THREE.Group();
  seat.add(av); pivot.add(seat); body.add(pivot);
  av.rotation.y = Math.PI / 2;            // the model faces +z; the car faces +x
  seat.rotation.z = 0.95;                 // reclined F1 seating position (lying well back, shoulders below the rim)
  const bones = {}; av.traverse((o) => { if (o.isBone) bones[o.name.replace(/_\d+$/, '')] = o; });
  let hands = null;
  av.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (o.material.name === 'Wolf3D_Outfit_Top') o.material = new THREE.MeshStandardMaterial({ map: suitFromModel(o.material.map.image, team), roughness: 0.85 });
    else { o.material = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.75 }); hands = o; } // bare hands become race gloves
  });
  // put the neck just under the helmet pivot
  pivot.updateMatrixWorld(true);
  const neck = (bones.Neck || bones.Head).getWorldPosition(new THREE.Vector3()); body.worldToLocal(neck);
  pivot.position.set(-0.13 - neck.x, 0.7 - neck.y, -neck.z);
  // fingers closed around the grips
  for (const sd of ['Left', 'Right']) for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const j of [1, 2, 3]) {
    const b = bones[sd + 'Hand' + f + j]; if (b) b.rotateZ((sd === 'Left' ? 1 : -1) * (j === 1 ? 0.9 : 1.1));
  }
  const ik = ['Left', 'Right'].map((sd) => ({ up: bones[sd + 'Arm'], fore: bones[sd + 'ForeArm'], hand: bones[sd + 'Hand'] }));
  ik.forEach((a) => { a.rest = [a.up.quaternion.clone(), a.fore.quaternion.clone()]; });
  return { root: pivot, ik, hands, bones };
}
function liveryTexture(team, num, hi) {
  return canvasTex(hi ? 2048 : 1024, hi ? 1024 : 512, (g, w, h) => {
    if (hi) g.scale(2, 2), (w /= 2), (h /= 2);
    // u: nose (0) -> tail (1); v around the section, 0.25 = top centre, 0.75 = underside
    g.fillStyle = team.c1; g.fillRect(0, 0, w, h);
    if (team.split) { g.fillStyle = team.c2; g.fillRect(0, h * 0.25, w, h * 0.27); }
    const grad = g.createLinearGradient(0, 0, w, 0); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.16)'); g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // exposed carbon on the lower bodywork (a 2026 weight-saving look)
    const cy0 = h * 0.6, cy1 = h * 0.9;
    g.fillStyle = '#17191c'; g.fillRect(0, cy0, w, cy1 - cy0);
    for (let y = cy0; y < cy1; y += 4) for (let x = 0; x < w; x += 4) { g.fillStyle = ((x + y) / 4) % 2 ? '#202327' : '#141619'; g.fillRect(x, y, 4, 4); }
    g.fillStyle = team.c2; g.fillRect(0, cy0 - 3, w, 3); g.fillRect(0, cy1, w, 3);
    if (team.tip) { g.fillStyle = team.tip; g.fillRect(0, 0, w * 0.045, h); }
    // every team shares the SF-25 layout: shaded base, a c2 swoosh over the engine cover and sidepod tops, partner logos
    {
      const sh = g.createLinearGradient(0, 0, 0, h * 0.53); sh.addColorStop(0, 'rgba(0,0,0,0.14)'); sh.addColorStop(0.47, 'rgba(255,255,255,0.08)'); sh.addColorStop(1, 'rgba(0,0,0,0.14)'); g.fillStyle = sh; g.fillRect(0, 0, w, h * 0.53);
      // a near-black second colour would just read as bare carbon from above, so those teams get an outline only
      const swCol = team.split ? team.c3 : team.c2, solid = lum(swCol) > 0.18, pin = solid ? (lum(swCol) > 0.6 ? team.c3 : '#ffffff') : team.c3;
      for (const s of [1, -1]) {
        const v = (k) => h * (0.25 - s * k);
        g.beginPath(); g.moveTo(w * 0.36, v(0.0)); g.bezierCurveTo(w * 0.46, v(0.03), w * 0.52, v(0.18), w * 0.64, v(0.2));
        g.lineTo(w * 0.8, v(0.17)); g.bezierCurveTo(w * 0.88, v(0.15), w * 0.9, v(0.04), w * 0.94, v(0.03)); g.lineTo(w * 0.94, v(0.0));
        if (solid) { g.closePath(); g.fillStyle = swCol; g.fill(); }
        g.strokeStyle = pin; g.lineWidth = solid ? 1.5 : 3; g.stroke();
      }
      g.fillStyle = team.split ? team.c2 : team.c1; g.fillRect(w * 0.42, h * 0.215, w * 0.58, h * 0.07); // team-colour spine so the car reads from the chase camera
      // fuel-partner roundels and partner logos in white on red / red on white
      for (const [u, vv, flip] of [[0.5, 0.11, false], [0.5, 0.39, true]]) {
        g.save(); g.translate(w * u, h * vv); if (flip) g.scale(-1, -1);
        g.fillStyle = '#ffd200'; g.beginPath(); g.arc(0, 0, 13, Math.PI, 0); g.lineTo(9, 12); g.lineTo(-9, 12); g.closePath(); g.fill();
        g.fillStyle = '#e10600'; g.fillRect(-9, 4, 18, 3);
        g.restore();
      }
      const small = [[0.08, 0.17, 'UNICAP'], [0.08, 0.33, 'UNICAP'], [0.27, 0.13, 'VELO'], [0.27, 0.37, 'VELO'], [0.38, 0.16, 'IBEX'], [0.38, 0.34, 'IBEX'], [0.74, 0.2, 'ARCLINE'], [0.74, 0.3, 'ARCLINE']];
      g.font = '700 15px "Saira Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [u, vv, t] of small) { g.save(); g.translate(w * u, h * vv); if (vv > 0.25) g.scale(-1, -1); g.fillStyle = u > 0.6 ? (lum(team.c2) > 0.6 ? team.c1 : '#ffffff') : (lum(team.c1) > 0.6 ? '#16181b' : '#ffffff'); g.fillText(t, 0, 0); g.restore(); }
    }
    // accent sweeps from the nose along the flanks
    for (const [yA, yB, sgn] of []) {
      g.beginPath(); g.moveTo(w * 0.02, h * 0.25); g.bezierCurveTo(w * 0.25, h * (yA + 0.02 * sgn), w * 0.5, h * yA, w, h * yA - 4 * sgn);
      g.lineTo(w, h * yB); g.bezierCurveTo(w * 0.55, h * yB, w * 0.3, h * (0.25 + (yB - 0.25) * 0.4), w * 0.05, h * 0.25); g.fillStyle = team.split ? team.c3 : team.c2; g.fill();
    }
    // sponsor panels: title sponsor on the engine cover/sidepods, small logos on the nose
    const sp = GFX.tex.sponsors, pick = hashStr(team.id);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [y0, flip] of [[0.115, false], [0.385, true]]) {
      g.save(); g.translate(w * 0.62, h * y0); if (flip) g.scale(-1, -1);
      g.fillStyle = team.c3; g.font = '800 36px "Saira Condensed", Arial Narrow, sans-serif'; g.fillText(sp[pick % sp.length][0], 0, 0);
      g.restore();
    }
    g.save(); g.translate(w * 0.3, h * 0.25); g.rotate(Math.PI / 2); g.fillStyle = team.c3; g.font = '700 18px "Saira Condensed", Arial Narrow, sans-serif'; g.fillText(sp[(pick + 5) % sp.length][0], 0, 0); g.restore();
    // race numbers: nose top, engine cover sides
    g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 5; g.font = '800 70px "Saira Condensed", Arial Narrow, sans-serif';
    g.save(); g.translate(w * 0.16, h * 0.25); g.rotate(Math.PI / 2); g.strokeText(String(num), 0, 0); g.fillText(String(num), 0, 0); g.restore();
    g.font = '800 56px "Saira Condensed", Arial Narrow, sans-serif';
    g.save(); g.translate(w * 0.84, h * 0.17); g.strokeText(String(num), 0, 0); g.fillText(String(num), 0, 0); g.restore();
    g.save(); g.translate(w * 0.84, h * 0.33); g.scale(-1, -1); g.strokeText(String(num), 0, 0); g.fillText(String(num), 0, 0); g.restore();
  });
}
function panelNormalMap() {
  if (GFX.panelN) return GFX.panelN;
  const w = 1024, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3c3c3c'; g.lineWidth = 2.5; g.fillStyle = '#4a4a4a';
  const seam = (pts) => { g.beginPath(); pts.forEach(([u, v], i) => (i ? g.lineTo(u * w, v * h) : g.moveTo(u * w, v * h))); g.stroke(); };
  for (const u of [0.15, 0.36, 0.633, 0.843]) seam([[u, 0.02], [u + 0.01, 0.25], [u, 0.48]]);
  seam([[0.15, 0.08], [0.85, 0.07]]); seam([[0.15, 0.42], [0.85, 0.43]]); seam([[0.36, 0.17], [0.63, 0.17]]); seam([[0.36, 0.33], [0.63, 0.33]]);
  for (let u = 0.17; u < 0.84; u += 0.035) for (const v of [0.085, 0.415]) { g.beginPath(); g.arc(u * w, v * h, 2.2, 0, 7); g.fill(); }
  const src = g.getImageData(0, 0, w, h).data, out = g.createImageData(w, h), d = out.data, H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (H(x - 1, y) - H(x + 1, y)) * 3, ny = (H(x, y + 1) - H(x, y - 1)) * 3, l = Math.hypot(nx, ny, 1), i = (y * w + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.anisotropy = GFX.maxAniso;
  return (GFX.panelN = t);
}
// painted wing elements with sponsor print: the rear flap carries the title sponsor across the span,
// front elements carry it once per side
function wingMaterial(team, kind) {
  const sp = GFX.tex.sponsors, pick = hashStr(team.id);
  const tex = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = team.c1; g.fillRect(0, 0, w, h);
    g.fillStyle = lum(team.c2) > 0.18 ? team.c2 : team.c3; g.fillRect(0, h * 0.86, w, h * 0.14);   // trailing-edge stripe
    if (kind === 'plain') return;
    g.fillStyle = lum(team.c1) > 0.55 ? '#121417' : '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const name = sp[(pick + (kind === 'rear' ? 2 : 3)) % sp.length][0];
    if (kind === 'rear') { g.font = '800 92px "Saira Condensed", Arial Narrow, sans-serif'; g.fillText(name, w / 2, h * 0.45); }
    else { g.translate(w, h); g.rotate(Math.PI); g.font = '800 70px "Saira Condensed", Arial Narrow, sans-serif'; g.fillText(name, w * 0.24, h * 0.45); g.fillText(name, w * 0.76, h * 0.45); }
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshPhysicalMaterial({ map: tex, roughness: team.matte ? 0.5 : 0.32, metalness: 0.05, clearcoat: team.matte ? 0.1 : 0.8, side: THREE.DoubleSide });
}
// sponsor-branded wing endplate; uv comes from the plate's shape coordinates
function endplateMaterial(team, x0, x1, y0, y1, mirror, big) {
  const sp = GFX.tex.sponsors, pick = hashStr(team.id);
  const tex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = team.c1; g.fillRect(0, 0, w, h);
    const top = big ? (lum(team.split ? team.c3 : team.c2) > 0.18 ? (team.split ? team.c3 : team.c2) : team.c1) : team.c1;
    if (big) { g.fillStyle = top; g.fillRect(0, 0, w, h * 0.55); g.fillStyle = team.c1; g.fillRect(0, h * 0.55, w, h * 0.04); }
    g.fillStyle = team.c2; g.fillRect(0, h * 0.78, w, h * 0.1);
    g.fillStyle = '#16181b'; g.fillRect(0, h * 0.9, w, h * 0.1);
    const ink = (bg) => (lum(bg) > 0.55 ? '#121417' : '#ffffff');
    g.fillStyle = ink(top); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${big ? 64 : 60}px "Saira Condensed", Arial Narrow, sans-serif`; g.fillText(sp[(pick + 1) % sp.length][0], w / 2, h * 0.42);
    g.fillStyle = ink(team.c1); g.font = '700 24px "Saira Condensed", Arial Narrow, sans-serif'; g.fillText(team.name.toUpperCase(), w / 2, h * 0.68);
  });
  const sx = 1 / (x1 - x0), sy = 1 / (y1 - y0);
  if (mirror) { tex.repeat.set(-sx, sy); tex.offset.set(1 + x0 * sx, -y0 * sy); } else { tex.repeat.set(sx, sy); tex.offset.set(-x0 * sx, -y0 * sy); }
  return new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.4, metalness: 0.05, clearcoat: 0.6 });
}
// helmet livery: u wraps around (front at 0.5), v runs top to bottom
function helmetTexture(team, num = '') {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = team.c2; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // swooping side band and crown stripe
    g.fillStyle = team.c1;
    g.beginPath(); g.moveTo(0, h * 0.42); g.bezierCurveTo(w * 0.25, h * 0.3, w * 0.4, h * 0.55, w * 0.5, h * 0.5); g.bezierCurveTo(w * 0.6, h * 0.55, w * 0.75, h * 0.3, w, h * 0.42); g.lineTo(w, h * 0.7); g.lineTo(0, h * 0.7); g.fill();
    g.fillStyle = team.c3; g.fillRect(0, h * 0.7, w, h * 0.03); g.fillRect(w * 0.47, 0, w * 0.06, h * 0.4);
    g.fillStyle = '#ffffff'; g.font = '800 40px "Saira Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(num), w * 0.25, h * 0.56); g.fillText(String(num), w * 0.75, h * 0.56);
    g.fillStyle = '#16181b'; g.fillRect(0, h * 0.82, w, h * 0.18);
  });
}
function suitTexture(team) {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = team.c1; g.fillRect(0, 0, w, h);
    g.fillStyle = team.c2; g.fillRect(0, h * 0.42, w, h * 0.12);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#fff'; g.font = '700 16px "Saira Condensed", Arial'; g.fillText(team.name.toUpperCase(), 10, h * 0.3);
  });
}

const CAR_SCALE = 1.08;
function makeCar(team, num, G2, mats, compound = 'M', hero = false) {
  const grp = new THREE.Group(), body = new THREE.Group(); grp.add(body);
  grp.scale.setScalar(CAR_SCALE); // drawn a touch larger than the physics footprint so it reads like the TV/game cars
  const matte = !!team.matte;
  const paint = new THREE.MeshPhysicalMaterial({ map: liveryTexture(team, num, hero), normalMap: panelNormalMap(), normalScale: new THREE.Vector2(0.6, 0.6), roughness: matte ? 0.55 : 0.34, metalness: 0.05, clearcoat: matte ? 0.1 : 0.9, clearcoatRoughness: 0.06 });
  const accent = new THREE.MeshPhysicalMaterial({ color: team.c2, roughness: matte ? 0.5 : 0.34, metalness: 0.05, clearcoat: matte ? 0.1 : 0.8 });
  let fwEndR = null;
  const mk = (geo, mat, cs = true, parent = body) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cs; m.receiveShadow = true; parent.add(m); return m; };
  for (const sd of [1, -1]) {
    const fwe = mk(G2.fwEnd[sd], endplateMaterial(team, 2.35, 3.03, 0.05, 0.35, sd < 0, false)); if (sd > 0) fwEndR = fwe;
    mk(G2.rwEnd[sd], endplateMaterial(team, -2.55, -1.98, 0.55, 1.1, sd < 0, true));
  }
  mk(G2.body, paint); mk(G2.pods, paint); mk(G2.fin, paint); mk(G2.carbon, mats.carbon); mk(G2.dark, mats.dark, false); mk(G2.accent, new THREE.MeshPhysicalMaterial({ color: team.c1, roughness: 0.3, clearcoat: 0.8 }));
  const mirrors = [1, -1].map((sd) => { const m = mk(G2.mirrorGlass, mats.mirrorGlass || mats.visor, false); m.position.set(0.818, 0.765, 0.56 * sd); return m; });
  const wPlain = wingMaterial(team, 'plain'), wFront = wingMaterial(team, 'front'), wRear = wingMaterial(team, 'rear');
  mk(G2.rwMain, wPlain); mk(G2.fwMain, wFront); mk(G2.fwFlap3, wPlain);
  mk(G2.exhaust, mats.exhaust, false);
  mk(G2.tcam, new THREE.MeshStandardMaterial({ color: team.drivers[0].num === num ? 0x111111 : 0xffd21f, roughness: 0.5 }));
  // active aero: front-wing flaps pivot near their leading edges, rear flaps as one assembly
  const fw = [];
  [[2.66, 0.155, G2.fwFlap1], [2.5, 0.225, G2.fwFlap2]].forEach(([x, y, geo]) => { const p = new THREE.Group(); p.position.set(x, y, 0); mk(geo, geo === G2.fwFlap1 ? wFront : wPlain, true, p); body.add(p); fw.push(p); });
  const flapPivot = new THREE.Group(); flapPivot.position.set(-2.31, 0.99, 0); body.add(flapPivot);
  mk(G2.rwFlap, wRear, true, flapPivot); flapPivot.rotation.z = -0.45;
  // the head sits on a neck pivot so it can lean with cornering load
  const head = new THREE.Group(); head.position.set(-0.08, 0.86, 0); body.add(head);
  const M = GFX.models;
  if (M) {
    const H = M.helmet;
    const dr = team.drivers.find((d) => d.num === num) || { code: team.id + num, num };
    const shell = new THREE.Mesh(H.shell, new THREE.MeshPhysicalMaterial({ map: driverHelmetTexture(team, dr), roughness: 0.2, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 })); shell.castShadow = true; head.add(shell);
    if (H.inner) head.add(new THREE.Mesh(H.inner, new THREE.MeshPhysicalMaterial({ color: team.c1, roughness: 0.25, clearcoat: 1 })));
    if (H.visor) head.add(new THREE.Mesh(H.visor, mats.visor));
    if (H.metal) head.add(new THREE.Mesh(H.metal, mats.rimLip || mats.rim));
    if (H.dark) head.add(new THREE.Mesh(H.dark, mats.dark));
  } else {
    const helmetMat = new THREE.MeshPhysicalMaterial({ map: helmetTexture(team, num), roughness: 0.18, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 });
    const helmet = new THREE.Mesh(G2.helmet, helmetMat); helmet.castShadow = true; head.add(helmet);
    head.add(new THREE.Mesh(G2.spoiler, mats.carbon)); head.add(new THREE.Mesh(G2.visor, mats.visor));
  }
  const hans = new THREE.Mesh(G2.hans, mats.carbon); hans.position.set(-0.08, 0.86, 0); body.add(hans);
  const shoulders = new THREE.Mesh(G2.shoulders, new THREE.MeshStandardMaterial({ map: suitTexture(team), roughness: 0.9 })); shoulders.position.set(-0.08, 0.86, 0); shoulders.castShadow = true; body.add(shoulders);
  const rainLight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.12), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff0000, emissiveIntensity: 0 }));
  rainLight.position.set(-2.53, 0.33, 0); body.add(rainLight);
  // steering wheel, gloves and forearms (visible from every camera)
  const swTilt = new THREE.Group(); swTilt.position.set(0.4, 0.73, 0); swTilt.rotation.z = 0.28; body.add(swTilt);
  const swSpin = new THREE.Group(); swTilt.add(swSpin);
  const swSimple = [mk(G2.swSimple, mats.carbon, false, swSpin)];
  const suit = new THREE.MeshStandardMaterial({ map: suitTexture(team), roughness: 0.92 }), glove = new THREE.MeshStandardMaterial({ color: 0x1e2025, roughness: 0.8 });
  const arms = [];
  for (const sd of [1, -1]) {
    const hand = new THREE.Mesh(G2.fist[sd], glove); hand.position.set(-0.02, 0, 0.152 * sd); hand.rotation.x = 0.2 * sd; hand.castShadow = true; swSpin.add(hand); swSimple.push(hand);
    hand.add(new THREE.Mesh(G2.cuff[sd], accent));
    const fore = new THREE.Mesh(G2.limb, suit); body.add(fore);
    const upper = new THREE.Mesh(G2.upperArm, suit); body.add(upper);
    const shoulder = new THREE.Vector3(-0.12, 0.74, 0.19 * sd), elbow = new THREE.Vector3(0.1, 0.6, 0.25 * sd);
    const elb = new THREE.Mesh(G2.elbow, suit); elb.position.copy(elbow); body.add(elb);
    const d = elbow.clone().sub(shoulder); upper.position.copy(shoulder); upper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); upper.scale.set(1, d.length(), 1);
    arms.push({ hand, fore, upper, elbow, elb, sd });
  }
  const blob = new THREE.Mesh(G2.blob, mats.blob); blob.position.y = 0.01; blob.renderOrder = 1; grp.add(blob);
  const nutMat = new THREE.MeshStandardMaterial({ color: team.style === 'sf25' ? '#d0101e' : team.c2, metalness: 0.8, roughness: 0.3 });
  const wheels = [], steer = [], discs = [], blurs = [];
  [[1.7, 0.75, true], [1.7, -0.75, true], [-1.7, 0.7625, false], [-1.7, -0.7625, false]].forEach(([x, z, front]) => {
    const R = front ? 0.3525 : 0.355, w = front ? 0.28 : 0.375;
    const piv = new THREE.Group(); piv.position.set(x, R - 0.008, z); grp.add(piv);
    const wheel = new THREE.Group(); piv.add(wheel);
    // build each wheel with its outer face pointing away from the car
    const side = new THREE.Group(); if (z < 0) side.rotation.y = Math.PI; wheel.add(side);
    mk(front ? G2.tyreF : G2.tyreR, mats.tyre[compound] || mats.tyre.M, true, side);
    mk(front ? G2.rimF : G2.rimR, mats.rim, false, side);
    const lip = mk(G2.rimLip, mats.rimLip || mats.rim, false, side); lip.position.z = w / 2 - 0.016;
    const nut = new THREE.Mesh(G2.nut, nutMat); nut.position.z = w / 2 - 0.03; side.add(nut);
    const blur = new THREE.Mesh(G2.blurDisc, mats.rimBlur.clone()); blur.position.z = w / 2 - 0.02; blur.visible = false; side.add(blur); blurs.push(blur);
    const disc = new THREE.Mesh(G2.disc, mats.disc.clone()); disc.position.z = 0.02 * Math.sign(z); piv.add(disc); discs.push(disc);
    wheels.push(wheel); if (front) steer.push(piv);
  });
  // imported 2026 car body replaces the code-built bodywork (wheels, driver, wheel and mirrors stay)
  let modelBody = null;
  if (M && M.car) {
    const keep = new Set([hans, shoulders, ...mirrors]);
    body.children.forEach((o) => { if (o.isMesh && !keep.has(o)) o.visible = false; });
    fw.forEach((p) => (p.visible = false)); flapPivot.visible = false;
    const mat = new THREE.MeshPhysicalMaterial({ map: liveryFromModel(team, num), roughness: team.matte ? 0.5 : 0.3, metalness: 0.05, clearcoat: team.matte ? 0.1 : 0.9, clearcoatRoughness: 0.06 });
    // nearby: full-detail body; beyond 45 m the lighter one (switched in the game loop)
    modelBody = new THREE.Mesh(M.carhq ? M.carhq.livery : M.car.livery, mat); modelBody.castShadow = modelBody.receiveShadow = true; body.add(modelBody);
    modelBody.userData.lod = M.carhq ? [M.carhq.livery, M.car.livery] : null;
    // live mirror glass moved onto the model's mirror housings
    mirrors.forEach((m, k) => { m.position.set(0.6, 0.78, (k === 0 ? 1 : -1) * 0.55); m.scale.set(1, 1.3, 1.4); });
    if (M.car.light) body.add(new THREE.Mesh(M.car.light, new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a1a, emissiveIntensity: 0.6 })));
  }
  // imported driver replaces the simple shoulders, arms and fists (the fists stay as invisible grip targets)
  let avatar = null, sw = null;
  if (M) {
    avatar = makeAvatar(team, body); shoulders.visible = false;
    // a proper F1 wheel and gloves for every driver; the model's own bare hands are hidden
    sw = makeSteeringWheel(team, true); swSimple.forEach((o) => (o.visible = false)); swSpin.add(sw.g);
    if (avatar.hands) avatar.hands.visible = false;
    arms.forEach((a, i) => { a.fore.visible = a.upper.visible = false; if (a.elb) a.elb.visible = false; a.hand = sw.wrists[i]; a.hand.userData.wrist = true; });
  }
  const out = { sw, modelBody, fwParts: modelBody ? null : { end: fwEndR }, avatar, mirrors, grp, body, wheels, steer, flapPivot, fw, helmet: head, visor: hans, shoulders, rainLight, paint, discs, blurs, swTilt, swSpin, swSimple, arms, brakeT: 0 };
  if (typeof updateArms === 'function') updateArms(out); // pose the forearms onto the grips
  return out;
}

// detailed 2026-style F1 steering wheel: carbon faceplate, rubber grips, shift-light
// LEDs, central screen, labelled buttons, three rotaries, thumbwheels, paddles.
// Built in a front view (x right, y up, +z toward the driver), then turned to face -x.
// a racing glove gripping a vertical bar at the origin: palm behind, four fingers
// curled around the front, thumb resting on the wheel face (x toward the outside = sd)
function makeGlove(sd, team) {
  const g = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: team.c2, roughness: 0.7 });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14).scale(0.03, 0.052, 0.024), leather); palm.position.set(0.022 * sd, 0.0, -0.014); g.add(palm);
  for (let k = 0; k < 4; k++) {
    const y = 0.034 - k * 0.021, len = k === 3 ? 0.8 : 1, pts = [];
    for (let a = -1.9; a <= 1.9 * len; a += 0.25) pts.push(new THREE.Vector3(Math.cos(a) * 0.031 * sd, y - k * 0.001, Math.sin(a) * 0.031));
    const f = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, k === 3 ? 0.0085 : 0.0098, 8, false), leather); g.add(f);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(k === 3 ? 0.0085 : 0.0098, 10, 8), leather); tip.position.copy(pts[pts.length - 1]); g.add(tip);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.035, 4, 10), leather); thumb.position.set(-0.012 * sd, 0.046, 0.03); thumb.rotation.z = (Math.PI / 2 - 0.5) * sd; thumb.rotation.y = 0.3 * sd; g.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.036, 0.05, 16), accent); cuff.position.set(0.032 * sd, -0.05, 0.03); cuff.rotation.set(0.9, 0, 0.5 * sd); g.add(cuff);
  const wrist = new THREE.Object3D(); wrist.position.set(0.04 * sd, -0.065, 0.055); g.add(wrist); g.userData.wrist = wrist;
  return g;
}
function makeSteeringWheel(team, lite = false) {
  const g = new THREE.Group(), face = new THREE.Group(); face.rotation.y = -Math.PI / 2; g.add(face);
  const carbonM = new THREE.MeshPhysicalMaterial({ map: rep(GFX.tex.carbon.albedo, 3, 3), roughness: 0.35, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.97 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.95, roughness: 0.28 });
  // faceplate outline
  const s = new THREE.Shape();
  [[-0.1, 0.074], [0.1, 0.074], [0.118, 0.066], [0.126, 0.045], [0.118, -0.035], [0.1, -0.066], [0.06, -0.078], [-0.06, -0.078], [-0.1, -0.066], [-0.118, -0.035], [-0.126, 0.045], [-0.118, 0.066]].forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  const plateG = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 6 });
  face.add(new THREE.Mesh(plateG, carbonM));
  const zf = 0.0245; // front surface
  // grips, with gloved hands wrapped around them
  const wrists = [];
  for (const sd of [1, -1]) {
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.021, 0.085, 6, 14), rubber); grip.position.set(0.143 * sd, -0.008, 0.008); grip.rotation.z = -0.16 * sd; face.add(grip);
    const hand = makeGlove(sd, team); hand.position.copy(grip.position); hand.rotation.z = grip.rotation.z; face.add(hand);
    wrists.push(hand.userData.wrist);
    // shift / clutch paddles behind the wheel
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.004), carbonM); pad.position.set(0.1 * sd, 0.02, -0.02); pad.rotation.z = 0.25 * sd; face.add(pad);
    const clutch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.004), carbonM); clutch.position.set(0.085 * sd, -0.04, -0.024); clutch.rotation.z = -0.2 * sd; face.add(clutch);
    // thumbwheels by the grips
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.008, 18), alu); tw.rotation.z = Math.PI / 2; tw.position.set(0.112 * sd, 0.052, zf + 0.004); face.add(tw);
  }
  // quick-release hub
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.05, 20).rotateX(Math.PI / 2), alu); hub.position.z = -0.03; face.add(hub);
  // printed labels and graphics on the faceplate
  GFX.wheelLabels = GFX.wheelLabels || {};
  const labels = GFX.wheelLabels[team.id + team.name] || (GFX.wheelLabels[team.id + team.name] = canvasTex(1024, 560, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const X = (x) => (x / 0.256 + 0.5) * w, Y = (y) => (0.5 - y / 0.15) * h;
    c.fillStyle = '#e9edf2'; c.font = '700 22px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const lab = [['PL', -0.085, 0.043], ['N', -0.085, 0.017], ['RADIO', -0.085, -0.009], ['OT', 0.085, 0.043], ['BB+', 0.085, 0.017], ['BB−', 0.085, -0.009], ['OK', -0.07, -0.072], ['MARK', 0.07, -0.072], ['ERS', -0.034, -0.03], ['STRAT', 0, -0.03], ['DIFF', 0.034, -0.03]];
    lab.forEach(([t, x, y]) => c.fillText(t, X(x), Y(y + (Math.abs(x) > 0.05 && y > -0.06 ? 0.012 : 0.0))));
    c.strokeStyle = team.c2; c.lineWidth = 6; c.beginPath(); c.moveTo(X(-0.06), Y(0.07)); c.lineTo(X(0.06), Y(0.07)); c.stroke();
    c.fillStyle = team.c1; c.font = '800 20px "Saira Condensed", Arial'; c.fillText(team.name.toUpperCase(), X(0), Y(-0.062));
  }, { clamp: true }));
  labels.userData.keep = true;
  const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.256, 0.15), new THREE.MeshBasicMaterial({ map: labels, transparent: true, depthWrite: false }));
  lp.position.z = zf + 0.0006; face.add(lp);
  // screen
  const canvas = document.createElement('canvas'); canvas.width = lite ? 4 : 512; canvas.height = lite ? 2 : 256;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  if (lite) { const c2 = canvas.getContext('2d'); c2.fillStyle = '#0a1a10'; c2.fillRect(0, 0, 4, 2); }
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.058, 0.006), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.4 })); bezel.position.set(0, 0.016, zf + 0.002); face.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); screen.position.set(0, 0.016, zf + 0.0055); face.add(screen);
  // shift-light LEDs: 15 across the top, 3 flag lights each side
  const leds = [], ledGeo = new THREE.CylinderGeometry(0.0034, 0.0034, 0.004, 12).rotateX(Math.PI / 2);
  const ledColors = [...Array(15)].map((_, k) => (k < 5 ? 0x22ff55 : k < 10 ? 0xff2222 : 0x3366ff));
  for (let k = 0; k < 15; k++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: ledColors[k], emissiveIntensity: 0, roughness: 0.3 });
    const l = new THREE.Mesh(ledGeo, m); l.position.set(-0.07 + k * 0.01, 0.061, zf + 0.002); face.add(l); leds.push(m);
  }
  const flags = [];
  for (const sd of [1, -1]) for (let k = 0; k < 3; k++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xb46bff, emissiveIntensity: 0, roughness: 0.3 });
    const l = new THREE.Mesh(ledGeo, m); l.position.set(0.105 * sd, 0.03 - k * 0.011, zf + 0.002); face.add(l); flags.push(m);
  }
  // buttons
  const btn = (x, y, col, r = 0.0065) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.006, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35 })); b.position.set(x, y, zf + 0.003); face.add(b); };
  btn(-0.085, 0.043, 0xf2f2f2); btn(-0.085, 0.017, 0xf6c400); btn(-0.085, -0.009, 0x1e88e5); btn(0.085, 0.043, 0xb46bff); btn(0.085, 0.017, 0x2b2b2b); btn(0.085, -0.009, 0x2b2b2b);
  btn(-0.07, -0.06, 0x2bd46a, 0.0075); btn(0.07, -0.06, 0xff7a00, 0.0075);
  // three rotaries with knurled caps and a white pointer
  const rotaries = [];
  for (const x of [-0.034, 0, 0.034]) {
    const r = new THREE.Group(); r.position.set(x, -0.043, zf + 0.004); face.add(r);
    r.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0105, 0.012, 14).rotateX(Math.PI / 2), alu));
    const ptr = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.008, 0.002), new THREE.MeshBasicMaterial({ color: 0xffffff })); ptr.position.set(0, 0.004, 0.0065); r.add(ptr);
    rotaries.push(r);
  }
  return { g, canvas, tex, leds, flags, rotaries, wrists };
}

// tyre material: vertices pushed below the road are flattened onto it and
// bulged sideways, giving a loaded contact patch and sidewall bulge
function tyreMaterial(map) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
      vec4 wpT = modelMatrix * vec4(transformed, 1.0);
      float pen = 0.006 - wpT.y;
      if (pen > 0.0) {
        vec3 axle = normalize(modelMatrix[2].xyz);
        float sideSign = sign(dot(wpT.xyz - modelMatrix[3].xyz, axle));
        wpT.y = 0.006; wpT.xyz += axle * sideSign * pen * 0.9;
      }
      vec4 mvPosition = viewMatrix * wpT;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  return m;
}

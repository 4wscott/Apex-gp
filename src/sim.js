// ==== Simulation core: track geometry, vehicle dynamics, AI ===============
// Pure JS, no rendering. Coordinates are 2D metres (x, y), heading h in
// radians (CCW), forward = (cos h, sin h), left = (-sin h, cos h).
const G = 9.81, RHO = 1.225;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

// ---- Track ----------------------------------------------------------------
function integrateTrack(segs, step) {
  // curvature per step
  const ks = [];
  segs.forEach((sg) => { const n = Math.max(1, Math.round(sg.len / step)); for (let i = 0; i < n; i++) ks.push(sg.k); });
  const N = ks.length;
  // circular box smoothing (twice) -> transitions roughly 30 m long
  const smooth = (arr, w) => {
    const out = new Float64Array(N); let acc = 0;
    for (let i = -w; i <= w; i++) acc += arr[(i + N) % N];
    for (let i = 0; i < N; i++) { out[i] = acc / (2 * w + 1); acc += arr[(i + w + 1) % N] - arr[(i - w + N) % N]; }
    return out;
  };
  const w = Math.round(12 / step);
  const k = smooth(smooth(Float64Array.from(ks), w), w);
  const x = new Float64Array(N + 1), y = new Float64Array(N + 1), h = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) {
    const hm = h[i] + k[i] * step * 0.5;
    x[i + 1] = x[i] + Math.cos(hm) * step; y[i + 1] = y[i] + Math.sin(hm) * step;
    h[i + 1] = h[i] + k[i] * step;
  }
  return { N, x, y, h, k };
}

// convert filleted map vertices into straights + constant-radius arcs
function filletToSegs(pts) {
  const N = pts.length, V = pts.map((p) => ({ x: p[0], y: p[1], r: p[2] }));
  const tan = () => V.forEach((v, i) => {
    const a = V[(i - 1 + N) % N], b = V[(i + 1) % N];
    let ix = v.x - a.x, iy = v.y - a.y, ox = b.x - v.x, oy = b.y - v.y;
    const li = Math.hypot(ix, iy), lo = Math.hypot(ox, oy); ix /= li; iy /= li; ox /= lo; oy /= lo;
    v.th = Math.atan2(ix * oy - iy * ox, ix * ox + iy * oy); v.t = v.r * Math.tan(Math.abs(v.th) / 2); v.lo = lo;
  });
  tan();
  for (let it = 0; it < 30; it++) {
    let ok = true;
    V.forEach((v, i) => {
      const w = V[(i + 1) % N];
      if (v.t + w.t > v.lo * 0.96) { const s = (v.lo * 0.96) / (v.t + w.t); v.r *= s; w.r *= s; ok = false; }
    });
    tan(); if (ok) break;
  }
  const last = V[N - 1], first = V[0];
  const e0 = last.lo - last.t - first.t;
  const segs = [e0 / 2];
  V.forEach((v, i) => {
    segs.push([(v.th * 180) / Math.PI, v.r]);
    if (i < N - 1) segs.push(v.lo - v.t - V[i + 1].t);
  });
  segs.push(e0 / 2);
  return segs;
}

function buildTrack(spec) {
  const step = 1;
  const raw = spec.pts ? filletToSegs(spec.pts) : spec.segs;
  let segs = raw.map((s) => (typeof s === 'number'
    ? { len: s, k: 0, straight: true }
    : { len: (Math.abs(s[0]) * Math.PI / 180) * s[1], k: Math.sign(s[0]) / s[1], straight: false }));
  // normalise total turning to exactly +-360 deg by stretching corner arcs
  let tot = 0; segs.forEach((s) => (tot += s.len * s.k));
  const target = tot >= 0 ? Math.PI * 2 : -Math.PI * 2;
  const cornerTot = segs.reduce((a, s) => a + (s.straight ? 0 : s.len * s.k), 0);
  const sc = target / cornerTot;
  segs.forEach((s) => { if (!s.straight) s.len *= sc; });

  // close the loop by solving two straight lengths (linear in position)
  for (let iter = 0; iter < 3; iter++) {
    const r = integrateTrack(segs, step);
    const ex = r.x[r.N] - r.x[0], ey = r.y[r.N] - r.y[0];
    if (Math.hypot(ex, ey) < 0.5 || spec.pts) break;
    // direction of each straight
    let pos = 0; const dirs = [];
    segs.forEach((s, i) => {
      const n = Math.max(1, Math.round(s.len / step));
      if (s.straight && s.len >= 60) { const m = Math.min(r.N - 1, pos + (n >> 1)); dirs.push({ i, dx: Math.cos(r.h[m]), dy: Math.sin(r.h[m]) }); }
      pos += n;
    });
    let best = null;
    for (let a = 0; a < dirs.length; a++) for (let b = a + 1; b < dirs.length; b++) {
      const A = dirs[a], B = dirs[b];
      const det = A.dx * B.dy - A.dy * B.dx;
      if (Math.abs(det) < 0.3) continue;
      const da = (-ex * B.dy + ey * B.dx) / det, db = (-A.dx * ey + A.dy * ex) / det;
      const la = segs[A.i].len + da, lb = segs[B.i].len + db;
      if (la < 40 || lb < 40) continue;
      const cost = Math.abs(da) / segs[A.i].len + Math.abs(db) / segs[B.i].len;
      if (!best || cost < best.cost) best = { cost, a: A.i, b: B.i, la, lb };
    }
    if (!best) break;
    segs[best.a].len = best.la; segs[best.b].len = best.lb;
  }
  const r = integrateTrack(segs, step);
  const ex = r.x[r.N] - r.x[0], ey = r.y[r.N] - r.y[0];
  const closeErr = Math.hypot(ex, ey);

  // resample every 2 m, distributing residual closure error
  const n = r.N >> 1;
  const T = {
    spec, n, hw: spec.width / 2, closeErr,
    px: new Float64Array(n), py: new Float64Array(n), tx: new Float64Array(n), ty: new Float64Array(n),
    nx: new Float64Array(n), ny: new Float64Array(n), kap: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const j = i * 2, f = j / r.N;
    T.px[i] = r.x[j] - ex * f; T.py[i] = r.y[j] - ey * f;
  }
  let L = 0;
  for (let i = 0; i < n; i++) L += Math.hypot(T.px[(i + 1) % n] - T.px[i], T.py[(i + 1) % n] - T.py[i]);
  T.length = L; T.ds = L / n;
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    let dx = T.px[b] - T.px[a], dy = T.py[b] - T.py[a]; const d = Math.hypot(dx, dy);
    T.tx[i] = dx / d; T.ty[i] = dy / d; T.nx[i] = -T.ty[i]; T.ny[i] = T.tx[i];
  }
  for (let i = 0; i < n; i++) {
    const b = (i + 1) % n;
    let dh = Math.atan2(T.ty[b], T.tx[b]) - Math.atan2(T.ty[i], T.tx[i]);
    while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    T.kap[i] = dh / T.ds;
  }
  // wide-window curvature for kerbs / runoff placement
  const kw = new Float64Array(n);
  for (let i = 0; i < n; i++) { let a = 0; for (let j = -6; j <= 6; j++) a += T.kap[(i + j + n) % n]; kw[i] = a / 13; }
  T.kapW = kw;
  T.cw = target < 0;

  buildGrid(T);
  computeWalls(T);
  computeRacingLine(T);
  // hills, crests and banking: worked out against the flat racing speeds (to ease crests that would be too sharp),
  // then the speeds are worked out again on the real road
  computeElevation(T);
  if (T.hasElev) { const sp = T.speedProfile(1.5, 4.4, 800, 720e3, 1.45); T.lineV = sp.v; T.lineVf = sp.vf; }
  computeZones(T);
  return T;
}

// ---- elevation (graphics plan, phase 4): height T.h, slope T.grade (dh/ds), vertical curvature T.kv (d2h/ds2, + in a
// dip or compression, - over a crest) and banking T.bankL (dh/dlat, + when the left side is higher) per sample. The pit
// lane's main section and 30 m either side stay level at 0, so the garages, grid, gantry and podium need no heights
function computeElevation(T) {
  const n = T.n, E = (typeof ELEV !== 'undefined' && ELEV[T.spec.id]) || null;
  T.h = new Float64Array(n); T.grade = new Float64Array(n); T.kv = new Float64Array(n); T.bankL = new Float64Array(n); T.crown = 0.015;
  T.hasElev = !!E; T.layout = E ? 2 : 1;
  if (!E) return;
  const PL = pitLane(T), at = (sAlong) => ((Math.round(PL.a + sAlong / T.ds) % n) + n) % n;
  const fA = at(PL.mainStart - 30), fB = at(PL.mainEnd + 30), mA = at(PL.mainStart), mB = at(PL.mainEnd);
  const fwd = (a, b) => ((b - a) % n + n) % n; // samples from a forward to b
  const inSpan = (a, b) => (i) => fwd(a, i) <= fwd(a, b);
  const inFlat = inSpan(fA, fB), inMain = inSpan(mA, mB);
  // keys round the lap; the level span's ends are keys at 0 with a flat tangent; periodic cubic (Catmull-Rom tangents)
  const keys = E.h.map(([f, h]) => [Math.round(f * n) % n, h, null]).filter(([i]) => !inFlat(i)).concat([[fA, 0, 0], [fB, 0, 0]]).sort((a, b) => a[0] - b[0]);
  const m = keys.length, raw = new Float64Array(n);
  const tan = (k) => { if (keys[k][2] === 0) return 0; const a = keys[(k - 1 + m) % m], b = keys[(k + 1) % m]; return (b[1] - a[1]) / (fwd(a[0], b[0]) || 1); };
  for (let k = 0; k < m; k++) {
    const A = keys[k], B = keys[(k + 1) % m], L = fwd(A[0], B[0]) || n, ta = tan(k) * L, tb = tan((k + 1) % m) * L;
    for (let d = 0; d <= L; d++) {
      const t = d / L, t2 = t * t, t3 = t2 * t;
      raw[(A[0] + d) % n] = (2 * t3 - 3 * t2 + 1) * A[1] + (t3 - 2 * t2 + t) * ta + (-2 * t3 + 3 * t2) * B[1] + (t3 - t2) * tb;
    }
  }
  // smoothing that never moves the pit lane's main section (it stays exactly level): like heat spreading with the
  // level straight held fixed, so the road eases out of it instead of kinking
  const free = new Uint8Array(n); for (let i = 0; i < n; i++) free[i] = inMain(i) ? 0 : 1;
  const box = (src, R, mask) => { const out = new Float64Array(n); for (let i = 0; i < n; i++) { if (!mask[i]) { out[i] = src[i]; continue; } let a = 0; for (let j = -R; j <= R; j++) a += src[(i + j + n) % n]; out[i] = a / (2 * R + 1); } return out; };
  let h = raw; for (let i = 0; i < n; i++) if (!free[i]) h[i] = 0;
  for (let r = 0; r < 3; r++) h = box(h, 8, free);
  // ease crests (the car goes light, never flies) and compressions (a hard squeeze, not a wall) at racing speed, and
  // keep slopes under 18 %. Done on the slope (rise per sample), smoothed where needed and then added up again from
  // the end of the level straight: the slope is zero along the straight, so the road eases out of it with no kink
  const kvOf = (hh, i) => (hh[(i + 3) % n] - 2 * hh[i] + hh[(i - 3 + n) % n]) / (9 * T.ds * T.ds);
  let g = new Float64Array(n); for (let i = 0; i < n; i++) g[i] = free[i] && free[(i + 1) % n] ? h[(i + 1) % n] - h[i] : 0;
  const nFree = g.reduce((a, _, i) => a + (free[i] && free[(i + 1) % n] ? 1 : 0), 0);
  const integrate = () => {
    let S = 0; for (let i = 0; i < n; i++) S += g[i];
    for (let i = 0; i < n; i++) if (free[i] && free[(i + 1) % n]) g[i] -= S / nFree; // the lap closes on itself
    const out = new Float64Array(n); let z = 0;
    for (let k = 0; k < n; k++) { const i = (mB + k) % n; out[i] = free[i] ? z : 0; z += g[i]; }
    return out;
  };
  h = integrate();
  for (let it = 0; it < 150; it++) {
    const bad = new Uint8Array(n); let nb = 0;
    for (let i = 0; i < n; i++) {
      const v = Math.max(30, T.lineV ? T.lineV[i] : 60), a = v * v * kvOf(h, i), gr = Math.abs(g[i]) / T.ds; // at least 108 km/h: cars leave a slow corner much faster
      if (a < -0.6 * G || a > 2.0 * G || gr > 0.18) { for (let k = -12; k <= 12; k++) { const q = (i + k + n) % n; if (free[q] && free[(q + 1) % n]) bad[q] = 1; } nb++; }
    }
    if (!nb) break;
    g = box(g, 8, bad);
    h = integrate();
  }
  T.h = h;
  for (let i = 0; i < n; i++) { T.grade[i] = (h[(i + 1) % n] - h[(i - 1 + n) % n]) / (2 * T.ds); T.kv[i] = kvOf(h, i); }
  T.kv = box(T.kv, 2, new Uint8Array(n).fill(1));
  // banking: [from, to, degrees] eased in and out over 25 m; the turn's direction decides which side is high
  for (const [fa, fb, deg] of E.bank || []) {
    const a = Math.round(fa * n) % n, b = Math.round(fb * n) % n, mid = (a + Math.round(fwd(a, b) / 2)) % n, sgn = Math.sign(T.kapW[mid]) || 1;
    const R = Math.round(25 / T.ds), tb = Math.tan((deg * Math.PI) / 180);
    for (let d = -R; d <= fwd(a, b) + R; d++) {
      const i = (a + d + n) % n, w = d < 0 ? 1 + d / R : d > fwd(a, b) ? 1 - (d - fwd(a, b)) / R : 1, e = w * w * (3 - 2 * w);
      T.bankL[i] = -sgn * tb * e;
    }
  }
}
// height of the road at sample i, lat metres to the left of the centreline (banking, a slight crown on the tarmac)
function roadZ(T, i, lat) { return T.hasElev ? T.h[i] + lat * T.bankL[i] - T.crown * Math.min(Math.abs(lat), T.hw) : 0; }
// height, slope (dh/dx, dh/dy in the sim's plane) and vertical curvature under a point near sample i
function roadAt(T, x, y, i) {
  const n = T.n, ox = x - T.px[i], oy = y - T.py[i], along = (ox * T.tx[i] + oy * T.ty[i]) / T.ds, lat = ox * T.nx[i] + oy * T.ny[i];
  if (!T.hasElev) return { z: 0, gx: 0, gy: 0, kv: 0, lat };
  const j = along >= 0 ? (i + 1) % n : (i - 1 + n) % n, f = Math.min(1, Math.abs(along));
  const hh = T.h[i] + (T.h[j] - T.h[i]) * f, bk = T.bankL[i] + (T.bankL[j] - T.bankL[i]) * f, gr = T.grade[i] + (T.grade[j] - T.grade[i]) * f;
  const sl = bk - (Math.abs(lat) < T.hw ? T.crown * Math.sign(lat) : 0);
  return { z: hh + lat * bk - T.crown * Math.min(Math.abs(lat), T.hw), gx: gr * T.tx[i] + sl * T.nx[i], gy: gr * T.ty[i] + sl * T.ny[i], kv: T.kv[i] + (T.kv[j] - T.kv[i]) * f, lat };
}

// spatial hash of centreline samples (40 m cells)
function buildGrid(T) {
  const cell = 40, map = new Map();
  for (let i = 0; i < T.n; i++) {
    const key = Math.floor(T.px[i] / cell) + ',' + Math.floor(T.py[i] / cell);
    let a = map.get(key); if (!a) map.set(key, (a = [])); a.push(i);
  }
  T.grid = { cell, map };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < T.n; i++) { minX = Math.min(minX, T.px[i]); maxX = Math.max(maxX, T.px[i]); minY = Math.min(minY, T.py[i]); maxY = Math.max(maxY, T.py[i]); }
  T.bounds = { minX, minY, maxX, maxY };
}
// nearest centreline distance, optionally ignoring samples near index `skip`
function trackDistance(T, x, y, skip = -1, skipRange = 0, radius = 1) {
  const c = T.grid.cell, cx = Math.floor(x / c), cy = Math.floor(y / c);
  let best = Infinity, bi = -1;
  for (let a = -radius; a <= radius; a++) for (let b = -radius; b <= radius; b++) {
    const arr = T.grid.map.get((cx + a) + ',' + (cy + b)); if (!arr) continue;
    for (const i of arr) {
      if (skip >= 0) { let di = Math.abs(i - skip); di = Math.min(di, T.n - di); if (di < skipRange) continue; }
      const d = (T.px[i] - x) ** 2 + (T.py[i] - y) ** 2;
      if (d < best) { best = d; bi = i; }
    }
  }
  return { d: Math.sqrt(best), i: bi };
}

function computeWalls(T) {
  const n = T.n, hw = T.hw, base = T.spec.wall;
  const wl = new Float64Array(n), wr = new Float64Array(n);
  let minSep = Infinity;
  for (let i = 0; i < n; i++) {
    for (const side of [1, -1]) {
      let w = base;
      const k = T.kapW[i] * side; // >0 means this side is inside of the turn
      if (k > 1e-4) w = Math.min(w, 0.8 / k);
      // keep the wall clear of other parts of the circuit
      for (; w > hw + 1.5; w -= 0.5) {
        const wx = T.px[i] + T.nx[i] * side * w, wy = T.py[i] + T.ny[i] * side * w;
        const q = trackDistance(T, wx, wy, i, 40, 1);
        if (q.d > hw + 2.5) break;
      }
      (side > 0 ? wl : wr)[i] = Math.max(w, hw + 1.5);
    }
    const q = trackDistance(T, T.px[i], T.py[i], i, 60, 1);
    minSep = Math.min(minSep, q.d);
  }
  // min-filter then smooth so the barrier line is continuous
  const filt = (arr) => {
    const m = new Float64Array(n);
    for (let i = 0; i < n; i++) { let v = Infinity; for (let j = -6; j <= 6; j++) v = Math.min(v, arr[(i + j + n) % n]); m[i] = v; }
    const s = new Float64Array(n);
    for (let i = 0; i < n; i++) { let a = 0; for (let j = -4; j <= 4; j++) a += m[(i + j + n) % n]; s[i] = a / 9; }
    return s;
  };
  T.wallL = filt(wl); T.wallR = filt(wr); T.minSep = minSep;
  // kerbs and gravel
  T.kerb = new Uint8Array(n); T.gravelL = new Uint8Array(n); T.gravelR = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (Math.abs(T.kapW[i]) > 1 / 230) for (let j = -7; j <= 7; j++) T.kerb[(i + j + n) % n] = 1;
    if (T.spec.runoff !== 'street' && Math.abs(T.kapW[i]) > 1 / 95) {
      const outside = T.kapW[i] > 0 ? T.gravelR : T.gravelL;
      for (let j = -4; j <= 18; j++) outside[(i + j + n) % n] = 1;
    }
  }
}

function computeRacingLine(T) {
  const n = T.n, lim = T.hw - 1.25;
  const o = new Float64Array(n);
  const passes = [[60, 40], [30, 60], [15, 80], [7, 120], [3, 80]];
  for (const [k, it] of passes) {
    for (let r = 0; r < it; r++) {
      for (let i = 0; i < n; i++) {
        const a = (i - k + n) % n, b = (i + k) % n;
        const mx = (T.px[a] + T.nx[a] * o[a] + T.px[b] + T.nx[b] * o[b]) / 2;
        const my = (T.py[a] + T.ny[a] * o[a] + T.py[b] + T.ny[b] * o[b]) / 2;
        const tgt = (mx - T.px[i]) * T.nx[i] + (my - T.py[i]) * T.ny[i];
        o[i] = clamp(lerp(o[i], tgt, 0.6), -lim, lim);
      }
    }
  }
  T.lineO = o;
  const lx = new Float64Array(n), ly = new Float64Array(n);
  for (let i = 0; i < n; i++) { lx[i] = T.px[i] + T.nx[i] * o[i]; ly[i] = T.py[i] + T.ny[i] * o[i]; }
  T.lx = lx; T.ly = ly;
  // curvature of the line (circumcircle through i-4, i, i+4), lightly smoothed
  const kl = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 4 + n) % n, b = (i + 4) % n;
    const ax = lx[a] - lx[i], ay = ly[a] - ly[i], bx = lx[b] - lx[i], by = ly[b] - ly[i];
    const cr = ax * by - ay * bx, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by), lc = Math.hypot(bx - ax, by - ay);
    kl[i] = (2 * cr) / (la * lb * lc + 1e-9);
  }
  const ks = new Float64Array(n);
  for (let i = 0; i < n; i++) { let a = 0; for (let j = -2; j <= 2; j++) a += kl[(i + j + n) % n]; ks[i] = a / 5; }
  T.lineK = ks;
  T.dsL = new Float64Array(n);
  for (let i = 0; i < n; i++) { const b = (i + 1) % n; T.dsL[i] = Math.hypot(lx[b] - lx[i], ly[b] - ly[i]); }
  T.speedProfile = (mu, ClA, m, Pmax, CdA) => speedProfile(T, mu, ClA, m, Pmax, CdA);
  const sp = T.speedProfile(1.5, 4.4, 800, 720e3, 1.45);
  T.lineV = sp.v; T.lineVf = sp.vf;
}

function speedProfile(T, mu, ClA, m, Pmax, CdA) {
  const n = T.n, kd = (0.5 * RHO * ClA) / m, kdrag = (0.5 * RHO * CdA) / m;
  const v = new Float64Array(n), el = !!T.hasElev;
  // on a real road: a banked corner holds the car (the bank's share of gravity, and more load), a compression adds
  // load and a crest takes it away; climbing helps the brakes and costs acceleration
  const kvA = (i) => (el ? T.kv[i] : 0), sbA = (i) => (el ? Math.sign(T.lineK[i]) * T.bankL[i] : 0), grA = (i) => (el ? T.grade[i] : 0);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(T.lineK[i]), sb = sbA(i);
    const den = k - mu * (kd + kvA(i) + 0.12 * k * sb);
    v[i] = den <= 0 ? 95 : Math.min(95, Math.sqrt((G * (mu + sb)) / den));
  }
  for (let rep = 0; rep < 2; rep++)
    for (let c = 0; c < n; c++) {
      const i = (n - 1 - c + n) % n, j = (i + 1) % n;
      const vj = v[j];
      const lat = vj * vj * Math.abs(T.lineK[i]), tot = mu * (G + (kd + kvA(i)) * vj * vj);
      const avail = Math.sqrt(Math.max(0, tot * tot - lat * lat)) * 0.92 + kdrag * vj * vj + G * grA(i);
      v[i] = Math.min(v[i], Math.sqrt(Math.max(0, vj * vj + 2 * Math.max(1, avail) * T.dsL[i])));
    }
  const vf = Float64Array.from(v);
  for (let rep = 0; rep < 2; rep++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, vi = Math.max(vf[i], 5);
      const lat = vi * vi * Math.abs(T.lineK[i]), tot = mu * (G * 0.55 + (kd + kvA(i) * 0.55) * vi * vi);
      const trac = Math.sqrt(Math.max(0, tot * tot - lat * lat));
      const acc = Math.min(trac, Pmax / (m * vi)) - kdrag * vi * vi - G * grA(i);
      vf[j] = Math.min(v[j], Math.sqrt(Math.max(0, vi * vi + 2 * acc * T.dsL[i])));
    }
  return { v, vf };
}

// straight-mode (low drag active aero) zones: long low-curvature stretches
function computeZones(T) {
  const n = T.n, z = new Uint8Array(n), ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) ok[i] = Math.abs(T.lineK[i]) < 1 / 700 ? 1 : 0;
  let start = 0; while (start < n && ok[start]) start++;
  let run = 0;
  for (let c = 0; c <= n; c++) {
    const i = (start + c) % n;
    if (ok[i] && c < n) run++;
    else {
      if (run * T.ds > 300) {
        const skipIn = Math.round(80 / T.ds), cut = Math.round(40 / T.ds);
        for (let r = skipIn; r < run - cut; r++) z[(i - run + r + n * 2) % n] = 1;
      }
      run = 0;
    }
  }
  T.aeroZone = z;
  // corner count
  let corners = 0, inC = false;
  for (let i = 0; i < n; i++) { const c = Math.abs(T.kapW[i]) > 1 / 260; if (c && !inC) corners++; inC = c; }
  T.corners = corners;
  // braking zones: index of the minimum speed after a large drop
  T.brakeZones = [];
  for (let i = 0; i < n; i++) {
    const a = T.lineV[(i - 1 + n) % n], b = T.lineV[i], c = T.lineV[(i + 1) % n];
    if (b <= a && b < c) {
      let mx = b; for (let j = 1; j < 250; j++) mx = Math.max(mx, T.lineV[(i - j + n) % n]);
      if (mx - b > 22) T.brakeZones.push(i);
    }
  }
}

// ---- Vehicle --------------------------------------------------------------
const CAR_BASE = {
  m: 800, Iz: 1050, L: 3.6, a: 1.98, b: 1.62, h: 0.3,
  ClA: 4.4, CdA: 1.45, aeroBal: 0.41, mu: 1.78, muR: 1.06,
  Pice: 400e3, Pers: 350e3, brakeMax: 42000, maxSteer: 0.32, steerRate: 1.6,
  rr: 0.012, BF: 14, CF: 1.5, BR: 17, CR: 1.3, wheelR: 0.36,
  // lateral load transfer: track width, the front's share of the roll stiffness (springs and anti-roll bars set it), how
  // fast the body rolls into a corner, and how much grip a tyre loses as its load rises (load sensitivity)
  tw: 1.6, rollF: 0.47, rollTau: 0.09, kLT: 0.12,
  gears: [82, 122, 158, 192, 228, 264, 302, 348], redline: 12500, // km/h at redline per gear
};
const ERS_MODES = [
  { name: 'HARVEST', deploy: 120e3, harvestCoast: 90e3 },
  { name: 'BALANCED', deploy: 250e3, harvestCoast: 40e3 },
  { name: 'ATTACK', deploy: 350e3, harvestCoast: 0 },
];
const SOC_MAX = 4e6;
const ROLL_F0 = 0.47;
// the squared share of an axle's load moved to its outside tyre (0 .. 1)
function ltShare(share, Fz, dLT) { const x = Math.min(1, (share * dLT) / (Fz / 2)); return x * x; } // the standard setup's front roll stiffness share: the car's balance as the speed profile assumes it
// grip of a compound on a track with water level w (0 dry .. 1 standing water), relative to its dry grip
function wetGrip(key, w) {
  if (key === 'I') return 1 - 0.26 * Math.abs(w - 0.45) / 0.55 - (w < 0.15 ? 0.06 : 0);
  if (key === 'W') return 1 - 0.3 * Math.max(0, 0.75 - w) / 0.75;
  return 1 - 0.38 * w; // slicks
}
// tyre compounds: grip multiplier, wear rate, ideal temperature (C)
const COMPOUNDS = {
  S: { name: 'Soft', grip: 1.0, wear: 1.7, temp: 92, color: '#e0262b' },
  M: { name: 'Medium', grip: 0.978, wear: 1.0, temp: 102, color: '#f2c318' },
  H: { name: 'Hard', grip: 0.955, wear: 0.6, temp: 112, color: '#f2f2f2' },
  I: { name: 'Intermediate', grip: 0.93, wear: 1.1, temp: 72, color: '#2fbf4a', wet: true },
  W: { name: 'Wet', grip: 0.88, wear: 0.8, temp: 62, color: '#2f7bd6', wet: true },
};

// ---- car damage, part by part. Health 1 = perfect, 0 = gone. sus and tyre run FL, FR, RL, RR (left = +y in the car)
function freshDamage() { return { fwL: 1, fwR: 1, rw: 1, floor: 1, sus: [1, 1, 1, 1], tyre: [1, 1, 1, 1], punct: [0, 0, 0, 0], pu: 1, overRev: 0, noses: 0 }; }
const DNF_SUS = 0.15;
// the car's outline for wall contact (m, x forward, y left): nose tip, front wing tips, the four tyres' outer edges,
// rear wing corners. It matches the drawn car (which is scaled 1.08)
const CAR_OUTLINE = [[3.15, 0], [2.85, 0.95], [2.85, -0.95], [1.84, 1.0], [1.84, -1.0], [-1.84, 1.05], [-1.84, -1.05], [-2.65, 0.5], [-2.65, -0.5]]; // a corner this badly bent can't be driven

class Car {
  constructor(track, team, driver, opts = {}) {
    this.track = track; this.team = team; this.driver = driver;
    const p = Object.assign({}, CAR_BASE);
    p.Pice *= team.perf.p; p.ClA *= team.perf.a;
    // career car development (levels 0-5 each)
    const up = opts.upgrades;
    if (up) { p.Pice *= 1 + 0.006 * (up.power || 0); p.ClA *= 1 + 0.006 * (up.aero || 0); p.mu *= 1 + 0.004 * (up.grip || 0); }
    this.p = p;
    this.isPlayer = !!opts.player;
    this.assist = opts.assist || { tc: 2, abs: true, autoGear: true };
    this.compound = opts.compound || 'M';
    this.damageMode = opts.damage || 'real'; // 'off' | 'visual' (shows, doesn't change the handling) | 'real'
    this.reset();
  }
  // the front wing as one number, for everything that only cares about the nose (pit calls, network, the HUD)
  get wingHealth() { return this.dmg ? (this.dmg.fwL + this.dmg.fwR) / 2 : 1; }
  set wingHealth(v) { if (!this.dmg) this.dmg = freshDamage(); this.dmg.fwL = this.dmg.fwR = v; }
  repairAll() { this.dmg = freshDamage(); this.dnf = null; this.parked = false; }
  // anything still wrong with the car (0 = perfect)
  damageLevel() {
    const D = this.dmg; if (!D) return 0;
    return Math.max(1 - D.fwL, 1 - D.fwR, 1 - D.rw, 1 - D.floor, 1 - D.pu, ...D.sus.map((x) => 1 - x), ...D.tyre.map((x) => 1 - x));
  }
  puncture(i) { const D = this.dmg; if (this.damageMode === 'off' || D.punct[i]) return; D.punct[i] = 1; this.dmgNews = { part: 'tyre', i }; }
  // an impact: lx/ly is the direction of the hit in the car's own frame (forward / left), vn the closing speed in m/s
  // an impact: lx/ly is the direction of the hit in the car's own frame (forward / left), vn the closing speed in m/s.
  // Walls and any contact involving the player are full strength (a 100 km/h nose-first hit wrecks the front wing and
  // badly bends the front suspension, ~115 km/h ends the race); AI-against-AI touches use the gentler racing scale.
  damageHit(lx, ly, vn, kind, pt) {
    const full = kind === 'carYou' || (kind === 'wall' && this.isPlayer); // the player's car: full strength
    if (this.damageMode === 'off' || vn <= (full ? 10 : 12) || !this.dmg) return;
    const D = this.dmg, e = full ? (vn - 10) * 0.05 : (vn - 12) * 0.035, k = full ? 1 : 0.6, left = ly > 0;
    const cut = (key, a) => { D[key] = Math.max(0, D[key] - a); }, sus = (i, a) => { D.sus[i] = Math.max(0, D.sus[i] - a); };
    let part;
    // a wheel that touches: that corner's suspension and tyre take it (a cut tyre, a bent wishbone)
    if (pt && Math.abs(pt.cx) > 1.5 && Math.abs(pt.cx) < 2 && Math.abs(pt.cy) > 0.9) {
      const i = (pt.cx > 0 ? 0 : 2) + (pt.cy > 0 ? 0 : 1);
      sus(i, e * (full ? 0.8 : 0.6)); if (vn > 14 && Math.random() < (full ? 0.45 : 0.35)) this.puncture(i); if (pt.cx > 0) cut(pt.cy > 0 ? 'fwL' : 'fwR', e * 0.3);
      if (full && vn > 20) cut('floor', e * 0.15);
      this.dmgCorner = i; part = 'sus';
    } else if (lx > 0.45) { // nose first: the wing (that side most), then the front suspension, then the floor and cooling
      const near = Math.abs(ly) < 0.18 ? null : left ? 'fwL' : 'fwR';
      if (near) { cut(near, e * 1.15); cut(near === 'fwL' ? 'fwR' : 'fwL', e * (full ? 0.6 : 0.3)); } else { cut('fwL', e * (full ? 1.3 : 1)); cut('fwR', e * (full ? 1.3 : 1)); }
      const sv = full ? Math.max(0, vn - 16) * 0.06 : Math.max(0, vn - 24) * 0.03;
      if (near) { sus(left ? 0 : 1, sv); sus(left ? 1 : 0, sv * 0.4); } else { sus(0, sv); sus(1, sv); }
      if (full && vn > 20) cut('floor', e * 0.25); if (full && vn > 30) cut('pu', (vn - 30) * 0.02);
      part = near || 'fw';
    } else if (lx < -0.45) { // from behind: the rear wing, then the rear corners and, hard enough, the gearbox
      cut('rw', e * (full ? 0.9 : 0.8));
      if (vn > (full ? 16 : 22)) sus(left ? 2 : 3, (vn - (full ? 16 : 22)) * (full ? 0.05 : 0.03));
      if (vn > (full ? 24 : 30)) cut('pu', (vn - (full ? 24 : 30)) * (full ? 0.03 : 0.025));
      part = 'rw';
    } else { // side on: the corner on that side, the floor and sidepod, and maybe a cut tyre
      const i = lx >= 0 ? (left ? 0 : 1) : (left ? 2 : 3);
      sus(i, e * (full ? 0.7 : 0.55)); cut('floor', e * (full ? 0.3 : 0.22)); if (Math.abs(lx) < 0.3) cut('pu', e * 0.05 * k);
      if (vn > 14 && Math.random() < (full ? 0.45 : 0.3)) this.puncture(i);
      part = 'sus'; this.dmgCorner = i;
    }
    this.dmgNews = { part, vn };
    this.checkDnf();
  }
  checkDnf() {
    const D = this.dmg;
    if (this.damageMode === 'real' && !this.dnf) {
      if (D.sus.some((x) => x < DNF_SUS)) this.dnf = 'Suspension damage';
      else if (D.pu <= 0.02) this.dnf = 'Power unit failure';
    }
  }
  // sliding along a wall: the side that touches wears away (wing on that side for the front corners, the corner's
  // suspension), and a long fast scrape can cut a tyre
  scrapeDamage(pt, spd, dt) {
    if (this.damageMode === 'off' || !this.dmg || spd < 12 || !this.isPlayer) return;
    const D = this.dmg, f = dt * (spd / 60), left = pt.cy > 0, front = pt.cx > 0, i = (front ? 0 : 2) + (left ? 0 : 1);
    if (pt.cx > 2.2) D[left ? 'fwL' : 'fwR'] = Math.max(0, D[left ? 'fwL' : 'fwR'] - f * 0.6);
    else if (pt.cx < -2.2) D.rw = Math.max(0, D.rw - f * 0.3);
    else { D.sus[i] = Math.max(0, D.sus[i] - f * 0.25); D.floor = Math.max(0, D.floor - f * 0.08); if (Math.random() < f * 0.5) this.puncture(i); }
    this.scrapeT = (this.scrapeT || 0) + dt; if (this.scrapeT > 0.6) { this.scrapeT = 0; this.dmgNews = { part: 'scrape', vn: spd }; }
    this.checkDnf();
  }
  reset() {
    this.x = 0; this.y = 0; this.h = 0; this.vx = 0; this.vy = 0; this.r = 0; this.delta = 0;
    this.gear = 1; this.rpm = 4000; this.shiftTimer = 0; this.soc = SOC_MAX * 0.8; this.ersMode = 1;
    this.bias = 0.56; this.aeroX = false; this.aeroReq = false; this.overtakeAvail = false; this.overtakeOn = false;
    this.idx = 0; this.d = 0; this.s = 0; this.dist = 0; this.lastS = 0;
    this.tempF = 78; this.tempR = 80; this.wear = 0; this.dmg = freshDamage(); this.dnf = null; this.parked = false;
    this.throttle = 0; this.brake = 0; this.axS = 0; this.ay = 0; this.surface = 'tarmac';
    this.slipF = 0; this.slipR = 0; this.lockF = false; this.lockR = false; this.spin = false;
    this.wheelAng = 0; this.tow = 0; this.dirty = 0; this.impact = 0; this.kerbHit = 0; this.harvesting = false;
    this.reverse = false; this.stopT = 0;
  }
  place(i, lateral, speed = 0) {
    const T = this.track; i = ((i % T.n) + T.n) % T.n;
    this.idx = i;
    this.x = T.px[i] + T.nx[i] * lateral; this.y = T.py[i] + T.ny[i] * lateral;
    this.h = Math.atan2(T.ty[i], T.tx[i]); this.vx = speed; this.vy = 0; this.r = 0; this.delta = 0;
    this.locate(true);
    this.lastS = this.s;
  }
  locate(full) {
    const T = this.track, n = T.n;
    let best = this.idx, bd = Infinity;
    if (full) { const q = trackDistance(T, this.x, this.y, -1, 0, 2); if (q.i >= 0) best = q.i; }
    else {
      for (let k = -14; k <= 14; k++) {
        const j = (this.idx + k + n) % n, d = (T.px[j] - this.x) ** 2 + (T.py[j] - this.y) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
    }
    this.idx = best;
    const dx = this.x - T.px[best], dy = this.y - T.py[best];
    this.d = dx * T.nx[best] + dy * T.ny[best];
    this.s = best * T.ds + dx * T.tx[best] + dy * T.ty[best];
  }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get kmh() { return this.vx * 3.6; }

  step(dt, inp) {
    const p = this.p, T = this.track; this.simT = (this.simT || 0) + dt;
    this.locate(false);
    // --- the road under the car: gravity along its slope, and how hard it presses up (a crest lightens the car, a
    // compression squeezes it, a banked turn holds it)
    let Lk = 1, Fgx = 0, Fgy = 0;
    if (T.hasElev) {
      const R = roadAt(T, this.x, this.y, this.idx), c0 = Math.cos(this.h), s0 = Math.sin(this.h); this.z = R.z;
      const gl = R.gx * c0 + R.gy * s0, gt = -R.gx * s0 + R.gy * c0; // slope along the car (+ uphill) and across it (+ left side up)
      Fgx = -p.m * G * gl; Fgy = -p.m * G * gt;
      const vt = (this.vx * c0 - this.vy * s0) * T.tx[this.idx] + (this.vx * s0 + this.vy * c0) * T.ty[this.idx];
      const axw = this.axS * c0 - (this.ay || 0) * s0, ayw = this.axS * s0 + (this.ay || 0) * c0;
      Lk = clamp(1 + (R.kv * vt * vt - 0.12 * (axw * R.gx + ayw * R.gy)) / G, 0.12, 2.6); // the load a banked turn adds counts for less: tyres grip less per kilo as the load rises
      this.slopeL = gl; this.slopeT = gt;
    } else { this.z = 0; this.slopeL = this.slopeT = 0; }
    this.loadK = Lk;
    // --- surface
    const ad = Math.abs(this.d), side = this.d >= 0 ? 1 : -1, hw = T.hw;
    let smu = 1, sdrag = 0, bump = 0; this.surface = 'tarmac';
    if (ad > hw) {
      if (T.kerb[this.idx] && ad < hw + 1.4) { this.surface = 'kerb'; smu = p.kerbMu || 0.92; bump = 1; }
      else {
        const grav = (side > 0 ? T.gravelL : T.gravelR)[this.idx];
        const kind = grav ? 'gravel' : T.spec.runoff === 'grass' ? 'grass' : 'runoff';
        this.surface = kind;
        if (kind === 'gravel') { smu = 0.45; sdrag = 900; bump = 2; }
        else if (kind === 'grass') { smu = 0.55; sdrag = 220; bump = 1.5; }
        else { smu = 0.95; }
      }
    }
    this.kerbHit = bump;

    // --- driver inputs
    const vxa = Math.abs(this.vx);
    let thr = clamp(inp.throttle, 0, 1), brk = clamp(inp.brake, 0, 1);
    // braking assist: look ahead along the racing line and brake if we arrive faster than the car can slow for it
    if (this.assist.brakeAssist && vxa > 15 && !this.reverse) {
      const n = T.n, D = 26; // a gentle 2.6 g: leaves margin, the player can always brake harder
      let need = 0;
      for (let k = 2; k < 90; k += 3) {
        const j = (this.idx + k) % n, dist = k * T.ds, allow = Math.sqrt(T.lineV[j] * T.lineV[j] * 1.04 + 2 * D * dist);
        if (vxa > allow) need = Math.max(need, clamp((vxa - allow) / 5, 0.35, 1));
      }
      if (need > brk) { brk = need; thr = 0; }
      this.assisting = need > 0;
    } else this.assisting = false;
    // stability control: rear sliding past a small angle -> trim the throttle (the yaw correction comes after the forces)
    const stab = this.assist.stab || 0, slideR = Math.abs(this.slipR || 0) - (stab === 2 ? 0.06 : 0.1);
    if (stab && slideR > 0 && vxa > 8) thr *= clamp(1 - slideR * (stab === 2 ? 9 : 5), 0.15, 1);
    // damage: what is broken changes the handling only in 'real' mode
    const D = this.dmg, real = this.damageMode === 'real';
    const fw = real ? (D.fwL + D.fwR) / 2 : 1, rwH = real ? D.rw : 1, flH = real ? D.floor : 1, puH = real ? D.pu : 1;
    if (this.damageMode !== 'off') for (let i = 0; i < 4; i++) if (D.punct[i]) D.tyre[i] = Math.max(0.05, D.tyre[i] - dt / 4); // a puncture goes down over ~4 s
    const tyreH = real ? D.tyre : [1, 1, 1, 1], susH = real ? D.sus : [1, 1, 1, 1];
    // a pull to one side: a missing wing half, bent toe on a front corner (more under braking), a flat tyre dragging
    const vk = Math.min(1, vxa / 60);
    this.dmgPull = real ? ((D.fwR - D.fwL) * 0.0015 * vk + ((1 - susH[0]) - (1 - susH[1])) * (0.004 + brk * 0.006) + ((1 - susH[3]) - (1 - susH[2])) * 0.002
      + ((1 - tyreH[0]) - (1 - tyreH[1])) * 0.012 * Math.min(1, vxa / 25) + ((1 - tyreH[2]) - (1 - tyreH[3])) * 0.004 * Math.min(1, vxa / 25)) : 0;
    const tgtSteer = clamp(inp.steer, -1, 1) * p.maxSteer;
    // when the rear steps out, the wheel moves faster so on/off keys and buttons can still catch the slide
    let rate = p.steerRate * (1 + (inp.steerFast ? 2 : 0)) * (Math.abs(this.slipR || 0) > 0.08 && vxa > 8 ? 2.5 : 1);
    // keys and touch arrows: letting go, the wheel comes back with the tyres' aligning torque (quicker at speed, slower
    // when the fronts are sliding and the steering has gone light)
    if (inp.selfAlign && Math.abs(tgtSteer) < Math.abs(this.delta) && Math.sign(tgtSteer - this.delta) === -Math.sign(this.delta)) rate *= 1 + clamp(Math.abs(this.steerTq || 0) / 700, 0, 1.6);
    this.delta += clamp(tgtSteer - this.delta, -rate * dt, rate * dt);
    const deltaW = this.delta + (this.dmgPull || 0); // what the front wheels actually point at

    // reverse: hold brake while stationary
    // (in reverse the brake pedal drives backwards; throttle selects first gear again)
    if (inp.noReverse) { this.stopT = 0; this.reverse = false; }
    else if (!this.reverse && vxa < 0.6 && brk > 0.5 && thr < 0.1) { this.stopT += dt; if (this.stopT > 0.7) this.reverse = true; }
    else if (!this.reverse) this.stopT = 0;
    if (this.reverse && thr > 0.1) { this.reverse = false; this.stopT = 0; }
    const revDrive = this.reverse ? brk : 0;
    if (this.reverse) brk = this.vx > 0.5 ? brk : 0;

    // --- gearbox
    const kmh = Math.max(0, this.vx * 3.6);
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    if (this.assist.autoGear) {
      const g = this.gear;
      if (g < 8 && kmh > p.gears[g - 1] * 0.965) this.shift(1);
      else if (g > 1 && kmh < p.gears[g - 2] * (brk > 0.2 ? 0.82 : 0.7)) this.shift(-1);
    } else {
      if (inp.shiftUp) this.shift(1);
      if (inp.shiftDown) this.shift(-1);
    }
    const gmax = p.gears[this.gear - 1];
    this.rpm = clamp((kmh / gmax) * p.redline, 4200, p.redline + 200);
    if (kmh < 20 && thr > 0.2) this.rpm = Math.max(this.rpm, 4200 + thr * 5000);
    const limiter = this.rpm > p.redline;
    if (this.damageMode !== 'off' && !this.assist.autoGear) { D.overRev = limiter && thr > 0.5 ? D.overRev + dt : Math.max(0, D.overRev - dt * 2); if (D.overRev > 2) D.pu = Math.max(0, D.pu - dt * 0.004); } // bouncing off the limiter

    // --- aero (active aero modes + slipstream / dirty air)
    const aeroAllowed = T.aeroZone[this.idx] && brk < 0.05 && Math.abs(this.delta) < 0.04;
    if (this.aeroReq && aeroAllowed) this.aeroX = true;
    if (!aeroAllowed && this.aeroX && (!T.aeroZone[this.idx] || brk > 0.05 || Math.abs(this.delta) > 0.05)) this.aeroX = false;
    if (!this.aeroReq) this.aeroX = false;
    const q = 0.5 * RHO * this.vx * this.vx;
    const bottom = (p.bottomK || 0) * (Math.max(0, Lk - 1.12) * 2 + (this.surface === 'kerb' ? 0.5 : 0) + Math.max(0, this.vx - 75) * 0.01); this.bottoming = bottom > 0.02;
    const clA = p.ClA * (1 - Math.min(0.2, bottom)) * (this.aeroX ? 0.6 : 1) * (1 - this.dirty * 0.18) * (0.88 + 0.12 * fw) * (0.78 + 0.22 * flH); // a broken front wing or floor loses downforce
    const cdA = p.CdA * (this.aeroX ? 0.7 : 1) * (1 - this.tow * 0.28) * (0.86 + 0.14 * rwH); // less rear wing: less drag too
    const balF = p.aeroBal * (0.88 + 0.12 * fw);
    const DfF = q * clA * balF, DfR = q * clA * (1 - balF) * (this.aeroX ? 1.1 : 1) * (0.7 + 0.3 * rwH);
    const drag = q * cdA;

    // --- loads with longitudinal weight transfer
    let FzF = (p.m * G * p.b * Lk) / p.L + DfF - (p.m * this.axS * p.h) / p.L;
    let FzR = (p.m * G * p.a * Lk) / p.L + DfR + (p.m * this.axS * p.h) / p.L;
    FzF = Math.max(FzF, 200); FzR = Math.max(FzR, 200);
    const cp = COMPOUNDS[this.compound], wet = this.env ? this.env.wet : 0;
    this.gripWet = wetGrip(this.compound, wet);
    const gripT = (t) => (0.86 + 0.14 * Math.exp(-(((t - cp.temp) / 28) ** 2))) * cp.grip;
    const wearF = 1 - 0.09 * this.wear - 0.5 * Math.max(0, this.wear - 0.65) ** 2 * 4; // grip falls away sharply past ~65 % wear
    // bent suspension and flat tyres cost grip on their axle
    const axF = (1 - 0.2 * (2 - susH[0] - susH[1]) / 2) * (0.4 + 0.6 * Math.min(tyreH[0], tyreH[1])), axR = (1 - 0.25 * (2 - susH[2] - susH[3]) / 2) * (0.4 + 0.6 * Math.min(tyreH[2], tyreH[3]));
    this.dmgPace = real ? Math.sqrt(Math.min(axF, axR)) * (0.92 + 0.08 * fw) * (0.94 + 0.06 * flH) * (0.95 + 0.05 * rwH) : 1;
    // lateral load transfer: the body rolls into the corner (with a short lag) and moves load to the outside tyres; a tyre
    // gives less grip per kilo as its load rises, so the axle carrying more of the transfer loses grip. The split between
    // front and rear (roll stiffness) sets the balance; the standard split is the car the speed profile was made for
    this.ayR = lerp(this.ayR || 0, this.ay || 0, Math.min(1, dt / p.rollTau));
    let ltF = 1, ltR = 1;
    if (p.rollF !== ROLL_F0) { const dLT = (p.m * Math.abs(this.ayR) * p.h) / p.tw; ltF = 1 - p.kLT * (ltShare(p.rollF, FzF, dLT) - ltShare(ROLL_F0, FzF, dLT)); ltR = 1 - p.kLT * (ltShare(1 - p.rollF, FzR, dLT) - ltShare(1 - ROLL_F0, FzR, dLT)); } // the standard split: no change, no work
    const capF = p.mu * smu * gripT(this.tempF) * wearF * this.gripWet * FzF * axF * ltF;
    const capR = p.mu * p.muR * smu * gripT(this.tempR) * wearF * this.gripWet * FzR * axR * ltR;

    // --- power unit
    const curve = clamp(0.55 + 0.45 * Math.sin(((this.rpm - 4000) / 8000) * Math.PI * 0.62), 0.3, 1);
    let Pice = p.Pice * curve * (0.65 + 0.35 * puH); // a damaged power unit loses power
    const mode = ERS_MODES[this.ersMode];
    let deployCap = this.overtakeOn && this.overtakeAvail ? 350e3 : mode.deploy;
    // 2026-style taper of electric deployment at very high speed
    const taperStart = this.overtakeOn && this.overtakeAvail ? 320 : 290;
    if (kmh > taperStart) deployCap *= clamp(1 - (kmh - taperStart) / 60, 0, 1);
    let Pers = this.soc > 0 && kmh > 3 ? deployCap * thr : 0;
    if (this.shiftTimer > 0.04) { Pice *= 0.3; Pers *= 0.3; }
    let Fdrive;
    if (this.reverse) Fdrive = -revDrive * 3500 * (vxa < 7 ? 1 : 0);
    else Fdrive = limiter ? 0 : (thr * Pice + Pers) / Math.max(vxa, 9);
    // engine braking + coast harvest
    let harvest = 0;
    if (thr < 0.05 && !this.reverse && vxa > 5) { Fdrive -= 1400 + mode.harvestCoast / Math.max(vxa, 10); harvest += mode.harvestCoast; }

    // --- brakes
    const sgn = this.vx >= 0 ? 1 : -1;
    const Fb = brk * p.brakeMax * (vxa < 0.3 ? 0 : 1);
    let FxF = -Fb * this.bias * sgn;
    let FxR = Fdrive - Fb * (1 - this.bias) * sgn;

    // rear braking is partly done by the MGU-K
    if (Fb > 0 && vxa > 5) harvest += Math.min(350e3, Fb * (1 - this.bias) * vxa * 0.9);
    this.harvesting = harvest > 60e3;
    this.soc = clamp(this.soc + (harvest * 0.8 - Pers) * dt, 0, SOC_MAX);

    // --- assists
    const lgF = p.longF || 1, lgR = p.longR || 1, trR = p.tracR || 1; // setup: camber costs braking grip, the differential sets traction
    this.absAct = false; this.tcAct = false; // ABS or traction control working this step (trigger rumble, the HUD)
    if (this.assist.abs) {
      if (Math.abs(FxF) > capF * lgF * 0.96) { FxF = Math.sign(FxF) * capF * lgF * 0.96; this.absAct = true; }
      if (FxR < 0 && -FxR > capR * lgR * 0.96) { FxR = -capR * lgR * 0.96; this.absAct = true; }
    }
    const tc = this.assist.tc; // 0 off, 1 medium, 2 full
    if (tc > 0 && FxR > 0) {
      // traction control leaves room for the cornering force the rear is carrying
      const latUse = Math.min(Math.abs(this.FyRprev || 0), capR * 0.97);
      const lim = Math.max(capR * 0.2, Math.sqrt(capR * capR - latUse * latUse) * (tc === 2 ? 0.9 : 1.0) * trR);
      if (FxR > lim) { FxR = tc === 2 ? lim : lerp(FxR, lim, 0.7); this.tcAct = true; }
    }
    // --- lock-up / wheelspin
    let latF, latR;
    this.lockF = Math.abs(FxF) > capF * lgF && vxa > 2;
    if (this.lockF) { FxF = Math.sign(FxF) * capF * 0.82; latF = capF * 0.28; }
    else latF = Math.sqrt(Math.max(0, capF * capF - FxF * FxF));
    const overR = Math.abs(FxR) > capR * (FxR > 0 ? trR : lgR) && vxa > 1;
    this.lockR = overR && FxR < 0; this.spin = overR && FxR > 0;
    if (overR) { FxR = Math.sign(FxR) * capR * 0.84; latR = capR * 0.3; }
    else latR = Math.sqrt(Math.max(0, capR * capR - FxR * FxR));

    // --- tyre lateral forces
    const vxs = Math.max(vxa, 1.5);
    const aF = Math.atan2(this.vy + p.a * this.r, vxs) - deltaW * sgn;
    const aR = Math.atan2(this.vy - p.b * this.r, vxs);
    const FyF = -latF * Math.sin(p.CF * Math.atan(p.BF * aF)), FyR = -latR * Math.sin(p.CR * Math.atan(p.BR * aR));
    this.slipF = aF; this.slipR = aR; this.FyRprev = FyR;
    // steering torque (the force feedback signal): the front tyres' aligning torque, their lateral force times a trail
    // that collapses as the slip nears the tyre's peak (so the wheel goes light when the front washes out), plus the
    // caster's mechanical trail. N m at the kingpins; + turns the wheel to the left
    if (p._aPk !== p.BF + p.CF * 7 + p.BR * 31 + p.CR * 131) { p._aPk = p.BF + p.CF * 7 + p.BR * 31 + p.CR * 131; p._aPkF = Math.tan(Math.PI / (2 * p.CF)) / p.BF; p._aPkR = Math.tan(Math.PI / (2 * p.CR)) / p.BR; } // the slip at each tyre's peak (changes only with the setup)
    const aPkF = p._aPkF, aPkR = p._aPkR;
    this.frontSat = Math.abs(aF) / aPkF; this.rearSat = Math.abs(aR) / aPkR;
    this.steerTq = -FyF * (0.045 * Math.max(-0.15, 1 - this.frontSat * 0.95) + 0.018);

    // --- body forces
    const cd = Math.cos(deltaW), sd = Math.sin(deltaW);
    const v = Math.hypot(this.vx, this.vy);
    const rolling = (p.rr * (FzF + FzR) + sdrag * Math.min(v, 20) / 20 * 3 + (4 - tyreH[0] - tyreH[1] - tyreH[2] - tyreH[3]) * 700) * (vxa > 0.1 ? 1 : 0); // running on a rim drags
    const Fx = FxF * cd - FyF * sd + FxR - (drag + rolling) * sgn + Fgx;
    const Fy = FxF * sd + FyF * cd + FyR + Fgy;
    // the differential: more locking resists the car turning (stability, understeer on power or on the overrun), less lets
    // it rotate. Relative to the standard setup, so the standard car is unchanged
    const Mdiff = -this.r * (FxR > 0 ? (p.diffOn ?? 0.5) - 0.5 : (p.diffOff ?? 0.5) - 0.5) * Math.abs(FxR) * 0.12;
    const Mz = p.a * (FyF * cd + FxF * sd) - p.b * FyR + Mdiff;
    const ax = Fx / p.m + this.vy * this.r, ay = Fy / p.m - this.vx * this.r;
    const prevVx = this.vx;
    let Mzs = 0;
    if (stab && slideR > 0 && vxa > 8) { // like a road car's ESC: a counter-yaw toward the path the wheels are steering
      const rKin = (this.vx * Math.tan(this.delta)) / p.L;
      Mzs = -(this.r - rKin) * p.Iz * (stab === 2 ? 7 : 3.5) * Math.min(1, slideR * 12);
    }
    this.vx += ax * dt; this.vy += ay * dt; this.r += ((Mz + Mzs) / p.Iz) * dt;
    if (!this.reverse && prevVx > 0 && this.vx < 0 && Fdrive <= 0) this.vx = 0;
    if (this.reverse && prevVx < 0 && this.vx > 0 && revDrive < 0.05) this.vx = 0;
    // low-speed: blend to kinematic model to avoid the singular slip angles
    if (vxa < 5) {
      const k = (1 - vxa / 5) * 0.35;
      const rk = (this.vx * Math.tan(this.delta)) / p.L;
      this.r = lerp(this.r, rk, k); this.vy = lerp(this.vy, rk * p.b, k);
    }
    // at rest: the brakes hold it (on a slope too); with no brake on a slope it rolls
    if (vxa < 0.3 && thr < 0.05 && revDrive < 0.05 && (brk > 0.2 || Math.abs(this.slopeL) < 0.015)) { this.vx *= 0.9; this.vy *= 0.9; this.r *= 0.9; if (brk > 0.2 && Math.abs(this.slopeL) >= 0.015) this.vx = 0; }

    this.axS = lerp(this.axS, Fx / p.m, Math.min(1, dt * 12));
    this.ay = Fy / p.m;
    const ch = Math.cos(this.h), sh = Math.sin(this.h);
    this.x += (this.vx * ch - this.vy * sh) * dt;
    this.y += (this.vx * sh + this.vy * ch) * dt;
    this.h += this.r * dt;
    this.wheelAng += (this.vx / p.wheelR) * dt;

    // --- tyres: heat and wear
    const slipP = Math.abs(FyF * aF * vxs) + Math.abs(FyR * aR * vxs) + (this.lockF || this.lockR || this.spin ? 60e3 : 0);
    const cool = 0.004 * (1 + vxa / 80), roll = 0.005 * vxa;
    const hot = (t) => Math.max(0, t - 125) * 0.08; // past ~125 C the rubber sheds heat fast (and grip already falls)
    this.tempF += (roll + Math.abs(FyF * aF * vxs) * 1e-4 * (p.heatF || 1) + (this.lockF ? 20 : 0) - (this.tempF - 30) * cool - hot(this.tempF)) * dt;
    this.tempR += (roll + Math.abs(FyR * aR * vxs) * 1e-4 * (p.heatR || 1) + (this.spin || this.lockR ? 20 : 0) - (this.tempR - 30) * cool - hot(this.tempR)) * dt;
    this.tempF = clamp(this.tempF, 15, 150); this.tempR = clamp(this.tempR, 15, 150);
    this.wear = Math.min(1, this.wear + slipP * 1.1e-8 * cp.wear * (this.wearMul || 1) * (this.setupWear || 1) * (cp.wet && wet < 0.2 ? 3.5 : 1) * dt); // wet tyres overheat on a dry track

    // --- walls: the car's real outline touches them (nose, front wing tips, the four tyres, rear wing corners), not
    // just its centre, so an angled hit stops the bodywork at the barrier face instead of sinking in up to the cockpit
    this.locate(false);
    this.impact = 0;
    const nearWall = Math.abs(this.d) > Math.min(T.wallL[this.idx], T.wallR[this.idx]) - 3.6;
    if (nearWall) {
      const hc = Math.cos(this.h), hs = Math.sin(this.h); let best = null;
      for (const [cx, cy] of CAR_OUTLINE) {
        const px = this.x + hc * cx - hs * cy, py = this.y + hs * cx + hc * cy;
        const ox = px - T.px[this.idx], oy = py - T.py[this.idx], k = Math.round((ox * T.tx[this.idx] + oy * T.ty[this.idx]) / T.ds);
        const j = (((this.idx + k) % T.n) + T.n) % T.n, dd = (px - T.px[j]) * T.nx[j] + (py - T.py[j]) * T.ny[j];
        const pen = Math.abs(dd) - (dd >= 0 ? T.wallL : T.wallR)[j];
        if (pen > 0 && (!best || pen > best.pen)) best = { pen, j, s2: dd >= 0 ? 1 : -1, cx, cy };
      }
      if (best) {
        const nx = T.nx[best.j] * best.s2, ny = T.ny[best.j] * best.s2, pen = best.pen;
        this.x -= nx * pen; this.y -= ny * pen;
        const rx = hc * best.cx - hs * best.cy, ry = hs * best.cx + hc * best.cy; // contact point from the centre (world)
        let wx = this.vx * hc - this.vy * hs, wy = this.vx * hs + this.vy * hc;
        const vn = (wx - this.r * ry) * nx + (wy + this.r * rx) * ny; // how fast that point closes on the wall
        if (vn > 0) {
          const spd = Math.hypot(wx, wy), glancing = vn < spd * 0.42; // under ~25 degrees: slide along the wall
          const cvn = Math.max(0, wx * nx + wy * ny); // the centre's own approach
          if (glancing) {
            wx -= 1.08 * cvn * nx; wy -= 1.08 * cvn * ny; const scrub = 1 - clamp(vn * 0.015, 0, 0.15); wx *= scrub; wy *= scrub;
            // the car turns along the wall instead of being kicked back across the track
            const along = Math.atan2(wy, wx); if (Math.hypot(wx, wy) > 3 && Math.cos(along - this.h) > 0) this.h += angleDiff(along, this.h) * 0.6;
            this.r *= 0.15;
            this.scrapeDamage(best, spd, dt);
            // a fast glancing hit still hurts the side that touched: counted once per brush with the wall, by sliding speed
            if (this.isPlayer && spd > 25 && (this.lastBrush === undefined || this.simT - this.lastBrush > 0.6)) { this.damageHit(nx * hc + ny * hs, -nx * hs + ny * hc, vn + spd * 0.15, 'wall', best); }
            this.lastBrush = this.simT;
          } else {
            const hitN = Math.max(cvn, vn * 0.8);
            wx -= 1.3 * hitN * nx; wy -= 1.3 * hitN * ny;
            const scrub = 1 - clamp(vn * 0.03, 0, 0.45); wx *= scrub; wy *= scrub;
            // a corner hit turns the car about the contact point (nose-first into a wall swings the tail round), held back
            // so a hit doesn't become an endless spin
            const lever = rx * ny - ry * nx;
            this.r = this.r * 0.5 - clamp(lever * vn * 0.055, -2.2, 2.2);
          }
          if (vn > 30) this.bigHit = vn;
          const c2 = Math.cos(this.h), s2h = Math.sin(this.h);
          this.vx = wx * c2 + wy * s2h; this.vy = -wx * s2h + wy * c2; this.impact = vn; this.impactPeak = Math.max(this.impactPeak || 0, vn); // kept until the screen has shown it
          // damage where it touched: the contact point's direction in the car's frame (a glancing touch does nothing)
          if (vn > 12) this.damageHit(best.cx / 3.2, best.cy, vn, 'wall', best);
        }
        this.locate(false);
      }
    }
    // --- progress
    let dS = this.s - this.lastS;
    if (dS < -T.length / 2) dS += T.length; else if (dS > T.length / 2) dS -= T.length;
    this.dist += dS; this.lastS = this.s;
    this.throttle = thr; this.brake = brk;
  }
  shift(dir) {
    const g = this.gear + dir;
    if (g < 1 || g > 8 || this.shiftTimer > 0) return;
    // protect the engine on manual downshifts
    if (dir < 0 && this.vx * 3.6 > this.p.gears[g - 1] * 1.02) return;
    // a damaged gearbox sometimes misses a shift (a short loss of drive, then it tries again)
    if (this.damageMode === 'real' && this.dmg && this.dmg.pu < 0.5 && Math.random() < (0.5 - this.dmg.pu) * 0.5) { this.shiftTimer = 0.35; this.missedGear = true; return; }
    this.gear = g; this.shiftTimer = 0.09; this.justShifted = dir;
  }
}

// car-to-car contact with each car's real footprint: a box from the rear wing to the nose tip (-2.65 .. +3.15 m) and
// wheel to wheel (2.04 m). Separating-axis test for the overlap, the bodies pushed apart completely (they touch, they
// don't sink into each other), then a rigid-body impulse at the contact point: almost no bounce (carbon fibre doesn't
// spring back), friction where they scrape, and a turn about the contact point (a nose into a sidepod swings both
// cars). Damage lands where they touched.
const CAR_BOX = { off: 0.25, hl: 2.9, hw: 1.02 }, CAR_E = 0.08, CAR_MU = 0.25;
function collideCars(cars) {
  const { off, hl, hw } = CAR_BOX;
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const A = cars[i], B = cars[j];
    if (Math.abs(A.x - B.x) > 7 || Math.abs(A.y - B.y) > 7) continue;
    const au = [Math.cos(A.h), Math.sin(A.h)], av = [-au[1], au[0]], bu = [Math.cos(B.h), Math.sin(B.h)], bv = [-bu[1], bu[0]];
    const ac = [A.x + au[0] * off, A.y + au[1] * off], bc = [B.x + bu[0] * off, B.y + bu[1] * off], d = [bc[0] - ac[0], bc[1] - ac[1]];
    // separating axes: each car's forward and side directions; the smallest overlap is the way out
    let pen = Infinity, n = null, fromA = true;
    for (const [ax, own] of [[au, 1], [av, 1], [bu, 0], [bv, 0]]) {
      const ra = hl * Math.abs(au[0] * ax[0] + au[1] * ax[1]) + hw * Math.abs(av[0] * ax[0] + av[1] * ax[1]);
      const rb = hl * Math.abs(bu[0] * ax[0] + bu[1] * ax[1]) + hw * Math.abs(bv[0] * ax[0] + bv[1] * ax[1]);
      const dp = d[0] * ax[0] + d[1] * ax[1], o = ra + rb - Math.abs(dp);
      if (o <= 0) { pen = -1; break; }
      if (o < pen) { pen = o; const sg = dp >= 0 ? 1 : -1; n = [ax[0] * sg, ax[1] * sg]; fromA = !!own; }
    }
    if (pen <= 0) continue;
    // the contact point: the corner of one car that is deepest inside the other
    const corners = (c, u, v) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => [c[0] + u[0] * hl * sx + v[0] * hw * sy, c[1] + u[1] * hl * sx + v[1] * hw * sy]);
    let p;
    if (fromA) { let bd = Infinity; for (const q of corners(bc, bu, bv)) { const k = q[0] * n[0] + q[1] * n[1]; if (k < bd) { bd = k; p = q; } } }
    else { let bd = -Infinity; for (const q of corners(ac, au, av)) { const k = q[0] * n[0] + q[1] * n[1]; if (k > bd) { bd = k; p = q; } } }
    // push the two apart completely, shared by mass
    const mA = A.p.m, mB = B.p.m, wa = mB / (mA + mB), wb = mA / (mA + mB);
    A.x -= n[0] * pen * wa; A.y -= n[1] * pen * wa; B.x += n[0] * pen * wb; B.y += n[1] * pen * wb;
    const rA = [p[0] - A.x, p[1] - A.y], rB = [p[0] - B.x, p[1] - B.y], cr = (r, v) => r[0] * v[1] - r[1] * v[0];
    const va = toWorld(A), vb = toWorld(B);
    const vap = [va[0] - A.r * rA[1], va[1] + A.r * rA[0]], vbp = [vb[0] - B.r * rB[1], vb[1] + B.r * rB[0]];
    const rel = [vbp[0] - vap[0], vbp[1] - vap[1]], relN = rel[0] * n[0] + rel[1] * n[1];
    if (relN >= 0) continue; // already parting
    const IA = A.p.Iz, IB = B.p.Iz, rnA = cr(rA, n), rnB = cr(rB, n);
    const jn = (-(1 + CAR_E) * relN) / (1 / mA + 1 / mB + (rnA * rnA) / IA + (rnB * rnB) / IB);
    const t = [-n[1], n[0]], relT = rel[0] * t[0] + rel[1] * t[1], rtA = cr(rA, t), rtB = cr(rB, t);
    const jt = clamp(-relT / (1 / mA + 1 / mB + (rtA * rtA) / IA + (rtB * rtB) / IB), -CAR_MU * jn, CAR_MU * jn);
    const J = [n[0] * jn + t[0] * jt, n[1] * jn + t[1] * jt];
    va[0] -= J[0] / mA; va[1] -= J[1] / mA; vb[0] += J[0] / mB; vb[1] += J[1] / mB;
    // the turn from a hit grows with how hard it was: a light touch barely moves a car, a proper hit can spin it
    // AI against AI: the same solid contact, but light racing touches stay racing incidents (less turn, damage only
    // from a harder hit), so the field doesn't pile up; any contact involving the player is the full thing
    const you = A.isPlayer || B.isPlayer;
    const hard = clamp((-relN - 4) / 8, 0.12, 1) * (you ? 1 : 0.35), dA = clamp(-cr(rA, J) / IA * hard, -1.8, 1.8), dB = clamp(cr(rB, J) / IB * hard, -1.8, 1.8);
    A.r = clamp(A.r + dA, -4, 4); B.r = clamp(B.r + dB, -4, 4);
    fromWorld(A, va); fromWorld(B, vb);
    A.impact = Math.max(A.impact, -relN); B.impact = Math.max(B.impact, -relN); A.impactPeak = Math.max(A.impactPeak || 0, -relN); B.impactPeak = Math.max(B.impactPeak || 0, -relN);
    // damage where they touched, scaled like a wall hit
    if (-relN > (you ? 8 : 12)) {
      const vn = 12 + (-relN - (you ? 8 : 12)) * 1.15, loc = (c, x, y) => [x * Math.cos(c.h) + y * Math.sin(c.h), -x * Math.sin(c.h) + y * Math.cos(c.h)];
      const [alx, aly] = loc(A, n[0], n[1]), [blx, bly] = loc(B, -n[0], -n[1]);
      const [acx, acy] = loc(A, rA[0], rA[1]), [bcx, bcy] = loc(B, rB[0], rB[1]);
      const kind = you ? 'carYou' : 'car';
      A.damageHit(alx, aly, vn, kind, { cx: acx, cy: acy }); B.damageHit(blx, bly, vn, kind, { cx: bcx, cy: bcy });
    }
  }
}
function toWorld(c) { const ch = Math.cos(c.h), sh = Math.sin(c.h); return [c.vx * ch - c.vy * sh, c.vx * sh + c.vy * ch]; }
function fromWorld(c, w) { const ch = Math.cos(c.h), sh = Math.sin(c.h); c.vx = w[0] * ch + w[1] * sh; c.vy = -w[0] * sh + w[1] * ch; }

// ---- AI driver ------------------------------------------------------------
class AIDriver {
  constructor(car, skill, seed) {
    this.car = car; this.skill = skill; this.rng = mulberry32(seed);
    this.lat = 0; this.latT = 0; this.stuckT = 0; this.react = 0.18 + this.rng() * 0.25;
    this.pace = 0.97 + (skill - 0.95) * 0.6;
    this.noise = 0; this.noiseT = 0;
    // personality: how hard this driver attacks and defends, and how much room they leave (0 careful .. 1 aggressive)
    this.aggr = 0.2 + this.rng() * 0.65;
    this.passCar = null; this.passSide = 0; this.defT = 0; this.defMoved = false; this.errT = 0; this.errK = 1; this.inBZ = false;
    // composure: how a driver copes with a car right behind (0 cracks, 1 ice cold)
    this.composure = 0.15 + this.rng() * 0.8; this.slideT = 0; this.yieldT = 0;
  }
  // metres to the next braking zone along the racing line (or far)
  brakeAhead(maxM) {
    const c = this.car, T = c.track, v0 = T.lineV[c.idx];
    for (let m = 6; m < maxM; m += 6) if (T.lineV[(c.idx + Math.round(m / T.ds)) % T.n] < v0 * 0.86) return m;
    return maxM;
  }
  // a rival fights harder when the player is close
  aggrNow(race) {
    const c = this.car;
    if (race && race.rivalCode && c.driver.code === race.rivalCode && race.player && Math.abs(race.player.dist - c.dist) < 60) return 0.95;
    return this.aggr;
  }
  // the inside of the next corner (from where the racing line sits at its apex): +1 left, -1 right, 0 none close
  insideAhead(from, to) {
    const c = this.car, T = c.track, n = T.n; let best = 0, bj = -1;
    for (let k = Math.round(from / T.ds); k <= Math.round(to / T.ds); k += 3) { const j = (c.idx + k) % n, kk = Math.abs(T.lineK[j]); if (kk > best) { best = kk; bj = j; } }
    if (bj < 0 || best < 1 / 400 || Math.abs(T.lineO[bj]) < 1) return 0;
    return Math.sign(T.lineO[bj]);
  }
  control(dt, cars, race) {
    const c = this.car, T = c.track, n = T.n, v = Math.max(c.vx, 0);
    const inp = { steer: 0, throttle: 0, brake: 0, steerFast: true };
    if (race && race.phase !== 'green') { inp.brake = 1; return inp; }
    if (race && race.greenT < this.react) { inp.brake = 1; return inp; }
    // ---- racecraft: who is ahead in my lane, who is alongside, who is attacking from behind ----
    const lim = T.hw - 1.3, aggr = this.aggrNow(race), L = 5.8; // L: a car's length
    // practice traffic (cars spread round the lap, on all sorts of laps and speeds): extra care, measured round the lap.
    // Races keep the racecraft as tuned (these measures cost more contacts than they save in a close pack)
    const prac = !!race && race.mode === 'practice';
    let blocked = null, gapAhead = Infinity, attacker = null, attackGap = Infinity; const side = [];
    const myO = T.lineO[c.idx] + this.lat;
    for (const o of cars) {
      if (o === c || o.parked || o.pit) continue;
      const ds = prac ? lapGap(o.dist - c.dist, T.length) : o.dist - c.dist; // practice: where it is on the track, whichever lap it is on
      if (Math.abs(ds) < L && Math.abs(o.d - c.d) < 4.5) side.push(o);                     // overlapping: alongside
      else if (ds >= L) {
        // a car ahead in my path: looked for further out the faster I'm closing on it (2.2 s of warning, at least 45 m), and
        // judged by where my line will be when I get there, not where it is here
        // (a much slower car, say one rejoining from the run-off, counts from further to the side)
        const cl = prac ? Math.max(0, c.vx - o.vx) : 0; if (ds < Math.max(45, 15 + cl * 2.2) && Math.abs(o.d - (prac ? T.lineO[o.idx] + this.lat : myO)) < (prac ? 2.6 + clamp((cl - 10) / 20, 0, 1) * 1.4 : 2.5) && ds < gapAhead) { gapAhead = ds; blocked = o; }
      }
      else if (ds <= -L && ds > -25 && o.vx > c.vx - 1 && -ds < attackGap) { attackGap = -ds; attacker = o; }
    }
    // debris on the racing line: steer round it like a slow car
    let debris = null;
    if (race && race.debris && race.debris.length) {
      for (const b of race.debris) {
        let ds = b.s - c.s; if (ds < -T.length / 2) ds += T.length; if (ds < 0 || ds > 70) continue;
        if (Math.abs(b.d - myO) < 1.6) { debris = b; break; }
      }
    }
    let want = null; // where across the track this driver wants to be (absolute), or null for the racing line
    const lapped = race && race.beingLapped(c);
    if (debris) want = debris.d - myO > 0 ? debris.d - 3 : debris.d + 3;
    else if (blocked && !lapped) {
      // attack: closing on the car ahead, go for the inside of the next corner (or the other side if there's no room) and
      // stay committed to it while the move is on
      const closing = c.vx - blocked.vx > 0.4 || gapAhead < 14 || (blocked.dmgPace || 1) < 0.97;
      if (closing) {
        if (this.passCar !== blocked) { this.passCar = blocked; const ins = this.insideAhead(20, 160); this.passSide = ins || (c.d >= blocked.d ? 1 : -1); }
        const gapW = 2.55 + 0.35 * (1 - aggr);
        let tgt = blocked.d + this.passSide * gapW;
        if (Math.abs(tgt) > lim) { this.passSide = -this.passSide; tgt = blocked.d + this.passSide * gapW; }
        want = Math.abs(tgt) <= lim + 0.3 ? tgt : null; // no room either side: sit behind and wait
        // on a straight, stay in the slipstream and only pull out late, before the braking zone (or when right on its gearbox)
        const bzA = this.brakeAhead(240);
        if (want !== null && bzA > 150 + aggr * 30 && gapAhead > 9 && Math.abs(T.lineK[c.idx]) < 1 / 600 && (!prac || (blocked.vx > 40 && c.vx - blocked.vx < 8))) want = blocked.d; // practice: never tuck in behind a slow or stopped car
      }
    } else this.passCar = null;
    // defend: a car close behind before a braking zone; one move to cover the inside, then hold it to the corner
    const inCorner = Math.abs(T.lineK[c.idx]) > 1 / 250;
    if (inCorner) this.defMoved = false;
    if (!want && attacker && !lapped && aggr > 0.35 && !this.defMoved && attackGap < 16) {
      const ins = this.insideAhead(30, 140);
      if (ins) { this.defMoved = true; this.defT = 2.5 + aggr * 2; this.defSide = ins; }
    }
    if (this.defT > 0) { this.defT -= dt; if (!want) want = this.defSide * lim * (0.45 + 0.35 * aggr); }
    if (lapped && !want) want = -Math.sign(T.lineO[c.idx] || 1) * lim * 0.6; // blue flag: off the racing line
    // alongside: never squeeze a car that is there; leave it a car's width (careful drivers a little more)
    let target = want !== null ? want : T.lineO[c.idx]; // otherwise the racing line
    let squeezed = false;
    for (const o of side) {
      const sg = Math.sign(o.d - c.d) || 1, minSep = 2.25 + 0.35 * (1 - aggr), bound = o.d - sg * minSep;
      if (sg > 0 ? target > bound : target < bound) { target = bound; }
      if (Math.abs(bound) > lim + 0.8) squeezed = true;
    }
    this.latT = clamp(target, -lim, lim) - T.lineO[c.idx];
    const latRate = prac && blocked && c.vx - blocked.vx > 15 && gapAhead < 90 ? 4.5 : 2.4; // coming up fast on a much slower car: move over sooner
    this.lat += clamp(this.latT - this.lat, -latRate * dt, latRate * dt);
    const absLat = clamp(T.lineO[c.idx] + this.lat, -lim, lim);
    this.lat = absLat - T.lineO[c.idx];
    this.squeezed = squeezed;

    // feed-forward curvature + heading + cross-track (Stanley-style) control
    const j0 = (c.idx + Math.round((v * 0.15) / T.ds) + 1) % n;
    const ja = (j0 - 2 + n) % n, jb = (j0 + 2) % n;
    const lineH = Math.atan2(T.ly[jb] - T.ly[ja], T.lx[jb] - T.lx[ja]);
    const hErrL = angleDiff(lineH, c.h);
    const eLat = T.lineO[c.idx] + this.lat - c.d;
    const kap = T.lineK[j0];
    const sl = Math.abs(c.slipR) > 0.05 ? c.slipR - Math.sign(c.slipR) * 0.05 : 0;
    let delta = Math.atan(c.p.L * kap) + 0.0007 * v * v * kap + 0.8 * hErrL + Math.atan((0.9 * eLat) / (v + 4)) + clamp(sl, -0.25, 0.25) * 0.8;
    inp.steer = clamp(delta / c.p.maxSteer, -1, 1);

    // speed target from the profile, with traffic and per-corner variation
    this.noiseT -= dt; if (this.noiseT < 0) { this.noiseT = 2 + this.rng() * 3; this.noise = (this.rng() - 0.5) * 0.012; }
    const look = Math.round((v * 0.25) / T.ds) + 2;
    let vT = Infinity;
    for (let m = 0; m <= look; m += 2) vT = Math.min(vT, T.lineV[(c.idx + m) % n]);
    vT *= this.pace * (1 + this.noise) * (race ? race.aiPace : 1) * (this.cool ? 0.7 : 1);
    vT *= 1 - Math.min(0.15, Math.abs(this.lat) * 0.012);
    // following: brake early enough not to run into the car ahead (bumper gap, closing speed, the braking it has)
    if (blocked && (Math.abs(blocked.d - c.d) < 2.4 || (prac && Math.abs(blocked.d - absLat) < 2.4))) { // in my lane now (practice: or where I'm heading)
      const closing = c.vx - blocked.vx, room = gapAhead - 6.2;
      if (closing > 0 && room < (closing * closing) / (2 * 16) + 2) vT = Math.min(vT, blocked.vx + Math.max(0, room) * 0.6);
      if (room < 1.5) vT = Math.min(vT, blocked.vx - 1);
      // too close to stop in the usual way (a car braking early, spinning, stopping): full brakes at once
      this.emerg = prac && closing > 2 && room < (closing * closing) / (2 * 30) + 3;
    } else this.emerg = false;
    // practice: no racing. Behind your car the AI keeps its distance (about 35 m) and passes on a straight
    if (race && race.mode === 'practice' && blocked && blocked === race.player && gapAhead < 35 && this.brakeAhead(200) < 160) vT = Math.min(vT, Math.max(0, blocked.vx + (gapAhead - 35) * 0.25)); // drop back to open the gap
    if (this.squeezed) vT *= 0.95; // no room alongside: lift and tuck in behind
    // side by side into a corner: the car on the inside has the corner; the outside car that is not ahead backs out
    // (a car ahead on the outside keeps it and the inside car gives it room)
    this.yieldT -= dt;
    if (side.length && race && race.phase === 'green') {
      const bzS = this.brakeAhead(120), ins = bzS < 110 ? this.insideAhead(5, 130) : 0;
      if (ins) for (const o of side) {
        const myInside = Math.sign(c.d - o.d) === ins, ahead = c.dist - o.dist;
        if ((!myInside && ahead < L * 0.45) || (myInside && ahead < -L * 0.6)) { this.yieldT = 0.9; break; }
      }
    }
    if (this.yieldT > 0) vT *= 0.92;
    // mistakes: at a braking zone, sometimes too fast in (running wide or worse): likelier for lower-rated drivers,
    // on worn tyres, and with a car right behind
    const bz = T.lineV[(c.idx + look * 2) % n] < T.lineV[c.idx] * 0.8;
    if (bz && !this.inBZ) {
      this.inBZ = true;
      const pressure = attacker && attackGap < 12 ? 1 : 0, p = (0.008 + Math.max(0, 1 - this.skill) * 0.5 + (c.wear || 0) * 0.05 + pressure * 0.04 * (1.25 - this.composure)) * 0.6;
      if (race && race.phase === 'green' && !race.sc && this.rng() < p) { this.errT = 1.4 + this.rng() * 1.0; this.errK = 1.03 + this.rng() * 0.04; }
    } else if (!bz) this.inBZ = false;
    if (this.errT > 0) { this.errT -= dt; vT *= this.errK; }
    // on a corner exit, now and then too much throttle too early: a slide that costs a little time
    if (!bz && Math.abs(T.lineK[c.idx]) > 1 / 120 && race && race.phase === 'green' && this.slideT <= 0 && this.rng() < dt * (0.004 + (attacker && attackGap < 10 ? 0.01 * (1.2 - this.composure) : 0) + (c.wear || 0) * 0.006)) this.slideT = 0.5 + this.rng() * 0.6;
    if (this.slideT > 0) { this.slideT -= dt; vT *= 0.96; }
    // strategy: saving tyres (a little slower), pushing (attacking or defending in the closing laps)
    if (c.tyreSave) vT *= 1 - 0.01 * c.tyreSave;
    vT *= Math.pow(c.gripWet ?? 1, 0.7); // slower where the grip is lower (rain)
    vT *= c.dmgPace ?? 1; // and with a damaged car
    if (race && race.vsc) vT = Math.min(vT, race.vscCap(c));
    if (race && race.sc && race.scLimit) vT = Math.min(vT, race.scLimit(c));
    if (lapped) vT *= 0.94; // blue flag: back off to let the leaders by
    const err = vT - v;
    if (err > 0) { inp.throttle = clamp(0.55 + err * 0.35, 0, 1); }
    else if (err < -1.2) { inp.brake = clamp(-err * 0.22, 0, 1); }
    else inp.throttle = 0.35;
    // off-line correction: lift if sliding
    if (Math.abs(c.slipR) > 0.08) inp.throttle *= 0.3;
    if (this.emerg) { inp.throttle = 0; inp.brake = 1; }
    if (v < 40) inp.throttle = Math.min(inp.throttle, 1 - 0.6 * Math.max(0, Math.abs(inp.steer) - 0.3));
    // active aero / overtake
    c.aeroReq = T.aeroZone[c.idx] === 1;
    c.overtakeOn = c.overtakeAvail && T.aeroZone[c.idx] === 1;
    c.ersMode = c.soc < SOC_MAX * 0.25 ? 0 : 1;

    // stuck / spun recovery
    const hErr = Math.abs(angleDiff(c.h, Math.atan2(T.ty[c.idx], T.tx[c.idx])));
    if ((v < 3 && (!race || race.greenT > 3)) || hErr > 1.6 || Math.abs(c.d) > T.hw + 3) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 3.5 && this.clearBehind(cars, race)) { this.recover(); this.stuckT = 0; }
    return inp;
  }
  clearBehind(cars, race) {
    const c = this.car, T = c.track;
    for (const o of cars) {
      if (o === c) continue;
      const g = race && race.mode === 'practice' ? lapGap(c.dist - o.dist, T.length) : c.dist - o.dist;
      if (g > -15 && g < 120 && Math.abs(o.d - T.lineO[c.idx]) < 4) return false;
    }
    return true;
  }
  recover() {
    const c = this.car, T = c.track, d0 = c.dist;
    c.place(c.idx, T.lineO[c.idx], 18);
    c.dist = d0; c.lastS = c.s; this.lat = 0; this.latT = 0;
  }
}
// a gap in race distance as a gap on the track: the nearest way round (-L/2 .. L/2), so a car a lap ahead or behind
// that is right next to you counts as right next to you
function lapGap(g, L) { g = ((g % L) + L) % L; return g > L / 2 ? g - L : g; }
function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

// ---- Race / session manager ----------------------------------------------
// pit lane geometry, shared by the simulation and the 3D scenery. Distances are measured to the right of the
// track centreline (lateral = -dist). Layout across the main section, from the track outward:
//   pit wall (at wallR) | fast lane (centre wr+4) | white line (wr+7.5) | working lane / boxes (wr+11.5) | garages (wr+16)
// An entry road leaves the track edge before the straight and an exit road rejoins after it.
function pitLane(T) {
  const n = T.n, ds = T.ds; let iA = 0, iB = 0;
  while (iA > -n / 3 && Math.abs(T.kapW[(iA - 1 + n) % n]) < 1 / 1500) iA--;
  while (iB < n / 3 && Math.abs(T.kapW[(iB + 1) % n]) < 1 / 1500) iB++;
  iA += 8; iB -= 8;
  if (iB - iA < 30) { iA = -Math.round(260 / ds); iB = Math.round(220 / ds); } // twisty start: use a fixed stretch either side of the line
  const entryLen = 150, exitLen = 120, eI = Math.round(entryLen / ds);
  const a = (iA - eI + n * 2) % n, mainLen = (iB - iA) * ds, L = entryLen + mainLen + exitLen;
  const idx = (sAlong) => (a + Math.floor(Math.max(0, sAlong) / ds)) % n;
  const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  // the wall offset is smoothed over the main section so the lanes run straight
  let wrSum = 0, wrN = 0; for (let k = iA; k <= iB; k++) { wrSum += T.wallR[(k + n) % n]; wrN++; }
  const WR = wrSum / wrN, edge = T.hw - 1.6;
  const P = {
    a, L, entryLen, exitLen, mainLen, WR, idx,
    fastDist: WR + 4, workDist: WR + 11.5, lineDist: WR + 7.5, garageDist: WR + 16, wallDist: WR,
    mainStart: entryLen, mainEnd: entryLen + mainLen,
    speedLine1: entryLen - 25, speedLine2: entryLen + mainLen + 25,
    // distance of the fast-lane path from the centreline at a point along the pit road
    path(sAlong) {
      if (sAlong < entryLen) return edge + (P.fastDist - edge) * sm(sAlong / entryLen);
      if (sAlong > entryLen + mainLen) return P.fastDist + (edge - P.fastDist) * sm((sAlong - entryLen - mainLen) / exitLen);
      return P.fastDist;
    },
    // 0 outside the main section, 1 inside (smooth over 30 m), for the garage-side apron
    mainFactor(sAlong) { return sm((sAlong - entryLen) / 30) * sm((entryLen + mainLen - sAlong) / 30); },
  };
  // one box per team in front of its garage, centred on the main section in team order
  const sp = Math.min(32, (mainLen - 40) / 11);
  P.boxSpacing = sp;
  P.boxS = (k) => entryLen + mainLen / 2 + (k - 5) * sp;
  return P;
}
const PIT_SPEED = 80 / 3.6;
class Race {
  // mode: 'race' | 'trial' | 'practice' (open session: unlimited laps, optional traffic spread round the lap)
  constructor(track, opts) {
    this.track = track; this.mode = opts.mode; this.laps = opts.laps || 5;
    this.aiPace = opts.aiPace || 1; this.time = 0; this.rivalCode = opts.rival || null; this.greenT = 0; this.phase = 'grid'; this.lightsT = 0; this.lightsOn = 0;
    this.lightsOutAt = opts.lightsOutAt ?? 3 + 5 * 1 + 0.4 + Math.random() * 1.6; // 5 lights 1 s apart, then a random hold
    this.cars = []; this.ais = []; this.events = []; this.finishOrder = []; this.quali = !!opts.quali;
    this.sectorLen = track.length / 3; this.bestLap = Infinity; this.bestSectors = [Infinity, Infinity, Infinity];
    const T = track;
    // grid: player starts at chosen slot; AI order by skill with a little shuffle
    const { field: f0, rng } = raceField(track, opts);
    let field = this.mode === 'trial' ? [] : f0;
    const playerEntry = { tm: opts.team, dr: opts.driver, player: true };
    // online: other human players, driven by network updates
    if (opts.remotes) field = opts.remotes.map((r) => ({ tm: r.team, dr: r.driver, remote: r.key }));
    this.online = !!opts.remotes;
    let grid;
    if (opts.gridOrder && this.mode === 'race') {
      // qualifying order (driver codes, player included)
      const all = field.concat([playerEntry]);
      grid = opts.gridOrder.map((code) => all.find((e) => e.dr.code === code)).filter(Boolean);
      all.forEach((e) => { if (!grid.includes(e)) grid.push(e); });
    } else {
      const slot = this.mode === 'trial' ? 0 : clamp(opts.gridSlot ?? field.length, 0, field.length);
      grid = field.slice(); grid.splice(slot, 0, playerEntry);
    }
    grid.forEach((e, k) => {
      const comp = e.player ? (opts.compound || 'M') : ['S', 'M', 'M', 'H'][(rng() * 4) | 0];
      const car = new Car(T, e.tm, e.dr, { player: !!e.player, compound: comp, upgrades: e.player ? opts.upgrades : null, assist: e.player ? opts.assist : { tc: 2, abs: true, autoGear: true }, damage: this.online ? 'visual' : opts.damage });
      // practice: the player leaves the pit straight on a flying start, traffic is spread round the lap
      const prac = this.mode === 'practice', ahead = prac && !e.player ? (T.length * (k + 1)) / (grid.length + 1) : 0;
      const back = this.mode === 'trial' || prac ? 160 - ahead : 12 + k * 8;
      const i0 = Math.round((((T.length - back) % T.length) + T.length) % T.length / T.ds) % T.n;
      car.place(i0, this.mode === 'trial' || prac ? T.lineO[i0] : (k % 2 === 0 ? 1 : -1) * Math.min(2.8, T.hw - 1.5), prac && !e.player ? T.lineV[i0] * 0.8 : 0);
      car.dist = car.s - T.length; car.lastS = car.s;
      car.gridPos = k + 1; car.lap = 0; car.lapStart = 0; car.lapTimes = []; car.bestLap = Infinity; car.cpTimes = [];
      car.sector = 0; car.sectorStart = 0; car.sectorTimes = [NaN, NaN, NaN]; car.lastSectors = [NaN, NaN, NaN];
      car.trackLimits = 0; car.offTrack = false; car.lapValid = true; car.penalty = 0; car.finished = false; car.finishTime = 0;
      car.jump = false;
      this.cars.push(car);
      if (e.player) this.player = car;
      else if (e.remote) { car.remote = e.remote; car.net = null; }
      else this.ais.push(new AIDriver(car, e.dr.skill * (0.97 + 0.03 * e.tm.perf.a), hashStr(e.dr.code) ^ (k * 7919)));
    });
    if (this.mode === 'trial' || this.mode === 'practice') { this.phase = 'green'; this.greenT = 10; }
    // weather: 'dry' | 'wet' | 'mixed' (dry start, rain arrives during the race, may stop again)
    this.weather = opts.weather || 'dry';
    this.env = { wet: this.weather === 'wet' ? 0.8 : 0, rain: this.weather === 'wet' ? 0.75 : 0 };
    if (this.weather === 'mixed') { const r = mulberry32(opts.seed ?? (Date.now() & 0xffff)); this.rainPlan = { start: 60 + r() * 200, peak: 0.55 + r() * 0.4, length: 120 + r() * 240 }; }
    this.cars.forEach((c) => { c.env = this.env; if (this.weather === 'wet' && c !== this.player) c.compound = rng() < 0.6 ? 'W' : 'I'; });
    if (this.weather === 'wet' && !COMPOUNDS[opts.compound]?.wet) this.player.compound = 'I';
    // short races wear tyres faster so strategy still matters (a soft lasts roughly half a race)
    this.wearMul = this.mode === 'race' && !this.quali ? clamp(58 / this.laps, 1, 12) : 1;
    this.twoCompounds = this.mode === 'race' && !this.quali && this.laps >= 8; // F1 rule: use two different dry compounds
    const prng = mulberry32(hashStr(T.spec.id) ^ this.laps * 977);
    this.cars.forEach((c) => { c.wearMul = this.wearMul; c.pitReq = null; c.pit = null; c.stops = 0; c.planLap = Math.round(this.laps * (0.3 + prng() * 0.35)); c.wetBias = (prng() - 0.5) * 0.12; c.stratAggr = prng(); });
    this.stratLog = []; this.trackWearK = 0.0095; // tyre wear per lap for a Medium at wear rate 1 (refined from the cars' own tyres)
    if (this.mode === 'race' && !this.quali) this.cars.forEach((c) => (c.plan = this.planStrategy(c, 1)));
    this.pit = pitLane(T);
  }
  compoundRule(c) {
    const used = c.usedCompounds || [c.compound];
    if (this.twoCompounds && !used.some((k) => COMPOUNDS[k].wet) && new Set(used).size < 2) { c.penalty += 20; (c.penalties = c.penalties || []).push('Two-compound rule'); this.emit('msg', { car: c, text: 'Did not use two tyre compounds: 20 second penalty', kind: 'warn' }); }
  }
  // ---- online: other players' cars follow their latest broadcast state, extrapolated and smoothed -----
  setRemoteState(key, st, now) {
    const c = this.cars.find((k) => k.remote === key); if (!c) return;
    c.net = Object.assign({ at: now }, st);
  }
  remoteStep(c, dt) {
    const n = c.net; if (!n) { c.vx = 0; return; }
    const age = Math.min(0.5, this.time - n.at);
    const tx = n.x + Math.cos(n.h) * n.vx * age, ty = n.y + Math.sin(n.h) * n.vx * age;
    const k = Math.min(1, dt * 12), jump = Math.hypot(tx - c.x, ty - c.y) > 12;
    c.x = jump ? tx : c.x + (tx - c.x) * k; c.y = jump ? ty : c.y + (ty - c.y) * k;
    c.h = jump ? n.h : c.h + angleDiff(n.h, c.h) * k;
    c.vx = n.vx; c.vy = 0; c.r = 0; c.delta = n.delta || 0; c.throttle = n.thr || 0; c.brake = n.brk || 0; c.rpm = n.rpm || 8000; c.gear = n.gear || 4;
    if (n.cmp && n.cmp !== c.compound) c.compound = n.cmp;
    c.wingHealth = n.wing ?? 1; c.pit = n.pit ? c.pit || { phase: 'net' } : null;
    c.locate(false);
    c.dist = n.dist + n.vx * age; c.lastS = c.s;
  }
  netState() {
    const c = this.player;
    return { x: +c.x.toFixed(2), y: +c.y.toFixed(2), h: +c.h.toFixed(4), vx: +c.vx.toFixed(2), dist: +c.dist.toFixed(1), delta: +c.delta.toFixed(3), thr: +c.throttle.toFixed(2), brk: +c.brake.toFixed(2), rpm: Math.round(c.rpm), gear: c.gear, cmp: c.compound, wing: +c.wingHealth.toFixed(2), pit: !!c.pit };
  }
  // ---- weather -----------------------------------------------------------------------------
  weatherStep(dt) {
    const E = this.env, R = this.rainPlan;
    if (R && this.phase === 'green') {
      const t = this.greenT, target = t > R.start && t < R.start + R.length ? R.peak : 0;
      const was = E.rain > 0.05;
      E.rain += clamp(target - E.rain, -dt / 25, dt / 25);
      if (!was && E.rain > 0.05) this.emit('rainstart', {}); else if (was && E.rain <= 0.05) this.emit('rainstop', {});
    }
    // water builds up while it rains and dries off (faster with cars running) when it stops
    if (E.rain > 0.02) E.wet += (Math.min(1, E.rain * 1.1) - E.wet) * Math.min(1, dt / 40);
    else E.wet = Math.max(0, E.wet - dt / 260);
  }
  // ---- race control: yellow flags, virtual safety car, blue flags -----------------------------
  vscCap(c) { return Math.min(this.track.lineV[c.idx] * 0.6, 44); }
  beingLapped(c) {
    const L = this.track.length;
    for (const o of this.cars) { if (o === c || o.pit || o.finished) continue; const ahead = o.dist - c.dist; if (ahead > L * 0.5 && ahead < L + 3 && L - ahead < 70) return o; }
    return null;
  }
  raceControl(dt) {
    if (this.mode !== 'race' || this.quali || this.phase !== 'green') return;
    const T = this.track, R = (this.rc = this.rc || { yellowUntil: [0, 0, 0], vscCool: 25, blueT: 0, vscWarn: 0, over: 0 });
    R.vscCool -= dt;
    for (const c of this.cars) {
      if (c.pit || c.finished || (c.parked && this.time - c.parkedAt > 30)) { c.incT = 0; continue; }
      const stopped = this.greenT > 12 && (c.vx < 7 || (Math.abs(c.d) > T.hw + 3 && c.vx < 25));
      c.incT = stopped ? (c.incT || 0) + dt : Math.max(0, (c.incT || 0) - dt * 2);
      if (c.incT > 1.2) {
        const sec = Math.min(2, Math.floor((((c.dist % T.length) + T.length) % T.length) / this.sectorLen));
        if (R.yellowUntil[sec] < this.time) this.emit('yellow', { sector: sec + 1, car: c });
        R.yellowUntil[sec] = this.time + 6;
        if (c.incT > 3 && !this.vsc && R.vscCool <= 0 && !c.vscRolled) {
          c.vscRolled = true;
          const onTrack = Math.abs(c.d) < T.hw + 2, big = (c.bigHit || 0) > 30 || !!c.dnf;
          if (this.online) { /* online: no safety car / VSC, each player's game would decide differently */ }
          else if (!this.sc && (R.scCount || 0) < 1 && (big || (onTrack && Math.random() < 0.5)) && this.lapsLeft(this.leader()) > 3) this.deploySC();
          else if ((R.vscCount || 0) < 2 && Math.random() < 0.35) { R.vscCount = (R.vscCount || 0) + 1; this.vsc = { until: this.time + 32 + Math.random() * 18, ending: false }; R.vscCool = 90; this.emit('vsc', {}); }
        }
      } else if (c.incT === 0) c.vscRolled = false;
    }
    this.yellow = R.yellowUntil.map((t) => t > this.time);
    if (this.vsc) {
      if (!this.vsc.ending && this.time > this.vsc.until - 8) { this.vsc.ending = true; this.emit('vscending', {}); }
      if (this.time > this.vsc.until) { this.vsc = null; this.emit('vscend', {}); }
      // the player must keep below the VSC delta
      const P = this.player;
      if (this.vsc && !P.pit) {
        R.over = P.vx > this.vscCap(P) * 1.06 + 1.5 ? R.over + dt : Math.max(0, R.over - dt);
        if (R.over > 1.5) { R.over = 0; R.vscWarn++; if (R.vscWarn % 3 === 0) { P.penalty += 5; (P.penalties = P.penalties || []).push('Speeding under the VSC'); this.emit('msg', { car: P, text: 'Speeding under VSC: 5 second penalty', kind: 'warn' }); } else this.emit('msg', { car: P, text: `Too fast under the VSC (warning ${R.vscWarn % 3} of 2)`, kind: 'warn' }); }
      }
    }
    if (this.sc) this.scStep(dt);
    // blue flag for the player
    R.blueT -= dt;
    const lapper = this.beingLapped(this.player);
    if (lapper && R.blueT <= 0) { R.blueT = 8; this.emit('blue', { car: lapper }); }
    // reminder about the two-compound rule
    if (this.twoCompounds && !this.player.stops && !this.player.pit && this.lapsLeft(this.player) === 3 && !this.player.ruleMsg) { this.player.ruleMsg = true; this.emit('msg', { car: this.player, text: 'Reminder: pit for a different tyre compound (M) or take a 20 s penalty', kind: 'warn' }); }
    // front wing damage message
    const P = this.player;

  }
  // a player who dropped out: their car is driven home by the AI from where it was
  adoptAI(c) {
    if (!c || !c.remote) return false;
    c.remote = null; c.net = null; c.vy = 0; c.r = 0; c.locate(true);
    if (!Number.isFinite(c.x) || Math.abs(c.d) > 40) { const d0 = c.dist; c.place(c.idx, this.track.lineO[c.idx], 20); c.dist = d0; c.lastS = c.s; }
    this.ais.push(new AIDriver(c, 0.95, hashStr(c.driver.code)));
    return true;
  }
  leader() { return this.standings().find((c) => !c.finished) || this.cars[0]; }
  // ---- safety car: joins ahead of the leader, the field queues behind it, no overtaking, 2-3 laps, restart at the line
  deploySC() {
    const R = this.rc, L = this.leader(), T = this.track;
    R.scCount = (R.scCount || 0) + 1; R.vscCool = 120;
    this.vsc = null;
    // a long race gets two laps behind the safety car, a short one a single lap
    this.sc = { dist: L.dist + 180, laps: this.laps >= 15 ? 2 : 1, startLap: L.lap, inLap: false, x: 0, y: 0, h: 0, order: this.standings().filter((c) => !c.finished).map((c) => c), warn: 0 };
    this.scPlace(); this.emit('sc', {});
  }
  scPlace() {
    const T = this.track, S = this.sc, s = ((S.dist % T.length) + T.length) % T.length, i = Math.floor(s / T.ds) % T.n;
    S.idx = i; S.x = T.px[i] + T.nx[i] * T.lineO[i]; S.y = T.py[i] + T.ny[i] * T.lineO[i]; S.h = Math.atan2(T.ty[i], T.tx[i]);
  }
  scPace(i) { return Math.min(this.track.lineV[i] * 0.7, 52); }
  // speed limit for a car under the safety car: no faster than the car ahead once within 18 m of it
  scLimit(c) {
    const S = this.sc, k = S.order.indexOf(c);
    if (k < 0) return Infinity;
    const ahead = k <= 0 ? { dist: S.dist, vx: S.v || 30 } : S.order[k - 1];
    const gap = ahead.dist - c.dist;
    if (gap > 60) return Infinity; // far behind: catch up at racing speed
    return Math.max(4, (ahead.vx || 20) + (gap - 16) * 0.6);
  }
  scStep(dt) {
    const S = this.sc, T = this.track, P = this.player;
    S.order = this.standings().filter((c) => !c.finished && !c.pit);
    const L = S.order[0];
    // the safety car drives at its pace, but waits for the leader to catch up before it leaves
    const gapL = L ? S.dist - L.dist : 100;
    S.v = S.inLap && gapL > 40 ? Math.min(T.lineV[S.idx], 62) : Math.min(this.scPace(S.idx), gapL > 40 ? this.scPace(S.idx) * 0.6 : this.scPace(S.idx));
    S.gone = S.inLap && gapL > 220; // it has pulled into the pits (out of sight): the field holds position to the line
    S.dist += S.v * dt; this.scPlace();
    if (L && !S.inLap && L.lap >= S.startLap + S.laps) { S.inLap = true; this.emit('scin', {}); }
    // in this lap: the car peels off into the pits at the end of the lap, racing resumes at the line
    if (S.inLap && L && L.lap > S.startLap + S.laps) { this.sc = null; this.emit('scend', {}); return; }
    // the player may not overtake under the safety car (pit stops don't count)
    if (!P.pit && !P.finished) {
      // only a real pass counts: the car that was right ahead is now behind, still running and not in the pits
      const k = S.order.indexOf(P), was = S.aheadCar;
      if (was && !was.pit && !was.finished && was.vx > 12 && was.dist < P.dist - 1 && this.time - (S.lastPen || -99) > 8) {
        S.lastPen = this.time; P.penalty += 5; (P.penalties = P.penalties || []).push('Overtaking under the safety car');
        this.emit('msg', { car: P, text: 'Overtaking under the safety car: 5 second penalty', kind: 'warn' });
      }
      S.aheadCar = k > 0 ? S.order[k - 1] : null;
    }
  }
  // player asks to pit (or changes the tyre choice / cancels); returns the requested compound or null
  requestPit(c, compound) { c.pitReq = compound || null; return c.pitReq; }
  lapsLeft(c) { return this.laps - Math.max(0, c.lap - 1); }
  // ---- strategy -------------------------------------------------------------------------------------------------
  // laps a set of tyres lasts (to ~62 % wear, where the grip starts falling away)
  tyreLife(comp, wearPerLap) { return 0.62 / (wearPerLap ?? this.trackWearK * COMPOUNDS[comp].wear * this.wearMul); }
  // a race plan from lap `from` on the tyres fitted now: the stints and their compounds. One stop when it works
  // (the softest second tyre that reaches the flag), two when it doesn't; short races without the two-compound rule
  // only stop when the tyres won't last
  planStrategy(c, from, wplNow) {
    const left = this.laps - from + 1, cur = c.compound; if (COMPOUNDS[cur].wet) return { stints: [{ comp: cur, to: this.laps }], i: 0, n: 0 };
    const life = (k) => this.tyreLife(k), lifeNow = wplNow ? (0.62 - c.wear) / wplNow : life(cur) * (1 - c.wear / 0.62);
    const need = this.twoCompounds && !c.stops ? 1 : 0;
    if (!need && lifeNow >= left * 0.98 - 1.5) return { stints: [{ comp: cur, to: this.laps }], i: 0, n: 0 }; // no rule to meet: worn tyres to the flag beat a stop
    const order = c.stratAggr > 0.5 ? ['S', 'M', 'H'] : ['M', 'S', 'H'];
    // one stop: the first stint as long as the tyres allow (a little margin), then a different compound to the flag
    // one stop: the stints split by how long each tyre lasts (the first no longer than these tyres allow), then a
    // different compound to the flag
    const maxS1 = Math.max(1, Math.min(Math.floor(lifeNow * 0.94), left - 2));
    for (const k of order) {
      if (need && k === cur) continue; const lk = life(k) * 0.96, l1 = Math.max(1, lifeNow);
      let s1 = Math.round(left * l1 / (l1 + lk) + (c.stratAggr - 0.5) * 2); s1 = clamp(s1, Math.max(1, left - Math.floor(lk)), maxS1);
      if (left - s1 <= lk && s1 >= 1) return { stints: [{ comp: cur, to: from + s1 - 1 }, { comp: k, to: this.laps }], i: 0, n: 1 };
    }
    const s1 = maxS1;
    // two stops: split what is left after the first stint
    const rest = left - s1, a = Math.ceil(rest / 2);
    const k2 = order.find((k) => k !== cur && life(k) >= a) || 'H', k3 = order.find((k) => life(k) >= rest - a) || 'H';
    return { stints: [{ comp: cur, to: from + s1 - 1 }, { comp: k2, to: from + s1 + a - 1 }, { comp: k3, to: this.laps }], i: 0, n: 2 };
  }
  planText(plan) { const st = plan.stints; return st.length === 1 ? `no stop on the ${COMPOUNDS[st[0].comp].name}s` : `${st.length - 1} stop${st.length > 2 ? 's' : ''}: ${st.map((x) => COMPOUNDS[x.comp].name).join(' → ')}, box around lap ${st[0].to + 1}`; }
  stratPit(c, comp, why) { c.pitReq = comp; this.stratLog.push({ code: c.driver.code, lap: c.lap, comp, why }); }
  // your race engineer: the plan, Safety Car stops, undercuts, tyre life and the crossover to rain tyres, on the radio
  engineer(P) {
    if (this.mode !== 'race' || this.quali || P.finished || P.dnf || !P.plan) return;
    const E = (this.eng = this.eng || {}), say = this.engSay || (this.engSay = (k, text) => { if (this.eng[k]) return; this.eng[k] = true; this.emit('radio', { car: this.player, text }); });
    if (this.phase === 'green' && this.greenT > 4 && !E.plan) {
      const alt = this.planStrategy(Object.assign({}, P, { stratAggr: 1 - (P.stratAggr || 0.5) }), 1);
      say('plan', `Plan A: ${this.planText(P.plan)}.` + (this.planText(alt) !== this.planText(P.plan) ? ` Plan B: ${this.planText(alt)}.` : ''));
    }
    if (P.pit || this.phase !== 'green') return;
    const left = this.lapsLeft(P), w = this.env.wet, onWet = COMPOUNDS[P.compound].wet;
    if (!onWet && w > 0.36 && left > 1) say('inters' + Math.round(this.time / 300), 'It is wet enough for intermediates now. Box, box.');
    if (onWet && w < 0.2 && left > 2) say('slicks' + Math.round(this.time / 300), 'The track is drying. Slicks this lap.');
    // once a lap: tyre life and the stop window
    if (P.lap !== E.lap && P.lap >= 2) {
      E.lap = P.lap; const lapsOn = Math.max(1, P.lap - (P.stintStart || 1)), wpl = P.wear / lapsOn, proj = wpl > 0 ? (0.62 - P.wear) / wpl : 99;
      if (P.plan.stints.length > 1) { const st = P.plan.stints[0], can = P.lap + Math.floor(proj * 0.97) - 1; if (can < st.to) st.to = Math.max(P.lap, can); }
      E.proj = proj;
      const due = P.plan.stints.length > 1 ? P.plan.stints[0].to + 1 - P.lap : 99;
      if (due === 1 && !onWet) say('box' + P.stops, `Box at the end of this lap for ${COMPOUNDS[P.plan.stints[1].comp].name}s.`);
      else if (proj < 3 && left > proj + 1 && !onWet) say('tyres' + P.stops, `The tyres are going. About ${Math.max(1, Math.round(proj))} laps left in them.`);
    }
    const due = P.plan.stints.length > 1 ? P.plan.stints[0].to + 1 - P.lap : 99;
    if ((this.sc || this.vsc) && left > 2 && (due <= Math.max(3, this.laps * 0.3) || P.wear > 0.4)) say('sc' + (this.rc ? (this.rc.scCount || 0) + (this.rc.vscCount || 0) * 10 : 0), `${this.sc ? 'Safety car' : 'Virtual safety car'}: box this lap, it is a cheap stop.`);
    const st = this.standings(), i = st.indexOf(P), ahead = st[i - 1], behind = st[i + 1];
    if (behind && behind.pit && behind.pit.phase === 'in' && this.gapBetween(P, behind) < 2.5 && due <= 5) say('cover' + behind.driver.code + P.stops, `${behind.driver.abbr || behind.driver.code} has boxed for the undercut. Box this lap to cover.`);
    if (ahead && ahead.pit && ahead.pit.phase === 'in' && this.gapBetween(ahead, P) < 3) say('over' + ahead.driver.code + P.stops, `${ahead.driver.abbr || ahead.driver.code} has boxed. Push now, overcut.`);
  }
  // the strategy line on the pause screen
  strategyText(P) {
    if (this.mode !== 'race' || this.quali || !P.plan) return '';
    const lapsOn = Math.max(1, P.lap - (P.stintStart || 1)), wpl = P.wear / lapsOn, proj = P.lap >= 2 && wpl > 0 ? Math.max(0, (0.62 - P.wear) / wpl) : this.tyreLife(P.compound) * (1 - P.wear / 0.62);
    return `Strategy: ${this.planText(P.plan)} · ${COMPOUNDS[P.compound].name}s ${Math.round((1 - P.wear) * 100)}%, about ${Math.round(proj)} laps left in them`;
  }
  aiPitDecision(c) {
    if (this.mode !== 'race' || this.quali || c.pitReq || c.pit || c.finished || c.dnf) return;
    // once a lap: how fast these tyres are wearing, the plan updated from it, and whether to save them
    if (c.plan && c.lap !== c.planSeen && c.lap >= 2) {
      c.planSeen = c.lap; const lapsOn = Math.max(1, c.lap - (c.stintStart || 1)), wpl = c.wear / lapsOn;
      const proj = wpl > 0 ? (0.62 - c.wear) / wpl : 99, st = c.plan.stints[0];
      if (lapsOn >= 1 && c.wear > 0.02 && !COMPOUNDS[c.compound].wet) {
        this.trackWearK = lerp(this.trackWearK, wpl / (COMPOUNDS[c.compound].wear * this.wearMul), 0.08);
        // the stop stays where it was planned: earlier if these tyres won't make it, a few laps later if they are holding up
        if (c.plan.stints.length > 1) { const can = c.lap + Math.floor(proj * 0.97) - 1; if (can < st.to) st.to = Math.max(c.lap, can); else if (can > st.to + 4 && (c.ext || 0) < 3 && this.tyreLife(c.plan.stints[1].comp) * 0.96 >= this.laps - st.to - 1) { st.to++; c.ext = (c.ext || 0) + 1; } }
        else if (this.laps - c.lap + 1 > proj * 1.02) c.plan = this.planStrategy(c, c.lap, wpl); // the tyres won't reach the flag after all
      }
      const need = st.to - c.lap + 1;
      c.tyreSave = c.plan.stints.length > 1 || proj >= need ? (proj < need + 1 && need > 2 ? 0.5 : 0) : clamp((need - proj) / Math.max(1, need) * 3, 0, 1);
    }
    if (c.dmg.punct.some(Boolean)) { c.pitReq = COMPOUNDS[c.compound].wet ? c.compound : c.compound === 'H' ? 'M' : 'H'; return; } // limp back for new tyres
    const left = this.lapsLeft(c);
    if (left < 2) return;
    const mustStop = this.twoCompounds && !c.stops && (left <= 2 || (!c.plan && c.lap > c.planLap)); // the plan stops first; this is the safety net
    const w = this.env.wet, onWet = COMPOUNDS[c.compound].wet;
    const wb = c.wetBias || 0; // some gamble early, some late
    if (!onWet && w > 0.36 + wb && left >= 1) { this.stratPit(c, w > 0.78 ? 'W' : 'I', 'rain'); return; }
    if (onWet && w < 0.22 + wb && left >= 1) { this.stratPit(c, left <= Math.max(2, this.laps * 0.35) ? 'S' : 'M', 'drying'); return; }
    if (c.compound === 'W' && w < 0.6 && left > 2) { c.pitReq = 'I'; return; }
    if (c.compound === 'I' && w > 0.86 && left > 2) { c.pitReq = 'W'; return; }
    if (onWet) return;
    if (c.wingHealth < 0.6 && left > 1) { c.pitReq = c.compound === 'H' ? 'M' : 'H'; return; }
    const plan = c.plan, next = plan && plan.stints[1], due = plan && plan.stints.length > 1 ? plan.stints[0].to + 1 - c.lap : 99;
    const nextComp = next ? next.comp : (left <= Math.max(2, this.laps * 0.35) ? 'S' : c.compound === 'H' ? 'M' : 'H');
    // a Safety Car or VSC: a stop costs far less now. Take it if one is due within a few laps (or the tyres are past their best)
    if ((this.sc || this.vsc) && c.lap >= 2 && left > 2 && (due <= Math.max(3, this.laps * 0.3) || c.wear > 0.4) && this.tyreLife(nextComp) * 1.05 >= left - 1) { this.stratPit(c, nextComp, this.sc ? 'safety car' : 'VSC'); return; }
    if (this.phase === 'green' && c.lap >= 2 && due <= 5 && due > 0) {
      const st = this.standings(), i = st.indexOf(c), ahead = st[i - 1], behind = st[i + 1];
      // cover: the car right behind has just stopped (the undercut): stop now too
      if (due <= 4 && behind && behind.pit && behind.pit.phase === 'in' && this.gapBetween(c, behind) < 2.0 && !c.coverT) { c.coverT = c.lap; this.stratPit(c, nextComp, 'cover the undercut'); return; }
      // undercut: stuck behind for two laps, close: stop early for the fresh tyres
      if (ahead && !ahead.pit) { const g = this.gapBetween(ahead, c); c.stuck = g < 1.3 ? (c.stuckLap === c.lap ? c.stuck : (c.stuck || 0) + 1) : 0; c.stuckLap = c.lap; if (c.stuck >= 3 && due <= 3 + c.stratAggr * 2) { this.stratPit(c, nextComp, 'undercut'); return; } }
    }
    if (plan && plan.stints.length > 1 && due <= 0) { this.stratPit(c, nextComp, 'plan'); return; }
    if (mustStop || c.wear > 0.66 || (c.wear > 0.55 && left > 3 && (!plan || plan.stints.length === 1))) this.stratPit(c, nextComp, mustStop ? 'rule' : 'worn tyres');
  }
  // pit stop: the lane is driven on rails at the limiter; laps keep counting as the lane runs beside the line
  pitStep(c, dt) {
    const T = this.track, P = this.pit, q = c.pit;
    if (q.phase === 'parked') { c.vx = 0; c.throttle = 0; return; } // retired or finished: staying in the box
    const box = q.box, sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    // a teammate still being serviced in the box: wait just behind it (double stack)
    const busy = this.cars.some((o) => o !== c && o.team === c.team && o.pit && (o.pit.phase === 'stop' || o.pit.phase === 'jack') && o.pit.box === box);
    const target = busy ? box - 7 : box;
    if (q.phase === 'in' || q.phase === 'queue') {
      const lim = q.s >= P.speedLine1 ? PIT_SPEED : Math.max(PIT_SPEED, q.v - 16 * dt);           // brake to the limiter by the speed line
      const vStop = Math.sqrt(Math.max(0, 2 * 7 * (target - q.s)));
      // brake down to the limiter, hold it along the lane (pulling away again from a queue), then brake into the box
      const toLim = q.v > lim ? Math.max(lim, q.v - 16 * dt) : Math.min(lim, q.v + 6 * dt);
      q.v = Math.max(0, Math.min(toLim, vStop));
      if (target - q.s < 0.03 || (q.v < 0.15 && target - q.s < 0.6)) {
        q.v = 0;
        if (!busy) { q.phase = 'stop'; q.t = 0; this.emit('pitstop', { car: c, service: q.service }); } else q.phase = 'queue';
      }
    } else if (q.phase === 'stop') {
      q.t += dt;
      if (q.t >= q.service) {
        c.usedCompounds = (c.usedCompounds || [c.compound]).concat(q.compound); c.compound = q.compound; c.wear = 0; c.tempF = c.tempR = 85; c.stops++; c.stintStart = c.lap; c.ext = 0; if (c.plan) { const st = c.plan.stints; c.plan = st.length > 1 && st[1].comp === c.compound ? { stints: st.slice(1), i: 0, n: st.length - 2 } : this.planStrategy(c, c.lap + 1); } c.tyreSave = 0;
        // new tyres fix any puncture; a new nose fixes the front wing (the rest can't be repaired in a race)
        c.dmg.tyre = [1, 1, 1, 1]; c.dmg.punct = [0, 0, 0, 0]; if (q.nose) { c.wingHealth = 1; c.dmg.noses++; } if (c.dmgSaid) for (const k of ['fwL', 'fwR', 'p0', 'p1', 'p2', 'p3']) delete c.dmgSaid[k];
        q.phase = 'out'; q.v = 0; this.emit('pitdone', { car: c, compound: q.compound, time: q.service });
      }
    } else {
      // leave the box, hold the limiter to the speed line, then accelerate down the exit road
      const cap = q.s < P.speedLine2 ? PIT_SPEED : PIT_SPEED + (q.s - P.speedLine2) * 0.45;
      q.v = Math.min(cap, q.v + (q.s < P.speedLine2 ? 6 : 9) * dt);
    }
    q.s += q.v * dt;
    // lateral path: fast lane, swinging into the working lane for the box and back out again
    const dist = (sAlong) => P.path(sAlong) + (P.workDist - P.fastDist) * (sAlong < box ? sm((sAlong - (box - 24)) / 19) : q.phase === 'out' ? sm((box + 22 - sAlong) / 19) : 1) * (P.mainFactor(sAlong) > 0.5 ? 1 : 0);
    const startBlend = (sAlong) => sm(sAlong / 45), distB = (sAlong) => -q.d0 + (dist(sAlong) + q.d0) * startBlend(sAlong); // from where the car left the racing line
    const d0 = distB(q.s), d1 = distB(q.s + 0.5);
    const i = P.idx(q.s), j = (i + 1) % T.n, f = (q.s % T.ds) / T.ds;
    const px = T.px[i] + (T.px[j] - T.px[i]) * f, py = T.py[i] + (T.py[j] - T.py[i]) * f;
    c.x = px - T.nx[i] * d0; c.y = py - T.ny[i] * d0;
    c.h = Math.atan2(T.ty[i], T.tx[i]) - Math.atan2(d1 - d0, 0.5); // turn with the path
    c.vx = q.v; c.vy = 0; c.r = 0; c.delta = clamp(-(d1 - d0) * 1.4, -0.3, 0.3);
    c.throttle = q.phase === 'out' ? 0.45 : 0; c.brake = (q.phase === 'in' && q.v > PIT_SPEED + 0.5) || (q.phase === 'in' && box - q.s < 20) ? 0.6 : 0;
    c.gear = q.v < 1 ? 1 : q.v < 15 ? 1 : q.v < 25 ? 2 : 3; c.rpm = 4200 + (q.v % 15) * 450; c.surface = 'tarmac'; c.slipF = c.slipR = 0;
    c.limiter = q.v > 2 && q.v <= PIT_SPEED + 0.3 && q.s < P.speedLine2;
    c.locate(false);
    if (q.tp) { q.tp = false; c.lastS = c.s; c.lapValid = false; } // teleported in: no distance credit, and this lap doesn't count
    let dS = c.s - c.lastS; if (dS < -T.length / 2) dS += T.length; else if (dS > T.length / 2) dS -= T.length;
    c.dist += dS; c.lastS = c.s;
    if (q.s >= P.L) { c.pit = null; c.limiter = false; c.vx = q.v; this.emit('pitexit', { car: c }); }
  }
  pitEntry(c) {
    if (!c.pitReq || c.pit || this.phase !== 'green' || c.finished) return false;
    const P = this.pit, n = this.track.n, k = (c.idx - P.a + n) % n;
    if (k > 4) return false;
    // a good stop is ~2.3 s; now and then a wheel nut sticks
    const nose = c.wingHealth < 0.92; // a nose change adds about 8 s to the stop
    const service = (c === this.player ? 2.3 + Math.random() * 0.4 : 2.1 + Math.random() * 0.9) + (Math.random() < 0.08 ? 1.5 + Math.random() * 3 : 0) + (nose ? 7.5 + Math.random() * 1.2 : 0);
    c.pit = { phase: 'in', s: k * this.track.ds, v: c.vx, d0: c.d, compound: c.pitReq, service, nose, box: P.boxS(Math.max(0, TEAMS.indexOf(c.team))) };
    c.pitReq = null; this.emit('pitentry', { car: c });
    return true;
  }
  // practice: straight back to the team's box (like "return to garage"); the car rolls the last metres in so the crew are out in time
  toBox(c, compound, force) {
    if (c.pit || (c.finished && !force)) return false; // force: after the flag, to park it in the garage
    const P = this.pit, box = P.boxS(Math.max(0, TEAMS.indexOf(c.team)));
    const nose = c.wingHealth < 0.92, service = 2.4 + Math.random() * 0.4 + (nose ? 7.5 : 0);
    c.pit = { nose, phase: 'queue', s: box - 22, v: 0, d0: 0, compound: compound || c.pitReq || c.compound, service, box, tp: true };
    c.pitReq = null; c.vx = c.vy = c.r = 0; this.emit('pitentry', { car: c, teleport: true });
    return true;
  }
  emit(type, data) { this.events.push(Object.assign({ type, t: this.time }, data)); }
  step(dt, playerInput) {
    const T = this.track;
    this.time += dt;
    if (this.phase === 'grid' || this.phase === 'lights') {
      this.lightsT += dt;
      const on = clamp(Math.floor(this.lightsT - 2), 0, 5);
      if (this.lightsT > 2) this.phase = 'lights';
      if (on !== this.lightsOn) { this.lightsOn = on; this.emit('light', { n: on }); }
      if (this.lightsT >= this.lightsOutAt) { this.phase = 'green'; this.lightsOn = 0; this.greenT = 0; this.emit('go', {}); this.cars.forEach((c) => (c.lapStart = this.time)); }
    } else this.greenT += dt;
    const held = this.phase !== 'green';
    // slipstream + dirty air from the nearest car ahead
    for (const c of this.cars) {
      let tow = 0, dirty = 0;
      for (const o of this.cars) {
        if (o === c) continue;
        const gap = o.dist - c.dist; if (gap <= 0 || gap > 60) continue;
        const lat = Math.abs(o.d - c.d); if (lat > 3) continue;
        const f = (1 - gap / 60) * (1 - lat / 3);
        tow = Math.max(tow, f); dirty = Math.max(dirty, f * (Math.abs(T.kapW[c.idx]) > 1 / 400 ? 1 : 0.3));
      }
      c.tow = tow; c.dirty = dirty;
    }
    // inputs
    const inputs = this.cars.map((c) => {
      if (c === this.player) {
        if (held) {
          // jump start detection: the car is held on the brakes, but moving counts
          const inp = Object.assign({}, playerInput); inp.brake = Math.max(inp.brake, inp.throttle > 0.1 ? 0.0 : 1); inp.noReverse = true;
          return inp;
        }
        return playerInput;
      }
      if (c.remote || c.dnf) return null; // a retired car is not driven (and must not be 'recovered' back onto the track)
      const ai = this.ais.find((a) => a.car === c); ai.cool = c.finished;
      if (c.pit) { ai.stuckT = 0; ai.lat = ai.latT = 0; return { steer: 0, throttle: 0, brake: 0 }; }
      return ai.control(dt, this.cars, this);
    });
    this.cars.forEach((c, i) => {
      if (held && c !== this.player) { c.vx = 0; c.vy = 0; c.r = 0; }
      if (c.remote) { this.remoteStep(c, dt); return; }
      if (c.parked) { c.vx = c.vy = c.r = 0; c.throttle = 0; c.brake = 1; return; }
      if (c.dnf && !c.pit) { this.retireStep(c, dt); return; }
      if (c.dnf && c.pit && c.pit.phase !== 'in' && c.pit.phase !== 'queue') { this.announceDnf(c); c.pit.phase = 'parked'; c.parked = true; c.parkedAt = this.time; c.vx = 0; return; } // retires in the pit box (out of its team-mate's way)
      if (c !== this.player) this.aiPitDecision(c); else if (!this.online) this.engineer(c);
      if (c.pit || this.pitEntry(c)) { this.pitStep(c, dt); return; }
      c.step(dt, inputs[i]);
      if (held && c === this.player && !c.jump && c.dist - (c.gridDist ?? (c.gridDist = c.dist)) > 0.8) { c.jump = true; c.penalty += 5; this.emit('msg', { car: c, text: 'Jump start: 5 second penalty', kind: 'warn' }); }
    });
    collideCars(this.cars.filter((c) => !c.pit && !c.parked));
    this.damageStep();
    this.raceControl(dt);
    this.weatherStep(dt);
    for (const c of this.cars) this.progress(c);
  }
  progress(c) {
    const T = this.track;
    // timing checkpoints every 50 m (for gaps)
    const cp = Math.floor(c.dist / 50);
    if (cp >= 0 && c.cpTimes[cp] === undefined) c.cpTimes[cp] = this.time;
    // track limits (player only): all four wheels past the white line
    const over = Math.abs(c.d) > T.hw + 1.0;
    if (c === this.player && this.phase === 'green' && !c.pit) {
      if (over && !c.offTrack) {
        c.offTrack = true;
        if (this.mode === 'practice') {
          // practice: two warnings a lap, the third trip off the track deletes the lap
          if (c.lapValid && c.dist > 0) {
            c.lapWarn = (c.lapWarn || 0) + 1;
            if (c.lapWarn <= 2) this.emit('msg', { car: c, text: `Track limits warning ${c.lapWarn} of 2: the lap still counts`, kind: 'info' });
            else { c.lapValid = false; this.emit('msg', { car: c, text: 'Third time off the track: lap deleted', kind: 'warn' }); }
          }
        } else if (this.mode !== 'race') { if (c.lapValid && c.dist > 0) this.emit('msg', { car: c, text: 'Track limits: lap deleted (time trial laps must stay inside the lines)', kind: 'warn' }); c.lapValid = false; }
        else {
          c.trackLimits++;
          if (c.trackLimits % 4 === 0) { c.penalty += 5; (c.penalties = c.penalties || []).push('Track limits'); this.emit('msg', { car: c, text: 'Track limits: 5 second penalty', kind: 'warn' }); }
          else if (c.trackLimits % 4 === 3) this.emit('msg', { car: c, text: 'Black and white flag: one more track limits offence is a penalty', kind: 'warn' });
          else this.emit('msg', { car: c, text: `Track limits warning ${c.trackLimits % 4} of 3`, kind: 'info' });
        }
      } else if (!over && Math.abs(c.d) < T.hw) c.offTrack = false;
    }
    // sectors
    if (c.dist >= 0) {
      const inLap = c.dist - Math.floor(c.dist / T.length) * T.length;
      const sec = Math.min(2, Math.floor(inLap / this.sectorLen));
      if (sec !== c.sector) {
        const prev = c.sector; const st = this.time - c.sectorStart;
        if (prev < 2 && sec === prev + 1 && c.lap > 0) {
          c.sectorTimes[prev] = st; this.sectorDone(c, prev, st);
        }
        c.sector = sec; c.sectorStart = this.time;
      }
    }
    // laps
    const lapNow = Math.floor(c.dist / T.length) + 1; // 0 before the line
    if (lapNow > c.lap) {
      const prevLap = c.lap; c.lap = lapNow;
      if (prevLap >= 1) {
        const lt = this.time - c.lapStart;
        const s3 = this.time - c.sectorStart;
        c.sectorTimes[2] = s3; this.sectorDone(c, 2, s3);
        c.lastSectors = c.sectorTimes.slice(); c.sectorTimes = [NaN, NaN, NaN];
        const valid = this.mode === 'race' || c.lapValid;
        c.lapTimes.push(lt); (c.lapLog = c.lapLog || []).push({ t: lt, valid });
        if (valid && lt < c.bestLap) c.bestLap = lt;
        if (this.mode === 'race' && this.phase === 'green' && this.standings()[0] === c) c.lapsLed = (c.lapsLed || 0) + 1; // leading as it crosses the line
        let overall = false;
        if (valid && lt < this.bestLap) { this.bestLap = lt; overall = true; }
        this.emit('lap', { car: c, time: lt, valid, best: valid && lt <= c.bestLap, overall });
        if (this.mode === 'race' && prevLap >= this.laps) { /* already finished */ }
        if (this.mode === 'race' && lapNow > this.laps && !c.finished) {
          c.finished = true; c.finishTime = this.time; this.finishOrder.push(c); this.compoundRule(c);
          this.emit('finish', { car: c, pos: this.finishOrder.length });
        } else if (this.mode === 'race' && this.finishOrder.length > 0 && !c.finished) {
          // chequered flag already out: finish on crossing the line
          c.finished = true; c.finishTime = this.time; this.finishOrder.push(c); this.compoundRule(c);
          this.emit('finish', { car: c, pos: this.finishOrder.length });
        }
        if (this.mode === 'race' && lapNow === this.laps && c === this.player) this.emit('msg', { car: c, text: 'Final lap', kind: 'info' });
      }
      c.lapStart = this.time; c.sector = 0; c.sectorStart = this.time; c.lapValid = true; c.lapWarn = 0;
      // overtake mode: within 1 s of the car ahead at the line
      if (this.mode === 'race' && this.phase === 'green' && c.lap >= 2) {
        const ahead = this.standings()[this.standings().indexOf(c) - 1];
        c.overtakeAvail = !!ahead && this.gapBetween(ahead, c) < 1.0;
        if (c === this.player && c.overtakeAvail) this.emit('msg', { car: c, text: 'Overtake mode available', kind: 'good' });
      }
    }
  }
  sectorDone(c, i, t) {
    if (!(c.lapValid || this.mode === 'race')) return;
    if (t < this.bestSectors[i]) this.bestSectors[i] = t;
  }
  // the running order, worked out once per step (strategy and the engineer ask for it many times a step); callers only
  // read it. A replay rewrites the cars' positions, so it clears _stT each frame
  standings() {
    if (this._stT === this.time && this._stN === this.finishOrder.length && this._st) return this._st;
    const fin = this.finishOrder.slice();
    const rest = this.cars.filter((c) => !c.finished).sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || b.dist - a.dist);
    this._stT = this.time; this._stN = this.finishOrder.length; return (this._st = fin.concat(rest));
  }
  gapBetween(a, b) {
    // time b lost to a at b's most recent checkpoint
    const cp = Math.floor(b.dist / 50);
    if (cp < 0 || a.cpTimes[cp] === undefined || b.cpTimes[cp] === undefined) return 0;
    return b.cpTimes[cp] - a.cpTimes[cp];
  }
  results() {
    const st = this.standings(), leader = st[0];
    const rows = st.map((c) => {
      const laps = Math.max(0, c.lap - 1);
      const total = c.finished ? c.finishTime - 0 : NaN;
      return { car: c, laps, total: c.finished ? c.finishTime + c.penalty : Infinity, raw: total, penalty: c.penalty, best: c.bestLap };
    });
    // penalties can reorder finishers on the same lap
    rows.sort((a, b) => ((a.car.dnf ? 1 : 0) - (b.car.dnf ? 1 : 0)) || (b.laps - a.laps) || (a.total - b.total) || (b.car.dist - a.car.dist));
    return rows;
  }
  // ---- damage: retirements, debris, team radio reports ----------------------------------------
  // a car that can't go on: off the throttle, onto the edge of the track, stopped, then parked beyond the white line
  retireStep(c, dt) {
    const T = this.track;
    this.announceDnf(c);
    const side = c.d >= 0 ? 1 : -1, target = side * (T.hw + 1.5);
    const steer = clamp((target - c.d) * 0.08, -0.5, 0.5) * (c.vx > 2 ? 1 : 0);
    c.step(dt, { steer, throttle: 0, brake: c.vx > 18 ? 0.5 : 0.9, noReverse: true });
    if (c.vx < 1.2) {
      const i = c.idx, wall = (side > 0 ? T.wallL : T.wallR)[i], off = side * Math.max(T.hw + 0.5, Math.min(T.hw + 3.5, wall - 1.6));
      c.x = T.px[i] + T.nx[i] * off; c.y = T.py[i] + T.ny[i] * off; c.h = Math.atan2(T.ty[i], T.tx[i]) + side * 0.35; c.locate(false);
      c.vx = c.vy = c.r = 0; c.parked = true; c.parkedAt = this.time;
    }
  }
  announceDnf(c) { if (c.dnfSaid) return; c.dnfSaid = true; c.pitReq = null; this.emit('dnf', { car: c, reason: c.dnf }); if (c === this.player) this.emit('msg', { car: c, text: `Retired: ${c.dnf.toLowerCase()}`, kind: 'warn' }); }
  damageStep() {
    // pieces left on the track by big impacts: other cars steer round them, a car running over one can cut a tyre
    const D = (this.debris = this.debris || []);
    for (const c of this.cars) {
      if (c.dmgNews && c.impact > 16 && !c.pit && D.length < 24) D.push({ x: c.x, y: c.y, s: c.s, d: clamp(c.d, -this.track.hw, this.track.hw), t: this.time, hit: [] });
      if (c.dmgNews && c === this.player) this.damageReport(c);
      c.dmgNews = null;
    }
    if (D.length) {
      for (let k = D.length - 1; k >= 0; k--) if (this.time - D[k].t > 150 || (this.sc && this.time - D[k].t > 20)) D.splice(k, 1); // the marshals sweep it up
      for (const c of this.cars) {
        if (c.pit || c.parked || c.vx < 20) continue;
        for (const b of D) {
          if (this.time - b.t < 0.5 || b.hit.includes(c)) continue;
          if (Math.abs(c.x - b.x) < 1 && Math.abs(c.y - b.y) < 1) { b.hit.push(c); if (Math.random() < 0.15) { c.puncture(Math.floor(Math.random() * 4)); if (c === this.player) this.damageReport(c); } }
        }
      }
    }
  }
  // team radio: one report per part as it gets worse (a scrape says nothing; a broken part is called once, worse again called again)
  damageReport(c) {
    const D = c.dmg, said = (c.dmgSaid = c.dmgSaid || {}), race = this.mode === 'race', corner = ['front left', 'front right', 'rear left', 'rear right'];
    const out = [];
    const tell = (key, h, msg) => { const lvl = h < 0.35 ? 2 : h < 0.8 ? 1 : 0; if (lvl > (said[key] || 0)) { said[key] = lvl; out.push(msg(lvl)); } };
    tell('fwL', D.fwL, (l) => `${l > 1 ? 'Front left wing is broken' : 'Front left wing damage'}.${race ? ' Box for a new nose.' : ''}`);
    tell('fwR', D.fwR, (l) => `${l > 1 ? 'Front right wing is broken' : 'Front right wing damage'}.${race ? ' Box for a new nose.' : ''}`);
    tell('rw', D.rw, (l) => (l > 1 ? 'Rear wing is badly damaged: careful in the fast corners.' : 'Rear wing damage: the rear will be loose in fast corners.'));
    tell('floor', D.floor, () => 'Floor damage: we have lost downforce.');
    tell('pu', D.pu, (l) => (l > 1 ? 'Big power unit problem. Nurse it home.' : 'We are seeing a power unit problem: down on power.'));
    D.sus.forEach((h, i) => tell('sus' + i, h, (l) => `Suspension damage, ${corner[i]}. ${l > 1 ? 'The car is badly bent.' : 'The car will pull.'}`));
    D.punct.forEach((p, i) => { if (p && !said['p' + i]) { said['p' + i] = 1; out.push(`Puncture, ${corner[i]}!${race ? ' Box, box.' : ''}`); } });
    if (!race && out.length) out.push('Reset the car to repair it.');
    if (out.length) this.emit('damage', { car: c, text: out.join(' ') });
  }
  // the player retired: the rest of the field is classified where it would finish at its current pace
  endEarly() {
    const L = this.track.length * this.laps, run = this.cars.filter((c) => !c.finished && !c.dnf);
    run.forEach((c) => { const v = Math.max(20, c.dist / Math.max(1, this.time - 3)); c.projT = this.time + Math.max(0, L - c.dist) / v; });
    run.sort((a, b) => a.projT - b.projT).forEach((c) => { c.finished = true; c.finishTime = c.projT; c.lap = Math.max(c.lap, this.laps + 1); this.finishOrder.push(c); });
    this.endedEarly = true;
  }
}

// the AI drivers in a race (the best N by skill and car, a little shuffle), without the player's seat. Shared with the
// race weekend, so qualifying classifies exactly the field that will race
function raceField(track, opts) {
  const rng = mulberry32(hashStr(track.spec.id) ^ 0x5eed), entries = [];
  TEAMS.forEach((tm) => tm.drivers.forEach((dr) => entries.push({ tm, dr })));
  const outCode = opts.replaceCode || opts.driver.code;
  const field = entries.filter((e) => !(e.tm.id === opts.team.id && e.dr.code === outCode));
  field.sort((a, b) => b.dr.skill * b.tm.perf.a - a.dr.skill * a.tm.perf.a + (rng() - 0.5) * 0.02);
  return { field: field.slice(0, opts.opponents ?? 21), rng };
}
// one flying lap by a reference AI at pace 1.0, used to derive qualifying times
const _refLaps = {};
function referenceLap(T) {
  if (_refLaps[T.spec.id]) return _refLaps[T.spec.id];
  const tm = TEAMS[3], car = new Car(T, tm, tm.drivers[0], {}), ai = new AIDriver(car, 1.0, 7);
  ai.pace = 1; ai.noise = 0; ai.noiseT = 1e9;
  car.place(T.n - 40, T.lineO[T.n - 40], 70); car.dist = car.s - T.length;
  const dt = 1 / 240; let t = 0, t0 = null;
  while (t < 400) {
    car.step(dt, ai.control(dt, [car], null)); t += dt;
    if (t0 === null && car.dist >= 0) t0 = t;
    if (t0 !== null && car.dist >= T.length) break;
  }
  return (_refLaps[T.spec.id] = t - t0);
}
// qualifying times for the AI field: skill, car and a little randomness
function aiQualiTimes(T, field, aiPace, seed) {
  const ref = referenceLap(T), rng = mulberry32(seed);
  return field.map(({ tm, dr }) => {
    const skill = dr.skill * (0.97 + 0.03 * tm.perf.a), pace = 0.97 + (skill - 0.95) * 0.6;
    const carF = 1 - (1 - tm.perf.p) * 0.35;
    return { code: dr.code, time: (ref / (pace * aiPace * carF)) * (1 + (rng() - 0.5) * 0.008) };
  });
}
if (typeof module !== 'undefined') module.exports = { wetGrip, pitLane, referenceLap, aiQualiTimes, raceField, COMPOUNDS, Race, TEAMS, TRACKS, THEMES, buildTrack, Car, AIDriver, collideCars, trackDistance, CAR_BASE, ERS_MODES, SOC_MAX, angleDiff, clamp, lerp, mulberry32 };

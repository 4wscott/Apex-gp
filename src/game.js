// ==== Game: menus, session loop, cameras, HUD ===============================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const fmtTime = (t) => { if (!isFinite(t) || t <= 0) return '--:--.---'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(3).padStart(6, '0')}`; };
const fmtGap = (g) => (g >= 0 ? '+' : '-') + Math.abs(g).toFixed(3);
const QUALITY = ['Low', 'Medium', 'High', 'Ultra'];

const DEFAULTS = {
  mode: 'race', compound: 'M', track: 'parco', team: 'ardent', driver: 'PRI', laps: 5, opponents: 21, aiPace: 0.96, grid: 'mid',
  tc: 2, abs: true, autoGear: true, steerAssist: true, wheelAssist: false, aeroAuto: true, line: 'corners',
  quality: 2, fov: 56, touch: 'auto', touchSteer: 'buttons', touchSens: 1, touchSize: 'M', touchLayout: 'split', analogPedals: true, haptics: true, touchAssist: true, mirrors: true, volume: 0.7, music: 0.55, musicRace: 'quiet', musicSource: 'youtube', ytUrl: '', ytList: 'random', traffic: 0, weather: 'dry', units: 'kmh', camera: 'cockpit', deadzone: 0.06, linearity: 1.4, hud: 'auto',
};
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const IS_PHONE = IS_TOUCH && Math.min(screen.width, screen.height) < 600;
// touch devices start with fewer rivals and the chase camera; saved choices still win
if (IS_TOUCH) Object.assign(DEFAULTS, { quality: 2, opponents: IS_PHONE ? 11 : 15, camera: 'chase', mirrors: false, fov: 60 });
const settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
// v2: arrow buttons became the default phone steering
if ((settings.v || 1) < 2) { settings.touchSteer = 'buttons'; settings.v = 2; }
// v3: High graphics by default everywhere, music from a YouTube playlist
if (settings.v < 3) { settings.quality = 2; if (settings.musicSource === 'game') settings.musicSource = 'youtube'; settings.v = 3; }
const saveSettings = () => store.set('settings', settings);

const App = {
  trackCache: {},
  init() {
    const canvas = $('#view');
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }); }
    catch (e) { $('#menu-error').hidden = false; $('#menu-error').textContent = 'WebGL is not available in this browser, so the 3D view cannot start.'; return; }
    this.renderer = renderer;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.86;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    GFX.maxAniso = renderer.capabilities.getMaxAnisotropy();
    GFX.tex = makeTextures();
    GFX.geo = makeCarGeometries();
    GFX.wind = { value: 0 };
    // grass tuft: three crossed blade cards with upward normals so they light like the ground
    GFX.grassTuft = mergeGeos([0, 1, 2].map((k) => new THREE.PlaneGeometry(0.7, 0.42).translate(0, 0.21, 0).rotateY((k * Math.PI) / 3)));
    { const nn = GFX.grassTuft.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0); }
    GFX.grassMat = new THREE.MeshStandardMaterial({ map: GFX.tex.grassBlades, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
    windify(GFX.grassMat, 0.25, 0.05);
    GFX.flagGeo = new THREE.PlaneGeometry(1.8, 1.1, 12, 4).translate(0.9, -0.55, 0);
    const tx = GFX.tex;
    GFX.mats = {
      carbon: new THREE.MeshPhysicalMaterial({ map: rep(tx.carbon.albedo, 9, 9), roughness: 0.42, metalness: 0.1, clearcoat: 0.45, clearcoatRoughness: 0.15 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 }),
      tyre: { S: tyreMaterial(tx.tyre.S), M: tyreMaterial(tx.tyre.M), H: tyreMaterial(tx.tyre.H) },
      rimBlur: new THREE.MeshStandardMaterial({ map: tx.rimBlur, transparent: true, opacity: 0, roughness: 0.4, metalness: 0.6, depthWrite: false }),
      rim: new THREE.MeshStandardMaterial({ color: 0x6b7078, roughness: 0.36, metalness: 0.9, side: THREE.DoubleSide }),
      rimLip: new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.18, metalness: 1 }),
      exhaust: new THREE.MeshStandardMaterial({ color: 0x8a7560, roughness: 0.28, metalness: 1, side: THREE.DoubleSide }),
      disc: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, emissive: 0xff5a10, emissiveIntensity: 0 }),
      blob: new THREE.MeshBasicMaterial({ map: tx.blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -32 }),
      visor: new THREE.MeshPhysicalMaterial({ color: 0x0c0f14, roughness: 0.04, metalness: 0.95, clearcoat: 1, iridescence: 0.6 }),
      mirrorGlass: new THREE.MeshStandardMaterial({ color: 0xaab4bf, roughness: 0.06, metalness: 1 }),
    };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.08, 30000);
    this.input = new Input(); this.audio = new AudioEngine();
    this.music = new Music(this.audio);
    // browsers only allow sound after a tap or key press: start the menu music on the first one
    const wake = () => { applyAudioSession(); this.audio.start(); this.audio.setVolume(settings.volume); this.music.setLevel(settings.music); if (settings.musicSource === 'game') this.music.start(); else if (settings.musicSource === 'youtube' && !YTMusic.player) YTMusic.play().catch(() => this.music.start()); this.music.setDuck(this.session ? raceMusic() : 1); };
    // unlock on every kind of gesture until the audio is really running (iOS only accepts touchend/click)
    const unlock = () => { wake(); if (this.audio.ctx && this.audio.ctx.state === 'running') ['pointerdown', 'touchend', 'click', 'keydown'].forEach((e) => removeEventListener(e, unlock, true)); };
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach((e) => addEventListener(e, unlock, true));
    // coming back to the app after switching away: resume the audio
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.audio.ctx) { this.audio.ctx.resume(); applyAudioSession(); } });
    this.particles = new Particles(this.scene);
    this.hdriCache = {};
    this.setupComposer();
    addEventListener('resize', () => this.resize()); this.resize();
    Menu.init();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    this.preview(settings.track);
  },
  // post-processing chain per quality: AO (High+), bloom, filmic output, SMAA
  setupComposer() {
    const q = settings.quality, r = this.renderer;
    if (this.composer) { this.composer.dispose && this.composer.dispose(); this.composer = null; }
    if (q === 0) return;
    const comp = new EffectComposer(r);
    comp.addPass(new RenderPass(this.scene, this.camera));
    if (q >= 2) {
      const ao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 2, scale: 1, samples: q >= 3 ? 16 : 10 });
      ao.blendIntensity = 0.85; comp.addPass(ao); this.ao = ao;
    }
    // guard: any NaN/inf pixel would otherwise be smeared across the screen by bloom
    comp.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(0.0); gl_FragColor = vec4(min(c.rgb, vec3(12.0)), c.a); }',
    }));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.26, 0.5, 1.05);
    comp.addPass(this.bloom);
    comp.addPass(new OutputPass());
    const grade = new ShaderPass({
      // broadcast-style grade: speed blur toward the edges, slight fringing, sharpen, S-curve contrast, warm highlights / cool shadows
      uniforms: { tDiffuse: { value: null }, vig: { value: 0.3 }, speed: { value: 0 }, texel: { value: new THREE.Vector2(1 / innerWidth, 1 / innerHeight) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float vig, speed; uniform vec2 texel; varying vec2 vUv;
        void main(){ vec2 d = vUv - 0.5; float r2 = dot(d, d);
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float blur = speed * smoothstep(0.04, 0.3, r2);
          if (blur > 0.001) { vec3 acc = c; for (int i = 1; i <= 6; i++) acc += texture2D(tDiffuse, vUv - d * blur * 0.012 * float(i)).rgb; c = acc / 7.; }
          float ca = 0.0018 * r2 * 4.;
          c.r = mix(c.r, texture2D(tDiffuse, vUv + d * ca).r, 0.6); c.b = mix(c.b, texture2D(tDiffuse, vUv - d * ca).b, 0.6);
          vec3 nb = (texture2D(tDiffuse, vUv + vec2(texel.x, 0.)).rgb + texture2D(tDiffuse, vUv - vec2(texel.x, 0.)).rgb + texture2D(tDiffuse, vUv + vec2(0., texel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0., texel.y)).rgb) * 0.25;
          c += (c - nb) * 0.35 * (1. - blur);
          c = clamp(c, 0., 1.);
          c = mix(c, c * c * (3. - 2. * c), 0.32);
          float l = dot(c, vec3(0.299,0.587,0.114));
          c = mix(vec3(l), c, 1.16);
          c *= mix(vec3(0.96, 0.99, 1.05), vec3(1.04, 1.0, 0.95), smoothstep(0.2, 0.8, l));
          gl_FragColor = vec4(c * (1. - vig * r2 * 2.2), 1.); }`,
    });
    comp.addPass(grade); this.grade = grade;
    this.smaa = new SMAAPass(innerWidth * r.getPixelRatio(), innerHeight * r.getPixelRatio()); comp.addPass(this.smaa);
    this.composer = comp;
  },
  resize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio || 1, [1, 1, 1.25, 1.75][settings.quality]);
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
    if (this.grade) this.grade.uniforms.texel.value.set(1 / (w * pr), 1 / (h * pr));
  },
  render(cam) {
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, cam || this.camera);
  },
  getTrack(id) {
    if (!this.trackCache[id]) this.trackCache[id] = buildTrack(TRACKS.find((t) => t.id === id));
    return this.trackCache[id];
  },
  clearWorld() {
    if (!this.worldRoot) return;
    this.scene.remove(this.worldRoot);
    const keepG = new Set(Object.values(GFX.geo)), keepM = new Set(Object.values(GFX.mats).flatMap((m) => (m.isMaterial ? [m] : Object.values(m))));
    const keepT = new Set(); Object.values(GFX.tex).forEach((t) => { if (t && t.isTexture) keepT.add(t); else if (t && t.albedo) [t.albedo, t.normal, t.rough].forEach((x) => x && keepT.add(x)); });
    this.worldRoot.traverse((o) => {
      if (o.geometry && !keepG.has(o.geometry)) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (!keepM.has(m)) { if (m.map && !keepT.has(m.map)) m.map.dispose(); m.dispose(); } });
    });
    this.worldRoot = null;
  },
  buildScene(T) {
    this.clearWorld();
    const root = new THREE.Group(); this.worldRoot = root;
    const theme = T.spec.theme, th = THEMES[theme], night = th.time === 'night';
    const hdriName = { parkland: 'sky', airfield: 'sky', forest: 'forest', street: 'city', tropical: 'sky', island: 'bridge', desert: 'night', prairie: 'dawn' }[theme];
    if (!this.hdriCache[hdriName]) {
      const h = loadHDRI(hdriName), pm = new THREE.PMREMGenerator(this.renderer);
      this.hdriCache[hdriName] = { env: pm.fromEquirectangular(h.tex).texture, sunDir: h.sunDir }; h.tex.dispose(); pm.dispose();
    }
    const H = this.hdriCache[hdriName];
    // keep the HDRI's sun but never let it sit too low for readable shadows
    const sunDir = night ? new THREE.Vector3(0.15, 1, 0.2).normalize() : H.sunDir.clone();
    if (!night && sunDir.y < 0.35) { sunDir.y = 0.35; sunDir.normalize(); }
    this.sunDir = sunDir;
    this.scene.environment = H.env;
    this.wx = null; // weather baselines belong to this scene's lights
    const sky = buildSky(theme, sunDir); root.add(sky); this.sky = sky;
    const { world, lightMats, wetMats } = buildWorld(T, theme, settings.quality); root.add(world); this.lightMats = lightMats; this.wetMats = wetMats;
    const fogCol = night ? new THREE.Color('#1a1828') : new THREE.Color(th.sky[1]).lerp(new THREE.Color('#c9d6e3'), 0.4);
    this.scene.fog = new THREE.FogExp2(fogCol, night ? 0.00035 : 0.00011);
    this.scene.background = fogCol;
    const hemi = (this.hemi = new THREE.HemisphereLight(night ? 0x9fb0d8 : 0xdfe9f5, night ? 0x3a3024 : 0x5a5040, night ? 1.4 : 0.35)); root.add(hemi);
    const sun = new THREE.DirectionalLight(night ? 0xfff1dd : th.sunColor, night ? 2.2 : th.time === 'overcast' ? 2.2 : 3.4);
    const q = settings.quality;
    sun.castShadow = true; // phones too: without shadows the cars and scenery look pasted on
    sun.shadow.mapSize.set(...[[1024, 1024], [1024, 1024], [2048, 2048], [4096, 4096]][q]);
    const ext = q === 0 ? 38 : 60, sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 600;
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    root.add(sun); root.add(sun.target); this.sun = sun;
    this.scene.add(root);
    Hud.buildMap(T);
  },
  // studio portrait of a team's car, drawn with the main renderer into a corner of the canvas and copied out
  carThumb(team) {
    const W = 360, H = 150, r = this.renderer;
    if (!r || !GFX.geo || !this.scene) return '';
    const pr = r.getPixelRatio();
    if (!this.thumbScene) {
      const sc = new THREE.Scene(); sc.background = new THREE.Color('#161a20');
      const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(3, 6, 4); sc.add(key, new THREE.HemisphereLight(0xdfe8ff, 0x2a2c30, 0.8));
      const floor = new THREE.Mesh(new THREE.CircleGeometry(5, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.6 })); sc.add(floor);
      const cam = new THREE.PerspectiveCamera(24, W / H, 0.1, 50); cam.position.set(3.1, 1.5, 6.5); cam.lookAt(0.1, 0.32, 0);
      this.thumbScene = sc; this.thumbCam = cam;
    }
    const sc = this.thumbScene; sc.environment = this.scene.environment;
    const dr = team.drivers.find((d) => d.code === settings.driver) || team.drivers[0];
    const car = makeCar(team, dr.num, GFX.geo, GFX.mats, 'M'); sc.add(car.grp);
    const ph = r.domElement.height;
    r.setScissorTest(true); r.setScissor(0, 0, W, H); r.setViewport(0, 0, W, H);
    r.render(sc, this.thumbCam);
    const c = document.createElement('canvas'); c.width = W * pr; c.height = H * pr;
    c.getContext('2d').drawImage(r.domElement, 0, ph - H * pr, W * pr, H * pr, 0, 0, W * pr, H * pr);
    r.setScissorTest(false); r.setViewport(0, 0, r.domElement.width / pr, r.domElement.height / pr);
    sc.remove(car.grp);
    const shared = new Set(Object.values(GFX.mats));
    car.grp.traverse((o) => { if (o.isMesh) [].concat(o.material).forEach((m) => { if (!shared.has(m)) { if (m.map && !m.map.userData.keep && !Object.values(GFX.tex).includes(m.map)) m.map.dispose(); m.dispose(); } }); });
    return c.toDataURL('image/jpeg', 0.86);
  },
  preview(trackId) {
    if (this.session) return;
    const T = this.getTrack(trackId);
    this.buildScene(T);
    if (this.previewCar) this.worldRoot.remove(this.previewCar.grp);
    const team = TEAMS.find((t) => t.id === settings.team), dr = team.drivers.find((d) => d.code === settings.driver) || team.drivers[0];
    this.previewCar = makeCar(team, dr.num, GFX.geo, GFX.mats);
    this.worldRoot.add(this.previewCar.grp);
    const i = Math.round(30 / T.ds);
    this.previewCar.grp.position.copy(W(T.px[i] + T.nx[i] * T.lineO[i], T.py[i] + T.ny[i] * T.lineO[i], 0));
    this.previewCar.grp.rotation.y = Math.atan2(T.ty[i], T.tx[i]);
    this.previewT = 0; this.previewTrack = T;
  },
  // online race from the host's start message
  startOnline(m) {
    if (this.session) this.quit();
    Net.racing = true;
    const human = (p, i) => {
      const team = TEAMS.find((t) => t.id === p.team) || TEAMS[0], base = team.drivers.find((d) => d.num === p.num) || team.drivers[0];
      return { team, driver: { name: p.name, code: 'N' + i, abbr: p.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'PLY', num: base.num, skill: 1 } };
    };
    const all = m.players.map((p, i) => Object.assign({ key: p.key }, human(p, i)));
    const me = all.find((p) => p.key === Net.me) || all[0];
    this.start({ online: true, mode: 'race', track: m.track, laps: m.laps, weather: m.weather, team: me.team, driver: me.driver, opponents: 0,
      remotes: all.filter((p) => p !== me), gridOrder: m.grid.map((k) => all.find((p) => p.key === k).driver.code),
      lightsOutAt: m.lightsOutAt, seed: m.seed, ref: Date.now() - (Net.host ? 0 : 150) });
  },
  // cfg (career) overrides the free-play settings
  start(cfg) {
    cfg = cfg || null; this.cfg = cfg;
    this.audio.start(); this.audio.setVolume(settings.volume);
    this.music.setLevel(settings.music); if (settings.musicSource === 'game') this.music.start(); else if (settings.musicSource === 'youtube') YTMusic.play().catch(() => this.music.start()); this.music.setDuck(raceMusic()); document.body.classList.remove('yt-tap');
    const mode = cfg ? cfg.mode : settings.mode;
    const T = this.getTrack(cfg ? cfg.track : settings.track);
    $('#loading').hidden = false; $('#menu').hidden = true;
    setTimeout(() => {
      this.buildScene(T);
      this.previewCar = null;
      const team = cfg ? cfg.team : TEAMS.find((t) => t.id === settings.team), driver = cfg ? cfg.driver : team.drivers.find((d) => d.code === settings.driver) || team.drivers[0];
      const opp = mode === 'trial' ? 0 : mode === 'practice' ? settings.traffic : cfg ? cfg.opponents : settings.opponents;
      const gridSlot = { pole: 0, mid: Math.floor(opp / 2), back: opp, random: Math.floor(Math.random() * (opp + 1)) }[settings.grid];
      const race = new Race(T, {
        mode, weather: cfg ? cfg.weather || 'dry' : settings.weather, laps: cfg ? cfg.laps : settings.laps, opponents: opp, team, driver, gridSlot, aiPace: settings.aiPace, compound: settings.compound,
        replaceCode: cfg && cfg.replaceCode, upgrades: cfg && cfg.upgrades, gridOrder: cfg && cfg.gridOrder, quali: cfg && cfg.quali,
        remotes: cfg && cfg.remotes, lightsOutAt: cfg && cfg.lightsOutAt, seed: cfg && cfg.seed,
        assist: { tc: settings.tc, abs: settings.abs, autoGear: settings.autoGear },
      });
      if (cfg && cfg.online) race.lightsT = -(4 - (Date.now() - cfg.ref) / 1000); // lights start 4 s after the host pressed start, for everyone
      this.session = { T, race, acc: 0, meshes: [], camMode: settings.camera, camSmooth: null, finishedAt: 0, ghost: null, ghostRec: [], ghostT: 0, msgs: [], shake: 0, online: !!(cfg && cfg.online), netT: 0 };
      race.cars.forEach((c) => {
        const m = makeCar(c.team, c.driver.num, GFX.geo, GFX.mats, c.compound, c === race.player);
        this.worldRoot.add(m.grp); this.session.meshes.push(m); c.mesh = m;
      });
      PitCrew.reset(this.worldRoot);
      this.setupCockpit(race.player);
      if (mode === 'trial' && !(cfg && cfg.quali)) this.setupGhost(T, team);
      $('#p-finishq').hidden = !(cfg && cfg.quali);
      this.buildRacingLine(T);
      Hud.show(race); $('#loading').hidden = true;
      this.touchOn = settings.touch === 'on' || (settings.touch === 'auto' && IS_TOUCH);
      $('#touch').hidden = !this.touchOn; document.body.classList.toggle('touch', this.touchOn); document.body.dataset.tl = settings.touchSteer === 'buttons' ? 'std' : settings.touchLayout || 'split';
      if (this.touchOn) { this.input.buildTouch($('#touch'), settings); this.input.lastDevice = 'touch'; const el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); }
      this.paused = false;
      this.resize();
    }, 30);
  },
  // rain: darker sky and denser fog, falling drops around the camera, a wet and reflective track
  weatherVisuals(dt, race) {
    const E = race.env, rain = E.rain, wet = E.wet, W = (this.wx = this.wx || {});
    if (W.sun === undefined) { W.sun = this.sun.intensity; W.fog = this.scene.fog.density; W.fogCol = this.scene.fog.color.clone(); W.hemi = this.hemi.intensity; }
    const k = Math.min(1, rain * 1.3);
    this.sun.intensity = W.sun * (1 - 0.7 * k); this.hemi.intensity = W.hemi * (1 + 0.8 * k);
    this.scene.fog.density = W.fog * (1 + 5 * k); this.scene.fog.color.copy(W.fogCol).lerp(new THREE.Color('#7d848c'), k);
    this.scene.background = this.scene.fog.color; this.sky.visible = k < 0.35;
    for (const m of this.wetMats || []) { m.roughness = 1 - 0.5 * wet; m.color.setScalar(1 - 0.55 * wet); m.envMapIntensity = 1 + 0.5 * wet; }
    if (!this.rainFx) {
      const N = settings.quality >= 2 ? 4000 : settings.quality === 1 ? 2400 : 1200, pos = new Float32Array(N * 6), g = new THREE.BufferGeometry();
      for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; pos.set([x, y, z, x, y - 0.6, z], i * 6); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d2dc, transparent: true, opacity: 0.45, depthWrite: false }));
      lines.frustumCulled = false; this.scene.add(lines); this.rainFx = { lines, pos, N };
    }
    const R = this.rainFx; R.lines.visible = rain > 0.03;
    if (R.lines.visible) {
      const c = this.camera.position, p = R.pos, fall = 24 * dt;
      for (let i = 0; i < R.N; i++) {
        let o = i * 6, y = p[o + 1] - fall;
        if (y < -2) y += 30;
        p[o + 1] = y; p[o + 4] = y - 0.6;
      }
      R.lines.position.set(c.x, c.y - 12, c.z); R.lines.geometry.attributes.position.needsUpdate = true;
      R.lines.geometry.setDrawRange(0, Math.floor(R.N * Math.min(1, rain)) * 2);
    }
  },
  setupCockpit(car) {
    // the player's car swaps the simple wheel for the detailed one with a live display
    const m = car.mesh;
    if (m.sw) m.swSpin.remove(m.sw.g); // replace the lightweight wheel with the full one (live display)
    const sw = makeSteeringWheel(car.team); m.sw = sw;
    m.swSimple.forEach((o) => (o.visible = false));
    m.swSpin.add(sw.g);
    // forearms run to the wrists of the detailed gloves
    m.arms.forEach((a, i) => { a.hand = sw.wrists[i]; a.hand.userData.wrist = true; });
    if (m.avatar && m.avatar.hands) m.avatar.hands.visible = false;
    this.session.wheel = { tilt: m.swTilt, spin: m.swSpin, canvas: sw.canvas, tex: sw.tex, ctx: sw.canvas.getContext('2d'), t: 0, leds: sw.leds, flags: sw.flags, rotaries: sw.rotaries };
    // rear-view mirrors rendered into a texture
    if (settings.mirrors && settings.quality >= 1) {
      const sides = car.mesh.mirrors.map((glass, k) => {
        const rt = new THREE.WebGLRenderTarget(384, 128, { type: THREE.HalfFloatType });
        rt.texture.repeat.x = -1; rt.texture.offset.x = 1; rt.texture.wrapS = THREE.RepeatWrapping; // mirror image
        glass.material = new THREE.MeshBasicMaterial({ map: rt.texture, color: 0xdfe6ee, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
        return { glass, rt, cam: new THREE.PerspectiveCamera(30, 3, 0.2, 1500), side: k === 0 ? 1 : -1 };
      });
      this.session.mirror = { sides, n: 0 };
    }
  },
  setupGhost(T, team) {
    const best = store.get('tt.' + T.spec.id, null);
    const m = makeCar(team, 0, GFX.geo, GFX.mats);
    m.grp.traverse((o) => { if (o.material) { o.material = (Array.isArray(o.material) ? o.material : [o.material]).map((mm) => { const c = mm.clone(); c.transparent = true; c.opacity = 0.28; c.depthWrite = false; return c; }); if (o.material.length === 1) o.material = o.material[0]; o.castShadow = false; } });
    m.grp.visible = false; this.worldRoot.add(m.grp);
    this.session.ghost = { mesh: m, data: best ? best.ghost : null, best: best ? best.time : Infinity };
  },
  buildRacingLine(T) {
    if (settings.line === 'off') return;
    const pos = [], col = [], idx = [];
    const add = (i) => {
      const o = T.lineO[i], x = T.px[i] + T.nx[i] * o, y = T.py[i] + T.ny[i] * o;
      const brake = T.lineV[i] < T.lineVf[i] - 0.8, coast = !brake && T.lineV[i] < 94 && T.lineV[(i + 6) % T.n] < T.lineV[i] + 0.3;
      const c = brake ? [1, 0.12, 0.1] : coast ? [1, 0.75, 0.1] : [0.15, 0.9, 0.35];
      const show = settings.line === 'full' || brake || coast;
      for (const s of [-0.35, 0.35]) { pos.push(x + T.nx[i] * s, 0.025, -(y + T.ny[i] * s)); col.push(...c); }
      return show;
    };
    let prevShow = false;
    for (let k = 0; k <= T.n; k++) {
      const show = add(k % T.n), b = k * 2;
      if (k > 0 && show && prevShow) idx.push(b - 2, b, b - 1, b - 1, b, b + 1);
      prevShow = show;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.worldRoot.add(m);
  },
  quit() {
    if (this.session && this.session.online) { Net.racing = false; }
    if (this.wx && this.session) this.weatherVisuals(0, { env: { rain: 0, wet: 0 } }); if (this.rainFx) this.rainFx.lines.visible = false;
    this.session = null; this.paused = false; this.audio.silence(); this.music.setDuck(1); setTimeout(() => YTMusic.ready && YTMusic.checkTap(), 1500);
    Hud.hide(); $('#touch').hidden = true; document.body.classList.remove('touch'); $('#rotate').hidden = true; $('#pause').hidden = true; $('#results').hidden = true; $('#menu').hidden = false;
    $('#r-again').textContent = 'Race again'; $('#r-menu').textContent = 'Main menu'; $('#r-menu').hidden = false;
    $('#res-head').innerHTML = '<tr><th>Pos</th><th>Driver</th><th>Team</th><th>Time</th><th>Best lap</th><th>Pen.</th><th>Grid</th></tr>';
    const wasCareer = this.cfg && this.cfg.career; this.cfg = null;
    if (wasCareer) Career.render();
    this.preview(wasCareer && Career.data && Career.track() ? Career.track().id : settings.track);
  },
  restart() { $('#pause').hidden = true; $('#results').hidden = true; this.session = null; this.start(this.cfg); },
  togglePause(force) {
    if (!this.session) return;
    this.paused = force !== undefined ? force : !this.paused;
    $('#pause').hidden = !this.paused;
    if (this.paused) this.audio.silence();
  },

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.input.tickCapture();
    const S = this.session;
    if (this.sky && this.sky.userData.clouds) this.sky.userData.clouds.uniforms.t.value += dt;
    if (GFX.wind) GFX.wind.value += dt;
    if (!S) { Crowd.update(dt, null); this.menuFrame(dt); this.render(); return; }
    const race = S.race, P = race.player;
    const portrait = this.touchOn && innerHeight > innerWidth;
    $('#rotate').hidden = !portrait;
    const inp = this.input.poll(dt, P.vx, settings);
    if (inp.pausePressed && $('#results').hidden) this.togglePause();
    if (S.online && this.paused) { const h = 1 / 360; S.acc += dt; let k = 0; while (S.acc >= h && k < 40) { race.step(h, { steer: 0, throttle: 0, brake: 1 }); S.acc -= h; k++; } }
    if (!this.paused) {
      this.applyPlayerControls(inp, P, race);
      const h = 1 / 360; S.acc += dt; let steps = 0;
      while (S.acc >= h && steps < 40) { race.step(h, inp); S.acc -= h; steps++; }
      if (steps >= 40) S.acc = 0;
      this.handleEvents(race);
      this.ghostUpdate(dt, P, race);
      if (S.online) { S.netT += dt; if (S.netT >= 0.05) { S.netT = 0; Net.send({ t: 's', k: Net.me, s: race.netState() }); } }
      if (race.mode === 'race' && P.finished && !S.finishedAt) { S.finishedAt = performance.now(); if (S.online) Net.send({ t: 'fin', k: Net.me, time: P.finishTime }); }
      if (S.finishedAt && performance.now() - S.finishedAt > 6000 && $('#results').hidden) Results.show(race);
    }
    this.updateVisuals(dt, S, inp);
    this.render();
    Hud.update(dt, S, inp);
  },
  menuFrame(dt) {
    if (!this.previewCar || !this.previewTrack) return;
    this.previewT += dt * 0.12;
    const c = this.previewCar.grp.position, a = this.previewT;
    this.camera.fov = 38; this.camera.near = 0.3; this.camera.updateProjectionMatrix();
    if (window.DEBUG_CAM) { const d = window.DEBUG_CAM; this.camera.position.set(c.x + d[0], d[1], c.z + d[2]); this.camera.lookAt(c.x + (d[3] || 0), d[4] ?? 0.5, c.z + (d[5] || 0)); }
    else { this.camera.position.set(c.x + Math.cos(a) * 7.5, 1.6 + Math.sin(a * 0.7) * 0.4, c.z + Math.sin(a) * 7.5); this.camera.lookAt(c.x, 0.55, c.z); }
    if (this.sun) { this.sun.target.position.copy(c); this.sun.position.copy(c).addScaledVector(this.sunDir, 150); }
  },
  applyPlayerControls(inp, P, race) {
    const S = this.session;
    P.assist.tc = settings.tc; P.assist.abs = settings.abs; P.assist.autoGear = settings.autoGear;
    if (inp.cameraPressed) { const modes = ['cockpit', 'tcam', 'chase', 'far']; S.camMode = modes[(modes.indexOf(S.camMode) + 1) % modes.length]; settings.camera = S.camMode; saveSettings(); }
    if (settings.aeroAuto) P.aeroReq = race.track.aeroZone[P.idx] === 1;
    else { if (inp.aeroPressed) P.aeroReq = !P.aeroReq; if (P.aeroReq && !P.aeroX && P.brake > 0.05) P.aeroReq = false; }
    P.overtakeOn = !!inp.overtake;
    if (inp.ersPressed) { P.ersMode = (P.ersMode + 1) % 3; Hud.flash(`ERS ${ERS_MODES[P.ersMode].name}`); }
    if (inp.biasFPressed) { P.bias = Math.min(0.62, P.bias + 0.005); Hud.flash(`Brake bias ${(P.bias * 100).toFixed(1)}%`); }
    if (inp.biasRPressed) { P.bias = Math.max(0.5, P.bias - 0.005); Hud.flash(`Brake bias ${(P.bias * 100).toFixed(1)}%`); }
    if (inp.pitPressed && (race.mode === 'race' || race.mode === 'practice') && !race.quali && !P.pit && !P.finished) {
      // each press cycles: box on Soft -> Medium -> Hard -> Intermediate -> Wet -> cancel
      const order = ['S', 'M', 'H', 'I', 'W', null], cur = order.indexOf(P.pitReq ?? null);
      let next = order[(cur + 1) % order.length]; if (next === P.compound && P.pitReq == null) next = order[(order.indexOf(next) + 1) % (order.length - 1)];
      race.requestPit(P, next);
      Hud.banner(next ? `Box this lap: ${COMPOUNDS[next].name} tyres` : 'Pit stop cancelled', next ? 'info' : 'warn');
    }
    if (settings.musicSource === 'youtube') { if (inp.spNextPressed) { YTMusic.next(); Hud.flash('Next track'); } if (inp.spPlayPressed) YTMusic.toggle(); }
    if (settings.musicSource === 'spotify' && Spotify.connected()) {
      if (inp.spNextPressed) Spotify.next().then(() => Hud.flash('Spotify: next track')).catch((e) => Hud.flash(e.message));
      if (inp.spPlayPressed) Spotify.now().then((n) => (n && n.is_playing ? Spotify.pause() : Spotify.play())).catch((e) => Hud.flash(e.message));
    }
    if (inp.resetPressed && race.phase === 'green' && !P.pit) {
      const T = race.track, d0 = P.dist; P.place(P.idx, T.lineO[P.idx], 0); P.dist = d0; P.lastS = P.s; P.lapValid = race.mode === 'race' && P.lapValid;
      if (race.mode !== 'race') P.lapValid = false;
      Hud.flash('Car reset to track');
    }
  },
  handleEvents(race) {
    const S = this.session;
    for (const e of race.events) {
      if (e.type === 'light') { if (e.n > 0) this.audio.beep(520, 0.15, 0.2); if (e.n === 1 && !this.touchOn) Hud.banner('← → steer · A accelerate · D brake', 'info'); }
      else if (e.type === 'go') { this.audio.beep(880, 0.3, 0.25); Hud.banner('Lights out', 'go'); }
      else if (e.type === 'msg' && e.car === race.player) Hud.banner(e.text, e.kind);
      else if (e.type === 'rainstart') Hud.banner('Rain is starting to fall', 'warn');
      else if (e.type === 'rainstop') Hud.banner('Rain has stopped: the track will dry', 'info');
      else if (e.type === 'yellow') Hud.banner(`Yellow flag · sector ${e.sector}`, 'warn');
      else if (e.type === 'vsc') Hud.banner('Virtual Safety Car deployed: slow to the delta', 'warn');
      else if (e.type === 'vscending') Hud.banner('VSC ending', 'info');
      else if (e.type === 'vscend') Hud.banner('Green flag: racing resumes', 'go');
      else if (e.type === 'blue') Hud.banner(`Blue flag: let ${e.car.driver.abbr || e.car.driver.code} through`, 'info');
      else if (e.type === 'pitentry' && e.car === race.player) Hud.banner('Pit lane: limiter on (80 km/h)', 'info');
      else if (e.type === 'pitdone' && e.car === race.player) Hud.banner(`Stop ${e.time.toFixed(1)} s · ${COMPOUNDS[e.compound].name} tyres fitted`, 'go');
      else if (e.type === 'pitexit' && e.car === race.player) Hud.banner('Rejoining the track', 'info');
      else if (e.type === 'pitdone' && e.car !== race.player && Math.abs(race.player.dist - e.car.dist) < race.track.length * 0.5) Hud.flash(`${e.car.driver.abbr || e.car.driver.code} pits: ${COMPOUNDS[e.compound].name}`);
      else if (e.type === 'lap' && e.car === race.player) {
        Hud.lapDone(e, race);
        if (race.mode === 'trial' && e.valid && S.ghost && e.time < S.ghost.best) {
          S.ghost.best = e.time; S.ghost.data = S.ghostRec.slice();
          store.set('tt.' + race.track.spec.id, { time: e.time, ghost: S.ghost.data });
        }
        if (race.mode === 'practice' && e.valid) {
          const k = 'pr.' + race.track.spec.id, pb = store.get(k, null);
          if (!pb || e.time < pb.time) { store.set(k, { time: e.time }); $('#h-pb-wrap').hidden = false; $('#h-pb').textContent = fmtTime(e.time); if (pb) Hud.flash('New practice best'); }
        }
        S.ghostRec = []; S.ghostT = 0;
        if (race.quali && race.player.lapTimes.length >= 2 && !S.qualiDone) { S.qualiDone = true; setTimeout(() => { if (this.session === S) Career.finishQuali(race); }, 1800); }
      } else if (e.type === 'finish' && e.car === race.player) Hud.banner(`Chequered flag: P${e.pos}`, 'go');
    }
    race.events.length = 0;
  },
  ghostUpdate(dt, P, race) {
    const S = this.session; if (!S.ghost) return;
    if (P.lap >= 1) {
      S.ghostT += dt;
      if (S.ghostRec.length === 0 || S.ghostT - S.ghostRec.length * 0.05 >= 0) S.ghostRec.push(+P.x.toFixed(2), +P.y.toFixed(2), +P.h.toFixed(3));
    }
    const g = S.ghost, d = g.data;
    if (d && P.lap >= 1) {
      const f = (race.time - P.lapStart) / 0.05, i = Math.floor(f), k = f - i;
      if ((i + 1) * 3 + 2 < d.length) {
        const x = lerp(d[i * 3], d[i * 3 + 3], k), y = lerp(d[i * 3 + 1], d[i * 3 + 4], k), h = d[i * 3 + 2] + angleDiff(d[i * 3 + 5], d[i * 3 + 2]) * k;
        g.mesh.grp.visible = true; g.mesh.grp.position.copy(W(x, y, 0)); g.mesh.grp.rotation.y = h;
      } else g.mesh.grp.visible = false;
    } else g.mesh.grp.visible = false;
  },
  updateVisuals(dt, S, inp) {
    const race = S.race, P = race.player, T = race.track;
    // lights gantry
    this.lightMats.forEach((m, k) => { const on = race.phase !== 'green' && race.lightsOn > k; m.emissiveIntensity = on ? 8 : 0; m.color.setHex(on ? 0xff3030 : 0x1a0000); });
    for (const c of race.cars) {
      const m = c.mesh;
      m.grp.position.set(c.x, 0, -c.y); m.grp.rotation.y = c.h;
      m.body.rotation.z = clamp(c.axS * 0.0016, -0.02, 0.012);
      m.body.rotation.x = clamp(c.ay * 0.0011, -0.025, 0.025);
      // the driver's head leans with lateral load and nods under braking
      m.helmet.rotation.x = lerp(m.helmet.rotation.x, clamp(c.ay * 0.006, -0.22, 0.22), Math.min(1, dt * 8));
      m.helmet.rotation.z = lerp(m.helmet.rotation.z, clamp(c.axS * 0.004, -0.14, 0.08), Math.min(1, dt * 8));
      m.body.position.y = -Math.min(0.02, c.vx * c.vx * 0.0000025) + (c.kerbHit ? (Math.random() - 0.5) * 0.012 : 0);
      m.wheels.forEach((w) => (w.rotation.z = -c.wheelAng));
      // spokes blur into a disc at speed
      const bl = clamp((Math.abs(c.vx) - 12) / 30, 0, 0.92);
      m.blurs.forEach((b) => { b.visible = bl > 0.02; b.material.opacity = bl; });
      m.steer.forEach((s) => (s.rotation.y = c.delta));
      // steering wheel turns ~100 degrees each way at full lock; arms follow the grips
      m.swSpin.rotation.x = -(c.delta / c.p.maxSteer) * 1.75;
      // level of detail: on the lowest quality, distant drivers are hidden and arms only animate nearby
      const far = dx0(c, P), lod = settings.quality === 0 ? 70 : 220;
      if (m.avatar) m.avatar.root.visible = c === P || far < lod;
      if (m.modelBody && m.modelBody.userData.lod) m.modelBody.geometry = m.modelBody.userData.lod[c === P || far < 45 ? 0 : 1];
      if (c === P || far < Math.min(150, lod)) updateArms(m);
      // active aero: flaps open in X-mode
      const fl = c.aeroX ? 1 : 0; m.aeroT = lerp(m.aeroT || 0, fl, Math.min(1, dt * 8));
      m.flapPivot.rotation.z = -0.45 + m.aeroT * 0.38;
      m.fw[0].rotation.z = m.aeroT * 0.18; m.fw[1].rotation.z = m.aeroT * 0.26;
      m.rainLight.material.emissiveIntensity = (c.harvesting || race.env.wet > 0.3) && (performance.now() % 400 < 200) ? 6 : 0;
      // brake discs glow under heavy braking
      m.brakeT = clamp(m.brakeT + (c.brake * Math.max(0, c.vx) * 0.0006 - m.brakeT * 0.35) * dt * 10, 0, 1);
      m.discs.forEach((dsc) => (dsc.material.emissiveIntensity = Math.max(0, m.brakeT - 0.3) * 6));
      m.frontWingOk = c.wingHealth;
      // a badly damaged front wing loses its flaps and one endplate until it is replaced in the pits
      const broken = c.wingHealth < 0.5;
      if (m.fwParts && broken !== !!m.wingBroken) { m.wingBroken = broken; m.fw.forEach((g) => (g.visible = !broken)); m.fwParts.end.visible = !broken; if (broken && this.particles.sparks) this.particles.sparks(c); }
      // particles near the camera
      const dx = c.x - P.x, dy = c.y - P.y;
      if (dx * dx + dy * dy < 160 * 160) this.particles.emitFor(c, dt);
    }
    this.particles.update(dt);
    PitCrew.update(dt, race, this.audio, this.camera.position);
    this.weatherVisuals(dt, race);
    Crowd.update(dt, race, P);
    // crowd: always a little movement, jumping when cars are close to the camera or at the start
    if (GFX.crowdMat) {
      const u = GFX.crowdMat.userData; u.time.value += dt;
      const near = race.cars.some((c) => (c.x - P.x) ** 2 + (c.y - P.y) ** 2 < 900 && c !== P) || race.phase !== 'green' || race.greenT < 8 || P.finished;
      u.excite.value += ((near ? 1 : 0.25) - u.excite.value) * Math.min(1, dt * 2);
    }
    // camera
    const cam = this.camera, mode = S.camMode;
    const fwd = new THREE.Vector3(Math.cos(P.h), 0, -Math.sin(P.h));
    const base = new THREE.Vector3(P.x, 0, -P.y);
    P.mesh.helmet.visible = P.mesh.visor.visible = P.mesh.shoulders.visible = mode !== 'cockpit';
    if (this.grade) this.grade.uniforms.speed.value = race.phase === 'green' ? clamp((P.vx - 45) / 45, 0, 1) * (mode === 'far' ? 0.4 : 1) : 0;
    S.shake = lerp(S.shake, (P.kerbHit ? 0.006 * P.kerbHit : 0) + Math.min(0.002, P.vx * 0.00002), 0.2);
    const look = inp.lookBack ? Math.PI : 0;
    if (mode === 'cockpit' || mode === 'tcam') {
      // driver's eye: further back from the wheel and a little higher, so the wheel sits low and the road fills the view
      const local = mode === 'cockpit' ? new THREE.Vector3(-0.15, 0.905 - clamp(P.axS, -40, 30) * 0.0006, clamp(P.ay, -50, 50) * 0.0009) : new THREE.Vector3(-0.35, 1.22, 0);
      local.y += (Math.random() - 0.5) * S.shake; local.z += (Math.random() - 0.5) * S.shake;
      P.mesh.body.updateMatrixWorld(); P.mesh.grp.updateMatrixWorld();
      const wp = local.applyMatrix4(P.mesh.body.matrixWorld);
      cam.position.copy(wp);
      const yaw = P.h + look + clamp(P.r * 0.04, -0.08, 0.08) * (mode === 'cockpit' ? 1 : 0);
      const tgt = wp.clone().add(new THREE.Vector3(Math.cos(yaw), mode === 'cockpit' ? -0.055 : -0.09, -Math.sin(yaw)));
      cam.up.set(0, 1, 0); cam.lookAt(tgt);
      cam.rotateZ(-P.mesh.body.rotation.x * 0.6);
      cam.fov = settings.fov; cam.near = mode === 'cockpit' ? 0.06 : 0.12;
    } else if (P.pit && GFX.pit && (P.pit.phase === 'stop' || P.pit.phase === 'queue' || (P.pit.phase === 'in' && P.pit.box - P.pit.s < 30) || (P.pit.phase === 'out' && P.pit.s < P.pit.box + 12))) {
      // TV angle on the pit box: from the fast-lane side, ahead of the car, looking back across the crew at the garage
      const G = GFX.pit, b = P.pit.box, eye = G.at(b + 7.5, G.P.workDist - 5.5, 2.4), tgt = G.at(b - 0.4, G.P.workDist + 0.8, 0.6);
      cam.position.lerp(eye, S.pitCam ? Math.min(1, dt * 3) : 1); S.pitCam = true; cam.up.set(0, 1, 0); cam.lookAt(tgt); cam.fov = 50; cam.near = 0.1;
    } else {
      S.pitCam = false;
      const dist = mode === 'chase' ? 7.2 : 11.5, hgt = mode === 'chase' ? 2.3 : 3.6;
      if (!S.camSmooth) S.camSmooth = { h: P.h };
      S.camSmooth.h += angleDiff(P.h + look, S.camSmooth.h) * Math.min(1, dt * 6);
      const ch = S.camSmooth.h, back = new THREE.Vector3(-Math.cos(ch), 0, Math.sin(ch));
      cam.position.copy(base).addScaledVector(back, dist).add(new THREE.Vector3(0, hgt, 0));
      cam.up.set(0, 1, 0);
      cam.lookAt(base.clone().addScaledVector(fwd, look ? -3 : 3).add(new THREE.Vector3(0, 0.9, 0)));
      cam.fov = settings.fov + Math.min(8, P.vx * 0.06); cam.near = 0.3;
    }
    cam.updateProjectionMatrix();
    // sun follows the player for crisp shadows
    this.sun.target.position.copy(base).addScaledVector(fwd, 25);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 200);
    this.sky.position.copy(cam.position);
    // mirrors
    if (S.mirror && mode === 'cockpit') {
      // each glass looks back and slightly outward from where it sits; the two sides update on alternate frames
      const sd = S.mirror.sides[S.mirror.n++ % 2], mc = sd.cam;
      sd.glass.getWorldPosition(mc.position);
      const back = fwd.clone().negate(), side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(sd.side); // car-right is +z in the body
      mc.lookAt(mc.position.clone().add(back.multiplyScalar(10)).addScaledVector(side, 1.6).add(new THREE.Vector3(0, -0.35, 0)));
      const vis = P.mesh.grp.visible; P.mesh.grp.visible = false;
      this.renderer.setRenderTarget(sd.rt); this.renderer.render(this.scene, mc); this.renderer.setRenderTarget(null);
      P.mesh.grp.visible = vis;
    }
    // steering wheel display at 20 Hz
    // wheel LEDs and rotaries follow the car every frame; the screen redraws at 20 Hz
    {
      const Wl = S.wheel, fr = clamp((P.rpm - 9500) / (P.p.redline - 9500), 0, 1), lit = Math.round(fr * 15), flash = P.rpm > P.p.redline - 150 && performance.now() % 160 < 80;
      Wl.leds.forEach((m, k) => (m.emissiveIntensity = flash ? (k >= 10 ? 4 : 0) : k < lit ? 3.5 : 0));
      Wl.flags.forEach((m) => (m.emissiveIntensity = P.overtakeOn && P.overtakeAvail ? 3 : P.overtakeAvail ? 1 : 0));
      Wl.rotaries[0].rotation.z = -(P.ersMode - 1) * 0.6; Wl.rotaries[2].rotation.z = -(P.bias - 0.56) * 12;
      Wl.t += dt; if (mode !== 'far' && Wl.t > 0.05) { Wl.t = 0; drawWheelDisplay(Wl, P, race); }
    }
    // audio: player + the closest other car
    let other = null, best = 60;
    for (const c of race.cars) { if (c === P) continue; const d = Math.hypot(c.x - P.x, c.y - P.y); if (d < best) { best = d; other = c; } }
    const st = { rain: race.env.rain, player: P, inCockpit: mode === 'cockpit', crowd: Crowd.noise(race, P) };
    if (other) {
      const rx = other.x - P.x, ry = other.y - P.y, side = -(rx * -Math.sin(P.h) + ry * Math.cos(P.h)) / (best + 1);
      st.other = { car: other, gain: 0.5 * (1 - best / 60), pan: clamp(side, -1, 1) };
    }
    this.audio.update(dt, st);
    if (this.touchOn) {
      // no on-screen wheel graphic: the real wheel shows in the cockpit; the same area still steers
      const ts = $('#t-steer'); if (ts && !ts.classList.contains('ghost')) ts.classList.add('ghost');
    }
    if (this.touchOn && this.input.drawTouchWheel) this.input.drawTouchWheel(this.input.state.steer || 0, P.reverse ? 'R' : P.gear, clamp((P.rpm - 9500) / (P.p.redline - 9500), 0, 1));
    if (this.touchOn && this.input.buzz) { if (P.impact > 3) this.input.buzz(60); else if (P.kerbHit && Math.random() < 0.08) this.input.buzz(6); }
    if (P.impact > 3) { this.audio.thud(P.impact); Hud.rumble(1, 0.8, 150); }
    else if (P.kerbHit) Hud.rumble(0.25, 0.5, 60);
    else if (P.lockF || P.lockR || P.spin) Hud.rumble(0.15, 0.35, 60);
  },
};

// with the player's own music (Spotify, Apple Music...) the game's sounds mix in instead of stopping it (iOS 17+ Safari)
// iPhone: web audio is muted by the silent switch unless the page asks for media playback. iOS 17+ has
// navigator.audioSession; older iOS switches category when an <audio> element plays, so a silent loop is started.
const applyAudioSession = () => {
  const own = settings.musicSource === 'own';
  try { if (navigator.audioSession) navigator.audioSession.type = own ? 'ambient' : 'playback'; } catch (e) { /* not supported */ }
  if (own || !/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) || !('ontouchend' in document)) return;
  if (!window.__silentAudio) {
    const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='); a.loop = true; a.setAttribute('playsinline', ''); a.volume = 0.01;
    window.__silentAudio = a;
  }
  window.__silentAudio.play().catch(() => {});
};
// music level while racing, relative to the menu
const raceMusic = () => ({ off: 0, quiet: 0.35, full: 1 }[settings.musicRace] ?? 0.35);
const dx0 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const _v = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _pole = new THREE.Vector3();
// turn a bone (in world space) so that the point `from` on its chain moves toward `to`
function aimBone(bone, from, to) {
  bone.getWorldPosition(_a); _b.copy(from).sub(_a).normalize(); _c.copy(to).sub(_a).normalize();
  _q1.setFromUnitVectors(_b, _c); bone.getWorldQuaternion(_q2); bone.parent.getWorldQuaternion(_q3);
  bone.quaternion.copy(_q3.invert().multiply(_q1.multiply(_q2))); bone.updateMatrixWorld(true);
}
function updateArms(m) {
  m.body.updateMatrixWorld(true);
  if (m.avatar) {
    // two-bone IK: wrist to just behind each grip, elbow bending down and out
    const down = new THREE.Vector3(0, -1, 0).transformDirection(m.body.matrixWorld);
    for (const a of m.arms) {
      const k = m.avatar.ik[a.sd < 0 ? 0 : 1]; // model's left arm is the car's -z side
      k.up.quaternion.copy(k.rest[0]); k.fore.quaternion.copy(k.rest[1]); k.up.updateMatrixWorld(true);
      const S = k.up.getWorldPosition(new THREE.Vector3()), E0 = k.fore.getWorldPosition(new THREE.Vector3()), H0 = k.hand.getWorldPosition(new THREE.Vector3());
      const la = S.distanceTo(E0), lb = E0.distanceTo(H0);
      a.hand.getWorldPosition(_t); if (!a.hand.userData.wrist) _t.add(_c.set(-0.07, -0.01, 0).transformDirection(m.body.matrixWorld).multiplyScalar(0.07));
      const d = Math.min(S.distanceTo(_t), (la + lb) * 0.995), n = _t.clone().sub(S).normalize(), T = S.clone().addScaledVector(n, d);
      const x = (la * la - lb * lb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, la * la - x * x));
      _pole.copy(down).multiplyScalar(0.25).add(_c.set(0, 0, a.sd).transformDirection(m.body.matrixWorld)); // elbows out to the sides, as in a real cockpit _pole.addScaledVector(n, -_pole.dot(n)).normalize();
      const E = S.clone().addScaledVector(n, x).addScaledVector(_pole, h);
      aimBone(k.up, E0, E); aimBone(k.fore, k.hand.getWorldPosition(new THREE.Vector3()), T);
    }
    return;
  }
  for (const a of m.arms) {
    a.hand.getWorldPosition(_v); m.body.worldToLocal(_v);
    const dir = _v.sub(a.elbow), len = dir.length();
    a.fore.position.copy(a.elbow); a.fore.quaternion.setFromUnitVectors(_Y, dir.normalize()); a.fore.scale.set(1, len, 1);
  }
}

function drawWheelDisplay(W2, P, race) {
  const g = W2.ctx, w = 512, h = 256;
  g.fillStyle = '#050607'; g.fillRect(0, 0, w, h);
  // top strip: lap delta bar
  const dl0 = Hud.delta; g.fillStyle = '#15171b'; g.fillRect(16, 10, w - 32, 22);
  if (dl0 !== null) { g.fillStyle = dl0 < 0 ? '#2bd46a' : '#ff4d4d'; const bw = clamp(Math.abs(dl0) / 1.5, 0, 1) * (w / 2 - 16); g.fillRect(dl0 < 0 ? w / 2 : w / 2 - bw, 10, bw, 22); }
  g.fillStyle = '#ffffff'; g.fillRect(w / 2 - 1, 8, 2, 26);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; g.font = '700 120px "Saira Condensed", Arial Narrow, sans-serif';
  g.fillText(P.reverse ? 'R' : String(P.gear), w / 2, 140);
  g.font = '600 46px "Saira Condensed", Arial Narrow, sans-serif';
  const spd = settings.units === 'mph' ? P.vx * 2.237 : P.vx * 3.6;
  g.fillText(String(Math.max(0, Math.round(spd))), 90, 100);
  g.font = '500 20px "Saira Condensed", Arial Narrow, sans-serif'; g.fillStyle = '#8d96a6';
  g.fillText(settings.units === 'mph' ? 'MPH' : 'KM/H', 90, 132);
  // delta to best
  const dl = Hud.delta;
  g.font = '600 38px "Saira Condensed", Arial Narrow, sans-serif';
  g.fillStyle = dl === null ? '#8d96a6' : dl < 0 ? '#2bd46a' : '#ff4d4d';
  g.fillText(dl === null ? '--.--' : (dl < 0 ? '-' : '+') + Math.abs(dl).toFixed(2), 90, 182);
  // ERS
  g.fillStyle = '#1a1c20'; g.fillRect(372, 70, 110, 22);
  g.fillStyle = P.overtakeOn && P.overtakeAvail ? '#b46bff' : '#ffd21f'; g.fillRect(372, 70, 110 * (P.soc / SOC_MAX), 22);
  g.fillStyle = '#fff'; g.font = '600 24px "Saira Condensed", Arial Narrow, sans-serif';
  g.fillText(ERS_MODES[P.ersMode].name, 427, 116);
  g.fillStyle = P.aeroX ? '#29e05a' : '#8d96a6'; g.fillText(P.aeroX ? 'X-MODE' : 'Z-MODE', 427, 150);
  g.fillStyle = '#fff'; g.fillText(`BB ${(P.bias * 100).toFixed(1)}`, 427, 184);
  // footer
  g.font = '500 22px "Saira Condensed", Arial Narrow, sans-serif'; g.fillStyle = '#c8ced8';
  const pos = race.standings().indexOf(P) + 1;
  g.fillText(`P${pos}   L${Math.max(1, P.lap)}${race.mode === 'race' ? '/' + race.laps : ''}   TC ${['OFF', 'MED', 'FULL'][P.assist.tc]}   T ${P.tempF.toFixed(0)}/${P.tempR.toFixed(0)}°`, w / 2, 232);
  W2.tex.needsUpdate = true;
}

// ---- particles: sparks from the skid blocks, tyre smoke, dust --------------
class Particles {
  constructor(scene) {
    this.scene = scene;
    this.sets = {};
    const mk = (name, n, tex, size, blending, color) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3).fill(0), vel = new Float32Array(n * 3), life = new Float32Array(n);
      pos.fill(-9999);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ size, map: tex, transparent: true, depthWrite: false, blending, color, sizeAttenuation: true });
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
      this.sets[name] = { pts, pos, vel, life, n, next: 0, drag: name === 'spark' ? 0.4 : 2.5, grav: name === 'spark' ? -9 : 0.6, max: name === 'spark' ? 0.35 : 1.4 };
    };
    this.ready = (tex) => {
      mk('spark', 600, tex.spark, 0.12, THREE.AdditiveBlending, 0xffffff);
      mk('smoke', 300, tex.smoke, 2.2, THREE.NormalBlending, 0xdddddd);
      mk('dust', 300, tex.smoke, 2.6, THREE.NormalBlending, 0xb59a72);
      mk('spray', 700, tex.smoke, 2.4, THREE.NormalBlending, 0xb4bac2); this.sets.spray.pts.material.opacity = 0.35;
    };
    if (GFX.tex) this.ready(GFX.tex);
  }
  spawn(name, x, y, z, vx, vy, vz) {
    const s = this.sets[name]; if (!s) return;
    const i = s.next; s.next = (s.next + 1) % s.n;
    s.pos[i * 3] = x; s.pos[i * 3 + 1] = y; s.pos[i * 3 + 2] = z; s.vel[i * 3] = vx; s.vel[i * 3 + 1] = vy; s.vel[i * 3 + 2] = vz; s.life[i] = s.max * (0.6 + Math.random() * 0.4);
  }
  emitFor(c, dt) {
    if (!this.sets.spark) { if (GFX.tex) this.ready(GFX.tex); else return; }
    const ch = Math.cos(c.h), sh = Math.sin(c.h), wx = c.vx * ch - c.vy * sh, wy = c.vx * sh + c.vy * ch;
    const kmh = c.vx * 3.6;
    // rain spray thrown up behind the rear tyres
    const wet = c.env ? c.env.wet : 0;
    if (wet > 0.2 && kmh > 50) { const n = Math.min(2, Math.floor(wet * kmh * dt * 0.35 + Math.random() * 0.6)); for (let k = 0; k < n; k++) { const sd = Math.random() < 0.5 ? 0.75 : -0.75; this.spawn('spray', c.x - ch * 2.2 - sh * sd, 0.35 + Math.random() * 0.3, -(c.y - sh * 2.2 + ch * sd), wx * 0.35 + (Math.random() - 0.5) * 3, 1.2 + Math.random() * 1.5, -wy * 0.35 + (Math.random() - 0.5) * 3); } }
    // titanium skid blocks: sparks at high speed, more over kerbs and when braking hard
    const rate = kmh > 250 ? (kmh - 250) * 0.9 + (c.kerbHit ? 60 : 0) + (c.brake > 0.5 ? 30 : 0) : 0;
    let n = rate * dt; while (n > 0) {
      if (Math.random() < n) {
        const off = -0.6 - Math.random() * 1.2, lat = (Math.random() - 0.5) * 1.2;
        const x = c.x + ch * off - sh * lat, y = c.y + sh * off + ch * lat;
        this.spawn('spark', x, 0.03, -y, wx * 0.75 + (Math.random() - 0.5) * 6, 1 + Math.random() * 3, -(wy * 0.75 + (Math.random() - 0.5) * 6));
      }
      n -= 1;
    }
    const sliding = (c.lockF || c.lockR || c.spin || Math.abs(c.slipR) > 0.16) && c.speed > 4;
    if (sliding && (c.surface === 'tarmac' || c.surface === 'kerb') && Math.random() < dt * 40) {
      const off = c.lockF ? 1.8 : -1.8;
      for (const s of [0.8, -0.8]) this.spawn('smoke', c.x + ch * off - sh * s, 0.35, -(c.y + sh * off + ch * s), wx * 0.2, 0.6, -wy * 0.2);
    }
    if ((c.surface === 'gravel' || c.surface === 'grass') && c.speed > 5 && Math.random() < dt * 30)
      this.spawn('dust', c.x - ch * 1.8, 0.4, -(c.y - sh * 1.8), wx * 0.3 + (Math.random() - 0.5) * 3, 1.2, -wy * 0.3);
  }
  update(dt) {
    for (const k in this.sets) {
      const s = this.sets[k];
      for (let i = 0; i < s.n; i++) {
        if (s.life[i] <= 0) continue;
        s.life[i] -= dt;
        if (s.life[i] <= 0) { s.pos[i * 3 + 1] = -9999; continue; }
        const f = Math.exp(-s.drag * dt);
        s.vel[i * 3] *= f; s.vel[i * 3 + 2] *= f; s.vel[i * 3 + 1] = s.vel[i * 3 + 1] * f + s.grav * dt;
        s.pos[i * 3] += s.vel[i * 3] * dt; s.pos[i * 3 + 1] = Math.max(0.02, s.pos[i * 3 + 1] + s.vel[i * 3 + 1] * dt); s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
      }
      s.pts.geometry.attributes.position.needsUpdate = true;
    }
  }
}

// ---- HUD --------------------------------------------------------------------
const Hud = {
  delta: null, lastFlash: 0,
  show(race) {
    $('#hud').hidden = false;
    const tower = $('#tower'); tower.innerHTML = '';
    this.rows = race.cars.map(() => { const r = document.createElement('div'); r.className = 'trow'; r.innerHTML = '<span class="tp"></span><span class="tc"></span><span class="td"></span><span class="tg"></span>'; tower.appendChild(r); return r; });
    $('#tower-wrap').hidden = race.mode !== 'race';
    $('#lightsbar').hidden = race.mode !== 'race';
    this.t = 0; this.delta = null; this.refLap = null; this.curLap = []; this.lastLapT = -1;
    $('#h-best').textContent = '--:--.---'; $('#h-last').textContent = '--:--.---';
    $$('.sec').forEach((s) => (s.className = 'sec'));
    const ttBest = race.mode === 'trial' ? store.get('tt.' + race.track.spec.id, null) : race.mode === 'practice' ? store.get('pr.' + race.track.spec.id, null) : null;
    $('#h-pb-wrap').hidden = !ttBest; if (ttBest) $('#h-pb').textContent = fmtTime(ttBest.time);
    $('#h-track').textContent = race.track.spec.name;
  },
  hide() { $('#hud').hidden = true; },
  buildMap(T) {
    const c = document.createElement('canvas'); const S = 220; c.width = c.height = S * 2;
    const g = c.getContext('2d'); const b = T.bounds, sc = (S * 2 - 40) / Math.max(b.maxX - b.minX, b.maxY - b.minY);
    const ox = (S * 2 - (b.maxX - b.minX) * sc) / 2, oy = (S * 2 - (b.maxY - b.minY) * sc) / 2;
    this.mapTf = (x, y) => [(x - b.minX) * sc + ox, S * 2 - ((y - b.minY) * sc + oy)];
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => { g.beginPath(); for (let i = 0; i <= T.n; i += 2) { const [x, y] = this.mapTf(T.px[i % T.n], T.py[i % T.n]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 12; path(); g.stroke();
    g.strokeStyle = '#d9dee6'; g.lineWidth = 5; path(); g.stroke();
    // aero zones
    g.strokeStyle = '#2bd46a'; g.lineWidth = 5;
    for (let i = 0; i < T.n; i++) if (T.aeroZone[i] && T.aeroZone[(i + 1) % T.n]) { const [x1, y1] = this.mapTf(T.px[i], T.py[i]); const [x2, y2] = this.mapTf(T.px[(i + 1) % T.n], T.py[(i + 1) % T.n]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
    const [sx, sy] = this.mapTf(T.px[0], T.py[0]); g.fillStyle = '#ffd21f'; g.fillRect(sx - 6, sy - 6, 12, 12);
    this.mapBase = c;
  },
  update(dt, S, inp) {
    const race = S.race, P = race.player;
    // minimap every frame
    const mc = $('#minimap'), g = mc.getContext('2d');
    g.clearRect(0, 0, mc.width, mc.height); g.drawImage(this.mapBase, 0, 0, mc.width, mc.height);
    const k = mc.width / this.mapBase.width;
    for (const c of race.cars) {
      const [x, y] = this.mapTf(c.x, c.y);
      g.fillStyle = c.team.c1; g.strokeStyle = c === P ? '#fff' : '#000'; g.lineWidth = c === P ? 3 : 1.5;
      g.beginPath(); g.arc(x * k, y * k, c === P ? 7 : 5, 0, 7); g.fill(); g.stroke();
    }
    // lap timing + delta
    const lapT = P.lap >= 1 ? race.time - P.lapStart : 0;
    if (P.lap >= 1) {
      const pos = P.dist - (P.lap - 1) * race.track.length;
      if (this.lastLapT !== P.lap) { this.lastLapT = P.lap; this.curLap = []; }
      const bucket = Math.floor(pos / 25);
      if (bucket >= 0 && this.curLap[bucket] === undefined) this.curLap[bucket] = lapT;
      this.delta = this.refLap && this.refLap[bucket] !== undefined && this.curLap[bucket] !== undefined ? this.curLap[bucket] - this.refLap[bucket] : null;
    }
    this.t += dt; if (this.t < 0.08) return; this.t = 0;
    const kmh = Math.max(0, P.vx * 3.6);
    $('#h-speed').textContent = Math.round(settings.units === 'mph' ? kmh / 1.609 : kmh);
    $('#h-unit').textContent = settings.units === 'mph' ? 'mph' : 'km/h';
    $('#h-gear').textContent = P.reverse ? 'R' : P.gear;
    $('#h-rpm').style.transform = `scaleX(${clamp((P.rpm - 4000) / (P.p.redline - 4000), 0, 1)})`;
    $('#h-rpm').classList.toggle('shift', P.rpm > P.p.redline - 400);
    $('#h-ers').style.transform = `scaleX(${P.soc / SOC_MAX})`;
    $('#h-ers').classList.toggle('ot', P.overtakeOn && P.overtakeAvail);
    $('#h-ersmode').textContent = ERS_MODES[P.ersMode].name;
    $('#h-bias').textContent = (P.bias * 100).toFixed(1) + '%';
    $('#h-aero').textContent = P.aeroX ? 'X-mode' : 'Z-mode'; $('#h-aero').classList.toggle('on', P.aeroX);
    $('#h-aero').classList.toggle('avail', !P.aeroX && race.track.aeroZone[P.idx] === 1);
    $('#h-ot').hidden = !P.overtakeAvail; $('#h-ot').classList.toggle('on', P.overtakeOn);
    $('#h-tc').textContent = ['Off', 'Med', 'Full'][P.assist.tc]; $('#h-abs').textContent = P.assist.abs ? 'On' : 'Off';
    const tcol = (t) => (t < 80 ? '#4aa3ff' : t > 118 ? '#ff4d4d' : '#2bd46a');
    $('#h-tf').style.background = tcol(P.tempF); $('#h-tr').style.background = tcol(P.tempR);
    $('#h-tft').textContent = P.tempF.toFixed(0) + '°'; $('#h-trt').textContent = P.tempR.toFixed(0) + '°';
    $('#h-wear').textContent = `${COMPOUNDS[P.compound].name} ${Math.round((1 - P.wear) * 100)}%${P.pitReq ? ` · BOX → ${P.pitReq}` : ''}${S.race.env.wet > 0.05 ? ` · track ${Math.round(S.race.env.wet * 100)}% wet` : ''}`; $('#h-wear').style.color = COMPOUNDS[P.compound].color;
    $('#h-wing').hidden = P.wingHealth > 0.85;
    { const r = S.race, el = $('#h-vsc'); el.hidden = !r.vsc; if (r.vsc) el.textContent = `VSC ≤ ${Math.round(r.vscCap(P) * (settings.units === 'mph' ? 2.237 : 3.6))}`; }
    $('#h-lap').textContent = race.mode === 'race' ? `${clamp(P.lap, 1, race.laps)}/${race.laps}` : String(Math.max(1, P.lap));
    $('#h-time').textContent = P.lap >= 1 ? fmtTime(lapT) : '0:00.000';
    $('#h-time').classList.toggle('invalid', race.mode !== 'race' && !P.lapValid);
    $('#h-delta').textContent = this.delta === null ? '' : (this.delta < 0 ? '-' : '+') + Math.abs(this.delta).toFixed(2);
    $('#h-delta').className = this.delta === null ? '' : this.delta < 0 ? 'good' : 'bad';
    $('#h-pos').textContent = race.mode === 'race' ? `P${race.standings().indexOf(P) + 1}` : race.quali ? 'Qualifying' : 'Time trial';
    // sectors in progress
    const secs = $$('.sec');
    secs.forEach((el, i) => {
      const t = P.sectorTimes[i];
      if (!isNaN(t)) { el.className = 'sec ' + (t <= race.bestSectors[i] + 1e-6 ? 'purple' : t <= (this.pbSec ? this.pbSec[i] : Infinity) ? 'green' : 'yellow'); }
      else if (i === P.sector) el.className = 'sec live';
      else if (P.sector < i) el.className = 'sec';
    });
    // start lights overlay
    const lb = $('#lightsbar');
    if (race.mode === 'race' && race.phase !== 'green') { lb.hidden = false; $$('.lamp', lb).forEach((l, i) => l.classList.toggle('on', race.lightsOn > i)); }
    else if (race.greenT > 1.5) lb.hidden = true; else $$('.lamp', lb).forEach((l) => l.classList.remove('on'));
    // timing tower
    if (race.mode === 'race') {
      const st = race.standings(), leader = st[0];
      st.forEach((c, i) => {
        const r = this.rows[i]; r.classList.toggle('me', c === P);
        r.children[0].textContent = i + 1;
        r.children[1].style.background = c.team.c1;
        r.children[2].textContent = c.driver.abbr || c.driver.code;
        let gap;
        if (i === 0) gap = c.finished ? 'Finish' : 'Leader';
        else {
          const lapsDown = Math.floor((leader.dist - c.dist) / race.track.length);
          gap = lapsDown >= 1 && !c.finished ? `+${lapsDown} lap` : fmtGap(race.gapBetween(leader, c));
        }
        r.children[3].textContent = gap;
      });
    }
    // dashboard visibility per camera
    const showDash = settings.hud === 'full' || (settings.hud === 'auto' && S.camMode !== 'cockpit');
    $('#dash').classList.toggle('compact', !showDash);
    $('#h-device').textContent = { keyboard: 'Keyboard', gamepad: 'Gamepad', wheel: 'Wheel' }[App.input.lastDevice];
    // banners expire
    const bn = $('#banner'); if (bn.dataset.until && performance.now() > +bn.dataset.until) { bn.hidden = true; bn.dataset.until = ''; }
    const fl = $('#flash'); if (fl.dataset.until && performance.now() > +fl.dataset.until) { fl.hidden = true; fl.dataset.until = ''; }
  },
  lapDone(e, race) {
    const P = race.player;
    $('#h-last').textContent = fmtTime(e.time) + (e.valid ? '' : ' ✕');
    $('#h-last').className = e.overall ? 'purple' : e.best ? 'green' : '';
    if (isFinite(P.bestLap)) $('#h-best').textContent = fmtTime(P.bestLap);
    if (e.valid && e.time <= P.bestLap + 1e-6) { this.refLap = this.curLap.slice(); this.pbSec = P.lastSectors.slice(); }
    if (race.mode === 'trial' || race.mode === 'race' || race.mode === 'practice') this.banner(`Lap ${fmtTime(e.time)}${e.valid ? (e.overall ? ' · fastest' : e.best ? ' · personal best' : '') : ' · invalid'}`, e.valid ? (e.overall ? 'purple' : e.best ? 'good' : 'info') : 'warn');
  },
  banner(text, kind = 'info') {
    const b = $('#banner'); b.textContent = text; b.className = 'banner ' + kind; b.hidden = false; b.dataset.until = performance.now() + 2600;
  },
  flash(text) { const f = $('#flash'); f.textContent = text; f.hidden = false; f.dataset.until = performance.now() + 1200; },
  rumble(strong, weak, dur) {
    const now = performance.now(); if (now - this.lastFlash < dur) return; this.lastFlash = now;
    const p = App.input.pad(); if (p && p.vibrationActuator && p.vibrationActuator.playEffect) p.vibrationActuator.playEffect('dual-rumble', { duration: dur, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  },
};

// ---- results ------------------------------------------------------------------
const Results = {
  show(race) {
    const rows = race.results(), P = race.player, winner = rows[0];
    const body = $('#res-body'); body.innerHTML = '';
    rows.forEach((r, i) => {
      const tr = document.createElement('tr'); if (r.car === P) tr.className = 'me';
      const lapsBehind = winner.laps - r.laps;
      const time = i === 0 ? fmtTime(r.total) : r.car.finished && lapsBehind === 0 ? fmtGap(r.total - winner.total) : r.car.finished ? `+${lapsBehind} lap${lapsBehind > 1 ? 's' : ''}` : 'Running';
      const fastest = rows.every((o) => o.best >= r.best) && isFinite(r.best);
      tr.innerHTML = `<td>${i + 1}</td><td><span class="swatch" style="background:${r.car.team.c1}"></span>${r.car.driver.name}</td><td>${r.car.team.name}</td><td class="num">${time}</td><td class="num ${fastest ? 'purple' : ''}">${fmtTime(r.best)}</td><td class="num">${r.penalty ? '+' + r.penalty + 's' : ''}</td><td class="num">${r.car.gridPos}</td>`;
      body.appendChild(tr);
    });
    const pos = rows.findIndex((r) => r.car === P) + 1;
    $('#res-title').textContent = `${race.track.spec.name}: you finished P${pos}`;
    if (App.cfg && App.cfg.career && !App.cfg.recorded) {
      App.cfg.recorded = true;
      const last = Career.recordRace(race);
      $('#res-title').textContent += ` · ${last.pts} points, +${last.earned} development`;
      $('#r-again').textContent = 'Continue career'; $('#r-menu').hidden = true;
    }
    $('#results').hidden = false;
  },
};

// ---- menu -----------------------------------------------------------------------
const Menu = {
  // side panels over the showroom: circuits | teams | opts | career | online | settings (null closes)
  drawer(d) {
    const m = $('#menu');
    if (!d) { delete m.dataset.drawer; return; }
    m.dataset.drawer = d;
    $('#drawer-title').textContent = { circuits: 'Circuit', teams: 'Team and driver', opts: 'Race settings', career: 'Career', online: 'Online race', settings: 'Settings' }[d];
    if (d === 'opts') $('#race-opts').open = true;
    const tab = d === 'settings' ? ($$('.tab').find((t) => t.getAttribute('aria-selected') === 'true' && t.dataset.panel !== 'p-race') || $$('.tab')[1]) : $$('.tab')[0];
    tab.click(); $('.menu-inner').scrollTop = 0;
  },
  // ‹ › on the bottom-bar pickers
  cycle(kind, dir) {
    if (kind === 'circuit') {
      const k = TRACKS.findIndex((t) => t.id === settings.track), spec = TRACKS[(k + dir + TRACKS.length) % TRACKS.length];
      settings.track = spec.id; App.preview(spec.id);
    } else {
      const all = TEAMS.flatMap((t) => t.drivers.map((d) => [t.id, d.code]));
      const k = all.findIndex(([t, c]) => t === settings.team && c === settings.driver), [t, c] = all[(Math.max(0, k) + dir + all.length) % all.length];
      settings.team = t; settings.driver = c; App.preview(settings.track);
    }
    saveSettings(); this.sync();
  },
  // YouTube music panel
  initYouTube() {
    const sel = $('#yt-list');
    sel.innerHTML = '<option value="random">Random mix (changes each time)</option>' + YT_PLAYLISTS.map((p, k) => `<option value="${k}">${p[0]}</option>`).join('') + '<option value="custom">My own playlist link…</option>';
    sel.value = settings.ytList ?? 'random'; $('#yt-url').value = settings.ytUrl || '';
    const own = () => ($('#yt-own').hidden = sel.value !== 'custom');
    own();
    sel.onchange = () => { settings.ytList = sel.value; saveSettings(); own(); if (sel.value !== 'custom') { YTMusic.session = null; YTMusic.play(YTMusic.pick()).catch(() => {}); } };
    $('#yt-load').onclick = () => {
      settings.ytUrl = $('#yt-url').value.trim(); saveSettings();
      if (!YTMusic.parse(settings.ytUrl)) { $('#yt-msg').textContent = 'That doesn\'t look like a YouTube playlist or video link.'; return; }
      $('#yt-msg').textContent = ''; YTMusic.play(settings.ytUrl).catch((e) => ($('#yt-msg').textContent = e.message));
    };
    $('#yt-shuffle').onclick = () => { if (sel.value !== 'random') { sel.value = 'random'; settings.ytList = 'random'; saveSettings(); own(); } YTMusic.shuffleList().catch(() => {}); };
    $('#yt-prev').onclick = () => YTMusic.prev(); $('#yt-next').onclick = () => YTMusic.next(); $('#yt-pp').onclick = () => YTMusic.toggle();
    YTMusic.onChange = () => { const t = YTMusic.title(); $('#yt-now').textContent = YTMusic.failed ? (YTMusic.msg || 'YouTube unavailable') : t ? `▶ ${t} · ${YTMusic.playlistName()}` : YTMusic.playlistName(); };
  },
  // Spotify panel
  initSpotify() {
    $('#sp-client').value = store.get('sp.client', '');
    $('#sp-redirect').innerHTML = `Redirect URI to add in your Spotify app: <code>${Spotify.redirect()}</code>`;
    const msg = (t) => ($('#sp-msg').textContent = t || '');
    $('#sp-client').onchange = () => store.set('sp.client', $('#sp-client').value.trim());
    $('#sp-login').onclick = () => { store.set('sp.client', $('#sp-client').value.trim()); Spotify.login().catch((e) => msg(e.message)); };
    $('#sp-logout').onclick = () => { Spotify.logout(); this.spotifyUI(); };
    const act = (f) => () => f().then(() => setTimeout(() => this.spotifyNow(), 500)).catch((e) => msg(e.message));
    $('#sp-prev').onclick = act(() => Spotify.prev()); $('#sp-next').onclick = act(() => Spotify.next());
    $('#sp-pp').onclick = act(() => Spotify.now().then((n) => (n && n.is_playing ? Spotify.pause() : Spotify.play())));
    $('#sp-playlist').onclick = act(() => Spotify.play($('#sp-list').value || undefined));
    Spotify.finishLogin().then((ok) => { if (ok) { settings.musicSource = 'spotify'; saveSettings(); App.music.stop(); this.sync(); this.drawer('settings'); $$('.tab').find((t) => t.dataset.panel === 'p-gfx')?.click(); msg('Spotify connected.'); } this.spotifyUI(); }).catch((e) => { msg(e.message); this.spotifyUI(); });
    setInterval(() => { if (Spotify.connected() && settings.musicSource === 'spotify' && !$('#menu').hidden) this.spotifyNow(); }, 8000);
  },
  spotifyUI() {
    const on = Spotify.connected();
    $('#sp-login').hidden = on; $('#sp-logout').hidden = !on; $('#sp-ctl').hidden = !on;
    if (on) {
      this.spotifyNow();
      Spotify.playlists().then((ls) => { $('#sp-list').innerHTML = '<option value="">Continue what was playing</option>' + ls.map((p) => `<option value="${p.uri}">${p.name.replace(/[<&]/g, '')}</option>`).join(''); }).catch((e) => ($('#sp-msg').textContent = e.message));
    }
  },
  spotifyNow() {
    Spotify.now().then((n) => { const it = n && n.item; $('#sp-now').textContent = it ? `${n.is_playing ? '▶' : '⏸'} ${it.name} · ${(it.artists || []).map((a) => a.name).join(', ')}${n.device ? ` (on ${n.device.name})` : ''}` : 'Nothing playing: pick a playlist and press Play'; }).catch(() => {});
  },
  // online room panel
  initOnline() {
    $('#on-name').value = store.get('netname', '') || '';
    const name = () => { const v = $('#on-name').value.trim() || 'Player'; store.set('netname', v); return v; };
    const need = () => { if (Net.available()) return true; $('#on-msg').textContent = 'Online play needs an internet connection (the connection library could not load).'; return false; };
    $('#on-create').onclick = () => need() && Net.create(name());
    $('#on-join').onclick = () => { const c = $('#on-code').value.trim(); if (c.length < 5) { $('#on-msg').textContent = 'Enter the 5-letter room code.'; return; } if (need()) Net.join(c, name()); };
    $('#on-start').onclick = () => Net.startRace();
    $('#on-leave').onclick = () => Net.leave();
    Net.onChange = () => {
      $('#on-msg').textContent = Net.msg ? Net.msg.text : ''; $('#on-msg').dataset.kind = Net.msg ? Net.msg.kind || '' : '';
      const ol = $('#on-players'); ol.innerHTML = '';
      for (const p of Net.players) { const li = document.createElement('li'); const tm = TEAMS.find((t) => t.id === p.team); li.textContent = `${p.name}${p.key === Net.me ? ' (you)' : ''}${p.host ? ' · host' : ''} · ${tm ? tm.name : ''} #${p.num}`; ol.appendChild(li); }
      $('#on-start').hidden = !(Net.host && Net.me); $('#on-leave').hidden = !Net.peer;
      $('#on-start').textContent = Net.players.length > 1 ? `Start race for everyone (${Net.players.length} drivers)` : 'Start race (waiting for friends… or race alone)';
    };
    Net.onStart = (m) => App.startOnline(m);
    Net.onState = (k, st) => { const S = App.session; if (S && S.online) S.race.setRemoteState(k, st, S.race.time); };
    Net.onFinish = (k) => { const S = App.session; if (!S || !S.online) return; const c = S.race.cars.find((x) => x.remote === k); if (c) Hud.flash(`${c.driver.name} finished`); };
    Net.onLeft = (k) => { const S = App.session; if (!S || !S.online) return; const c = S.race.cars.find((x) => x.remote === k); if (!c) return; c.net = null; c.x = 1e5; c.y = 1e5; if (c.mesh) c.mesh.grp.visible = false; Hud.banner(`${c.driver.name} left the race`, 'warn'); };
  },
  init() {
    this.initOnline(); this.initSpotify(); this.initYouTube();
    // circuits
    const grid = $('#circuits');
    TRACKS.forEach((spec) => {
      const T = App.getTrack(spec.id);
      const b = document.createElement('button'); b.className = 'circuit'; b.dataset.id = spec.id; b.type = 'button';
      b.innerHTML = `<canvas width="240" height="150"></canvas><span class="c-name">${spec.name}</span><span class="c-meta">${spec.country} · ${(T.length / 1000).toFixed(3)} km · ${T.corners} corners</span><span class="c-style">${spec.style}</span>`;
      drawMiniMap(b.querySelector('canvas'), T);
      b.onclick = () => { settings.track = spec.id; settings.laps = Math.max(1, Math.min(settings.laps, 60)); saveSettings(); this.sync(); App.preview(spec.id); this.drawer(null); };
      grid.appendChild(b);
    });
    this.buildTeams();
    this.buildRoster();
    // segmented controls
    $$('[data-set]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-v]'); if (!btn) return;
        const key = el.dataset.set; let v = btn.dataset.v;
        if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(+v) && key !== 'grid') v = +v;
        settings[key] = v; saveSettings(); this.sync();
        if (key === 'quality') { App.setupComposer(); App.resize(); App.preview(settings.track); }
        if (key === 'musicRace' && App.session) App.music.setDuck(raceMusic());
        if (key === 'musicSource') { applyAudioSession(); if (v === 'game') { App.audio.start(); App.music.start(); App.music.setDuck(App.session ? raceMusic() : 1); } else App.music.stop(); if (v === 'youtube') YTMusic.play().catch(() => {}); else YTMusic.stop(); if (v === 'spotify') this.spotifyUI(); }
      });
    });
    const range = (id, key, fmt, scale = 1) => {
      if (!$(id)) return;
      const el = $(id); el.value = settings[key] * scale;
      const out = $(id + '-out'); const upd = () => { settings[key] = +el.value / scale; out.textContent = fmt(settings[key]); saveSettings(); if (key === 'volume') App.audio.setVolume(settings.volume); if (key === 'music') App.music.setLevel(settings.music); if (this.sync) this.sync(); };
      el.addEventListener('input', upd); out.textContent = fmt(settings[key]);
    };
    range('#laps', 'laps', (v) => `${v} laps`); range('#opps', 'opponents', (v) => `${v} cars`); range('#traffic', 'traffic', (v) => (v ? `${v} cars` : 'None')); range('#aipace', 'aiPace', (v) => `${Math.round(v * 100)}%`, 100);
    range('#fov', 'fov', (v) => `${v}°`); range('#vol', 'volume', (v) => `${Math.round(v * 100)}%`, 100); range('#music', 'music', (v) => `${Math.round(v * 100)}%`, 100);
    range('#tsens', 'touchSens', (v) => `${v.toFixed(1)}×`, 10); range('#dz', 'deadzone', (v) => `${Math.round(v * 100)}%`, 100); range('#lin', 'linearity', (v) => v.toFixed(1), 10);
    // stepped menu
    // career and online need their own panel; the other modes race straight from the showroom
    $$('.modes button').forEach((b) => b.addEventListener('click', () => setTimeout(() => this.drawer(settings.mode === 'career' || settings.mode === 'online' ? settings.mode : null), 0)));
    $('#m-gear').onclick = () => this.drawer($('#menu').dataset.drawer === 'settings' ? null : 'settings');
    $('#drawer-close').onclick = () => this.drawer(null);
    $$('.pick-body').forEach((b) => (b.onclick = () => this.drawer(b.dataset.open)));
    $$('.pick .arr').forEach((b) => (b.onclick = () => this.cycle(b.closest('.pick').id === 'pick-circuit' ? 'circuit' : 'team', +b.dataset.d)));
    $('#open-opts').onclick = () => this.drawer('opts');
    $$('.tab').forEach((t) => (t.onclick = () => { $$('.tab').forEach((x) => x.setAttribute('aria-selected', x === t)); $$('.panel').forEach((p) => (p.hidden = p.id !== t.dataset.panel)); }));
    $('#start').onclick = () => App.start();
    // showroom keys, like the bumpers in console racers: Q/E change mode, Enter starts, Esc closes a panel
    addEventListener('keydown', (e) => {
      if ($('#menu').hidden || App.session || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      const modes = $$('.modes button');
      if (e.code === 'KeyQ' || e.code === 'KeyE') { const k = modes.findIndex((b) => b.dataset.v === settings.mode); modes[(k + (e.code === 'KeyE' ? 1 : -1) + modes.length) % modes.length].click(); }
      else if (e.code === 'Escape' && $('#menu').dataset.drawer) this.drawer(null);
      else if (e.code === 'Enter' && !$('#menu').dataset.drawer && !$('#start').hidden && document.activeElement === document.body) App.start();
    });
    $('#p-resume').onclick = () => App.togglePause(false);
    $('#p-restart').onclick = () => App.restart();
    $('#p-quit').onclick = () => App.quit();
    $('#r-again').onclick = () => {
      if (App.cfg && App.cfg.quali) { const g = Career.pendingGrid; App.quit(); setTimeout(() => Career.startRace(g), 50); return; }
      if (App.cfg && App.cfg.career) { $('#r-menu').hidden = false; App.quit(); return; }
      App.restart();
    };
    $('#r-menu').onclick = () => App.quit();
    $('#p-finishq').onclick = () => { $('#pause').hidden = true; App.paused = false; App.session.qualiDone = true; Career.finishQuali(App.session.race); };
    Career.init();
    this.buildBinds();
    this.sync();
    setInterval(() => this.padStatus(), 700);
  },
  // a team card: car portrait, pace tier, car ratings and each driver's rating
  teamCardHTML(tm) {
    const st = teamStats(tm), bar = (label, v) => `<div class="st"><span>${label}</span><i><s style="width:${v}%"></s></i><b>${v}</b></div>`;
    return `<img class="t-car" alt="" data-team="${tm.id}"><span class="livery" style="background:${tm.split ? `linear-gradient(180deg, ${tm.c2} 0 50%, ${tm.c1} 50% 100%)` : `linear-gradient(100deg, ${tm.c1} 0 58%, ${tm.c2} 58% 74%, ${tm.c3} 74% 100%)`}"></span>
      <span class="t-head"><span class="t-name"></span><span class="t-tier tier-${st.tier}">${st.tierLabel} · P${st.rank}</span></span>
      <div class="t-stats">${bar('Power', st.power)}${bar('Downforce', st.aero)}${bar('Drivers', st.drivers)}${bar('Overall', st.overall)}</div>`;
  },
  // render team car portraits (one at a time so the menu stays responsive)
  fillCarImages(root = document) {
    const imgs = $$('img.t-car', root).filter((im) => !im.src);
    const step = () => { const im = imgs.shift(); if (!im) return; const url = App.carThumb(TEAMS.find((t) => t.id === im.dataset.team)); if (url) im.src = url; requestAnimationFrame(step); };
    requestAnimationFrame(step);
  },
  buildTeams() {
    const tg = $('#teams'); tg.innerHTML = '';
    TEAMS.forEach((tm) => {
      const d = document.createElement('div'); d.className = 'team'; d.dataset.id = tm.id;
      d.innerHTML = this.teamCardHTML(tm) + `<span class="t-drivers">${tm.drivers.map((dr) => `<button type="button" class="drv" data-team="${tm.id}" data-code="${dr.code}"><b></b> <span></span><em title="Driver rating">${driverRating(dr)}</em></button>`).join('')}</span>`;
      d.querySelector('.t-name').textContent = tm.name;
      d.querySelectorAll('.drv').forEach((b, k) => { b.querySelector('b').textContent = tm.drivers[k].num; b.querySelector('span').textContent = tm.drivers[k].name; });
      tg.appendChild(d);
    });
    $$('.drv').forEach((b) => (b.onclick = () => { settings.team = b.dataset.team; settings.driver = b.dataset.code; saveSettings(); this.sync(); App.preview(settings.track); this.drawer(null); }));
    this.sync && this.sync();
    this.fillCarImages(tg);
  },
  // rename teams and drivers (kept on this device only)
  buildRoster() {
    const body = $('#roster-body'); body.innerHTML = '';
    TEAMS.forEach((tm) => {
      const sec = document.createElement('div'); sec.className = 'roster-team';
      sec.innerHTML = `<span class="livery" style="background:${tm.split ? `linear-gradient(180deg, ${tm.c2} 0 50%, ${tm.c1} 50% 100%)` : `linear-gradient(100deg, ${tm.c1} 0 58%, ${tm.c2} 58% 74%, ${tm.c3} 74% 100%)`}"></span>
        <label>Team <input type="text" maxlength="28" data-k="team" data-t="${tm.id}" id="ro-${tm.id}"></label>
        ${tm.drivers.map((dr, k) => `<div class="roster-drv"><label>Driver ${k + 1} <input type="text" maxlength="28" data-k="name" data-t="${tm.id}" data-i="${k}" id="ro-${tm.id}-${k}-n"></label><label>Code <input type="text" maxlength="3" data-k="abbr" data-t="${tm.id}" data-i="${k}" id="ro-${tm.id}-${k}-a" class="ro-code"></label><label>No. <input type="number" min="1" max="99" data-k="num" data-t="${tm.id}" data-i="${k}" id="ro-${tm.id}-${k}-u" class="ro-num"></label></div>`).join('')}`;
      sec.querySelector('[data-k="team"]').value = tm.name;
      tm.drivers.forEach((dr, k) => { sec.querySelector(`#ro-${tm.id}-${k}-n`).value = dr.name; sec.querySelector(`#ro-${tm.id}-${k}-a`).value = dr.abbr || dr.code; sec.querySelector(`#ro-${tm.id}-${k}-u`).value = dr.num; });
      body.appendChild(sec);
    });
    $('#roster-save').onclick = () => {
      const edits = TEAMS.map((tm) => ({ id: tm.id, name: $(`#ro-${tm.id}`).value.trim(), drivers: tm.drivers.map((dr, k) => ({ name: $(`#ro-${tm.id}-${k}-n`).value.trim(), abbr: $(`#ro-${tm.id}-${k}-a`).value.trim(), num: clamp(parseInt($(`#ro-${tm.id}-${k}-u`).value, 10) || dr.num, 1, 99) })) }));
      store.set('roster', edits); applyRoster(edits); this.afterRoster('Saved. The new names show everywhere in the game.');
    };
    $('#roster-reset').onclick = () => { store.set('roster', null); applyRoster(null); this.buildRoster(); this.afterRoster('Back to the original names.'); };
  },
  afterRoster(msg) {
    GFX.tex.garage = makeGarageTex(); this.buildTeams(); Career.render(); App.preview(settings.track);
    $('#roster-msg').textContent = msg;
  },
  sync() {
    $$('.circuit').forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === settings.track));
    $$('.drv').forEach((b) => b.setAttribute('aria-pressed', b.dataset.team === settings.team && b.dataset.code === settings.driver));
    $$('.team').forEach((t) => t.classList.toggle('sel', t.dataset.id === settings.team));
    $$('[data-set]').forEach((el) => $$('button[data-v]', el).forEach((b) => b.setAttribute('aria-pressed', String(settings[el.dataset.set]) === b.dataset.v)));
    const spec = TRACKS.find((t) => t.id === settings.track), team = TEAMS.find((t) => t.id === settings.team), dr = team.drivers.find((d) => d.code === settings.driver) || team.drivers[0];
    const career = settings.mode === 'career';
    $('#sum').innerHTML = career ? (Career.data ? `<b>Career</b> · ${Career.data.name}, ${TEAMS.find((t) => t.id === Career.data.teamId).name} · Season ${Career.data.season}` : '<b>Career</b> · create your driver to begin')
      : `<b>${{ race: 'Grand Prix', trial: 'Time trial', practice: 'Practice' }[settings.mode] || ''}</b> · ${spec.name} · ${dr.name}, ${team.name}${settings.mode === 'race' ? ` · ${settings.laps} laps, ${settings.opponents} rivals` : ''}`;
    $('#sp-panel').hidden = settings.musicSource !== 'spotify'; $('#yt-panel').hidden = settings.musicSource !== 'youtube';
    const online = settings.mode === 'online';
    const prac = settings.mode === 'practice';
    $('#race-only').hidden = settings.mode !== 'race' && !online && !prac; $('#opps').closest('.row').hidden = online || prac; $('#aipace').closest('.row').hidden = online || (prac && !settings.traffic);
    $('[data-set="grid"]').closest('.row').hidden = online || prac; $('#laps').closest('.row').hidden = prac; $('#traffic-row').hidden = !prac;
    const cmp = { S: 'Soft', M: 'Medium', H: 'Hard', I: 'Inters', W: 'Wets' }[settings.compound] || 'Medium', wx = { dry: 'Dry', mixed: 'Changing weather', wet: 'Wet' }[settings.weather];
    $('#opts-sum').textContent = settings.mode === 'race' ? `${settings.laps} laps · ${settings.opponents} rivals · ${wx} · ${cmp} tyres` : prac ? `${settings.traffic ? settings.traffic + ' cars on track' : 'Track to yourself'} · ${wx} · ${cmp} tyres` : online ? `${settings.laps} laps · ${wx} · ${cmp} tyres` : `${cmp} tyres`;
    $('#career').hidden = !career; $$('.free-only').forEach((el) => (el.hidden = career)); $('#start').hidden = career || online; $('#online').hidden = !online;
    $('#pc-name').textContent = spec.name; $('#pc-meta').textContent = spec.country;
    $('#pt-name').textContent = dr.name; $('#pt-meta').textContent = team.name;
    $('#opts-sum2').textContent = $('#opts-sum').textContent;
    $('#pickers').hidden = career || online;
    if (online) $('#sum').innerHTML = `<b>Online</b> · ${Net.code ? `room ${Net.code} · ${Net.players.length} driver${Net.players.length === 1 ? '' : 's'}` : 'create or join a room'} · ${spec.name}, ${settings.laps} laps`;
  },
  buildBinds() {
    const tb = $('#binds'); tb.innerHTML = '';
    const desc = (b) => !b ? 'Not set' : b.type === 'axis' ? `Axis ${b.index} ${b.full > b.rest ? '+' : '−'}` : `Button ${b.index}`;
    ACTIONS.forEach(([a, label]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${label}</td><td class="keys">${(KEYMAP[a] || []).map((k) => `<kbd>${k.replace('Key', '').replace('Arrow', '').replace('Bracket', '').replace('Right', ' R')}</kbd>`).join(' ')}</td><td class="pad">${desc(App.input.binds.map[a])}</td><td><button type="button" class="bind" data-a="${a}">Bind</button></td>`;
      tb.appendChild(tr);
    });
    $$('.bind', tb).forEach((b) => (b.onclick = () => {
      $('#bind-msg').textContent = `Move or press the control for “${ACTIONS.find((x) => x[0] === b.dataset.a)[1]}”. For a steering axis, turn fully in that direction and hold.`;
      b.textContent = 'Listening…';
      App.input.beginCapture(b.dataset.a, null, (res, err) => { $('#bind-msg').textContent = err || 'Saved.'; this.buildBinds(); });
    }));
    $('#bind-reset').onclick = () => { App.input.resetBinds(); this.buildBinds(); $('#bind-msg').textContent = 'Controller bindings reset to the standard gamepad layout.'; };
  },
  padStatus() {
    const pads = App.input.pads();
    $('#pads').textContent = pads.length ? pads.map((p) => `${p.id.replace(/\(.*?\)/g, '').trim() || 'Controller'} (${p.mapping === 'standard' ? 'gamepad layout' : 'wheel / custom layout'})`).join(', ') : 'No controller detected. Connect one and press any button.';
  },
};

function drawMiniMap(canvas, T) {
  const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height, b = T.bounds;
  const sc = Math.min((w - 24) / (b.maxX - b.minX), (h - 24) / (b.maxY - b.minY));
  const ox = (w - (b.maxX - b.minX) * sc) / 2, oy = (h - (b.maxY - b.minY) * sc) / 2;
  const tf = (x, y) => [(x - b.minX) * sc + ox, h - ((y - b.minY) * sc + oy)];
  g.lineJoin = g.lineCap = 'round';
  g.beginPath(); for (let i = 0; i <= T.n; i += 3) { const [x, y] = tf(T.px[i % T.n], T.py[i % T.n]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath();
  g.strokeStyle = '#e8ebf0'; g.lineWidth = 3.5; g.stroke();
  const [sx, sy] = tf(T.px[0], T.py[0]); g.fillStyle = '#ffd21f'; g.fillRect(sx - 4, sy - 4, 8, 8);
}

applyRoster(store.get('roster', null));
window.App = App; window.GFX = GFX; window.Career = Career; window.SIM = { AIDriver, Race, TRACKS, settings }; window.Menu = Menu; window.AUDIO = { AudioEngine, Music }; window.Net = Net; window.Spotify = Spotify; window.PitCrew = PitCrew; window.Crowd = Crowd; window.YTMusic = YTMusic;
(document.fonts && document.fonts.load ? Promise.race([Promise.all(['800 40px "Saira Condensed"', '700 20px "Saira Condensed"'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve()).catch(() => {}).then(() => Promise.race([loadModels(), new Promise((r) => setTimeout(r, 8000))])).then(() => App.init());

// ==== Spotify: sign in with your own Spotify developer app (PKCE, no server), control playback ======
// Works as a remote for whatever Spotify device is playing (phone app, desktop app, speaker). On a
// computer with Spotify Premium the game can also become a Spotify player itself (Web Playback SDK).
const Spotify = {
  scopes: 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative streaming user-read-email user-read-private',
  redirect() { return location.origin + location.pathname; },
  get tok() { return store.get('sp.tok', null); }, set tok(v) { store.set('sp.tok', v); },
  clientId() { return (store.get('sp.client', '') || '').trim(); },
  connected() { return !!this.tok; },
  async sha256(s) { if (!window.crypto || !crypto.subtle) throw new Error('Spotify sign-in needs the game opened from its https address (your installed app or GitHub link).'); const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  async login() {
    const id = this.clientId(); if (!id) throw new Error('Enter your Spotify Client ID first.');
    const a = new Uint8Array(48); crypto.getRandomValues(a); const verifier = Array.from(a, (x) => ('0' + x.toString(16)).slice(-2)).join('');
    store.set('sp.verifier', verifier);
    const q = new URLSearchParams({ response_type: 'code', client_id: id, scope: this.scopes, redirect_uri: this.redirect(), code_challenge_method: 'S256', code_challenge: await this.sha256(verifier) });
    location.href = 'https://accounts.spotify.com/authorize?' + q;
  },
  // back from Spotify's sign-in page with ?code=...
  async finishLogin() {
    const q = new URLSearchParams(location.search), code = q.get('code'); if (!code && !q.get('error')) return false;
    history.replaceState(null, '', this.redirect());
    if (!code) return false;
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.redirect(), client_id: this.clientId(), code_verifier: store.get('sp.verifier', '') }) });
    const j = await r.json(); if (!j.access_token) throw new Error(j.error_description || 'Spotify sign-in failed');
    this.tok = { a: j.access_token, r: j.refresh_token, exp: Date.now() + j.expires_in * 1000 - 60000 };
    return true;
  },
  async token() {
    const t = this.tok; if (!t) return null;
    if (Date.now() < t.exp) return t.a;
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.r, client_id: this.clientId() }) });
    const j = await r.json(); if (!j.access_token) { this.tok = null; return null; }
    this.tok = { a: j.access_token, r: j.refresh_token || t.r, exp: Date.now() + j.expires_in * 1000 - 60000 }; return j.access_token;
  },
  logout() { this.tok = null; },
  async api(path, method = 'GET', body) {
    const a = await this.token(); if (!a) throw new Error('Not signed in to Spotify');
    const r = await fetch('https://api.spotify.com/v1' + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + a }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    if (r.status === 204 || r.status === 202) return null;
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error((j && j.error && j.error.message) || 'Spotify error ' + r.status); e.status = r.status; e.reason = j && j.error && j.error.reason; throw e; }
    return j;
  },
  now() { return this.api('/me/player?additional_types=track,episode'); },
  playlists() { return this.api('/me/playlists?limit=50').then((j) => (j ? j.items.filter(Boolean) : [])); },
  // start a playlist; if nothing is playing anywhere, make the game the player (computer + Premium) or explain
  async play(contextUri) {
    try { await this.api('/me/player/play' + (this.deviceId ? '?device_id=' + this.deviceId : ''), 'PUT', contextUri ? { context_uri: contextUri } : undefined); }
    catch (e) {
      if (e.reason !== 'NO_ACTIVE_DEVICE' && e.status !== 404) throw e;
      const id = await this.startPlayer();
      if (!id) throw new Error('Open Spotify on your phone or computer and play any song once, then try again.');
      await this.api('/me/player/play?device_id=' + id, 'PUT', contextUri ? { context_uri: contextUri } : undefined);
    }
  },
  pause() { return this.api('/me/player/pause', 'PUT'); },
  next() { return this.api('/me/player/next', 'POST'); },
  prev() { return this.api('/me/player/previous', 'POST'); },
  setVolume(pct) { return this.api('/me/player/volume?volume_percent=' + Math.round(pct), 'PUT').catch(() => {}); },
  // the Web Playback SDK turns this page into a Spotify device (desktop browsers, Premium accounts)
  startPlayer() {
    if (this.deviceId) return Promise.resolve(this.deviceId);
    if (/iPhone|iPad|Android/i.test(navigator.userAgent)) return Promise.resolve(null);
    return new Promise((ok) => {
      const done = (v) => { clearTimeout(to); ok(v); }, to = setTimeout(() => ok(null), 12000);
      window.onSpotifyWebPlaybackSDKReady = () => {
        const p = new window.Spotify.Player({ name: 'Apex Grand Prix', getOAuthToken: (cb) => this.token().then(cb), volume: 0.8 });
        p.addListener('ready', ({ device_id }) => { this.deviceId = device_id; this.player = p; done(device_id); });
        p.addListener('initialization_error', () => done(null)); p.addListener('account_error', () => done(null));
        p.connect();
      };
      const s = document.createElement('script'); s.src = 'https://sdk.scdn.co/spotify-player.js'; s.onerror = () => done(null); document.head.appendChild(s);
    });
  },
};

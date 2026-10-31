// ==== Online multiplayer: peer-to-peer rooms through the free PeerJS broker =================
// The host's browser is the hub: guests connect to it, it relays every player's car state to the
// others and decides the track, weather, laps, grid and start time. Each player simulates only their
// own car; other players' cars follow their broadcast state (see Race.remoteStep).
const Net = {
  peer: null, conns: [], host: false, code: '', me: null, players: [], onChange: null, onStart: null, onState: null, onFinish: null,
  available() { return typeof Peer !== 'undefined'; },
  makeCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += a[(Math.random() * a.length) | 0]; return s; },
  myEntry(name) {
    const team = TEAMS.find((t) => t.id === settings.team), dr = team.drivers.find((d) => d.code === settings.driver) || team.drivers[0];
    return { name: (name || 'Player').slice(0, 20), team: team.id, num: dr.num, device: matchMedia('(pointer: coarse)').matches ? (Math.min(screen.width, screen.height) < 600 ? 'phone' : 'tablet') : 'pc' };
  },
  status(text, kind) { this.msg = { text, kind }; this.onChange && this.onChange(); },
  leave() { this.conns.forEach((c) => c.close()); if (this.peer) this.peer.destroy(); Object.assign(this, { peer: null, conns: [], host: false, code: '', players: [], me: null, racing: false }); this.onChange && this.onChange(); },
  create(name) {
    this.leave(); this.host = true; this.code = this.makeCode();
    this.peer = new Peer('apexgp-' + this.code);
    this.status('Creating room…');
    this.peer.on('open', () => { this.me = 'h'; this.players = [Object.assign({ key: 'h', host: true }, this.myEntry(name))]; this.status(`Room ${this.code} is open. Friends join with this code.`, 'go'); });
    this.peer.on('connection', (c) => this.accept(c));
    this.peer.on('error', (e) => this.status(e.type === 'unavailable-id' ? 'That room code is taken, try again.' : `Connection problem: ${e.type}`, 'warn'));
  },
  accept(c) {
    c.on('data', (m) => this.hostMsg(c, m));
    c.on('close', () => { this.conns = this.conns.filter((k) => k !== c); this.players = this.players.filter((p) => p.key !== c.key); this.broadcast({ t: 'lobby', players: this.players, cfg: this.cfg() }); this.onChange && this.onChange(); if (this.racing) { this.broadcast({ t: 'left', k: c.key }); this.onLeft && this.onLeft(c.key); } });
    this.conns.push(c);
  },
  hostMsg(c, m) {
    if (m.t === 'hello') {
      if (this.racing || this.players.length >= 12) { c.send({ t: 'full', why: this.racing ? 'A race is already running in this room.' : 'The room is full.' }); setTimeout(() => c.close(), 300); return; }
      c.key = 'g' + Math.random().toString(36).slice(2, 7);
      this.players.push(Object.assign({ key: c.key }, m.entry));
      c.send({ t: 'welcome', key: c.key });
      this.broadcast({ t: 'lobby', players: this.players, cfg: this.cfg() }); this.onChange && this.onChange();
    } else if (m.t === 's') { this.relay(m, c); this.onState && this.onState(m.k, m.s); }
    else if (m.t === 'fin') { this.relay(m, c); this.onFinish && this.onFinish(m.k, m.time); }
  },
  join(code, name) {
    this.leave(); this.host = false; this.code = code.toUpperCase().trim();
    this.peer = new Peer();
    this.status('Connecting…');
    this.peer.on('open', () => {
      const c = this.peer.connect('apexgp-' + this.code, { reliable: false }); this.conns = [c];
      c.on('open', () => c.send({ t: 'hello', entry: this.myEntry(name) }));
      c.on('data', (m) => this.guestMsg(m));
      c.on('close', () => { this.status('The host closed the room.', 'warn'); if (this.racing) this.onLeft && this.onLeft('*'); });
    });
    this.peer.on('error', (e) => this.status(e.type === 'peer-unavailable' ? `No room called ${this.code}. Check the code.` : `Connection problem: ${e.type}`, 'warn'));
  },
  guestMsg(m) {
    if (m.t === 'welcome') { this.me = m.key; this.status(`Joined room ${this.code}. Waiting for the host to start.`, 'go'); }
    else if (m.t === 'full') this.status(m.why, 'warn');
    else if (m.t === 'lobby') { this.players = m.players; this.hostCfg = m.cfg || null; this.onChange && this.onChange(); }
    else if (m.t === 'left') this.onLeft && this.onLeft(m.k);
    else if (m.t === 'start') this.onStart && this.onStart(m);
    else if (m.t === 's') this.onState && this.onState(m.k, m.s);
    else if (m.t === 'fin') this.onFinish && this.onFinish(m.k, m.time);
  },
  broadcast(m, except) { for (const c of this.conns) if (c !== except && c.open) c.send(m); },
  relay(m, from) { this.broadcast(m, from); },
  send(m) { if (this.host) this.broadcast(m); else if (this.conns[0] && this.conns[0].open) this.conns[0].send(m); },
  // the host's race settings, shown in everyone's lobby
  cfg() { return { track: settings.track, laps: settings.laps, weather: settings.weather, tod: settings.tod || 'auto' }; },
  // host tells the room when its settings change
  pushCfg() { if (this.host && this.peer) this.broadcast({ t: 'lobby', players: this.players, cfg: this.cfg() }); },
  // host: everyone races on the host's track, laps and weather; grid in join order
  startRace() {
    if (!this.host || this.players.length < 1) return;
    // only players still connected take part (a rematch after someone left)
    this.players = this.players.filter((p) => p.key === this.me || this.conns.some((c) => c.key === p.key && c.open));
    this.racing = true;
    const m = { t: 'start', track: settings.track, laps: settings.laps, weather: settings.weather, tod: settings.tod || 'auto', grid: this.players.map((p) => p.key), players: this.players, lightsOutAt: 8.4 + Math.random() * 1.6, seed: (Math.random() * 1e9) | 0, at: Date.now() };
    this.broadcast(m); this.onStart && this.onStart(m);
  },
};

// ==== Race weekends: Practice -> Qualifying (Q1, Q2, Q3) -> Race, with parc fermé ===================================
// Grand Prix (the menu's Weekend setting: race only, qualifying + race, or the full weekend) and every Career round
// (sprint rounds: Practice -> Sprint Shootout -> Sprint -> Qualifying -> Race). Between sessions the weekend hub (the
// results card) shows the timetable, the session's classification, the engineer's view and the setup's parc fermé state.
//  - Practice: a timed session with the field on track. End it early from the pause menu; or skip it.
//  - Qualifying knockout: each part is a run (out-lap and up to two flying laps); the others' times are simulated, with
//    the track getting quicker part by part. Q1 and Q2 drop the slowest ~quarter of the field; Q3 decides pole. A part
//    can be skipped (your time is estimated from practice, or from the car).
//  - Parc fermé: from the start of qualifying the setup is locked. Brake bias and front wing may still change; anything
//    else can be changed only by accepting a start from the pit lane. A wet race after a dry qualifying lifts it.
const WK_NAMES = { P: 'Practice', SQ: 'Sprint Shootout', S: 'Sprint', Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', R: 'Race' };
const PF_FREE = ['bias', 'fw']; // parc fermé: what may still change
const Weekend = {
  w: null,
  // ---- the weekend's state -------------------------------------------------------------------------------------
  career() { return settings.mode === 'career' && Career.data; },
  load() {
    if (this.career()) { const d = Career.data, w = d.wk; this.w = w && w.round === d.round && w.season === d.season ? w : null; }
    else { const w = store.get('weekend', null); this.w = w && w.track === settings.track ? w : null; }
    return this.w;
  },
  save() { if (!this.w) return; if (this.w.kind === 'career') { Career.data.wk = this.w; Career.save(); } else store.set('weekend', this.w); },
  clear() { if (this.w && this.w.kind === 'career' && Career.data) { Career.data.wk = null; Career.save(); } else store.set('weekend', null); this.w = null; },
  active() { return !!this.w; },
  // the drivers and car for a session
  base() {
    if (this.w.kind === 'career') return Object.assign(Career.baseCfg(), { wk: true });
    const team = TEAMS.find((t) => t.id === settings.team);
    return { team, driver: team.drivers.find((d) => d.code === settings.driver) || team.drivers[0], track: this.w.track, weather: settings.weather, gp: true, wk: true };
  },
  // the race's field (the same AI drivers the race will have), with the player
  field() {
    const b = this.base(), T = App.getTrack(this.w.track), opp = this.w.kind === 'career' ? 21 : settings.opponents;
    const me = this.w.kind === 'career' ? { tm: Career.team(), dr: Career.driver(), me: true } : { tm: b.team, dr: b.driver, me: true };
    return raceField(T, { team: b.team, driver: b.driver, replaceCode: b.replaceCode, opponents: opp }).field.concat([me]);
  },
  // start a weekend: the timetable from the setting (or the career round)
  begin() {
    const career = this.career(), d = career ? Career.data : null;
    const sprint = career && Career.isSprint();
    const kind = career ? 'career' : 'gp', mode = career ? 'full' : settings.weekend;
    const sessions = sprint ? ['P', 'SQ', 'S', 'Q1', 'Q2', 'Q3', 'R'] : mode === 'full' ? ['P', 'Q1', 'Q2', 'Q3', 'R'] : mode === 'quali' ? ['Q1', 'Q2', 'Q3', 'R'] : ['R'];
    this.w = { kind, track: career ? d.calendar[d.round] : settings.track, round: d ? d.round : 0, season: d ? d.season : 0, sessions, idx: 0, res: {}, pf: null, pitStart: false, out: false, seed: (Math.random() * 1e9) | 0, grid: null, sgrid: null, done: [] };
    this.save();
    if (sessions[0] === 'R') { this.drive(); return; }
    this.hub();
  },
  cur() { return this.w.sessions[this.w.idx]; },
  // ---- driving a session ---------------------------------------------------------------------------------------
  drive() {
    const w = this.w, s = this.cur(), b = this.base();
    $('#results').hidden = true; if (App.session) App.quit();
    // parc fermé starts with the first qualifying session: the setup as it is now is the one locked in
    if ((s === 'SQ' || s === 'Q1') && !w.pf) { w.pf = Object.assign({}, Setup.get(w.track)); w.qWeather = b.weather; this.save(); }
    const go = (cfg) => setTimeout(() => App.start(Object.assign(b, { wkSession: s }, cfg)), 60);
    if (s === 'P') go({ mode: 'practice', opponents: Math.min(this.field().length - 1, w.kind === 'career' ? 15 : settings.opponents), sessionLen: (settings.pracLen || 10) * 60, weather: b.weather === 'mixed' ? 'dry' : b.weather });
    else if (s === 'SQ' || /^Q/.test(s)) go({ mode: 'trial', quali: true, weather: b.weather === 'mixed' ? 'dry' : b.weather, cutoff: this.cutoff(s) });
    else if (s === 'S') go({ mode: 'race', sprint: true, laps: Math.max(2, Math.round((w.kind === 'career' ? Career.data.laps : settings.laps) / 3)), opponents: w.kind === 'career' ? 21 : settings.opponents, gridOrder: w.sgrid });
    else if (s === 'R') {
      const pitStart = w.pitStart && !this.pfLifted();
      let grid = w.grid; if (grid && pitStart) { const me = this.meCode(); grid = grid.filter((c) => c !== me).concat([me]); }
      go(w.kind === 'career' ? { mode: 'race', laps: Career.data.laps, opponents: 21, gridOrder: grid, pitStart } : { mode: 'race', laps: settings.laps, opponents: settings.opponents, gridOrder: grid, pitStart });
      if (w.kind === 'career' && grid) { const d = Career.data, mate = CareerGoals.mate(); d.qpos = w.qpos || grid.indexOf(d.code) + 1; d.mateQ = mate ? grid.indexOf(mate.dr.code) + 1 : 0; d.qpole = d.qpos === 1; }
      if (w.kind !== 'career') this.clear(); // a Grand Prix is over once the race starts (the race's own results follow)
    }
  },
  meCode() { return this.w.kind === 'career' ? Career.data.code : (this.base().driver.code); },
  // ---- simulated times -----------------------------------------------------------------------------------------
  // the AI's best lap in a session: qualifying pace, the track quicker in each part, practice a little slower and more varied
  aiTimes(s) {
    const T = App.getTrack(this.w.track), field = this.field().filter((e) => !e.me);
    const evo = { P: 1.012, SQ: 1.002, Q1: 1.003, Q2: 1.0005, Q3: 0.998 }[s] || 1;
    const t = aiQualiTimes(T, field, settings.aiPace, (this.w.seed ^ hashStr(s)) >>> 0);
    const rng = mulberry32((this.w.seed + hashStr(s + 'x')) >>> 0);
    return t.map((x, i) => ({ code: x.code, tm: field[i].tm, dr: field[i].dr, time: x.time * evo * (s === 'P' ? 1 + rng() * 0.012 : 1 + (rng() - 0.5) * 0.003) }));
  },
  // who takes part in a knockout part: everyone in Q1; the survivors after
  inPart(s) {
    if (s === 'Q1' || s === 'SQ') return null;
    const prev = this.w.res[s === 'Q2' ? 'Q1' : 'Q2']; return prev ? prev.through : null;
  },
  dropCount(n, s) { return s === 'Q3' ? 0 : Math.max(1, Math.round(n * 0.27)); },
  // the time to beat to go through (shown on the HUD at the start of the run)
  cutoff(s) {
    if (s === 'SQ' || s === 'Q3') return null;
    const ok = this.inPart(s), t = this.aiTimes(s).filter((x) => !ok || ok.includes(x.code)).map((x) => x.time).sort((a, b) => a - b);
    const n = t.length + 1, keep = n - this.dropCount(n, s); return t[keep - 1] ?? null;
  },
  // the player's time when a session is skipped: from the practice best, else what the car and an average driver would do
  estimate(s) {
    const pb = this.w.pbest;
    if (isFinite(pb)) return pb * (s === 'P' ? 1 : 0.994) * (1 + (Math.random() - 0.5) * 0.004);
    const T = App.getTrack(this.w.track), me = this.field().find((e) => e.me);
    return aiQualiTimes(T, [{ tm: me.tm, dr: Object.assign({}, me.dr, { skill: 0.955 }) }], settings.aiPace, this.w.seed >>> 0)[0].time * (s === 'P' ? 1.01 : 1);
  },
  // ---- a session is over: classify it, then the hub ------------------------------------------------------------
  finish(s, myTime) {
    const w = this.w, me = this.field().find((e) => e.me), ok = this.inPart(s);
    let rows = this.aiTimes(s).filter((x) => !ok || ok.includes(x.code));
    if (!ok || ok.includes(me.dr.code)) rows.push({ code: me.dr.code, tm: me.tm, dr: me.dr, time: isFinite(myTime) ? myTime : Infinity, me: true });
    rows.sort((a, b) => a.time - b.time);
    const r = { rows: rows.map((x) => ({ code: x.code, time: x.time, me: !!x.me })) };
    if (s === 'P') { w.pbest = isFinite(myTime) ? myTime : w.pbest; }
    if (/^Q[12]$/.test(s)) {
      const keep = rows.length - this.dropCount(rows.length, s); r.through = rows.slice(0, keep).map((x) => x.code); r.out = rows.slice(keep).map((x) => x.code);
      if (r.out.includes(me.dr.code)) w.out = s; // knocked out: the rest of qualifying is simulated
    }
    if (s === 'Q3' || (w.out && /^Q/.test(s))) this.makeGrid();
    if (s === 'SQ') w.sgrid = rows.map((x) => x.code);
    w.res[s] = r; w.done.push(s);
    // knocked out in Q1: Q2 and Q3 run without you
    w.idx++;
    while (w.out && /^Q[23]$/.test(this.cur())) { this.simPart(this.cur()); w.idx++; }
    if (w.out && w.res.Q3) this.makeGrid();
    this.save();
    this.hub(s);
  },
  simPart(s) {
    const w = this.w, ok = this.inPart(s); let rows = this.aiTimes(s).filter((x) => !ok || ok.includes(x.code)); rows.sort((a, b) => a.time - b.time);
    const r = { rows: rows.map((x) => ({ code: x.code, time: x.time })) };
    if (s === 'Q2') { const keep = rows.length - this.dropCount(rows.length, s); r.through = rows.slice(0, keep).map((x) => x.code); }
    w.res[s] = r; w.done.push(s);
  },
  // the grid: Q3 order, then those out in Q2, then those out in Q1
  makeGrid() {
    const w = this.w, q3 = w.res.Q3 ? w.res.Q3.rows.map((x) => x.code) : [], q2 = w.res.Q2 ? w.res.Q2.rows.map((x) => x.code).filter((c) => !q3.includes(c)) : [];
    const q1 = w.res.Q1 ? w.res.Q1.rows.map((x) => x.code).filter((c) => !q3.includes(c) && !q2.includes(c)) : [];
    w.grid = q3.concat(q2, q1); w.qpos = w.grid.indexOf(this.meCode()) + 1;
  },
  skip() {
    const s = this.cur();
    if (s === 'R' || s === 'S') return;
    this.finish(s, s === 'P' ? NaN : this.estimate(s));
  },
  // ---- the hub (the results card between sessions) -------------------------------------------------------------
  hub(last) {
    const w = this.w, s = this.cur(), spec = TRACKS.find((t) => t.id === w.track); this.lastHub = last;
    const strip = w.sessions.map((k, i) => `<span class="wk-s ${i < w.idx ? 'done' : i === w.idx ? 'now' : ''}">${i < w.idx ? '✓ ' : ''}${WK_NAMES[k]}</span>`).join('');
    const pfTxt = w.pf ? (this.pfLifted() ? 'Parc fermé lifted: the race is wet.' : w.pitStart ? 'Parc fermé broken: you start the race from the pit lane.' : 'Parc fermé: the setup is locked (brake bias and front wing can still change).') : 'Setup open until qualifying starts.';
    const P = App.session && App.session.race && App.session.race.player, adv = last === 'P' && P ? Setup.advise(P) : null;
    let msg = '';
    if (last && /^Q[12]$/.test(last)) msg = w.out === last ? `Out in ${last}. You start P${w.qpos}.` : `Through to ${last === 'Q1' ? 'Q2' : 'Q3'}.`;
    if (last === 'Q3' || (w.out && w.grid && /^Q/.test(last))) msg = `You start P${w.qpos}.` + (w.qpos === 1 ? ' Pole position!' : '');
    if (last === 'SQ') msg = `Sprint grid: P${w.sgrid.indexOf(this.meCode()) + 1}.`;
    $('#res-title').textContent = last ? `${WK_NAMES[last]} · ${spec.name}` : `${spec.name} Grand Prix weekend`;
    $('#res-extra').innerHTML = `<div class="wk-strip">${strip}</div>${msg ? `<p class="wk-msg">${msg}</p>` : ''}${adv ? `<p class="hint">Engineer: ${adv.text}</p>` : ''}<p class="hint">${pfTxt}</p>`;
    const r = last && w.res[last];
    $('#res-head').innerHTML = '<tr><th>Pos</th><th>Driver</th><th>Team</th><th>Best lap</th><th>Gap</th><th></th><th></th></tr>';
    const body = $('#res-body'); body.innerHTML = '';
    if (r) {
      const f = this.field(), best = r.rows[0].time;
      r.rows.forEach((x, i) => {
        const e = f.find((q) => q.dr.code === x.code) || {}, tr = document.createElement('tr'); if (x.me) tr.className = 'me'; if (r.out && r.out.includes(x.code)) tr.classList.add('ko');
        tr.innerHTML = `<td>${i + 1}</td><td><span class="swatch" style="background:${e.tm ? e.tm.c1 : '#888'}"></span>${e.dr ? e.dr.name : x.code}</td><td>${e.tm ? e.tm.name : ''}</td><td class="num">${isFinite(x.time) ? fmtTime(x.time) : 'No time'}</td><td class="num">${i && isFinite(x.time) ? fmtGap(x.time - best) : ''}</td><td></td><td></td>`;
        body.appendChild(tr);
      });
    } else body.innerHTML = `<tr><td colspan="7" class="hint">${w.sessions.map((k) => WK_NAMES[k]).join(' → ')}. Set the car up in practice: from qualifying on, parc fermé locks it.</td></tr>`;
    $('#r-again').textContent = s ? `${s === 'R' || s === 'S' ? 'Start the' : 'Drive'} ${WK_NAMES[s]}` : 'Continue';
    $('#r-skip').hidden = !s || s === 'R' || s === 'S'; $('#r-skip').textContent = s === 'P' ? 'Skip practice' : `Simulate ${WK_NAMES[s]}`;
    $('#r-setup').hidden = false;
    $('#r-menu').textContent = w.kind === 'career' ? 'Back to career' : 'Main menu'; $('#r-menu').hidden = false;
    $('#r-high').hidden = true; $('#r-replay').hidden = !App.session;
    $('#results').hidden = false; $('#results').dataset.wk = '1'; $('#menu').hidden = true;
    if (App.audio) App.audio.silence();
  },
  // the setup screen from the hub, and back to the hub when it closes
  openSetup() {
    this.reopen = true; $('#results').hidden = true;
    if (App.session) Menu.raceSettings(true); else { $('#menu').hidden = false; Menu.drawer('settings'); }
    const tab = document.querySelector('.tab[data-panel="p-setup"]'); if (tab) tab.click(); Setup.sync();
  },
  backToHub() { this.reopen = false; if (this.w) this.hub(this.lastHub); },
  // ---- parc fermé ----------------------------------------------------------------------------------------------
  pfLifted() { const w = this.w; if (!w || !w.pf) return false; const b = this.base(); return b.weather === 'wet' && w.qWeather !== 'wet'; },
  // does this change break parc fermé? (null: fine)
  pfBlocks(change) {
    const w = this.w; if (!w || !w.pf || w.pitStart || this.pfLifted() || Setup.trackNow() !== w.track || (w.kind === 'career') !== (settings.mode === 'career')) return null;
    const su = Setup.get(w.track), keys = Object.keys(change).filter((k) => !PF_FREE.includes(k) && change[k] !== w.pf[k] && change[k] !== su[k]);
    return keys.length ? 'Parc fermé: the setup is locked since qualifying. Brake bias and front wing can still change. Changing anything else means starting the race from the pit lane.' : null;
  },
  breakPF() { if (this.w) { this.w.pitStart = true; this.save(); } },
  pfNote() {
    const w = this.w; if (!w || !w.pf || Setup.trackNow() !== w.track || (w.kind === 'career') !== (settings.mode === 'career')) return '';
    return this.pfLifted() ? 'Parc fermé lifted (wet race): change anything.' : w.pitStart ? 'Parc fermé broken: you start from the pit lane.' : 'Parc fermé: only brake bias and front wing can change.';
  },
  // ---- the session clock (practice) and the HUD line -----------------------------------------------------------
  tick(S, race) {
    const cfg = App.cfg; if (!cfg || !cfg.wkSession) return;
    if (cfg.wkSession === 'P' && cfg.sessionLen) {
      const left = cfg.sessionLen - race.time; S.wkLeft = left;
      if (left <= 0 && !S.wkDone && !this.w.done.includes('P')) { S.wkDone = true; Hud.banner('Chequered flag: practice is over', 'info'); setTimeout(() => { if (App.session === S) this.endSession(race); }, 1500); }
    }
  },
  hudLabel(race) {
    const cfg = App.cfg; if (!cfg || !cfg.wkSession) return null;
    const s = cfg.wkSession; if (s === 'P') { const l = Math.max(0, App.session.wkLeft ?? cfg.sessionLen); return `Practice ${Math.floor(l / 60)}:${String(Math.floor(l % 60)).padStart(2, '0')}`; }
    return WK_NAMES[s];
  },
  // the player ends a session (pause menu, or the clock / two flying laps)
  endSession(race) {
    const s = App.cfg && App.cfg.wkSession; if (!s || !this.w || this.cur() !== s) return;
    const P = race.player; this.finish(s, P.bestLap);
  },
  startNote(race) {
    const cfg = App.cfg; if (!cfg || !cfg.wkSession) return;
    if (cfg.cutoff) setTimeout(() => { Hud.banner(`${cfg.wkSession}: beat ${fmtTime(cfg.cutoff)} to go through`, 'info'); Radio.say(`${cfg.wkSession}. The cut-off should be around ${fmtTime(cfg.cutoff)}.`, 1); }, 2500);
    if (cfg.wkSession === 'P') setTimeout(() => Radio.say(`Practice: ${settings.pracLen || 10} minutes. Try the setup, the engineer will tell you what the car is doing.`, 1), 2500);
    if (cfg.pitStart) setTimeout(() => Hud.banner('Pit lane start: you are released once the field has gone', 'warn'), 1500);
  },
};

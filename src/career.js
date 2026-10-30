// ==== Career mode: season, qualifying, points, development ==================
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const UPGRADES = [['power', 'Power unit', 'More engine power on the straights'], ['aero', 'Aerodynamics', 'More downforce in fast corners'], ['grip', 'Suspension & tyres', 'More mechanical grip everywhere']];

const Career = {
  data: null, db: null, uid: null,
  async init() {
    this.data = store.get('career', null);
    this.render();
    // sync to the viewer's account when the page can (works across phone and PC)
    try {
      if (!window.claude || !window.claude.use) return;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const uid = await user.id(); if (!uid) return;
      this.db = db; this.uid = uid;
      const snap = await db.doc(`data/users/${uid}/career`).get();
      if (snap.exists) {
        const remote = JSON.parse(snap.data().json || 'null');
        if (remote && (!this.data || (remote.updatedAt || 0) > (this.data.updatedAt || 0))) { this.data = remote; store.set('career', remote); this.render(); }
      } else if (this.data) this.save();
      $('#career-sync').textContent = 'Career saved to your account, so it carries over between your phone and PC.';
    } catch (e) { /* stays on this device only */ }
  },
  save() {
    if (!this.data) return;
    this.data.updatedAt = Date.now();
    store.set('career', this.data);
    if (this.db && this.uid) this.db.doc(`data/users/${this.uid}/career`).set({ json: JSON.stringify(this.data) }).catch(() => {});
  },
  team() { return TEAMS.find((t) => t.id === this.data.teamId); },
  driver() { const d = this.data; return { name: d.name, code: d.code, num: d.num, skill: 1 }; },
  track() { return TRACKS.find((t) => t.id === this.data.calendar[this.data.round]); },
  // every driver in the field with the player swapped in
  roster() {
    const d = this.data, out = [];
    TEAMS.forEach((tm) => tm.drivers.forEach((dr) => {
      if (tm.id === d.teamId && dr.code === d.replaces) out.push({ tm, dr: this.driver(), me: true });
      else out.push({ tm, dr });
    }));
    return out;
  },
  newCareer(form) {
    const tm = TEAMS.find((t) => t.id === form.team);
    let code = form.name.replace(/[^A-Za-z]/g, '').toUpperCase();
    const parts = form.name.trim().split(/\s+/); if (parts.length > 1) code = parts[parts.length - 1].replace(/[^A-Za-z]/g, '').toUpperCase();
    code = (code + 'XXX').slice(0, 3);
    this.data = {
      v: 1, name: form.name.trim() || 'Rookie', code, num: form.num, teamId: tm.id, replaces: form.replaces,
      season: 1, round: 0, calendar: TRACKS.map((t) => t.id), laps: form.laps, points: {}, teamPoints: {}, results: [],
      rd: { points: 20, power: 0, aero: 0, grip: 0 }, history: [], last: null,
    };
    this.save(); this.render(); if (window.App && !App.session) App.preview(this.track().id);
  },
  upgrade(key) {
    const rd = this.data.rd, lvl = rd[key], cost = (lvl + 1) * 20;
    if (lvl >= 5 || rd.points < cost) return;
    rd.points -= cost; rd[key] = lvl + 1; this.save(); this.render();
  },
  // qualifying grid: AI simulated times plus the player's best lap
  qualiGrid(T, playerBest) {
    const field = this.roster().filter((e) => !e.me);
    const times = aiQualiTimes(T, field, settings.aiPace, hashStr(T.spec.id) ^ (this.data.season * 31 + this.data.round));
    times.push({ code: this.data.code, time: playerBest, me: true });
    times.sort((a, b) => a.time - b.time);
    return times;
  },
  recordRace(race) {
    const d = this.data, rows = race.results();
    const res = rows.map((r, i) => ({ code: r.car.driver.code, team: r.car.team.id, pos: i + 1, pts: r.car.finished ? POINTS[i] || 0 : 0, best: r.best }));
    res.forEach((r) => { d.points[r.code] = (d.points[r.code] || 0) + r.pts; d.teamPoints[r.team] = (d.teamPoints[r.team] || 0) + r.pts; });
    const me = res.find((r) => r.code === d.code), grid = race.player.gridPos;
    const earned = 10 + (me ? me.pts * 2 + Math.max(0, grid - me.pos) * 2 : 0);
    d.rd.points += earned;
    d.results.push({ track: race.track.spec.id, pos: me ? me.pos : null, pts: me ? me.pts : 0, grid });
    d.last = { track: race.track.spec.id, pos: me ? me.pos : null, pts: me ? me.pts : 0, earned };
    d.round++;
    this.save();
    return d.last;
  },
  standings() {
    const d = this.data;
    const drivers = this.roster().map((e) => ({ code: e.dr.code, name: e.dr.name, team: e.tm, me: !!e.me, pts: d.points[e.dr.code] || 0 })).sort((a, b) => b.pts - a.pts);
    const teams = TEAMS.map((t) => ({ team: t, pts: d.teamPoints[t.id] || 0 })).sort((a, b) => b.pts - a.pts);
    return { drivers, teams };
  },
  nextSeason() {
    const d = this.data, st = this.standings();
    d.history.push({ season: d.season, pos: st.drivers.findIndex((x) => x.me) + 1, pts: d.points[d.code] || 0 });
    d.season++; d.round = 0; d.points = {}; d.teamPoints = {}; d.results = []; d.last = null; d.rd.points += 30;
    this.save(); this.render();
  },
  retire() { this.data = null; store.set('career', null); if (this.db && this.uid) this.db.doc(`data/users/${this.uid}/career`).delete().catch(() => {}); this.render(); },

  // ---- UI ----
  render() {
    const root = $('#career'); if (!root) return;
    const d = this.data;
    if (!d) {
      root.innerHTML = `
        <div class="group"><h2>New career</h2>
          <div class="row"><label for="cr-name">Driver name</label><div class="ctl"><input id="cr-name" type="text" maxlength="24" value="Alex Rookie" autocomplete="off"></div></div>
          <div class="row"><label for="cr-num">Race number</label><div class="ctl"><input id="cr-num" type="number" min="2" max="99" value="27"></div></div>
          <div class="row"><label for="cr-team">Team</label><div class="ctl"><select id="cr-team">${TEAMS.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}</select></div></div>
          <div class="team cr-teaminfo" id="cr-teaminfo"></div>
          <div class="row"><label for="cr-rep">Seat (replaces)</label><div class="ctl"><select id="cr-rep"></select></div></div>
          <div class="row"><label for="cr-laps">Race distance</label><div class="ctl"><select id="cr-laps"><option value="3">Sprint, 3 laps</option><option value="5" selected>Short, 5 laps</option><option value="10">Medium, 10 laps</option><option value="20">Long, 20 laps</option></select></div></div>
          <p class="hint">An 8-round season across every circuit. Qualify, race for points, and spend development points to make your car faster. Top teams have quicker cars; a backmarker career is the harder challenge.</p>
          <div class="actions"><button type="button" class="btn primary" id="cr-start">Start career</button></div>
        </div>`;
      const fillRep = () => {
        const tm = TEAMS.find((t) => t.id === $('#cr-team').value);
        $('#cr-rep').innerHTML = tm.drivers.map((dr) => `<option value="${dr.code}">${dr.name} (#${dr.num}, rating ${driverRating(dr)})</option>`).join('');
        const info = $('#cr-teaminfo'); info.innerHTML = Menu.teamCardHTML(tm); info.querySelector('.t-name').textContent = tm.name; Menu.fillCarImages(info);
      };
      $('#cr-team').onchange = fillRep; fillRep();
      $('#cr-start').onclick = () => this.newCareer({ name: $('#cr-name').value, num: clamp(parseInt($('#cr-num').value, 10) || 27, 2, 99), team: $('#cr-team').value, replaces: $('#cr-rep').value, laps: parseInt($('#cr-laps').value, 10) });
      Menu.sync && Menu.sync();
      return;
    }
    const st = this.standings(), tm = this.team(), done = d.round >= d.calendar.length;
    const myPos = st.drivers.findIndex((x) => x.me) + 1;
    const T = done ? null : App.getTrack(d.calendar[d.round]);
    const rdRows = UPGRADES.map(([k, label, desc]) => {
      const lvl = d.rd[k], cost = (lvl + 1) * 20;
      return `<div class="rd"><div><b>${label}</b> <span class="lvl">${'●'.repeat(lvl)}${'○'.repeat(5 - lvl)}</span><br><small>${desc}</small></div>
        <button type="button" class="btn" data-up="${k}" ${lvl >= 5 || d.rd.points < cost ? 'disabled' : ''}>${lvl >= 5 ? 'Maxed' : `Upgrade · ${cost}`}</button></div>`;
    }).join('');
    root.innerHTML = `
      <div class="group career-head">
        <h2>Season ${d.season} · ${done ? 'complete' : `Round ${d.round + 1} of ${d.calendar.length}`}</h2>
        <div class="career-me"><span class="livery" style="background:linear-gradient(100deg, ${tm.c1} 0 58%, ${tm.c2} 58% 74%, ${tm.c3} 74% 100%)"></span>
          <b>#${d.num} ${d.name}</b> ${tm.name} · ${d.round === 0 ? 'the season starts at round 1' : `P${myPos} in the championship, ${d.points[d.code] || 0} pts`}</div>
        ${d.last ? `<p class="hint">Last race: ${TRACKS.find((t) => t.id === d.last.track).name}, ${d.last.pos ? 'P' + d.last.pos : 'did not finish'}, ${d.last.pts} pts, +${d.last.earned} development points.</p>` : ''}
        <p class="hint" id="career-sync">Career saved on this device.</p>
      </div>
      ${done ? `<div class="group"><h2>Season review</h2><p class="champ">${st.drivers[0].me ? 'You are the champion!' : `${st.drivers[0].name} wins the title. You finished P${myPos}.`}</p>
        <div class="actions"><button type="button" class="btn primary" id="cr-next">Start season ${d.season + 1}</button></div></div>`
      : `<div class="group"><h2>Next race</h2>
        <div class="next-race"><canvas width="240" height="150" id="cr-map"></canvas><div><b class="c-name">${T.spec.name}</b><br><span class="c-meta">${T.spec.country} · ${(T.length / 1000).toFixed(3)} km · ${d.laps} laps</span><br><span class="c-style">${T.spec.style}</span></div></div>
        <div class="actions"><button type="button" class="btn primary" id="cr-quali">Qualifying</button><button type="button" class="btn" id="cr-skip">Skip to race</button></div>
        <p class="hint">Qualifying: two timed laps, your best counts. Skip and you start from the back half of the grid.</p></div>`}
      <div class="group"><h2>Car development · ${d.rd.points} points</h2>${rdRows}</div>
      <div class="group"><h2>Drivers' championship</h2><div class="table-wrap"><table><tbody>${st.drivers.map((x, i) => `<tr class="${x.me ? 'me' : ''}"><td class="num">${i + 1}</td><td><span class="swatch" style="background:${x.team.c1}"></span>${x.name}</td><td>${x.team.name}</td><td class="num">${x.pts}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="group"><h2>Constructors' championship</h2><div class="table-wrap"><table><tbody>${st.teams.map((x, i) => `<tr class="${x.team.id === d.teamId ? 'me' : ''}"><td class="num">${i + 1}</td><td><span class="swatch" style="background:${x.team.c1}"></span>${x.team.name}</td><td class="num">${x.pts}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="group"><h2>Career</h2>${d.history.length ? `<p class="hint">${d.history.map((h) => `Season ${h.season}: P${h.pos}, ${h.pts} pts`).join(' · ')}</p>` : ''}
        <div class="actions"><button type="button" class="btn" id="cr-retire">Retire from career</button><span id="cr-confirm" hidden><button type="button" class="btn" id="cr-retire-yes">Yes, delete this career</button> <button type="button" class="btn" id="cr-retire-no">Keep racing</button></span></div></div>`;
    if (T) drawMiniMap($('#cr-map'), T);
    $$('[data-up]', root).forEach((b) => (b.onclick = () => this.upgrade(b.dataset.up)));
    if ($('#cr-next')) $('#cr-next').onclick = () => this.nextSeason();
    if ($('#cr-quali')) $('#cr-quali').onclick = () => this.startQuali();
    if ($('#cr-skip')) $('#cr-skip').onclick = () => this.startRace(null);
    $('#cr-retire').onclick = () => { $('#cr-confirm').hidden = false; $('#cr-retire').hidden = true; };
    $('#cr-retire-no').onclick = () => { $('#cr-confirm').hidden = true; $('#cr-retire').hidden = false; };
    $('#cr-retire-yes').onclick = () => this.retire();
    if (this.db) $('#career-sync').textContent = 'Career saved to your account, so it carries over between your phone and PC.';
    Menu.sync && Menu.sync();
  },
  baseCfg() {
    const d = this.data;
    return { team: this.team(), driver: this.driver(), replaceCode: d.replaces, upgrades: d.rd, track: d.calendar[d.round], career: true };
  },
  startQuali() { App.start(Object.assign(this.baseCfg(), { mode: 'trial', quali: true })); },
  startRace(gridOrder) {
    const T = App.getTrack(this.data.calendar[this.data.round]);
    if (!gridOrder) { const g = this.qualiGrid(T, Infinity).map((x) => x.code); const me = g.indexOf(this.data.code); g.splice(me, 1); g.splice(Math.min(g.length, 12 + ((Math.random() * 6) | 0)), 0, this.data.code); gridOrder = g; }
    App.start(Object.assign(this.baseCfg(), { mode: 'race', laps: this.data.laps, opponents: 21, gridOrder }));
  },
  finishQuali(race) {
    const best = race.player.bestLap;
    const grid = this.qualiGrid(race.track, isFinite(best) ? best : Infinity);
    const body = $('#res-body'); body.innerHTML = '';
    const pole = grid[0].time;
    grid.forEach((g, i) => {
      const e = this.roster().find((r) => r.dr.code === g.code);
      const tr = document.createElement('tr'); if (g.me) tr.className = 'me';
      tr.innerHTML = `<td>${i + 1}</td><td><span class="swatch" style="background:${e.tm.c1}"></span>${e.dr.name}</td><td>${e.tm.name}</td><td class="num">${isFinite(g.time) ? fmtTime(g.time) : 'No time'}</td><td class="num">${i && isFinite(g.time) ? fmtGap(g.time - pole) : ''}</td><td></td><td></td>`;
      body.appendChild(tr);
    });
    $('#res-head').innerHTML = '<tr><th>Pos</th><th>Driver</th><th>Team</th><th>Best lap</th><th>Gap</th><th></th><th></th></tr>';
    $('#res-title').textContent = `Qualifying: you start P${grid.findIndex((g) => g.me) + 1}`;
    $('#r-again').textContent = 'Start the race'; $('#r-menu').textContent = 'Back to career';
    this.pendingGrid = grid.map((g) => g.code);
    $('#results').hidden = false; App.audio.silence();
  },
};

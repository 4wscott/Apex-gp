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
  // the player's own colours: pattern decides which colour leads, finish decides gloss or matte
  livery() {
    const L = this.data && this.data.livery; if (!L) return null;
    const shade = (hx, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hx.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
    const own = (k, v) => (typeof Ach !== 'undefined' ? Ach.owned(k, v) : false), fin = own('finish', L.finish) ? L.finish : 'gloss', pat = own('pattern', L.pattern) ? L.pattern || 'classic' : 'classic';
    let [a, b, c] = { classic: [L.c1, L.c2, L.c3], reversed: [L.c2, L.c1, L.c3], accent: [L.c1, L.c3, L.c2], mono: [L.c1, shade(L.c1, 0.55), L.c3], stealth: [shade(L.c1, 0.22), shade(L.c1, 0.4), L.c3], inverted: [L.c3, L.c2, L.c1] }[pat];
    if (fin === 'gold') a = '#c9a033'; if (fin === 'carbon') a = '#1c1e21'; // gold and carbon set the main colour; chrome mirrors it
    return { c1: a, c2: b, c3: c, matte: fin === 'matte', finish: ['chrome', 'gold', 'carbon'].includes(fin) ? fin : null, helmet: own('helmet', L.helmet) && L.helmet !== 'classic' ? L.helmet : null, numStyle: own('number', L.numStyle) && L.numStyle === 'gold' ? 'gold' : null, split: false, style: null };
  },
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
      season: 1, round: 0, calendar: TRACKS.map((t) => t.id), sprints: this.pickSprints(TRACKS.length, 1), laps: form.laps, points: {}, teamPoints: {}, results: [],
      rd: { points: 20, power: 0, aero: 0, grip: 0 }, history: [], last: null,
    };
    this.save(); this.render(); if (window.App && !App.session) App.preview(this.track().id);
  },
  upgrade(key) {
    const rd = this.data.rd, lvl = rd[key], cost = (lvl + 1) * 20;
    if (lvl >= 5 || rd.points < cost) return;
    rd.points -= cost; rd[key] = lvl + 1; this.save(); this.render();
    if (window.App && !App.session) App.preview(this.track() ? this.track().id : settings.track); // show the new parts on the car
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
    const res = rows.map((r, i) => ({ code: r.car.driver.code, team: r.car.team.id, pos: i + 1, pts: r.car.finished && !r.car.dnf ? POINTS[i] || 0 : 0, best: r.best }));
    res.forEach((r) => { d.points[r.code] = (d.points[r.code] || 0) + r.pts; d.teamPoints[r.team] = (d.teamPoints[r.team] || 0) + r.pts; });
    const me = res.find((r) => r.code === d.code), grid = race.player.gridPos;
    CareerGoals.ensure();
    const P = race.player, mate = CareerGoals.mate(), mr = mate && res.find((r) => r.code === mate.dr.code), rv0 = res.find((r) => r.code === d.rival);
    const sum = { pos: me ? me.pos : 99, grid, finished: !!P.finished && !P.dnf, pens: (P.penalties || []).length, stops: P.stops || 0, qpos: d.qpos || grid, mateQ: d.mateQ || 0, pole: !!d.qpole, pts: me ? me.pts : 0,
      fastest: me && isFinite(me.best) && res.every((o) => !(o.best < me.best)), matePos: mr ? mr.pos : 0, rivalPos: rv0 ? rv0.pos : 0 };
    const score = CareerGoals.scoreRace(sum);
    // race pay scales with how much the team believes in you (0.8x to 1.2x), plus the objective bonuses
    const earned = Math.round((10 + (me ? me.pts * 2 + Math.max(0, grid - me.pos) * 2 : 0)) * (0.8 + d.conf / 250)) + score.dev;
    d.rd.points += earned;
    // repairs cost development points; a big crash also costs the team's confidence
    const bill = this.repairBill(P), crash = !!P.dnf || (P.bigHit || 0) > 30;
    d.rd.points = Math.max(0, d.rd.points - bill); if (crash) d.conf = clamp(d.conf - 5, 0, 100);
    d.results.push({ track: race.track.spec.id, pos: me && !P.dnf ? me.pos : null, pts: me ? me.pts : 0, grid, dnf: P.dnf || null });
    this.ensureRival();
    const rv = res.find((r) => r.code === d.rival);
    if (me && rv) { if (me.pos < rv.pos) d.h2h.ahead++; else d.h2h.behind++; }
    d.last = { track: race.track.spec.id, pos: me && !P.dnf ? me.pos : null, pts: me ? me.pts : 0, earned, rivalPos: rv ? rv.pos : null, score, bill, crash };
    d.last.ach = Ach.afterRace(sum, race);
    d.qpos = 0; d.mateQ = 0; d.qpole = false;
    d.round++;
    this.save();
    return d.last;
  },
  // what the race's damage costs to fix: parts by how broken they are, plus each new nose
  repairBill(P) {
    const D = P.dmg; if (!D || P.damageMode === 'off') return 0;
    const b = (2 - D.fwL - D.fwR) * 4 + (1 - D.rw) * 8 + (1 - D.floor) * 10 + D.sus.reduce((a, x) => a + (1 - x), 0) * 6 + (1 - D.pu) * 12 + D.noses * 4;
    return Math.min(40, Math.round(b));
  },
  // the weekend's weather, fixed per round: mostly dry, sometimes rain on the way, now and then a wet race
  forecast(round) { const d = this.data, r = mulberry32(hashStr(d.calendar[round ?? d.round] + d.season) ^ 0x7e7)(); return r < 0.12 ? 'wet' : r < 0.3 ? 'mixed' : 'dry'; },
  // three sprint weekends a season, spread through the calendar (never the first round)
  pickSprints(n, season) { const r = mulberry32(season * 977 + n); const out = new Set(); while (out.size < Math.min(3, n - 1)) out.add(1 + Math.floor(r() * (n - 1))); return [...out].sort((a, b) => a - b); },
  isSprint() { const d = this.data; return !!(d && d.sprints && d.sprints.includes(d.round)); },
  startSprint() { App.start(Object.assign(this.baseCfg(), { mode: 'race', sprint: true, laps: Math.max(2, Math.round(this.data.laps / 3)), opponents: 21 })); },
  // sprint: points 8-7-6-5-4-3-2-1, no development points, the round stays open for the Grand Prix
  recordSprint(race) {
    const d = this.data, rows = race.results(), SP = [8, 7, 6, 5, 4, 3, 2, 1];
    rows.forEach((r, i) => { const pts = r.car.finished ? SP[i] || 0 : 0, code = r.car.driver.code; d.points[code] = (d.points[code] || 0) + pts; d.teamPoints[r.car.team.id] = (d.teamPoints[r.car.team.id] || 0) + pts; });
    const me = rows.findIndex((r) => r.car === race.player);
    d.sprintDone = d.round; d.lastSprint = { pos: me + 1, pts: SP[me] || 0, ach: Ach.afterSprint(me + 1) };
    this.save();
  },
  // ---- rival: the closest-matched driver in another team, with a running head-to-head ----
  ensureRival() {
    const d = this.data; if (d) d.h2h = d.h2h || { ahead: 0, behind: 0 };
    if (!d || (d.rival && this.roster().some((e) => e.dr.code === d.rival && !e.me && e.tm.id !== d.teamId))) return;
    const myRank = teamStats(this.team()).rank;
    const cand = this.roster().filter((e) => !e.me && e.tm.id !== d.teamId).sort((a, b) => Math.abs(teamStats(a.tm).rank - myRank) - Math.abs(teamStats(b.tm).rank - myRank) || b.dr.skill - a.dr.skill);
    d.rival = cand[0].dr.code; d.h2h = { ahead: 0, behind: 0 };
  },
  rival() { const d = this.data; if (!d || !d.rival) return null; return this.roster().find((e) => e.dr.code === d.rival) || null; },
  // ---- contracts: end-of-season offers, better teams for better seasons ----
  makeOffers() {
    const d = this.data, st = this.standings(), myPos = st.drivers.findIndex((x) => x.me) + 1, field = st.drivers.length;
    const perf = (1 - (myPos - 1) / Math.max(1, field - 1)) * 0.75 + ((d.conf ?? 50) / 100) * 0.25; // results, and what the paddock thinks of you
    const target = Math.max(1, Math.round(1 + (1 - perf) * (TEAMS.length - 1) * 0.8));
    const pool = TEAMS.filter((t) => t.id !== d.teamId).map((t) => ({ t, rank: teamStats(t).rank })).sort((a, b) => Math.abs(a.rank - target) - Math.abs(b.rank - target) || a.rank - b.rank);
    d.offers = pool.slice(0, 3).map(({ t, rank }) => {
      const seat = t.drivers.slice().sort((a, b) => a.skill - b.skill)[0];
      const role = rank < teamStats(this.team()).rank ? 'Step up' : rank === teamStats(this.team()).rank ? 'Sideways move' : 'Lead driver';
      return { team: t.id, replaces: seat.code, years: 1 + ((hashStr(t.id + d.season) >>> 0) % 3), role };
    });
  },
  acceptOffer(i) {
    const d = this.data, o = d.offers && d.offers[i]; if (!o) return;
    d.history.push({ season: d.season, note: `signed for ${TEAMS.find((t) => t.id === o.team).name}` });
    d.teamId = o.team; d.replaces = o.replaces; d.rd = { points: d.rd.points, power: 0, aero: 0, grip: 0 }; // a new car to develop; points carry over
    d.rival = null; d.offers = null; d.conf = 50; d.warned = false; this.ensureRival(); this.nextSeason();
    if (window.App && !App.session) App.preview(this.track().id);
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
    d.season++; d.round = 0; d.points = {}; d.teamPoints = {}; d.results = []; d.last = null; d.rd.points += CareerGoals.seasonBudget(); d.offers = null; d.h2h = { ahead: 0, behind: 0 }; d.sprints = this.pickSprints(d.calendar.length, d.season); d.sprintDone = -1;
    this.save(); this.render();
  },
  retire() { if ($('#season-end')) $('#season-end').hidden = true; this.data = null; store.set('career', null); if (this.db && this.uid) this.db.doc(`data/users/${this.uid}/career`).delete().catch(() => {}); this.render(); },

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
          <p class="hint">A season across every circuit, with three sprint weekends. Qualify, race for points, and spend development points to make your car faster. Top teams have quicker cars; a backmarker career is the harder challenge.</p>
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
    this.ensureRival(); CareerGoals.ensure(); Ach.stats();
    if (!d.sprints) { d.sprints = this.pickSprints(d.calendar.length, d.season); d.sprintDone = -1; }
    for (const t of TRACKS) if (!d.calendar.includes(t.id) && d.round === 0) d.calendar.push(t.id); // new circuits join at the start of a season
    const season = d.round >= d.calendar.length ? CareerGoals.endSeason() : null;
    const closing = season ? Champ.closeSeason() : null; // prize money and the hall of fame, once
    if (closing) { const got = Ach.afterSeason(closing, season); if (got.length) d.seasonAch = (d.seasonAch || []).concat(got.map((a) => a.id)); }
    if (d.round >= d.calendar.length && !d.offers) { this.makeOffers(); this.save(); }
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
      ${CareerGoals.hubHTML()}
      ${Champ.hubHTML()}
      ${CareerGoals.mateHTML()}
      ${(() => { const r = this.rival(); if (!r) return ''; const rp = d.points[r.dr.code] || 0, mp = d.points[d.code] || 0, h = d.h2h || { ahead: 0, behind: 0 };
        return `<div class="group rival"><h2>Rival</h2><div class="career-me"><span class="livery" style="background:linear-gradient(100deg, ${r.tm.c1} 0 58%, ${r.tm.c2} 58% 74%, ${r.tm.c3} 74% 100%)"></span><b>${r.dr.name}</b> ${r.tm.name}</div>
          <div class="h2h"><div><b>${h.ahead}</b><small>you ahead</small></div><div><b>${h.behind}</b><small>${r.dr.name.split(' ').pop()} ahead</small></div><div><b>${mp} – ${rp}</b><small>points</small></div></div></div>`; })()}
      ${done ? `<div class="group"><h2>Season review</h2><p class="champ">${st.drivers[0].me ? 'You are the champion!' : `${st.drivers[0].name} wins the title. You finished P${myPos}.`}</p>
        ${season ? `<ul class="sgoals">${season.goals.map((g) => `<li class="${g.done ? 'ok' : 'no'}"><i>${g.done ? '✓' : '✗'}</i>${g.text}</li>`).join('')}</ul>
        ${closing ? `<p class="hint">Constructors' P${closing.teamPos}: +${closing.prize} development points prize money.</p>` : ''}
        <p class="hint">Season goals: team confidence ${season.conf >= 0 ? '+' : ''}${season.conf}${season.dev ? `, +${season.dev} development points` : ''}. Next season's budget: ${CareerGoals.seasonBudget()} points.</p>` : ''}
        ${season && season.verdict === 'warning' ? '<p class="warn-box">The team is not happy. Another season like this and they will release you.</p>' : ''}
        ${season && season.verdict === 'released' ? `<p class="warn-box">${tm.name} has released you. Sign for one of the teams below to keep racing.</p>` : ''}
        <h3 class="cr-sub">Contract offers</h3>
        <div class="offers">${(d.offers || []).map((o, i) => { const t = TEAMS.find((x) => x.id === o.team), ts = teamStats(t), seat = t.drivers.find((x) => x.code === o.replaces);
          return `<div class="offer"><span class="livery" style="background:linear-gradient(100deg, ${t.c1} 0 58%, ${t.c2} 58% 74%, ${t.c3} 74% 100%)"></span><div><b>${t.name}</b> <span class="tag">${o.role}</span><br><small>${ts.tierLabel} · P${ts.rank} car · overall ${ts.overall} · ${o.years}-year deal, replacing ${seat.name}</small></div><button type="button" class="btn" data-offer="${i}">Sign</button></div>`; }).join('')}</div>
        ${season && season.verdict === 'released' ? '' : `<div class="actions"><button type="button" class="btn primary" id="cr-next">Stay at ${tm.name} for season ${d.season + 1}</button></div>`}</div>`
      : `<div class="group"><h2>Next race</h2>
        <div class="next-race"><canvas width="240" height="150" id="cr-map"></canvas><div><b class="c-name">${T.spec.name}</b><br><span class="c-meta">${T.spec.country} · ${(T.length / 1000).toFixed(3)} km · ${d.laps} laps</span><br><span class="c-style">${T.spec.style}</span></div></div>
        <p class="hint forecast">Forecast: ${{ dry: '☀ Dry', mixed: '🌦 Rain expected during the race', wet: '🌧 Wet race' }[this.forecast()]}</p>
        ${this.isSprint() ? `<p class="sprint-tag">SPRINT WEEKEND · a ${Math.max(2, Math.round(d.laps / 3))}-lap sprint (points 8 to 1) before the Grand Prix</p>` : ''}
        ${this.isSprint() && d.sprintDone !== d.round ? `<div class="actions"><button type="button" class="btn primary" id="cr-sprint">Sprint race</button></div>`
        : `${this.isSprint() && d.lastSprint ? `<p class="hint">Sprint: P${d.lastSprint.pos}, ${d.lastSprint.pts} pts. Now the Grand Prix.</p>` : ''}<div class="actions"><button type="button" class="btn primary" id="cr-quali">Qualifying</button><button type="button" class="btn" id="cr-skip">Skip to race</button></div>`}
        <p class="hint">Qualifying: two timed laps, your best counts. Skip and you start from the back half of the grid.</p></div>`}
      <div class="group livery-ed"><h2>My car</h2>
        <div class="row"><label>Colours</label><div class="ctl lv-cols"><input type="color" id="lv-c1" aria-label="Main colour"><input type="color" id="lv-c2" aria-label="Second colour"><input type="color" id="lv-c3" aria-label="Accent colour"></div></div>
        ${this.cosRow('Pattern', 'lv-pattern', 'pattern', [['classic', 'Classic'], ['reversed', 'Reversed'], ['accent', 'Accent-led'], ['mono', 'Monochrome'], ['inverted', 'Inverted'], ['stealth', 'Stealth']])}
        ${this.cosRow('Finish', 'lv-finish', 'finish', [['gloss', 'Gloss'], ['matte', 'Matte'], ['chrome', 'Chrome'], ['carbon', 'Carbon'], ['gold', 'Gold']])}
        ${this.cosRow('Helmet', 'lv-helmet', 'helmet', [['classic', 'Team'], ['chequer', 'Chequered'], ['stars', 'Stars'], ['gold', 'Gold leaf']])}
        ${this.cosRow('Numbers', 'lv-number', 'number', [['standard', 'Standard'], ['gold', 'Gold']])}
        <div class="actions"><button type="button" class="btn" id="lv-reset">Team colours</button></div>
        <p class="hint">Your colours show on the car in the showroom, in races and in replays. 🔒 Locked styles are unlocked by achievements.</p></div>
      <div class="group"><h2>Car development · ${d.rd.points} points</h2>${rdRows}</div>
      <div class="group"><h2>Drivers' championship</h2><div class="table-wrap"><table><tbody>${st.drivers.map((x, i) => `<tr class="${x.me ? 'me' : ''}"><td class="num">${i + 1}</td><td><span class="swatch" style="background:${x.team.c1}"></span>${x.name}</td><td>${x.team.name}</td><td class="num">${x.pts}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="group"><h2>Constructors' championship</h2><div class="table-wrap"><table><tbody>${st.teams.map((x, i) => `<tr class="${x.team.id === d.teamId ? 'me' : ''}"><td class="num">${i + 1}</td><td><span class="swatch" style="background:${x.team.c1}"></span>${x.team.name}</td><td class="num">${x.pts}</td></tr>`).join('')}</tbody></table></div></div>
      ${Ach.trophyHTML()}
      ${Ach.statsHTML()}
      ${Champ.hofHTML()}
      <div class="group"><h2>Career</h2>${d.history.length ? `<p class="hint">${d.history.map((h) => (h.note ? `Season ${h.season}: ${h.note}` : `Season ${h.season}: P${h.pos}, ${h.pts} pts`)).join(' · ')}</p>` : ''}
        <div class="actions"><button type="button" class="btn" id="cr-retire">Retire from career</button><span id="cr-confirm" hidden><button type="button" class="btn" id="cr-retire-yes">Yes, delete this career</button> <button type="button" class="btn" id="cr-retire-no">Keep racing</button></span></div></div>`;
    if (T) drawMiniMap($('#cr-map'), T);
    $$('[data-up]', root).forEach((b) => (b.onclick = () => this.upgrade(b.dataset.up)));
    if ($('#cr-next')) $('#cr-next').onclick = () => this.nextSeason();
    $$('[data-offer]', root).forEach((b) => (b.onclick = () => this.acceptOffer(+b.dataset.offer)));
    if ($('#cr-quali')) $('#cr-quali').onclick = () => this.startQuali();
    if ($('#cr-sprint')) $('#cr-sprint').onclick = () => this.startSprint();
    // livery editor
    { const t = this.team(), L = d.livery || { c1: t.c1, c2: t.c2, c3: t.c3, pattern: 'classic', finish: t.matte ? 'matte' : 'gloss' };
      ['c1', 'c2', 'c3'].forEach((k) => { const el = $('#lv-' + k); el.value = L[k]; el.oninput = () => this.setLivery({ [k]: el.value }); });
      for (const [id, key, def] of [['pattern', 'pattern', 'classic'], ['finish', 'finish', 'gloss'], ['helmet', 'helmet', 'classic'], ['number', 'numStyle', 'standard']])
        $$(`#lv-${id} button`).forEach((b) => { b.setAttribute('aria-pressed', String((L[key] || def) === b.dataset.v)); b.onclick = () => { if (!b.dataset.lock) this.setLivery({ [key]: b.dataset.v }); }; });
      $('#lv-reset').onclick = () => { d.livery = null; this.save(); this.render(); this.refreshCar(); }; }
    if ($('#cr-skip')) $('#cr-skip').onclick = () => this.startRace(null);
    $('#cr-retire').onclick = () => { $('#cr-confirm').hidden = false; $('#cr-retire').hidden = true; };
    $('#cr-retire-no').onclick = () => { $('#cr-confirm').hidden = true; $('#cr-retire').hidden = false; };
    $('#cr-retire-yes').onclick = () => this.retire();
    if (this.db) $('#career-sync').textContent = 'Career saved to your account, so it carries over between your phone and PC.';
    if (season) { this.save(); if (!App.session) Champ.ceremony(); } else if ($('#season-end')) $('#season-end').hidden = true;
    Menu.sync && Menu.sync();
  },
  setLivery(ch) {
    const d = this.data, t = this.team();
    d.livery = Object.assign(d.livery || { c1: t.c1, c2: t.c2, c3: t.c3, pattern: 'classic', finish: t.matte ? 'matte' : 'gloss' }, ch); this.save();
    for (const [id, key, def] of [['pattern', 'pattern', 'classic'], ['finish', 'finish', 'gloss'], ['helmet', 'helmet', 'classic'], ['number', 'numStyle', 'standard']]) $$(`#lv-${id} button`).forEach((b) => b.setAttribute('aria-pressed', String((d.livery[key] || def) === b.dataset.v)));
    clearTimeout(this.lvT); this.lvT = setTimeout(() => this.refreshCar(), 150); // colour pickers fire often: repaint once they settle
  },
  // a row of livery choices; locked ones say which achievement unlocks them
  cosRow(label, id, kind, opts) {
    const who = (v) => { const a = ACH.find((x) => x.unlock === kind + ':' + v); return a ? `${a.name}: ${a.desc}` : ''; };
    return `<div class="row"><label>${label}</label><div class="ctl seg wrap" id="${id}">${opts.map(([v, t]) => { const own = Ach.owned(kind, v); return `<button type="button" data-v="${v}"${own ? '' : ` data-lock="1" disabled title="Unlock with ${who(v)}"`}>${own ? '' : '🔒 '}${t}</button>`; }).join('')}</div></div>`;
  },
  refreshCar() { if (window.App && !App.session && settings.mode === 'career') App.preview(this.track() ? this.track().id : settings.track); },
  baseCfg() {
    const d = this.data;
    return { team: this.team(), driver: this.driver(), replaceCode: d.replaces, upgrades: d.rd, track: d.calendar[d.round], career: true, livery: this.livery(), weather: this.forecast() };
  },
  startQuali() { App.start(Object.assign(this.baseCfg(), { mode: 'trial', quali: true })); },
  startRace(gridOrder) {
    const T = App.getTrack(this.data.calendar[this.data.round]);
    const qualified = !!gridOrder;
    if (!gridOrder) { const g = this.qualiGrid(T, Infinity).map((x) => x.code); const me = g.indexOf(this.data.code); g.splice(me, 1); g.splice(Math.min(g.length, 12 + ((Math.random() * 6) | 0)), 0, this.data.code); gridOrder = g; }
    const d = this.data, mate = CareerGoals.mate(); d.qpos = gridOrder.indexOf(d.code) + 1; d.mateQ = qualified && mate ? gridOrder.indexOf(mate.dr.code) + 1 : 0; d.qpole = qualified && d.qpos === 1;
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

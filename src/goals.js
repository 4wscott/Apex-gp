// ==== Career: team goals, weekend objectives, team confidence and the team-mate battle ===========
// Season goals come from the team boss and scale with how fast the car is; each race weekend has one main and one
// bonus objective. Meeting them raises team confidence (and pays development points), missing them lowers it.
// Confidence decides the development budget, the contract offers, and whether the team keeps you.
const BOSS_LINE = {
  front: 'This car can win. We expect you to fight for the title.',
  mid: 'Solid points every weekend, and help us climb the constructors\' table.',
  back: 'Every point counts for a team like ours. Show us what you can do.',
};

const CareerGoals = {
  tier() { return teamStats(Career.team()).tier; },
  // the other driver in your team
  mate() { const d = Career.data, tm = Career.team(); const dr = tm.drivers.find((x) => x.code !== d.replaces); return dr ? { tm, dr } : null; },
  // where the car should finish on pace: from the team's rank, minus a little for every upgrade bought
  expected() {
    const d = Career.data, r = teamStats(Career.team()).rank, up = (d.rd.power || 0) + (d.rd.aero || 0) + (d.rd.grip || 0);
    return clamp(Math.round(2 * r - 1 - up * 0.35), 1, 20);
  },
  seasonGoals(tier, n) {
    const many = (k) => Math.max(1, Math.round(n * k));
    if (tier === 'front') return [{ k: 'dpos', n: 1, text: 'Win the drivers\' title' }, { k: 'cpos', n: 2, text: 'Constructors\' top 2' }, { k: 'wins', n: many(0.25), text: `Win ${many(0.25)} races` }];
    if (tier === 'mid') return [{ k: 'dpos', n: 8, text: 'Finish the season in the top 8' }, { k: 'cpos', n: 5, text: 'Constructors\' top 5' }, { k: 'ptsRaces', n: many(2 / 3), text: `Score points in ${many(2 / 3)} of ${n} races` }];
    return [{ k: 'ptsRaces', n: many(0.25), text: `Score points in ${many(0.25)} races` }, { k: 'mate', n: 1, text: 'Beat your team-mate on points' }, { k: 'cpos', n: 9, text: 'Constructors\' top 9' }];
  },
  // keeps the save up to date: confidence, the team-mate record, this season's goals and this weekend's objectives
  ensure() {
    const d = Career.data; if (!d) return;
    if (d.conf === undefined) d.conf = 50;
    d.mateH2h = d.mateH2h || { qa: 0, qb: 0, ra: 0, rb: 0 };
    if (!d.goals || d.goals.season !== d.season || d.goals.team !== d.teamId) d.goals = { season: d.season, team: d.teamId, tier: this.tier(), list: this.seasonGoals(this.tier(), d.calendar.length) };
    const key = d.season + '-' + d.round + '-' + d.teamId;
    if (d.round < d.calendar.length && (!d.obj || d.obj.key !== key)) d.obj = Object.assign({ key }, this.weekend());
  },
  // one main and one bonus objective for the coming Grand Prix
  weekend() {
    const d = Career.data, rng = mulberry32(hashStr(d.teamId + d.season) ^ (d.round * 7919 + 13)), E = this.expected();
    const mate = this.mate(), rv = Career.rival(), surname = (x) => x.dr.name.split(' ').pop();
    const top = () => { const n = clamp(E - 1 + Math.floor(rng() * 3), 1, 15); /* a backmarker is asked for a top 15, not a top 20 */ return { k: 'top', n, text: n === 1 ? 'Win the race' : n <= 3 ? 'Finish on the podium' : `Finish in the top ${n}` }; };
    const fix = (o) => (o.k === 'top' && o.n > 1 && o.n <= 3 ? Object.assign(o, { n: 3 }) : o);
    const mains = [[0.5, top], [0.2, () => mate && { k: 'mate', text: `Finish ahead of your team-mate, ${surname(mate)}` }], [0.15, () => rv && { k: 'rival', text: `Beat your rival, ${surname(rv)}` }], [0.15, () => E > 3 && { k: 'gain', n: 3, text: 'Gain 3 places from your grid slot' }]];
    const pick = (list) => { let x = rng() * list.reduce((a, l) => a + l[0], 0); for (const [w, f] of list) { x -= w; if (x <= 0) { const o = f(); if (o) return o; } } return list.map((l) => l[1]()).find(Boolean); };
    const main = fix(pick(mains));
    const q = E <= 3 ? 3 : E <= 5 ? 5 : E <= 10 ? 10 : 15;
    const bonuses = [[0.25, () => ({ k: 'quali', n: q, text: q === 3 ? 'Qualify in the top 3' : `Qualify in the top ${q}` })], [0.25, () => ({ k: 'clean', text: 'Finish without a penalty' })],
      [E <= 10 ? 0.2 : 0.05, () => ({ k: 'fastest', text: 'Set the fastest lap' })], [d.laps >= 8 ? 0.15 : 0, () => ({ k: 'onestop', text: 'Make only one pit stop' })],
      [0.15, () => main.k !== 'mate' && mate && { k: 'mate', text: `Finish ahead of ${surname(mate)}` }], [0.1, () => main.k !== 'gain' && E > 3 && { k: 'gain', n: 2, text: 'Gain 2 places from your grid slot' }]];
    let bonus = pick(bonuses); if (bonus.k === main.k) bonus = { k: 'clean', text: 'Finish without a penalty' };
    return { main: Object.assign(main, { reward: 10 }), bonus: Object.assign(bonus, { reward: 6 }) };
  },
  met(o, s) {
    switch (o.k) {
      case 'top': return s.finished && s.pos <= o.n;
      case 'mate': return s.finished && (!s.matePos || s.pos < s.matePos);
      case 'rival': return s.finished && (!s.rivalPos || s.pos < s.rivalPos);
      case 'gain': return s.finished && s.grid - s.pos >= o.n;
      case 'quali': return s.qpos <= o.n;
      case 'clean': return s.finished && !s.pens;
      case 'fastest': return !!s.fastest;
      case 'onestop': return s.finished && s.stops === 1;
    }
    return false;
  },
  // the race is over: score the objectives and the team-mate battle, move confidence and pay the bonus points
  scoreRace(s) {
    const d = Career.data, o = d.obj, out = []; let dc = 0, dev = 0;
    if (o) {
      const m = this.met(o.main, s), b = this.met(o.bonus, s);
      out.push({ text: o.main.text, met: m, main: true, reward: m ? o.main.reward : 0 }); out.push({ text: o.bonus.text, met: b, main: false, reward: b ? o.bonus.reward : 0 });
      dc += m ? 8 : -6; dc += b ? 4 : 0; dev += (m ? o.main.reward : 0) + (b ? o.bonus.reward : 0);
    }
    const h = d.mateH2h;
    if (s.matePos) { if (s.finished && s.pos < s.matePos) { h.ra++; dc += 2; } else { h.rb++; dc -= 2; } }
    if (s.mateQ && s.qpos) { if (s.qpos < s.mateQ) h.qa++; else h.qb++; }
    if (!s.finished) dc -= 4; // a retirement hurts
    d.conf = clamp(Math.round(d.conf + dc), 0, 100);
    return { objectives: out, conf: dc, dev };
  },
  // goal progress: done true / false, or null while it can still go either way
  status(g, final) {
    const d = Career.data, st = Career.standings(), my = st.drivers.findIndex((x) => x.me) + 1, myTeam = st.teams.findIndex((x) => x.team.id === d.teamId) + 1;
    const races = d.results || [], started = races.length > 0;
    switch (g.k) {
      case 'dpos': return { now: started ? `P${my} now` : '', done: final ? my <= g.n : null };
      case 'cpos': return { now: started ? `P${myTeam} now` : '', done: final ? myTeam <= g.n : null };
      case 'wins': { const w = races.filter((r) => r.pos === 1).length; return { now: `${w} of ${g.n}`, done: w >= g.n ? true : final ? false : null }; }
      case 'ptsRaces': { const p = races.filter((r) => r.pts > 0).length; return { now: `${p} of ${g.n}`, done: p >= g.n ? true : final ? false : null }; }
      case 'mate': { const m = this.mate(), mp = m ? d.points[m.dr.code] || 0 : 0, me = d.points[d.code] || 0; return { now: `${me} – ${mp}`, done: final ? me > mp : null }; }
    }
    return { now: '', done: null };
  },
  // season over: goals decide a confidence swing and bonus points; a season below 20 is a warning, the next one a release
  endSeason() {
    const d = Career.data; if (!d || d.seasonEval === d.season) return d && d.seasonResult;
    let dc = 0, dev = 0;
    const goals = d.goals.list.map((g) => { const done = !!this.status(g, true).done; dc += done ? 10 : -8; dev += done ? 15 : 0; return { text: g.text, done }; });
    d.conf = clamp(Math.round(d.conf + dc), 0, 100); d.rd.points += dev;
    let verdict = 'ok';
    if (d.conf < 20) { verdict = d.warned ? 'released' : 'warning'; d.warned = true; } else d.warned = false;
    d.seasonEval = d.season; d.seasonResult = { goals, conf: dc, dev, verdict };
    return d.seasonResult;
  },
  // the budget for next season, from the team's confidence in you
  seasonBudget() { return Math.round(15 + (Career.data.conf ?? 50) * 0.3); },
  confLabel(c) { return c >= 80 ? 'Team leader' : c >= 60 ? 'Trusted' : c >= 40 ? 'Settled' : c >= 20 ? 'Under pressure' : 'Seat at risk'; },
  confHTML() {
    const c = Career.data.conf ?? 50, col = c >= 60 ? '#3bd16f' : c >= 40 ? '#ffd21f' : c >= 20 ? '#ff9a1f' : '#ff4b4b';
    return `<div class="conf"><div class="conf-top"><span>Team confidence</span><b>${c} · ${this.confLabel(c)}</b></div><div class="conf-bar"><i style="width:${c}%;background:${col}"></i></div></div>`;
  },
  objHTML(o) {
    if (!o) return '';
    return `<ul class="objs"><li><span class="o-tag">Main</span>${o.main.text}<small>+${o.main.reward} dev · confidence</small></li><li><span class="o-tag bonus">Bonus</span>${o.bonus.text}<small>+${o.bonus.reward} dev</small></li></ul>`;
  },
  // the hub panel: confidence, the boss's season goals with progress, and this weekend's objectives
  hubHTML() {
    const d = Career.data, done = d.round >= d.calendar.length;
    const goals = d.goals.list.map((g) => { const s = this.status(g, done); return `<li class="${s.done === true ? 'ok' : s.done === false ? 'no' : ''}"><i>${s.done === true ? '✓' : s.done === false ? '✗' : '○'}</i>${g.text}<small>${s.now}</small></li>`; }).join('');
    return `<div class="group goals"><h2>Team goals</h2>${this.confHTML()}
      <p class="boss">“${BOSS_LINE[d.goals.tier]}” <small>Team boss, season ${d.season}</small></p>
      <ul class="sgoals">${goals}</ul>
      ${!done && d.obj ? `<h3 class="cr-sub">This weekend</h3>${this.objHTML(d.obj)}` : ''}</div>`;
  },
  mateHTML() {
    const m = this.mate(); if (!m) return '';
    const d = Career.data, h = d.mateH2h, mp = d.points[m.dr.code] || 0, me = d.points[d.code] || 0;
    return `<div class="group rival"><h2>Team-mate</h2><div class="career-me"><span class="livery" style="background:linear-gradient(100deg, ${m.tm.c1} 0 58%, ${m.tm.c2} 58% 74%, ${m.tm.c3} 74% 100%)"></span><b>${m.dr.name}</b> #${m.dr.num} · rating ${driverRating(m.dr)}</div>
      <div class="h2h"><div><b>${h.qa} – ${h.qb}</b><small>qualifying</small></div><div><b>${h.ra} – ${h.rb}</b><small>races</small></div><div><b>${me} – ${mp}</b><small>points</small></div></div></div>`;
  },
  // shown on the loading screen and the pause card
  briefHTML() {
    const d = Career.data; if (!d || !d.obj) return '';
    return `<div class="brief"><b>Weekend objectives</b>${this.objHTML(d.obj)}</div>`;
  },
  resultHTML(r) {
    if (!r) return '';
    return `<div class="res-obj">${r.objectives.map((o) => `<div class="${o.met ? 'ok' : 'no'}"><i>${o.met ? '✓' : '✗'}</i><span><small>${o.main ? 'Main objective' : 'Bonus'}</small>${o.text}</span><b>${o.met ? '+' + o.reward + ' dev' : ''}</b></div>`).join('')}
      <div class="conf-delta">Team confidence ${r.conf >= 0 ? '+' : ''}${r.conf} → ${Career.data.conf}</div></div>`;
  },
};

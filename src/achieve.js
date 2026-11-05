// ==== Career: achievements, rewards, trophy room and career stats ===============================
// Each achievement has a tier and a reward: development points, and some unlock a cosmetic (livery pattern, paint
// finish, helmet design or number style) for the livery editor. Stats are kept across every season of a career.
const COSMETICS = {
  pattern: { stealth: 'Stealth', inverted: 'Inverted' },
  finish: { chrome: 'Chrome', carbon: 'Carbon', gold: 'Gold' },
  helmet: { stars: 'Stars', chequer: 'Chequered', gold: 'Gold leaf' },
  number: { gold: 'Gold numbers' },
};
const ACH = [
  // results
  ['points', 'Off the mark', 'Score your first points', 'bronze', 10],
  ['lead', 'Leading the way', 'Lead a lap of a Grand Prix', 'bronze', 10],
  ['podium', 'Podium finisher', 'Finish in the top 3', 'silver', 20, 'pattern:inverted'],
  ['win', 'Race winner', 'Win a Grand Prix', 'gold', 30, 'finish:chrome'],
  ['pole', 'Pole position', 'Qualify on pole', 'silver', 15, 'helmet:chequer'],
  ['fastest', 'Purple sector', 'Set the fastest lap of a race', 'bronze', 10],
  ['hattrick', 'Hat-trick', 'Pole, win and fastest lap in one weekend', 'gold', 30],
  ['slam', 'Grand Slam', 'Pole, win, fastest lap and lead every lap', 'gold', 50, 'number:gold'],
  ['sprint', 'Sprint king', 'Win a sprint race', 'silver', 15],
  // racecraft
  ['fromback', 'From the back', 'Win from P10 or lower on the grid', 'gold', 40],
  ['rain', 'Rain master', 'Win a wet or mixed-weather race', 'gold', 30, 'helmet:stars'],
  ['comeback', 'Comeback', 'Gain 10 places in a race', 'silver', 20],
  ['charge', 'On the charge', 'Gain 5 places in a race', 'bronze', 10],
  ['clean', 'Clean weekend', 'Finish without a penalty or any damage', 'bronze', 10],
  ['streak', 'Consistent', 'Score points in 5 races in a row', 'silver', 20],
  ['limit', 'Damage limitation', 'Score points after a pit stop for a new nose', 'bronze', 10],
  ['rival', 'Rivalry won', 'Beat your rival 5 times', 'silver', 15],
  ['mate5', 'Top dog', 'Beat your team-mate in 5 races', 'bronze', 10],
  // season
  ['mateSeason', 'Number one driver', 'Beat your team-mate on points over a season', 'silver', 25],
  ['goals', 'Mission complete', 'Meet every season goal set by the team', 'silver', 30, 'pattern:stealth'],
  ['trust', 'Team favourite', 'Reach 90 team confidence', 'silver', 15],
  ['champ', 'World Champion', 'Win the drivers\' title', 'gold', 80, 'finish:gold'],
  ['twice', 'Back to back', 'Win the title in two seasons running', 'gold', 60, 'helmet:gold'],
  ['cons', 'Constructors\' champions', 'Win the constructors\' title with your team', 'gold', 50],
  // long term
  ['starts10', 'Ten starts', 'Start 10 Grands Prix', 'bronze', 10, 'finish:carbon'],
  ['starts50', 'Fifty starts', 'Start 50 Grands Prix', 'silver', 25],
  ['starts100', 'Centurion', 'Start 100 Grands Prix', 'gold', 50],
  ['wins10', 'Ten-time winner', 'Win 10 Grands Prix', 'gold', 40],
  ['podiums25', 'Podium regular', 'Finish on the podium 25 times', 'silver', 30],
  ['everywhere', 'Grand tour', 'Win at every circuit on the calendar', 'gold', 80],
  ['teams3', 'Journeyman', 'Race for three different teams', 'silver', 20],
].map(([id, name, desc, tier, dev, unlock]) => ({ id, name, desc, tier, dev, unlock: unlock || null }));
const TIER_COL = { bronze: '#c98a4b', silver: '#d4d9de', gold: '#ffd21f' };

const Ach = {
  stats() {
    const d = Career.data;
    if (!d.stats) {
      // an older career: rebuild what the save already knows
      const r = (d.results || []).filter(Boolean);
      d.stats = { starts: r.length, wins: r.filter((x) => x.pos === 1).length, podiums: r.filter((x) => x.pos && x.pos <= 3).length, poles: 0, fastest: 0, points: (d.history || []).reduce((a, h) => a + (h.pts || 0), 0) + (d.points[d.code] || 0), titles: 0, cTitles: 0, dnfs: 0, lapsLed: 0, sprintWins: 0, best: {}, wonAt: [], starts_at: {}, teams: [d.teamId], streak: 0, beatRival: d.h2h ? d.h2h.ahead : 0, beatMate: 0, prevChamp: 0 };
      r.forEach((x) => { if (x.pos) d.stats.best[x.track] = Math.min(d.stats.best[x.track] || 99, x.pos); if (x.pos === 1 && !d.stats.wonAt.includes(x.track)) d.stats.wonAt.push(x.track); d.stats.starts_at[x.track] = (d.stats.starts_at[x.track] || 0) + 1; });
    }
    d.ach = d.ach || {}; d.unlocks = d.unlocks || [];
    if (!d.stats.teams.includes(d.teamId)) d.stats.teams.push(d.teamId);
    return d.stats;
  },
  has(id) { return !!(Career.data.ach && Career.data.ach[id]); },
  owned(kind, v) { return v === undefined || ['classic', 'reversed', 'accent', 'mono', 'gloss', 'matte', 'standard'].includes(v) || (Career.data.unlocks || []).includes(kind + ':' + v); },
  // unlock (once), pay the reward, remember it for the results screen
  give(id) {
    const d = Career.data; if (this.has(id)) return null;
    const a = ACH.find((x) => x.id === id); if (!a) return null;
    d.ach[id] = { season: d.season, round: d.round };
    d.rd.points += a.dev;
    if (a.unlock && !d.unlocks.includes(a.unlock)) d.unlocks.push(a.unlock);
    (d.fresh = d.fresh || []).push(id);
    return a;
  },
  unlockLabel(u) { if (!u) return ''; const [k, v] = u.split(':'); return `${{ pattern: 'livery pattern', finish: 'paint finish', helmet: 'helmet design', number: 'number style' }[k]}: ${COSMETICS[k][v]}`; },
  // after a Grand Prix: update the stats, then check everything that could have just been earned
  afterRace(s, race) {
    const d = Career.data, st = this.stats(), T = race.track.spec.id, P = race.player;
    st.starts++; st.starts_at[T] = (st.starts_at[T] || 0) + 1;
    const fin = s.finished && !P.dnf, pts = fin && s.pos <= 10;
    if (!fin) st.dnfs++;
    if (fin && s.pos === 1) { st.wins++; if (!st.wonAt.includes(T)) st.wonAt.push(T); }
    if (fin && s.pos <= 3) st.podiums++;
    if (fin) st.best[T] = Math.min(st.best[T] || 99, s.pos);
    if (s.fastest) st.fastest++;
    if (s.pole) st.poles++;
    st.lapsLed += P.lapsLed || 0;
    st.points += s.pts || 0;
    st.streak = pts ? st.streak + 1 : 0;
    if (s.rivalPos && fin && s.pos < s.rivalPos) st.beatRival++;
    if (s.matePos && fin && s.pos < s.matePos) st.beatMate++;
    const got = [];
    const g = (id, c) => { if (c) { const a = this.give(id); if (a) got.push(a); } };
    g('points', pts); g('lead', (P.lapsLed || 0) > 0); g('podium', fin && s.pos <= 3); g('win', fin && s.pos === 1); g('pole', s.pole); g('fastest', s.fastest);
    g('hattrick', s.pole && fin && s.pos === 1 && s.fastest); g('slam', s.pole && fin && s.pos === 1 && s.fastest && (P.lapsLed || 0) >= race.laps);
    g('fromback', fin && s.pos === 1 && s.grid >= 10); g('rain', fin && s.pos === 1 && race.weather !== 'dry');
    g('comeback', fin && s.grid - s.pos >= 10); g('charge', fin && s.grid - s.pos >= 5);
    g('clean', fin && !s.pens && P.damageLevel() < 0.05 && P.damageMode !== 'off'); g('streak', st.streak >= 5); g('limit', pts && P.dmg && P.dmg.noses > 0);
    g('rival', st.beatRival >= 5); g('mate5', st.beatMate >= 5); g('trust', d.conf >= 90);
    this.longTerm(got);
    return got;
  },
  afterSprint(pos) { const st = this.stats(), got = []; if (pos === 1) { st.sprintWins++; const a = this.give('sprint'); if (a) got.push(a); } return got; },
  longTerm(got) {
    const d = Career.data, st = this.stats(), g = (id, c) => { if (c) { const a = this.give(id); if (a) got.push(a); } };
    g('starts10', st.starts >= 10); g('starts50', st.starts >= 50); g('starts100', st.starts >= 100); g('wins10', st.wins >= 10); g('podiums25', st.podiums >= 25);
    g('everywhere', TRACKS.every((t) => st.wonAt.includes(t.spec ? t.spec.id : t.id))); g('teams3', st.teams.length >= 3);
    return got;
  },
  // season end: titles and the season goals
  afterSeason(close, season) {
    const d = Career.data, st = this.stats(), got = [], g = (id, c) => { if (c) { const a = this.give(id); if (a) got.push(a); } };
    if (d.statsSeason === d.season) return got; d.statsSeason = d.season;
    if (close.champMe) st.titles++; if (close.consMe) st.cTitles++;
    const mate = CareerGoals.mate(), me = d.points[d.code] || 0, mp = mate ? d.points[mate.dr.code] || 0 : 0;
    g('champ', close.champMe); g('twice', close.champMe && st.prevChamp === d.season - 1); if (close.champMe) st.prevChamp = d.season;
    g('cons', close.consMe); g('mateSeason', !!mate && me > mp); g('goals', season && season.goals.every((x) => x.done)); g('trust', d.conf >= 90);
    return got;
  },
  // a small banner for achievements earned mid-race (leading a lap, the fastest lap)
  liveCheck(race, e) {
    if (!Career.data || !App.cfg || !App.cfg.career || App.cfg.sprint || race.mode !== 'race' || race.quali) return;
    this.stats();
    const show = (id) => { if (this.has(id) || (this.live = this.live || {})[id]) return; this.live[id] = true; const a = ACH.find((x) => x.id === id); Hud.banner(`Achievement: ${a.name}`, 'go'); };
    if (e.type === 'lap' && e.car === race.player && race.standings()[0] === race.player) show('lead');
    if (e.type === 'lap' && e.car === race.player && e.overall && race.player.lap > 2) show('fastest');
  },
  toastHTML(list) {
    if (!list || !list.length) return '';
    return `<div class="ach-toast">${list.map((a) => `<div class="tier-${a.tier}">${this.cup(a.tier, 30)}<span><small>Achievement unlocked</small><b>${a.name}</b>${a.desc} · +${a.dev} dev${a.unlock ? ` · new ${this.unlockLabel(a.unlock)}` : ''}</span></div>`).join('')}</div>`;
  },
  cup(tier, size = 44, faded = false) {
    const c = faded ? '#3a414d' : TIER_COL[tier] || tier;
    return `<svg viewBox="0 0 64 80" width="${size}" height="${size * 1.25}" aria-hidden="true" class="cup"><path d="M16 6h32v18c0 12-7 20-16 20S16 36 16 24z" fill="${c}"/><path d="M16 12H6c0 10 5 16 11 16M48 12h10c0 10-5 16-11 16" fill="none" stroke="${c}" stroke-width="4"/><rect x="28" y="44" width="8" height="14" fill="${c}"/><rect x="18" y="58" width="28" height="8" rx="2" fill="${c}"/><rect x="14" y="66" width="36" height="10" rx="2" fill="${faded ? '#2a2f38' : '#3a2a12'}"/></svg>`;
  },
  // the trophy room: titles first, then every achievement on shelves (locked ones as silhouettes)
  trophyHTML() {
    const d = Career.data, st = this.stats(), n = Object.keys(d.ach).length;
    const titles = (d.hof || []).filter((h) => h.meChamp || h.teamChamp).map((h) => `<div class="title-cup">${this.cup(h.meChamp ? 'gold' : 'silver', 54)}<small>Season ${h.season}</small><b>${h.meChamp ? 'Drivers\' champion' : 'Constructors\' champions'}</b></div>`).join('');
    const shelf = ACH.map((a) => { const got = this.has(a.id); return `<div class="trophy-slot ${got ? 'got' : ''}" title="${a.desc}">${this.cup(a.tier, 30, !got)}<b>${a.name}</b><small>${got ? `Season ${d.ach[a.id].season}` : a.desc}</small></div>`; }).join('');
    return `<div class="group trophies"><h2>Trophy room · ${n} of ${ACH.length}</h2>${titles ? `<div class="title-row">${titles}</div>` : ''}<div class="shelf">${shelf}</div></div>`;
  },
  statsHTML() {
    const d = Career.data, st = this.stats();
    const fav = Object.entries(st.starts_at).sort((a, b) => b[1] - a[1])[0], tn = (id) => (TRACKS.find((t) => (t.spec ? t.spec.id : t.id) === id) || {}).name || id;
    const cell = (v, l) => `<div><b>${v}</b><small>${l}</small></div>`;
    const best = Object.entries(st.best).sort((a, b) => a[1] - b[1]).map(([t, p]) => `<li><span>${tn(t)}</span><b>P${p}</b></li>`).join('');
    return `<div class="group cstats"><h2>Career stats</h2>
      <div class="stat-grid">${cell(st.starts, 'starts')}${cell(st.wins, 'wins')}${cell(st.podiums, 'podiums')}${cell(st.poles, 'poles')}${cell(st.fastest, 'fastest laps')}${cell(st.points, 'points')}${cell(st.titles, 'titles')}${cell(st.cTitles, 'constructors\' titles')}${cell(st.lapsLed, 'laps led')}${cell(st.dnfs, 'retirements')}</div>
      ${fav ? `<p class="hint">Favourite circuit: ${tn(fav[0])} (${fav[1]} start${fav[1] === 1 ? '' : 's'}).</p>` : ''}
      ${best ? `<h3 class="cr-sub">Best finish by circuit</h3><ul class="best-list">${best}</ul>` : ''}</div>`;
  },
};

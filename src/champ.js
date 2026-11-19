// ==== Career: drivers' and constructors' championships ==========================================
// Live standings during a race, title maths for the run-in, constructors' prize money, the season-end ceremony and
// a hall of fame of every season's champions.
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
const PRIZE = (pos, n) => Math.round(60 - ((pos - 1) / Math.max(1, n - 1)) * 50); // P1 60 points down to 10 for last

const Champ = {
  // points still on offer after the current round: Grands Prix and sprints not yet run (per driver and per team)
  remaining(fromRound) {
    const d = Career.data; let drv = 0, team = 0;
    for (let r = fromRound; r < d.calendar.length; r++) {
      const sprintLeft = d.sprints && d.sprints.includes(r) && !(r === d.round && d.sprintDone === r);
      drv += 25 + (sprintLeft ? 8 : 0); team += 43 + (sprintLeft ? 15 : 0);
    }
    return { drv, team };
  },
  // projected championship if the race ended now: positions to points, added to the table
  live(race, sprint) {
    const d = Career.data, table = Object.assign({}, d.points), pts = sprint ? SPRINT_POINTS : POINTS;
    race.standings().forEach((c, i) => { table[c.driver.code] = (table[c.driver.code] || 0) + (pts[i] || 0); });
    const order = Object.keys(table).concat(Career.roster().map((e) => e.dr.code)).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => (table[b] || 0) - (table[a] || 0));
    const me = order.indexOf(d.code), my = table[d.code] || 0, ref = me === 0 ? table[order[1]] || 0 : table[order[0]] || 0;
    return { pos: me + 1, pts: my, gap: my - ref, leader: order[0] };
  },
  liveHTML(race, sprint) {
    const L = this.live(race, sprint), name = (code) => { const e = Career.roster().find((x) => x.dr.code === code); return e ? e.dr.name.split(' ').pop() : code; };
    return `<div class="brief live-ch"><b>Championship if the race ended now</b><p>P${L.pos} · ${L.pts} pts · ${L.pos === 1 ? `${L.gap} ahead` : `${-L.gap} behind ${name(L.leader)}`}</p></div>`;
  },
  // the title picture: margin, points left, whether it is settled, and what it takes at the next race
  titleMaths() {
    const d = Career.data, st = Career.standings(), dr = st.drivers, rem = this.remaining(d.round), last = d.round >= d.calendar.length;
    const after = this.remaining(d.round + 1), surname = (x) => x.name.split(' ').pop();
    const lead = dr[0].pts - (dr[1] ? dr[1].pts : 0), me = dr.findIndex((x) => x.me), myPts = dr[me].pts;
    const out = { rem: rem.drv, lead, leader: dr[0], decided: false, lines: [] };
    if (last) { out.decided = true; return out; }
    // settled: nobody can catch the leader even winning everything left (a tie stays open: it goes to count-back)
    if (lead > rem.drv) { out.decided = true; out.lines.push(dr[0].me ? 'You are the champion! Nobody can catch you now.' : `${dr[0].name} has won the title with ${d.calendar.length - d.round} round${d.calendar.length - d.round === 1 ? '' : 's'} to go.`); return out; }
    if (me === 0) {
      // what wins it at the next race: my finish vs the closest challenger's, and the third man must be out of reach too
      // the challenger has to end the next race below need(p) for the title to be settled (a tie stays open: count-back)
      const ch = dr[1], third = dr[2], pt = (i) => POINTS[i] || 0, need = (p) => myPts + pt(p) - after.drv;
      const thirdOut = (p) => !third || myPts + pt(p) > third.pts + 25 + after.drv;
      let line = null;
      // the worst finish that settles it whatever happens behind
      for (let p = 9; p >= 0 && !line; p--) if (thirdOut(p) && ch.pts + (p === 0 ? pt(1) : pt(0)) < need(p)) line = p === 0 ? `Win and you're champion, whatever ${surname(ch)} does.` : `Finish P${p + 1} or higher and you're champion, whatever ${surname(ch)} does.`;
      // otherwise: a win, and the challenger finishing low enough
      if (!line && thirdOut(0)) for (let q = 1; q < 20; q++) if (ch.pts + pt(q) < need(0)) { line = `Win and ${surname(ch)} finishes ${q >= 10 ? 'out of the points' : `P${q + 1} or lower`}: you're champion.`; break; }
      if (line) out.lines.push(line);
      if (!out.lines.length) out.lines.push(`You lead by ${lead} with ${rem.drv} points left to race for.`);
    } else {
      const gap = dr[0].pts - myPts;
      if (gap >= rem.drv - 25) out.lines.push(`Must win, and ${surname(dr[0])} must slip: ${gap} behind with ${rem.drv} left.`);
      else out.lines.push(`${gap} behind ${surname(dr[0])}, ${rem.drv} points still to race for.`);
    }
    return out;
  },
  // constructors: the teams directly above and below, and what the current place pays
  teamPicture() {
    const d = Career.data, st = Career.standings().teams, i = st.findIndex((x) => x.team.id === d.teamId), mine = st[i];
    return { pos: i + 1, pts: mine.pts, above: st[i - 1] || null, below: st[i + 1] || null, prize: PRIZE(i + 1, st.length), n: st.length };
  },
  hubHTML() {
    const d = Career.data; if (!d.results || !d.results.length) return '';
    const half = d.round >= Math.ceil(d.calendar.length / 2), T = this.titleMaths(), C = this.teamPicture();
    const bar = (x, mine) => { const max = Math.max(1, C.above ? C.above.pts : C.pts, C.pts); return `<div class="gap-row ${mine ? 'me' : ''}"><span>${x.team.name}</span><i style="width:${Math.round((x.pts / max) * 100)}%;background:${x.team.c1}"></i><b>${x.pts}</b></div>`; };
    return `<div class="group champ-maths"><h2>Title fight</h2>
      ${half || T.decided ? `<ul class="tm-lines">${T.lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
      <div class="h2h"><div><b>${T.rem}</b><small>points left</small></div><div><b>${T.lead}</b><small>leader's margin</small></div><div><b>P${C.pos}</b><small>constructors</small></div></div>
      <h3 class="cr-sub">Constructors' battle</h3>
      <div class="gap-chart">${C.above ? bar(C.above) : ''}${bar({ team: Career.team(), pts: C.pts }, true)}${C.below ? bar(C.below) : ''}</div>
      <p class="hint">${C.above ? `${C.above.pts - C.pts} behind ${C.above.team.name}. ` : 'Leading the constructors. '}${C.below ? `${C.pts - C.below.pts} ahead of ${C.below.team.name}. ` : ''}P${C.pos} pays ${C.prize} development points at season end.</p></div>`;
  },
  // season over: prize money once, the champions into the hall of fame
  closeSeason() {
    const d = Career.data; if (d.closed === d.season) return d.closeResult;
    const st = Career.standings(), C = this.teamPicture(), myPos = st.drivers.findIndex((x) => x.me) + 1;
    d.rd.points += C.prize;
    const champ = st.drivers[0], cons = st.teams[0];
    d.hof = d.hof || [];
    d.hof.push({ season: d.season, driver: champ.name, dTeam: champ.team.id, dPts: champ.pts, team: cons.team.id, tPts: cons.pts, me: myPos, myTeam: C.pos, myTeamId: d.teamId, meChamp: champ.me, teamChamp: cons.team.id === d.teamId });
    d.closed = d.season; d.closeResult = { prize: C.prize, teamPos: C.pos, myPos, champ: champ.name, champMe: champ.me, cons: cons.team.name, consMe: cons.team.id === d.teamId };
    return d.closeResult;
  },
  bossReaction(pos, n) { return pos === 1 ? 'Constructors\' champions! The whole factory is celebrating.' : pos <= 3 ? 'A strong year for the team. The prize money will help.' : pos <= Math.ceil(n / 2) ? 'A respectable season, but we want more next year.' : 'A tough year. We need to find more pace.'; },
  // the ceremony card, shown once when the season ends
  ceremony() {
    const d = Career.data, r = this.closeSeason(), st = Career.standings(), dc = st.drivers[0], tc = st.teams[0];
    const el = $('#season-end'); if (!el || d.ceremony === d.season) return;
    const trophy = (c) => `<svg viewBox="0 0 64 80" class="trophy" aria-hidden="true"><path d="M16 6h32v18c0 12-7 20-16 20S16 36 16 24z" fill="${c}"/><path d="M16 12H6c0 10 5 16 11 16M48 12h10c0 10-5 16-11 16" fill="none" stroke="${c}" stroke-width="4"/><rect x="28" y="44" width="8" height="14" fill="${c}"/><rect x="18" y="58" width="28" height="8" rx="2" fill="${c}"/><rect x="14" y="66" width="36" height="10" rx="2" fill="#3a2a12"/></svg>`;
    el.innerHTML = `<div class="card se-card"><p class="se-kicker">Season ${d.season} · final standings</p>
      <div class="se-champs"><div>${trophy('#ffd21f')}<small>Drivers' champion</small><b>${dc.name}</b><span><i class="swatch" style="background:${dc.team.c1}"></i>${dc.team.name} · ${dc.pts} pts</span></div>
      <div>${trophy('#d8dde3')}<small>Constructors' champion</small><b>${tc.team.name}</b><span><i class="swatch" style="background:${tc.team.c1}"></i>${tc.pts} pts</span></div></div>
      ${r.champMe ? '<p class="se-me gold">World Champion!</p>' : ''}
      <div class="h2h"><div><b>P${r.myPos}</b><small>your drivers' finish</small></div><div><b>P${r.teamPos}</b><small>${Career.team().name}</small></div><div><b>+${r.prize}</b><small>prize money (dev)</small></div></div>
      <p class="boss">“${this.bossReaction(r.teamPos, st.teams.length)}” <small>Team boss</small></p>
      ${Ach.toastHTML((d.seasonAch || []).map((id) => ACH.find((a) => a.id === id)).filter((a) => a && d.ach[a.id] && d.ach[a.id].season === d.season))}
      <div class="actions"><button type="button" class="btn primary" id="se-ok">Season review and contracts</button></div></div>`;
    el.hidden = false;
    $('#se-ok').onclick = () => { d.ceremony = d.season; Career.save(); el.hidden = true; };
  },
  hofHTML() {
    const d = Career.data, h = d.hof || []; if (!h.length) return '';
    const tn = (id) => (TEAMS.find((t) => t.id === id) || { name: id }).name;
    return `<div class="group"><h2>Hall of fame</h2><div class="table-wrap"><table><thead><tr><th>Season</th><th>Drivers' champion</th><th>Constructors'</th><th>You</th></tr></thead><tbody>${h.slice().reverse().map((x) =>
      `<tr class="${x.meChamp ? 'me' : ''}"><td class="num">${x.season}</td><td>${x.meChamp ? '🏆 ' : ''}${x.driver} <small>${x.dPts}</small></td><td>${x.teamChamp ? '🏆 ' : ''}${tn(x.team)}</td><td>P${x.me} · ${tn(x.myTeamId)} P${x.myTeam}</td></tr>`).join('')}</tbody></table></div></div>`;
  },
};

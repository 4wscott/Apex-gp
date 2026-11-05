# Apex GP: career mode plan

**Already in career mode**
- 12-round seasons with three sprint weekends.
- Qualifying and the race.
- Drivers' and constructors' standings tables.
- Development points spent on three upgrades (power, aero, grip), shown on the car.
- A named rival with a head-to-head record.
- Contract offers at season end.
- Livery editor.

**This plan adds** a reason to win every race: team goals, a real podium, rewards, and championship stakes for both titles.

Each phase is built, tested on PC (1280×720) and iPhone (390×844 upright, 844×390 sideways), run through the full game test, then pushed.

---

## Phase 1: Team goals and objectives

The team sets expectations based on how fast the car is. Meeting them earns rewards, and missing them has consequences.

1. **Season goals** are set by the team boss at the start of each season, scaled to the car's rank:
   - **Front-runner team:** win the drivers' title, constructors' top 2.
   - **Midfield team:** finish in the top 8, constructors' top 5, score points in 8 of 12 races.
   - **Backmarker team:** score points in 3 races, beat your team-mate, constructors' top 9.

2. **Race weekend objectives:** one main goal and one bonus goal per weekend, shown on the hub and the loading screen. For example:
   - "Finish in the top 6."
   - "Gain 3 places."
   - "Beat your rival."
   - "Qualify in the top 10."
   - "Set the fastest lap."
   - "Finish without a penalty."
   - "Stop once only."
   - "Finish ahead of your team-mate."

   These use data the race already records.

3. **Team confidence meter:** a 0–100 bar on the hub.
   - Meeting objectives raises it, and missing them lowers it.
   - It affects which contract offers you get, how big your development budget is, and whether the team keeps you. A season below 20 means a warning, then you're released.

4. **Team-mate:** the other driver in your team.
   - Their qualifying and race head-to-head is tracked against you.
   - It's shown next to the rival battle and feeds into team confidence.

5. **Tests:**
   - Goals are generated correctly for each team tier.
   - Every objective type is checked against recorded race data (pass and fail cases).
   - Confidence rises and falls as expected, and a release happens at the right point.

## Phase 2: Podium and celebrations

A top 3 finish should feel like a real event.

1. **Podium ceremony** after a top 3 finish in a race or sprint:
   - **Scene:** a 3D podium scene (P2 left, P1 centre, P3 right, team-coloured backdrop and sponsor boards), built near the main grandstand.
   - **Drivers:** all three on the steps, using the existing driver models with arms-raised poses.
   - **Effects:** champagne spray (particle bursts toward the camera), fireworks overhead, and the crowd cheering.
   - **Cameras:** a slow camera sweep, then a close shot of the winner. Tap or click skips straight to the results.
   - **Phones:** a lighter version (fewer particles) to stay smooth.

2. **Parc fermé moment** for any finish: the car rolls to a stop under the numbered P1/P2/P3 boards, or into the pit lane for P4 and lower, with a short team radio message.

3. **Season finale:** at the last round, if a title is decided:
   - **The champion:** "World Champion" banner, extra fireworks, the constructors' trophy if your team won, and a short gallery of season stats.

4. **Tests:**
   - The ceremony plays for P1, P2 and P3, and is skipped for P4 and lower.
   - Skip and continue work on PC and iPhone.
   - The phone version keeps its particle count and frame rate in budget.
   - The champion screen appears only when you actually win.

## Phase 3: Rewards and accomplishments

Achievements give lasting rewards you can see and use.

1. **Achievements:** about 30 milestones. Each has a name, a description, a tier (bronze, silver or gold) and a reward. Examples:
   - **Results:** First points, First podium, First win, Pole position, Grand Slam (pole, win, fastest lap, led every lap).
   - **Racecraft:** From the back (win from P10 or lower), Wet weather win, Comeback (gain 10 places), Clean weekend (no penalties).
   - **Season:** Beat your team-mate over a season, Champion, Back-to-back titles, Constructors' champion.
   - **Long-term:** 10 / 50 / 100 starts, a win at every circuit, careers with three different teams.

2. **Rewards:**
   - **Development points:** a bonus that speeds up car upgrades.
   - **Cosmetics:** new livery patterns, helmet designs, special finishes (chrome, carbon, gold for champions) and race number styles.
   - **Trophy room:** a career hub tab showing earned trophies on shelves (3D models or illustrations), titles won, and season-by-season results.

3. **Career stats page:** starts, wins, podiums, poles, fastest laps, points, titles, best finish per circuit, and favourite circuit.

4. **Notifications:** a small banner in races and on the results screen when an achievement unlocks, and an unlocked list on the hub.

5. **Tests:**
   - Every achievement unlocks from simulated race records.
   - Rewards apply: development points are added, and cosmetics appear in the livery editor.
   - Stats add up across seasons.
   - Saving and loading keeps everything, including older saves.

## Phase 4: Drivers' and constructors' championships

Both titles should feel like a season-long fight.

1. **Live championship standings during a race:** shows where you'd stand if the race ended now (for example "P2 in the championship, 6 behind").

2. **Title maths:** from the second half of the season, the hub shows:
   - what you need to win the title: "Win and Navarro finishes P3 or lower: you're champion";
   - points available;
   - the leader's margin;
   - when the title is mathematically decided.

3. **Constructors' battle:**
   - Your points and your team-mate's both count.
   - The team boss reacts to the constructors' position: prize money, meaning development points, scales with the final constructors' place.
   - A gap chart to the teams above and below.

4. **Season end ceremony:**
   - The drivers' and constructors' champions are announced with their trophies.
   - Your final positions are shown, with prize money and development budget for next year.
   - Both feed into contract offers and team confidence.

5. **Hall of fame:** every season's drivers' and constructors' champions are kept, so you can look back over your career.

6. **Tests:**
   - Standings and title maths are correct (including ties, decided early, and last-round deciders).
   - Prize money matches the constructors' position.
   - The hall of fame keeps every season.

---

## Order and effort

| Phase | What you get | Size |
|---|---|---|
| 1 | Goals every weekend and season, team confidence, team-mate battle | Medium |
| 2 | 3D podium ceremony, champagne, champion finale | Large |
| 3 | Achievements, rewards, trophy room, career stats | Medium–large |
| 4 | Championship maths, prize money, season ceremony, hall of fame | Medium |

**Suggested order:** 1 → 4 → 3 → 2.
- **Phase 1 (goals) and Phase 4 (championships)** give every race a purpose and use data the game already has.
- **Phase 3 (rewards)** sits on top of them.
- **Phase 2 (podium)** is the biggest piece of new 3D work, so it goes last.

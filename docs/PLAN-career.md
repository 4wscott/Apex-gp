# Apex GP: career mode plan

**Already in career mode**
- 12-round seasons with three sprint weekends.
- Qualifying and the race.
- Drivers' and constructors' standings tables.
- Development points spent on three upgrades (power, aero, grip), shown on the car.
- A named rival with a head-to-head record.
- Contract offers at season end.
- Livery editor.

**This plan adds** a reason to win every race: team goals, a real podium, rewards, championship stakes for both titles, and real car damage.

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

## Phase 5: Real car damage

Today only the front wing takes damage, as one health number, with a hanging endplate and some debris. This phase gives the car parts that break, show it, and change how the car drives.

1. **Damage by part.** Each part has its own health, and what you hit decides which part takes it:
   - **Front wing (left and right halves):** a broken side loses downforce on that side, so the car pulls and understeers in corners toward the damaged side.
   - **Rear wing:** less rear downforce, so the rear steps out in fast corners, and top speed changes.
   - **Floor and sidepods:** a damaged floor loses overall grip (the biggest single loss on a ground-effect car).
   - **Suspension at each corner:**
     - The car pulls to one side under braking.
     - A wheel can sit at the wrong angle.
     - Badly damaged, it can make the car undrivable (retire).
   - **Tyres:** a puncture after a hard hit or running over debris. The tyre deflates over a few seconds, the car is very hard to drive, and you limp to the pits on the rim.
   - **Engine and gearbox:** only from big impacts, or from over-revving with manual gears. Less power and occasional missed gears, and a total failure means retirement.

2. **What you see:**
   - **Parts:** a broken front wing half drops off, hangs or disappears, and the rear wing flap can break off.
   - **Wheels and body:** a damaged suspension corner tilts its wheel. Scuffs and cracks show on the bodywork.
   - **Tyres:** a punctured tyre flattens, with sparks from the rim.
   - **Engine:** an engine problem gives white smoke from the exhaust (and oil smoke when it fails).
   - **Track:** pieces that come off stay on the track as debris that other cars avoid, and they can cause punctures.
   - **On screen:** a damage diagram on the dashboard (car outline with parts coloured green, yellow or red) and a team radio report: "Front left wing damage, box for a new nose."

3. **Repairs:**
   - **Front wing:** a nose change at a pit stop (adds about 8 s).
   - **Puncture:** fixed with a normal tyre change.
   - **Suspension, floor, rear wing and engine:** can't be fixed in a race. You manage them or retire.
   - **Practice and Time trial:** Reset repairs everything, as now.
   - **Career:** repair bills come out of the development budget, so crashing has a cost, and team confidence drops after a big crash.

4. **Damage settings** (Settings → Driving):
   - **Off:** no damage at all.
   - **Visual only:** you see it but it doesn't affect driving.
   - **Realistic:** everything above.
   - Difficulty presets choose a sensible level (Beginner: Visual only).

5. **AI cars** take damage by the same rules. They pit for a new nose, slow down with problems, retire when the car is undrivable, and can cause a safety car.

6. **Tests:**
   - Each part takes damage from the right kind of hit (front, side, rear, kerb, car contact).
   - Each kind of damage has the expected effect on handling (measured with the test driver: grip, pull to one side, top speed).
   - Punctures deflate and can be changed in the pits.
   - Nose changes cost the right time.
   - All three damage settings behave correctly.
   - Visuals are checked on PC and iPhone.
   - A full race with damage on stays stable on phones (memory and frame rate).

---

## Order and effort

| Phase | What you get | Size |
|---|---|---|
| 1 | Goals every weekend and season, team confidence, team-mate battle | Medium |
| 2 | 3D podium ceremony, champagne, champion finale | Large |
| 3 | Achievements, rewards, trophy room, career stats | Medium–large |
| 4 | Championship maths, prize money, season ceremony, hall of fame | Medium |
| 5 | Real car damage by part: visible, changes the handling, repairs and costs | Large |

**Suggested order:** 1 → 4 → 5 → 3 → 2.
- **Phase 1 (goals) and Phase 4 (championships)** give every race a purpose and use data the game already has.
- **Phase 5 (damage)** comes next: it changes how races play out, and the career costs and objectives build on it (for example a "Clean weekend" goal).
- **Phase 3 (rewards)** sits on top of all of these.
- **Phase 2 (podium)** is the biggest piece of new 3D work, so it goes last.

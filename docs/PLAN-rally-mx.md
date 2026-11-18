# New game: rally and motocross plan

**Working title:** **Apex Rally** (a placeholder; pick any name you like before it goes public).

**The aim:** a new, separate game built from the Apex GP code. **Part 1 is rally:** stages against the clock on gravel, snow, tarmac and mud, with a co-driver reading pace notes. **Part 2 is motocross:** dirt bikes racing a full gate on tracks with jumps, berms and ruts.

**Why one game for both:** rally and motocross need the same new foundations: loose surfaces, real 3D physics with airtime, and long stretches of terrain. Built once, they serve both.

**Where it lives:** its own GitHub repository, web address and installable app. This plan moves into that repo when it's created, and Apex GP is not changed by any of it.

---

## Decisions already made (change any of them if you like)

| Question | Default in this plan |
|---|---|
| Order | Rally first, then motocross. Rally needs no wheel-to-wheel AI, which is the hardest AI part. |
| Names | Fictional championships, events, teams, cars and bikes. No real series (no WRC, Dakar, AMA and so on), makers or sponsors. |
| Look | The same realism as Apex GP: real-world lighting, weather, time of day, dense forests and good performance on your Intel UHD PC and iPhone. |
| Controls | Keyboard, gamepad, phone (tilt or buttons) and the mouse wheel, as in Apex GP. |
| Physics | Fully 3D: cars and bikes fly, land, roll and tumble. Apex GP's flat-plus-hills model is not enough for jumps. |

---

## What carries over from Apex GP

- **The app shell:** the build script, the installable app (PWA), the update system, menus and settings, and the presets from Lite to Beautiful.
- **Graphics:** the sky and lighting, the HDRI reflections, the lit car paint, the terrain, the trees (close models, distant pictures), grass, weather (rain, spray, wet surfaces) and time of day.
- **Controls and sound:** keyboard, gamepad, phone and mouse wheel; the engine-loop sound system; music.
- **The rest:** replays and TV cameras, achievements, the career structure and the test tools (screenshots, performance and brightness probes).

**What doesn't carry over:** the F1 parts. Pit stops, ERS, the 22-car grid, the timing tower, the closed circuits and the 2D car physics.

---

## How every phase is built and checked

Same routine as Apex GP: build it, take screenshots from fixed spots on PC and iPhone on every preset, measure performance against the Apex GP numbers, run the phase's test and the full game test, then push.

---

# Part 1: Rally

## Phase 0: The new project

**Goal:** an empty new game that runs, installs and updates, before any rally code.

1. **What you do:** create an empty GitHub repository (for example `apex-rally`) and turn on GitHub Pages for it, as for Apex GP.
2. **What I do:**
   - **Copy and strip:** copy Apex GP into it and remove the F1 parts (listed above).
   - **App identity:** set up the new name, icon, app manifest and update system, so it installs as a separate app beside Apex GP.
   - **Placeholder screen:** a test stage (a flat gravel road through a forest) with a test car.

**Check:** the new app installs on your iPhone and PC next to Apex GP, and both work.

## Phase 1: 3D physics

**Goal:** a car that drives like a rally car on any surface, and can jump, land and roll.

1. **A real 3D body:** position, rotation and speed in all three axes, not just on a flat plane. It's stepped many times a second, with small steps, so it stays stable when landing from a big jump.
2. **Four suspension corners.**
   - **What they do:** each wheel looks down at the ground under it and has a spring and damper with long travel (about 25 cm, as a real rally car has) and a bump stop.
   - **What you feel:** the car squats, dives, rolls and bottoms out on big landings.
3. **Surfaces.** Each surface has its own grip and its own way of breaking away:

   | Surface | Grip | Behaviour |
   |---|---|---|
   | Tarmac, dry | high | like Apex GP, with a sharp limit |
   | Tarmac, wet | medium | |
   | Gravel | medium | gives grip at bigger slide angles, so you drive sideways |
   | Loose gravel off the line | lower | the cleaned line is faster |
   | Mud | low | drags the car and slows it |
   | Snow | low | studded tyres help; snowbanks catch the car |
   | Ice | very low | only studs work |
   | Sand | low | soft, and it digs in and slows the car |

4. **Rally driving techniques work** because they come from the physics, not from special code: the Scandinavian flick (swinging the car the other way before a corner), left-foot braking, the handbrake for hairpins, and using a bank to turn.
5. **Airtime and crashes.**
   - **Jumps:** the car flies on real arcs. A car landing nose-first digs in, and a landing on two wheels can roll it.
   - **Rolls:** after a roll the car is put back on its wheels with a time penalty, as spectators would push it back.
   - **Hits:** trees, rocks and walls do real damage.
6. **Drivetrain:** four-wheel drive with front, centre and rear differentials, a 5- or 6-speed sequential gearbox, a turbo with anti-lag (the bangs and pops), and a hydraulic handbrake.

**Checks:**

- **Grip:** the car's cornering grip on each surface matches the values in the table.
- **Jumps:** a 1-metre crest at 120 km/h gives the right flight time and distance.
- **Landings and rolls:** the car survives a big flat landing but rolls when it lands crooked.
- **Stability:** the physics runs on the iPhone with time to spare, and a thousand repeated runs from the same inputs give the same result, which replays and ghosts need.

## Phase 2: Stages and terrain

**Goal:** long, narrow, point-to-point rally stages that look and feel like real roads through real places.

1. **Stage roads.**
   - **Length and width:** 3–15 km, with a road 4–7 m wide.
   - **Shape:** camber, crests, dips, jumps, hairpins, long fast sweepers, junctions and bridges.
   - **How they're made:** each stage is a set of points like Apex GP's circuit data, with heights, widths and the surface along it. A seeded generator makes extra stages for practice and daily challenges.
2. **Terrain in chunks.**
   - **Why:** a 15 km stage is too big to build all at once.
   - **How:** the world is built in chunks along the road. Close chunks are full detail, distant ones low detail, and chunks are made ahead and dropped behind as you drive.
   - **Ground:** ditches, banks, rock faces and drops are built into the terrain beside the road.
3. **The roadside.** Trees close to the road (the dense forest from Apex GP's tree work), rocks, fences, stone walls, snow poles, hay bales on the outside of fast corners, villages and farms. Spectators gather at jumps and hairpins.
4. **Road surface detail:**
   - **Gravel:** a cleaner line where the cars drive, and loose gravel at the edges.
   - **Tarmac:** cut corners drag gravel onto the road.
   - **Water:** puddles and wet patches.
   - **Snow:** snowbanks on the sides.
5. **Six rallies, each with 4–6 stages** (fictional places):

   | Rally | Inspired by | Surface and character |
   |---|---|---|
   | Northern Lakes | Finland | fast gravel, big jumps, crests |
   | Frozen North | Sweden | snow, ice, snowbanks |
   | Island Mountain | Corsica | twisting tarmac mountain roads |
   | Savannah | Kenya | rough, rocky, dusty, with river crossings |
   | Forest Mud | Wales | narrow, muddy, wet forest |
   | Alpine Night | Monte Carlo | mixed tarmac, snow and ice, at night |

**Checks:**

- **Smoothness:** no stutter when new chunks load at 200 km/h on the iPhone.
- **Shape:** stages have no impossible bumps or steps.
- **Performance and looks:** screenshots and performance measured on every rally and every preset.

## Phase 3: Pace notes and the co-driver

**Goal:** a co-driver who tells you what's coming, like a real one, so you can drive fast on roads you don't know.

1. **Notes made from the road.**
   - **How:** each stage's notes are worked out from its shape.
   - **Corners:** graded 1 (slowest, hairpin-like) to 6 (nearly flat out), plus "square" and "hairpin".
   - **Extra words:** "long", "tightens", "opens", "don't cut", "crest", "jump", "over bridge", "into", "caution", "narrows" and distances ("100", "50").
   - **Editing:** a stage's notes can be tuned by hand where the automatic notes are wrong.
2. **The co-driver's voice.**
   - **Recorded words:** a set of short spoken clips, joined into calls at the right time for your speed.
   - **Where they come from:** licence-free recordings or a voice made with a speech tool. I'll find options and play you samples.
   - **Fallback:** the browser's built-in speech.
   - **Settings:** the timing of calls (early, normal, late) can be set.
3. **On-screen notes:** icons for the next few corners, for people playing with the sound off.
4. **Recce:** an optional slow drive through the stage before the timed run, to learn the road.

**Checks:** the calls match the corners on every stage, they arrive in time at full speed, and a test driver following only the notes finishes every stage.

## Phase 4: Rally cars and damage

**Goal:** cars that look and sound like real rally cars and wear through an event.

1. **Car classes** (fictional cars):
   - **Modern four-wheel-drive rally cars**, the top class.
   - **Smaller front-wheel-drive cars.**
   - **Classic rear-wheel-drive cars.**
   - **Wild 1980s-style monsters** for fun.
2. **Models:** realistic rally car models from Sketchfab under CC BY, branding removed, fictional liveries. I'll show you a contact sheet first, as for the bikes.
3. **Damage:**
   - **Body:** dents, lost panels, broken lights and smashed glass.
   - **Mechanical:** suspension, steering, radiator (the engine overheats), gearbox (lost gears), turbo and punctures.
4. **Service park.** Between groups of stages, a time budget (about 30–45 minutes) to repair the car. You choose what to fix. Going over time costs a penalty, as in the real sport.
5. **Tyres:** gravel (soft and hard), snow studs, tarmac (soft, hard and wet). You choose how many spares to carry; a spare is extra weight.
6. **Lights:** headlights and an extra light pod for night stages, lighting the road, trees, dust and snow.
7. **Sound:** turbo engine loops, anti-lag bangs, gravel hitting the floor, stones on the body and the co-driver's voice through the intercom.

**Check:** contact sheets of every car, damage screenshots, and a full event in each class.

## Phase 5: Rally events and career

**Goal:** a full rally game.

1. **The event:**
   - **Structure:** a shakedown, then 2–3 legs of stages with service in between. The times are added up.
   - **Retiring:** if you retire, you can restart the next day with a time penalty, as in the real sport.
2. **Other cars:** the AI rivals drive the same stages. Their times appear on split times and the leaderboard, and you sometimes catch the dust of a car ahead.
3. **Career.**
   - **Climbing:** start in the small class, earn drives with better teams and reach the top class.
   - **The team:** a team budget, engineers to hire and car upgrades.
4. **Quick play:** single stage, full rally and a daily challenge stage with an online leaderboard and ghosts.
5. **Weather and time of day:** rain, fog, snowfall, dusk and night, with conditions that can change between stages.
6. **Replays and the camera views:** bonnet, bumper, cockpit, chase, and TV cameras at jumps and hairpins.

**Checks:** a full career season on PC and phone, plus your device check of frame rate on the Intel UHD PC and iPhone.

**Part 1 ends here:** a complete rally game, released.

---

# Part 2: Motocross

## Phase 6: Dirt bike physics and riders

**Goal:** a dirt bike that jumps, lands, slides through berms and responds to the rider's weight.

1. **The bike on the Phase 1 3D physics:** two wheels, long-travel suspension (about 30 cm), light (about 105 kg) and very powerful for its weight.
2. **The rider's weight is a control.** Leaning forward or back changes the pitch in the air (nose up or down for the landing) and the grip in corners. In the air the rider can **scrub** (flatten the bike to stay low over a jump) or **whip** (throw the back sideways for style).
3. **Terrain features:**
   - **Berms:** banked corners you lean into.
   - **Ruts:** grooves worn into the dirt; they form and deepen during the race and guide the wheel.
   - **Whoops:** rows of small bumps, skimmed at speed.
   - **Jumps:** tabletops, doubles, triples, step-ups and drops.
4. **Landings:** landing on the downslope is smooth, landing flat compresses the suspension hard, and landing crooked crashes.
5. **Crashes:** the rider ragdolls and the bike tumbles separately. The rider gets up and rides on.
6. **The rider:** a rigged model posed by the physics (standing on the pegs, sitting, leg out in turns, leaning back on landings).
7. **Bike model:** a realistic dirt bike from Sketchfab under CC BY, branding removed.

## Phase 7: Tracks and racing

1. **Track types:**
   - **Outdoor motocross:** long, natural terrain with hills.
   - **Stadium tracks:** tight, man-made, with big rhythm sections at night under floodlights.
   - **Later, perhaps:** trail and enduro routes through the rally forests, reusing Part 1 terrain.
2. **Fictional venues:** 8–10 tracks with their own soil (clay, sand, hard-pack, mud).
3. **Racing:**
   - **The field:** gates of 20–30 riders, with the classic gate drop start and a fight to the first corner.
   - **AI:** riders who choose lines over jumps, block in berms and make mistakes.
4. **Changing track:** ruts deepen and the track dries or gets muddier through the race.
5. **Performance:** 30 bikes with full 3D physics is heavy, so AI bikes far from you use a lighter version of the physics.

## Phase 8: Motocross career, final sweep and your device check

1. **Content:** a championship and career for motocross, plus freestyle tricks in the air as an optional extra.
2. **Final sweep:** every screenshot, test and performance measurement across both parts.
3. **Your check:** frame rate on your Intel UHD PC and iPhone, and how it feels.

---

## What I need from you

1. **The repo:** an empty GitHub repository for the new game, with GitHub Pages turned on, and a name for the game when you have one.
2. **Models:** the rally car and dirt bike models from Sketchfab (or an API key), after you approve the contact sheets.
3. **Approval** of the co-driver voice samples, and of the names and liveries.

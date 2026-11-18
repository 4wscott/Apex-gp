# Apex GP: road motorcycles plan (v5)

**The aim:** a second racing class in Apex GP. A full grid of 22 road-racing prototype motorcycles (about 300 hp, 360 km/h) on the same 12 circuits, with its own fictional championship, teams, riders and career.

**What doesn't change:** the F1 game. Its physics, lap times, AI, career and saves stay exactly as they are. Every existing F1 test must still pass after each phase.

**How you'll pick it:** the main menu gets a series switch, **Cars / Bikes**. Everything after that (quick race, time trial, championship, career, online) works the same way for bikes. Each series keeps its own saves, records and standings.

---

## Decisions already made (change any of them if you like)

| Question | Default in this plan |
|---|---|
| Bike models | Sketchfab, CC BY: **#3 "Ducati Lenovo Team – MotoGP26"** (87k faces) for your bike and close-ups; **#2 "Ducati Desmosedici GP17"** (12k faces) for the rest of the field and phones. All logos and real branding removed, our own fictional liveries painted on. |
| Names | A fictional series (working name **Apex Moto GP**), fictional makers, teams and riders. No real brands, riders or sponsors. |
| Street circuits | All 12 circuits are open to bikes. On street circuits (Riviera, Baía Dourada) and anywhere a wall is close, bike mode adds inflatable air fences in front of the walls, as real bike races do. |
| Crashes | Realistic: the rider and bike separate and slide. If the bike survives, you can **remount** and rejoin, losing about 20–40 s. A setting, **Crash ends race**, is there for a harder game. |
| Onboard camera | The helmet camera leans with the bike, but only partly (50%) by default, so it feels right without making anyone sick. A setting goes from 0% (level horizon) to 100% (full lean). |
| Pit stops | None in a dry race, as in real bike racing. In a race that turns wet, riders come in and **swap to their second bike** on wet tyres ("flag to flag"). |
| Race length | Real bike races are about 110 km. The race length setting works as for cars, but 100% means about 110 km, not 305 km. |

---

## How every phase is built and checked

Same routine as the graphics plan:

1. **Build it.**
2. **Screenshots** from fixed camera spots on PC (1280×720) and iPhone (upright and sideways), on every preset.
3. **Performance:** a grid of 22 bikes may not cost more draw calls, triangles, memory or frame time than the grid of 22 cars on the same preset.
4. **Tests:** the phase's own test, then the full F1 game test, to prove nothing in the car game changed.
5. **Push**, so the installed apps update on their next launch.

---

## Phase 0: Assets and licences

**Goal:** have every model and sound we need, cleaned of branding, before writing game code.

1. **Bike models.**
   - **What you do:** download #3 and #2 from Sketchfab as glTF (a free account is enough) and put the files in the repo, or give me a Sketchfab API key through the secure credential form and I'll download them.
   - **What I do:** a new `assets/make_bikes.py`, built like `make_models.py`:
     - It scales and centres each model, so the wheels sit on the ground and the axles are where the physics puts them.
     - It splits the model into parts the game moves: front wheel, rear wheel, fork, handlebars, swingarm, body.
     - It removes every logo, number and sponsor from the textures and replaces the fairing paint with an area our livery code paints.
     - It makes three detail levels: hero (#3), field (#2) and a far one of about 2k faces.
     - It compresses everything and embeds it the way the car models are embedded.
2. **Rider model.**
   - **Why it's needed:** a rider moves a lot more than a driver. They tuck on the straights, sit up and slide back under braking, hang off with a knee down in corners and turn their head to the apex.
   - **What I do:** find a rigged rider in leathers on Sketchfab under CC BY and show you a contact sheet first, as I did for the bikes. Its bones are posed by code, so one model covers every pose.
   - **Fallback:** the current race driver model in leathers, with a few fixed poses blended together.
3. **Engine sound.**
   - **What I do:** find a real recording of a four-cylinder racing bike under a free licence on Wikimedia Commons, as the F1 V8 was. Then cut it into loops at several revs, the same way as `assets/engine.js`.
   - **Also:** gear-change crackle from the quick-shifter, a deeper wind roar and the scrape of a knee slider.
4. **Credits** for every model and sound, in the About screen and the licence notes, as for the car models.

**Check:** a contact sheet of the cleaned bikes and rider, with no real branding visible anywhere. You approve it before Phase 1 starts.

---

## Phase 1: Bike physics

**Goal:** a bike that feels like a racing bike. You turn it by leaning, a chicane takes real time to flick through, the front lifts under power, the rear lifts under braking, and it can crash.

1. **A bike class in `src/sim.js`.** A new `Bike` class beside `Car`, with its own `BIKE_BASE`:

   | | Value | Real-world reference |
   |---|---|---|
   | Weight | 157 kg bike + 75 kg rider | class minimum weight |
   | Wheelbase | 1.45 m | |
   | Centre of gravity | 0.60 m high, 52% on the front | |
   | Power | 220 kW (about 300 hp), redline 18,000 rpm, 6 gears | |
   | Top speed | about 360 km/h | the record is 366 km/h |
   | Drag | 0.28 m² tucked, about 0.45 m² sitting up | sitting up is an air brake |
   | Downforce | small (winglets) | |
   | Lean | up to about 62° on the bike | |

2. **Lean is the steering.**
   - **How it's modelled:** your input sets the lean you want. The bike rolls towards it at a limited rate, so a full left-to-right flick takes about 0.8 s. The turn rate follows from the lean (turn rate = g · tan lean / speed).
   - **Why not full counter-steering:** a full counter-steering model is unplayable on a keyboard or a phone. This model keeps what you feel (lean, flick time, running wide) and stays stable.
   - **Rider hang-off:** the bike leans more than the bike-and-rider together, because the rider hangs off the inside. So 62° of bike lean gives about 56° of combined lean, or about 1.5 g of cornering.
3. **Grip.**
   - **Front and rear tyres:** each tyre has its own grip, temperature and wear, with compounds (Soft, Medium, Hard, Wet).
   - **The friction circle:** you can't brake hard and lean fully at the same time. Trail braking into the apex works, but only up to the limit.
   - **Camber thrust:** a leaning tyre pushes inwards, and that's part of how a bike turns.
4. **Wheelies and stoppies.**
   - **Wheelies:** under hard acceleration the front lifts (at about 1.15 g with this weight split). The anti-wheelie electronics hold it down, or, with them off, you hold it with the throttle.
   - **Stoppies:** under very hard braking the rear lifts (at about 1.3–1.4 g). Real riders brake right at that point.
   - **On crests:** both are worked out from the load on each wheel, so they also happen over crests from the hills work.
5. **Crashes.**
   - **Lowside:** the front tyre tucks, or the rear slides out too far, and the bike falls to the inside.
   - **Highside:** the rear steps out, then suddenly grips again while the bike is leaning, and the rider is thrown over the top.
   - **Contact:** a touch with another bike or a wall, above a threshold.
   - **After a crash:** the rider and bike slide separately and are slowed hard by gravel. If the bike is still rideable, the rider gets up, picks it up and rejoins.
6. **Engine maps instead of ERS.** Three maps (Fuel Save, Race, Attack) with a fuel limit for the race, in the same place in the menus and HUD as the ERS modes.
7. **Speed profile for bikes.**
   - The corner speed limit comes from the lean limit, not from downforce.
   - It includes the flick time through chicanes and the wheelie and stoppie limits on acceleration and braking.
   - Bikes get their own racing line: a wider entry, a later apex, standing the bike up early on the exit.
8. **Damage.**
   - **What you see:** scuffed fairing, a broken brake lever, bent bars.
   - **What it does:** a bent bar pulls to one side, and a lost winglet means more wheelies. A destroyed front end means the race is over.

**Checks** (new `test/bikephys.js`):

- **Lean:** the lean in steady corners matches g · tan lean = v² / r within 3%.
- **Wheelie and stoppie limits:** the front lifts and the rear lifts within 0.1 g of the target values.
- **Flick time:** a full left-to-right flick takes 0.7–0.9 s.
- **Lap times:** a bot rider's lap time on each of the 12 circuits is **25–35% slower than the F1 car**, which is the real gap (Barcelona: F1 pole about 1:12, bike pole about 1:38).
- **Top speed:** 340–365 km/h on the longest straights.
- **Crashes:** too much lean, too much throttle while leaned, and braking too hard while leaned all crash. A normal lap does not.

---

## Phase 2: Bikes and riders on screen

**Goal:** a bike that looks real at speed, leaning, wheelieing and crashing, in every view.

1. **Drawing the bike.**
   - **Detail levels:** your bike uses the hero model, other bikes up close use the field model, and distant bikes use the far model. The switch distances depend on the preset.
   - **Moving parts:** the wheels spin, the fork and rear suspension compress under braking and over bumps, the handlebars turn, the chain moves and the brake discs glow under heavy braking at night.
   - **Paint:** the same lit paint as the cars (reflections, clearcoat, rim light), and our livery code paints team colours on the fairing.
2. **Rider poses** (blended continuously from the physics, not switched):
   - **Tuck** on the straights, chin on the tank.
   - **Sitting up** and sliding back on the seat under braking.
   - **Hanging off** the inside with the knee out, then knee down past about 45°, with sparks from the knee slider at night.
   - **Head** turned towards the apex.
   - **Wheelies:** the rider leans forward. **Celebration:** standing up on the pegs on the slow-down lap, with a wave.
3. **Crash animation.**
   - **Rider:** a simple ragdoll of the main bones, sliding and tumbling on the ground and slowed by gravel.
   - **Bike:** tumbles on its own, throws gravel and sparks, and leaves scrape marks.
4. **Cameras.**
   - **Chase:** lower and closer than for a car, and rolls a little with the lean.
   - **Helmet onboard:** leans with the bike by the amount in the setting, with a slight head shake at high speed.
   - **Tail camera:** on the seat unit looking forward, the classic bike-racing TV shot.
   - **Fork camera:** looking back at the rider.
   - **TV cameras and replays:** the existing ones, with bike framing.
5. **Air fences** at street circuits and close walls (see the decisions table), built in the same draw call as the barriers.
6. **Garages:** two bays per team as now, with paddock stands and tyre warmers on the bikes instead of the car jacks.

**Checks:**

- **Screenshots:** every camera, at full lean, in a wheelie, in a crash and in a replay, on every preset.
- **Performance:** a full grid of 22 bikes costs no more than the grid of 22 cars, on every preset and on the iPhone.
- **Branding:** none visible in any shot.

---

## Phase 3: Controls, assists and HUD

**Goal:** easy to ride on a phone, deep enough on a keyboard or gamepad.

1. **Controls.**
   - **Keyboard:** left and right lean, up is throttle and down is the front brake. A separate rear-brake key is optional.
   - **Gamepad:** left stick leans, the triggers are throttle and brake, and a bumper is the rear brake.
   - **Phone:** tilt steering is the default for bikes, because tilting the phone is leaning. Buttons and the drag pad stay as options.
   - **Mouse wheel:** in bike mode it becomes handlebars; dragging left and right leans.
2. **Assists**, all in the same menu as the car assists:
   - Traction control, 0–3.
   - Anti-wheelie, on or off.
   - Cornering ABS, on or off.
   - Combined brakes (one brake input works both brakes), on by default.
   - Automatic gears.
   - **Lean assist** for beginners, which stops you leaning past the grip limit.
3. **HUD.**
   - Lean angle, with your maximum this lap.
   - A wheelie light.
   - Traction-control and anti-wheelie settings.
   - Front and rear tyre temperatures.
   - The engine map, fuel left against fuel needed, and a speed and gear readout.
   - The timing tower and minimap as for cars.

**Checks:** a ride with each control type on PC and phone; the assists change behaviour the way they say; nothing on the HUD covers the bike or the controls on the iPhone, upright or sideways.

---

## Phase 4: AI riders and race rules

**Goal:** 22 AI riders who race like bike racers, with realistic, occasional crashes.

1. **AI riding.**
   - **Lines and timing:** the bike racing line and speed profile from Phase 1. They brake upright and release the brake into the corner.
   - **Overtakes:** a bigger slipstream than for cars, so passes come from the slipstream and on the brakes. They pass up the inside and cut back on the exit.
   - **Contact:** bikes are fragile, so the AI leaves more room. A firm touch can crash either rider.
   - **Mistakes:** each rider has a skill and a small chance of a mistake (running wide, a lowside). **Target:** 0–3 crashes per dry race, more in the wet.
2. **Race weekend:**
   - **Sessions:** practice, qualifying (two parts, as for cars), a **Sprint race** at half distance on Saturday, then the race.
   - **Start:** a warm-up lap, then a standing start from a grid of three bikes per row.
3. **Rules and penalties.**
   - **Track limits:** the green-painted area beyond the kerbs. Three warnings, then a penalty.
   - **Long Lap penalty:** a marked loop through the run-off at one corner of each circuit, which costs about 2–3 s. It's added to every circuit's layout data.
   - **Ride-through** for jumping the start.
4. **Flag to flag:**
   - **When rain arrives:** riders choose when to come in and swap bikes; the AI chooses as cars choose tyres now.
   - **In the pits:** the second bike waits in the garage on wet tyres, and the swap is a short animation.
5. **Rejoining after a crash:**
   - **AI riders:** they rejoin if the bike survives.
   - **Your bike:** when you remount, the game puts you back at the edge of the track and gives a short gap in traffic before you're live again, so you don't rejoin into a passing bike.

**Checks:**

- **Full races:** 22 riders on all 12 circuits in the dry and the rain, every race finishing with no stuck riders.
- **Spread:** realistic gaps between the riders.
- **Crashes:** crash and remount rates inside the targets.
- **Penalties:** the Long Lap path is driven correctly and costs the right time.

---

## Phase 5: Series, teams, career and sound

**Goal:** the bike series is a full game mode, not a test track.

1. **Teams and riders.**
   - **The grid:** six fictional makers, each with a factory team, and five independent teams that use their bikes, for 11 teams × 2 riders = 22 bikes.
   - **Liveries:** each team gets its own livery, with numbers and rider codes.
   - **Approval:** I'll show you the names and liveries before they go in.
2. **Championship and career.**
   - **Points and calendar:** real bike-racing points for the race and for the sprint, over a 12-round calendar.
   - **Career:** the same structure as the car career: sign for a team, rider skill, bike upgrades (engine, chassis, electronics) and team expectations.
   - **Saves:** kept separately from the car career.
3. **Sound.**
   - The bike engine loops from Phase 0, the quick-shifter crackle and the limiter.
   - Wind noise that drops when you sit up.
   - The knee-slider scrape, and crash sounds (scraping fairing, gravel).
   - Team radio replaced by pit board messages, which is how riders get information.
4. **Menus:** the Cars / Bikes switch, bike pictures on the team and rider cards, and the bike on the podium.

**Check:** a full career season start to finish, on PC and phone.

---

## Phase 6: Online, final sweep and your device check

1. **Online.** The race setup sent to other players gets a series field, so bikes race only against bikes. An older app joining gets a clear "update needed" message, as the layout check does now.
2. **Final sweep.**
   - **Screenshots:** every circuit, every camera and every preset.
   - **Tests:** every bike and car test.
   - **Performance:** compared against the F1 numbers.
3. **Your check:** frame rate on your Intel UHD PC (Lite and Smooth) and iPhone (Balanced), a race in each view, and how it feels to ride.

---

## What I need from you

1. **The two bike models** from Sketchfab (download them and add them to the repo, or give me an API key through the credential form).
2. **Approval** of the rider model contact sheet, and of the team names and liveries, when I show them to you.

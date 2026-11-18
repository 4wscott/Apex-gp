# Apex GP: graphics and realism plan (v4)

This plan comes from the review of 18 November 2026: races at Riviera, Silverwood and Parco on the Balanced preset (High quality), in chase and cockpit view, in the dry, the rain and at dusk, on PC and iPhone.

**The aim:** the game should look more like a TV broadcast and a real circuit. It must not get slower on the Intel UHD PC or the iPhone.

**Already strong:** liveries, rain spray, the menu and logo, car-to-car contact, crash damage and AI racecraft. This plan doesn't touch them.

**The 10 review items and where each one is handled**

| # | Item | Phase |
|---|---|---|
| 1 | Cars look almost black from behind | 1 |
| 2 | Street buildings look like cardboard boxes | 2 |
| 3 | Barrier blocks look like toy blocks | 2 |
| 4 | Palms are black silhouettes, trees are flat cards, grass is dark spikes | 3 |
| 5 | Colour fringing at the screen edges is too strong | 1 |
| 6 | Cockpit halo is too dark | 1 |
| 7 | Every circuit is completely flat | 4 |
| 8 | Timing tower covers the car panel on PC and the steering buttons on phone | 1 |
| 9 | On-screen mouse wheel duplicates the real wheel in cockpit view; its hint covers the track | 1 |
| 10 | Phone menu cuts off the circuit name and race settings | 1 |

---

## How every phase is built and checked

1. **Build it.**
2. **Before and after screenshots:**
   - Taken from the same seeded camera spots, on PC (1280×720) and iPhone (390×844 upright, 844×390 sideways).
   - Taken on every preset: Lite, Smooth, Balanced and Beautiful (Low, Medium, High and Ultra quality).
3. **Performance check against the Phase 0 baseline:**
   - **What's measured:** draw calls, triangles, GPU memory, load time, and frame time in the software-render test.
   - **Lite and Smooth:** no more draw calls or memory than today.
   - **Balanced and Beautiful:** at most 5% more draw calls and 30 MB more memory.
   - No preset may get slower.
4. **Tests:** run the phase's own test, then the full game test (career, qualifying, race, time trial, pause, restart, quit).
5. **Push,** so installed apps update on their next launch.

---

## Phase 0: Baseline

**Goal:** before changing anything, get numbers and pictures to compare against.

1. **Reference shots:**
   - **Spots:** six fixed camera spots on each of the 12 circuits, in chase, cockpit and TV camera.
   - **Conditions:** dry daytime on every circuit, plus rain and dusk/night where the circuit has them.
   - **Storage:** saved so every later phase is compared side by side.
2. **Performance numbers per preset:** draw calls, triangles, texture and geometry memory, load time, and frame time in the software renderer.
3. **Car brightness probe:**
   - **What it does:** measures the average brightness of your car's pixels from 8 directions around it, with each circuit's sun.
   - **What it shows:** how dark the car gets when the sun is behind it. That number sets the target for Phase 1 item 1.
4. **Test:** `test/visualbase.js` writes the baseline to a JSON file that later phases read.

---

## Phase 1: Quick fixes (items 1, 5, 6, 8, 9, 10)

**Goal:** fixes you notice on the very next drive, with no performance cost. They change shader settings, lighting and the HUD, not scene size.

1. **Cars lit from every angle (item 1).**
   - **The problem:** the orange car looks dark maroon from behind in chase view, but orange from the cockpit.
   - **Likely causes, confirmed with the brightness probe:**
     - The side facing away from the sun only gets a weak sky light.
     - On Balanced and Beautiful, the car's own reflection capture sees dark road and buildings, which darkens the paint further.
     - The rear wing's shadow falls fully black on the engine cover.
   - **Fixes:**
     - The paint takes its soft all-round light from the sky image. The local reflection only drives the glossy clear coat.
     - A gentle rim light on the paint edges, like a TV car shot: the car's outline catches the sky, so it never merges into the road.
     - Shadows on the car are softened slightly, so a car under its own wing or under a garage roof isn't pitch black.
     - The sky fill is tuned per scenery type. Street circuits get a little extra bounce light from the buildings and road.
   - **Target:**
     - The team colour is recognisable from every angle.
     - The side away from the sun is at least 45% as bright as the sunlit side.
     - It's the same in the garage and pit box, which also covers the earlier "car turned black in the pits".

2. **Subtle lens effects (item 5).**
   - **Today:** a fixed purple/green fringe at the screen edges, even when the car is stopped.
   - **New fringe:** about a third as strong, and it only appears at speed, growing from about 160 km/h. There's none in menus or when stopped, and replay TV cameras use only a trace.
   - **New setting:** Settings → Graphics → **Lens effects** On/Off switches off the fringe, vignette and speed blur together.

3. **Halo and cockpit (item 6).**
   - **Halo:** a satin finish that picks up the sky, in the team colour or carbon to suit the livery, instead of a near-black bar.
   - **Cockpit:** a soft fill light in cockpit view only, so the halo, wheel, gloves and dash read clearly. It stays darker than outside, like a real onboard camera.

4. **Timing tower (item 8).**
   - **Compact by default, 8 rows:** the top 3, a divider, then the two cars ahead of you, you, and the two behind.
   - **Expanding:**
     - Tap or click the tower, or press **T** on PC, to show all 22 cars. It collapses again after 8 seconds.
     - On the last lap it switches to the full order by itself.
   - **Space-aware:**
     - The tower measures the space it has. On PC it stops above the car panel (ERS, aero, brake bias, tyres) and never runs into it.
     - On phones it stays clear of the left/right steering buttons at every phone size.
   - **Status markers:** PIT and OUT (retired) show on the rows.

5. **Mouse wheel in cockpit view (item 9).**
   - **The duplicate goes:** in cockpit view the on-screen wheel hides, and the car's own 3D wheel turns with the mouse.
   - **Grab mode:** press anywhere in the lower half of the screen and turn. A faint ring shows where you grabbed, then fades.
   - **Follow mode:** works as it does now.
   - **The hint:**
     - It shows for 6 seconds at the start of your first 3 sessions, then not again.
     - Settings → Controls → **Mouse wheel help** → Show again brings it back.

6. **Phone menu (item 10).**
   - **Full text:** the circuit name and the race settings line fit in full, by wrapping to two lines or shrinking slightly.
   - **Short names:** used when space is very tight, for example "Riviera". Tapping the card shows everything.
   - **Sizes checked:** iPhone SE (375 wide), standard iPhones, and sideways.

7. **Tests:**
   - **Car brightness:** the probe meets the target on all 12 circuits from all 8 directions, and in the pit box.
   - **Lens effects:** no fringe when stopped, and the Lens effects switch turns everything off.
   - **Timing tower:**
     - It shows 8 rows compact and 22 expanded, and goes to the full order on the last lap.
     - It never overlaps the car panel or the steering buttons, checked by on-screen boxes at 4 screen sizes.
   - **Cockpit steering:** mouse steering works in cockpit view with the on-screen wheel hidden, in both modes.
   - **Phone menu:** no menu text is cut off at 4 screen sizes.
   - **Performance:** the baseline numbers are unchanged.

---

## Phase 2: Street circuits that look like real streets (items 2 and 3)

**Goal:** Riviera and Monte Alto look like a city, and every circuit's barriers look like real circuit hardware. All designs stay original, with no real brands or landmarks.

### Buildings

1. **A facade kit:** 6 original building styles painted into one texture sheet.
   - **Mediterranean apartments:** cream, ochre and pastel render, shuttered windows, wrought-iron balconies.
   - **Hotel:** stone ground floor with arches, a name sign, flags.
   - **Glass office tower:** blue-green curtain wall with frames and sky reflections.
   - **Older stone block:** cornices between floors, tall windows.
   - **Modern residential:** white, with deep balconies and glass rails.
   - **Shopfronts at street level:** cafés, awnings, signs.

   **Real proportions:**
   - Storeys are 3.2 m and ground floors 4.5 m.
   - Window patterns vary per building and per floor instead of one repeated grid.

2. **Real building shapes.**
   - **Tops:** towers on podiums, stepped tops, terracotta pitched roofs on old buildings, and flat roofs with air-conditioning units, water tanks, antennas and roof terraces.
   - **Layout:** along street circuits, buildings form a continuous street wall facing the track, with gaps for side streets, instead of scattered boxes.

3. **Depth where you can see it.**
   - **Close to the track:** balconies and cornices are real geometry within about 90 m of the track, on Balanced and Beautiful.
   - **Further away, and on Lite and Smooth:** a relief texture gives the same look for free.

4. **Dusk and night:** windows light randomly in warm and cool tones, and shop windows and signs glow.

5. **Skyline:** a far layer of the city climbing the hills behind. It's one cheap mesh with a low-resolution texture.

6. **Street details:**
   - **By the track:** lamp posts, road signs, painted pedestrian crossings and manhole covers on the track, as real street circuits keep them.
   - **Behind the fences:** planters and café tables.

### Barriers

7. **Concrete walls:**
   - **The wall itself:** precast concrete blocks with visible joints every 4 m and a chamfered top edge. Each is painted white with a red stripe or wrapped in sponsor colours.
   - **The debris fence on top:** posts at real spacing, with the top section angled in toward the track like real catch fences.

8. **Steel guardrail (Armco):** double or triple rails on posts at the older, faster circuits (Ardenne and Nordhang) where a wall doesn't suit.

9. **Foam impact barriers** (the red/blue blocks):
   - **Shape:** rounded, bevelled blocks with the real proportions of the modular foam barriers used at circuits.
   - **Look:** wrapped in sponsor covers or one uniform colour, instead of flat alternating cubes.
   - **Placement:** laid in a continuous, slightly curved line, two rows deep on the outside of heavy braking zones, and at the end of escape roads on street circuits.

10. **Tyre walls:** bolted stacks with a conveyor-belt cover across the front, as real circuits use.

11. **Marshal posts:** real light panels that light up with the race flags the game already uses: yellow for an incident in that sector, the virtual safety car, and blue for a car about to be lapped.

### Cost

- **Buildings:**
  - All buildings stay one draw call at every preset. Each building picks its style from the texture sheet, so there's no extra call per style.
  - The texture sheet replaces today's window texture: 1024×1024 on Balanced and Beautiful, 512×512 on Smooth and 256×256 on Lite.
- **Balcony and cornice geometry:** Balanced and Beautiful only, merged into the existing 24 track sections, so it adds no draw calls.
- **Foam barriers:** a low-poly rounded block on Lite and Smooth, and a smoother one on Balanced and Beautiful.
- **Physics:** wall contact uses the same barrier line as today. This is a visual change only.

### Tests

- **Screenshots:** before and after at 6 spots on Riviera and Monte Alto (day and night), and at a braking zone on every circuit.
- **Performance:** within budget on each preset.
- **Placement:** buildings never overlap the track, pit area or grandstands.
- **Wall contact:** checked unchanged, with the same hits at the same places.

---

## Phase 3: Trees, palms and grass (item 4)

**Goal:** green, natural scenery instead of black silhouettes and dark spikes.

1. **Palms:**
   - **Fronds:** a new frond texture (single leaflets along a stem, see-through between them), with 12–16 fronds drooping in an arc plus a few young upright ones.
   - **Trunk:** ring scars and a slight lean.
   - **Light through the leaves:** a palm with the sun behind it glows green-yellow instead of going black.
   - **Variety:** 3 shape variants.
2. **Broadleaf trees:**
   - **Leaves:** clustered leaf cards with a new leaf-cluster texture.
   - **Shapes:** varied crowns (round, tall, spreading).
   - **Colour:** varied per tree, with light through the leaves at sunset.
3. **Pines:** denser tiers, darker blue-green, and a proper cone silhouette.
4. **Distant trees:**
   - **What changes:** beyond about 250 m, trees become flat pictures that always face the camera.
   - **Why:** this lets the game show more trees for the same cost.
   - **On Lite:** a proper treeline instead of a few scattered trees.
5. **Grass:**
   - **Tufts:** shorter and softer, coloured to match the ground they stand on, and lit like the ground. They blend in instead of standing out dark.
   - **Distance:** they fade out instead of popping.
   - **Placement:** clumps grow along fence lines and around posts, and the mown stripes on the verges stay.
6. **Ground:**
   - **Colour:** gentle colour patches (drier and lusher areas).
   - **Paths:** worn paths behind the barriers.
7. **Wind:** the trees' gentle sway stays, and palm frond tips move too.

**Cost:**
- **Trees:** the same number of full 3D trees per preset. Distant trees are cheap pictures, so every preset also gets a treeline further out: Lite shows 0.4× today's full tree count in all (up from 0.15×).
- **Grass:** the same tuft count or fewer.

**Tests:**
- **Screenshots:** before and after at Parco, Ardenne, Serra Azul and Baía Dourada, with the sun in front and behind.
- **Palm brightness:** the brightness of backlit palms is measured.
- **Performance:** within budget on each preset.

---

## Phase 4: Hills, crests and banking (item 7)

**Goal:**
- Real elevation: climbs, drops, blind crests, compressions and banked corners.
- Physics and AI that react to it.

Today every circuit is flat; only the land beyond the barriers has hills. This is the biggest piece of work, so it's split into parts. All parts ship together, because hills you can see but can't feel would be wrong.

### 4a. Height data for every circuit

1. **The profile:**
   - Each circuit gets heights at points round the lap, smoothed into a continuous road with no kinks.
   - It also gets banking and camber angles.
2. **Pit straight:** the start/finish straight and pit lane stay nearly level, at most a 2% slope. The grid, pit boxes and garages stay flat.
3. **Profiles inspired by real circuits,** approximately (the layouts stay original):

   | Circuit | Inspired by | Height range | Signature |
   |---|---|---|---|
   | Autodromo del Parco | Monza | about 10 m | nearly flat, slight dips |
   | Silverwood | Silverstone | about 10 m | flat airfield |
   | Ardenne Forest Ring | Spa | about 100 m | a compression and steep climb after the first corner, a long downhill through the woods |
   | Riviera Street Circuit | Monaco | about 40 m | a climb from the first corner to the square at the top, a steep drop to the hairpin and harbour |
   | Serra Azul | Interlagos | about 40 m | a downhill first-corner S, a climbing final run to the line |
   | Circuit de l'Ile | Montreal | about 5 m | flat |
   | Sahra Sands | Bahrain | about 15 m | gentle rises |
   | Baía Dourada | Portimão | about 50 m | blind crests, rollercoaster |
   | Nordhang Ring | Red Bull Ring | about 65 m | a long uphill blast to turn 1, downhill sweepers |
   | Autódromo Monte Alto | Mexico City | about 10 m | flat, with a dip into the stadium |
   | Lakeside Park | Zandvoort | about 20 m | dunes and two steeply banked corners (about 18°) |
   | Lone Star Raceway | Circuit of the Americas | about 40 m | a steep climb (about 11%) to the turn-1 hairpin, downhill esses |

4. **Camber:**
   - **Everywhere:** roads have a slight crown (1–2%).
   - **Street circuits:** real road camber.
   - **Off-camber corners:** a few, on Baía Dourada, Serra Azul and Lone Star.

### 4b. Road and world follow the hills

1. **Everything built at load follows the road's height:**
   - The road, kerbs, run-off, walls, fences, painted lines and rubber marks.
   - The grid boxes, start gantry, pit lane, garages, grandstands, marshal posts and sponsor boards.
2. **The land beyond the barriers blends into the road,** so the landscape rises and falls with the circuit. Where the road climbs, there are cuttings and embankments.
3. **Cars sit on the surface:**
   - Their height, nose-up or nose-down pitch on slopes, and lean on banking all come from the four wheel contact points.
   - Suspension movement shows over crests and compressions.
4. **Everything else at the right height:** flying parts, debris, sparks, rain spray, the pit crew, the podium and the crowd.
5. **Cameras:**
   - **Chase camera:** stays steady over crests, with no jolts.
   - **Cockpit view:** you see the climb and the horizon tilt on banking.
   - **TV and helicopter cameras:** aim at the right height.
6. **Shadows:** the sun's shadow area follows the car's height.

### 4c. Physics

1. **Slopes:** gravity acts along the slope.
   - Uphill costs speed and downhill adds it.
   - Braking distances grow downhill and shrink uphill.
2. **Crests and compressions:**
   - **Over a crest,** the car goes light: less grip and less braking.
   - **In a compression,** it's pressed down: more grip, and the floor can scrape with sparks.
3. **Banking:** the bank holds the car, so banked corners can be taken faster than flat ones of the same radius.
4. **Camber:** off-camber corners give less grip.
5. **What stays the same:**
   - The physics stays a flat model plus the road's height. This keeps the 360-steps-per-second simulation fast on phones.
   - Wall contact and car-to-car contact work as they do now.

### 4d. AI, timing and saved data

1. **AI:**
   - **Speed and braking:** AI speed and braking points include slopes, crests and banking. The AI brakes earlier downhill and carries speed round banked corners.
   - **Racing line:** unchanged seen from above. Only the speeds along it are recalculated.
   - **Pace:** reference lap times and AI qualifying times are recalculated per circuit, and AI pace is re-tuned so races stay close.
2. **Saved data:**
   - Time-trial best laps and ghosts set before the hills are kept but marked "old layout", because lap times change.
   - Replays still play.
   - Online races check that both players have the same circuit version.
3. **Circuit card:** the menu's circuit card shows a small height profile of the lap.

### Cost

- **Draw calls:** none added. The heights are worked out once at load.
- **Physics:** a few height lookups per car per step. These must add no more than 5% to simulation time.

### Tests

- **Road:**
  - Continuous, with no gaps between road, kerbs and walls.
  - Slopes stay within limits.
  - The grid and pit lane are level.
- **Slopes:**
  - A car holds still on a slope with the brakes on and rolls back without them.
  - Top speed is lower uphill than downhill.
- **Crests, compressions and banking:**
  - Measured tyre load drops over a crest and rises in a compression.
  - A banked corner is taken faster than a flat one of the same radius.
- **Full AI race on every circuit:**
  - All 22 cars finish, with no rescues and no pile-ups (the racecraft test).
  - Lap times fall in the expected range.
- **Screenshots:** at each circuit's signature spot (crest, compression, banked corner).
- **Old saves:** old saves, time-trial records and replays still load.

---

## Phase 5: Final pass on your devices

1. **Full screenshot sweep:**
   - Covers all 12 circuits on all 4 presets, in day, rain and night.
   - Compared side by side with the Phase 0 baseline.
2. **Performance:** frame time and memory per preset against the baseline. Phone memory is checked at iPhone size.
3. **Your check:** set Settings → **Performance meter** to show the frame rate, and note the fps:
   - On the Intel UHD PC, on Lite and on Smooth.
   - On the iPhone, on Balanced.

---

## Choices made (say if you want any changed)

- **Colour fringing:** kept but subtle and only at speed, with an off switch, rather than removed.
- **Timing tower:** compact by default, with the full list on tap.
- **Hills:** on all 12 circuits. Circuits that are flat in real life stay nearly flat.
- **Old time-trial records:** kept, marked "old layout", because lap times change with hills.
- **Designs:** all buildings, barriers and signs are original, with no real brands or landmarks.

## Order and effort

| Phase | What you get | Size |
|---|---|---|
| 0 | Baseline numbers and reference screenshots | Small |
| 1 | Cars lit from every angle, subtle lens effects, a readable halo, compact timing tower, cockpit mouse steering without the duplicate wheel, full text on the phone menu | Small–medium |
| 2 | Real street buildings and real circuit barriers | Large |
| 3 | Better palms, trees and grass | Medium |
| 4 | Hills, crests, compressions and banking, with physics and AI to match | Very large |
| 5 | Final pass on all circuits and your devices | Small |

**Suggested order:** 0 → 1 → 2 → 3 → 4 → 5.
- **Phase 1:** quick, and you'd see it on your next drive.
- **Phases 2 and 3:** change how every circuit looks.
- **Phase 4:** the biggest change to how the game drives, so it comes last and ships in one piece.

## Status

All phases are built. Phase 5's own check, on your PC and iPhone, is yours to do.

### What the baseline showed

**The dark car was a bug, not just lighting.**
- **The cause:** on Balanced and Beautiful, the car's paint gets its light from a reflection of its surroundings. That reflection was converted for the paint only once, before anything had been drawn into it. So the paint was lit by a black world for the whole race.
- **Before:** your car measured 42–77 brightness (out of 255) from 8 directions on Balanced, against 64–111 on Smooth.
- **After the fix (Parco):** 75–95 from every direction, against 42–77 before. The darkest side is now 79% as bright as the brightest, up from 54%.
- **Riviera and Ardenne:** 83–92 and 86–116.

### Built

- **Phase 1:**
  - **Car lighting:** the reflection fix, plus a soft rim light on the paint, sky fill on the side away from the sun, and car shadows that are deep but never black.
  - **Lens effects:** fringe only at speed, plus the Lens effects switch.
  - **Cockpit:** a fill light in cockpit view.
  - **Timing tower:** compact 8 rows, tap or T for all 22, PIT and OUT markers, sized to the space it has.
  - **Mouse wheel in cockpit view:** hidden; drag low on the screen to steer.
  - **Wheel help:** shown in the first 3 sessions only.
  - **Phone menu:** names that never get cut off.
- **Phase 2:**
  - **Street buildings:**
    - Riviera has about 840 buildings: a street wall facing the track, shops and cafés at street level, towers on podiums, tiled roofs, and towns on the hills behind.
    - On Balanced and up there are about 1,400 balconies, cornices and roof units, plus lamp posts, café umbrellas and painted crossings.
  - **Barriers:**
    - Concrete walls with joints and a chamfered top, and catch fences with an angled top.
    - Steel guardrail at Ardenne and Nordhang.
    - Rounded foam blocks in two rows, and belted tyre walls, at the big stops.
    - Marshal posts with flag light panels.
- **Phase 3:**
  - **Trees:** new palms with drooping fronds and light through them, fuller broadleaf trees, denser pines.
  - **Distant trees:** flat pictures that face the camera.
  - **Grass:** softer and lighter, fading with distance.
  - **Ground:** drier and lusher patches, and worn paths behind the barriers.
- **Phase 4:**
  - **Hills and banking:** on all 12 circuits (heights below).
  - **Physics:** slopes, crests, compressions and banking, with the AI speed plan to match.
  - **On the hills:** cars, cameras, sparks and flying parts all follow the road's height.
  - **Saved data:** old time-trial records are marked "old layout", and online play checks both players have the same version.
  - **Menu:** each circuit card shows the lap's height profile.

| Circuit | Height range | Steepest | Banking |
|---|---|---|---|
| Autodromo del Parco | 8 m | 1 % | – |
| Silverwood | 9 m | 1 % | – |
| Ardenne Forest Ring | 88 m | 18 % | – |
| Riviera Street Circuit | 40 m | 11 % | – |
| Serra Azul | 34 m | 8 % | 4°, and one off-camber corner |
| Circuit de l'Ile | 3 m | 1 % | – |
| Sahra Sands | 14 m | 2 % | – |
| Baía Dourada | 37 m | 8 % | 3°, and one off-camber corner |
| Nordhang Ring | 59 m | 7 % | – |
| Autódromo Monte Alto | 7 m | 4 % | – |
| Lakeside Park | 18 m | 3 % | two corners at 18°, turn 1 at 6° |
| Lone Star Raceway | 32 m | 15 % | 5°, and one off-camber corner |

### Changes from the plan

- **Banking strength:**
  - The first version made Lakeside's banked corners about 40% faster. That bunched the field and caused crashes.
  - The banking's extra grip was toned down to what real tyres give, where grip per kilo falls as load rises.
  - It's now worth 1.3 s a lap at Lakeside, and AI races there are clean (22 of 22 finish).
- **Texture sheet on Lite:** the building image is 256×256 on Lite (not 512), to keep memory level.
- **The live paint reflection:**
  - Once the reflection was refreshed properly, a stray invalid pixel in it could black out the whole car on Balanced in a running race.
  - It's now copied between frames from an 8-bit capture, and the paint ignores any invalid value. A live-race check in `test/visual1.js` guards it.
- **Guardrail posts:** a post every 4 m. The first version placed more posts than it had room for, which drew giant streaks at Ardenne; that is fixed.

### Tests

- `test/visual1.js`: phase 1 (brightness, lens, tower, cockpit wheel, phones, menu).
- `test/visual23.js`: phases 2–3 (buildings, barriers, trees, screenshots).
- `test/hills.js`: phase 4 (road, slopes, crests, banking, AI races).
- `test/visualbase.js`: the baseline, the speed numbers and before/after screenshots.

The existing simulation tests still pass (simtest, racecraft, carhit, pits, racetest), and so does the damage test.

The podium test has two checks that depend on frame rate. In the software renderer used here they time out on the old build as well (the champagne check fails on both). The car still gets to its pit box and the results still appear; it just takes longer than the test waits when frames are slow.

### Performance (software renderer, 22 cars, before → after)

Measured in a software renderer (no graphics card), so frame times are only a rough guide (about ±5–10 % between runs). Draw calls, triangles and memory are exact.

| Preset | Circuit | Draw calls | Triangles | Texture memory | Geometry memory | Frame time |
|---|---|---|---|---|---|---|
| Lite | Riviera | 526 → 527 | 1.49 M → 1.08 M | 232 → 232 MB | 39 → 39 MB | 2.45 → 2.12 s |
| Lite | Ardenne | 544 → 548 | 1.70 M → 1.31 M | 236 → 237 MB | 42 → 43 MB | 2.28 → 2.23 s |
| Smooth | Riviera | 604 → 605 | 2.10 M → 1.80 M | 231 → 233 MB | 41 → 41 MB | 3.15 → 3.29 s |
| Smooth | Ardenne | 624 → 627 | 3.16 M → 2.88 M | 235 → 237 MB | 46 → 48 MB | 4.22 → 4.12 s |
| Balanced | Riviera | 1254 → 1262 | 6.24 M → 5.91 M | 232 → 237 MB | 43 → 44 MB | 5.86 → 6.05 s |
| Balanced | Ardenne | 1294 → 1300 | 10.38 M → 10.10 M | 236 → 242 MB | 49 → 55 MB | 8.98 → 9.39 s |

- **Lite and Smooth:**
  - Up to 4 more draw calls and 2 MB more memory (under 1 %). These come from the distant-tree pictures and, at Ardenne and Nordhang, the guardrail posts.
  - 9–27 % fewer triangles, and no slower.
- **Balanced:**
  - 6–8 more draw calls and 5–6 MB more memory, within the plan's budget.
  - About 3–5 % slower, roughly the measurement's noise. Part of it is the car-reflection fix, which now refreshes the reflection every 8 frames.


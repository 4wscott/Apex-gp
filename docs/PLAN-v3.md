# Apex GP: plan v3 (phases 1–6)

Same routine for every phase:
1. Build it.
2. Run a phase test on PC (1280×720) and iPhone (390×844 upright, 844×390 sideways).
3. Run the full game test (career, qualifying, race, time trial, pause/restart/quit).
4. Review screenshots at each size.
5. Push, so installed apps update on their next launch.

## Phase 1: Driving feel
**Goal:** a car that is forgiving for beginners and still rewarding for experts.

1. **Difficulty presets** (Settings → Driving, at the top), each a one-tap bundle:

   | Preset | Traction control | ABS | Steering assist | Stability control | Braking assist | AI pace |
   |---|---|---|---|---|---|---|
   | Beginner | Full | On | On | Strong | On | 88% |
   | Intermediate | Medium | On | On | Light | Off | 96% |
   | Pro | Off | Off | Off | Off | Off | 100% |

   Changing any single option afterwards shows *Custom*.
2. **Stability control (new, in the physics).** When the rear slides beyond a set angle, the car trims throttle and applies a small counter-yaw, like a road car's ESC. Strong / Light / Off.
3. **Braking assist (new).** The car looks ahead along the racing line's speed profile and brakes for you when you arrive too fast. You can still brake harder yourself. Most useful on phone buttons.
4. **Catch slides on keyboard and touch.** When the rear steps out, steering input moves faster toward opposite lock, so a digital (on/off) steering input can still catch the car.
5. **Wall contact that slides.** A glancing hit (under about 25°) keeps most of the car's speed and turns it along the wall instead of bouncing it back into the track with a yaw kick. Head-on hits still stop the car.
6. **Tests:**
   - A scripted "keyboard driver" (on/off steering, full throttle on exit) runs laps on Beginner, Intermediate and Pro; spins are counted for each.
   - Glancing and head-on wall hits are measured for speed kept and yaw.
   - Real cars are also run with AI drivers, to check nothing gets slower or breaks.

## Phase 2: Sound
1. **Engine character per camera.** Cockpit gets more intake and low-end with a muffled exhaust; outside cameras (chase, TV) get the sharp exhaust note.
2. **Gear-shift crack.** A short, sharp "crack" layered on each upshift, louder at high revs.
3. **Other cars.**
   - The engine pitch rises as a car approaches and drops as it passes (Doppler).
   - A wind "whoosh" plays on close passes.
   - Engines pan left and right with position.
4. **Tyre squeal.** Pitch and loudness follow how far past the grip limit the tyres are.
5. **Crowd.**
   - The crowd swells as you pass the main grandstand.
   - It cheers for overtakes and at the finish.
6. **Radio ducking.** While the engineer talks, music and engine dip so the voice is clear.
7. **Settings.** Separate *Engine & effects* and *Radio voice* volumes.
8. **Tests:**
   - The Doppler and ducking maths, as small automated checks.
   - The sound setup builds without errors.
   - Volumes change during a scripted pass-by.

## Phase 3: Damage and race control
1. **Visible damage.**
   - After a hard hit, a broken front-wing endplate hangs from the nose and drags slightly.
   - Big hits throw carbon pieces onto the track (they stay for the lap), plus a puff of tyre smoke.
   - A pit stop or a Practice reset restores the nose.
2. **Safety car** (races only):
   - **When:** a stopped car blocks the track, or a big crash happens.
   - **The car:** a silver safety car with a flashing light bar joins from the pit exit ahead of the leader.
   - **Field:** everyone queues up behind it, with no overtaking. The AI closes up the gaps.
   - **Player:** gets the SC banner, a speed cap and a "close the gap" delta. Overtaking under the safety car means a 5 s penalty.
   - **Restart:** after 2–3 laps the lights go out and the car pits; the restart comes at the line.
   - **Existing systems:** the VSC stays for smaller incidents. Team radio announces both.
3. **Penalties.**
   - Track limits: 3 warnings, then the black-and-white flag shown, then 5 s on the 4th.
   - Speeding in the pit lane (by design the car keeps to the limiter): stays a rule in the text.
   - Penalties are listed in the results with the reason.
4. **Tests:**
   - Force a safety car in a race: it appears and leads, the field bunches up with no overtakes, then the restart.
   - An overtake under the safety car earns a penalty.
   - A damage part shows after a hit and is gone after a reset.

## Phase 4: Controllers
1. **Recognised controllers.** Xbox, PlayStation and generic pads are recognised by name. A banner shows "Xbox controller connected" (or similar).
2. **Button names for your pad.** The pause card and Controls tab show the right button names: A/B/X/Y or Cross/Circle/Square/Triangle, LT/RT or L2/R2.
3. **Saved setups.** Bindings and deadzone are saved per controller. Plugging in a known controller loads its setup.
4. **Vibration.**
   - Strength setting: Off / Light / Strong.
   - Separate feel for kerbs, lock-ups, wheelspin, wall hits and the rev limiter.
5. **Menus with a controller.** The D-pad / stick moves through menu buttons, A or Cross selects, B or Circle goes back.
6. **Tests:** mocked Xbox and PlayStation pads check the name, button labels, saved setups, vibration calls and menu navigation.

## Phase 5: Online racing
1. **Lobby.** It shows each player's team colours, car and device (PC / iPhone). The host sets circuit, laps, weather and time of day.
2. **In the race.** Every new system works online: car setup, team radio, skid marks, wall damage, replays.
3. **After the race.**
   - Results for everyone, with *Rematch* (same room, same settings) and *Replay*.
4. **Connection.** A "reconnecting…" notice if a player drops; their car is driven home by the AI.
5. **Tests:** two browsers (one PC-sized, one iPhone-sized) join a room through the real connection service, race, see each other move, then use Rematch.

## Phase 6: Content
1. **Two new circuits:**
   - *Monte Alto* (Mexico): high-altitude stadium section.
   - *Lakeside Park* (Netherlands): flowing dunes, twisty and fast.
2. **Livery editor** (Career → My car):
   - Primary, secondary and accent colours, plus four stripe patterns.
   - A live preview on the showroom car. The race car and replays use it.
3. **Sprint weekends.** Three rounds each season are sprint weekends: a short sprint (about 1/3 distance, points 8-7-6-5-4-3-2-1) before the Grand Prix. They're shown in the calendar and the hub.
4. **Tests:**
   - Both circuits build cleanly and lap with the AI.
   - Livery colours reach the race car.
   - A sprint weekend runs Sprint → GP with the right points.

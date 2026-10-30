# Apex GP: plan v2 (phases 1–6)

Each phase is built, tested on PC (1280×720, 1920×1080) and iPhone (390×844 upright, 844×390 sideways),
run through the full game test, then pushed so installed apps update on their next launch.

## Phase 1: Smooth driving
1. **Performance meter.** Settings → Graphics & sound → *Show performance*: a small readout with frames per
   second, frame time, and a mini graph of the last 2 seconds, so stutters are visible and measurable.
2. **One-tap presets.** *Smooth / Balanced / Beautiful* at the top of Graphics & sound. Each sets quality, mirrors,
   resolution mode and the high-res pack together; picking any individual option afterwards shows "Custom".
   Defaults: PC = Balanced (High), iPhone = Balanced (Medium).
3. **Smoother cameras.** The chase cameras follow position with a critically damped spring (no jitter at
   300 km/h); the cockpit and T-cam smooth tiny frame-to-frame jumps; the camera never reacts to a single slow frame.
4. **Steady frame pacing.** Physics keeps its fixed 360 Hz step; the camera and car meshes are drawn between
   physics steps (interpolated), so uneven frame times don't show as judder.

## Phase 2: TV replays
1. **Recorder.** Every car's position, heading, speed, steering, braking, aero and pit state are stored at 20 Hz
   for the whole session (a few MB at most), plus events (overtakes, pit stops, crashes).
2. **Replay player.** Pause → *Replay*, and *Watch replay* on the results screen. Playback freezes the race,
   drives every car from the recording with smooth interpolation, then restores the live race exactly.
3. **Cameras.** TV (trackside cameras round the lap that zoom and pan to follow), Helicopter (high, slow orbit),
   On-board (T-cam), Chase, and Auto-director (cuts between them like a broadcast).
4. **Controls.** Play/pause, −5 s / +5 s, slow-motion (¼×, ½×, 1×), previous/next car, camera, exit. Large touch
   targets on iPhone; keyboard shortcuts too on PC.
5. **Highlights.** After a race, *Highlights* plays the start, overtakes and the finish back to back.

## Phase 3: Race weekend
1. **Weekend format.** Grand Prix gets *Race only* or *Qualifying + race*. Qualifying is a timed session; the grid
   is set by the lap times.
2. **Car setup.** Race settings → *Car setup*: front/rear wing (downforce vs top speed), brake balance start value,
   differential, and tyre pressure (grip vs wear/temperature), all wired into the physics, with a plain-English
   effect line under each.
3. **Team radio.** Engineer messages: gaps each lap, position changes, "box, box" with tyre choice, tyre wear,
   rain coming, blue flags, final lap, finish position. Settings: Off / Text / Text + voice (spoken with a radio
   click; works on iPhone after the first tap).

## Phase 4: Realism on track
1. **Skid marks and rubber.** Dark marks where tyres lock or spin, fading slowly; a rubbered-in racing line.
2. **Sparks.** Floor-plank sparks on bumps and at speed, brighter at night.
3. **Rain spray.** Rooster tails of spray behind cars in the wet, scaled by speed and wetness.
4. **Heat shimmer.** A subtle shimmer behind each car's exhaust (High/Ultra).
5. **Night races.** Race settings → *Time of day: Day / Sunset / Night*, with floodlights and fireworks at the
   chequered flag.

## Phase 5: Bigger 3D upgrades
1. **Grandstands.** Roof trusses, stairs, end walls, sponsor fascia and TV gantries.
2. **Pit building.** Glass upper floor, hospitality terrace, team logos and timing screens.
3. **Track furniture.** Marshal posts with flags, distance boards, TV towers and cranes.
4. **Two new circuits.**

## Phase 6: Career depth
1. **Contracts.** End-of-season offers from teams based on your results, with team ratings and your expected
   seat; option to stay.
2. **Rivals.** A named rival; head-to-head record shown in the career hub and called out on team radio.
3. **Visible upgrades.** Each development level shows on the car (wing elements, floor edges, livery details)
   and in the setup numbers.

## Testing for every phase
- Full game test (career, quali, race, time trial, pause/restart/quit).
- Phase-specific tests (new screens on PC and iPhone, tap targets, no overflow, no errors).
- Screenshots reviewed at each size before pushing.

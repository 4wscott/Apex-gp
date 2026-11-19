# Apex GP: making it a really good F1 game

Five areas, built in this order (each one is committed and pushed when it works):

1. Driving feel and force feedback
2. Car setup depth (it needs the Phase 1 physics)
3. Full race weekends with practice and parc fermé (they use the Phase 2 setups)
4. Smarter AI racecraft and strategy
5. TV-style broadcast cameras and replays

Ground rules, as before: fictional names only, it must stay smooth on an Intel UHD laptop and an iPhone, Lite is not the
default, graphics are never lowered automatically. Every phase keeps the lap times of the AI and the speed profile in
step with the car model (the AI drives from the same numbers).

## Phase 1: Driving feel and force feedback

**Physics**
- **Lateral load transfer and tyre load sensitivity.** A tyre gives less grip per kilo as its load rises, so when weight
  moves to the outside wheels in a corner the axle as a whole loses grip. How the transfer is split between front and
  rear (roll stiffness distribution) now sets the car's balance: more at the front = understeer, more at the rear =
  oversteer. This is the lever the anti-roll bars and springs pull in Phase 2. Default setup: the same lap times as now
  (±1 %), the AI's speed profile uses the same model.
- **Steering torque (the force feedback signal).** The front tyres' self-aligning torque: lateral force times a
  pneumatic trail that collapses as the tyre reaches its peak slip, so the steering goes **light when the front washes
  out** (understeer) and loads up with speed and downforce. Plus caster return, kerb and bump jolts, a lock-up shudder,
  and a road texture that rises with speed.

**Force feedback on every device**
- **Logitech wheels (G29, G27, G25, Driving Force GT), Chrome and Edge on PC:** real force feedback through WebHID. A
  "Connect wheel for force feedback" button (the browser asks permission once). The wheel pulls with the steering torque,
  goes light when you understeer, kicks on kerbs. Strength, damping and an invert option. Marked experimental (it can't
  be tested here without the hardware). Other wheels keep working as controllers without force.
- **Game controllers (Xbox, PlayStation):** continuous rumble from the same signal: the scrub of tyres at the limit,
  the rear stepping out, kerbs, lock-ups, wheelspin, the rev limiter, impacts. **Trigger rumble** on Xbox controllers
  (Chrome/Edge): the left trigger pulses when the fronts lock or ABS works, the right trigger when the rears spin.
- **Keyboard, touch and mouse:** the virtual steering self-centres with the aligning torque (it returns faster at speed,
  goes light in understeer); the mouse-grab wheel is pulled gently back toward centre the same way. Phone haptics
  (Android) for kerbs and lock-ups.
- **On screen:** the cockpit steering wheel and the camera shake with the same signal (kerbs, bumps, lock-ups), the
  body rolls and pitches with the load transfer.
- **Settings:** Force feedback Off / Light / Medium / Strong, Trigger rumble On/Off, the wheel's strength, damping and
  invert.

## Phase 2: Car setup depth

A proper setup screen (in the garage before a session and from the pause menu in practice), each item changing the
physics, with a one-line engineer's explanation and a balance meter (understeer ↔ oversteer, slow and fast corners):

| Group | Settings | What it does in the sim |
| --- | --- | --- |
| Aero | Front wing, rear wing (separately) | downforce, drag and the aero balance (fast-corner balance) |
| Suspension | Front and rear springs, front and rear anti-roll bars, ride height front and rear | roll stiffness split (slow-corner balance), kerb riding and bumps, floor downforce vs bottoming out |
| Alignment | Camber front and rear, toe front and rear | peak grip vs tyre heat and wear; turn-in response vs straight-line stability |
| Differential | On-throttle and off-throttle locking | traction and exit oversteer; rotation on entry |
| Brakes | Brake bias, brake pressure | locking front or rear; stopping power vs locking |
| Tyres | Pressures front and rear | grip vs wear and temperature |
| Gearing | Final drive | acceleration vs top speed |

- **Presets per circuit** (low, medium and high downforce), your own setups **saved per circuit**, reset to default.
- **Engineer feedback** after a run: "understeer in slow corners, fronts overheating" from what the car actually did,
  with a suggested change.
- The AI uses a sensible setup for each circuit (its pace in the speed profile stays honest).

## Phase 3: Full race weekends with practice and parc fermé

Grand Prix and Career weekends become: **Practice → Qualifying (Q1, Q2, Q3) → Race** (sprint weekends: Practice →
Sprint Qualifying → Sprint → Qualifying → Race).
- **Weekend hub** between sessions: the timetable, results so far, your setup and its lock state, the weather forecast.
- **Practice:** a timed session (length to choose) with the full field on track, run plans (long run, quali sim), the
  engineer's feedback, setup changes allowed, any session skippable (simulated).
- **Qualifying knockout:** Q1 (all cars, slowest 5 out), Q2 (slowest 5 out), Q3 (top 10 for pole). You drive your runs
  against a session clock with the others' times coming in live; out-lap, push lap, in-lap; track evolution (the
  track gets quicker); simulate a part to skip it.
- **Parc fermé:** from the start of qualifying the setup is locked (only brake bias and the in-car settings can change,
  plus front wing angle and repairs, as in the rules). Changing it anyway means **starting from the pit lane**; the hub
  says so clearly. Weather changes declared by the stewards lift it.
- Penalties carried through the weekend (grid drops), the grid built from qualifying, a weekend summary at the end.

## Phase 4: Smarter AI racecraft and strategy

**Racecraft**
- Slipstream and the active-aero zone used properly: pull out of the tow at the right moment, a switchback (cutback)
  on corner exit when passed into a corner.
- Side-by-side through corners: the inside car brakes later and holds its line, the outside car gives room or backs
  out; no turning in on a car that is alongside. Better defence: one move only, covering the inside before the braking
  zone, no moving under braking.
- Pressure mistakes depend on the driver (rating, aggression, tyre state, the gap behind): lock-ups, running wide,
  missed apexes, and drivers who crack or who thrive under pressure.
- Lapping: backmarkers lift on the straight and let leaders through cleanly.

**Strategy**
- Each AI plans its race at the start from its tyre wear model and the race length (one or two stops, which
  compounds), then **adapts**: undercut or overcut a rival that stops, pit under a Safety Car or Virtual Safety Car,
  extend a stint when the tyres are holding up, switch to intermediates or wets at the crossover point and back.
- Tyre management: AI saves tyres (a slower pace, less wear) when told to, pushes when chasing or defending.
- Your engineer does strategy on the radio: Plan A/B, undercut threats, "box this lap for the Safety Car", the
  crossover for rain tyres, with a strategy screen in the pause menu.

## Phase 5: TV-style broadcast cameras and replays

- **Broadcast director** in replays and highlights that follows **the action**, not just one car: battles (cars within
  a second), overtakes, incidents, the leader, the finish, the pit stops. Cuts on story beats, holds on battles.
- **More cameras:** trackside long lens at corner apexes and braking zones, low kerb cams, a helicopter that tracks
  along the lap, the T-cam above the airbox, front-wing cam, rear-facing onboard, pit-lane cam, start-line cam, a
  slow-motion zoom for incidents.
- **Broadcast graphics:** a replay sting with a wipe, the driver name strip when the shot changes, battle gaps
  ("+0.4 s"), the timing tower in replays, "REPLAY" tag, fastest-lap and DRS-style overtaking-aid banners.
- **Live TV view:** a spectator camera when you retire or after the flag, and as a camera choice in races you are not
  driving (watch the AI).
- **Instant replay** of an incident during the race (a few seconds, from the pause menu or automatic for big crashes
  when you are not driving), and **save highlights**: a highlights reel of the race (start, overtakes, incidents,
  finish) to watch from the results.

## Status

- [ ] Phase 1: driving feel and force feedback
- [ ] Phase 2: car setup depth
- [ ] Phase 3: full race weekends with practice and parc fermé
- [ ] Phase 4: smarter AI racecraft and strategy
- [ ] Phase 5: TV-style broadcast cameras and replays

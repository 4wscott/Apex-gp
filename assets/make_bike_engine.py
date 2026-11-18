# Synthesises the race bike engine: a 1000 cc 90-degree V4 with the "big bang" firing order of a modern prototype bike
# (firing at 0, 90, 290 and 380 degrees of the 720-degree cycle), each exhaust pulse run through its header and
# collector resonances, with small cylinder-to-cylinder and cycle-to-cycle differences, intake roar and the primary
# gear whine. Writes assets/bikeengine.js: seamless loops (a whole number of engine cycles) at several rpm, in the
# same form as assets/engine.js, so the game blends and pitches them the same way. Made here, so no licence applies.
# usage: python3 assets/make_bike_engine.py
import numpy as np, io, wave, base64, json
SR = 44100
FIRE = [0, 90, 290, 380]                 # crank degrees in the 720-degree cycle
AMP = [1.0, 0.92, 1.06, 0.95]            # cylinder-to-cylinder differences give the rasp
rng = np.random.default_rng(7)
def comb(x, d, g):                        # circular feedback comb (the loop wraps cleanly)
    y = x.copy(); n = len(x)
    for _ in range(6): y = x + g * np.roll(y, d)
    return y
def lowpass(x, fc):                       # circular one-pole, applied in the frequency domain
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); return np.fft.irfft(X / (1 + 1j * f / fc), len(x))
def band(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X[(f < lo) | (f > hi)] = 0; return np.fft.irfft(X, len(x))
def loop(rpm, seconds=0.9):
    rps = rpm / 60; cyc = 2 / rps; ncyc = max(4, round(seconds / cyc)); n = int(round(ncyc * cyc * SR))
    cyc_n = n / ncyc; ex = np.zeros(n); dur = (250 / 360) / rps          # exhaust valve open for about 250 crank degrees
    for c in range(ncyc):
        jit = 1 + 0.035 * rng.standard_normal()                           # combustion varies from cycle to cycle
        for k, deg in enumerate(FIRE):
            t0 = (c + deg / 720) * cyc_n + 0.004 * cyc_n * rng.standard_normal()
            L = int(dur * SR); x = np.arange(L) / L
            pulse = (x ** 0.25) * (1 - x) ** 2.2 * AMP[k] * jit                # sharp blowdown, slower decay
            pulse += 0.12 * rng.standard_normal(L) * (1 - x) ** 3 * AMP[k]     # turbulent roughness inside the pulse
            idx = (int(t0) + np.arange(L)) % n; np.add.at(ex, idx, pulse)
    ex -= ex.mean()
    # headers (about 0.7 m) and the collector-to-tip run (about 0.35 m): quarter-wave pipe resonances
    c_air = 520                                                             # speed of sound in hot exhaust gas, m/s
    y = comb(ex, int(SR * 2 * 0.7 / c_air), 0.42) + 0.6 * comb(ex, int(SR * 2 * 0.35 / c_air), 0.33)
    y = lowpass(y, 2600 + rpm * 0.25)
    # intake roar: noise shaped by the firing pulses, band-limited
    env = lowpass(np.abs(ex), 300); intake = band(rng.standard_normal(n) * env, 300, 3500) * 0.5
    # straight-cut primary gears: a faint whine at 52 teeth per crank revolution
    t = np.arange(n) / SR; whine = 0.015 * np.sin(2 * np.pi * rps * 52 * t)
    out = y + intake + whine
    out = np.tanh(out / (np.abs(out).max() + 1e-9) * 2.2)                     # the exhaust's hard edge
    out = band(out, 35, 12000); out *= 0.89 / np.abs(out).max()
    pcm = (out * 32767).astype('<i2'); b = io.BytesIO()
    with wave.open(b, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    return 'data:audio/wav;base64,' + base64.b64encode(b.getvalue()).decode(), ncyc
loops = []
for name, rpm in (('idle', 4200), ('low', 7800), ('mid', 11500), ('high', 15000), ('top', 17800)):
    d, nc = loop(rpm); loops.append({'name': name, 'rpm': rpm, 'data': d}); print(name, rpm, nc, 'cycles')
js = ('// Race bike engine loops, synthesised by assets/make_bike_engine.py: a 1000 cc V4 with the big-bang firing order.\n'
      '// Each loop is a whole number of engine cycles; rpm is the game rpm it plays at with playbackRate 1.\n'
      'const BIKE_ENGINE_LOOPS = ' + json.dumps(loops) + ';\n')
open('assets/bikeengine.js', 'w').write(js); print('bikeengine.js KB', len(js) // 1024)

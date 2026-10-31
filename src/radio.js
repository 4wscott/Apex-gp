// ==== Team radio: the race engineer's messages, as text and (optionally) a spoken voice ============
// Messages come from race events (lap, pit, rain, flags, finish) and a few checks once a second
// (position changes, tyre wear). Spoken lines use the browser's speech voice, framed by a radio click.
const Radio = {
  q: [], showing: null, until: 0, said: {},
  reset() { if (App.audio && App.audio.duck) App.audio.duck(false); if (App.music && App.music.setRadio) App.music.setRadio(false); this.q = []; this.showing = null; this.until = 0; this.said = {}; this.lastPos = 0; this.lastPosT = 0; this.checkT = 0; this.voice = null; try { speechSynthesis.cancel(); } catch (e) { /* no speech */ } $('#radio').hidden = true; },
  // priority 2 interrupts, 1 queues; one-off lines are keyed so they are never repeated
  say(text, prio = 1, key) {
    if (settings.radio === 'off' || !App.session || App.session.online && App.session.race.mode !== 'race') return;
    if (key) { if (this.said[key]) return; this.said[key] = true; }
    if (prio >= 2) this.q.unshift(text); else if (this.q.length < 3) this.q.push(text);
  },
  frame(race) {
    const now = performance.now();
    if (this.showing && now > this.until) { this.showing = null; $('#radio').hidden = true; App.audio.duck(false); App.music.setRadio(false); }
    if (!this.showing && this.q.length && !Replay.on && !App.paused) {
      const text = this.q.shift(); this.showing = text; this.until = now + 2600 + text.length * 55;
      $('#radio-text').textContent = text; $('#radio').hidden = false;
      this.click(); if (settings.radio === 'voice') { this.speak(text); App.audio.duck(true); App.music.setRadio(true); }
    }
    // once a second: position changes and tyre wear
    if (now - this.checkT < 1000 || race.phase !== 'green') return;
    this.checkT = now;
    const P = race.player;
    if (race.mode === 'race' && !P.finished && !P.pit) {
      const pos = race.standings().indexOf(P) + 1;
      if (this.lastPos && pos !== this.lastPos && now - this.lastPosT > 6000) {
        this.lastPosT = now;
        if (pos < this.lastPos) App.audio.cheer(pos === 1 ? 1.3 : 0.8);
        this.say(pos < this.lastPos ? (pos === 1 ? 'Great move! You are leading the race.' : `Nice move, P${pos}.`) : `Lost a place, P${pos}. Keep your head.`);
      }
      this.lastPos = pos;
    }
    if (P.wingHealth < 0.6) this.say(race.mode === 'race' ? 'We have front wing damage, expect understeer. Box when you can for a new nose.' : 'Front wing damage. Reset the car to repair it.', 1, 'wing' + P.stops);
    if (P.wear > 0.62 && race.mode !== 'trial') this.say('Tyres are going off. Box when you are ready, press PIT to call it.', 1, 'wear');
  },
  event(e, race) {
    const P = race.player, me = e.car === P;
    const gap = (s) => (s < 10 ? s.toFixed(1) : Math.round(s)) + ' seconds';
    if (e.type === 'go' && race.mode === 'race') { this.lastPos = race.standings().indexOf(P) + 1; this.say("Lights out, let's go!", 2); }
    else if (e.type === 'lap' && me) {
      if (race.mode === 'race' && !P.finished) {
        const st = race.standings(), i = st.indexOf(P), lapsLeft = race.laps - P.lap + 1;
        if (lapsLeft === 1) this.say('Final lap. Bring it home.', 2);
        else if (P.lap >= 2 && (race.laps <= 12 || P.lap % 2 === 0)) {
          const ahead = i > 0 ? race.gapBetween(st[i - 1], P) : 0, behind = i < st.length - 1 ? race.gapBetween(P, st[i + 1]) : 0;
          // career: call out the rival when they are close
          const rc = App.cfg && App.cfg.career && Career.data && Career.data.rival, rv = rc && st.find((c) => c.driver.code === rc);
          if (rv && Math.abs(st.indexOf(rv) - i) <= 2) {
            const ri = st.indexOf(rv), g2 = ri < i ? race.gapBetween(rv, P) : race.gapBetween(P, rv), nm = rv.driver.name.split(' ').pop();
            this.say(ri < i ? `Your rival ${nm} is ${gap(g2)} ahead. Go get him.` : `Your rival ${nm} is ${gap(g2)} behind. Keep him there.`);
          } else this.say(`P${i + 1}.${i > 0 && ahead > 0 ? ` Gap ahead ${gap(ahead)}.` : ''}${behind > 0 && behind < 30 ? ` ${st[i + 1].driver.name.split(' ').pop()} is ${gap(behind)} behind.` : ''}`);
        }
      } else if ((race.mode === 'practice' || race.mode === 'trial') && e.time) {
        this.say(e.valid ? `Lap ${fmtTime(e.time)}${e.best ? ', personal best. Good job.' : '.'}` : 'That lap was deleted for track limits.');
      }
    }
    else if (e.type === 'pitentry' && me) this.say('Limiter, limiter. Stay in your box lane.', 2);
    else if (e.type === 'pitdone' && me) this.say(`Good stop, ${e.time.toFixed(1)} seconds. ${COMPOUNDS[e.compound].name}s are on. Push now.`, 2);
    else if (e.type === 'rainstart') this.say(race.mode === 'race' ? 'Rain is starting. Intermediates when the track gets wet.' : 'Rain is starting, be careful.', 1, 'rain' + Math.floor(race.time / 120));
    else if (e.type === 'rainstop') this.say('Rain has stopped. The track will dry.', 1);
    else if (e.type === 'vsc') this.say('Virtual safety car. Slow down and keep to the delta.', 2);
    else if (e.type === 'vscend') this.say('Green flag, green flag. Racing resumes.', 2);
    else if (e.type === 'blue' && me) this.say('Blue flags. Let the leaders through.', 1, 'blue' + Math.floor(race.time / 60));
    else if (e.type === 'finish' && me && race.mode === 'race') this.say(e.pos === 1 ? 'Yes! You win the Grand Prix! Fantastic drive.' : e.pos <= 3 ? `P${e.pos}, a podium! Great job.` : `P${e.pos}. ${e.pos <= 10 ? 'Points today, well done.' : 'We will come back stronger.'}`, 2);
  },
  // player asked to pit: confirm the tyres (or the cancel)
  boxCall(compound) { this.say(compound ? `Copy. Box this lap for ${COMPOUNDS[compound].name}s.` : 'Copy, stay out.', 2); },
  click() {
    const A = App.audio; if (!A || !A.ctx || A.ctx.state !== 'running') return;
    const ctx = A.ctx, t = ctx.currentTime, len = 0.09, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.6;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = 0.5;
    src.connect(bp).connect(g).connect(A.master || ctx.destination); src.start(t);
  },
  speak(text) {
    try {
      const s = window.speechSynthesis; if (!s) return;
      if (!this.voice) { const vs = s.getVoices(); this.voice = vs.find((v) => /en-GB/i.test(v.lang) && /male|daniel|arthur|george/i.test(v.name)) || vs.find((v) => /en-GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null; }
      s.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/P(\d+)/g, 'P $1'));
      if (this.voice) u.voice = this.voice;
      u.rate = 1.08; u.pitch = 0.92; u.volume = clamp((settings.voiceVol ?? 0.9) * (0.5 + 0.5 * (settings.volume ?? 0.7)), 0, 1);
      s.speak(u);
    } catch (e) { /* speech unavailable: text only */ }
  },
};

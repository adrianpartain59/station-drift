// The soundtrack: a dark breakbeat track. A drum loop under a synthesized kick, a reese bass, chords and a bell.
//
// The notes of the chords and the bass are a transcription of a reference beat Adrian supplied:
//   bass    D, then F (D1 and F1; the reese sounds an octave above its sub)
//   chords  D4 A4 E5 (a D with no third, stacked in fifths), then D4 F4 A4 C5 (D minor seventh, over the F)
// Their rhythm is this game's own, fitted to the drum loop he chose: 160 BPM, the loop's own tempo, the harmony
// two bars long (D for five beats, F for three, as on the reference).
//
// The drum loop is a file (SONG.LOOP), four bars long, already filtered: its lows are cut so the kick and the bass
// here own them. If the file is not there, the track plays a plain synthesized kit in its place.
//
// The track follows the run, one sixteenth at a time:
//   idle     not in a run: chords, bass and the bell, quiet and muffled. No drums.
//   station  inside a ship: the whole beat, muffled.
//   drive    open air: the whole beat.
// `intensity` (how hard the engine is working, 0..1) opens the bass and the chords a little.
// The song is 32 bars: eight without the bell, then the bell, with its second phrase every fourth time round.

const BPM = 160;
const STEP = 60 / BPM / 4;
/** Numbers a tool needs to render the track on its own (tools/audio/render.html). */
export const SONG = { BPM, STEP, STEPS: 512, LEVEL: 0.23, LOOP: 'audio/break.wav', LOOP_BARS: 4 };

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// the same numbers every time a step is played, so a render is repeatable (no Math.random in here)
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

// ---- the transcription: do not change these notes without the reference in front of you ----
const D1 = 26, F1 = 29;
const CHORD_A = [62, 69, 76];        // D4 A4 E5
const CHORD_B = [62, 65, 69, 72];    // D4 F4 A4 C5
const CHANGE = 20;                   // the step, of 32, where the bass and the chord move to the F

// ---- the rhythm: this game's own, fitted to the loop (kick on 1 and the "and" of 3, snare on 2 and 4) ----
const CHORD_A_AT = 2, CHORD_A_SWELL = 0.16;   // the first chord blooms in just after the downbeat
// bass: [step, length in steps, note, the note it slides to as it ends]. It is struck again with each of the
// loop's kicks and with the snare the harmony changes on.
const BASS = [[0, 10, D1, 0], [10, 6, D1, 0], [16, 4, D1, F1], [CHANGE, 6, F1, 0], [26, 6, F1, D1]];
// the kick, per bar: under the loop's own two
const KICK = [0, 10];
// The bell: [step, note, how hard]. Chord tones only, each said twice, on the loop's accents (snare, ghost, kick, ghost).
// A5 E5 over the first chord, F5 D5 over the second (E to F is the dark step); the second phrase climbs D E F and falls to C.
const BELL = [
  [[4, 81, 1], [7, 81, 0.55], [10, 76, 0.9], [14, 76, 0.5], [20, 77, 1], [23, 77, 0.55], [26, 74, 0.9], [30, 74, 0.5]],
  [[4, 74, 1], [7, 74, 0.55], [10, 76, 0.9], [14, 76, 0.5], [20, 77, 1], [23, 77, 0.55], [26, 72, 0.9], [30, 72, 0.5]],
];
// the stand-in kit, used only when the loop file is missing: a snare on 2 and 4, a hat on every eighth
const SNARE = [4, 12];

export class Music {
  /** `out`: where the music goes. `noiseBuf`: two seconds of white noise, shared with the game's effects. */
  constructor(ctx, out, noiseBuf) {
    this.ctx = ctx; this.noiseBuf = noiseBuf;
    this.open = true; this.playing = false; this.intensity = 0.5;
    this.off = new Set();   // a tool can leave layers out: 'drums' (the loop or its stand-in) 'kick' 'bass' 'pad' 'lead'
    this.loop = null;       // the drum loop, once it has been fetched and decoded (setLoop)

    // everything -> the filter that closes inside a ship -> out. Nothing in the path distorts.
    this.level = ctx.createGain(); this.level.gain.value = SONG.LEVEL;
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 2400; this.filter.Q.value = 0.7;
    this.bus = ctx.createGain();
    this.bus.connect(this.filter).connect(this.level).connect(out);

    // a dark room: decaying noise, low-passed, a different one for each ear
    const rate = ctx.sampleRate, len = Math.floor(rate * 2.6);
    const ir = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); let lp = 0, seed = 977 + c * 131;
      for (let i = 0; i < len; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        lp += 0.22 * ((seed / 2147483648 - 1) - lp);
        d[i] = lp * Math.exp(-i / (rate * 0.55)) * Math.min(1, i / (rate * 0.012));
      }
    }
    this.room = ctx.createConvolver(); this.room.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.9;
    this.room.connect(wet).connect(this.bus);

    // the drum loop: its level, its top turned down so the cymbals sit behind the snare, a little of it into the room
    // so it sits with the rest, and a gate that is shut between runs
    this.breakBus = ctx.createGain(); this.breakBus.gain.value = 1.6;
    const top = ctx.createBiquadFilter(); top.type = 'highshelf'; top.frequency.value = 5000; top.gain.value = -4.5;
    this.gate = ctx.createGain(); this.gate.gain.value = 0;
    this.breakBus.connect(top).connect(this.gate).connect(this.bus);
    const breakRoom = ctx.createGain(); breakRoom.gain.value = 0.07;
    this.gate.connect(breakRoom).connect(this.room);

    // the bass: the reference rolls off under about 40 Hz, and so does this
    this.bassBus = ctx.createBiquadFilter(); this.bassBus.type = 'highpass'; this.bassBus.frequency.value = 42; this.bassBus.Q.value = 1;
    this.bassBus.connect(this.bus);
    // the reese's slow movement: its filter breathes
    const breathe = ctx.createOscillator(); breathe.frequency.value = 0.21;
    this.growl = ctx.createGain(); this.growl.gain.value = 70;
    breathe.connect(this.growl); breathe.start();

    // tape: a slow drift in pitch on the chords and the bell, a few cents
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.37;
    this.wow = ctx.createGain(); this.wow.gain.value = 5;
    lfo.connect(this.wow); lfo.start();

    // the stand-in hats: six square waves at the old drum machine's frequencies, summed once into a buffer
    const metal = ctx.createBuffer(1, Math.floor(rate * 0.6), rate), m = metal.getChannelData(0);
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
      const k = (2 * Math.PI * f * 1.45) / rate;
      for (let i = 0; i < m.length; i++) m[i] += Math.sin(k * i) >= 0 ? 1 / 6 : -1 / 6;
    }
    this.metal = metal;
  }

  /** Hand over the decoded drum loop. It must be SONG.LOOP_BARS bars long at SONG.BPM, starting on the downbeat. */
  setLoop(buffer) { this.loop = buffer; }

  /** What the run is doing. `t`: when (defaults to now). */
  set({ open, playing, intensity }, t = this.ctx.currentTime) {
    this.open = open; this.playing = playing; this.intensity = intensity;
    const cut = !playing ? 1500 : open ? 12000 : 3200;
    if (cut !== this.cut) {
      this.cut = cut;
      this.filter.frequency.setTargetAtTime(cut, t, open && playing ? 0.18 : 0.5);
      this.level.gain.setTargetAtTime(SONG.LEVEL * (playing ? 1 : 0.6), t, 0.4);   // between runs the track sits back
      // the loop runs all the time, in step with the song; a run opens the gate on it
      this.gate.gain.setTargetAtTime(playing ? 1 : 0, t, playing ? 0.015 : 0.12);
    }
  }

  noise(t, dur, seed) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    n.start(t, hash(seed) * 1.4); n.stop(t + dur + 0.05);
    return n;
  }

  // ---------- drums ----------
  /** One bar of the loop, started exactly on the bar line. A bar is a whole number of samples at 44.1 and 48 kHz, so bars join cleanly. */
  slice(t, bar) {
    const n = this.ctx.createBufferSource(); n.buffer = this.loop;
    n.connect(this.breakBus);
    n.start(t, bar * 16 * STEP, 16 * STEP);
  }

  /** The kick: clean, short enough for this tempo, and the loudest thing in the track. It carries the lows the loop had cut. */
  kick(t, vel = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(118, t + 0.012);
    o.frequency.exponentialRampToValueAtTime(56, t + 0.08); o.frequency.exponentialRampToValueAtTime(48, t + 0.32);
    const g = ctx.createGain();
    const p = 1.5 * vel;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(p, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(p * 0.5, t + 0.09); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.38);
    const n = this.noise(t, 0.02, Math.round(t * 311));
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.6;
    const c = ctx.createGain();
    c.gain.setValueAtTime(0.3 * vel, t); c.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    n.connect(f).connect(c).connect(this.bus);
  }

  // the stand-in snare and hat: only heard when the loop file is missing
  snare(t, v = 1) {
    const ctx = this.ctx, vel = v * 1.1;
    for (const [f0, f1, lvl, dec] of [[196, 172, 0.55, 0.13], [338, 300, 0.26, 0.07]]) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dec);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(lvl * vel, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g).connect(this.bus); o.start(t); o.stop(t + dec + 0.03);
    }
    const n = this.noise(t, 0.3, Math.round(t * 613));
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1100;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.78 * vel, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.2 * vel, t + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    n.connect(hp).connect(lp).connect(g).connect(this.bus);
    const n3 = this.noise(t, 0.08, Math.round(t * 449));
    const cr = ctx.createBiquadFilter(); cr.type = 'bandpass'; cr.frequency.value = 3100; cr.Q.value = 0.8;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t); cg.gain.linearRampToValueAtTime(0.7 * vel, t + 0.0008); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n3.connect(cr).connect(cg).connect(this.bus);
    const send = ctx.createGain(); send.gain.value = 0.22; g.connect(send).connect(this.room);
  }

  hat(t, vel) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.metal; n.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200; hp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel * 2.8, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    const pan = ctx.createStereoPanner(); pan.pan.value = 0.25;
    n.connect(hp).connect(g).connect(pan).connect(this.bus);
    n.start(t, hash(Math.round(t * 1409)) * 0.5); n.stop(t + 0.07);
  }

  // ---------- the transcribed notes ----------
  /**
   * One bass note, a reese: a sine at the note for the weight, and an octave above it two saws pulled a few cents
   * apart, beating against each other through a low filter that opens when the note is struck and breathes slowly
   * after. `to`: the note it slides to at its end.
   */
  bass(t, note, len, vel, to) {
    const ctx = this.ctx, dur = len * STEP, f1 = NOTE(note);
    // each note hands over to the next across 30 ms, so a slide is heard through the join
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.01);
    g.gain.setValueAtTime(vel, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.03);
    const tune = (o, mult) => {
      o.frequency.setValueAtTime(f1 * mult, t);
      if (to) { o.frequency.setValueAtTime(f1 * mult, t + dur - 0.055); o.frequency.exponentialRampToValueAtTime(NOTE(to) * mult, t + dur + 0.005); }
      o.start(t); o.stop(t + dur + 0.1);
    };
    const sub = ctx.createOscillator(); sub.type = 'sine'; tune(sub, 1);
    const sg = ctx.createGain(); sg.gain.value = 0.3;
    sub.connect(sg).connect(g);
    const cut = 250 + 400 * this.intensity;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.1;
    lp.frequency.setValueAtTime(cut * 2.6, t); lp.frequency.exponentialRampToValueAtTime(cut, t + 0.2);
    this.growl.connect(lp.frequency);
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.Q.value = 0.7; lp2.frequency.value = cut * 1.7;
    for (const det of [-14, 14]) {
      const s = ctx.createOscillator(); s.type = 'sawtooth'; s.detune.value = det; tune(s, 2);
      s.connect(lp);
    }
    const rg = ctx.createGain(); rg.gain.value = 0.3;
    lp.connect(lp2).connect(rg).connect(g);
    g.connect(this.bassBus);
  }

  /** A chord: each note is three saws a few cents apart, left, centre and right, through low filters and the room. */
  pad(t, notes, len, attack, vel) {
    const ctx = this.ctx, dur = len * STEP;
    // dark: the reference's chords have little above 1 kHz, so two filters in a row, not one
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.6;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.Q.value = 0.6;
    f.frequency.value = f2.frequency.value = 720 + 140 * this.intensity + (this.open && this.playing ? 60 : 0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + attack);
    g.gain.setValueAtTime(vel, t + dur); g.gain.setTargetAtTime(0.0001, t + dur, 0.09);
    for (const [det, where] of [[-11, -0.8], [0, 0], [11, 0.8]]) {
      const pan = ctx.createStereoPanner(); pan.pan.value = where; pan.connect(f);
      for (const n of notes) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det;
        this.wow.connect(o.detune);
        o.connect(pan); o.start(t); o.stop(t + dur + 0.7);
      }
    }
    f.connect(f2).connect(g).connect(this.bus);
    const send = ctx.createGain(); send.gain.value = 0.4; g.connect(send).connect(this.room);
  }

  // ---------- this game's own line ----------
  /** A dark bell: one sine bent by another an octave up, bright for an instant and then plain, left to ring in the room. */
  bell(t, note, vel) {
    const ctx = this.ctx, fr = NOTE(note);
    const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = fr;
    const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = fr * 2;
    const idx = ctx.createGain();
    idx.gain.setValueAtTime(fr * 2.6, t); idx.gain.exponentialRampToValueAtTime(fr * 0.12, t + 0.35);
    mod.connect(idx).connect(car.frequency);
    this.wow.connect(car.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
    car.connect(lp).connect(g).connect(this.bus);
    const send = ctx.createGain(); send.gain.value = 0.6; g.connect(send).connect(this.room);
    car.start(t); mod.start(t); car.stop(t + 1.3); mod.stop(t + 1.3);
  }

  // ---------- the song ----------
  /** Play sixteenth `i` (0..SONG.STEPS-1) at time `t`. */
  step(i, t) {
    const ls = i % 32, s16 = i % 16, bar = i >> 4, unit = i >> 5, section = (i >> 7) & 3;
    const off = this.off;
    const mode = !this.playing ? 0 : this.open ? 2 : 1;   // idle, station, drive

    // bass: the transcribed notes, struck with the loop
    if (!off.has('bass')) {
      const hit = BASS.find((b) => b[0] === ls);
      if (hit) this.bass(t, hit[2], hit[1], mode === 0 ? 0.55 : 1, hit[3]);
    }

    // chords: the transcribed notes
    if (!off.has('pad')) {
      const vel = mode === 0 ? 0.085 : 0.09;
      if (ls === CHORD_A_AT) this.pad(t, CHORD_A, CHANGE - CHORD_A_AT, CHORD_A_SWELL, vel);
      if (ls === CHANGE) this.pad(t, CHORD_B, 32 - CHANGE + CHORD_A_AT, 0.03, vel);
    }

    // the bell: not in the first eight bars of the song
    if (!off.has('lead') && (section > 0 || mode === 0)) {
      const n = BELL[(unit & 3) === 3 ? 1 : 0].find((b) => b[0] === ls);
      if (n) this.bell(t, n[1], n[2] * (mode === 2 ? 0.17 : mode === 1 ? 0.14 : 0.12));
    }

    // drums. The loop is always running, bar by bar, behind its gate, so a run starting mid-bar joins it in time.
    if (!off.has('drums') && this.loop && s16 === 0) this.slice(t, bar % SONG.LOOP_BARS);
    if (mode === 0) return;
    if (!off.has('kick') && KICK.includes(s16)) this.kick(t, s16 === 0 ? 1 : 0.9);
    if (off.has('drums') || this.loop) return;
    // no loop file: a plain kit in its place
    if (SNARE.includes(s16)) this.snare(t, 1);
    if (s16 % 2 === 0) this.hat(t, (s16 % 4 === 0 ? 0.2 : 0.14) * (0.9 + 0.2 * hash(i)));
  }
}

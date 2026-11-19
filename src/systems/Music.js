// The soundtrack: a slow, dark phonk beat, synthesized as it plays. No samples, no audio files.
//
// The chords and the bass are a transcription of a reference beat Adrian supplied, note for note:
//   136 BPM, felt in half time. One pattern, two bars (32 sixteenths) long:
//   bass    D1 from step 0, sliding up to F1 at step 20 (beat two of the second bar), sliding back at the top
//   chords  D4 A4 E5 (a D with no third, stacked in fifths) from step 2, swelling in;
//           D4 F4 A4 C5 (D minor seventh, over the F in the bass) from step 20, held two steps past the bar line
// Everything else is this game's own: the drums, the bell line, and every sound.
//
// The track follows the run, one sixteenth at a time:
//   idle     not in a run: chords, bass and the bell, quiet and muffled. No drums.
//   station  inside a ship: kick, snare and a sparse hat, muffled.
//   drive    open air: the whole kit.
// `intensity` (how hard the engine is working, 0..1) opens the chords a little and adds hat ghosts.
// The song is 32 bars: eight without the bell, eight with it, eight with the bass chopped, eight with everything.

const BPM = 136;
const STEP = 60 / BPM / 4;
/** Numbers a tool needs to render the track on its own (tools/audio/render.html). */
export const SONG = { BPM, STEP, STEPS: 512, LEVEL: 0.27 };

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// the same numbers every time a step is played, so a render is repeatable (no Math.random in here)
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

// ---- the transcription: do not change these without the reference in front of you ----
const D1 = 26, F1 = 29;
const CHORD_A = [62, 69, 76];        // D4 A4 E5
const CHORD_B = [62, 65, 69, 72];    // D4 F4 A4 C5
const CHANGE = 20;                   // the step where the bass and the chord move to the F
const CHORD_A_AT = 2, CHORD_A_SWELL = 0.2;   // the first chord blooms in just after the downbeat
// bass: [step, length in steps, note, the note it slides to as it ends]. The slide is over by the time the next note
// starts, as on the reference. The second line is the reference's own variation: the D cut short and struck again.
const BASS = [[0, 20, D1, F1], [CHANGE, 12, F1, D1]];
const BASS_CHOP = [[0, 8, D1, 0], [12, 8, D1, F1], [CHANGE, 12, F1, D1]];

// ---- this game's own ----
// The bell: [step, note], chord tones only. A5 E5 over the first chord; F5 D5 over the second (E to F is the dark step).
const BELL = [
  [[4, 81], [12, 76], [20, 77], [28, 74]],
  [[4, 74], [12, 76], [20, 77], [28, 72]],
];
// Half time: the snare is on three of each bar (steps 8 and 24). The kick is with the bass on 0 and 20, and wanders.
const KICK = [[0, 6, 20, 27], [0, 11, 20, 22, 30]];
const SNARE = [8, 24];
const LATE = 0.011;    // the snare sits a hair behind the beat
const SWING = 0.16;    // and so does every second hat, by this much of a step

export class Music {
  /** `out`: where the music goes. `noiseBuf`: two seconds of white noise, shared with the game's effects. */
  constructor(ctx, out, noiseBuf) {
    this.ctx = ctx; this.noiseBuf = noiseBuf;
    this.open = true; this.playing = false; this.intensity = 0.5;
    this.off = new Set();   // a tool can leave layers out: 'drums' 'bass' 'pad' 'lead'

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

    // the bass: the reference rolls off under about 40 Hz, so its D1 is carried by its harmonics and its F1 by the sub itself
    this.bassBus = ctx.createBiquadFilter(); this.bassBus.type = 'highpass'; this.bassBus.frequency.value = 42; this.bassBus.Q.value = 1;
    this.bassBus.connect(this.bus);
    // what makes a 36 Hz note audible on small speakers: its octave, twelfth and the next few, as measured on the reference
    this.bassWave = ctx.createPeriodicWave(new Float32Array(9), new Float32Array([0, 0, 1, 0.8, 0.55, 0.22, 0.2, 0.12, 0.1]));

    // tape: a slow drift in pitch on the chords and the bell, a few cents
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.37;
    this.wow = ctx.createGain(); this.wow.gain.value = 5;
    lfo.connect(this.wow); lfo.start();

    // hats: six square waves at the old drum machine's frequencies, summed once into a buffer
    const metal = ctx.createBuffer(1, Math.floor(rate * 0.6), rate), m = metal.getChannelData(0);
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
      const k = (2 * Math.PI * f * 1.45) / rate;
      for (let i = 0; i < m.length; i++) m[i] += Math.sin(k * i) >= 0 ? 1 / 6 : -1 / 6;
    }
    this.metal = metal;
  }

  /** What the run is doing. `t`: when (defaults to now). */
  set({ open, playing, intensity }, t = this.ctx.currentTime) {
    this.open = open; this.playing = playing; this.intensity = intensity;
    const cut = !playing ? 1500 : open ? 12000 : 3200;
    if (cut !== this.cut) {
      this.cut = cut;
      this.filter.frequency.setTargetAtTime(cut, t, open && playing ? 0.18 : 0.5);
      this.level.gain.setTargetAtTime(SONG.LEVEL * (playing ? 1 : 0.6), t, 0.4);   // between runs the track sits back
    }
  }

  noise(t, dur, seed) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    n.start(t, hash(seed) * 1.4); n.stop(t + dur + 0.05);
    return n;
  }

  // ---------- drums: clean, heavy, nothing clipped ----------
  kick(t, vel = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    // a hard knock at the front, then a long low body
    o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(118, t + 0.012);
    o.frequency.exponentialRampToValueAtTime(54, t + 0.085); o.frequency.exponentialRampToValueAtTime(46, t + 0.4);
    const g = ctx.createGain();
    const p = 1.7 * vel;   // the loudest thing in the track
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(p, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(p * 0.5, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.44);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.48);
    const n = this.noise(t, 0.02, Math.round(t * 311));
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.6;
    const c = ctx.createGain();
    c.gain.setValueAtTime(0.3 * vel, t); c.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    n.connect(f).connect(c).connect(this.bus);
  }

  snare(t, v = 1) {
    const ctx = this.ctx, vel = v * 1.1;
    // the body: two short tones
    for (const [f0, f1, lvl, dec] of [[196, 172, 0.55, 0.13], [338, 300, 0.26, 0.07]]) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dec);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(lvl * vel, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g).connect(this.bus); o.start(t); o.stop(t + dec + 0.03);
    }
    // the wires
    const n = this.noise(t, 0.3, Math.round(t * 613));
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1100;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.78 * vel, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.2 * vel, t + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    n.connect(hp).connect(lp).connect(g).connect(this.bus);
    // the crack: a short burst where the ear is sharpest, so it cuts without being turned up
    const n3 = this.noise(t, 0.08, Math.round(t * 449));
    const cr = ctx.createBiquadFilter(); cr.type = 'bandpass'; cr.frequency.value = 3100; cr.Q.value = 0.8;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t); cg.gain.linearRampToValueAtTime(0.7 * vel, t + 0.0008); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n3.connect(cr).connect(cg).connect(this.bus);
    // a clap laid over it
    const n2 = this.noise(t, 0.2, Math.round(t * 829));
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1350; bp.Q.value = 1.2;
    const c = ctx.createGain(), p = 0.34 * vel;
    c.gain.setValueAtTime(0.0001, t);
    for (const k of [0, 0.009, 0.018]) { c.gain.setValueAtTime(p, t + k); c.gain.exponentialRampToValueAtTime(p * 0.15, t + k + 0.008); }
    c.gain.setValueAtTime(p, t + 0.027); c.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    n2.connect(bp).connect(c).connect(this.bus);
    const send = ctx.createGain(); send.gain.value = 0.22;
    g.connect(send); c.connect(send); send.connect(this.room);
  }

  hat(t, vel, open = false) {
    const ctx = this.ctx, dur = open ? 0.3 : 0.05;
    const n = ctx.createBufferSource(); n.buffer = this.metal; n.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200; hp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel * 2.8, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = ctx.createStereoPanner(); pan.pan.value = 0.25;
    n.connect(hp).connect(g).connect(pan).connect(this.bus);
    n.start(t, hash(Math.round(t * 1409)) * 0.5); n.stop(t + dur + 0.02);
  }

  // ---------- the transcribed parts ----------
  /** One long bass note: a sine, and above it the harmonics that let a 36 Hz note be heard. `to`: the note it slides to at its end. */
  bass(t, note, len, vel, to) {
    const ctx = this.ctx, dur = len * STEP, f1 = NOTE(note);
    // the notes never overlap: each one hands over to the next across 30 ms, so a slide is heard through the join
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(vel * 0.6, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.03);
    const sub = ctx.createOscillator(); sub.type = 'sine';
    const body = ctx.createOscillator(); body.setPeriodicWave(this.bassWave);
    for (const o of [sub, body]) {
      o.frequency.setValueAtTime(f1, t);
      if (to) { o.frequency.setValueAtTime(f1, t + dur - 0.055); o.frequency.exponentialRampToValueAtTime(NOTE(to), t + dur + 0.005); }
      o.start(t); o.stop(t + dur + 0.1);
    }
    // bright when struck, darker as it rings
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(950, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.55);
    const sg = ctx.createGain(); sg.gain.value = 0.32;
    const bg = ctx.createGain(); bg.gain.value = 0.22;
    sub.connect(sg).connect(g); body.connect(lp).connect(bg).connect(g);
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
    idx.gain.setValueAtTime(fr * 2.6, t); idx.gain.exponentialRampToValueAtTime(fr * 0.12, t + 0.45);
    mod.connect(idx).connect(car.frequency);
    this.wow.connect(car.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
    car.connect(lp).connect(g).connect(this.bus);
    const send = ctx.createGain(); send.gain.value = 0.7; g.connect(send).connect(this.room);
    car.start(t); mod.start(t); car.stop(t + 2); mod.stop(t + 2);
  }

  // ---------- the song ----------
  /** Play sixteenth `i` (0..SONG.STEPS-1) at time `t`. */
  step(i, t) {
    const ls = i % 32, unit = i >> 5, barIn = (i >> 4) & 7, section = (i >> 7) & 3;
    const off = this.off, hi = this.intensity;
    const mode = !this.playing ? 0 : this.open ? 2 : 1;   // idle, station, drive

    // bass, as transcribed. The third eight bars use the reference's chopped D.
    if (!off.has('bass')) {
      const hit = (section === 2 ? BASS_CHOP : BASS).find((b) => b[0] === ls);
      if (hit) this.bass(t, hit[2], hit[1], mode === 0 ? 0.55 : 1, hit[3]);
    }

    // chords, as transcribed
    if (!off.has('pad')) {
      const vel = mode === 0 ? 0.085 : 0.09;
      if (ls === CHORD_A_AT) this.pad(t, CHORD_A, CHANGE - CHORD_A_AT, CHORD_A_SWELL, vel);
      if (ls === CHANGE) this.pad(t, CHORD_B, 32 - CHANGE + CHORD_A_AT, 0.03, vel);
    }

    // the bell: not in the first eight bars of the song
    if (!off.has('lead') && (section > 0 || mode === 0)) {
      const line = BELL[(unit & 3) === 2 ? 1 : 0];
      const n = line.find((b) => b[0] === ls);
      if (n) this.bell(t, n[1], mode === 2 ? 0.17 : mode === 1 ? 0.14 : 0.12);
    }

    // drums
    if (off.has('drums') || mode === 0) return;
    if (KICK[unit & 1].includes(ls)) this.kick(t, ls === 0 || ls === CHANGE ? 1 : 0.82);
    if (SNARE.includes(ls)) this.snare(t + LATE, 1);
    if (mode === 1) {
      if (ls % 4 === 0) this.hat(t, 0.16);
      return;
    }
    // open air: a hat on every eighth, the off ones a little late, an open one before the turn, a roll every eight bars
    const roll = barIn === 7 && ls >= 28;
    if (roll) { this.hat(t, 0.16 + (ls - 28) * 0.04); this.hat(t + STEP / 2, 0.14 + (ls - 28) * 0.04); }
    else if (ls === 30 && (unit & 1)) this.hat(t, 0.24, true);
    else if (ls % 2 === 0) this.hat(t + (ls % 4 === 2 ? SWING * STEP : 0), (ls % 8 === 0 ? 0.27 : ls % 4 === 0 ? 0.21 : 0.15) * (0.9 + 0.2 * hash(i)));
    else if (ls === 11 || ls === 27 || (hi > 0.72 && (ls === 3 || ls === 19))) this.hat(t, 0.1);
  }
}

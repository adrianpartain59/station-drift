// The soundtrack: a dark breakbeat track, a little over three minutes long before it comes round again.
// A drum loop under a synthesized kick, a reese bass, chords, and three melodies that take turns and overlap.
//
// The notes of the chords and the bass are a transcription of a reference beat Adrian supplied:
//   bass    D, then F (D1 and F1)
//   chords  D4 A4 E5 (a D with no third, stacked in fifths), then D4 F4 A4 C5 (D minor seventh, over the F)
// Their rhythm is this game's own, fitted to the drum loop he chose: 160 BPM, the loop's own tempo, the harmony
// two bars long (D for five beats, F for three, as on the reference). Every melody note is a note of the chord
// under it.
//
// The drum loop is a file (SONG.LOOP), four bars long, already filtered: its lows are cut so the kick and the bass
// here own them. If the file is not there, the track plays a plain synthesized kit in its place.
//
// The whole mix runs through a soft saturation (see the constructor) and each instrument has its own EQ.
//
// The arrangement is the FORM table: 32 blocks of four bars, each saying what plays. It has two breakdowns, a
// stretch without the bass, one without the drums, one without the chords, and drops back in from each.
//
// The track also follows the run:
//   idle     not in a run: chords, sub and the bell, quiet and muffled, whatever the arrangement says. No drums.
//   station  inside a ship: the arrangement, muffled.
//   drive    open air: the arrangement.
// `intensity` (how hard the engine is working, 0..1) opens the bass and the chords a little.

const BPM = 160;
const STEP = 60 / BPM / 4;
const BLOCK = 64;   // sixteenths in four bars

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
const KICK = [0, 10];   // per bar: under the loop's own two

// ---- the melodies: chord tones only. Two bars each; where there are two phrases they alternate ----
// A, the bell: [step, note, how hard]. Each note said twice, on the loop's accents. A5 E5, then F5 D5 (E to F is the dark step).
const BELL = [
  [[4, 81, 1], [7, 81, 0.55], [10, 76, 0.9], [14, 76, 0.5], [20, 77, 1], [23, 77, 0.55], [26, 74, 0.9], [30, 74, 0.5]],
  [[4, 74, 1], [7, 74, 0.55], [10, 76, 0.9], [14, 76, 0.5], [20, 77, 1], [23, 77, 0.55], [26, 72, 0.9], [30, 72, 0.5]],
];
// B, the keys: [step, note, how hard]. A slower line that falls through the chord, and answers itself an octave of the way up.
const KEYS = [
  [[0, 74, 1], [6, 76, 0.8], [12, 69, 0.9], [20, 72, 1], [24, 69, 0.8], [28, 65, 0.9]],
  [[0, 74, 1], [6, 76, 0.8], [12, 81, 0.9], [20, 77, 1], [24, 74, 0.8], [28, 72, 0.9]],
];
// C, the whistle: [step, note, length in steps]. Long notes over everything: A5 up to C6, then E5 F5 up to A5.
const WHISTLE = [
  [[2, 81, 16], [20, 84, 12]],
  [[2, 76, 16], [20, 77, 6], [26, 81, 6]],
];

// ---- the arrangement: one line is four bars ----
// d  the drum loop (1), with `sweep` 'open' or 'close' to bring it in or take it out through a filter
// k  the kick: 1 as written, 2 on the downbeats only
// b  the bass: 1 the sub alone, 2 the whole reese
// p  the chords
// m  the melodies in each of the block's two halves: letters A B C, lower case for quietly
// hit   a low boom and a wash on the block's first beat
// end   how the block leaves: 'fill' plays the loop's fill bar, 'swell' adds a rising hiss, 'cut' adds the swell
//       and then takes the drums and the bass away for the last two beats
const FORM = [
  { p: 1, m: ['a', 'a'] },                                                        //  1  intro
  { p: 1, d: 1, sweep: 'open', b: 1, m: ['a', 'a'], end: 'swell' },
  { hit: 1, d: 1, k: 1, b: 2, p: 1, m: ['', ''] },                                //  9  first drop: no melody
  { d: 1, k: 1, b: 2, p: 1, m: ['', ''], end: 'fill' },
  { d: 1, k: 1, b: 2, p: 1, m: ['A', 'A'] },                                      // 17  the bell
  { d: 1, k: 1, b: 2, p: 1, m: ['A', 'A'], end: 'fill' },
  { d: 1, k: 1, b: 2, p: 1, m: ['AC', 'AC'] },                                    // 25  the whistle over it
  { d: 1, k: 1, b: 2, p: 1, m: ['AC', 'AC'], end: 'cut' },
  { p: 1, b: 1, m: ['B', 'B'] },                                                  // 33  breakdown: the keys
  { p: 1, b: 1, m: ['BC', 'BC'], end: 'swell' },
  { d: 1, sweep: 'open', k: 2, b: 1, p: 1, m: ['B', 'B'] },                       // 41  build
  { d: 1, k: 2, b: 2, p: 1, m: ['B', 'B'], end: 'cut' },
  { hit: 1, d: 1, k: 1, b: 2, p: 1, m: ['B', 'B'] },                              // 49  second drop
  { d: 1, k: 1, b: 2, p: 1, m: ['B', 'B'], end: 'fill' },
  { d: 1, k: 1, b: 2, p: 1, m: ['A', 'B'] },                                      // 57  bell and keys trade bars
  { d: 1, k: 1, b: 2, p: 1, m: ['A', 'BC'], end: 'fill' },
  { d: 1, k: 1, p: 1, m: ['C', 'C'] },                                            // 65  the bass drops out
  { d: 1, k: 1, b: 2, p: 1, m: ['AC', 'AC'], end: 'fill' },                       //     and comes back
  { k: 2, b: 2, p: 1, m: ['A', 'A'] },                                            // 73  the drums drop out
  { d: 1, sweep: 'open', k: 1, b: 2, p: 1, m: ['A', 'A'], end: 'cut' },           //     and come back
  { hit: 1, d: 1, k: 1, b: 2, p: 1, m: ['AC', 'BC'] },                            // 81  everything
  { d: 1, k: 1, b: 2, p: 1, m: ['AC', 'BC'], end: 'fill' },
  { d: 1, k: 1, b: 2, m: ['A', 'A'] },                                            // 89  the chords drop out
  { d: 1, k: 1, b: 2, m: ['', ''], end: 'cut' },                                  //     drums and bass alone
  { p: 1, m: ['C', 'C'] },                                                        // 97  second breakdown: chords and whistle
  { p: 1, b: 1, m: ['BC', 'BC'], end: 'swell' },
  { d: 1, sweep: 'open', b: 1, p: 1, m: ['B', 'B'] },                             // 105 build
  { d: 1, k: 2, b: 2, p: 1, m: ['A', 'B'], end: 'cut' },
  { hit: 1, d: 1, k: 1, b: 2, p: 1, m: ['AC', 'BC'] },                            // 113 last drop
  { d: 1, k: 1, b: 2, p: 1, m: ['AC', 'BC'], end: 'fill' },
  { d: 1, k: 1, b: 2, p: 1, m: ['A', 'A'] },                                      // 121 way out
  { d: 1, sweep: 'close', k: 2, b: 1, p: 1, m: ['a', 'a'], end: 'swell' },
];
const IDLE = { p: 1, b: 1, m: ['a', 'a'] };   // between runs

/**
 * Numbers a tool needs to render the track on its own (tools/audio/render.html).
 * DRIVE: how hard the mix is pushed into the saturation (more = dirtier and denser). LEVEL: how loud it leaves.
 */
export const SONG = { BPM, STEP, STEPS: FORM.length * BLOCK, DRIVE: 0.45, LEVEL: 0.88, LOOP: 'audio/break.wav', LOOP_BARS: 4 };
const SAT_K = 1.4, SAT_SPAN = 1.6;   // the saturation curve's steepness, and the input range it is drawn over

// the stand-in kit, used only when the loop file is missing: a snare on 2 and 4, a hat on every eighth
const SNARE = [4, 12];

export class Music {
  /** `out`: where the music goes. `noiseBuf`: two seconds of white noise, shared with the game's effects. */
  constructor(ctx, out, noiseBuf) {
    this.ctx = ctx; this.noiseBuf = noiseBuf;
    this.open = true; this.playing = false; this.intensity = 0.5;
    this.off = new Set();   // a tool can leave layers out: 'drums' (the loop or its stand-in) 'kick' 'bass' 'pad' 'lead' 'fx'
    this.loop = null;       // the drum loop, once it has been fetched and decoded (setLoop)

    // everything -> a little saturation -> the filter that closes inside a ship -> out.
    // The saturation is a soft curve: quiet material passes almost clean, the loudest peaks (the kick) are rounded
    // off by a few dB. That is the grit, and it is also what lets the whole track sit louder in the game.
    this.level = ctx.createGain(); this.level.gain.value = SONG.LEVEL;
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 2400; this.filter.Q.value = 0.7;
    this.bus = ctx.createGain(); this.bus.gain.value = SONG.DRIVE / SAT_SPAN;
    const sat = ctx.createWaveShaper(), curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) { const x = (i / 2048 - 1) * SAT_SPAN; curve[i] = Math.tanh(SAT_K * x) / Math.tanh(SAT_K); }
    sat.curve = curve; sat.oversample = '4x';
    this.bus.connect(sat).connect(this.filter).connect(this.level).connect(out);
    const eq = (type, freq, gain, q = 0.9) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.gain.value = gain; f.Q.value = q; return f; };
    // the mix: each instrument gets its own band and gives up the ones the others need
    //   chords     nothing under 190 Hz (that is the bass's and the kick's)
    //   melodies   nothing under 330 Hz, a lift at 2 kHz so they read over the engine
    //   drum loop  a dip at 700 Hz where the melodies sit, a lift at 3 kHz for the snare's crack
    //   reese      a lift at 150 Hz for its body, a dip at 360 Hz where the chords' roots are
    //   room       nothing under 240 Hz, so the echo never muddies the low end
    this.padBus = eq('highpass', 190, 0, 0.7); this.padBus.connect(this.bus);
    this.leadBus = eq('highpass', 330, 0, 0.7);
    this.leadBus.connect(eq('peaking', 2000, 3)).connect(this.bus);

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
    this.room.connect(eq('highpass', 240, 0, 0.7)).connect(wet).connect(this.bus);

    // the drum loop: its level; its top turned down so the cymbals sit behind the snare; a filter the arrangement
    // sweeps to bring it in and out; a little of it into the room; and a gate that is shut between runs
    this.breakBus = ctx.createGain(); this.breakBus.gain.value = 1.2;
    const top = ctx.createBiquadFilter(); top.type = 'highshelf'; top.frequency.value = 5000; top.gain.value = -4.5;
    this.breakLP = ctx.createBiquadFilter(); this.breakLP.type = 'lowpass'; this.breakLP.frequency.value = 16000; this.breakLP.Q.value = 0.9;
    this.gate = ctx.createGain(); this.gate.gain.value = 0;
    this.breakBus.connect(eq('peaking', 700, -3)).connect(eq('peaking', 3000, 2, 1)).connect(top).connect(this.breakLP).connect(this.gate).connect(this.bus);
    const breakRoom = ctx.createGain(); breakRoom.gain.value = 0.07;
    this.gate.connect(breakRoom).connect(this.room);

    // the bass: the reference rolls off under about 40 Hz, and so does this
    this.bassBus = ctx.createBiquadFilter(); this.bassBus.type = 'highpass'; this.bassBus.frequency.value = 42; this.bassBus.Q.value = 1;
    this.bassBus.connect(this.bus);
    // The reese. Its oscillators never stop, so the beating between them keeps moving from note to note, which is
    // what makes a reese sound like one. Three parts, each `[oscillator, how many times the note's frequency]`:
    //   the sub, a sine at the note, in the middle;
    //   two saws at the note, 18 cents apart, in the middle, for the depth;
    //   five saws an octave up, spread 48 cents and from hard left to hard right, with their lows removed so the
    //   width stays above the sub.
    this.bassOscs = [];
    const osc = (type, mult, detune) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = NOTE(D1) * mult; o.detune.value = detune;
      o.start(); this.bassOscs.push([o, mult]); return o;
    };
    this.subAmp = ctx.createGain(); this.subAmp.gain.value = 0;
    const subLevel = ctx.createGain(); subLevel.gain.value = 0.42;
    this.subDuck = ctx.createGain();   // the kick pushes the sub down for an instant, so the two never fight for the same lows
    osc('sine', 1, 0).connect(subLevel).connect(this.subDuck).connect(this.subAmp).connect(this.bassBus);
    this.reeseAmp = ctx.createGain(); this.reeseAmp.gain.value = 0;
    this.reeseAmp.connect(this.bassBus);
    // the filter that opens when the bass is struck and breathes slowly after; two in a row for a steep edge
    this.reeseLP = ctx.createBiquadFilter(); this.reeseLP.type = 'lowpass'; this.reeseLP.Q.value = 1.4; this.reeseLP.frequency.value = 400;
    this.reeseLP2 = ctx.createBiquadFilter(); this.reeseLP2.type = 'lowpass'; this.reeseLP2.Q.value = 0.7; this.reeseLP2.frequency.value = 700;
    const breathe = ctx.createOscillator(); breathe.frequency.value = 0.21;
    const growl = ctx.createGain(); growl.gain.value = 60;
    breathe.connect(growl).connect(this.reeseLP.frequency); breathe.start();
    const deep = ctx.createGain(); deep.gain.value = 0.34;
    for (const det of [-9, 9]) osc('sawtooth', 1, det).connect(deep);
    deep.connect(this.reeseLP);
    const wide = ctx.createGain(); wide.gain.value = 0.17;
    const noLows = ctx.createBiquadFilter(); noLows.type = 'highpass'; noLows.frequency.value = 90; noLows.Q.value = 0.7;
    [[-24, -1], [-12, -0.5], [0, 0], [12, 0.5], [24, 1]].forEach(([det, where]) => {
      const pan = ctx.createStereoPanner(); pan.pan.value = where;
      osc('sawtooth', 2, det).connect(pan).connect(wide);
    });
    wide.connect(noLows).connect(this.reeseLP);
    this.reeseLP.connect(this.reeseLP2).connect(eq('peaking', 150, 2)).connect(eq('peaking', 360, -3.5, 1)).connect(this.reeseAmp);

    // tape: a slow drift in pitch on the chords and the melodies, a few cents
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.37;
    this.wow = ctx.createGain(); this.wow.gain.value = 5;
    lfo.connect(this.wow); lfo.start();
    // the whistle's vibrato
    const vib = ctx.createOscillator(); vib.frequency.value = 5.1;
    this.vibrato = ctx.createGain(); this.vibrato.gain.value = 9;
    vib.connect(this.vibrato); vib.start();
    this.lastWhistle = 0;

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
      // the loop runs in step with the song all the time; a run opens the gate on it
      this.gate.gain.setTargetAtTime(playing ? 1 : 0, t, playing ? 0.015 : 0.12);
    }
  }

  noise(t, dur, seed) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    n.start(t, hash(seed) * 1.4); n.stop(t + dur + 0.05);
    return n;
  }

  // ---------- drums ----------
  /** `steps` sixteenths of the loop's bar `bar`, started exactly on the bar line. A bar is a whole number of samples at 44.1 and 48 kHz, so bars join cleanly. */
  slice(t, bar, steps = 16) {
    const n = this.ctx.createBufferSource(); n.buffer = this.loop;
    n.connect(this.breakBus);
    n.start(t, bar * 16 * STEP, steps * STEP);
  }

  /**
   * The kick: the loudest thing in the track, and clean. Three parts: a body that drops fast from a knock to 50 Hz
   * and stays there, for the weight the loop had cut; a click of bright noise; and a short high tick under the click.
   */
  kick(t, vel = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.012);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.07); o.frequency.exponentialRampToValueAtTime(46, t + 0.4);
    const g = ctx.createGain(), p = 1.75 * vel;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(p, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(p * 0.62, t + 0.11); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.46);
    this.subDuck.gain.setValueAtTime(0.5, t); this.subDuck.gain.linearRampToValueAtTime(1, t + 0.08);
    const n = this.noise(t, 0.02, Math.round(t * 311));
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4500; hp.Q.value = 0.7;
    const c = ctx.createGain();
    c.gain.setValueAtTime(0.85 * vel, t); c.gain.exponentialRampToValueAtTime(0.0001, t + 0.009);
    n.connect(hp).connect(c).connect(this.bus);
    const tick = ctx.createOscillator(); tick.type = 'triangle';
    tick.frequency.setValueAtTime(2400, t); tick.frequency.exponentialRampToValueAtTime(700, t + 0.008);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.4 * vel, t); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.01);
    tick.connect(tg).connect(this.bus); tick.start(t); tick.stop(t + 0.02);
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

  // ---------- transitions: quiet ones ----------
  /** A hiss that rises over `steps` sixteenths into the next block. */
  swell(t, steps, vel) {
    const ctx = this.ctx, dur = steps * STEP;
    const n = this.noise(t, dur, Math.round(t * 331));
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(6500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.002, t); g.gain.exponentialRampToValueAtTime(0.1 * vel, t + dur * 0.97); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(this.bus);
    const send = ctx.createGain(); send.gain.value = 0.5; g.connect(send).connect(this.room);
  }

  /** The first beat of a drop: a low boom falling away under the kick, and a dark wash. */
  impact(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(37, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.55, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g).connect(this.bassBus); o.start(t); o.stop(t + 1.15);
    const n = this.noise(t, 1.4, Math.round(t * 127));
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.6;
    f.frequency.setValueAtTime(7000, t); f.frequency.exponentialRampToValueAtTime(700, t + 1.3);
    const c = ctx.createGain();
    c.gain.setValueAtTime(0.0001, t); c.gain.linearRampToValueAtTime(0.11, t + 0.006); c.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    n.connect(f).connect(c).connect(this.bus);
    const send = ctx.createGain(); send.gain.value = 0.6; c.connect(send).connect(this.room);
  }

  // ---------- the transcribed notes ----------
  /**
   * Strike the bass. `growl`: 0 for the sub alone, 1 for the whole reese. `to`: the note it slides to at its end.
   * The oscillators are already running: this moves their pitch, opens their two gates until the note's end, and
   * kicks the filter open.
   */
  bass(t, note, len, vel, to, growl) {
    const dur = len * STEP, f = NOTE(note);
    for (const [o, mult] of this.bassOscs) {
      o.frequency.setValueAtTime(f * mult, t);
      if (to) { o.frequency.setValueAtTime(f * mult, t + dur - 0.055); o.frequency.exponentialRampToValueAtTime(NOTE(to) * mult, t + dur); }
    }
    // when the next note starts as this one ends, its opening lands after this closing and wins: legato
    this.subAmp.gain.setTargetAtTime(vel, t, 0.006); this.subAmp.gain.setTargetAtTime(0, t + dur, 0.02);
    this.reeseAmp.gain.setTargetAtTime(vel * growl, t, 0.008); this.reeseAmp.gain.setTargetAtTime(0, t + dur, 0.02);
    const cut = 190 + 330 * this.intensity;
    this.reeseLP.frequency.setValueAtTime(cut * 2.4, t); this.reeseLP.frequency.exponentialRampToValueAtTime(cut, t + 0.22);
    this.reeseLP2.frequency.setValueAtTime(cut * 1.8, t);
  }

  /** Let go of the bass now (the two beats of silence before a drop). */
  bassOff(t) {
    this.subAmp.gain.setTargetAtTime(0, t, 0.012); this.reeseAmp.gain.setTargetAtTime(0, t, 0.012);
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
    f.connect(f2).connect(g).connect(this.padBus);
    const send = ctx.createGain(); send.gain.value = 0.4; g.connect(send).connect(this.room);
  }

  // ---------- the melodies ----------
  /** A, a dark bell: one sine bent by another an octave up, bright for an instant and then plain, left to ring in the room. */
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
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
    const pan = ctx.createStereoPanner(); pan.pan.value = 0.22;
    car.connect(lp).connect(g).connect(pan).connect(this.leadBus);
    const send = ctx.createGain(); send.gain.value = 0.6; g.connect(send).connect(this.room);
    car.start(t); mod.start(t); car.stop(t + 1.3); mod.stop(t + 1.3);
  }

  /** B, the keys: an electric piano of two sines, one bending the other at the same pitch, and a second voice a hair sharp. */
  keys(t, note, vel) {
    const ctx = this.ctx, fr = NOTE(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    for (const det of [0, 6]) {
      const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = fr; car.detune.value = det;
      const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = fr; mod.detune.value = det;
      const idx = ctx.createGain();
      idx.gain.setValueAtTime(fr * 1.9, t); idx.gain.exponentialRampToValueAtTime(fr * 0.25, t + 0.22);
      mod.connect(idx).connect(car.frequency);
      this.wow.connect(car.detune);
      car.connect(lp); car.start(t); mod.start(t); car.stop(t + 1.1); mod.stop(t + 1.1);
    }
    const pan = ctx.createStereoPanner(); pan.pan.value = -0.25;
    lp.connect(g).connect(pan).connect(this.leadBus);
    const send = ctx.createGain(); send.gain.value = 0.5; g.connect(send).connect(this.room);
  }

  /** C, the whistle: one sine with a slow start, a vibrato, a breath of noise at its pitch, and a slide from the note before. */
  whistle(t, note, len, vel) {
    const ctx = this.ctx, fr = NOTE(note), dur = len * STEP;
    const o = ctx.createOscillator(); o.type = 'sine';
    const from = this.lastWhistle || fr; this.lastWhistle = fr;
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(fr, t + 0.09);
    this.vibrato.connect(o.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.11);
    g.gain.setValueAtTime(vel, t + dur - 0.05); g.gain.setTargetAtTime(0.0001, t + dur - 0.05, 0.11);
    o.connect(g); o.start(t); o.stop(t + dur + 0.7);
    const n = this.noise(t, dur + 0.3, Math.round(t * 71));
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = 9;
    const air = ctx.createGain(); air.gain.value = 0.5;
    n.connect(bp).connect(air).connect(g);
    const pan = ctx.createStereoPanner(); pan.pan.value = -0.1;
    g.connect(pan).connect(this.leadBus);
    const send = ctx.createGain(); send.gain.value = 0.7; g.connect(send).connect(this.room);
  }

  // ---------- the song ----------
  /** Play sixteenth `i` (0..SONG.STEPS-1) at time `t`. */
  step(i, t) {
    const hs = i % BLOCK, ls = i % 32, s16 = i % 16, unit = i >> 5, bar = hs >> 4;
    const off = this.off;
    const mode = !this.playing ? 0 : this.open ? 2 : 1;   // idle, station, drive
    const F = mode === 0 ? IDLE : FORM[Math.floor(i / BLOCK) % FORM.length];
    const cut = F.end === 'cut' && hs >= 56;   // the two beats of nothing before a drop

    // bass: the transcribed notes, struck with the loop
    if (!off.has('bass') && F.b) {
      if (cut) { if (hs === 56) this.bassOff(t); }
      else {
        const hit = BASS.find((b) => b[0] === ls);
        if (hit) this.bass(t, hit[2], Math.min(hit[1], F.end === 'cut' ? 56 - hs : 99), mode === 0 ? 0.5 : 1, hit[3], F.b === 2 ? 1 : 0);
      }
    }

    // chords: the transcribed notes
    if (!off.has('pad') && F.p) {
      const vel = mode === 0 ? 0.11 : 0.125;
      if (ls === CHORD_A_AT) this.pad(t, CHORD_A, CHANGE - CHORD_A_AT, CHORD_A_SWELL, vel);
      if (ls === CHANGE) this.pad(t, CHORD_B, 32 - CHANGE + CHORD_A_AT, 0.03, vel);
    }

    // melodies
    if (!off.has('lead')) {
      const amt = mode === 2 ? 1 : mode === 1 ? 0.85 : 0.7;
      for (const ch of F.m[hs >> 5]) {
        const soft = ch === ch.toLowerCase() ? 0.6 : 1, which = ch.toUpperCase();
        if (which === 'A') {
          const n = BELL[(unit & 3) === 3 ? 1 : 0].find((b) => b[0] === ls);
          if (n) this.bell(t, n[1], n[2] * 0.28 * soft * amt);
        } else if (which === 'B') {
          const n = KEYS[unit & 1].find((b) => b[0] === ls);
          if (n) this.keys(t, n[1], n[2] * 0.25 * soft * amt);
        } else if (which === 'C') {
          const n = WHISTLE[unit & 1].find((b) => b[0] === ls);
          if (n) this.whistle(t, n[1], n[2], 0.08 * soft * amt);
        }
      }
    }
    if (mode === 0) return;

    // transitions
    if (!off.has('fx')) {
      if (F.hit && hs === 0) this.impact(t);
      if (F.end === 'swell' && hs === 32) this.swell(t, 32, 1);
      if (F.end === 'cut' && hs === 40) this.swell(t, 16, 0.8);
    }

    // drums. The loop is one bar at a time: bars one to three of it, then bar two again, with its fourth bar (the
    // fill) kept for the ends of sections.
    if (!off.has('drums') && F.d && !cut) {
      if (hs === 0) {
        const lp = this.breakLP.frequency, span = BLOCK * STEP;
        lp.cancelScheduledValues(t);
        if (F.sweep === 'open') { lp.setValueAtTime(320, t); lp.exponentialRampToValueAtTime(16000, t + span * 0.94); }
        else if (F.sweep === 'close') { lp.setValueAtTime(16000, t); lp.exponentialRampToValueAtTime(300, t + span); }
        else lp.setValueAtTime(16000, t);
      }
      if (this.loop) {
        if (s16 === 0) this.slice(t, bar < 3 ? bar : F.end === 'fill' || F.end === 'cut' ? 3 : 1, F.end === 'cut' && bar === 3 ? 8 : 16);
      } else {
        // no loop file: a plain kit in its place
        if (SNARE.includes(s16)) this.snare(t, 1);
        if (s16 % 2 === 0) this.hat(t, (s16 % 4 === 0 ? 0.2 : 0.14) * (0.9 + 0.2 * hash(i)));
      }
    }
    if (!off.has('kick') && F.k && !cut && (F.k === 2 ? s16 === 0 : KICK.includes(s16))) this.kick(t, s16 === 0 ? 1 : 0.9);
  }
}

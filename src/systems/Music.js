// The soundtrack: a wave-phonk night drive, synthesized as it plays. No samples, no audio files.
//
// Harmony, two bars at 136 BPM: D add9 for five beats, then F6 for three (the F lands late, on beat two of the
// second bar). Every second pair of bars leans on the sevenths instead: D7, then F7. The chords, the tempo and
// where the change falls follow a reference beat Adrian supplied; the drums, the bass line, the melody and every
// sound are this game's own.
//
// The track follows the run, one step (a sixteenth) at a time:
//   idle     not in a run: the chords, a heartbeat kick and three notes of the melody, muffled.
//   station  inside a ship: half-time. Kick, a snare on three, offbeat hats, a long sliding bass, half the melody.
//   drive    open air: the whole beat. Syncopated kick, claps, eighth hats, the cowbell melody, a busy bass.
// `intensity` (how hard the engine is working, 0..1) opens the filters, adds the sixteenth hats and the arpeggio.
// The song is 32 bars: cowbell, cowbell with the arpeggio, the arpeggio alone, then everything.

const BPM = 136;
const STEP = 60 / BPM / 4;
/** Numbers a tool needs to render the track on its own (tools/audio/render.html). */
export const SONG = { BPM, STEP, STEPS: 512, LEVEL: 0.21 };

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// the same numbers every time a step is played, so a render is repeatable (no Math.random in here)
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

// pad: the voicing, low to high. sub: the bass note. reese: the growl an octave above it.
const CH = {
  Dadd9: { pad: [50, 57, 62, 64, 66], sub: 38, reese: 50 },   // D3 A3 D4 E4 F#4 over D2
  F6: { pad: [53, 57, 60, 62, 65], sub: 29, reese: 41 },      // F3 A3 C4 D4 F4 over F1: the bass drops a sixth
  D7: { pad: [50, 57, 60, 62, 66], sub: 38, reese: 50 },      // D3 A3 C4 D4 F#4
  F7: { pad: [53, 57, 60, 63, 65], sub: 29, reese: 41 },      // F3 A3 C4 Eb4 F4
};
const CHANGE = 20;   // the step, of 32, where the second chord comes in

// The cowbell line: [step, note] over two bars, in threes and a two (0 3 6 | 8 11 14). A is in every chord, so
// the line hangs on it; F# gives way to F, and in the seventh bars C and Eb take over.
const LEAD = [
  [[0, 69], [3, 69], [6, 74], [8, 69], [11, 66], [14, 64], [16, 66], [20, 69], [23, 72], [26, 69], [28, 65], [30, 67]],
  [[0, 69], [3, 69], [6, 74], [8, 76], [11, 74], [14, 69], [16, 66], [20, 72], [23, 74], [26, 72], [28, 69], [30, 65]],
  [[0, 74], [3, 72], [6, 69], [8, 72], [11, 69], [14, 66], [16, 69], [20, 75], [23, 72], [26, 69], [28, 65], [30, 63]],
  [[0, 74], [3, 72], [6, 69], [8, 72], [11, 74], [14, 78], [16, 74], [20, 75], [23, 72], [26, 69], [28, 65]],
];
const ARP = [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 2, 3, 4, 1, 2];

const KICK_DRIVE = [0, 6, 10, 16, 22, 26];
const KICK_STATION = [0, 7, 16, 20, 26];
// bass, [step, length, note or 0 for the chord's own]: drive walks back up to D at the end of each pair of bars
const BASS_DRIVE = [[0, 6, 0], [6, 4, 0], [10, 6, 0], [16, 4, 0], [20, 6, 0], [26, 2, 0]];
const WALK = [[[28, 2, 33], [30, 2, 36]], [[28, 2, 36], [30, 2, 39]]];   // F A C into D; F C Eb into D
const BASS_STATION = [[0, 16, 0], [16, 4, 0], [20, 12, 0]];
const BASS_IDLE = [[0, 20, 0], [20, 12, 0]];

export class Music {
  /** `out`: where the music goes. `noiseBuf`: two seconds of white noise, shared with the game's effects. */
  constructor(ctx, out, noiseBuf) {
    this.ctx = ctx; this.noiseBuf = noiseBuf;
    this.open = true; this.playing = false; this.intensity = 0.5;
    this.off = new Set();   // a tool can leave layers out: 'drums' 'bass' 'pad' 'lead' 'arp' 'fx'

    // everything -> a little tape drive -> the filter that closes inside a ship -> out
    this.level = ctx.createGain(); this.level.gain.value = SONG.LEVEL;
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 2400; this.filter.Q.value = 0.7;
    this.drive = ctx.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) { const x = (i / 1024 - 1) * 2.2; curve[i] = Math.tanh(1.2 * x) / Math.tanh(1.2); }
    this.drive.curve = curve; this.drive.oversample = '2x';
    this.bus = ctx.createGain(); this.bus.gain.value = 1 / 2.2;   // the curve spans -2.2..2.2
    this.bus.connect(this.drive).connect(this.filter).connect(this.level).connect(out);
    // what the kick pushes down: the bass, the pad, the arpeggio
    this.duck = ctx.createGain(); this.duck.connect(this.bus);
    // echo: a dotted eighth
    this.echo = ctx.createDelay(1); this.echo.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    this.echo.connect(lp).connect(fb).connect(this.echo);
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    lp.connect(wet).connect(this.filter);
    // a sine with a little of its octave and twelfth, so the bass is still there on small speakers
    this.subWave = ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0]), new Float32Array([0, 1, 0.28, 0.1]));
    this.bassEnv = [];
  }

  /** What the run is doing. `t`: when (defaults to now). */
  set({ open, playing, intensity }, t = this.ctx.currentTime) {
    this.open = open; this.playing = playing; this.intensity = intensity;
    const cut = !playing ? 1500 : open ? 11000 : 3200;
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

  // ---------- voices ----------
  kick(t, vel = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(168, t); o.frequency.exponentialRampToValueAtTime(47, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.95 * vel, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.34);
    // the kick pushes the bass and the chords out of its way
    this.duck.gain.setValueAtTime(1 - 0.6 * vel, t); this.duck.gain.linearRampToValueAtTime(1, t + 0.2);
  }

  clap(t, vel = 1) {
    const ctx = this.ctx, p = 0.6 * vel;
    const n = this.noise(t, 0.3, Math.round(t * 977));
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1450; f.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const k of [0, 0.011, 0.022]) { g.gain.setValueAtTime(p, t + k); g.gain.exponentialRampToValueAtTime(p * 0.14, t + k + 0.01); }
    g.gain.setValueAtTime(p * 1.1, t + 0.033); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);
    n.connect(f).connect(g).connect(this.bus);
    const send = ctx.createGain(); send.gain.value = 0.16; g.connect(send).connect(this.echo);
  }

  snare(t, vel = 1) {
    const ctx = this.ctx;
    const n = this.noise(t, 0.36, Math.round(t * 613));
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1850; f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    n.connect(f).connect(g).connect(this.bus);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(196, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.09);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t); g2.gain.linearRampToValueAtTime(0.32 * vel, t + 0.002); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g2).connect(this.bus); o.start(t); o.stop(t + 0.16);
    const send = ctx.createGain(); send.gain.value = 0.34; g.connect(send).connect(this.echo);   // room, inside a ship
  }

  hat(t, vel, open = false) {
    const ctx = this.ctx, dur = open ? 0.19 : 0.034;
    const n = this.noise(t, dur + 0.02, Math.round(t * 1409));
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = open ? 7000 : 8600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.65 * vel, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = ctx.createStereoPanner(); pan.pan.value = (hash(Math.round(t * 53)) - 0.5) * 0.7;
    n.connect(f).connect(g).connect(pan).connect(this.bus);
  }

  /** The cowbell: two square waves a rough fifth apart through a band-pass, as the old drum machines did it. */
  bell(t, note, vel) {
    const ctx = this.ctx, fr = NOTE(note);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = Math.min(4200, fr * 3.4); f.Q.value = 0.9;
    const g = ctx.createGain(), p = 0.7 * vel;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(p, t + 0.002);
    g.gain.exponentialRampToValueAtTime(p * 0.3, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    for (const [ratio, amt] of [[1, 1], [1.48, 0.55]]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr * ratio;
      const a = ctx.createGain(); a.gain.value = amt;
      o.connect(a).connect(f); o.start(t); o.stop(t + 0.4);
    }
    f.connect(g).connect(this.bus);
    const send = ctx.createGain(); send.gain.value = 0.3; g.connect(send).connect(this.echo);
  }

  /** One bass note: the sub, and above it two detuned saws through a low filter. `from`: slide in from this note. */
  bass(t, sub, reese, len, vel, from, growl) {
    const ctx = this.ctx, dur = len * STEP;
    // one bass at a time: whatever was still sounding lets go
    for (const e of this.bassEnv) { e.gain.cancelScheduledValues(t); e.gain.setTargetAtTime(0.0001, t, 0.012); }
    this.bassEnv.length = 0;
    const gate = (g, level) => {
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(level, t + 0.006);
      g.gain.setValueAtTime(level, t + dur - 0.035); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      this.bassEnv.push(g);
    };
    const o = ctx.createOscillator(); o.setPeriodicWave(this.subWave);
    if (from) { o.frequency.setValueAtTime(NOTE(from), t); o.frequency.exponentialRampToValueAtTime(NOTE(sub), t + 0.07); }
    else { o.frequency.setValueAtTime(NOTE(sub) * 1.5, t); o.frequency.exponentialRampToValueAtTime(NOTE(sub), t + 0.025); }   // the thump at the front of the note
    const g = ctx.createGain(); gate(g, 0.32 * vel);
    o.connect(g).connect(this.duck); o.start(t); o.stop(t + dur + 0.1);
    if (!growl) return;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
    const cut = 230 + 520 * this.intensity * growl;
    f.frequency.setValueAtTime(cut * 2.2, t); f.frequency.exponentialRampToValueAtTime(cut, t + 0.12);
    const g2 = ctx.createGain(); gate(g2, 0.14 * vel * growl);
    for (const det of [-11, 11]) {
      const s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.value = NOTE(reese); s.detune.value = det;
      s.connect(f); s.start(t); s.stop(t + dur + 0.1);
    }
    f.connect(g2).connect(this.duck);
  }

  pad(t, notes, len, vel) {
    const ctx = this.ctx, dur = len * STEP;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.value = 650 + 1500 * this.intensity + (this.open && this.playing ? 500 : 0);
    const g = ctx.createGain(), p = 0.11 * vel;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(p, t + 0.07);
    g.gain.setValueAtTime(p, t + dur - 0.1); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.12);
    for (const side of [-1, 1]) {   // each note twice, a little flat on the left and a little sharp on the right
      const pan = ctx.createStereoPanner(); pan.pan.value = side * 0.65; pan.connect(f);
      for (const n of notes) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = side * 8;
        o.connect(pan); o.start(t); o.stop(t + dur + 0.16);
      }
    }
    f.connect(g).connect(this.duck);
    const send = ctx.createGain(); send.gain.value = 0.2; g.connect(send).connect(this.echo);
  }

  pluck(t, note, vel, side = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(note);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(3800, t); f.frequency.exponentialRampToValueAtTime(520, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.15 * vel, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    const pan = ctx.createStereoPanner(); pan.pan.value = side * 0.45;
    o.connect(f).connect(g).connect(pan).connect(this.duck); o.start(t); o.stop(t + 0.2);
    const send = ctx.createGain(); send.gain.value = 0.5; g.connect(send).connect(this.echo);
  }

  /** A rising hiss over the last bar of each eight. */
  riser(t, len, vel) {
    const ctx = this.ctx, dur = len * STEP;
    const n = this.noise(t, dur, Math.round(t * 331));
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.005, t); g.gain.exponentialRampToValueAtTime(0.16 * vel, t + dur * 0.96); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(this.bus);
  }

  /** The top of each eight bars in open air: a low boom and a wash. */
  impact(t) {
    const ctx = this.ctx;
    const n = this.noise(t, 1.2, Math.round(t * 127));
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.6;
    f.frequency.setValueAtTime(9000, t); f.frequency.exponentialRampToValueAtTime(900, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    n.connect(f).connect(g).connect(this.bus);
    const send = ctx.createGain(); send.gain.value = 0.3; g.connect(send).connect(this.echo);
  }

  // ---------- the song ----------
  /** Play sixteenth `i` (0..SONG.STEPS-1) at time `t`. */
  step(i, t) {
    const ls = i % 32, s16 = i % 16, pair = (i >> 5) & 3, barIn = (i >> 4) & 7, section = (i >> 7) & 3;
    const sevenths = pair >= 2;
    const first = sevenths ? CH.D7 : CH.Dadd9, second = sevenths ? CH.F7 : CH.F6;
    const ch = ls < CHANGE ? first : second;
    const hi = this.intensity, off = this.off;
    const mode = !this.playing ? 0 : this.open ? 2 : 1;   // idle, station, drive
    const lastBar = barIn === 7;

    // drums
    if (!off.has('drums')) {
      if (mode === 2) {
        if (KICK_DRIVE.includes(ls) || (lastBar && s16 === 15)) this.kick(t, ls === 0 ? 1 : 0.92);
        if (s16 === 4 || s16 === 12) this.clap(t, 1);
        if (lastBar && s16 >= 12) { this.hat(t, 0.5 + (s16 - 12) * 0.12); this.hat(t + STEP / 2, 0.45 + (s16 - 12) * 0.12); }   // the roll into the next eight
        else if (s16 === 14) this.hat(t, 0.8, true);
        else if (s16 % 2 === 0) this.hat(t, (s16 % 4 === 2 ? 0.85 : 0.5) * (0.85 + 0.3 * hash(i)));
        else if (hi > 0.72) this.hat(t, 0.3 * (0.7 + 0.6 * hash(i * 7)));
      } else if (mode === 1) {
        if (KICK_STATION.includes(ls)) this.kick(t, ls === 0 || ls === CHANGE ? 1 : 0.85);
        if (s16 === 8) this.snare(t, 1);
        if (lastBar && s16 >= 12) { this.hat(t, 0.4 + (s16 - 12) * 0.1); this.hat(t + STEP / 2, 0.35 + (s16 - 12) * 0.1); }
        else if (s16 % 4 === 2) this.hat(t, 0.6 * (0.85 + 0.3 * hash(i)));
      } else if (ls === 0 || ls === CHANGE) this.kick(t, 0.6);   // a heartbeat on each chord
    }

    // bass
    if (!off.has('bass')) {
      const line = mode === 2 ? BASS_DRIVE : mode === 1 ? BASS_STATION : BASS_IDLE;
      let hit = line.find((b) => b[0] === ls);
      if (mode === 2 && !hit) hit = WALK[sevenths ? 1 : 0].find((b) => b[0] === ls);
      if (hit) {
        const walk = hit[2] > 0;
        const sub = walk ? hit[2] : ch.sub, reese = walk ? hit[2] + 12 : ch.reese;
        // the slide down into the F, and back up into the D
        const from = ls === CHANGE ? first.sub : ls === 0 && mode === 1 ? second.sub : 0;
        this.bass(t, sub, reese, hit[1], mode === 0 ? 0.5 : 1, from, mode === 2 ? 1 : mode === 1 ? 0.6 : 0);
      }
    }

    // chords
    if (!off.has('pad') && (ls === 0 || ls === CHANGE)) this.pad(t, ch.pad, ls === 0 ? CHANGE : 32 - CHANGE, 1);

    // the cowbell line
    if (!off.has('lead') && !(mode === 2 && section === 2)) {
      const line = LEAD[pair];
      const k = line.findIndex((n) => n[0] === ls);
      if (k >= 0 && (mode === 2 || (mode === 1 && ls < 16) || (mode === 0 && k < 3))) {
        const vel = mode === 2 ? 1 : mode === 1 ? 0.8 : 0.5;
        this.bell(t, line[k][1], vel * (ls % 8 === 0 ? 1 : 0.86));
        if (mode === 2 && (section & 1) && hi > 0.6) this.bell(t, line[k][1] + 12, 0.3);
      }
    }

    // the arpeggio
    if (!off.has('arp') && mode === 2 && section >= 1) {
      const amt = Math.min(1, Math.max(0, (hi - 0.35) * 1.6)) * (section === 2 ? 1.25 : 0.8);
      if (amt > 0.02) this.pluck(t, ch.pad[ARP[s16]] + 12 + (section === 2 && s16 >= 8 ? 12 : 0), amt * (s16 % 4 === 0 ? 1 : 0.8), s16 % 2 ? 1 : -1);
    }

    // the turn of each eight bars
    if (!off.has('fx') && mode > 0) {
      if (lastBar && s16 === 0) this.riser(t, 16, mode === 2 ? 1 : 0.6);
      if (mode === 2 && i % 128 === 0) this.impact(t);
    }
  }
}

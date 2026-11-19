// Everything you hear is synthesized: engine, the hiss of a slide, impacts, pickups, and the soundtrack
// (systems/Music.js), which is half-time inside a ship and opens up in open air.
import { Music, SONG } from './Music.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null; this.started = false; this.muted = false;
  }

  start() {
    if (this.started) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.started = true;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.buildEngine();
    this.buildDrift();
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  noise(loop = true) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = loop;
    return src;
  }

  // ---------- continuous voices ----------
  buildEngine() {
    const ctx = this.ctx;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 600; this.engFilter.Q.value = 3;
    this.engA = ctx.createOscillator(); this.engA.type = 'sawtooth';
    this.engB = ctx.createOscillator(); this.engB.type = 'square';
    const gb = ctx.createGain(); gb.gain.value = 0.35;
    this.engA.connect(this.engFilter); this.engB.connect(gb).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.sfx);
    this.engA.start(); this.engB.start();
    // jet roar
    this.jet = this.noise(); this.jetF = ctx.createBiquadFilter(); this.jetF.type = 'bandpass'; this.jetF.frequency.value = 500; this.jetF.Q.value = 0.6;
    this.jetG = ctx.createGain(); this.jetG.gain.value = 0;
    this.jet.connect(this.jetF).connect(this.jetG).connect(this.sfx); this.jet.start();
    // scrape
    this.scr = this.noise(); this.scrF = ctx.createBiquadFilter(); this.scrF.type = 'highpass'; this.scrF.frequency.value = 2500;
    this.scrG = ctx.createGain(); this.scrG.gain.value = 0;
    this.scr.connect(this.scrF).connect(this.scrG).connect(this.sfx); this.scr.start();
  }

  buildDrift() {
    const ctx = this.ctx;
    this.dr = this.noise(); this.drF = ctx.createBiquadFilter(); this.drF.type = 'bandpass'; this.drF.frequency.value = 1400; this.drF.Q.value = 4;
    this.drG = ctx.createGain(); this.drG.gain.value = 0;
    this.dr.connect(this.drF).connect(this.drG).connect(this.sfx); this.dr.start();
    this.whine = ctx.createOscillator(); this.whine.type = 'triangle'; this.whine.frequency.value = 900;
    this.whG = ctx.createGain(); this.whG.gain.value = 0;
    this.whine.connect(this.whG).connect(this.sfx); this.whine.start();
  }

  // rev: 0..1.3 engine speed; slide 0..1; tier 0..3; scrape: rubbing a wall; clockLow: last seconds
  update(state) {
    if (!this.started) return;
    const t = this.ctx.currentTime, k = 0.06;
    const { rev, boost, slide, drifting, scrape, tier, zone, playing, brake } = state;
    const live = playing ? 1 : 0.35;
    const f0 = 46 + rev * 78 + (boost ? 26 : 0) - (drifting ? 6 : 0);
    this.engA.frequency.setTargetAtTime(f0, t, k);
    this.engB.frequency.setTargetAtTime(f0 * 0.5 * 1.004, t, k);
    this.engFilter.frequency.setTargetAtTime(420 + rev * 1100 + (boost ? 1700 : 0), t, k);
    this.engGain.gain.setTargetAtTime((brake ? 0.07 : 0.11) * live, t, 0.1);
    this.jetF.frequency.setTargetAtTime(320 + rev * 900 + (boost ? 1500 : 0), t, k);
    this.jetG.gain.setTargetAtTime((0.05 + rev * 0.1 + (boost ? 0.15 : 0)) * live, t, 0.08);
    // the slide: a band of hiss that rises with the angle and with each charge tier, plus a thin whine
    const ds = drifting ? Math.min(1, 0.35 + slide * 0.8) : 0;
    this.drG.gain.setTargetAtTime(ds * 0.24 * live, t, 0.04);
    this.drF.frequency.setTargetAtTime(1000 + ds * 700 + tier * 420 + rev * 300, t, 0.05);
    this.whG.gain.setTargetAtTime(drifting ? (0.014 + tier * 0.013) * live : 0, t, 0.06);
    this.whine.frequency.setTargetAtTime(640 + tier * 300 + slide * 260, t, 0.08);
    this.scrG.gain.setTargetAtTime(scrape ? 0.2 : 0, t, 0.03);
    // the track is half-time and muffled inside a ship, whole in open air, and idles between runs
    this.music.set({ open: zone === 1, playing: !!playing, intensity: this.intensity }, t);
  }

  // ---------- one-shots ----------
  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  tone(type, freq, dur, vol = 0.2, when = 0, endFreq, bus) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.005, vol, dur);
    o.connect(g).connect(bus || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  noiseHit(dur, vol, type, freq, q = 1, when = 0, sweepTo) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const n = this.noise(false); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.004, vol, dur);
    n.connect(f).connect(g).connect(this.sfx); n.start(t, Math.random()); n.stop(t + dur + 0.05);
  }

  coin(combo) {
    const base = [76, 79, 81, 83, 86, 88, 91, 93][Math.min(7, combo)];
    this.tone('triangle', NOTE(base), 0.12, 0.13);
    this.tone('sine', NOTE(base + 12), 0.18, 0.07, 0.04);
  }
  crash() {
    this.noiseHit(0.55, 0.7, 'lowpass', 1800, 0.8, 0, 120);
    this.tone('sine', 120, 0.45, 0.6, 0, 38);
    this.noiseHit(0.25, 0.35, 'highpass', 3000, 0.7);
  }
  impact(v) { this.noiseHit(0.18, Math.min(0.5, 0.1 + v * 0.02), 'bandpass', 1600, 1.4); this.tone('square', 90, 0.12, Math.min(0.2, v * 0.01), 0, 50); }
  graze() { this.noiseHit(0.1, 0.1, 'highpass', 3200, 1); }
  boost(tier = 0) { this.noiseHit(0.7 + tier * 0.2, 0.3 + tier * 0.04, 'bandpass', 300, 1.2, 0, 4200); this.tone('sawtooth', 110, 0.6 + tier * 0.15, 0.11, 0, 440 + tier * 110); }
  driftStart() { this.noiseHit(0.16, 0.2, 'highpass', 3600, 1); this.tone('sawtooth', 520, 0.12, 0.05, 0, 300); }
  driftSwitch() { this.noiseHit(0.2, 0.2, 'bandpass', 2600, 2, 0, 1200); }
  tierUp(tier) { [0, 4, 7].forEach((n, i) => this.tone('square', NOTE(72 + tier * 3 + n), 0.09, 0.05, i * 0.045)); }
  driftBank(tier) { [0, 7, 12, 16].forEach((n, i) => this.tone('triangle', NOTE(76 + Math.max(0, tier) * 2 + n), 0.16, 0.08, i * 0.05)); }
  driftLost() { this.tone('sawtooth', 300, 0.35, 0.12, 0, 80); }
  nearMiss() { this.noiseHit(0.22, 0.22, 'bandpass', 2400, 2, 0, 600); this.tone('sine', NOTE(88), 0.1, 0.05, 0.05); }
  pad() { this.boost(0); this.tone('triangle', NOTE(84), 0.2, 0.08); }
  gate() { [0, 5, 9, 12, 17].forEach((n, i) => this.tone('triangle', NOTE(74 + n), 0.22, 0.09, i * 0.06)); this.noiseHit(0.5, 0.16, 'bandpass', 900, 1, 0, 5000); }
  tick(last) { this.tone('square', NOTE(last ? 93 : 86), 0.07, 0.07); }
  timeUp() { [0, -3, -7, -12].forEach((n, i) => this.tone('sawtooth', NOTE(64 + n), 0.3, 0.1, i * 0.16)); }
  whoosh() { this.noiseHit(1.4, 0.28, 'bandpass', 200, 0.8, 0, 2500); }
  ui() { this.tone('square', NOTE(84), 0.06, 0.05); }

  // ---------- music ----------
  startMusic() {
    this.music = new Music(this.ctx, this.master, this.noiseBuf);
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.intensity = 0.5;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setIntensity(v) { this.intensity = v; }

  /** Hand the track its next sixteenths a little ahead of time, so the timing is the audio clock's, not the timer's. */
  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    // a tab that was in the background wakes far behind: pick the beat up from now instead of playing catch-up
    if (this.nextTime < this.ctx.currentTime - 0.25) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.music.step(this.step, this.nextTime);
      this.nextTime += SONG.STEP;
      this.step = (this.step + 1) % SONG.STEPS;
    }
  }
}

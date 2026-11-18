import { CLOCK } from './Constants.js';
import { MODES, DEFAULT_MODE } from './Modes.js';

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

class State {
  constructor() {
    const saved = load('sd.mode', DEFAULT_MODE);   // easy | hard (core/Modes.js); hard unless the player chose easy
    this.mode = MODES[saved] ? saved : DEFAULT_MODE;
    this.bests = { easy: load('sd.best2', 0), hard: load('sd.best2.hard', 0) };
    this.bank = load('sd.bank', 0);
    this.muted = load('sd.muted', false);
    this.camMode = load('sd.cam', 'chase');
    this.quality = load('sd.quality', 'high');
    this.learned = load('sd.learned', 0);    // drifts banked, ever: the hints stop once you clearly know how
    this.reset();
  }

  reset() {
    this.phase = 'title';     // title | playing | paused | over
    this.time = 0;
    this.clock = CLOCK.START;
    this.clockOut = false;    // clock at zero, coasting
    this.distance = 0;
    this.score = 0;
    this.coins = 0;
    this.coinCombo = 0;
    this.lastCoinAt = -9;
    this.chain = 0;           // drifts banked in a row
    this.bestChain = 0;
    this.lastDriftEnd = -99;
    this.bestDrift = 0;
    this.drifts = 0;
    this.driftTime = 0;       // seconds of clock earned by drifting
    this.crashes = 0;
    this.gates = 0;
    this.stations = 0;
    this.speed = 0;
  }

  /** Best score in the mode being played. */
  get best() { return this.bests[this.mode] || 0; }

  persist() {
    if (this.score > this.best) this.bests[this.mode] = Math.floor(this.score);
    save(this.mode === 'hard' ? 'sd.best2.hard' : 'sd.best2', this.best);
    save('sd.bank', this.bank);
    save('sd.learned', this.learned);
  }
  setMode(v) { this.mode = v; save('sd.mode', v); }
  setMuted(v) { this.muted = v; save('sd.muted', v); }
  setCam(v) { this.camMode = v; save('sd.cam', v); }
  setQuality(v) { this.quality = v; save('sd.quality', v); }
}

export const GameState = new State();

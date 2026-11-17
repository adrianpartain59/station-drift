import { SHIP, HOP } from './Constants.js';

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

class State {
  constructor() {
    this.best = load('sd.best', 0);
    this.bank = load('sd.bank', 0);
    this.muted = load('sd.muted', false);
    this.camMode = load('sd.cam', 'chase');
    this.quality = load('sd.quality', 'high');
    this.reset();
  }

  reset() {
    this.phase = 'title';     // title | playing | paused | over
    this.time = 0;
    this.distance = 0;
    this.score = 0;
    this.coins = 0;
    this.coinCombo = 0;
    this.lastCoinAt = -9;
    this.hull = SHIP.HULL;
    this.thrust = HOP.START;
    this.drifting = false;
    this.driftCharge = 0;
    this.driftTier = -1;
    this.driftPoints = 0;
    this.chain = 0;
    this.lastDriftEnd = -9;
    this.bestDrift = 0;
    this.speed = 0;
    this.zone = 'space';
    this.zoneName = '';
    this.stationsCleared = 0;
  }

  persist() {
    if (this.score > this.best) this.best = Math.floor(this.score);
    save('sd.best', this.best);
    save('sd.bank', this.bank);
  }
  setMuted(v) { this.muted = v; save('sd.muted', v); }
  setCam(v) { this.camMode = v; save('sd.cam', v); }
  setQuality(v) { this.quality = v; save('sd.quality', v); }
}

export const GameState = new State();

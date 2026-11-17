// Singleton pub/sub. Events use domain:action names.
class Bus {
  constructor() { this.map = new Map(); }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) { this.map.get(evt)?.delete(fn); }
  emit(evt, data) { this.map.get(evt)?.forEach((fn) => fn(data)); }
  clear() { this.map.clear(); }
}

export const EventBus = new Bus();

export const Events = {
  GAME_START: 'game:start',
  GAME_OVER: 'game:over',
  GAME_PAUSE: 'game:pause',
  COIN: 'pickup:coin',
  REPAIR: 'pickup:repair',
  PAD: 'pickup:pad',
  CRASH: 'ship:crash',
  SCRAPE: 'ship:scrape',
  NEAR_MISS: 'ship:nearMiss',
  DRIFT_START: 'drift:start',
  DRIFT_TIER: 'drift:tier',
  DRIFT_END: 'drift:end',
  DRIFT_LOST: 'drift:lost',
  HOP: 'ship:hop',
  HOP_FAIL: 'ship:hopFail',
  LAND: 'ship:land',
  ZONE: 'world:zone',
  CAMERA_MODE: 'camera:mode',
};

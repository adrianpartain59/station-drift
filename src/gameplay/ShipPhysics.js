import { SHIP, DRIFT, TRACK, CLOCK } from '../core/Constants.js';
import { cruiseSpeed } from './Pace.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

const K_TIGHT = 1 / DRIFT.R_TIGHT, K_WIDE = 1 / DRIFT.R_WIDE, K_COUNTER = 1 / DRIFT.R_COUNTER;

/**
 * How the ship moves. It lives in the corridor's frame:
 *   s      distance along the centreline          x     offset across it (+ right)
 *   theta  direction of travel relative to the corridor (+ right)
 *   beta   where the nose points relative to the direction of travel (+ right); this is the slide
 *
 * GRIP: left/right asks for a travel angle across the corridor and the ship swings to it as fast as
 * its lateral grip allows (an acceleration, so the turn it can make gets wider with speed). Gentle
 * bends are followed for you; real corners are not.
 *
 * DRIFT (button held): the ship commits to a direction, the tail steps out, and it carries itself
 * round the bend. Left/right only slide it across the corridor. A drift always curves at least a
 * little, so on a straight it creeps toward the inside wall. Letting go snaps it straight and
 * spends the charge as a boost. There is no spin-out and no way to face the wrong way.
 *
 * No three.js, no DOM: the same class drives the game, the autopilot's look-ahead and the node checks.
 */
export class ShipPhysics {
  constructor(track, emit = null) {
    this.track = track;
    this.emit = emit || (() => {});
    this.f = {};
    this.reset();
  }

  reset(s = 6) {
    this.s = s; this.x = 0; this.theta = 0; this.beta = 0;
    this.v = SHIP.START_SPEED;
    this.steer = 0;
    this.drift = false; this.driftDir = 0; this.driftT = 0; this.driftLock = false; this.armed = false;
    this.charge = 0; this.tier = -1; this.driftDist = 0; this.driftPts = 0; this.apex = 0;
    this.exitT = 0; this.exitDir = 0;
    this.boostT = 0; this.boostGain = 0; this.boostTier = -1;
    this.ghost = 0;
    this.touch = 0; this.wallSide = 0; this.scrape = 0;
    this.engineCut = false; this.braking = false;
    this.yawRate = 0; this.k = 0; this.w = 10; this.zone = 1; this.lim = 8;
    this.dist = 0;
  }

  get boosting() { return this.boostT > 0; }
  /** How sideways the ship is, 0..1, for effects and sound. */
  get slide() { return Math.min(1, Math.abs(this.beta) / (DRIFT.SLIP + DRIFT.SLIP_IN)); }

  copy(o) {
    this.s = o.s; this.x = o.x; this.theta = o.theta; this.beta = o.beta; this.v = o.v; this.steer = o.steer;
    this.drift = o.drift; this.driftDir = o.driftDir; this.driftT = o.driftT; this.driftLock = o.driftLock; this.armed = o.armed;
    this.charge = o.charge; this.tier = o.tier; this.driftDist = o.driftDist; this.driftPts = o.driftPts; this.apex = o.apex;
    this.exitT = o.exitT; this.exitDir = o.exitDir;
    this.boostT = o.boostT; this.boostGain = o.boostGain; this.boostTier = o.boostTier; this.ghost = o.ghost;
    this.touch = o.touch; this.wallSide = o.wallSide; this.scrape = o.scrape;
    this.engineCut = o.engineCut; this.braking = o.braking; this.yawRate = o.yawRate;
    this.k = o.k; this.w = o.w; this.zone = o.zone; this.lim = o.lim; this.dist = o.dist;
    return this;
  }

  // ---------- drift state ----------
  /** Which way is the next real bend within `look` metres? +1 right, -1 left, 0 none. */
  bendAhead(look) {
    const K = this.track.K, n = K.length;
    for (let u = 0; u <= look; u += 2) {
      const k = K[Math.min(n - 1, Math.floor(this.s + u))];
      if (Math.abs(k) >= DRIFT.ARM_K) return k > 0 ? -1 : 1;
    }
    return 0;
  }

  startDrift(dir, carry = 0) {
    this.drift = true; this.driftDir = dir; this.driftT = 0; this.armed = false;
    this.charge = carry; this.tier = tierFor(carry);
    if (!carry) { this.driftDist = 0; this.driftPts = 0; }
    this.emit('driftStart', { dir, switched: carry > 0 });
  }

  /** Let go: straighten up and cash the charge in as a boost. */
  endDrift() {
    if (!this.drift) return;
    const tier = this.tier;
    this.drift = false; this.exitT = 0.34; this.exitDir = this.driftDir;
    if (tier >= 0) this.boost(DRIFT.TIERS[tier].time, DRIFT.TIERS[tier].gain, tier);
    this.emit('driftEnd', { tier, points: this.driftPts, dist: this.driftDist, time: this.driftT, boost: tier >= 0 });
    this.charge = 0; this.tier = -1; this.driftPts = 0; this.driftDist = 0;
  }

  /** The drift is knocked out (wall, crash): no boost, and the button must be let go before the next one. */
  loseDrift(why) {
    if (!this.drift) return;
    this.drift = false; this.driftLock = true; this.exitT = 0.2; this.exitDir = this.driftDir;
    this.emit('driftLost', { why, points: this.driftPts, tier: this.tier });
    this.charge = 0; this.tier = -1; this.driftPts = 0; this.driftDist = 0;
  }

  boost(time, gain, tier = 0) {
    if (gain >= this.boostGain || this.boostT <= 0) { this.boostGain = gain; this.boostTier = tier; }
    this.boostT = Math.max(this.boostT, time);
  }

  /** Hit an obstacle. Returns false while still flickering from the last one. */
  crash() {
    if (this.ghost > 0) return false;
    this.loseDrift('crash');
    this.v = Math.max(SHIP.CRASH_MIN, this.v * SHIP.CRASH_KEEP);
    this.boostT = 0; this.boostGain = 0;
    this.theta *= 0.3;
    this.ghost = SHIP.GHOST;
    this.emit('crash', {});
    return true;
  }

  // ---------- one physics step ----------
  step(dt, inp) {
    const T = this.track;
    const f = T.sample(this.s, this.f);
    const zone = f.zone, w = f.w;
    const lim = w - SHIP.RADIUS - (zone === 0 ? SHIP.WALL_INSET : 0);
    // read the bend a hair ahead so the ship leans in as it arrives rather than a frame late
    const k = T.K[Math.min(T.len - 1, Math.floor(this.s + this.v * 0.04))];
    this.k = k; this.w = w; this.zone = zone; this.lim = lim;
    const v = this.v;
    const sdot = (v * Math.cos(this.theta)) / Math.max(0.5, 1 + k * this.x);

    const raw = clamp(inp.steer || 0, -1, 1);
    this.steer += (raw - this.steer) * ease(SHIP.STEER_SMOOTH, dt);
    const steer = this.steer;

    // ---- drift button ----
    const want = !!inp.drift && v > DRIFT.MIN_SPEED && !this.engineCut;
    if (!inp.drift) this.driftLock = false;
    if (!this.drift) {
      this.armed = false;
      if (want && !this.driftLock) {
        // a pressed direction decides; otherwise wait for a bend and go its way
        const dir = Math.abs(raw) > 0.3 ? Math.sign(raw) : this.bendAhead(Math.max(10, v * DRIFT.ARM_LOOK));
        if (dir) this.startDrift(dir); else this.armed = true;
      }
    } else if (!want) {
      this.endDrift();
    } else if (this.driftT > 0.25) {
      // held through an S: when the corridor bends the other way, the drift flips with it
      const kk = T.K[Math.min(T.len - 1, Math.floor(this.s + v * 0.1))];
      if (Math.abs(kk) >= DRIFT.ARM_K && (kk > 0 ? -1 : 1) !== this.driftDir) {
        const carry = this.charge * DRIFT.SWITCH_KEEP;
        this.exitT = 0; this.startDrift(-this.driftDir, Math.max(carry, 1e-4));
      }
    }

    // ---- steering: find the yaw rate (right-positive) of the direction of travel ----
    let om, betaDes;
    if (this.drift) {
      const D = this.driftDir;
      this.driftT += dt;
      const into = steer * D;                       // + = steering to the inside
      const build = smooth(this.driftT / DRIFT.ENTRY);
      const bend = -k * D;                          // how hard the corridor bends the drift's way (1/m)
      const kMin = (into < -0.2 ? lerp(K_WIDE, K_COUNTER, (-into - 0.2) / 0.8) : K_WIDE) * build;
      const kMax = lerp(Math.min(K_TIGHT, SHIP.GRIP / Math.max(v * v, 1)), K_TIGHT, build);
      // wall guard: only ask for an angle the drift could still pull out of before the wall
      const gapIn = lim - D * this.x, gapOut = lim + D * this.x;
      const maxIn = Math.sqrt(2 * SHIP.GUARD * Math.max(0, bend - kMin) * Math.max(0, gapIn - 0.35));
      const maxOut = Math.sqrt(2 * SHIP.GUARD * Math.max(0, kMax - bend) * Math.max(0, gapOut - 0.35));
      const thDes = D * clamp(into * DRIFT.ANGLE, -maxOut, maxIn);
      om = (thDes - this.theta) / DRIFT.TAU - k * sdot;
      om = D * clamp(D * om, v * kMin, v * kMax);
      betaDes = D * (DRIFT.SLIP + DRIFT.SLIP_IN * Math.max(0, into) - DRIFT.SLIP_OUT * Math.max(0, -into));
      if (this.driftT < 0.24) betaDes += D * DRIFT.FLICK * Math.sin((Math.PI * this.driftT) / 0.24);

      // charge: time sliding, faster on the inside line, slower when stretching a slide down a straight
      this.apex = smooth(1 - gapIn / DRIFT.APEX_ZONE) * (bend > DRIFT.ARM_K * 0.8 ? 1 : 0);
      let rate = 1 + DRIFT.CHARGE_APEX * this.apex;
      if (into < -0.2 && bend < DRIFT.ARM_K) rate = lerp(1, DRIFT.CHARGE_COUNTER, (-into - 0.2) / 0.8);
      if (this.touch > 0) rate = 0;
      this.charge += rate * dt;
      const t2 = tierFor(this.charge);
      if (t2 > this.tier) { this.tier = t2; this.emit('tier', { tier: t2 }); }
      this.driftDist += v * dt;
      this.driftPts += v * dt * (1 + 0.5 * (this.tier + 1)) * (1 + 0.6 * this.apex);
    } else {
      const capW = Math.min(SHIP.MAX_YAW, SHIP.GRIP / Math.max(v, 1));
      const capK = capW / Math.max(v, 1);
      const maxR = Math.sqrt(2 * SHIP.GUARD * capK * Math.max(0, lim - this.x - 0.35));
      const maxL = Math.sqrt(2 * SHIP.GUARD * capK * Math.max(0, lim + this.x - 0.35));
      const thDes = clamp(steer * SHIP.STEER_ANGLE, -maxL, maxR);
      if (Math.abs(raw) > 0.05 || Math.abs(steer) > 0.25) {
        om = (thDes - this.theta) / SHIP.STEER_TAU - k * sdot;
      } else {
        // hands off: settle along the corridor on straights and gentle bends; in a real corner, straight on
        const follow = this.exitT > 0 ? 1 : 1 - smooth((Math.abs(k) - SHIP.ASSIST_K) / (SHIP.ASSIST_K_OFF - SHIP.ASSIST_K));
        om = follow * ((thDes - this.theta) / SHIP.ALIGN_TAU - k * sdot);
      }
      om = clamp(om, -capW, capW);
      betaDes = clamp(om * SHIP.NOSE_LEAD, -0.16, 0.16);
      if (this.exitT > 0) { this.exitT -= dt; betaDes -= this.exitDir * 0.1 * Math.sin((Math.PI * Math.max(0, this.exitT)) / 0.34); }
    }
    this.yawRate = om;
    this.beta += (betaDes - this.beta) * ease(this.drift ? DRIFT.SLIP_RATE : 10, dt);

    // ---- move ----
    this.theta = clamp(this.theta + (om + k * sdot) * dt, -1.1, 1.1);
    this.x += v * Math.sin(this.theta) * dt;
    this.s += sdot * dt;
    this.dist += sdot * dt;

    // ---- walls ----
    this.touch = Math.max(0, this.touch - dt);
    if (Math.abs(this.x) > lim) {
      const side = Math.sign(this.x);
      this.x = side * lim;
      const vn = v * Math.sin(this.theta) * side; // speed into the wall
      const soft = zone === 1 ? SHIP.SPACE_SOFT : 1;
      if (vn > SHIP.GRAZE_SPEED) {
        const t = clamp((vn - SHIP.GRAZE_SPEED) / 16, 0, 1);
        this.v *= 1 - (1 - lerp(SHIP.HIT_KEEP[0], SHIP.HIT_KEEP[1], t)) * soft;
        this.theta = -side * SHIP.HIT_BOUNCE * (0.5 + t);
        if (t > 0.35) { this.boostT = 0; this.boostGain = 0; }
        this.loseDrift('wall');
        this.emit('wallHit', { side, vn, soft: zone === 1 });
      } else {
        if (vn > 0) {
          if (this.touch <= 0) { this.v *= 1 - (1 - SHIP.GRAZE_KEEP) * soft; this.emit('graze', { side, vn, soft: zone === 1 }); }
          this.theta = 0;
        }
        this.v -= SHIP.SCRAPE_DRAG * soft * dt;
      }
      this.touch = 0.1; this.wallSide = side; this.scrape += dt;
    } else if (this.touch <= 0) { this.wallSide = 0; this.scrape = 0; }

    // ---- speed ----
    const cruise = cruiseSpeed(this.s);
    this.braking = !!inp.brake && !this.engineCut;
    let target = cruise;
    if (this.boostT > 0) { this.boostT -= dt; target = cruise * (1 + this.boostGain); if (this.boostT <= 0) this.boostGain = 0; }
    else if (this.drift) target = cruise * DRIFT.SPEED;
    if (this.braking) target *= SHIP.BRAKE_FACTOR;
    if (this.engineCut) target = 0;
    const dv = target - this.v;
    if (dv > 0) this.v += Math.min(dv, (this.boostT > 0 ? DRIFT.BOOST_ACCEL : SHIP.ACCEL) * dt);
    else this.v -= Math.min(-dv, (this.engineCut ? CLOCK.COAST_DECEL : this.braking ? SHIP.BRAKE_DECEL : SHIP.COAST) * dt);
    if (this.v < 0) this.v = 0;
    if (this.drift && this.v < DRIFT.MIN_SPEED * 0.8) this.loseDrift('slow');

    if (this.ghost > 0) this.ghost -= dt;
  }

  /** World position and headings for rendering. */
  pose(out) {
    const f = this.track.sample(this.s, this.f);
    out.x = f.x - Math.cos(f.h) * this.x;
    out.z = f.z + Math.sin(f.h) * this.x;
    out.y = TRACK.HOVER;
    out.h = f.h;
    out.travelYaw = f.h - this.theta;            // direction of travel
    out.yaw = f.h - this.theta - this.beta;      // where the nose points
    return out;
  }
}

export function tierFor(charge) {
  let t = -1;
  for (let i = 0; i < DRIFT.TIERS.length; i++) if (charge >= DRIFT.TIERS[i].at) t = i;
  return t;
}

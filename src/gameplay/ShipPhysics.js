import { SHIP, DRIFT, TRACK, HOP } from '../core/Constants.js';
import { EventBus, Events } from '../core/EventBus.js';
import { GameState } from '../core/GameState.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const lerp = (a, b, t) => a + (b - a) * t;
const K_TIGHT = 1 / DRIFT.R_TIGHT, K_NEUTRAL = 1 / DRIFT.R_NEUTRAL, K_WIDE = 1 / DRIFT.R_WIDE;

// Steering inside a drift picks the arc: into the bend tightens it, away widens it, nothing holds a
// medium arc. Interpolated in curvature so the change in radius feels even across the range.
export function driftCurvature(rel) {
  return rel >= 0 ? lerp(K_NEUTRAL, K_TIGHT, rel) : lerp(K_NEUTRAL, K_WIDE, -rel);
}
export function relForCurvature(k) {
  return k >= K_NEUTRAL ? (k - K_NEUTRAL) / (K_TIGHT - K_NEUTRAL) : -(K_NEUTRAL - k) / (K_NEUTRAL - K_WIDE);
}

/**
 * The ship lives in the track's local frame:
 *   s   distance along the centreline     x   lateral offset (+ right)
 *   psi facing relative to the tangent    phi travel direction relative to the tangent (+ right)
 * Grip driving: the nose turns at a steer rate and the travel direction follows it.
 * Drifting (held): the ship commits to an arc of a set radius, and the nose swings in toward the
 * bend by a slip angle and stays there. Steering only tightens or widens the arc, so a held drift
 * is a steady, readable line rather than a spin. On release the nose straightens onto the travel
 * line (not the other way round), so the ship doesn't dart into the inside wall.
 * Corners tighter than grip steering can follow at speed can only be made by drifting.
 */
export class ShipPhysics {
  constructor(track) {
    this.track = track;
    this.f = {};
    this.reset();
  }

  reset(s = 6) {
    this.s = s; this.x = 0; this.psi = 0; this.phi = 0;
    this.v = SHIP.BASE_SPEED * 0.55;
    this.steer = 0; this.drift = false; this.driftDir = 0; this.driftTime = 0;
    this.driftK = 0; this.driftSlip = 0; this.driftTight = 0; this.exitT = 0;
    this.h = 0; this.vh = 0; this.air = false; this.hopHeld = false; this.hopCut = false; this.hopCool = 0;
    this.boostT = 0; this.boosting = false;
    this.wallSide = 0; this.wallT = 0; this.scrape = 0;
    this.invuln = 0; this.slip = 0; this.yawRate = 0; this.hop = 0;
    this.k = 0; this.w = 10; this.zone = 1;
  }

  get boostActive() { return this.boostT > 0; }
  get y() { return TRACK.HOVER + this.h; }

  step(dt, input) {
    const gs = GameState;
    const f = this.track.sample(this.s, this.f);
    this.k = f.k; this.w = f.w; this.zone = f.zone;

    this.steer += (input.steer - this.steer) * ease(SHIP.STEER_SMOOTH, dt);

    // ---- drift state ----
    // ---- hop ----
    const hopPress = input.hop && !this.hopHeld;
    this.hopHeld = !!input.hop;
    if (this.hopCool > 0) this.hopCool -= dt;
    gs.thrust = Math.min(1, gs.thrust + HOP.REGEN * dt);
    if (hopPress && !this.air && this.hopCool <= 0) {
      if (gs.thrust >= HOP.COST) {
        gs.thrust -= HOP.COST;
        if (this.drift) this.endDrift(true); // hopping cashes the drift in; you can't drift in the air
        this.air = true; this.vh = HOP.VEL; this.hopCut = false;
        EventBus.emit(Events.HOP, {});
      } else EventBus.emit(Events.HOP_FAIL, {});
    }
    if (this.air) {
      if (!input.hop && this.vh > 0 && !this.hopCut) { this.vh *= HOP.CUT; this.hopCut = true; } // tap = short hop
      this.vh -= HOP.GRAV * dt;
      this.h += this.vh * dt;
      if (this.h <= 0) {
        EventBus.emit(Events.LAND, { impact: -this.vh });
        this.h = 0; this.vh = 0; this.air = false; this.hopCool = HOP.COOLDOWN;
      }
    }

    if (input.drift && !this.drift && !this.air && this.v > 32 && Math.abs(input.steer) > 0.2) {
      this.drift = true;
      this.driftDir = Math.sign(input.steer);
      this.driftTime = 0;
      this.driftK = K_NEUTRAL * 0.6;   // eases into the arc rather than snapping
      this.driftSlip = Math.abs(this.psi - this.phi);
      this.driftTight = 0;
      this.hop = 1;
      if (gs.time - gs.lastDriftEnd > DRIFT.CHAIN_WINDOW) gs.chain = 0;
      gs.drifting = true; gs.driftCharge = 0; gs.driftTier = -1; gs.driftPoints = 0;
      EventBus.emit(Events.DRIFT_START, { dir: this.driftDir });
    } else if (this.drift && (!input.drift || this.v < 22)) {
      this.endDrift(true);
    }

    // ---- heading ----
    let yaw;
    if (this.drift) {
      this.driftTime += dt;
      const rel = clamp(this.steer * this.driftDir, -1, 1);
      this.driftK += (driftCurvature(rel) - this.driftK) * ease(DRIFT.ARC_SMOOTH, dt);
      this.driftTight = clamp((this.driftK - K_WIDE) / (K_TIGHT - K_WIDE), 0, 1);
      const slipTarget = lerp(DRIFT.SLIP_MIN, DRIFT.SLIP_MAX, this.driftTight);
      this.driftSlip += (slipTarget - this.driftSlip) * ease(DRIFT.SLIP_IN, dt);
      yaw = this.driftDir * this.driftK * this.v;   // the path bends at the chosen radius
      this.phi += yaw * dt;
      this.psi = this.phi + this.driftDir * this.driftSlip;
    } else if (this.exitT > 0) {
      // Just out of a drift: the nose comes back onto the travel line, and both settle along the track.
      this.exitT -= dt;
      yaw = this.steer * SHIP.STEER_RATE;
      this.phi += yaw * dt * 0.6;
      this.psi += (this.phi - this.psi) * ease(DRIFT.EXIT_STRAIGHTEN, dt);
      if (Math.abs(input.steer) < 0.3) { const a = ease(DRIFT.EXIT_ALIGN, dt); this.phi -= this.phi * a; this.psi -= this.psi * a * 0.6; }
    } else {
      yaw = this.steer * SHIP.STEER_RATE * (this.air ? HOP.AIR_STEER : 1);
      this.psi += yaw * dt;
      if (Math.abs(input.steer) < 0.05) this.psi -= (this.psi - this.phi * 0.35) * ease(SHIP.ALIGN_RATE, dt);
      this.phi += (this.psi - this.phi) * ease(SHIP.GRIP, dt);
    }
    this.yawRate = yaw;
    this.psi = clamp(this.psi, -SHIP.MAX_FACING, SHIP.MAX_FACING);
    this.phi = clamp(this.phi, -SHIP.MAX_TRAVEL, SHIP.MAX_TRAVEL);
    this.slip = Math.abs(this.psi - this.phi);

    // ---- speed ----
    const base = Math.min(SHIP.MAX_BASE_SPEED, SHIP.BASE_SPEED + SHIP.SPEED_RAMP * gs.time);
    if (this.boostT > 0) this.boostT -= dt;
    const boost = this.boostActive;
    const target = base * (input.brake ? SHIP.BRAKE_FACTOR : 1) + (boost ? SHIP.BOOST_SPEED : 0);
    const dv = target - this.v;
    this.v += clamp(dv, -SHIP.DECEL * dt, SHIP.ACCEL * (boost ? 2.4 : 1) * dt);
    this.v -= this.v * SHIP.DRIFT_DRAG * Math.min(this.slip, 1) * dt;

    // ---- integrate in the curved frame ----
    const denom = Math.max(0.35, 1 + this.k * this.x);
    const ds = (this.v * Math.cos(this.phi) * dt) / denom;
    this.s += ds;
    this.x += this.v * Math.sin(this.phi) * dt;
    this.psi += this.k * ds;
    this.phi += this.k * ds;

    // ---- walls ----
    this.scrape = 0;
    const lim = this.w - SHIP.RADIUS;
    const side = this.x > lim ? 1 : this.x < -lim ? -1 : 0;
    if (side) {
      const into = Math.max(0, Math.sin(this.phi) * side) * this.v;
      this.x = side * lim;
      if (this.phi * side > 0) this.phi = -this.phi * SHIP.WALL_BOUNCE;
      if (this.psi * side > 0.35) this.psi -= side * 0.8 * dt * 6;
      const soft = this.zone === 1 ? 0.3 : 1;
      if (this.wallSide !== side) {
        // first contact: an impact
        this.v *= 1 - Math.min(0.32, into * 0.006) * soft;
        if (this.invuln <= 0) gs.hull -= into * 0.06 * soft * (this.zone === 1 ? 0 : 1);
        EventBus.emit(Events.SCRAPE, { side, impact: into, soft: this.zone === 1 });
        if (this.drift && into > 14 && this.zone === 0) this.loseDrift();
      }
      this.v = Math.max(20, this.v - SHIP.WALL_DRAG * soft * dt);
      if (this.zone === 0 && this.invuln <= 0) gs.hull -= 1.0 * dt;
      this.scrape = 1;
      this.wallT += dt;
    } else {
      this.wallT = 0;
    }
    this.wallSide = side;

    // ---- drift scoring ----
    if (this.drift) {
      // Charge comes from holding the drift; a tighter arc charges faster. Scraping a wall stalls it.
      if (this.slip > DRIFT.MIN_SLIP && !this.scrape) {
        gs.driftCharge += (DRIFT.CHARGE_BASE + DRIFT.CHARGE_TIGHT * this.driftTight) * dt;
        gs.driftPoints += this.slip * ds * DRIFT.POINTS_RATE * 10;
      }
      let tier = -1;
      for (let i = 0; i < DRIFT.TIERS.length; i++) if (gs.driftCharge >= DRIFT.TIERS[i].at) tier = i;
      if (tier !== gs.driftTier) { gs.driftTier = tier; EventBus.emit(Events.DRIFT_TIER, { tier }); }
    }

    if (this.invuln > 0) this.invuln -= dt;
    this.hop = Math.max(0, this.hop - dt * 4);
    gs.speed = this.v;
    gs.distance = Math.max(gs.distance, this.s);
  }

  endDrift(clean) {
    const gs = GameState;
    if (!this.drift) return;
    this.drift = false;
    gs.drifting = false;
    this.exitT = DRIFT.EXIT_TIME;
    const tier = gs.driftTier;
    const mult = 1 + gs.chain;
    const pts = Math.floor(gs.driftPoints * mult);
    if (clean && tier >= 0) {
      const T = DRIFT.TIERS[tier];
      this.boostT = Math.max(this.boostT, T.boost);
      gs.thrust = Math.min(1, gs.thrust + T.meter);
      gs.chain = Math.min(DRIFT.MAX_CHAIN, gs.chain + 1);
    }
    if (clean && pts > 0) {
      gs.score += pts;
      gs.bestDrift = Math.max(gs.bestDrift, pts);
      gs.lastDriftEnd = gs.time;
    }
    EventBus.emit(Events.DRIFT_END, { points: clean ? pts : 0, tier, mult, boost: clean && tier >= 0 });
    gs.driftCharge = 0; gs.driftTier = -1; gs.driftPoints = 0;
  }

  loseDrift() {
    const gs = GameState;
    if (this.drift || gs.driftPoints > 0) EventBus.emit(Events.DRIFT_LOST, { points: Math.floor(gs.driftPoints) });
    gs.driftPoints = 0; gs.driftCharge = 0; gs.chain = 0;
    if (this.drift) { this.drift = false; gs.drifting = false; gs.driftTier = -1; }
  }

  crash(push) {
    const gs = GameState;
    if (this.invuln > 0) return false;
    gs.hull -= SHIP.CRASH_DAMAGE;
    this.v *= SHIP.CRASH_SPEED_KEEP;
    this.phi += push * 0.5;
    this.psi += push * 0.9;
    this.invuln = SHIP.INVULN;
    this.boostT = 0;
    this.loseDrift();
    return true;
  }

  // Where the ship will be over the next `T` seconds if nothing changes (the drift aim line).
  // Fills out[i] = {s, x}; returns the index of the first point that touches a wall, or -1.
  predict(out, T = 1.1) {
    const n = out.length, dt = T / n, f = this.pf || (this.pf = {});
    let s = this.s, x = this.x, phi = this.phi, hit = -1;
    for (let i = 0; i < n; i++) {
      this.track.sample(s, f);
      if (this.drift) phi += this.driftDir * this.driftK * this.v * dt;
      const ds = (this.v * Math.cos(phi) * dt) / Math.max(0.35, 1 + f.k * x);
      s += ds; x += this.v * Math.sin(phi) * dt; phi += f.k * ds;
      if (hit < 0 && Math.abs(x) > f.w - SHIP.RADIUS) hit = i;
      out[i].s = s; out[i].x = x;
    }
    return hit;
  }

  padBoost() { this.boostT = Math.max(this.boostT, SHIP.PAD_BOOST_TIME); }

  // World position/orientation for rendering.
  pose(out) {
    const f = this.track.sample(this.s, this.f);
    const ch = Math.cos(f.h), sh = Math.sin(f.h);
    out.x = f.x - ch * this.x;
    out.z = f.z + sh * this.x;
    out.y = TRACK.HOVER + this.h + Math.sin(this.hop * Math.PI) * 0.35;
    out.h = f.h;
    out.yaw = f.h - this.psi;           // nose direction
    out.travelYaw = f.h - this.phi;     // velocity direction
    return out;
  }
}

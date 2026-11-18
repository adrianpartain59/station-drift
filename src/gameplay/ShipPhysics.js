import { SHIP, DRIFT, TRACK, CLOCK } from '../core/Constants.js';
import { cruiseSpeed } from './Pace.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };


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
    this.ghost = 0; this.ghostDist = 0;
    this.touch = 0; this.wallSide = 0; this.scrape = 0;
    this.engineCut = false; this.braking = false;
    this.straightT = 0; this.scrub = 0;
    this.psi = 0; this.gripNow = SHIP.MANUAL ? SHIP.MANUAL.GRIP_RATE : 0;   // manual handling: nose angle, live grip
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
    this.boostT = o.boostT; this.boostGain = o.boostGain; this.boostTier = o.boostTier; this.ghost = o.ghost; this.ghostDist = o.ghostDist;
    this.touch = o.touch; this.wallSide = o.wallSide; this.scrape = o.scrape;
    this.engineCut = o.engineCut; this.braking = o.braking; this.yawRate = o.yawRate;
    this.straightT = o.straightT; this.scrub = o.scrub; this.psi = o.psi; this.gripNow = o.gripNow;
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
    this.drift = true; this.driftDir = dir; this.driftT = 0; this.armed = false; this.straightT = 0;
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
    this.theta *= 0.3; this.psi = this.theta;
    this.ghost = SHIP.GHOST; this.ghostDist = SHIP.GHOST_DIST;
    this.emit('crash', {});
    return true;
  }

  // ---------- one physics step ----------
  /**
   * HARD mode: fully manual. Nothing steers for you.
   *   - A steer key turns the NOSE, at a rate that builds while the key is held (a tap is a nudge, a
   *     hold is a turn) and for as long as it is held: there is no angle it stops at, and no bend is
   *     followed for you. Let go and the nose stays where it points.
   *   - The direction of TRAVEL is pulled round to the nose by grip. With grip that is almost
   *     immediate. Hold the drift button and grip lets go: the nose turns exactly as fast as before,
   *     but the ship keeps travelling the old way for a moment and slides wide of the bend.
   *   - Charge builds from real slip in a real bend, so a slide cannot be worked down a straight.
   */
  stepManual(dt, inp) {
    const T = this.track, M = SHIP.MANUAL;
    const f = T.sample(this.s, this.f);
    const zone = f.zone, w = f.w;
    const lim = w - SHIP.RADIUS - (zone === 0 ? SHIP.WALL_INSET : 0);
    const k = T.K[Math.min(T.len - 1, Math.max(0, Math.floor(this.s)))];
    this.k = k; this.w = w; this.zone = zone; this.lim = lim;
    const v = this.v;
    const sdot = (v * Math.cos(this.theta)) / Math.max(0.5, 1 + k * this.x);

    // ---- the nose ----
    const raw = clamp(inp.steer || 0, -1, 1);
    const building = raw !== 0 && Math.sign(raw) === Math.sign(this.steer || raw) && Math.abs(raw) >= Math.abs(this.steer);
    this.steer += (raw - this.steer) * ease(building ? M.STEER_IN : M.STEER_OUT, dt);
    const om = this.steer * M.TURN_RATE;
    this.yawRate = om;

    // ---- drift button: grip lets go ----
    const want = !!inp.drift && v > DRIFT.MIN_SPEED && !this.engineCut;
    if (!inp.drift) this.driftLock = false;
    if (!this.drift && want && !this.driftLock) {
      this.drift = true; this.driftT = 0; this.driftDir = 0;
      this.charge = 0; this.tier = -1; this.driftDist = 0; this.driftPts = 0;
      this.emit('driftStart', { dir: 0, switched: false });
    } else if (this.drift && !want) this.endDrift();
    this.gripNow += ((this.drift ? M.SLIDE_GRIP : M.GRIP_RATE) - this.gripNow) * ease(this.drift ? M.LET_GO : M.HOOK_UP, dt);

    // ---- nose and travel, both measured against the corridor, which turns under the ship at k * sdot ----
    this.psi += (om + k * sdot) * dt;
    let slip = this.psi - this.theta;
    this.theta += (slip * this.gripNow + k * sdot) * dt;
    // on a straight with the keys up, a nose within a degree or two of dead ahead settles dead ahead
    if (raw === 0 && k === 0 && !this.drift && Math.abs(this.psi) < M.DETENT) this.psi *= Math.exp(-M.DETENT_RATE * dt);
    this.psi = clamp(this.psi, -M.MAX_ANGLE, M.MAX_ANGLE);
    this.theta = clamp(this.theta, -M.MAX_ANGLE, M.MAX_ANGLE);
    slip = this.psi - this.theta;
    this.beta = slip;

    // ---- charge: slip, the right way round, in a real bend ----
    if (this.drift) {
      this.driftT += dt;
      const sl = Math.abs(slip), bendDir = k > 0 ? -1 : k < 0 ? 1 : 0;
      if (sl > 0.08) this.driftDir = Math.sign(slip);
      const gapIn = lim - bendDir * this.x;
      this.apex = Math.abs(k) >= DRIFT.ARM_K * 0.8 ? smooth(1 - gapIn / DRIFT.APEX_ZONE) : 0;
      let rate = M.CHARGE_GAIN * clamp((sl - M.CHARGE_SLIP[0]) / (M.CHARGE_SLIP[1] - M.CHARGE_SLIP[0]), 0, 1) * (1 + DRIFT.CHARGE_APEX * this.apex);
      if (Math.abs(k) < DRIFT.ARM_K * 0.5 || Math.sign(slip) !== bendDir) rate *= DRIFT.CHARGE_STRAIGHT;
      if (this.touch > 0) rate = 0;
      this.charge += rate * dt;
      const t2 = tierFor(this.charge);
      if (t2 > this.tier) { this.tier = t2; this.emit('tier', { tier: t2 }); }
      this.driftDist += v * dt;
      this.driftPts += v * dt * (1 + 0.5 * (this.tier + 1)) * (0.3 + 2 * Math.min(sl, 0.6)) * (1 + 0.6 * this.apex);
    }

    // ---- move ----
    this.x += v * Math.sin(this.theta) * dt;
    this.s += sdot * dt;
    this.dist += sdot * dt;

    // ---- walls: a glancing touch slides and pushes the nose round, a square hit bounces ----
    this.touch = Math.max(0, this.touch - dt);
    if (Math.abs(this.x) > lim) {
      const side = Math.sign(this.x);
      this.x = side * lim;
      const vn = v * Math.sin(this.theta) * side;
      const soft = zone === 1 ? SHIP.SPACE_SOFT : 1;
      if (vn > SHIP.GRAZE_SPEED) {
        const t = clamp((vn - SHIP.GRAZE_SPEED) / 16, 0, 1);
        this.v *= 1 - (1 - lerp(SHIP.HIT_KEEP[0], SHIP.HIT_KEEP[1], t)) * soft;
        this.theta = -side * SHIP.HIT_BOUNCE * (0.5 + t);
        this.psi = lerp(this.psi, this.theta, 0.75);       // the hit knocks the nose most of the way round too
        if (t > 0.35) { this.boostT = 0; this.boostGain = 0; }
        this.loseDrift('wall');
        this.emit('wallHit', { side, vn, soft: zone === 1 });
      } else {
        if (vn > 0) {
          if (this.touch <= 0) { this.v *= 1 - (1 - SHIP.GRAZE_KEEP) * soft; this.emit('graze', { side, vn, soft: zone === 1 }); }
          this.theta = 0;
        }
        if (this.psi * side > 0) this.psi -= side * Math.min(this.psi * side, M.WALL_TURN * dt);
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
    if (this.drift) this.v -= M.SLIDE_DRAG * Math.abs(slip) * dt;   // sliding sideways scrubs a little speed
    if (this.v < 0) this.v = 0;
    if (this.drift && this.v < DRIFT.MIN_SPEED * 0.8) this.loseDrift('slow');

    if (this.ghost > 0) {
      this.ghost -= dt; this.ghostDist -= sdot * dt;
      if (this.ghost <= 0 && this.ghostDist > 0) this.ghost = 1e-3;
    }
  }

  step(dt, inp) {
    if (SHIP.MANUAL) return this.stepManual(dt, inp);
    const T = this.track;
    const f = T.sample(this.s, this.f);
    const zone = f.zone, w = f.w;
    const lim = w - SHIP.RADIUS - (zone === 0 ? SHIP.WALL_INSET : 0);
    // read the bend a hair ahead so the ship leans in as it arrives rather than a frame late
    const k = T.K[Math.min(T.len - 1, Math.floor(this.s + this.v * 0.04))];
    this.k = k; this.w = w; this.zone = zone; this.lim = lim;
    const v = this.v;
    // walls closing in (the corridor narrowing): how fast, in metres per metre
    const i0 = Math.min(T.len - 2, Math.max(0, Math.floor(this.s)));
    const closing = Math.max(0, T.W[i0] - T.W[Math.min(T.len - 1, i0 + 2)]) / 2;
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
      const K_TIGHT = 1 / DRIFT.R_TIGHT, K_WIDE = 1 / DRIFT.R_WIDE, K_COUNTER = 1 / DRIFT.R_COUNTER;
      this.driftT += dt;
      const into = steer * D;                       // + = steering to the inside
      const build = smooth(this.driftT / DRIFT.ENTRY);
      const bend = -k * D;                          // how hard the corridor bends the drift's way (1/m)
      // the hook: a slide has to keep curving, but on a straight that only comes in after a moment
      this.straightT = bend < DRIFT.ARM_K * 0.5 ? this.straightT + dt : 0;
      const hook = smooth((this.straightT - DRIFT.HOOK_DELAY) / DRIFT.HOOK_RAMP);
      const kMin = (into < -0.2 ? lerp(K_WIDE, K_COUNTER, (-into - 0.2) / 0.8) : K_WIDE) * build * (bend > 0 ? 1 : hook);
      const kMax = lerp(Math.min(K_TIGHT, SHIP.GRIP / Math.max(v * v, 1)), K_TIGHT, build);
      // wall guard: only ask for an angle the drift could still pull out of before the wall
      const gapIn = lim - D * this.x, gapOut = lim + D * this.x;
      // a slide can only pull away from the inside wall while the corridor is still bending, so the
      // guard looks ahead: if the bend is about to end, it stops closing on the inside now
      const n = T.len - 1;
      const bendSoon = Math.min(bend, -T.K[Math.min(n, Math.floor(this.s + v * 0.22))] * D, -T.K[Math.min(n, Math.floor(this.s + v * 0.44))] * D);
      const away = Math.max(0, bendSoon - K_WIDE), toward = Math.max(0, kMax - bend);
      const maxIn = Math.sqrt(2 * SHIP.GUARD * away * Math.max(0, gapIn - DRIFT.INSIDE_GAP)) - closing;
      const maxOut = Math.sqrt(2 * SHIP.GUARD * toward * Math.max(0, gapOut - 0.35)) - closing;
      const thDes = D * clamp(into * DRIFT.ANGLE, -maxOut, maxIn);
      om = (thDes - this.theta) / DRIFT.TAU - k * sdot;
      // the save: already heading at a wall faster than a gentle correction can stop -> turn as hard as the slide can
      const out = -D * this.theta, inn = D * this.theta;
      if (out > 0 && out * out > 2 * toward * SHIP.SAVE * Math.max(0, gapOut - 0.4)) om = D * v * kMax;
      else if (inn > 0 && inn * inn > 2 * Math.max(1e-4, bend - kMin) * SHIP.SAVE * Math.max(0, gapIn - 0.4)) om = D * v * kMin;
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
      const gapR = lim - this.x, gapL = lim + this.x;
      const maxR = Math.sqrt(2 * SHIP.GUARD * capK * Math.max(0, gapR - 0.35)) - closing;
      const maxL = Math.sqrt(2 * SHIP.GUARD * capK * Math.max(0, gapL - 0.35)) - closing;
      const thDes = clamp(steer * SHIP.STEER_ANGLE, -maxL, maxR);
      const gentle = Math.abs(k) < SHIP.ASSIST_K;
      if (Math.abs(raw) > 0.05 || Math.abs(steer) > 0.25) {
        om = (thDes - this.theta) / SHIP.STEER_TAU - k * sdot;
      } else {
        // hands off: settle along the corridor on straights and gentle bends; a real corner is only half-followed
        const follow = this.exitT > 0 ? 1 : 1 - (1 - SHIP.HANDS_OFF) * smooth((Math.abs(k) - SHIP.ASSIST_K) / (SHIP.ASSIST_K_OFF - SHIP.ASSIST_K));
        om = follow * ((thDes - this.theta) / SHIP.ALIGN_TAU - k * sdot);
      }
      // the save, on straights only: heading at a wall faster than a gentle correction can stop -> full grip away from it
      if (gentle || this.exitT > 0) {
        const th = this.theta;
        if (th > 0 && th * th > 2 * capK * SHIP.SAVE * Math.max(0, gapR - 0.4)) om = -capW;
        else if (th < 0 && th * th > 2 * capK * SHIP.SAVE * Math.max(0, gapL - 0.4)) om = capW;
      }
      // asking for more turn than grip has: the ship runs wide and scrubs speed off, like any car
      const over = Math.abs(om) - capW;
      this.scrub = over > 0 && Math.abs(raw) > 0.05 ? Math.min(1, over / capW) : 0;
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
    if (!this.drift && this.scrub > 0 && this.v > cruise * SHIP.SCRUB_FLOOR) this.v -= SHIP.SCRUB * this.scrub * dt;
    if (this.drift) this.scrub = 0;
    if (this.v < 0) this.v = 0;
    if (this.drift && this.v < DRIFT.MIN_SPEED * 0.8) this.loseDrift('slow');

    if (this.ghost > 0) {
      this.ghost -= dt; this.ghostDist -= sdot * dt;
      if (this.ghost <= 0 && this.ghostDist > 0) this.ghost = 1e-3; // not clear of it yet
    }
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

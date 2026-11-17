import { SHIP, DRIFT, HOP } from '../core/Constants.js';
import { GameState } from '../core/GameState.js';
import { relForCurvature } from './ShipPhysics.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * A pure-pursuit driver for the title-screen attract mode, ?bot=1, and the node fairness test.
 * It aims at a point on its chosen lane some distance ahead, accounting for the bend in between,
 * and drifts whenever the bend is sharper than grip steering can follow.
 */
export class Autopilot {
  constructor(track) { this.track = track; this.f = {}; this.g = {}; this.lane = 0; this.retarget = 0; }

  control(ph, laneCost, t, dt = 1 / 60, hopCheck = null) {
    const T = this.track;
    const here = T.sample(ph.s, this.f);
    const L = clamp(ph.v * 0.42, 16, 48);
    const ahead = T.sample(ph.s + L, this.g);
    const dh = ahead.h - here.h; // positive = bend to the left

    // lane choice: cheap lateral search a few times a second
    this.retarget -= dt;
    if (laneCost && this.retarget <= 0) {
      this.retarget = 0.12;
      let best = this.lane, bestC = Infinity;
      for (let xc = -ahead.w + 1.8; xc <= ahead.w - 1.8; xc += 0.9) {
        const c = laneCost(ph, xc, t) + Math.abs(xc - ph.x) * 0.04 + Math.abs(xc - this.lane) * 0.03;
        if (c < bestC) { bestC = c; best = xc; }
      }
      this.lane = best;
    } else if (!laneCost) {
      // racing line: cut toward the inside of the bend
      this.lane = clamp(-Math.sign(dh) * Math.min(1, Math.abs(dh) * 2) * (ahead.w - 2.5), -ahead.w + 2, ahead.w - 2);
    }

    // The target in the current local frame: the bend moves the centreline sideways by about dh*L/2.
    const lateral = this.lane - ph.x - dh * L * 0.5;
    const phiDes = clamp(Math.atan2(lateral, L) + dh * 0.5, -0.95, 0.95);
    const kAhead = dh / L;
    const ff = -kAhead * ph.v;                       // yaw rate needed to follow the bend
    const yawNeed = ff + (phiDes - ph.phi) * 6;
    const wantDrift = Math.abs(kAhead * ph.v) > SHIP.STEER_RATE * 0.72 || (ph.drift && Math.abs(kAhead * ph.v) > SHIP.STEER_RATE * 0.4);

    let steer;
    let drift = wantDrift;
    this.calm = this.calm || 0;
    if (ph.drift) {
      // pick the arc whose radius gives the bend we need; let go only once the bend has been
      // gentler than the widest arc for a moment (no flickering on and off)
      const kNeed = yawNeed / (ph.driftDir * Math.max(20, ph.v));
      steer = ph.driftDir * clamp(relForCurvature(kNeed), -1, 1);
      this.calm = kNeed < (1 / DRIFT.R_WIDE) * 0.8 ? this.calm + dt : 0;
      drift = ph.driftTime < 0.45 || this.calm < 0.18;
    } else {
      this.calm = 0;
      steer = clamp(yawNeed / SHIP.STEER_RATE, -1, 1);
      if (wantDrift) steer = Math.sign(-kAhead) || 1; // commit to the drift direction on entry
    }
    // hop: hold the key through the climb for a full hop
    if (!ph.air && hopCheck && GameState.thrust >= HOP.COST && hopCheck(ph, t)) this.hopping = true;
    if (ph.air && ph.vh < 0) this.hopping = false;
    return { steer, drift: drift && !this.hopping, hop: !!this.hopping, brake: false };
  }
}

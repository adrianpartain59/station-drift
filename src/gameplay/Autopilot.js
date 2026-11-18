import { SHIP, DRIFT, COURSE } from '../core/Constants.js';
import { ShipPhysics } from './ShipPhysics.js';
import { clearance, halfWidth, halfLength } from './Course.js';

/**
 * A driver that only does what a person at a keyboard can: left / right / nothing, a drift button and
 * a brake, with a delay between deciding and doing, and no knowledge of obstacles it could not see
 * yet. It picks a line by imagining the next two seconds on a copy of the real ship physics for a
 * handful of lanes and taking the one that goes best.
 *
 * Used for the title-screen demo and, in tools/verify, to show the course is drivable at full pace.
 */
export class Autopilot {
  constructor(track, course, opt = {}) {
    this.track = track; this.course = course;
    this.o = { latency: 0.22, tick: 0.1, horizon: 2.0, lanes: 9, dt: 1 / 40, drift: true, brakeForBends: false, coins: true, ...opt };
    this.sim = new ShipPhysics(track, (name) => { if (name === 'wallHit') this.simHits++; else if (name === 'graze') this.simGrazes++; });
    this.target = 0; this.pending = null; this.nextTick = 0;
    this.out = { steer: 0, drift: false, brake: false };
    this.simHits = 0; this.simGrazes = 0;
  }

  /** Is there a real bend within `look` metres (or under the ship)? Returns its direction (+1 right) or 0. */
  bend(s, look) {
    const K = this.track.K, n = K.length;
    for (let u = 0; u <= look; u += 2) {
      const k = K[Math.min(n - 1, Math.max(0, Math.floor(s + u)))];
      if (Math.abs(k) >= DRIFT.ARM_K) return k > 0 ? -1 : 1;
    }
    return 0;
  }

  /** Keys for holding lane `target` from state `p`: what a player does, bang-bang with a little lead. */
  keys(p, target, out) {
    if (SHIP.MANUAL) return this.keysManual(p, target, out);
    const lead = p.x + p.v * Math.sin(p.theta) * (p.drift ? 0.3 : 0.2);
    const err = target - lead;
    const band = p.drift ? 1.1 : 0.7;
    out.steer = err > band ? 1 : err < -band ? -1 : 0;
    const v = p.v;
    if (this.o.drift) {
      const coming = this.bend(p.s, Math.max(8, v * 0.34));
      out.drift = coming !== 0;
      // going into a bend, steer its way so the drift starts when the button goes down
      if (out.drift && !p.drift && out.steer === 0) out.steer = coming;
      out.brake = false;
    } else {
      out.drift = false;
      // no drift: slow to what grip can take round the bend ahead
      const K = this.track.K;
      let kMax = 0;
      for (let u = 0; u <= v * 1.1; u += 3) kMax = Math.max(kMax, Math.abs(K[Math.min(K.length - 1, Math.floor(p.s + u))]));
      out.brake = this.o.brakeForBends && kMax >= SHIP.ASSIST_K && v * v * kMax > SHIP.GRIP * 0.8;
      const here = this.bend(p.s, Math.max(6, v * 0.18));
      if (here && out.steer === 0 && Math.abs(target - p.x) < 2.5) out.steer = here * (p.x * here > target * here + 0.5 ? 0 : 1);
    }
    return out;
  }

  /**
   * Manual handling: the keys turn the nose, so the driver works on where the nose points. Aim the nose
   * at a spot on the wanted lane a little way ahead, allow for the corridor turning under the ship and
   * for the turn already wound on, and press whichever key closes the gap.
   */
  keysManual(p, target, out) {
    const M = SHIP.MANUAL, v = Math.max(p.v, 12), K = this.track.K;
    const at = (u) => K[Math.min(K.length - 1, Math.max(0, Math.floor(p.s + u)))];
    const G = p.gripNow || M.GRIP_RATE;
    // which way the ship should be travelling to come onto its lane a little way ahead
    const want = Math.max(-0.5, Math.min(0.5, Math.atan2(target - p.x, v * (p.drift ? 0.7 : 0.5))));
    // To be carried round a bend the nose has to point inside the line by (bend rate / grip): a little with
    // grip, a lot in a slide. And it has to be there before the bend, so read the corridor that far ahead.
    const lead = Math.min(0.42, 1 / G + 0.08);
    const nose = want - (at(v * lead) * v) / G;
    // where the nose will be in a moment if the keys are left alone (turn already wound on + corridor turning)
    const soon = p.psi + (p.steer * M.TURN_RATE + at(v * 0.05) * v) * 0.09;
    const e = nose - soon;
    out.steer = e > 0.03 ? 1 : e < -0.03 ? -1 : 0;
    if (p.drift) {
      // Sliding, the keys set the drift angle and the ship turns at grip x angle. Work out how fast travel
      // has to come round (the bend, plus getting onto the lane), the angle that gives, and wind the nose
      // in toward it or let it ease back.
      const turn = -at(v * 0.12) * v + (want - p.theta) * 3.2;
      const need = Math.max(-M.MAX_SLIP, Math.min(M.MAX_SLIP, turn / Math.max(0.3, G)));
      const slip = p.psi - p.theta, d = need >= 0 ? 1 : -1;
      out.steer = Math.abs(need) > 0.05 && slip * d < need * d - 0.04 ? d : slip * d > need * d + 0.3 ? -d : 0;
    }
    // the tightest bend in the next second: if the nose cannot be turned that fast at this speed, brake for it
    let kMax = 0, kSign = 0;
    for (let u = 0; u <= v * 0.9; u += 4) { const kk = at(u); if (Math.abs(kk) > kMax) { kMax = Math.abs(kk); kSign = kk > 0 ? -1 : 1; } }
    out.brake = v * kMax > M.TURN_RATE * 0.92;
    // Slide only where a slide can live: bend left to slide round, a bend the slide can carve at this
    // speed with something in hand, and room on the outside for it to break loose into. Once sliding, stay
    // sliding until the bend is nearly done (no dithering), and do not brake for a bend the slide can carve.
    const here = at(0), dir = here > 0 ? -1 : 1, gapOut = p.lim + dir * p.x;
    out.drift = this.o.drift && Math.abs(here) >= DRIFT.ARM_K && Math.abs(at(v * 0.16)) >= DRIFT.ARM_K
      && v * Math.abs(here) < M.SLIDE_GRIP * M.MAX_SLIP * 0.62 && (p.drift || (!out.brake && gapOut > 4));
    if (out.drift) out.brake = false;
    void kSign;
    return out;
  }

  control(ship, t) {
    if (this.pending && t >= this.pending.at) { this.target = this.pending.target; this.pending = null; }
    if (t >= this.nextTick) {
      this.nextTick = t + this.o.tick;
      const best = this.plan(ship);
      if (best !== this.target && !this.pending) this.pending = { at: t + this.o.latency, target: best };
    }
    return this.keys(ship, this.target, this.out);
  }

  /** Obstacles the driver can know about: in plain sight from where the ship is. */
  visible(ship) {
    const O = this.course.obstacles, list = [];
    const far = ship.s + ship.v * this.o.horizon + 30;
    for (let i = this.course.oi; i < O.length; i++) {
      const o = O[i];
      if (o.s > far) break;
      if (o.hit) continue;
      // seen as soon as its end nearest the middle of the corridor is in view (its far end may be buried in a wall)
      if (o.seen === undefined) o.seen = this.course.sightStart(o.s, Math.max(o.x - halfWidth(o), Math.min(o.x + halfWidth(o), 0)));
      if (o.seen <= ship.s) list.push(o);
    }
    return list;
  }

  plan(ship) {
    const o = this.o, sim = this.sim;
    // lanes span the widest the corridor gets within the look-ahead, not just where the ship is now:
    // an opening can lie beyond today's wall if the corridor is about to widen
    let lim = ship.lim;
    if (COURSE.SPANS) for (let u = 20; u <= ship.v * o.horizon; u += 20) lim = Math.max(lim, this.course.lim(ship.s + u));
    const obs = this.visible(ship);
    const coins = this.course.coins;
    const keys = { steer: 0, drift: false, brake: false };
    const dt0 = SHIP.MANUAL ? 1 / 60 : o.dt;
    const steps = Math.round(o.horizon / dt0), lagSteps = Math.round(o.latency / dt0);
    let best = this.target, bestCost = Infinity, stayCost = Infinity, stayHits = false;
    // Manual handling is less forgiving of a look-ahead that is slightly off, so a line has to clear an
    // obstacle by more before it counts as clear, and the look-ahead is stepped finer.
    const manual = !!SHIP.MANUAL, room = manual ? 0.75 : 0.15, dtSim = manual ? 1 / 60 : o.dt;
    for (let li = 0; li < o.lanes; li++) {
      const cand = li === 0 ? this.target : -lim * 0.92 + (2 * lim * 0.92 * (li - 1)) / (o.lanes - 2);
      sim.copy(ship);
      this.simHits = 0; this.simGrazes = 0;
      // changing lanes costs more once there is something ahead to get wrong
      let cost = Math.abs(cand - this.target) * (obs.length ? 0.7 : 0.25) + cand * cand * 0.01, ci = this.course.ci, got = 0, minClear = 9;
      for (let n = 0; n < steps; n++) {
        this.keys(sim, n < lagSteps ? this.target : cand, keys);
        sim.step(dtSim, keys);
        let hit = false;
        for (const ob of obs) {
          if (Math.abs(ob.s - sim.s) > (ob.mover ? halfLength(ob) + 8 : 14)) continue;
          const c = clearance(ob, sim.s, sim.x) - SHIP.RADIUS;
          if (c < room) { hit = true; break; }
          if (c < minClear) minClear = c;
        }
        if (hit) { cost += 4000 * (1.5 - n / steps); if (li === 0) stayHits = true; break; }
        if (o.coins) {
          while (ci < coins.length && coins[ci].s < sim.s - 2.3) ci++;
          if (ci < coins.length && Math.abs(coins[ci].s - sim.s) < 2.3 && Math.abs(coins[ci].x - sim.x) < 2.2 && !coins[ci].taken) { got++; ci++; }
        }
      }
      // room to spare is worth more than coins: a line that only just clears is a line that sometimes does not
      cost += Math.max(0, 2.4 - minClear) * 5 + this.simHits * 400 + this.simGrazes * 60 - got * (obs.length ? 0.4 : 1.2);
      if (li === 0) stayCost = cost;
      if (cost < bestCost - 1e-9) { bestCost = cost; best = cand; }
    }
    // commit: leave the lane you are in only for a clear gain (no dithering between two ways round)
    if (best !== this.target && bestCost > stayCost - 2.5) best = this.target;
    // and with manual handling, never leave a lane that is clear while there is an obstacle close ahead:
    // the way through has been made, crossing in front of it now is how it gets hit
    if (manual && !stayHits && obs.some((ob) => ob.s - ship.s < ship.v * 1.3)) best = this.target;
    return best;
  }
}

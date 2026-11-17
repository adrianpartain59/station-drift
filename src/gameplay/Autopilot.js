import { SHIP, DRIFT } from '../core/Constants.js';
import { ShipPhysics } from './ShipPhysics.js';
import { clearance } from './Course.js';

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
      if (o.seen === undefined) o.seen = this.course.sightStart(o.s, o.x);
      if (o.seen <= ship.s) list.push(o);
    }
    return list;
  }

  plan(ship) {
    const o = this.o, sim = this.sim, lim = ship.lim;
    const obs = this.visible(ship);
    const coins = this.course.coins;
    const keys = { steer: 0, drift: false, brake: false };
    const steps = Math.round(o.horizon / o.dt), lagSteps = Math.round(o.latency / o.dt);
    let best = this.target, bestCost = Infinity;
    for (let li = 0; li < o.lanes; li++) {
      const cand = li === 0 ? this.target : -lim * 0.92 + (2 * lim * 0.92 * (li - 1)) / (o.lanes - 2);
      sim.copy(ship);
      this.simHits = 0; this.simGrazes = 0;
      let cost = Math.abs(cand - this.target) * 0.25 + cand * cand * 0.01, ci = this.course.ci, got = 0;
      for (let n = 0; n < steps; n++) {
        this.keys(sim, n < lagSteps ? this.target : cand, keys);
        sim.step(o.dt, keys);
        let hit = false, tight = 0;
        for (const ob of obs) {
          if (Math.abs(ob.s - sim.s) > 14) continue;
          const c = clearance(ob, sim.s, sim.x) - SHIP.RADIUS;
          if (c < 0.15) { hit = true; break; }
          if (c < 1.2) tight = Math.max(tight, 1.2 - c);
        }
        if (hit) { cost += 4000 * (1.5 - n / steps); break; }
        cost += tight * 0.6;
        if (o.coins) {
          while (ci < coins.length && coins[ci].s < sim.s - 2.3) ci++;
          if (ci < coins.length && Math.abs(coins[ci].s - sim.s) < 2.3 && Math.abs(coins[ci].x - sim.x) < 2.2 && !coins[ci].taken) { got++; ci++; }
        }
      }
      cost += this.simHits * 400 + this.simGrazes * 60 - got * 1.2;
      if (cost < bestCost - 1e-9) { bestCost = cost; best = cand; }
    }
    return best;
  }
}

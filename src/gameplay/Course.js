import { SHIP, SCORE, TRACK, FAIR, COURSE } from '../core/Constants.js';
import { mulberry32 } from '../level/Track.js';
import { topSpeed, parTime, lateralAcc, lateralCap } from './Pace.js';

export { FAIR };

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** Smallest clearance from point (s, x) to an obstacle's surface (negative = inside). */
export function clearance(o, s, x) {
  if (o.shape === 'post') return Math.hypot(s - o.s, x - o.x) - o.r;
  const dx = Math.abs(s - o.s) - o.hl, dy = Math.abs(x - o.x) - o.hw;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

/** Where a sweeping laser's beam is across the corridor at time t. */
export const beamX = (o, t) => o.bx + o.amp * Math.sin(o.om * t + o.ph);

/** Half-width (across the corridor) an obstacle blocks, and its half-length along it. */
export const halfWidth = (o) => (o.shape === 'post' ? o.r : o.hw);
export const halfLength = (o) => (o.shape === 'post' ? o.r : o.hl);

/** Free intervals for the ship's centre across [-lim, lim] given the items of one row. */
export function freeSet(items, lim, pad = FAIR.PAD) {
  const blocked = items.map((o) => [o.x - halfWidth(o) - SHIP.RADIUS - pad, o.x + halfWidth(o) + SHIP.RADIUS + pad]).sort((a, b) => a[0] - b[0]);
  const free = [];
  let at = -lim;
  for (const [a, b] of blocked) {
    if (a > at) free.push([at, Math.min(a, lim)]);
    at = Math.max(at, b);
    if (at >= lim) break;
  }
  if (at < lim) free.push([at, lim]);
  return free.filter(([a, b]) => b - a > 0.2);
}

/**
 * Worst-case seconds for the ship to get itself into one of the `to` openings, starting anywhere in
 * `from` and already sliding sideways as fast as it could be without having doomed itself against a
 * wall. Model: kill the slide, then move over and stop (bang-bang at `acc`, sideways speed capped at
 * the ship's real limit). That is slower than the best possible manoeuvre, so it errs on the safe side.
 */
export function worstTime(from, to, acc, v, lim) {
  const vmax = lateralCap(v);
  const go = (dist) => {
    if (dist <= 0) return 0;
    const tri = 2 * Math.sqrt(dist / acc);
    return (acc * tri) / 2 > vmax ? dist / vmax + vmax / acc : tri;
  };
  let worst = 0;
  for (const [a, b] of from) {
    for (let x = a; x <= b + 1e-6; x += 0.5) {
      for (const dir of [-1, 0, 1]) {
        // fastest it can be sliding that way and still stop short of the wall
        const v0 = dir === 0 ? 0 : Math.min(vmax * FAIR.SLIDE, Math.sqrt(2 * acc * Math.max(0, lim - dir * x)));
        const stop = x + (dir * v0 * v0) / (2 * acc);
        let best = Infinity;
        for (const [c, d] of to) {
          const inside = x >= c && x <= d && stop >= c && stop <= d;
          best = Math.min(best, inside ? 0 : v0 / acc + go(stop < c ? c - stop : stop > d ? stop - d : 0));
        }
        if (best > worst) worst = best;
      }
    }
  }
  return worst;
}

/**
 * Everything on the map the ship can hit, collect or drive through, laid out piece by piece as the
 * track grows. Own random stream, so the map itself is a pure function of the seed.
 */
export class Course {
  constructor(track, seed) {
    this.track = track;
    this.rng = mulberry32(((seed >>> 0) ^ 0x51ed270b) >>> 0);
    this.obstacles = [];   // sorted by s
    this.coins = [];       // sorted by s
    this.pads = [];
    this.gates = [];
    this.signs = [];       // chevron boards on the outside of bends
    this.rows = [];        // { s0, s1, free, y } for the verifier's report and the autopilot's line
    this.pi = 0; this.oid = 0;
    this.span = null;      // hard mode: the straight being collected (see dressSpans)
    this.oi = 0; this.ci = 0; this.pdi = 0; this.gi = 0; // how far the ship has got through each list
    this.lastGate = 0;
    this.prevRow = null;   // last row laid: { end, free, y }
    this.sync();
  }

  r(a = 0, b = 1) { return a + (b - a) * this.rng(); }
  chance(p) { return this.rng() < p; }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  /** Dress any track pieces generated since the last call. */
  sync() {
    const P = this.track.pieces;
    while (this.pi < P.length) this.dress(P[this.pi++]);
  }

  lim(s) {
    const T = this.track, i = clamp(Math.round(s), 0, T.len - 1);
    return T.W[i] - SHIP.RADIUS - (T.ZONE[i] === 0 ? SHIP.WALL_INSET : 0);
  }
  /** Narrowest / widest wall half-width over [a, b]. */
  wRange(a, b) {
    const T = this.track;
    let lo = Infinity, hi = 0;
    for (let i = Math.max(0, Math.floor(a)); i <= Math.min(T.len - 1, Math.ceil(b)); i++) { lo = Math.min(lo, T.W[i]); hi = Math.max(hi, T.W[i]); }
    return [lo, hi];
  }

  // ---------- sight lines ----------
  /**
   * The earliest point on the centreline from which the spot (s, x) is in plain sight: the straight
   * line between them stays inside the station walls all the way. Open space hides nothing.
   */
  sightStart(s, x = 0, maxBack = 420) {
    const T = this.track, i1 = clamp(Math.round(s), 1, T.len - 1);
    const h = T.H[i1], ox = T.X[i1] - Math.cos(h) * x, oz = T.Z[i1] + Math.sin(h) * x;
    let best = i1;
    for (let i0 = i1 - 4; i0 >= Math.max(0, i1 - maxBack); i0 -= 4) {
      const ax = T.X[i0], az = T.Z[i0];
      const dx = ox - ax, dz = oz - az, L = Math.hypot(dx, dz) || 1;
      let ok = true;
      for (let i = i0 + 2; i < i1; i += 2) {
        if (T.ZONE[i] !== 0) continue;
        const off = Math.abs((T.X[i] - ax) * dz - (T.Z[i] - az) * dx) / L; // centreline's distance from the sight line
        if (off > T.W[i] - 0.6) { ok = false; break; }
      }
      if (!ok) break;
      best = i0;
    }
    return best;
  }

  // ---------- play ----------
  /**
   * What the ship touched this step. hooks: crash(o), nearMiss(o), coin(c), pad(p), gate(g, bonusSeconds).
   * crash() should return true if the hit counted (the ship is not still flickering from the last one).
   */
  update(ship, hooks, t = 0) {
    const s = ship.s, x = ship.x;
    const O = this.obstacles;
    while (this.oi < O.length && O[this.oi].s < s - 16) this.oi++;
    for (let i = this.oi; i < O.length; i++) {
      const o = O[i];
      if (o.s > s + 16) break;
      // a sweeping laser only hurts where its beam is right now (the layout and the proof treat its whole sweep as solid)
      const c = (o.kind === 'sweep' ? Math.hypot(s - o.s, x - beamX(o, t)) - 0.3 : clearance(o, s, x)) - SHIP.HIT_RADIUS;
      if (c < 0) { if (!o.hit && ship.ghost <= 0 && hooks.crash(o) !== false) o.hit = true; }
      else if (c < o.near) o.near = c;
      if (!o.passed && s > o.s + halfLength(o) + 1.5) {
        o.passed = true;
        if (!o.hit && ship.ghost <= 0 && o.near < SCORE.NEAR_MISS_DIST) hooks.nearMiss(o);
      }
    }
    const C = this.coins;
    while (this.ci < C.length && C[this.ci].s < s - 4) this.ci++;
    for (let i = this.ci; i < C.length; i++) {
      const c = C[i];
      if (c.s > s + 4) break;
      if (!c.taken && Math.abs(c.s - s) < 2.3 && Math.abs(c.x - x) < 2.3) { c.taken = true; hooks.coin(c); }
    }
    const P = this.pads;
    while (this.pdi < P.length && P[this.pdi].s < s - 8) this.pdi++;
    for (let i = this.pdi; i < P.length; i++) {
      const p = P[i];
      if (p.s > s + 8) break;
      if (!p.used && Math.abs(s - p.s) < p.hl + 0.6 && Math.abs(x - p.x) < p.hw + 0.9) { p.used = true; hooks.pad(p); }
    }
    const G = this.gates;
    while (this.gi < G.length && s >= G[this.gi].s) {
      const g = G[this.gi];
      if (!G[this.gi + 1]) { this.track.ensure(g.s + 1600); this.sync(); }
      g.passed = true;
      hooks.gate(g, this.gateBonus(this.gi));
      this.gi++;
    }
  }

  /** The next gate ahead of the ship, if it has been laid out yet. */
  nextGate() { return this.gates[this.gi] || null; }

  /** Start part-way down the track (test hook): skip everything behind s. */
  skipTo(s) {
    while (this.oi < this.obstacles.length && this.obstacles[this.oi].s < s) this.oi++;
    while (this.ci < this.coins.length && this.coins[this.ci].s < s) this.ci++;
    while (this.pdi < this.pads.length && this.pads[this.pdi].s < s) this.pdi++;
    while (this.gi < this.gates.length && this.gates[this.gi].s < s) { this.gates[this.gi].passed = true; this.gi++; }
  }

  /**
   * Where the corridor has stopped narrowing on the straight that s sits on (the start of the straight
   * if it never narrows). Walls that close in push a ship sideways, so a move can only be counted from here.
   */
  settledStart(s) {
    const W = this.track.W, start = this.straightStart(s);
    // Hard mode counts a widening the same way: an opening that only exists once the walls have moved
    // apart should not have to be reached by skirting the wall as it opens.
    const any = COURSE.SPANS;
    for (let i = clamp(Math.round(s), 1, W.length - 1) - 1; i >= start; i--) if (W[i + 1] < W[i] - 1e-9 || (any && W[i + 1] > W[i] + 1e-9)) return i + 1;
    return start;
  }

  /** Where the straight that s sits on begins. */
  straightStart(s) {
    const K = this.track.K;
    let i = clamp(Math.round(s), 0, K.length - 1);
    while (i > 0 && Math.abs(K[i - 1]) < 1e-6) i--;
    return i;
  }

  // ---------- pieces ----------
  dress(p) {
    if (COURSE.SPANS) return this.dressSpans(p);
    const T = this.track, sec = T.sections[p.sec];
    const d = p.d;
    // gates: at every station door, and inside long stations so the next one is never far
    if (p.type === 'entry') this.gate(p.s0 + 1, 'in', sec);
    else if (p.type === 'space-lead') this.gate(p.s0 + 1, 'out', T.sections[p.sec - 1]);
    else if (sec.type === 'station' && p.s0 - this.lastGate > 520 && ['run', 'hall', 'corner', 'chicane', 'link'].includes(p.type)) this.gate(p.s0 + 2, 'mid', sec);

    // after a bend the ship can be anywhere across the corridor: the next row starts a new set
    if (!['run', 'hall', 'link', 'space-straight'].includes(p.type)) this.prevRow = null;

    switch (p.type) {
      case 'opening': this.coinLine(p.s0 + 40, p.s1 - 10, 0, 0); break;
      case 'entry':
        this.coinLine(p.s0 + 14, p.s1 - 6, 0, 0);
        if (p.s0 > 400 && this.chance(0.4)) this.pad(p.s0 + 26, 0);
        break;
      case 'corner': this.corner(p, d); break;
      case 'chicane': this.chicane(p, d); break;
      case 'run': this.zone(p.s0 + 6, p.s1 - 10, d, 'station'); break;
      case 'hall': this.zone(p.inner0 - 14, p.inner1 + 6, d, 'hall'); break;
      case 'link': break;
      case 'exit': this.coinLine(p.s0 + 8, p.s1 - 4, 0, 0); break;
      case 'space-lead': if (this.chance(0.5)) this.pad(p.s0 + 22, 0); break;
      case 'space-arc': this.coinWave(p.s0 + 6, p.s1 - 6, TRACK.SPACE_W * 0.5, this.r(70, 120)); break;
      case 'space-straight': this.zone(p.s0 + 6, p.s1 - 8, d, 'space'); break;
      case 'funnel': this.coinLine(p.s0 + 44, p.s1 - 8, 0, 0); break;
    }
  }

  // ---------- hard mode: straights are dressed whole, bends can carry a fenced-off lane ----------
  /**
   * Consecutive straight pieces of the same kind are one span, and rows are laid over the whole span
   * once the bend that ends it arrives. That is where the room for more rows comes from: the run-out
   * of one bend, a link and the run-in to the next are a single straight to the ship.
   */
  dressSpans(p) {
    const T = this.track, sec = T.sections[p.sec], d = p.d;
    if (p.type === 'entry') this.gate(p.s0 + 1, 'in', sec);
    else if (p.type === 'space-lead') this.gate(p.s0 + 1, 'out', T.sections[p.sec - 1]);
    else if (sec.type === 'station' && p.s0 - this.lastGate > 520 && ['run', 'hall', 'corner', 'chicane', 'link'].includes(p.type)) this.gate(p.s0 + 2, 'mid', sec);

    const straight = (a, b, kind) => {
      if (this.span && this.span.kind !== kind) this.flushSpan();
      if (!this.span) this.span = { a, b, kind }; else this.span.b = b;
    };
    switch (p.type) {
      case 'opening': this.coinLine(p.s0 + 40, p.s1 - 10, 0, 0); break;
      case 'entry': case 'run': case 'link': case 'exit': straight(p.s0, p.s1, 'station'); break;
      case 'hall': straight(p.inner0 - 14, p.inner1 + 6, 'hall'); break;
      case 'space-lead':
        if (this.chance(0.4)) { this.pad(p.s0 + 22, 0); straight(p.s0 + 46, p.s1, 'space'); } else straight(p.s0, p.s1, 'space');
        break;
      case 'space-straight': straight(p.s0, p.s1, 'space'); break;
      case 'funnel': straight(p.s0, p.s1 - 26, 'space'); break;   // keep the station door itself clear
      case 'corner': {
        const a = p.arcs[0];
        straight(p.s0, a.s0, 'station');
        this.bendHard(a, p, d);
        const pad = p.s1 - a.s1 > 24 && this.chance(0.2);
        if (pad) this.pad(a.s1 + 14, 0);
        straight(pad ? a.s1 + 38 : a.s1, p.s1, 'station');
        break;
      }
      case 'chicane': {
        const [a, b] = p.arcs;
        straight(p.s0, a.s0, 'station');
        this.flushSpan(a.s0 - 6);
        const amp = (arc) => arc.turn * 0.62 * this.lim((arc.s0 + arc.s1) / 2);
        this.coinPath([[a.s0 - 8, 0], [(a.s0 + a.s1) / 2, amp(a)], [(a.s1 + b.s0) / 2, 0], [(b.s0 + b.s1) / 2, amp(b)], [b.s1 + 8, 0]]);
        this.chevrons(a); this.chevrons(b);
        this.prevRow = null;
        straight(b.s1 + 8, p.s1, 'station');
        break;
      }
      case 'space-arc':
        this.flushSpan(p.s0 - 4);
        this.coinWave(p.s0 + 6, p.s1 - 6, TRACK.SPACE_W * 0.5, this.r(70, 120));
        this.prevRow = null;
        break;
    }
    // spans are laid late, so coins from a span and from the bend after it can arrive out of order
    this.coins.sort((q, r) => q.s - r.s);
  }

  /** Lay rows over the pending span, optionally stopping short of `end`. */
  flushSpan(end) {
    const sp = this.span;
    this.span = null;
    if (!sp) return;
    const b = Math.min(sp.b, end ?? sp.b);
    if (b - sp.a > 24) this.zone(sp.a + 4, b - 4, this.track.difficulty((sp.a + b) / 2), sp.kind);
    else if (b - sp.a > 12 && sp.kind !== 'space') this.coinLine(sp.a + 3, b - 3, 0, 0);
  }

  /** A bend in hard mode: sometimes one lane of it is fenced off with lasers, capped just before the bend. */
  bendHard(a, p, d) {
    const want = a.s0 > FAIR.NO_ROWS_BEFORE + 80 && this.chance(lerp(COURSE.BEND_CLOSURE[0], COURSE.BEND_CLOSURE[1], d));
    let closed = null;
    if (want) {
      this.flushSpan(a.s0 - 52);          // keep the run-in clear so the cap can stand fairly
      closed = this.closure(a, d);
    } else this.flushSpan(a.s0 - 6);
    this.chevrons(a);
    if (closed) this.coinPath([[Math.max(p.s0, a.s0 - 34), closed.y], [a.s1 + 4, closed.y], [Math.min(p.s1, a.s1 + 18), 0]]);
    else this.bendLine(a, p.s0, p.s1);
    this.prevRow = null;                  // out of a bend the ship can be anywhere
  }

  /**
   * Fence one side of a bend off: a laser cap from the wall just before the bend (a row like any
   * other, placed only if it is fair there) and a laser fence along its free end right through the
   * bend. The ship has to be in the open lane before the bend and hold it.
   */
  closure(a, d) {
    const R = SHIP.RADIUS, lane = lerp(FAIR.LANE[0], FAIR.LANE[1], d);
    const sCap = a.s0 - 5, end = a.s1 + 5;
    const [wLo, wHi] = this.wRange(sCap - 3, end + 2);
    if (wHi - wLo > 0.02) return null;    // not through a bend that is still changing width
    // Which lane is shut. With manual handling only ever the inside one: a slide runs wide, and wide of
    // an inside fence is the open lane (and beyond it a wall that forgives), never the lasers.
    const pick = this.chance(0.5);
    const side = COURSE.CLOSE_INSIDE || pick ? a.turn : -a.turn;
    const frac = this.r(0.27, 0.4);
    let edge = 0, y = 0;
    const design = (s) => {
      const w = wLo, lim = w - R - SHIP.WALL_INSET;
      const cover = Math.min(frac * 2 * w, w + lim - 2 * lane - R - FAIR.PAD);
      edge = side * (w - cover);
      const far = side * (w + 1.5);
      y = (edge - side * (R + FAIR.PAD) - side * lim) / 2;   // middle of the open lane
      return { items: [{ kind: 'laser', shape: 'box', x: (edge + far) / 2, hl: 0.3, hw: Math.abs(far - edge) / 2, side, ds: 0 }], y, front: 0.3, back: 0.3 };
    };
    const ctx = { b: sCap + 1, d, v: topSpeed(sCap), acc: lerp(FAIR.COMFORT[0], FAIR.COMFORT[1], d) * lateralAcc(topSpeed(sCap)), tSee: lerp(FAIR.SEE[0], FAIR.SEE[1], d) };
    const placed = this.placeAt(design, sCap, ctx);
    if (!placed) return null;
    const add = (o) => this.obstacles.push({ ...o, id: this.oid++, hit: false, near: 99, passed: false });
    add({ ...placed.row.items[0], s: sCap });
    for (let s0 = sCap + 0.3; s0 < end - 0.5; s0 += 10) {
      const len = Math.min(10, end - s0);
      add({ kind: 'fence', shape: 'box', s: s0 + len / 2, x: edge, hl: len / 2, hw: 0.2 });
    }
    this.rows.push({ s: sCap, s0: sCap - 0.3, s1: end, free: placed.free, y, kind: 'bend' });
    this.obstacles.sort((p, q) => p.s - q.s);
    return { y };
  }

  gate(s, kind, sec) {
    this.gates.push({ s, kind, index: this.gates.length, name: sec?.name || '', palette: sec?.palette || null, passed: false });
    this.lastGate = s;
  }

  /** Seconds a gate adds: par time to the next gate. Call once the next gate exists. */
  gateBonus(i) {
    const g = this.gates[i], n = this.gates[i + 1];
    return n ? parTime(g.s, n.s) : 12;
  }

  pad(s, x) { this.pads.push({ s, x, hw: 2.3, hl: 3.2, used: false }); }

  corner(p, d) {
    const a = p.arcs[0];
    this.bendLine(a, p.s0, p.s1);
    this.chevrons(a);
    const outLen = p.s1 - a.s1;
    if (outLen > 24 && this.chance(0.22)) this.pad(a.s1 + 14, 0);
  }

  chicane(p, d) {
    const [a, b] = p.arcs;
    const amp = (arc) => arc.turn * 0.62 * this.lim((arc.s0 + arc.s1) / 2);
    // one flowing line: inside of the first bend, across, inside of the second
    const pts = [[a.s0 - 8, 0], [(a.s0 + a.s1) / 2, amp(a)], [(a.s1 + b.s0) / 2, 0], [(b.s0 + b.s1) / 2, amp(b)], [b.s1 + 8, 0]];
    this.coinPath(pts);
    this.chevrons(a); this.chevrons(b);
  }

  /** Coins along the inside of a bend: the line a held drift takes. */
  bendLine(a, s0, s1) {
    const amp = a.turn * 0.66 * this.lim((a.s0 + a.s1) / 2);
    this.coinPath([[Math.max(s0, a.s0 - 10), 0], [a.s0 + (a.s1 - a.s0) * 0.3, amp * 0.85], [a.s0 + (a.s1 - a.s0) * 0.6, amp], [a.s1, amp * 0.7], [Math.min(s1, a.s1 + 16), 0]]);
  }

  chevrons(a) {
    const angle = Math.abs(a.k) * (a.s1 - a.s0);
    if (angle < 0.4) return;
    const R = 1 / Math.abs(a.k);
    const level = R < 40 ? 2 : R < 56 ? 1 : 0;
    const n = angle > 1 ? 4 : 3;
    for (let i = 0; i < n; i++) this.signs.push({ s: a.s0 + 3 + i * Math.min(9, (a.s1 - a.s0 - 6) / n), side: -a.turn, turn: a.turn, level });
  }

  // ---------- obstacle zones ----------
  /**
   * Lay rows of obstacles over [a, b] (a straight, where the ship can hold any line), each one
   * placed only once the ship has provably had time to see it and reach its opening.
   */
  zone(a, b, d, kind) {
    if (b < FAIR.NO_ROWS_BEFORE) return;
    a = Math.max(a, FAIR.NO_ROWS_BEFORE);
    const ctx = { b, d, v: topSpeed(b), acc: lerp(FAIR.COMFORT[0], FAIR.COMFORT[1], d) * lateralAcc(topSpeed(b)), tSee: lerp(FAIR.SEE[0], FAIR.SEE[1], d) };
    const line = [];
    let n = 0, at = a;
    const maxRows = COURSE.MAX_ROWS;
    // a row laid in the piece before still counts while it is close behind
    if (this.prevRow && a - this.prevRow.end > ctx.v * 2.6) this.prevRow = null;
    const commit = (placed) => {
      const { row, free } = placed;
      for (const it of row.items) this.obstacles.push({ ...it, s: placed.s + (it.ds || 0), id: this.oid++, hit: false, near: 99, passed: false });
      this.rows.push({ s: placed.s, s0: placed.s0, s1: placed.s1, free, y: row.y, kind });
      this.prevRow = { end: placed.s1, free, y: row.y };
      line.push([placed.s, row.y]);
      if (placed.s1 - placed.s > 8) line.push([placed.s1, row.y]); // the lane runs on through a deep set-piece
      at = placed.s1 + FAIR.MIN_GAP;
    };

    while (n < maxRows) {
      const prevY = this.prevRow ? this.prevRow.y : null;
      // the row we would like; if there is no room for it, something lighter that needs less warning
      let placed = this.tryPlace(this.designer(kind, d, prevY, n), at, ctx);
      if (!placed) placed = this.tryPlace(this.designer(kind, d, prevY, n, true), at, ctx);
      if (!placed) break;
      commit(placed);
      n++;
      if (!COURSE.SPANS && kind === 'station' && d < 0.12) break; // the first station keeps its sets short
    }
    this.obstacles.sort((p, q) => p.s - q.s);
    if (line.length) {
      // coins trace the safe line: straight into the first opening, through each one after it
      const pts = [[Math.max(a, line[0][0] - 46), line[0][1]], ...line, [Math.min(COURSE.SPANS ? b : b + 8, line[line.length - 1][0] + 20), line[line.length - 1][1]]];
      this.coinPath(pts);
    } else if (kind === 'space') this.coinWave(a + 4, b - 4, TRACK.SPACE_W * 0.45, this.r(70, 110));
    else if (b - a > 40) this.coinLine(a + 10, b - 10, 0, 0);
  }

  /**
   * Judge a row built for position s: the earliest position at which it would be fair (the ship has
   * provably had time to see it and to reach its opening), and its free set. null = it cannot stand here.
   */
  judge(row, s, ctx) {
    const { b, d, v, acc, tSee } = ctx;
    const prev = this.prevRow;
    const s0 = s - row.front, s1 = s + row.back;
    if (s1 > b) return null;
    // a set-piece never stands where the corridor is changing width
    const [wLo, wHi] = this.wRange(s0 - 1, s1 + 1);
    if (wHi - wLo > 0.02) return { sMin: s + 4 };
    const lim = this.lim(s);
    const free = freeSet(row.items, lim);
    if (!free.length) return null;
    // Where the ship may be coming from. With a row close behind and the walls unchanged since, it came
    // through that row's opening. Otherwise (first of a set, or the corridor has narrowed in between)
    // it can be anywhere across the corridor, sliding either way.
    const settled = this.settledStart(s);
    const fresh = !prev || settled > prev.end;
    const from = fresh ? [[-lim, lim]] : prev.free;
    const react = fresh ? lerp(FAIR.REACT_FIRST[0], FAIR.REACT_FIRST[1], d) : lerp(FAIR.REACT_NEXT[0], FAIR.REACT_NEXT[1], d);
    const move = v * worstTime(from, free, acc, v, lim);
    // in plain sight: the moment every piece of the row can be seen (its end nearest the middle)
    let seen = 0;
    for (const o of row.items) seen = Math.max(seen, this.sightStart(s + (o.ds || 0), clamp(0, o.x - halfWidth(o), o.x + halfWidth(o))));
    let sMin = Math.max(s, seen + v * tSee + row.front);
    if (prev) sMin = Math.max(sMin, prev.end + FAIR.MIN_GAP + row.front);
    if (fresh) {
      // seen, reacted to, and the whole move made on the straight, after any narrowing (never mid-bend)
      sMin = Math.max(sMin, seen + v * react + move + row.front, settled + move + 2 + row.front);
    } else {
      // far enough past the previous row to react and make the move
      sMin = Math.max(sMin, prev.end + v * react + move + row.front);
    }
    return { sMin, s0, s1, free, lim };
  }

  /** Find the first place at or after `at` where the designed row is fair. null if that is past the end of the zone. */
  tryPlace(design, at, ctx) {
    const prev = this.prevRow;
    // widths change along the track and the row is built for where it stands, so settle by iterating
    let s = Math.max(at, prev ? prev.end + FAIR.MIN_GAP : at);
    for (let it = 0; it < 10; it++) {
      const row = design(s, ctx.b);
      if (!row) return null;
      const j = this.judge(row, s, ctx);
      if (!j) return null;
      if (j.sMin > s + 0.5) { s = j.sMin; continue; }
      return { row, s, s0: j.s0, s1: j.s1, free: j.free, lim: j.lim };
    }
    return null;
  }

  /** A row that has to stand at exactly s (the cap of a lane closed through a bend): placed only if it is fair there. */
  placeAt(design, s, ctx) {
    const row = design(s, ctx.b);
    const j = row && this.judge(row, s, ctx);
    return j && j.free && j.sMin <= s + 0.5 ? { row, s, s0: j.s0, s1: j.s1, free: j.free, lim: j.lim } : null;
  }

  /**
   * Picks what the next set-piece is (its random choices fixed here) and returns a function that
   * builds it for a position s in a zone ending at b: { items, y: safe-lane centre, front, back }.
   *
   * A set-piece may run on for a way: parked haulers and bollards down a closed lane behind a
   * barricade, a line of columns. Everything after its front only stands where the front already
   * blocks (its "shadow"), all of it is in sight from the start, and it is laid, checked and
   * proved as one obstacle. So depth adds presence without adding anything new to dodge.
   */
  designer(kind, d, prevY, n, light = false) {
    const lane = lerp(FAIR.LANE[0], FAIR.LANE[1], d);
    const R = SHIP.RADIUS;
    const u = [this.rng(), this.rng(), this.rng(), this.rng(), this.rng(), this.rng(), this.rng(), this.rng()];
    const side0 = prevY == null ? (u[0] < 0.5 ? -1 : 1) : (prevY > 0 ? -1 : 1) * (u[0] < 0.8 ? 1 : -1); // mostly swap sides: a slalom
    const deepWant = light ? 0 : lerp(14, 62, u[6]);     // how far the set-piece would like to run on
    const depth = (s, b, min = 12) => { const room = Math.min(deepWant, b - s - 3); return room >= min ? room : 0; };
    const rr = mulberry32(Math.floor(u[7] * 1e9));

    // ----- lasers (hard mode) -----
    // A beam row is thin, so it takes no room; what it costs the ship is the move to an opening.
    const laserRow = (type) => (s, b) => {
      const [w, wMax] = this.wRange(s - 2, s + 2);
      const lim = this.lim(s), wall = lim + R;      // where the ship's edge can reach
      const out = wMax + 1.5;                        // beams run on into the wall (or past the lane rail in space)
      const beam = (x0, x1, extra = {}) => ({ kind: 'laser', shape: 'box', x: (x0 + x1) / 2, hl: 0.3, hw: (x1 - x0) / 2, ds: 0, ...extra });
      if (type === 'comb') {
        // a wall of light with openings: the more openings, the shorter the move to the nearest
        const open = lane * 0.8 + 0.25, need = 2 * (open + R), sep = 1.6;
        const nMax = Math.max(1, Math.min(3, Math.floor((2 * wall + sep) / (need + sep))));
        const n = light ? nMax : Math.min(nMax, 1 + Math.floor(u[1] * nMax));
        const slot = (2 * wall) / n, slack = Math.max(0, (slot - need - sep) / 2);
        const cs = [];
        for (let i = 0; i < n; i++) cs.push(-wall + slot * (i + 0.5) + slack * (u[2 + i] * 2 - 1));
        const items = [];
        let at = -out;
        for (const c of cs) { if (c - need / 2 - at > 0.4) items.push(beam(at, c - need / 2)); at = c + need / 2; }
        if (out - at > 0.4) items.push(beam(at, out));
        if (!items.length) return null;
        const y = prevY == null ? cs[Math.floor(u[5] * n)] : cs.reduce((p, c) => (Math.abs(c - prevY) < Math.abs(p - prevY) ? c : p));
        return { items, y, front: 0.3, back: 0.3 };
      }
      // the rest grow from one wall and leave the other side open, like a barricade
      const coverMax = Math.min(lerp(0.42, 0.56, d) * 2 * w, w + lim - 2 * lane - R - FAIR.PAD);
      const cover = lerp(Math.min(0.28 * 2 * w, coverMax), coverMax, u[1]);
      const side = side0, edge = side * (w - cover), far = side * out;
      const y = clamp(edge - side * (R + lane * 0.75), -(lim - 0.6), lim - 0.6);
      if (type === 'sweep') {
        // one beam sweeping across the closed side. The layout treats the whole sweep as solid, so the
        // open side is always enough; cutting through behind the beam is a gamble the ship may take.
        const x1 = side * (wall - 0.4), x2 = edge + side * 0.5;
        return { items: [{ kind: 'sweep', shape: 'box', x: (edge + far) / 2, hl: 0.6, hw: Math.abs(far - edge) / 2, ds: 0, side, bx: (x1 + x2) / 2, amp: Math.abs(x1 - x2) / 2, om: lerp(1.5, 2.5, u[2]) * (u[3] < 0.5 ? 1 : -1), ph: u[4] * 6.283 }], y, front: 0.6, back: 0.6 };
      }
      // 'lane': a cap from the wall and a fence along its free end: that lane is shut for a while
      const items = [beam(Math.min(edge, far), Math.max(edge, far), { side })];
      const D = depth(s, b, 14);
      for (let z = 0.3; z < D - 0.5; z += 10) { const len = Math.min(10, D - z); items.push({ kind: 'fence', shape: 'box', x: edge, hl: len / 2, hw: 0.2, ds: z + len / 2 }); }
      return { items, y, front: 0.3, back: Math.max(0.3, D) };
    };
    if (COURSE.LASERS && kind !== 'station' && u[5] < (kind === 'hall' ? 0.45 : 0.4)) return laserRow(light || u[0] < 0.45 ? 'comb' : u[0] < 0.8 ? 'sweep' : 'lane');

    if (kind === 'hall') {
      const pair = !light && u[4] < 0.4;
      return (s, b) => {
        const [w] = this.wRange(s - 4, s + 4), lim = w - R - SHIP.WALL_INSET;
        const r = 1.7, D = depth(s, b, 9);
        const count = 1 + Math.min(3, Math.floor(D / 9.5));   // a line of columns, 9.5 m apart
        const items = [];
        const line = (x) => { for (let i = 0; i < count; i++) items.push({ kind: 'column', shape: 'post', x, r, ds: i * 9.5 }); };
        if (pair) {
          // two lines of columns either side of a centre aisle
          const c = lerp(4.9, 6.1, u[1]);
          line(-c); line(c);
          return { items, y: 0, front: r, back: r + (count - 1) * 9.5 };
        }
        const side = n % 2 === 0 ? side0 : -Math.sign(prevY || side0) || side0;
        const x = side * lerp(2.2, 5.2, u[1]);
        line(x);
        let y = x - side * (r + R + 1.5); // pass on the centre side of the columns
        let back = r + (count - 1) * 9.5;
        if (!light && d > 0.45 && u[2] < 0.25 + d * 0.5) {
          // a stalled hauler against the far wall narrows the way through
          const hx = -side * (lim - 1.2), ds = lerp(0, Math.max(0, back - 5.5), u[3]) + 5.5;
          items.push({ kind: 'hauler', shape: 'box', x: hx, hl: 5.5, hw: 1.7, ds });
          y = (x - side * (r + R) + hx + side * (1.7 + R)) / 2;
          back = Math.max(back, ds + 5.5);
        }
        return { items, y, front: r, back };
      };
    }

    if (kind === 'space') {
      return (s, b) => {
        const lim = this.lim(s);
        const half = lane + 0.9;
        const y = clamp((prevY ?? 0) + (u[1] * 2 - 1) * lerp(5, 9, d), -(lim - half - 0.5), lim - half - 0.5);
        const count = light ? 1 : 1 + Math.floor(u[2] * (1.6 + d * 2.4));
        const items = [];
        const q = mulberry32(Math.floor(u[3] * 1e9));
        const fits = (x, ds, r) => items.every((o) => Math.hypot(o.ds - ds, o.x - x) > o.r + r + 0.6);
        for (let i = 0; i < count; i++) {
          const r = lerp(1.5, 3.3, q());
          // rocks anywhere except across the safe lane
          const sideR = i === 0 ? (y > 0 ? -1 : 1) : q() < 0.5 ? -1 : 1;
          const lo = half + R + r + 0.4;
          const room = (sideR > 0 ? lim + 2 - y : y + lim + 2) - lo;
          if (room < 0.5) continue;
          const x = y + sideR * (lo + q() * Math.min(room, 9)), ds = 7 + lerp(-7, 7, q());
          if (fits(x, ds, r)) items.push({ kind: q() < 0.25 ? 'wreck' : 'rock', shape: 'post', x, r, ds, spin: q() * 6.28 });
        }
        if (!items.length) items.push({ kind: 'rock', shape: 'post', x: y + (y > 0 ? -1 : 1) * (half + R + 2.6), r: 2.2, ds: 7, spin: u[4] * 6 });
        // a trail of smaller rocks strung out behind the big ones, inside their shadows
        const D = depth(s, b, 16), lead = items.slice();
        let back = 14;
        for (let ds = 22; ds <= D + 6 && lead.length; ds += lerp(9, 14, q())) {
          const big = lead[Math.floor(q() * lead.length)], r = big.r * lerp(0.45, 0.8, q());
          const x = big.x + (q() * 2 - 1) * (big.r - r);
          if (fits(x, ds, r)) { items.push({ kind: 'rock', shape: 'post', x, r, ds, spin: q() * 6.28 }); back = ds + r; }
        }
        return { items, y, front: 3.5, back: Math.max(back, 17.5) };
      };
    }

    // ----- station corridors -----
    const types = [];
    const add = (name, wgt) => { if (wgt > 0) types.push([name, wgt]); };
    add('barrier', light ? 0 : 3.4);
    add('island', 2.2);
    add('pylons', 1.6);
    add('gate', light || d < 0.12 ? 0 : 1.2 + d * 1.6);
    add('convoy', light || d < 0.2 ? 0 : 0.8 + d * 1.6);
    if (COURSE.LASERS) { add('comb', 2.6); add('sweep', light ? 0 : 2.4); add('lane', light ? 0 : 1.6); }
    let tot = types.reduce((q, t) => q + t[1], 0), roll = u[5] * tot, type = types[0][0];
    for (const [name, wgt] of types) { roll -= wgt; if (roll <= 0) { type = name; break; } }

    // what stands in a closed lane [lo, hi] over depth D behind a barricade: haulers where they fit, else bollards
    const fill = (items, lo, hi, D, flip) => {
      let k = 0;
      for (let ds = 9; ds + 1 <= D; k++) {
        const wide = hi - lo >= 4.4;
        if (wide && ds + 11 <= D && (k + flip) % 2 === 0) {
          items.push({ kind: 'hauler', shape: 'box', x: lerp(lo + 1.9, hi - 1.9, rr()), hl: 5.5, hw: 1.7, ds: ds + 5.5 });
          ds += 11 + lerp(5, 9, rr());
        } else if (hi - lo >= 1.6) {
          items.push({ kind: 'pylon', shape: 'post', x: lerp(lo + 0.7, hi - 0.7, rr()), r: 0.7, ds });
          ds += lerp(7, 11, rr());
        } else break;
      }
    };
    const backOf = (items, min) => items.reduce((m, o) => Math.max(m, (o.ds || 0) + halfLength(o)), min);

    if (type === 'comb' || type === 'sweep' || type === 'lane') return laserRow(type);

    return (s, b) => {
      const D = depth(s, b, 14);
      const [w, wMax] = this.wRange(s - 2, s + Math.max(6, D));
      const lim = w - R - SHIP.WALL_INSET;
      const wall = w - SHIP.WALL_INSET; // where the ship's edge can reach
      switch (type) {
        case 'barrier': {
          // a roadworks barricade out from one wall, and behind it that lane stays closed for a while
          const coverMax = Math.min(lerp(0.42, 0.56, d) * 2 * w, w + lim - 2 * lane - R - FAIR.PAD);
          const cover = lerp(Math.min(0.28 * 2 * w, coverMax), coverMax, u[1]);
          const side = side0;                       // the wall it grows from
          const edge = side * (w - cover);          // its free end
          const far = side * (wMax + 1.5);          // buried in the wall, so there is never a sliver to squeeze past
          const y = clamp(edge - side * (R + lane * 0.75), -(lim - 0.6), lim - 0.6);
          const items = [{ kind: 'barrier', shape: 'box', x: (edge + far) / 2, hl: 0.6, hw: Math.abs(far - edge) / 2, side, ds: 0 }];
          if (D) fill(items, Math.min(edge, side * wall) + 0.4, Math.max(edge, side * wall) - 0.4, D, 0);
          items[0].deep = items.length > 1 ? backOf(items, 0.6) : 0; // how far the closed lane runs on (for its floor markings)
          return { items, y, front: 0.6, back: backOf(items, 0.6) };
        }
        case 'gate': {
          // barricades from both walls, one opening between them, and the squeeze runs on behind
          const open = lane * 0.85 + 0.3;           // half-opening for the ship's centre
          const span = lim - open - 0.4;
          const c = clamp((prevY ?? 0) + (u[1] * 2 - 1) * lerp(3, 6.5, d), -span, span);
          const le = c - open - R, re = c + open + R;
          const items = [];
          if (le > -wall + 0.8) { items.push({ kind: 'barrier', shape: 'box', x: (le - wMax - 1.5) / 2, hl: 0.6, hw: (le + wMax + 1.5) / 2, side: -1, ds: 0 }); if (D) fill(items, -wall + 0.4, le - 0.4, D * 0.7, 0); }
          if (re < wall - 0.8) { items.push({ kind: 'barrier', shape: 'box', x: (re + wMax + 1.5) / 2, hl: 0.6, hw: (wMax + 1.5 - re) / 2, side: 1, ds: 0 }); if (D) fill(items, re + 0.4, wall - 0.4, D * 0.7, 1); }
          if (!items.length) return null;
          return { items, y: c, front: 0.6, back: backOf(items, 0.6) };
        }
        case 'island': {
          // stalled haulers nose to tail; room on both sides, plenty on one
          const need = Math.max(FAIR.OPEN, 2 * (lane + R) * 0.9);         // the wider side is at least this
          const cMin = Math.max(0, need - wall + 1.7), cMax = Math.max(cMin, wall - 1.7 - 0.6);
          const c = (u[2] < 0.5 ? -1 : 1) * lerp(cMin, cMax, u[1]);
          const side = c > 0 ? -1 : 1;                                    // pass on the wide side
          const y = clamp(c + side * (1.7 + R + lane * 0.7), -(lim - 0.5), lim - 0.5);
          const items = [{ kind: 'hauler', shape: 'box', x: c, hl: 5.5, hw: 1.7, ds: 5.5 }];
          for (let ds = 18.5; ds + 5.5 <= D && items.length < 3; ds += 13) items.push({ kind: 'hauler', shape: 'box', x: c, hl: 5.5, hw: 1.7, ds });
          return { items, y, front: 0, back: backOf(items, 11) };
        }
        case 'convoy': {
          // haulers parked in two of three lanes when the corridor is wide enough, else one
          const laneW = (2 * wall) / 3;
          const sideFree = lim - (1.7 + R + FAIR.PAD);   // free width in a side lane when the middle is blocked
          const two = sideFree >= 2 * lane * 0.95 && u[1] < 0.3 + d * 0.5;
          const openLane = prevY == null ? Math.floor(u[2] * 3) : clamp(Math.round(prevY / laneW) + 1 + (u[2] < 0.5 ? -1 : 1), 0, 2);
          // one hauler: the middle lane only where that still leaves a proper opening beside it
          const midOk = wall - 1.7 >= FAIR.OPEN;
          const blocked = two ? [0, 1, 2].filter((l) => l !== openLane) : [openLane === 1 || !midOk ? (openLane === 0 ? 2 : openLane === 2 ? 0 : u[3] < 0.5 ? 0 : 2) : 1];
          const items = [];
          for (const l of blocked) {
            const first = 5.5 + (two ? Math.abs(l - 1) * lerp(0, 5, u[4]) : 0);
            for (let ds = first, k = 0; k < 3 && (k === 0 || ds + 5.5 <= D); ds += 13, k++) items.push({ kind: 'hauler', shape: 'box', x: (l - 1) * laneW, hl: 5.5, hw: 1.7, ds });
          }
          const y = two ? (openLane === 1 ? 0 : ((openLane - 1) * (lim + 1.7 + R + FAIR.PAD)) / 2) : clamp((openLane - 1) * laneW, -(lim - 0.6), lim - 0.6);
          return { items, y, front: 0, back: backOf(items, 11) };
        }
        default: {
          // bollards scattered clear of the lane
          const y = clamp((prevY ?? 0) + (u[1] * 2 - 1) * lerp(2.5, 5, d), -(lim - lane), lim - lane);
          const q = mulberry32(Math.floor(u[2] * 1e9));
          const count = 2 + Math.floor(u[3] * (1.5 + d * 1.5));
          const items = [];
          for (let i = 0; i < count; i++) {
            const r = 0.7, sideP = i === 0 ? (y > 0 ? -1 : 1) : q() < 0.5 ? -1 : 1;
            const lo = lane + R + r + 0.3;
            const room = (sideP > 0 ? wall - r - y : y + wall - r) - lo;
            if (room < 0) continue;
            const x = y + sideP * (lo + q() * room);
            const ds = lerp(0, 11, q());
            if (items.every((o) => Math.hypot(o.ds - ds, o.x - x) > 3.2)) items.push({ kind: 'pylon', shape: 'post', x, r, ds });
          }
          if (!items.length) return null;
          return { items, y, front: 0.7, back: backOf(items, 6) };
        }
      }
    };
  }

  // ---------- coins ----------
  coinLine(s0, s1, x0, x1) {
    if (s1 - s0 < 6) return;
    for (let s = s0; s <= s1; s += 5.5) this.coins.push({ s, x: lerp(x0, x1, smooth((s - s0) / Math.max(1, s1 - s0))), taken: false });
  }

  /** Coins along a smooth path through [s, x] points. */
  coinPath(pts) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [s0, x0] = pts[i], [s1, x1] = pts[i + 1];
      if (s1 - s0 < 1) continue;
      const n = Math.max(1, Math.round((s1 - s0) / 5.5));
      for (let j = 0; j < n; j++) {
        const t = j / n;
        this.coins.push({ s: lerp(s0, s1, t), x: lerp(x0, x1, smooth(t)), taken: false });
      }
    }
  }

  coinWave(s0, s1, amp, period) {
    const ph = this.r(0, 6.28);
    for (let s = s0; s < s1; s += 5.5) this.coins.push({ s, x: amp * Math.sin(ph + (s * 6.283) / period), taken: false });
  }
}

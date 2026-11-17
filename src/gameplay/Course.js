import { SHIP, SCORE, TRACK } from '../core/Constants.js';
import { mulberry32 } from '../level/Track.js';
import { topSpeed, parTime } from './Pace.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------------
// Fairness rules. Everything the ship can hit is a static box or post. Rows of them are laid
// around a safe line, and the gap between two rows is never shorter than the ship needs, at the
// fastest speed it can have there (cruise + the biggest boost), to see the row, react, and slide
// from the worst place it could be into the opening, using only part of its steering.
// tools/verify re-proves all of this from the outside with its own search.
// ---------------------------------------------------------------------------------------------
export const FAIR = {
  LANE: [3.3, 2.4],        // half-width (ship centre) of the safe lane, difficulty 0 .. 1
  COMFORT: [0.5, 0.68],    // share of lateral grip the layout assumes you use
  REACT_FIRST: [0.62, 0.5],// s to notice the first row of a set
  REACT_NEXT: [0.3, 0.24], // s between rows inside a set (you already saw it coming)
  SEE: [1.5, 1.2],         // s any row must be in plain sight before you reach it
  MIN_GAP: 30,             // m between rows, whatever the maths says
  PAD: 0.35,               // extra clearance around every obstacle when planning the lane
  OPEN: 6.3,               // m: no opening is ever narrower than this (the hull is 2.5 m)
  NO_ROWS_BEFORE: 330,     // m: the first stretch is a warm-up
};

/** Smallest clearance from point (s, x) to an obstacle's surface (negative = inside). */
export function clearance(o, s, x) {
  if (o.shape === 'post') return Math.hypot(s - o.s, x - o.x) - o.r;
  const dx = Math.abs(s - o.s) - o.hl, dy = Math.abs(x - o.x) - o.hw;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

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
  const vmax = v * Math.sin(SHIP.STEER_ANGLE);
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
        const v0 = dir === 0 ? 0 : Math.min(vmax, Math.sqrt(2 * acc * Math.max(0, lim - dir * x)));
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
  update(ship, hooks) {
    const s = ship.s, x = ship.x;
    const O = this.obstacles;
    while (this.oi < O.length && O[this.oi].s < s - 16) this.oi++;
    for (let i = this.oi; i < O.length; i++) {
      const o = O[i];
      if (o.s > s + 16) break;
      const c = clearance(o, s, x) - SHIP.HIT_RADIUS;
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

  /** Where the straight that s sits on begins. */
  straightStart(s) {
    const K = this.track.K;
    let i = clamp(Math.round(s), 0, K.length - 1);
    while (i > 0 && Math.abs(K[i - 1]) < 1e-6) i--;
    return i;
  }

  // ---------- pieces ----------
  dress(p) {
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
    const v = topSpeed(b);
    const acc = lerp(FAIR.COMFORT[0], FAIR.COMFORT[1], d) * SHIP.GRIP;
    const tSee = lerp(FAIR.SEE[0], FAIR.SEE[1], d);
    const line = [];
    let n = 0, at = a;
    const maxRows = kind === 'hall' ? 4 : 5;
    // a row laid in the piece before still counts while it is close behind
    if (this.prevRow && a - this.prevRow.end > v * 2.6) this.prevRow = null;

    while (n < maxRows) {
      const prev = this.prevRow;
      let placed = null;
      // design the row for where it will stand; widths change along the track, so settle by iterating
      let s = Math.max(at, prev ? prev.end + FAIR.MIN_GAP : at);
      const design = this.designer(kind, d, prev ? prev.y : null, n);
      for (let it = 0; it < 6 && !placed; it++) {
        const row = design(s);
        if (!row) break;
        const s0 = s - row.front, s1 = s + row.back;
        if (s1 > b) break;
        const lim = this.lim(s);
        const free = freeSet(row.items, lim);
        if (!free.length) break;
        const from = prev ? prev.free : [[-lim, lim]];
        const react = prev ? lerp(FAIR.REACT_NEXT[0], FAIR.REACT_NEXT[1], d) : lerp(FAIR.REACT_FIRST[0], FAIR.REACT_FIRST[1], d);
        const move = v * worstTime(from, free, acc, v, lim);
        // in plain sight: the moment every piece of the row can be seen (its end nearest the middle)
        let seen = 0;
        for (const it of row.items) seen = Math.max(seen, this.sightStart(s + (it.ds || 0), clamp(0, it.x - halfWidth(it), it.x + halfWidth(it))));
        let sMin = Math.max(s, seen + v * tSee + row.front);
        if (prev) {
          // far enough past the previous row to react and make the move
          sMin = Math.max(sMin, prev.end + Math.max(FAIR.MIN_GAP, v * react + move) + row.front);
        } else {
          // first of a set: seen, reacted to, and the whole move made on the straight (not mid-bend)
          sMin = Math.max(sMin, seen + v * react + move + row.front, this.straightStart(s) + move + 2 + row.front);
        }
        if (sMin > s + 0.5) { s = sMin; continue; }
        placed = { row, s, s0, s1, free, lim };
      }
      if (!placed) break;
      const { row, free } = placed;
      for (const it of row.items) this.obstacles.push({ ...it, s: placed.s + (it.ds || 0), id: this.oid++, hit: false, near: 99, passed: false });
      this.rows.push({ s: placed.s, s0: placed.s0, s1: placed.s1, free, y: row.y, kind });
      this.prevRow = { end: placed.s1, free, y: row.y };
      line.push([placed.s, row.y]);
      at = placed.s1 + FAIR.MIN_GAP;
      n++;
      if (kind === 'station' && d < 0.12 && n >= 2) break; // the first station keeps its sets short
    }
    this.obstacles.sort((p, q) => p.s - q.s);
    if (line.length) {
      // coins trace the safe line: straight into the first opening, through each one after it
      const pts = [[Math.max(a, line[0][0] - 46), line[0][1]], ...line, [Math.min(b + 8, line[line.length - 1][0] + 20), line[line.length - 1][1]]];
      this.coinPath(pts);
    } else if (kind === 'space') this.coinWave(a + 4, b - 4, TRACK.SPACE_W * 0.45, this.r(70, 110));
    else if (b - a > 40) this.coinLine(a + 10, b - 10, 0, 0);
  }

  /**
   * Picks what the next row is (its random choices fixed here) and returns a function that builds
   * it for a given position. A row is { items, y: safe-lane centre, front, back }.
   */
  designer(kind, d, prevY, n) {
    const lane = lerp(FAIR.LANE[0], FAIR.LANE[1], d);
    const R = SHIP.RADIUS;
    const u = [this.rng(), this.rng(), this.rng(), this.rng(), this.rng(), this.rng()];
    const side0 = prevY == null ? (u[0] < 0.5 ? -1 : 1) : (prevY > 0 ? -1 : 1) * (u[0] < 0.8 ? 1 : -1); // mostly swap sides: a slalom

    if (kind === 'hall') {
      return (s) => {
        const [w] = this.wRange(s - 4, s + 4), lim = w - R - SHIP.WALL_INSET;
        const side = n % 2 === 0 ? side0 : -Math.sign(prevY || side0) || side0;
        const r = 1.7, x = side * lerp(2.2, 5.2, u[1]);
        const items = [{ kind: 'column', shape: 'post', x, r }];
        let y = x - side * (r + R + 1.5); // pass on the centre side of the column
        if (d > 0.45 && u[2] < 0.25 + d * 0.5) {
          // a stalled hauler against the far wall narrows the way through
          const hx = -side * (lim - 1.2);
          items.push({ kind: 'hauler', shape: 'box', x: hx, hl: 5.5, hw: 1.7, ds: lerp(-6, 6, u[3]) });
          y = (x - side * (r + R) + hx + side * (1.7 + R)) / 2;
        }
        return { items, y, front: items.length > 1 ? 11.5 : r, back: items.length > 1 ? 11.5 : r };
      };
    }

    if (kind === 'space') {
      return (s) => {
        const lim = this.lim(s);
        const half = lane + 0.9;
        const y = clamp((prevY ?? 0) + (u[1] * 2 - 1) * lerp(5, 9, d), -(lim - half - 0.5), lim - half - 0.5);
        const count = 1 + Math.floor(u[2] * (1.6 + d * 2.4));
        const items = [];
        const rr = mulberry32(Math.floor(u[3] * 1e9));
        for (let i = 0; i < count; i++) {
          const r = lerp(1.5, 3.3, rr());
          // rocks anywhere except across the safe lane
          const sideR = i === 0 ? (y > 0 ? -1 : 1) : rr() < 0.5 ? -1 : 1;
          const lo = half + R + r + 0.4;
          const room = (sideR > 0 ? lim + 2 - y : y + lim + 2) - lo;
          if (room < 0.5) continue;
          const x = y + sideR * (lo + rr() * Math.min(room, 9));
          const big = { kind: rr() < 0.25 ? 'wreck' : 'rock', shape: 'post', x, r, ds: lerp(-7, 7, rr()), spin: rr() * 6.28 };
          if (items.every((o) => Math.hypot((o.ds - big.ds), o.x - x) > o.r + r + 0.6)) items.push(big);
        }
        if (!items.length) items.push({ kind: 'rock', shape: 'post', x: y + (y > 0 ? -1 : 1) * (half + R + 2.6), r: 2.2, ds: 0, spin: u[4] * 6 });
        return { items, y, front: 10.5, back: 10.5 };
      };
    }

    // ----- station corridors -----
    const types = [];
    const add = (name, wgt) => { if (wgt > 0) types.push([name, wgt]); };
    add('barrier', 3.2);
    add('island', 2.2);
    add('pylons', 1.6);
    add('gate', d < 0.12 ? 0 : 1.2 + d * 1.6);
    add('convoy', d < 0.2 ? 0 : 0.8 + d * 1.6);
    let tot = types.reduce((q, t) => q + t[1], 0), roll = u[5] * tot, type = types[0][0];
    for (const [name, wgt] of types) { roll -= wgt; if (roll <= 0) { type = name; break; } }

    return (s) => {
      const depth = type === 'island' || type === 'convoy' ? 6 : 1;
      const [w, wMax] = this.wRange(s - depth, s + depth);
      const lim = w - R - SHIP.WALL_INSET;
      const wall = w - SHIP.WALL_INSET; // where the ship's edge can reach
      switch (type) {
        case 'barrier': {
          // a roadworks barricade out from one wall; the opening is everything on the other side
          const coverMax = Math.min(lerp(0.42, 0.56, d) * 2 * w, w + lim - 2 * lane - R - FAIR.PAD);
          const cover = lerp(Math.min(0.28 * 2 * w, coverMax), coverMax, u[1]);
          const side = side0;                       // the wall it grows from
          const edge = side * (w - cover);          // its free end
          const far = side * (wMax + 1.5);          // buried in the wall, so there is never a sliver to squeeze past
          const y = clamp(edge - side * (R + lane * 0.75), -(lim - 0.6), lim - 0.6);
          return { items: [{ kind: 'barrier', shape: 'box', x: (edge + far) / 2, hl: 0.6, hw: Math.abs(far - edge) / 2, side }], y, front: 0.6, back: 0.6 };
        }
        case 'gate': {
          // barricades from both walls, one opening between them
          const open = lane * 0.85 + 0.3;           // half-opening for the ship's centre
          const span = lim - open - 0.4;
          const c = clamp((prevY ?? 0) + (u[1] * 2 - 1) * lerp(3, 6.5, d), -span, span);
          const le = c - open - R, re = c + open + R;
          const items = [];
          if (le > -wall + 0.8) items.push({ kind: 'barrier', shape: 'box', x: (le - wMax - 1.5) / 2, hl: 0.6, hw: (le + wMax + 1.5) / 2, side: -1 });
          if (re < wall - 0.8) items.push({ kind: 'barrier', shape: 'box', x: (re + wMax + 1.5) / 2, hl: 0.6, hw: (wMax + 1.5 - re) / 2, side: 1 });
          return { items, y: c, front: 0.6, back: 0.6 };
        }
        case 'island': {
          // one stalled hauler; room on both sides
          const need = Math.max(FAIR.OPEN, 2 * (lane + R) * 0.9);         // the wider side is at least this
          const cMin = Math.max(0, need - wall + 1.7), cMax = Math.max(cMin, wall - 1.7 - 0.6);
          const c = (u[2] < 0.5 ? -1 : 1) * lerp(cMin, cMax, u[1]);
          const side = c > 0 ? -1 : 1;                                    // pass on the wide side
          const y = clamp(c + side * (1.7 + R + lane * 0.7), -(lim - 0.5), lim - 0.5);
          return { items: [{ kind: 'hauler', shape: 'box', x: c, hl: 5.5, hw: 1.7 }], y, front: 5.5, back: 5.5 };
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
          const items = blocked.map((l) => ({ kind: 'hauler', shape: 'box', x: (l - 1) * laneW, hl: 5.5, hw: 1.7, ds: two ? (l - 1) * lerp(-3, 3, u[4]) : 0 }));
          const y = two ? (openLane === 1 ? 0 : ((openLane - 1) * (lim + 1.7 + R + FAIR.PAD)) / 2) : clamp((openLane - 1) * laneW, -(lim - 0.6), lim - 0.6);
          return { items, y, front: 9, back: 9 };
        }
        default: {
          // bollards scattered clear of the lane
          const y = clamp((prevY ?? 0) + (u[1] * 2 - 1) * lerp(2.5, 5, d), -(lim - lane), lim - lane);
          const rr = mulberry32(Math.floor(u[2] * 1e9));
          const count = 2 + Math.floor(u[3] * (1.5 + d * 1.5));
          const items = [];
          for (let i = 0; i < count; i++) {
            const r = 0.7, sideP = i === 0 ? (y > 0 ? -1 : 1) : rr() < 0.5 ? -1 : 1;
            const lo = lane + R + r + 0.3;
            const room = (sideP > 0 ? wall - r - y : y + wall - r) - lo;
            if (room < 0) continue;
            const x = y + sideP * (lo + rr() * room);
            const ds = lerp(-5, 5, rr());
            if (items.every((o) => Math.hypot(o.ds - ds, o.x - x) > 3.2)) items.push({ kind: 'pylon', shape: 'post', x, r, ds });
          }
          if (!items.length) return null;
          return { items, y, front: 6, back: 6 };
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

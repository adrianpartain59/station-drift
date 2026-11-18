#!/usr/bin/env node
// Proves that nothing on the course is impossible to get through at the speed the game asks for.
//
//   node tools/verify/passability.mjs [--map skyway|classic] [--mode easy|hard] [--seeds 200] [--from 1] [--km 12] [--no-bots] [--verbose]
//   node tools/verify/passability.mjs --self-test [--shove 45]     (must FAIL: see below)
//
// For every seed it builds the real track and course and runs three independent checks:
//
// 1. SIGHT    Every obstacle is in plain sight (a straight line inside the station walls) for at
//             least MIN_SIGHT seconds before the ship reaches it at top speed, and sits on a straight.
//
// 2. SEARCH   An exhaustive search over the ship's sideways motion, at the FASTEST speed the ship can
//             have there (cruise + the biggest boost), using only ACC of its lateral grip and its real
//             travel-angle limit. For each group of obstacles, starting REACT seconds after the group
//             comes into sight: every state the ship could be in without already being doomed by what
//             it saw earlier (any position across the corridor, any sideways speed) must still have a
//             collision-free way through, with MARGIN metres to spare around the hull. That is a proof
//             with the player's knowledge limited to what is visible, not one made with hindsight.
//
// 3. DRIVE    Two keyboard-limited bots drive the real physics: one flat out, drifting every bend and
//             taking every boost; one that never drifts and brakes for bends. Neither may hit an obstacle,
//             and the flat-out bot may never hit a wall hard. (How far each gets on the clock is reported,
//             not judged: the clock is meant to run out on anyone eventually.)
//
// The search is written here from scratch on purpose: it shares no placement code with Course.js.
//
// On the SKYWAY map three things are added, all on the strict side:
//  - HILLS    a crest hides what is beyond it, so sight is checked in 3D: the line from the pilot's eye
//             to the obstacle has to clear the road wherever it passes over it.
//  - SWEEPERS obstacles may stand on a calm sweeper (no tighter than the map's calmK) instead of a dead
//             straight. The search then gives away the turning the sweeper itself takes (v^2 / R at the
//             inside rail comes off the sideways acceleration, in both directions) and counts time at the
//             inside rail, where the road comes at the ship fastest.
//  - MOVERS   an obstacle that moves is treated as solid over its whole envelope, so nothing relies on
//             timing; and every mover's real motion is sampled to prove it never leaves that envelope.
//  - SPEED    where open air runs faster than the ships (SHIP.AIR_SPEED), each group is searched at the top
//             speed of the stretch it stands on, and neither sight nor room is counted from further back
//             than the point where the ship is down to that speed (the end of the brake field into a
//             ship). The bots are also held to it: neither may ever be going faster than the top speed
//             the course is laid out for at that point.

import { makeTrack, applyGame, MAPS, DEFAULT_MAP, TEST } from '../../src/core/Maps.js';
import { Course, clearance, halfLength, halfWidth, moverParts } from '../../src/gameplay/Course.js';
import { ShipPhysics } from '../../src/gameplay/ShipPhysics.js';
import { Autopilot } from '../../src/gameplay/Autopilot.js';
import { topSpeed, cruiseSpeed, clockAfterGate, lateralAcc, lateralCap } from '../../src/gameplay/Pace.js';
import { SHIP, CLOCK, DRIFT } from '../../src/core/Constants.js';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i < 0 ? def : Number(process.argv[i + 1]); };
const strArg = (name, def) => { const i = process.argv.indexOf('--' + name); return i < 0 ? def : process.argv[i + 1]; };
const flag = (name) => process.argv.includes('--' + name);
const SEEDS = arg('seeds', 200), FROM = arg('from', 1), KM = arg('km', 12), VERBOSE = flag('verbose');
// --self-test: slide every obstacle SHOVE metres back toward the bend before it, which makes the course unfair on
// purpose. The check must then FAIL; if it still passes, the check is not checking anything.
// Movers stand on long calm sweepers with more room in hand than a station's rows have (the layout's own bar for
// them is well above this check's), so the self-test shoves them further: far enough to put them back in, or
// right up against, the bend before. It then has to catch them on every seed, in their own right.
const SELF_TEST = flag('self-test'), SHOVE = arg('shove', 45), SHOVE_AIR = arg('shove-air', 130), BOTS = !flag('no-bots') && !SELF_TEST;
const L = KM * 1000;
const Track = function (seed) { return makeTrack(MAP, seed); };   // `new Track(seed)` below builds the chosen map

// The contract each mode is held to. Hard asks more of the player, and says so.
const MAP = strArg('map', DEFAULT_MAP);
if (!MAPS[MAP]) { console.error('unknown map: ' + MAP); process.exit(2); }
TEST.speed = arg('speed', 1);          // test hook: everything in metres per second multiplied (core/Maps.js)
TEST.air = arg('air', 0);              // test hook: how many times the ships' speed open air runs at (SKYWAY)
const MODE_NAME = applyGame(strArg('mode', 'easy'), MAP);
const AIR = (MAP === 'skyway' && SHIP.AIR_SPEED) || 1;
if (process.env.PACE) CLOCK.PACE = JSON.parse(process.env.PACE);   // tuning aid: try a par-pace table without editing the map
const RULE = {
  easy: {
    ACC: 0.75,        // share of lateral grip the search may use
    REACT: 0.45,      // s between a group coming into sight and the ship starting to respond
    MARGIN: 0.3,      // m of clearance beyond the hull the search insists on
    SLIDE: 1,         // share of its top sideways speed the ship may already have, either way, when a group appears
    MIN_SIGHT: 1.0,   // s any obstacle must be visible before arrival at top speed
    MIN_OPEN: 6.0,    // m: narrowest physical opening allowed anywhere
    GROUP: 14,        // m: obstacles closer than this along the track are one group
  },
  // Hard has manual handling: "grip" here is the stated share of the ship's turn rate (Pace.lateralAcc), and the
  // sideways speed covered is that of a nose pointing up to SHIP.MANUAL.FAIR_ANGLE off the corridor, either way.
  hard: { ACC: 0.9, REACT: 0.45, MARGIN: 0.2, SLIDE: 1, MIN_SIGHT: 0.9, MIN_OPEN: 5.0, GROUP: 14 },
}[MODE_NAME];

// ---------------------------------------------------------------------------------------------
// geometry helpers (independent of Course.js)
// ---------------------------------------------------------------------------------------------
function limAt(T, s) { const i = Math.max(0, Math.min(T.len - 1, Math.round(s))); return T.W[i] - SHIP.RADIUS - (T.ZONE[i] === 0 ? SHIP.WALL_INSET : 0); }
function world(T, s, x) { const i = Math.max(0, Math.min(T.len - 1, Math.round(s))); const h = T.H[i]; return [T.X[i] - Math.cos(h) * x, T.Z[i] + Math.sin(h) * x]; }

/** Earliest centreline point that can see (s, x): march along the sight line and test each sample against the walls. */
const EYE = 3.0, TARGET = 2.0, CLEAR_ROAD = 0.25;   // m above the floor: the pilot's eye, the spot to be seen, the least the line may clear the road by
function sightStart(T, s, x) {
  const [ox, oz] = world(T, s, x);
  const i1 = Math.round(s);
  const hilly = T.map === 'skyway', oy = T.Y[Math.max(0, Math.min(T.len - 1, i1))] + TARGET;
  let best = i1;
  for (let i0 = i1 - 3; i0 >= Math.max(0, i1 - 450); i0 -= 3) {
    const ax = T.X[i0], az = T.Z[i0];
    const len = Math.hypot(ox - ax, oz - az);
    let ok = true, guess = i0;
    for (let d = 1.5; d < len - 1; d += 1.5) {
      const px = ax + ((ox - ax) * d) / len, pz = az + ((oz - az) * d) / len;
      // nearest centreline sample to this point, searching forward from the last one
      let bi = guess, bd = Infinity;
      for (let i = guess; i <= Math.min(i1, guess + 12); i++) { const q = (T.X[i] - px) ** 2 + (T.Z[i] - pz) ** 2; if (q < bd) { bd = q; bi = i; } }
      guess = bi;
      if (T.ZONE[bi] === 0 && Math.sqrt(bd) > T.W[bi] - 0.5) { ok = false; break; }
      // hills: where the line passes over the road, it has to be above it
      if (hilly && Math.sqrt(bd) <= T.W[bi] + 2 && T.Y[bi] + CLEAR_ROAD > T.Y[i0] + EYE + ((oy - T.Y[i0] - EYE) * d) / len) { ok = false; break; }
    }
    if (!ok) break;
    best = i0;
  }
  return best;
}

// Where something may stand: a dead straight (classic), or on SKYWAY anything no tighter than the map's calm limit.
const calmOf = (T) => T.calmK || 1e-6;
/** Where the stretch reaching s begins over which the ship can never be going faster than v. 0 where speed never drops (every map but SKYWAY with fast open air). */
function speedStart(T, s, v) {
  if (!T.F) return 0;
  let i = Math.max(0, Math.min(T.len - 1, Math.round(s)));
  while (i > 0 && topSpeed(i - 1, T) <= v + 1e-6) i--;
  return i;
}
function straightStart(T, s) { const c = calmOf(T); let i = Math.round(s); while (i > 0 && (T.calmK ? Math.abs(T.K[i - 1]) <= c : Math.abs(T.K[i - 1]) < c)) i--; return i; }
/**
 * The tightest calm sweeper over [a, b], and the widest the ship's room there. Only calm road counts: a
 * laser fence that runs on through a real bend (hard mode) is searched as it always was, as a lane to be held.
 */
function bendOver(T, a, b) {
  const c = calmOf(T);
  let k = 0, lim = 0;
  for (let i = Math.max(0, Math.floor(a)); i <= Math.min(T.len - 1, Math.ceil(b)); i++) {
    const q = Math.abs(T.K[i]);
    if (q <= c) { k = Math.max(k, q); lim = Math.max(lim, limAt(T, i)); }
  }
  return { k, lim };
}

// ---------------------------------------------------------------------------------------------
// the search: which (x, sideways speed) states at sFrom have a safe way to sTo?
// Lattice chosen so the motion is exact: time step dt, sideways speed in units of A*dt, position in
// units of A*dt^2/2, control in {-A, 0, +A}. Every lattice path is a path the real ship could take
// with no more than A, so a "yes" here is never optimistic.
// ---------------------------------------------------------------------------------------------
function winning(T, obstacles, sFrom, sTo, v) {
  // On a sweeper the ship has to spend some of its turning just to stay on the road: v^2 / R, most at the
  // inside rail. That comes off what it has for moving sideways, either way; and the road is taken at the
  // inside rail's closing speed, the fastest there is. On a straight both corrections are exactly nothing.
  const bend = bendOver(T, sFrom, sTo);
  const vs = v / (1 - bend.k * bend.lim);
  const A = RULE.ACC * lateralAcc(v) - bend.k * v * vs;
  if (!(A > 1)) return null;
  // Time step chosen so the fastest sideways speed is a whole number of lattice steps: the search then
  // reaches exactly that speed and never more (a step no longer than 4 m of track).
  const cap = lateralCap(v);
  const J = Math.max(2, Math.ceil(cap / (A * (4 / vs))));
  const dt = cap / (J * A), DS = vs * dt;
  const vyStep = A * dt, xStep = (A * dt * dt) / 2;
  const nJ = 2 * J + 1;
  const limMax = T.map === 'skyway' ? 33 : 16;
  const I = Math.ceil(limMax / xStep), nI = 2 * I + 1;
  const n = Math.max(1, Math.ceil((sTo - sFrom) / DS));
  const SUB = 8;
  const R = SHIP.RADIUS + RULE.MARGIN;
  // blocked[k][i]: is lattice position i hit at sub-sample k (k = 0 .. n*SUB)
  const total = n * SUB + 1;
  const blocked = new Uint8Array(total * nI);
  for (let k = 0; k < total; k++) {
    const s = sFrom + (k / SUB) * DS;
    const lim = limAt(T, s);
    const near = obstacles.filter((o) => Math.abs(o.s - s) <= halfLength(o) + R + 0.1);
    for (let i = 0; i < nI; i++) {
      const x = (i - I) * xStep;
      let b = Math.abs(x) > lim;
      if (!b) for (const o of near) if (clearance(o, s, x) < R) { b = true; break; }
      blocked[k * nI + i] = b ? 1 : 0;
    }
  }
  // terminal: not in a wall, and able to stop sliding before reaching one
  let cur = new Uint8Array(nI * nJ), nxt = new Uint8Array(nI * nJ);
  const limEnd = limAt(T, sFrom + n * DS);
  for (let i = 0; i < nI; i++) for (let j = 0; j < nJ; j++) {
    const x = (i - I) * xStep, vy = (j - J) * vyStep;
    const stop = x + (Math.sign(vy) * vy * vy) / (2 * A);
    cur[i * nJ + j] = !blocked[(total - 1) * nI + i] && Math.abs(stop) <= limEnd ? 1 : 0;
  }
  for (let step = n - 1; step >= 0; step--) {
    nxt.fill(0);
    for (let i = 0; i < nI; i++) {
      if (blocked[step * SUB * nI + i]) continue;
      for (let j = 0; j < nJ; j++) {
        let ok = 0;
        for (let dj = -1; dj <= 1 && !ok; dj++) {
          const j2 = j + dj;
          if (j2 < 0 || j2 >= nJ) continue;
          const di = (j - J) + (j2 - J);          // exact: x' = x + (vy + vy')/2 * dt
          const i2 = i + di;
          if (i2 < 0 || i2 >= nI || !cur[i2 * nJ + j2]) continue;
          let clear = 1;
          for (let q = 1; q <= SUB; q++) {
            const ii = Math.round(i + (di * q) / SUB);
            if (blocked[(step * SUB + q) * nI + ii]) { clear = 0; break; }
          }
          ok = clear;
        }
        nxt[i * nJ + j] = ok;
      }
    }
    [cur, nxt] = [nxt, cur];
  }
  return { set: cur, I, J, nI, nJ, xStep, vyStep };
}

// ---------------------------------------------------------------------------------------------
function checkSeed(seed) {
  const T = new Track(seed); T.ensure(L + 800);
  const C = new Course(T, seed);
  const out = { seed, fails: [], groups: 0, minSight: 99, minOpen: 99, searchStates: 0, obstacles: 0, rowsPerKm: 0, movers: 0, airGroups: 0, airFails: 0, shipFails: 0 };
  if (SELF_TEST) { for (const o of C.obstacles) o.s -= o.mover ? SHOVE_AIR : SHOVE; C.obstacles.sort((p, q) => p.s - q.s); }
  const obs = C.obstacles.filter((o) => o.s < L);
  out.obstacles = obs.length;

  // group obstacles that stand together
  const groups = [];
  for (const o of obs) {
    const a = o.s - halfLength(o), b = o.s + halfLength(o);
    const g = groups[groups.length - 1];
    if (g && a - g.s1 < RULE.GROUP) { g.items.push(o); g.s1 = Math.max(g.s1, b); g.s0 = Math.min(g.s0, a); }
    else groups.push({ items: [o], s0: a, s1: b });
  }
  out.groups = groups.length;
  out.rowsPerKm = groups.length / KM;

  // --- 0. movers: the envelope the proof treats as solid really does contain the motion ---
  for (const o of obs) {
    if (!o.mover) continue;
    out.movers++;
    let worst = 0;
    for (let t = 0; t < 45 && worst <= 1e-6; t += 1 / 40) {
      for (const p of moverParts(o, t)) {
        const pts = p.hl !== undefined ? [[p.s - p.hl, p.x - p.hw], [p.s + p.hl, p.x - p.hw], [p.s - p.hl, p.x + p.hw], [p.s + p.hl, p.x + p.hw]] : p.s2 !== undefined ? [[p.s, p.x], [p.s2, p.x2]] : [[p.s, p.x]];
        for (const [ps, px] of pts) worst = Math.max(worst, clearance(o, ps, px) + (p.r || 0));
      }
    }
    if (worst > 1e-6) out.fails.push(`seed ${seed} s=${o.s.toFixed(0)} ${o.kind}: moves ${worst.toFixed(2)} m outside the envelope the proof treats as solid`);
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const v = topSpeed(g.s1, T);
    const inAir = g.items.some((o) => o.mover), failsBefore = out.fails.length;
    if (inAir) out.airGroups++;
    g.tally = () => { if (out.fails.length > failsBefore) { if (inAir) out.airFails++; else out.shipFails++; } };
    // --- 1. sight, straights, openings ---
    let seen = 0;
    for (const o of g.items) {
      // A laser fence runs on from a cap that is itself a row in plain sight; it asks for no new decision,
      // only that the lane already chosen is held, so it is not required to be visible in advance.
      if (o.kind === 'fence') continue;
      const tip = Math.max(o.x - halfWidth(o), Math.min(o.x + halfWidth(o), 0));
      seen = Math.max(seen, sightStart(T, o.s, tip));
      for (let i = Math.floor(o.s - halfLength(o) - 2); i <= Math.ceil(o.s + halfLength(o) + 2); i++) {
        if (Math.abs(T.K[i]) > calmOf(T)) { out.fails.push(`seed ${seed} s=${o.s.toFixed(0)} ${o.kind}: stands in a bend`); break; }
      }
    }
    // closing speed: on a sweeper, the inside rail's (see winning()); on a straight, v itself
    const road = bendOver(T, straightStart(T, g.s0), g.s1);
    const vs = v / (1 - road.k * road.lim);
    // sight and room only count from where the ship is down to this group's speed
    seen = Math.max(seen, speedStart(T, g.s0, v));
    const sightT = (g.s0 - seen) / vs;
    out.minSight = Math.min(out.minSight, sightT);
    if (sightT < RULE.MIN_SIGHT) out.fails.push(`seed ${seed} s=${g.s0.toFixed(0)}: in sight for only ${sightT.toFixed(2)} s at top speed`);
    // widest physical opening across the group, at every metre of its length
    for (let s = Math.ceil(g.s0); s <= g.s1; s++) {
      const i = Math.round(s), wall = T.W[i] - (T.ZONE[i] === 0 ? SHIP.WALL_INSET : 0);
      const cut = g.items.filter((o) => Math.abs(o.s - s) <= halfLength(o)).map((o) => {
        const h = o.shape === 'post' ? Math.sqrt(Math.max(0, o.r * o.r - (s - o.s) ** 2)) : o.hw;
        return [o.x - h, o.x + h];
      }).sort((p, q) => p[0] - q[0]);
      let at = -wall, widest = 0;
      for (const [a, b] of cut) { widest = Math.max(widest, Math.min(a, wall) - at); at = Math.max(at, b); }
      widest = Math.max(widest, wall - at);
      out.minOpen = Math.min(out.minOpen, widest);
      if (widest < RULE.MIN_OPEN) { out.fails.push(`seed ${seed} s=${s}: widest opening only ${widest.toFixed(2)} m`); break; }
    }

    // --- 2. search ---
    const enter = Math.max(seen + vs * RULE.REACT, straightStart(T, g.s0));
    if (enter >= g.s0 - 1) { out.fails.push(`seed ${seed} s=${g.s0.toFixed(0)}: no room to respond after it comes into sight`); g.tally(); continue; }
    const earlier = [];
    for (let q = gi - 1; q >= 0 && groups[q].s1 > enter - 20; q--) for (const o of groups[q].items) if (o.s + halfLength(o) > enter - 3) earlier.push(o);
    const sTo = Math.max(g.s1, ...earlier.map((o) => o.s + halfLength(o))) + 3;
    const before = winning(T, earlier, enter, sTo, v);
    const after = winning(T, earlier.concat(g.items), enter, sTo, v);
    if (!before || !after) { out.fails.push(`seed ${seed} s=${g.s0.toFixed(0)}: the road bends too hard here for anything to stand on it`); g.tally(); continue; }
    out.searchStates += before.set.length;
    let bad = null;
    const jMax = Math.floor(before.J * RULE.SLIDE + 1e-9);
    for (let q = 0; q < before.set.length; q++) {
      if (Math.abs((q % before.nJ) - before.J) > jMax) continue; // sliding faster than the contract covers
      if (before.set[q] && !after.set[q]) { bad = q; break; }
    }
    if (bad !== null) {
      const i = Math.floor(bad / before.nJ), j = bad % before.nJ;
      out.fails.push(`seed ${seed} s=${g.s0.toFixed(0)} (${g.items.map((o) => o.kind).join('+')}): no way through from x=${((i - before.I) * before.xStep).toFixed(1)} m, sideways ${((j - before.J) * before.vyStep).toFixed(1)} m/s, ${(g.s0 - enter).toFixed(0)} m out at ${v.toFixed(0)} m/s`);
    }
    g.tally();
  }

  // --- 3. drive ---
  if (BOTS) {
    for (const mode of ['pace', 'grip']) {
      const T2 = new Track(seed); T2.ensure(L + 1500);
      const C2 = new Course(T2, seed);
      const st = { crash: 0, wall: 0, graze: 0, drifts: 0, tiers: [0, 0, 0, 0], lost: 0, coins: 0, near: 0, minClock: 99, time: 0, outOfTime: null };
      let clock = CLOCK.START, t = 0;
      const p = new ShipPhysics(T2, (name, d) => {
        // easy: the flat-out bot may not even touch a wall hard. Hard has a slide that is meant to run wide: reported, not judged
        if (name === 'wallHit') { st.wall++; if (mode === 'pace' && !SHIP.MANUAL) out.fails.push(`seed ${seed} pace bot: hard wall hit at s=${p.s.toFixed(0)}`); }
        else if (name === 'graze') st.graze++;
        else if (name === 'driftEnd') { st.drifts++; st.tiers[d.tier + 1]++; if (d.tier >= 0 && clock > 0) clock += DRIFT.TIERS[d.tier].clock; }
        else if (name === 'driftLost') st.lost++;
      });
      const bot = new Autopilot(T2, C2, mode === 'grip' ? { drift: false, brakeForBends: true } : {});
      const hooks = {
        // an obstacle hit fails the check. In hard, that is judged on the bot that drives on grip; the sliding bot's hits are reported
        crash: (o) => { if (!p.crash()) return false; st.crash++; if (mode === 'grip' || !SHIP.MANUAL) out.fails.push(`seed ${seed} ${mode} bot: hit ${o.kind} at s=${o.s.toFixed(0)}`); return true; },
        nearMiss: () => st.near++, coin: () => st.coins++, pad: () => p.boost(DRIFT.PAD_TIME, DRIFT.PAD_GAIN, 0),
        gate: (g, bonus) => { clock = clockAfterGate(clock, bonus); },
      };
      const dt = 1 / 120;
      let over = 0, overAt = 0;
      while (p.s < L && t < 2000) {
        p.step(dt, bot.control(p, t)); C2.update(p, hooks, t); t += dt; clock -= dt;
        // never faster than the top speed the course is laid out for here (matters where a brake field has to do its job)
        const ex = p.v / topSpeed(p.s, T2) - 1;
        if (ex > over) { over = ex; overAt = p.s; }
        if (clock < st.minClock) st.minClock = clock;
        if (clock <= 0 && st.outOfTime === null) st.outOfTime = p.s;
      }
      st.time = t; st.avg = L / t; st.over = over;
      if (over > 0.03) out.fails.push(`seed ${seed} ${mode} bot: ${(over * 100).toFixed(1)}% faster than the course is laid out for at s=${overAt.toFixed(0)}`);
      out[mode] = st;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
const t0 = Date.now();
const all = [];
let fails = [];
for (let seed = FROM; seed < FROM + SEEDS; seed++) {
  const r = checkSeed(seed);
  all.push(r); fails = fails.concat(r.fails);
  if (VERBOSE) console.log(`seed ${seed}: ${r.groups} groups, min sight ${r.minSight.toFixed(2)} s, min opening ${r.minOpen.toFixed(1)} m` + (r.pace ? `, pace bot ${r.pace.avg.toFixed(1)} m/s clock>=${r.pace.minClock.toFixed(1)} s, grip bot ${r.grip.avg.toFixed(1)} m/s` : '') + (r.fails.length ? `  ** ${r.fails.length} FAIL` : ''));
}
const sum = (f) => all.reduce((a, r) => a + f(r), 0), min = (f) => all.reduce((a, r) => Math.min(a, f(r)), Infinity);
console.log(`\nPassability check, ${MAPS[MAP].label} map, ${MODE_NAME.toUpperCase()} mode${TEST.speed !== 1 ? `, SPEED x${TEST.speed}` : ''}${AIR !== 1 ? `, open air at ${AIR}x the ships' speed` : ''}: ${SEEDS} seeds (${FROM}..${FROM + SEEDS - 1}), ${KM} km each = ${(SEEDS * KM).toLocaleString('en-US')} km of course`);
console.log(`  obstacles ${sum((r) => r.obstacles)} in ${sum((r) => r.groups)} groups (${(sum((r) => r.groups) / (SEEDS * KM)).toFixed(1)} per km)`);
if (MAP === 'skyway') console.log(`  of those, movers in open air: ${sum((r) => r.movers)} (${(sum((r) => r.movers) / (SEEDS * KM)).toFixed(2)} per km), each proved to stay inside the envelope treated as solid`);
console.log(`  shortest time in sight at top speed: ${min((r) => r.minSight).toFixed(2)} s (rule: >= ${RULE.MIN_SIGHT})`);
console.log(`  narrowest opening: ${min((r) => r.minOpen).toFixed(2)} m for a ${(2 * SHIP.RADIUS).toFixed(1)} m hull (rule: >= ${RULE.MIN_OPEN})`);
console.log(`  search: ${sum((r) => r.searchStates).toLocaleString('en-US')} start states tested at cruise + ${(100 * (topSpeed(0) / cruiseSpeed(0) - 1)).toFixed(0)}%, ${SHIP.MANUAL ? `${(RULE.ACC * SHIP.MANUAL.FAIR_SHARE * 100).toFixed(0)}% of turn rate, nose up to ${Math.round(SHIP.MANUAL.FAIR_ANGLE * 57.3)} deg off` : `${RULE.ACC * 100}% of grip, sideways speed up to ${RULE.SLIDE * 100}% of top`}, ${RULE.REACT} s reaction, ${RULE.MARGIN} m margin`);
if (BOTS) {
  const P = (k) => sum((r) => r.pace[k]), G = (k) => sum((r) => r.grip[k]);
  const clockOut = (m) => { const d = all.map((r) => r[m].outOfTime).filter((x) => x !== null).sort((a, b) => a - b); return d.length ? `clock ran out on ${d.length} of ${SEEDS} runs, median at ${(d[d.length >> 1] / 1000).toFixed(1)} km` : 'clock never ran out'; };
  console.log(`  flat-out bot: obstacle hits ${P('crash')}, hard wall hits ${P('wall')}, grazes ${P('graze')}, drifts banked ${P('drifts')} (none/spark/flare/nova ${all.reduce((a, r) => a.map((v, i) => v + r.pace.tiers[i]), [0, 0, 0, 0]).join('/')}), lost ${P('lost')}, avg ${(sum((r) => r.pace.avg) / SEEDS).toFixed(1)} m/s; ${clockOut('pace')}`);
  console.log(`  no-drift bot: obstacle hits ${G('crash')}, hard wall hits ${G('wall')}, grazes ${G('graze')}, avg ${(sum((r) => r.grip.avg) / SEEDS).toFixed(1)} m/s; ${clockOut('grip')}`);
}
if (BOTS && AIR !== 1) console.log(`  speed: the bots were at most ${(100 * Math.max(...all.map((r) => Math.max(r.pace.over, r.grip.over)))).toFixed(1)}% over the top speed the course is laid out for (rule: <= 3%)`);
console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (SELF_TEST) {
  const caught = all.filter((r) => r.fails.length).length;
  console.log(`\nSELF-TEST (every obstacle shoved ${SHOVE} m toward the bend before it${MAP === 'skyway' ? `, movers ${SHOVE_AIR} m` : ''}): ${fails.length} problems reported on ${caught} of ${SEEDS} seeds.`);
  for (const f of fails.slice(0, 5)) console.log('  e.g. ' + f);
  let ok = caught === SEEDS;
  if (MAP === 'skyway') {
    // the movers have to be caught in their own right, not carried by the stations' rows
    const withAir = all.filter((r) => r.airGroups > 0), airCaught = withAir.filter((r) => r.airFails > 0).length;
    console.log(`  movers alone: ${sum((r) => r.airFails)} of ${sum((r) => r.airGroups)} groups reported, on ${airCaught} of the ${withAir.length} seeds that have any; station rows alone: on ${all.filter((r) => r.shipFails > 0).length} of ${SEEDS} seeds.`);
    ok = ok && airCaught === withAir.length && withAir.length > 0;
  }
  console.log(ok ? 'SELF-TEST OK: the check catches an unfair course.' : 'SELF-TEST FAILED: an unfair course slipped through.');
  process.exit(ok ? 0 : 1);
}
if (fails.length) {
  console.log(`\nFAILED: ${fails.length} problem(s)`);
  for (const f of fails.slice(0, 40)) console.log('  ' + f);
  if (fails.length > 40) console.log(`  ... and ${fails.length - 40} more`);
  process.exit(1);
}
console.log('\nPASS: every obstacle and every sequence has a way through.');

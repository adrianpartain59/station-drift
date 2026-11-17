#!/usr/bin/env node
// Proves that nothing on the course is impossible to get through at the speed the game asks for.
//
//   node tools/verify/passability.mjs [--seeds 200] [--from 1] [--km 12] [--no-bots] [--verbose]
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

import { Track } from '../../src/level/Track.js';
import { Course, clearance, halfLength, halfWidth } from '../../src/gameplay/Course.js';
import { ShipPhysics } from '../../src/gameplay/ShipPhysics.js';
import { Autopilot } from '../../src/gameplay/Autopilot.js';
import { topSpeed, cruiseSpeed, clockAfterGate } from '../../src/gameplay/Pace.js';
import { SHIP, CLOCK, DRIFT } from '../../src/core/Constants.js';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i < 0 ? def : Number(process.argv[i + 1]); };
const flag = (name) => process.argv.includes('--' + name);
const SEEDS = arg('seeds', 200), FROM = arg('from', 1), KM = arg('km', 12), VERBOSE = flag('verbose');
// --self-test: slide every obstacle SHOVE metres back toward the bend before it, which makes the course unfair on
// purpose. The check must then FAIL; if it still passes, the check is not checking anything.
const SELF_TEST = flag('self-test'), SHOVE = arg('shove', 45), BOTS = !flag('no-bots') && !SELF_TEST;
const L = KM * 1000;

const RULE = {
  ACC: 0.75,        // share of lateral grip the search may use
  REACT: 0.45,      // s between a group coming into sight and the ship starting to respond
  MARGIN: 0.3,      // m of clearance beyond the hull the search insists on
  MIN_SIGHT: 1.0,   // s any obstacle must be visible before arrival at top speed
  MIN_OPEN: 6.0,    // m: narrowest physical opening allowed anywhere
  GROUP: 14,        // m: obstacles closer than this along the track are one group
};

// ---------------------------------------------------------------------------------------------
// geometry helpers (independent of Course.js)
// ---------------------------------------------------------------------------------------------
function limAt(T, s) { const i = Math.max(0, Math.min(T.len - 1, Math.round(s))); return T.W[i] - SHIP.RADIUS - (T.ZONE[i] === 0 ? SHIP.WALL_INSET : 0); }
function world(T, s, x) { const i = Math.max(0, Math.min(T.len - 1, Math.round(s))); const h = T.H[i]; return [T.X[i] - Math.cos(h) * x, T.Z[i] + Math.sin(h) * x]; }

/** Earliest centreline point that can see (s, x): march along the sight line and test each sample against the walls. */
function sightStart(T, s, x) {
  const [ox, oz] = world(T, s, x);
  const i1 = Math.round(s);
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
    }
    if (!ok) break;
    best = i0;
  }
  return best;
}

function straightStart(T, s) { let i = Math.round(s); while (i > 0 && Math.abs(T.K[i - 1]) < 1e-6) i--; return i; }

// ---------------------------------------------------------------------------------------------
// the search: which (x, sideways speed) states at sFrom have a safe way to sTo?
// Lattice chosen so the motion is exact: time step dt, sideways speed in units of A*dt, position in
// units of A*dt^2/2, control in {-A, 0, +A}. Every lattice path is a path the real ship could take
// with no more than A, so a "yes" here is never optimistic.
// ---------------------------------------------------------------------------------------------
function winning(T, obstacles, sFrom, sTo, v) {
  const A = RULE.ACC * SHIP.GRIP;
  const DS = 4, dt = DS / v;
  const vyStep = A * dt, xStep = (A * dt * dt) / 2;
  const J = Math.floor((v * Math.sin(SHIP.STEER_ANGLE)) / vyStep);
  const nJ = 2 * J + 1;
  const limMax = 16;
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
  const out = { seed, fails: [], groups: 0, minSight: 99, minOpen: 99, searchStates: 0, obstacles: 0, rowsPerKm: 0 };
  if (SELF_TEST) for (const o of C.obstacles) o.s -= SHOVE;
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

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const v = topSpeed(g.s1);
    // --- 1. sight, straights, openings ---
    let seen = 0;
    for (const o of g.items) {
      const tip = Math.max(o.x - halfWidth(o), Math.min(o.x + halfWidth(o), 0));
      seen = Math.max(seen, sightStart(T, o.s, tip));
      for (let i = Math.floor(o.s - halfLength(o) - 2); i <= Math.ceil(o.s + halfLength(o) + 2); i++) {
        if (Math.abs(T.K[i]) > 1e-6) { out.fails.push(`seed ${seed} s=${o.s.toFixed(0)} ${o.kind}: stands in a bend`); break; }
      }
    }
    const sightT = (g.s0 - seen) / v;
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
    const enter = Math.max(seen + v * RULE.REACT, straightStart(T, g.s0));
    if (enter >= g.s0 - 1) { out.fails.push(`seed ${seed} s=${g.s0.toFixed(0)}: no room to respond after it comes into sight`); continue; }
    const earlier = [];
    for (let q = gi - 1; q >= 0 && groups[q].s1 > enter - 20; q--) for (const o of groups[q].items) if (o.s + halfLength(o) > enter - 3) earlier.push(o);
    const sTo = Math.max(g.s1, ...earlier.map((o) => o.s + halfLength(o))) + 3;
    const before = winning(T, earlier, enter, sTo, v);
    const after = winning(T, earlier.concat(g.items), enter, sTo, v);
    out.searchStates += before.set.length;
    let bad = null;
    for (let q = 0; q < before.set.length; q++) {
      if (before.set[q] && !after.set[q]) { bad = q; break; }
    }
    if (bad !== null) {
      const i = Math.floor(bad / before.nJ), j = bad % before.nJ;
      out.fails.push(`seed ${seed} s=${g.s0.toFixed(0)} (${g.items.map((o) => o.kind).join('+')}): no way through from x=${((i - before.I) * before.xStep).toFixed(1)} m, sideways ${((j - before.J) * before.vyStep).toFixed(1)} m/s, ${(g.s0 - enter).toFixed(0)} m out at ${v.toFixed(0)} m/s`);
    }
  }

  // --- 3. drive ---
  if (BOTS) {
    for (const mode of ['pace', 'grip']) {
      const T2 = new Track(seed); T2.ensure(L + 1500);
      const C2 = new Course(T2, seed);
      const st = { crash: 0, wall: 0, graze: 0, drifts: 0, tiers: [0, 0, 0, 0], lost: 0, coins: 0, near: 0, minClock: 99, time: 0, outOfTime: null };
      let clock = CLOCK.START, t = 0;
      const p = new ShipPhysics(T2, (name, d) => {
        if (name === 'wallHit') { st.wall++; if (mode === 'pace') out.fails.push(`seed ${seed} pace bot: hard wall hit at s=${p.s.toFixed(0)}`); }
        else if (name === 'graze') st.graze++;
        else if (name === 'driftEnd') { st.drifts++; st.tiers[d.tier + 1]++; if (d.tier >= 0 && clock > 0) clock += DRIFT.TIERS[d.tier].clock; }
        else if (name === 'driftLost') st.lost++;
      });
      const bot = new Autopilot(T2, C2, mode === 'grip' ? { drift: false, brakeForBends: true } : {});
      const hooks = {
        crash: (o) => { if (!p.crash()) return false; st.crash++; out.fails.push(`seed ${seed} ${mode} bot: hit ${o.kind} at s=${o.s.toFixed(0)}`); return true; },
        nearMiss: () => st.near++, coin: () => st.coins++, pad: () => p.boost(DRIFT.PAD_TIME, DRIFT.PAD_GAIN, 0),
        gate: (g, bonus) => { clock = clockAfterGate(clock, bonus); },
      };
      const dt = 1 / 120;
      while (p.s < L && t < 2000) {
        p.step(dt, bot.control(p, t)); C2.update(p, hooks); t += dt; clock -= dt;
        if (clock < st.minClock) st.minClock = clock;
        if (clock <= 0 && st.outOfTime === null) st.outOfTime = p.s;
      }
      st.time = t; st.avg = L / t;
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
console.log(`\nPassability check: ${SEEDS} seeds (${FROM}..${FROM + SEEDS - 1}), ${KM} km each = ${(SEEDS * KM).toLocaleString('en-US')} km of course`);
console.log(`  obstacles ${sum((r) => r.obstacles)} in ${sum((r) => r.groups)} groups (${(sum((r) => r.groups) / (SEEDS * KM)).toFixed(1)} per km)`);
console.log(`  shortest time in sight at top speed: ${min((r) => r.minSight).toFixed(2)} s (rule: >= ${RULE.MIN_SIGHT})`);
console.log(`  narrowest opening: ${min((r) => r.minOpen).toFixed(2)} m for a ${(2 * SHIP.RADIUS).toFixed(1)} m hull (rule: >= ${RULE.MIN_OPEN})`);
console.log(`  search: ${sum((r) => r.searchStates).toLocaleString('en-US')} start states tested at cruise + ${(100 * (topSpeed(0) / cruiseSpeed(0) - 1)).toFixed(0)}%, ${RULE.ACC * 100}% of grip, ${RULE.REACT} s reaction, ${RULE.MARGIN} m margin`);
if (BOTS) {
  const P = (k) => sum((r) => r.pace[k]), G = (k) => sum((r) => r.grip[k]);
  const clockOut = (m) => { const d = all.map((r) => r[m].outOfTime).filter((x) => x !== null).sort((a, b) => a - b); return d.length ? `clock ran out on ${d.length} of ${SEEDS} runs, median at ${(d[d.length >> 1] / 1000).toFixed(1)} km` : 'clock never ran out'; };
  console.log(`  flat-out bot: obstacle hits ${P('crash')}, hard wall hits ${P('wall')}, grazes ${P('graze')}, drifts banked ${P('drifts')} (none/spark/flare/nova ${all.reduce((a, r) => a.map((v, i) => v + r.pace.tiers[i]), [0, 0, 0, 0]).join('/')}), lost ${P('lost')}, avg ${(sum((r) => r.pace.avg) / SEEDS).toFixed(1)} m/s; ${clockOut('pace')}`);
  console.log(`  no-drift bot: obstacle hits ${G('crash')}, hard wall hits ${G('wall')}, grazes ${G('graze')}, avg ${(sum((r) => r.grip.avg) / SEEDS).toFixed(1)} m/s; ${clockOut('grip')}`);
}
console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (SELF_TEST) {
  const caught = all.filter((r) => r.fails.length).length;
  console.log(`\nSELF-TEST (every obstacle shoved ${SHOVE} m toward the bend before it): ${fails.length} problems reported on ${caught} of ${SEEDS} seeds.`);
  for (const f of fails.slice(0, 5)) console.log('  e.g. ' + f);
  console.log(caught === SEEDS ? 'SELF-TEST OK: the check catches an unfair course.' : 'SELF-TEST FAILED: an unfair course slipped through.');
  process.exit(caught === SEEDS ? 0 : 1);
}
if (fails.length) {
  console.log(`\nFAILED: ${fails.length} problem(s)`);
  for (const f of fails.slice(0, 40)) console.log('  ' + f);
  if (fails.length > 40) console.log(`  ... and ${fails.length - 40} more`);
  process.exit(1);
}
console.log('\nPASS: every obstacle and every sequence has a way through.');

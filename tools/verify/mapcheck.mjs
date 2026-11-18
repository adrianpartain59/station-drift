#!/usr/bin/env node
// Checks the SHAPE of a map over many seeds, and fails if any rule is broken:
//
//   node tools/verify/mapcheck.mjs [--map skyway|classic] [--seeds 200] [--from 1] [--km 12] [--verbose]
//
// 1. NO OVERLAP   No two stretches of track come within each other's footprint in plan (road, rails,
//                 station hull, plus CLEAR metres) UNLESS their decks are at least SKYWAY.CLEAR metres
//                 apart in height: a spiral passing under itself. Nothing at all may be over, under or
//                 beside a ship. The track is endless and built piece by piece, so this is checked, not
//                 assumed. A bend's own inside edge must have a real radius too.
// 2. HEIGHT       Slope within the cap; crest and sag curvature within their caps; slope changes
//                 smoothly (no kink, and no ramp that starts or ends abruptly: the rate of change of
//                 slope has no jumps either). Stations and their approaches are level.
// 3. REPORT       How much of the distance is open air, how wide it is, how much of it is bending, how
//                 long the bends last at cruise speed, and how much of the bending is on a slope.
//                 (Reported for both maps; the rules in 2 only bind where a map has height.)
import { makeTrack, applyGame, MAPS, DEFAULT_MAP } from '../../src/core/Maps.js';
import { SKYWAY } from '../../src/level/TrackSkyway.js';
import { TRACK, DRIFT } from '../../src/core/Constants.js';
import { cruiseSpeed } from '../../src/gameplay/Pace.js';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i < 0 ? def : process.argv[i + 1]; };
const MAP = arg('map', DEFAULT_MAP), SEEDS = Number(arg('seeds', 200)), FROM = Number(arg('from', 1)), KM = Number(arg('km', 12));
const VERBOSE = process.argv.includes('--verbose');
if (!MAPS[MAP]) { console.error('unknown map ' + MAP); process.exit(2); }
const L = KM * 1000;
const CLEAR = 12;            // m kept free between the footprints of two different stretches
const NEAR = 160;            // samples: closer than this along the track is "the same stretch"
const RAIL = 3;              // open-air footprint beyond the rail (beacons, the deck's edge)
const HULL = TRACK.HULL_PAD + 2;
// the fastest the vertical curvature may build: full sag curvature reached over half the shortest knot spacing
const JERK = (Math.PI / (SKYWAY.SAG_R * SKYWAY.KNOT_MIN)) * 1.02;

// bend times are worked out at each mode's own cruise speed there (in HARD, SKYWAY's open air runs faster than its ships)
const speedOf = (mode, T, i) => { applyGame(mode, MAP); return cruiseSpeed(i, T); };
const fails = [];
const TAU = 2 * Math.PI;
const stat = { spirals: 0, spiralLen: [], spiralDrop: [], minOver: Infinity, air: 0, total: 0, real: 0, any: 0, straight: 0, longest: 0, bends: 0, bendLen: [], bendR: [], bendT: [], bendTe: [], slopeBend: 0, slope: 0,
  gMax: 0, crest: 0, sag: 0, jerk: 0, yMin: 0, yMax: 0, minGap: Infinity, wMin: Infinity, wSum: 0, wN: 0, stations: 0, stationLen: [], airLen: [], calm: 0 };

function footprint(T, i) {
  const sec = T.sections[T.SEC[i]];
  if (T.ZONE[i] === 1) return T.W[i] + RAIL;
  return T.W[i] + HULL;      // classic hull; a ship's rigid hull is checked as a rectangle below
}

for (let seed = FROM; seed < FROM + SEEDS; seed++) {
  const T = makeTrack(MAP, seed); T.ensure(L + 900);
  const n = Math.min(T.len - 1, L);
  const before = fails.length;

  // ---- 1. overlap: spatial hash of every other sample ----
  const CELL = 48, grid = new Map();
  const key = (cx, cz) => cx * 100003 + cz;
  for (let i = 0; i < n; i += 2) {
    const k = key(Math.floor(T.X[i] / CELL), Math.floor(T.Z[i] / CELL));
    let a = grid.get(k); if (!a) grid.set(k, (a = []));
    a.push(i);
  }
  // two stretches closer than that in plan must be an over/under pass: decks SKYWAY.CLEAR apart, open air both
  const needUp = MAP === 'skyway' ? SKYWAY.CLEAR : Infinity;
  let worst = Infinity, worstAt = null, low = Infinity, lowAt = null;
  for (let i = 0; i < n; i += 2) {
    const cx = Math.floor(T.X[i] / CELL), cz = Math.floor(T.Z[i] / CELL), fi = footprint(T, i);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const a = grid.get(key(cx + dx, cz + dz)); if (!a) continue;
      for (const j of a) {
        if (j <= i + NEAR) continue;
        const gap = Math.hypot(T.X[i] - T.X[j], T.Z[i] - T.Z[j]) - fi - footprint(T, j);
        const up = Math.abs(T.Y[i] - T.Y[j]);
        if (gap < CLEAR && up >= needUp && T.ZONE[i] === 1 && T.ZONE[j] === 1) { if (up < low) { low = up; lowAt = [i, j]; } continue; }
        if (gap < worst) { worst = gap; worstAt = [i, j]; }
      }
    }
  }
  if (worst < CLEAR) fails.push(`seed ${seed}: track comes within ${worst.toFixed(1)} m of itself in plan with only ${Math.abs(T.Y[worstAt[0]] - T.Y[worstAt[1]]).toFixed(1)} m of height between (s=${worstAt[0]} and s=${worstAt[1]})`);
  stat.minGap = Math.min(stat.minGap, worst);
  stat.minOver = Math.min(stat.minOver, low);
  void lowAt;
  // a ship's hull is a rectangle along world forward: nothing else may be inside it
  for (const S of T.sections) {
    if (!S.hull || S.s0 > n) continue;
    // A ship's hull, wings and engines stay within SHIP_REACH of its axis and its ends. Nothing but the
    // run-in to its mouth and the run-out from its exit may be inside that box, at any height.
    const h = S.hull, [reach, past] = SKYWAY.SHIP_REACH;
    for (let i = 0; i < n; i += 2) {
      if (i >= S.s0 - 70 && i < S.s1 + 70) continue;
      const f = T.ZONE[i] === 1 ? T.W[i] + RAIL : T.W[i] + HULL;
      if (T.Z[i] > h.z0 - past && T.Z[i] < h.z1 + past && Math.abs(T.X[i] - h.x0) < reach + f) { fails.push(`seed ${seed}: s=${i} is over, under or beside the ship at s=${S.s0}`); break; }
    }
    // on its axis at both mouths (world forward, whatever number of whole turns spirals have wound on)
    for (const q of [S.s0, S.s1 - 1]) if (Math.abs(Math.sin(T.H[q])) > 1e-9 || Math.cos(T.H[q]) < 0.999) fails.push(`seed ${seed}: ship at s=${S.s0} is not on its axis at a mouth`);
  }
  // a bend's own inside edge
  // heading: never further than the limit from world forward, whole spiral turns aside; a spiral itself is exempt
  const spin = new Uint8Array(n + 1);
  for (const [a, b] of T.spirals || []) for (let i = a; i < Math.min(b + 1, n); i++) spin[i] = 1;
  for (let i = 0; i < n; i++) {
    if (T.K[i] !== 0 && 1 / Math.abs(T.K[i]) - T.W[i] < 18) { fails.push(`seed ${seed} s=${i}: inside edge of the bend has radius ${(1 / Math.abs(T.K[i]) - T.W[i]).toFixed(0)} m`); break; }
    const hn = T.H[i] - TAU * Math.round(T.H[i] / TAU);
    if (!spin[i] && Math.abs(hn) > (MAP === 'skyway' ? SKYWAY.HEADING : TRACK.MAX_HEADING) + 1e-6) { fails.push(`seed ${seed} s=${i}: heading ${hn.toFixed(2)} rad is past the limit`); break; }
  }
  for (const p of T.pieces) {
    if (p.type !== 'air-spiral' || p.s1 > n) continue;
    stat.spirals++; stat.spiralLen.push(p.s1 - p.s0); stat.spiralDrop.push((T.Y[p.s0] - T.Y[p.s1]) / p.turns);
    // a spiral is exactly what it says: whole turns, one slope
    const turned = Math.abs(T.H[p.s1] - T.H[p.s0]) / TAU;
    if (Math.abs(turned - p.turns) > 1e-6) fails.push(`seed ${seed} s=${p.s0}: spiral turns ${turned.toFixed(3)} times, not ${p.turns}`);
    for (let i = p.s0; i < p.s1; i++) if (Math.abs(T.G[i] - p.grade) > 1e-9) { fails.push(`seed ${seed} s=${i}: spiral's slope is not steady`); break; }
  }

  // ---- 2. height ----
  if (MAP === 'skyway') {
    for (let i = 1; i < n - 1; i++) {
      const g = T.G[i], dg = T.G[i + 1] - g, ddg = T.G[i + 1] - 2 * g + T.G[i - 1];
      stat.gMax = Math.max(stat.gMax, Math.abs(g)); stat.crest = Math.max(stat.crest, -dg); stat.sag = Math.max(stat.sag, dg); stat.jerk = Math.max(stat.jerk, Math.abs(ddg));
      if (Math.abs(g) > SKYWAY.GRADE + 1e-9) { fails.push(`seed ${seed} s=${i}: slope ${(g * 100).toFixed(1)}%`); break; }
      if (-dg > 1 / SKYWAY.CREST_R + 1e-9) { fails.push(`seed ${seed} s=${i}: crest radius ${(1 / -dg).toFixed(0)} m`); break; }
      if (dg > 1 / SKYWAY.SAG_R + 1e-9) { fails.push(`seed ${seed} s=${i}: sag radius ${(1 / dg).toFixed(0)} m`); break; }
      // no abrupt start or end to a ramp: the vertical curvature itself may not jump
      if (Math.abs(ddg) > JERK) { fails.push(`seed ${seed} s=${i}: vertical curvature jumps by ${ddg.toExponential(2)} per m`); break; }
      if (Math.abs(T.Y[i + 1] - T.Y[i] - (g + T.G[i + 1]) / 2) > 1e-9) { fails.push(`seed ${seed} s=${i}: height does not match its slope`); break; }
      if (T.ZONE[i] === 0 && g !== 0) { fails.push(`seed ${seed} s=${i}: a station is not level`); break; }
      stat.yMin = Math.min(stat.yMin, T.Y[i]); stat.yMax = Math.max(stat.yMax, T.Y[i]);
    }
  }

  // ---- 3. report ----
  let run = 0;
  for (let i = 0; i < n; i++) {
    stat.total++;
    if (T.ZONE[i] !== 1) { run = 0; continue; }
    stat.air++;
    const k = Math.abs(T.K[i]);
    if (k >= DRIFT.ARM_K) { stat.real++; if (Math.abs(T.G[i]) >= 0.03) stat.slopeBend++; }
    if (k > 0) stat.any++;
    if (k > 0 && k <= (T.calmK || 0)) stat.calm++;
    if (Math.abs(T.G[i]) >= 0.03) stat.slope++;
    if (k === 0) { stat.straight++; run++; stat.longest = Math.max(stat.longest, run); } else run = 0;
    // width, where it has settled
    if (i > 0 && T.W[i] === T.W[i - 1]) { stat.wMin = Math.min(stat.wMin, 2 * T.W[i]); stat.wSum += 2 * T.W[i]; stat.wN++; }
  }
  for (let i = 1; i < n; i++) {
    if (T.ZONE[i] !== 1 || Math.abs(T.K[i]) < DRIFT.ARM_K || T.K[i] === T.K[i - 1]) continue;
    let j = i; while (j < n && T.K[j] === T.K[i]) j++;
    stat.bends++; stat.bendLen.push(j - i); stat.bendR.push(1 / Math.abs(T.K[i])); stat.bendT.push((j - i) / speedOf('hard', T, i)); stat.bendTe.push((j - i) / speedOf('easy', T, i));
  }
  for (const S of T.sections) {
    if (S.s1 > n) continue;
    if (S.type === 'station') { stat.stations++; stat.stationLen.push(S.s1 - S.s0); } else if (!S.opening) stat.airLen.push(S.s1 - S.s0);
  }
  if (VERBOSE) console.log(`seed ${seed}: nearest approach ${worst === Infinity ? 'none' : worst.toFixed(0) + ' m'}${fails.length > before ? '  ** FAIL' : ''}`);
}

const q = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const pc = (a, b) => ((100 * a) / Math.max(1, b)).toFixed(0) + '%';
console.log(`\nMap check, ${MAPS[MAP].label}: ${SEEDS} seeds (${FROM}..${FROM + SEEDS - 1}), ${KM} km each`);
console.log(`  open air ${pc(stat.air, stat.total)} of the distance; stretches ${q(stat.airLen, 0).toFixed(0)}-${q(stat.airLen, 0.999).toFixed(0)} m (median ${q(stat.airLen, 0.5).toFixed(0)}), stations ${q(stat.stationLen, 0).toFixed(0)}-${q(stat.stationLen, 0.999).toFixed(0)} m (median ${q(stat.stationLen, 0.5).toFixed(0)})`);
console.log(`  open-air width, rail to rail: ${(stat.wSum / Math.max(1, stat.wN)).toFixed(0)} m on average where settled (narrowest settled ${stat.wMin.toFixed(0)} m, at a station mouth)`);
console.log(`  open air that is a real bend (R <= ${(1 / DRIFT.ARM_K).toFixed(0)} m): ${pc(stat.real, stat.air)}; bending at all: ${pc(stat.any, stat.air)}; dead straight: ${pc(stat.straight, stat.air)} (longest ${stat.longest} m); calm sweeper: ${pc(stat.calm, stat.air)}`);
console.log(`  real bends: ${(stat.bends / (SEEDS * KM)).toFixed(1)} per km; length ${q(stat.bendLen, 0.1).toFixed(0)} / ${q(stat.bendLen, 0.5).toFixed(0)} / ${q(stat.bendLen, 0.9).toFixed(0)} m (10th / median / 90th); radius ${q(stat.bendR, 0).toFixed(0)}-${q(stat.bendR, 0.999).toFixed(0)} m; time in one at cruise ${q(stat.bendT, 0.1).toFixed(1)} / ${q(stat.bendT, 0.5).toFixed(1)} / ${q(stat.bendT, 0.9).toFixed(1)} s in hard, ${q(stat.bendTe, 0.1).toFixed(1)} / ${q(stat.bendTe, 0.5).toFixed(1)} / ${q(stat.bendTe, 0.9).toFixed(1)} s in easy`);
if (MAP === 'skyway') {
  console.log(`  height: steepest slope ${(stat.gMax * 100).toFixed(1)}% (cap ${SKYWAY.GRADE * 100}%); tightest crest R ${(1 / stat.crest).toFixed(0)} m (cap ${SKYWAY.CREST_R}), tightest sag R ${(1 / stat.sag).toFixed(0)} m (cap ${SKYWAY.SAG_R}); range ${stat.yMin.toFixed(0)} .. +${stat.yMax.toFixed(0)} m`);
  console.log(`  on a slope of 3% or more: ${pc(stat.slopeBend, stat.real)} of real-bend distance, ${pc(stat.slope, stat.air)} of all open air`);
}
if (MAP === 'skyway') console.log(`  spirals: ${stat.spirals} (one per ${((SEEDS * KM) / Math.max(1, stat.spirals)).toFixed(1)} km); ${q(stat.spiralLen, 0).toFixed(0)}-${q(stat.spiralLen, 0.999).toFixed(0)} m of road (median ${q(stat.spiralLen, 0.5).toFixed(0)}); dropping ${q(stat.spiralDrop, 0).toFixed(0)}-${q(stat.spiralDrop, 0.999).toFixed(0)} m a turn; least height between two decks that overlap: ${stat.minOver === Infinity ? 'none overlap' : stat.minOver.toFixed(1) + ' m'} (rule: >= ${SKYWAY.CLEAR})`);
console.log(`  nearest two different stretches come to each other without passing over or under: ${stat.minGap === Infinity ? 'never within range' : stat.minGap.toFixed(0) + ' m between footprints'} (rule: >= ${CLEAR})`);
if (fails.length) {
  console.log(`\nFAILED: ${fails.length} problem(s)`);
  for (const f of fails.slice(0, 30)) console.log('  ' + f);
  process.exit(1);
}
console.log('\nPASS: the track never runs into itself' + (MAP === 'skyway' ? ' (where it passes under itself the decks are well apart), and every slope is within its caps and smooth.' : '.'));

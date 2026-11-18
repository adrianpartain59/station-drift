// How a held slide ends, hard mode, by bend radius. Hands only, no skill: key + SPACE through the bend, then
// hands off. Run it before and after any change to the slide or steering numbers in src/core/Modes.js.
//
//   node tools/verify/feel.mjs                              the numbers as they stand
//   node tools/verify/feel.mjs SLIDE_WIDE=1.25              ...next to the same with one or more numbers changed
//   node tools/verify/feel.mjs TURN_RATE=1.5 TURN_MAX=2.0
//
// Reading it: "outer wall" = the slide ran wide into the outside wall, "inner wall" = it cut inside the bend
// (during the slide or in the 0.8 s after letting go), "width used" = how much of the room between where the
// ship came in and the outside wall the slide took up. A good slide uses most of the width and ends clean.
import { applyMode } from '../../src/core/Modes.js';
applyMode('hard');
const { Track } = await import('../../src/level/Track.js');
const { ShipPhysics } = await import('../../src/gameplay/ShipPhysics.js');
const { SHIP } = await import('../../src/core/Constants.js');
const { cruiseSpeed } = await import('../../src/gameplay/Pace.js');

const M = SHIP.MANUAL;
const NOW = { ...M }, TRY = { ...M };
const changes = process.argv.slice(2).filter((a) => a.includes('='));
for (const a of changes) {
  const [k, v] = a.split('=');
  if (!(k in M) || Number.isNaN(Number(v))) { console.error(`unknown or non-numeric setting: ${a}`); process.exit(2); }
  TRY[k] = Number(v);
}
const SETS = changes.length ? [['now', NOW], [changes.join(' '), TRY]] : [['now', NOW]];

// every station bend with a straight either side, first 9 km of 40 seeds
const dt = 1 / 120, bends = [];
for (let seed = 1; seed <= 40; seed++) {
  const T = new Track(seed); T.ensure(9500);
  let i = 300;
  while (i < 9000) {
    if (T.K[i] !== 0 && T.ZONE[i] === 0) {
      let j = i; while (T.K[j] === T.K[i]) j++;
      let before = 0; for (let q = i - 1; q > i - 60 && T.K[q] === 0; q--) before++;
      let after = 0; for (let q = j; q < j + 60 && T.K[q] === 0; q++) after++;
      if (before > 40 && after > 40) bends.push({ T, s0: i, s1: j, k: T.K[i], R: 1 / Math.abs(T.K[i]) });
      i = j;
    } else i++;
  }
}

function drift(b, set, startIn, holdPast) {
  Object.assign(M, set);
  const p = new ShipPhysics(b.T, () => {});
  const out = Math.sign(b.k), key = -out;          // k > 0 turns left: the outside is +x, the inside key is left
  p.reset(b.s0 - 30); p.v = cruiseSpeed(b.s0); p.x = -out * startIn;
  let wall = null, maxOut = -99, after = -1;
  for (let n = 0; n < 1200; n++) {
    const held = p.s > b.s0 - 5 && p.s < b.s1 + holdPast;
    if (p.s >= b.s1 + holdPast && after < 0) after = 0;
    p.step(dt, held ? { steer: key, drift: true } : { steer: 0 });
    maxOut = Math.max(maxOut, p.x * out);
    if (!wall && p.wallSide !== 0) wall = p.wallSide * out > 0 ? 'outer' : 'inner';
    if (after >= 0) { after += dt; if (after > 0.8) break; }
  }
  return { wall, used: Math.min(1, (maxOut + startIn) / (p.lim + startIn)) };
}

const pct = (n, d) => `${Math.round((100 * n) / d)}%`.padStart(4);
const CASES = [
  [2.5, -4, 'in on the inside third, let go just before the bend ends'],
  [0, -4, 'in down the middle, let go just before the bend ends'],
  [2.5, 12, 'in on the inside third, held 12 m too long'],
];
console.log(`Held slide, hard mode, ${bends.length} station bends, at cruise speed`);
for (const [startIn, holdPast, label] of CASES) {
  console.log(`\n${label}`);
  for (const [lo, hi] of [[0, 45], [45, 55], [55, 65], [65, 80]]) {
    const B = bends.filter((b) => b.R >= lo && b.R < hi);
    for (const [name, set] of SETS) {
      let clean = 0, outer = 0, inner = 0, used = 0;
      for (const b of B) { const r = drift(b, set, startIn, holdPast); if (!r.wall) clean++; else if (r.wall === 'outer') outer++; else inner++; used += r.used; }
      console.log(`  R ${String(lo).padStart(2)}-${hi} m (${String(B.length).padStart(3)} bends)  clean ${pct(clean, B.length)}  outer wall ${pct(outer, B.length)}  inner wall ${pct(inner, B.length)}  width used ${pct(used, B.length)}   ${name}`);
    }
  }
}
Object.assign(M, NOW);

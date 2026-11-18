// How the hard-mode slide feels, in numbers. Not a pass/fail check. Run it before and after any change to the
// slide or steering numbers in src/core/Modes.js (SHIP.MANUAL).
//
//   node tools/verify/feel.mjs                              the numbers as they stand
//   node tools/verify/feel.mjs SLIDE_GRIP=2.6               ...next to the same with one or more numbers changed
//   node tools/verify/feel.mjs --brief SLIDE_WIND=0.9 / SLIDE_WIND=0.9 BITE_TIME=0.5     several sets, one line each
//   node tools/verify/feel.mjs --map skyway                 the same players on the SKYWAY map: its open-air bends
//                                                           (by radius, hairpins apart) and its station bends
//
// Part 1, how sharp: open ground, one key held, how long until the ship is travelling 45 and 90 degrees round;
// and how far the ship slides out when SPACE goes down in the middle of a corner it was holding.
// Part 2, scripted players through every station bend of 40 seeds, at cruise speed, by bend radius:
//   holds everything   key + SPACE from the bend's start to its end with no judgement at all (the first-day
//                      habit), then steers back to the middle like anyone would
//   feathers           arrow and SPACE down together, SPACE held until the ship has come round; after the first
//                      0.3 s looks half a second up the road and holds the inside key while the ship is heading
//                      wide of that spot, lets go when it is not, taps the outside key if it is heading well
//                      inside; hands answer 0.18 s after eyes, like a person
//   presses late       the same, but SPACE goes down 0.25 s into the bend
//   no drift           the same judgement with plain steering only (what the slide has to beat)
// "clean" = touched no wall from the bend's start to 0.9 s after its end ("after the bend" = share of all bends
// where the first touch came after the slide was let go). "width" = how much of the room toward
// the outside wall the ship used. "tier" = the boost banked on letting go (0 none .. 3 nova), drifting rows only.
// On SKYWAY three more columns say what "wide and long" comes to: "slide" = seconds the slide was held, "road" =
// metres of the road's width the ship moved across, "len" = metres travelled sliding.
import { applyGame, makeTrack, MAPS } from '../../src/core/Maps.js';
const mapAt = process.argv.indexOf('--map');
const MAP = mapAt < 0 ? 'classic' : process.argv[mapAt + 1];
if (!MAPS[MAP]) { console.error('unknown map: ' + MAP); process.exit(2); }
if (mapAt >= 0) process.argv.splice(mapAt, 2);
applyGame('hard', MAP);
const Track = function (seed) { return makeTrack(MAP, seed); };
const { ShipPhysics } = await import('../../src/gameplay/ShipPhysics.js');
const { SHIP } = await import('../../src/core/Constants.js');
const { cruiseSpeed } = await import('../../src/gameplay/Pace.js');

const M = SHIP.MANUAL;
const NOW = { ...M };
// settings to compare: NAME=value ..., several sets separated by "/"; --brief prints one line per set
const BRIEF = process.argv.includes('--brief');
const SETS = [['now', NOW]];
for (const group of process.argv.slice(2).filter((a) => a !== '--brief').join(' ').split('/').map((g) => g.trim()).filter(Boolean)) {
  const set = { ...M };
  for (const a of group.split(/\s+/)) {
    const [k, v] = a.split('=');
    const val = v && v.includes(',') ? v.split(',').map(Number) : Number(v);     // a pair is written 0.35,1.0
    if (!(k in M) || [].concat(val).some(Number.isNaN)) { console.error(`unknown or non-numeric setting: ${a}`); process.exit(2); }
    set[k] = val;
  }
  SETS.push([group, set]);
}
const dt = 1 / 120;

// ---------- part 1: how sharp ----------
const plain = { len: 9000, K: new Float32Array(9000), sample(s, o) { o.w = 400; o.zone = 1; o.k = 0; o.flag = 0; o.sec = 0; return o; } };
function sharp(set, drift) {
  Object.assign(M, set, { MAX_ANGLE: 9 });
  const p = new ShipPhysics(plain, () => {}); p.reset(100); p.v = 46;
  let t45 = null, t90 = null, wide = 0;
  for (let n = 1; n <= 300; n++) {
    p.step(dt, { steer: 1, drift });
    if (t45 === null && p.theta >= Math.PI / 4) t45 = n / 120;
    if (t90 === null && p.theta >= Math.PI / 2) t90 = n / 120;
  }
  // how far the ship has moved sideways when it is travelling 45 degrees round: less = it turned in a smaller space
  const q = new ShipPhysics(plain, () => {}); q.reset(100); q.v = 46;
  for (let n = 1; n <= 300 && q.theta < Math.PI / 4; n++) { q.step(dt, { steer: 1, drift }); wide = q.s - 100; }
  return `45 degrees after ${t45 ? t45.toFixed(2) : ' -- '} s (${wide.toFixed(0)} m down the road), 90 after ${t90 ? t90.toFixed(2) : ' -- '} s, settles at ${p.yawRate.toFixed(2)} rad/s, ${p.v.toFixed(0)} m/s`;
}
// How far the ship slides out when the slide starts: a ring of R 50 m, the ship already cornering on the middle
// line with plain steering (perfectly, by formula), then SPACE with the arrow held for `hold` seconds.
function slideOut(set, hold = 0.7) {
  Object.assign(M, set, { MAX_ANGLE: 9 });
  const R = 50, ring = { len: 9000, K: new Float32Array(9000).fill(1 / R), sample(s, o) { o.w = 400; o.zone = 1; o.k = 1 / R; o.flag = 0; o.sec = 0; return o; } };
  const p = new ShipPhysics(ring, () => {}); p.reset(100); p.v = 46;
  // already cornering in balance: nose turned in just enough for grip to carry the ring, key part-held to match
  const part = -(p.v / R) / M.TURN_RATE;
  p.steer = part; p.psi = -(p.v / R) / M.GRIP_RATE; p.theta = 0;
  for (let n = 0; n < 60; n++) p.step(dt, { steer: part });
  const x0 = p.x; let peak = -9, tPeak = 0, back = null;
  for (let n = 1; n <= 240; n++) {
    const t = n / 120; p.step(dt, { steer: t < hold ? -1 : 0, drift: true });
    const o = p.x - x0;
    if (back === null) { if (o > peak) { peak = o; tPeak = t; } if (t > tPeak && peak > 0.3 && o <= 0) back = t; }   // the first run-out only
  }
  return `slides ${Math.max(0, peak).toFixed(1)} m wide (furthest at ${tPeak.toFixed(2)} s)${back ? `, back on its line at ${back.toFixed(2)} s` : ''}`;
}
if (!BRIEF) {
  console.log('How sharp (open ground, 46 m/s, one key held)');
  for (const [name, set] of SETS) {
    console.log(`  plain steering   ${sharp(set, false)}   ${name}`);
    console.log(`  key + SPACE      ${sharp(set, true)}   ${name}`);
    console.log(`  SPACE mid-corner ${slideOut(set)}   ${name}`);
  }
}

// ---------- part 2: scripted players ----------
const bends = [];
for (let seed = 1; seed <= 40 && MAP === 'skyway'; seed++) {
  // SKYWAY records its bends as it lays them: open-air arcs (linked, so no straight either side) and the ships' corners
  const T = new Track(seed); T.ensure(9500);
  for (const p of T.pieces) {
    if (!p.arcs || p.s0 < 300 || p.s1 > 9000) continue;
    const air = p.type === 'air-bend' || p.type === 'air-ess';
    for (const a of p.arcs) bends.push({ T, s0: a.s0, s1: a.s1, k: a.k, R: 1 / Math.abs(a.k), air, hairpin: !!p.hairpin });
  }
}
// in a ship the corners come in close pairs: a corner's test ends where the next corner begins
for (let i = 0; i + 1 < bends.length; i++) if (!bends[i].air && bends[i + 1].T === bends[i].T && bends[i + 1].s0 - bends[i].s1 < 60) bends[i].next = bends[i + 1].s0;
for (let seed = 1; seed <= 40 && MAP !== 'skyway'; seed++) {
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

const HANDS_LATE = 0.18;
// Which way (rad, + = right, against the corridor's direction at the ship) the spot d metres up the road on
// lane x lies. This is what a driver looks at: the road ahead, not the wall beside them.
function aim(T, p, d, lane) {
  let phi = 0, off = 0; const i0 = Math.floor(p.s);
  for (let u = 0; u < d; u++) { phi -= T.K[Math.min(T.len - 1, i0 + u)]; off += Math.sin(phi); }
  return Math.atan2(off + lane - p.x, d);
}
function run(b, set, kind) {
  Object.assign(M, set);
  const p = new ShipPhysics(b.T, () => {});
  const out = Math.sign(b.k), inKey = -out;           // k > 0 turns left: the outside is +x, the inside key is left
  // stations: in on the inside third, off a straight. Open air: from the middle of the road, 60 m back, driving
  // whatever comes before the bend (usually the bend before it) with the same judgement as the plain player
  const START_IN = b.air ? 0 : 2.5;
  // (a ship's corners come in close pairs: each is taken from the straight before it, however short that is)
  let back = b.air ? 60 : 40;
  if (!b.air && MAP === 'skyway') { let q = 0; while (q < 40 && b.T.K[b.s0 - 1 - q] === 0) q++; back = Math.max(6, q - 1); }
  p.reset(b.s0 - back); p.v = cruiseSpeed(b.s0); p.x = -out * START_IN; p.theta = 0; p.psi = 0;
  const queue = []; let wall = null, late = false, maxOut = -99, after = -1, tier = -1, started = false, slid = 0;
  let minX = 99, maxX = -99, slideT = 0, slideLen = 0;
  const from = kind === 'late' ? b.s0 + p.v * 0.25 : b.s0 - 5, to = b.s1 - 4;
  for (let n = 0; n < 1500; n++) {
    let steer = 0, drift = false;
    const inBend = p.s >= from && p.s < to;
    if (kind === 'hold' && p.s < to && (!b.air || p.s > b.s0 - 5)) {
      if (p.s > b.s0 - 5) { steer = inKey; drift = true; }
    } else {
      // SPACE stays down through the bend, and a moment past it if the ship is still running wide
      const sliding = kind !== 'plain' && (kind !== 'hold' || p.s <= b.s0 - 5) && kind !== 'hold' && (inBend || (p.drift && p.s < to + p.v * 0.5 && p.theta * out > 0.03));
      // 'line' (SKYWAY, open air): the wide line. In from the outside third, down to the inside third at the apex
      // (two thirds round), out to the middle again. Everyone else holds the middle of the road.
      const round = (p.s - b.s0) / (b.s1 - b.s0);
      const lane = kind === 'line' && b.air
        ? out * p.lim * (round < 0 ? 0.55 : round < 0.66 ? 0.55 - 1.15 * (round / 0.66) : -0.6 + 0.7 * Math.min(1, (round - 0.66) / 0.34))
        : p.s < b.s0 - 12 ? -out * START_IN : 0;
      const want = aim(b.T, p, p.v * 0.55, lane);
      // plain steering: judge by the nose (travel follows it at once). Sliding: judge by where the ship is going
      // and how fast that is coming round.
      const going = sliding || p.drift ? p.theta + (p.psi - p.theta) * p.gripNow * 0.25 : p.psi + p.yawRate * 0.12;
      const e = (want - going) * inKey;                // + = needs to turn further into the bend
      steer = e > 0.03 ? inKey : e < (sliding ? -0.12 : -0.03) ? -inKey : 0;
      // nobody presses SPACE without the arrow: both go down together and stay down until the slide has bitten
      if (sliding) { slid += dt; if (slid < 0.3) steer = inKey; }
      drift = sliding;
    }
    // hands answer HANDS_LATE after eyes
    queue.push([steer, drift]);
    const [st, dr] = kind === 'hold' && p.s < to && p.s > b.s0 - 5 ? [steer, drift] : queue[Math.max(0, queue.length - 1 - Math.round(HANDS_LATE / dt))];
    if (p.drift && !dr) tier = p.tier;
    p.step(dt, { steer: st, drift: dr });
    if (p.s >= b.s0) started = true;
    if (started) {
      if (p.drift) { slideT += dt; slideLen += p.v * dt; }
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      maxOut = Math.max(maxOut, p.x * out);
      if (!wall && p.wallSide !== 0) { wall = p.wallSide * out > 0 ? 'outer' : 'inner'; late = p.s >= to; }
    }
    if (p.s >= to && after < 0) after = 0;
    if (after >= 0) { after += dt; if (after > 0.9) break; }
    if (b.next && p.s >= b.next - 3) break;          // the next corner is someone else's test
  }
  return { wall, late, used: Math.min(1, Math.max(0, (maxOut + START_IN) / (p.lim + START_IN))), tier: tier + 1, slideT, slideLen, road: Math.max(0, maxX - minX) };
}

const pct = (n, d) => `${Math.round((100 * n) / d)}%`.padStart(4);
const PLAYERS = [['hold', 'holds everything'], ['feather', 'feathers the key'], ['late', 'presses late, feathers'], ['plain', 'no drift, plain steering']];
const BUCKETS = [[0, 45], [45, 55], [55, 65], [65, 80]];
function tally(B, set, kind) {
  let clean = 0, outer = 0, inner = 0, used = 0, tier = 0, after = 0, slideT = 0, road = 0, len = 0, nova = 0;
  const times = [];
  for (const b of B) {
    const r = run(b, set, kind);
    if (!r.wall) clean++; else { if (r.wall === 'outer') outer++; else inner++; if (r.late) after++; }
    used += r.used; tier += r.tier; slideT += r.slideT; road += r.road; len += r.slideLen; times.push(r.slideT); if (r.tier === 3) nova++;
  }
  times.sort((x, y) => x - y);
  return { clean, outer, inner, used, tier, after, n: B.length, slideT, road, len, nova, long: times.length ? times[Math.floor(times.length * 0.9)] : 0 };
}

// ---------- SKYWAY: open-air bends by radius (hairpins apart), then the ships' corners ----------
if (MAP === 'skyway') {
  const air = bends.filter((b) => b.air), ship = bends.filter((b) => !b.air);
  const groups = [
    ['open air, R 70-90 m', air.filter((b) => !b.hairpin && b.R < 90)],
    ['open air, R 90-105 m', air.filter((b) => !b.hairpin && b.R >= 90 && b.R < 105)],
    ['open air, R 105-120 m', air.filter((b) => !b.hairpin && b.R >= 105)],
    ['open air, hairpins', air.filter((b) => b.hairpin)],
    ['in a ship, R under 45 m', ship.filter((b) => b.R < 45)],
    ['in a ship, R 45 m and up', ship.filter((b) => b.R >= 45)],
  ];
  const deg = (B) => (B.reduce((a, b) => a + Math.abs(b.k) * (b.s1 - b.s0), 0) / Math.max(1, B.length)) * 57.3;
  const lenOf = (B) => B.reduce((a, b) => a + b.s1 - b.s0, 0) / Math.max(1, B.length);
  console.log(`\nSKYWAY, scripted players at cruise speed in HARD: ${air.length} open-air bends and ${ship.length} ship corners (40 seeds, first 9 km of each)`);
  console.log('  slide = seconds the slide is held in the bend (average, and the 90th-percentile bend); road = metres of the road\'s width crossed;');
  console.log('  rails in open air are soft (a touch costs a little speed and the slide); a ship\'s walls are hard.');
  const AIR_PLAYERS = [...PLAYERS, ['line', 'takes the wide line, feathers (open air only)']];
  for (const [name, set] of SETS) {
    if (SETS.length > 1) console.log(`\n=== ${name} ===`);
    for (const [kind, label] of AIR_PLAYERS) {
      console.log(`\n${label}`);
      for (const [title, B] of groups) {
        if (!B.length || (kind === 'line' && !B[0].air)) continue;
        const r = tally(B, set, kind);
        const slide = kind === 'plain' ? '' : `  slide ${(r.slideT / r.n).toFixed(1)} s (90th pct ${r.long.toFixed(1)} s, ${(r.len / r.n).toFixed(0)} m)  tier ${(r.tier / r.n).toFixed(1)} (nova ${pct(r.nova, r.n).trim()})`;
        console.log(`  ${title.padEnd(26)} (${String(r.n).padStart(3)} bends, avg ${lenOf(B).toFixed(0)} m / ${deg(B).toFixed(0)} deg)  clean ${pct(r.clean, r.n)}  outer ${pct(r.outer, r.n)}  inner ${pct(r.inner, r.n)}  road ${(r.road / r.n).toFixed(0).padStart(2)} m${slide}`);
      }
    }
  }
  Object.assign(M, NOW);
  process.exit(0);
}
if (BRIEF) {
  // one line per set: clean % by radius bucket (and outer/inner split overall) for each player, and how sharp
  console.log('clean % by bend radius (under 45 / 45-55 / 55-65 / 65-80), then [outer wall % | inner wall %] over all bends');
  for (const [name, set] of SETS) {
    const parts = [];
    for (const [kind, label] of PLAYERS) {
      const rows = BUCKETS.map(([lo, hi]) => tally(bends.filter((b) => b.R >= lo && b.R < hi), set, kind));
      const all = rows.reduce((a, r) => ({ outer: a.outer + r.outer, inner: a.inner + r.inner, n: a.n + r.n, used: a.used + r.used }), { outer: 0, inner: 0, n: 0, used: 0 });
      parts.push(`${label.split(' ')[0]} ${rows.map((r) => Math.round((100 * r.clean) / r.n)).join('/')} [${Math.round((100 * all.outer) / all.n)}|${Math.round((100 * all.inner) / all.n)}] w${Math.round((100 * all.used) / all.n)}`);
    }
    console.log(`${parts.join('   ')}   | ${sharp(set, true).split(' (')[0].replace(' degrees after', ' deg')}, ${slideOut(set).split(' (')[0]}   ${name}`);
  }
} else {
  console.log(`\nScripted players, ${bends.length} station bends, cruise speed, in on the inside third`);
  for (const [kind, label] of PLAYERS) {
    console.log(`\n${label}`);
    for (const [lo, hi] of BUCKETS) {
      const B = bends.filter((b) => b.R >= lo && b.R < hi);
      for (const [name, set] of SETS) {
        const r = tally(B, set, kind);
        console.log(`  R ${String(lo).padStart(2)}-${hi} m (${String(r.n).padStart(3)})  clean ${pct(r.clean, r.n)}  outer wall ${pct(r.outer, r.n)}  inner wall ${pct(r.inner, r.n)}  (after the bend ${pct(r.after, r.n)})  width ${pct(r.used, r.n)}${kind === 'plain' ? '' : `  tier ${(r.tier / r.n).toFixed(1)}`}   ${name}`);
      }
    }
  }
}
Object.assign(M, NOW);

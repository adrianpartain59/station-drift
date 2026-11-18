import { SHIP, DRIFT, CLOCK } from '../core/Constants.js';

// How fast the game asks you to go, and how much time it gives you for it.
const lerp = (a, b, t) => a + (b - a) * t;

export const difficulty = (s) => Math.min(1, Math.max(0, s) / 7500);

// Open air can run faster than the ships (SKYWAY, SHIP.AIR_SPEED: set per map and mode in core/Maps.js).
// The track says where: track.F is 1 in open air and 0 inside a ship, falling over the run-in to a ship's
// mouth (the brake field) and rising over the run-out (the launch). The square of the speed is what
// follows F, so both are a steady push: v^2 = base^2 * (1 + (k^2 - 1) F).
// A track without F (the classic map), or a factor of 1, is the same speed everywhere: exactly as it was.
const zone = (s, F) => {
  let i = Math.floor(s);
  if (i < 0) i = 0;
  if (i > F.length - 2) i = F.length - 2;
  const d = F[i + 1] - F[i];
  return [F[i] + d * Math.min(1, Math.max(0, s - i)), d];
};

/** How many times the base cruise speed the game asks for at s on this track. */
export function airFactor(s, track) {
  const k = SHIP.AIR_SPEED;
  if (!k || k === 1 || !track || !track.F) return 1;
  return Math.sqrt(1 + (k * k - 1) * zone(s, track.F)[0]);
}

/**
 * How hard (m/s^2) the road itself is changing the speed of a ship doing v at s: the brake field into a
 * ship, the launch out of one. Nothing anywhere else.
 */
export function airRamp(s, track, v) {
  const k = SHIP.AIR_SPEED;
  if (!k || k === 1 || !track || !track.F) return 0;
  const [u, d] = zone(s, track.F);
  return d ? (v * v * (k * k - 1) * Math.abs(d)) / (2 * (1 + (k * k - 1) * u)) : 0;
}

/** Cruise speed (m/s) at distance s (on `track`, where a map has faster and slower stretches). */
export const cruiseSpeed = (s, track) => lerp(SHIP.CRUISE[0], SHIP.CRUISE[1], difficulty(s)) * airFactor(s, track);

/** The fastest the ship can ever be going at distance s: cruise plus the biggest boost. */
export const topSpeed = (s, track) => cruiseSpeed(s, track) * (1 + DRIFT.MAX_GAIN);

/** Share of cruise speed the clock's par assumes at distance s. */
export function pace(s) {
  const P = CLOCK.PACE;
  if (s <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) {
    if (s <= P[i][0]) return lerp(P[i - 1][1], P[i][1], (s - P[i - 1][0]) / (P[i][0] - P[i - 1][0]));
  }
  return P[P.length - 1][1];
}

/** Seconds the clock gives for the stretch s0..s1. */
export function parTime(s0, s1, track) {
  if (track && track.F && SHIP.AIR_SPEED && SHIP.AIR_SPEED !== 1) {
    // the asked speed changes along the stretch (open air, brake field, ship): add it up 20 m at a time
    let t = 0;
    for (let a = s0; a < s1; a += 20) { const b = Math.min(s1, a + 20), m = (a + b) / 2; t += (b - a) / (cruiseSpeed(m, track) * pace(m)); }
    return t;
  }
  const mid = (s0 + s1) / 2;
  return (s1 - s0) / (cruiseSpeed(mid) * pace(mid));
}

/** The clock after passing a gate worth `bonus` seconds: slack carried over is capped. */
export const clockAfterGate = (clock, bonus) => Math.min(Math.max(0, clock), CLOCK.CARRY) + bonus;

// What the course layout and the proof may assume of the ship's sideways ability at speed v.
// Assisted handling: its lateral grip, and the travel angle full steer holds.
// Manual handling: a stated share of its turn rate (sideways acceleration = speed x turn rate), and a
// stated angle off the corridor it may be pointing.
/** Sideways acceleration (m/s^2) the ship can be relied on for. */
export const lateralAcc = (v) => (SHIP.MANUAL ? v * SHIP.MANUAL.TURN_RATE * SHIP.MANUAL.FAIR_SHARE : SHIP.GRIP);
/** Fastest sideways speed (m/s) the layout and the proof reckon with. */
export const lateralCap = (v) => v * Math.sin(SHIP.MANUAL ? SHIP.MANUAL.FAIR_ANGLE : SHIP.STEER_ANGLE);

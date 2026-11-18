import { SHIP, DRIFT, CLOCK } from '../core/Constants.js';

// How fast the game asks you to go, and how much time it gives you for it.
const lerp = (a, b, t) => a + (b - a) * t;

export const difficulty = (s) => Math.min(1, Math.max(0, s) / 7500);

/** Cruise speed (m/s) at distance s. */
export const cruiseSpeed = (s) => lerp(SHIP.CRUISE[0], SHIP.CRUISE[1], difficulty(s));

/** The fastest the ship can ever be going at distance s: cruise plus the biggest boost. */
export const topSpeed = (s) => cruiseSpeed(s) * (1 + DRIFT.MAX_GAIN);

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
export function parTime(s0, s1) {
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

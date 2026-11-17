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

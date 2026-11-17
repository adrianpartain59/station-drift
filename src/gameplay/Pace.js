import { SHIP, CLOCK, MAX_BOOST_GAIN } from '../core/Constants.js';

// How fast the game asks you to go, and how much time it gives you for it.
const lerp = (a, b, t) => a + (b - a) * t;

export const difficulty = (s) => Math.min(1, Math.max(0, s) / 7500);

/** Cruise speed (m/s) at distance s. */
export const cruiseSpeed = (s) => lerp(SHIP.CRUISE[0], SHIP.CRUISE[1], difficulty(s));

/** The fastest the ship can ever be going at distance s: cruise plus the biggest boost. */
export const topSpeed = (s) => cruiseSpeed(s) * (1 + MAX_BOOST_GAIN);

/** Share of cruise speed the clock's par assumes at distance s. */
export function pace(s) {
  const d = difficulty(s);
  const base = lerp(CLOCK.PACE[0], CLOCK.PACE[1], d);
  const late = Math.min(1, Math.max(0, (s - 7500) / 12500));
  return lerp(base, CLOCK.PACE_LATE, late);
}

/** Seconds the clock gives for the stretch s0..s1. */
export function parTime(s0, s1) {
  const mid = (s0 + s1) / 2;
  return (s1 - s0) / (cruiseSpeed(mid) * pace(mid));
}

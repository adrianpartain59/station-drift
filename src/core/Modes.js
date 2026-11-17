import { SHIP, DRIFT, CLOCK, SCORE, FAIR, COURSE, MODE } from './Constants.js';

// The two ways to play. EASY is exactly the numbers in Constants.js. HARD is those numbers with the
// changes below laid over them. applyMode() rewrites the live constant objects, so call it before a
// run is built (the game does, on the title screen) and nothing else needs to know modes exist.

const GROUPS = { SHIP, DRIFT, CLOCK, SCORE, FAIR, COURSE };
const clone = (v) => (Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);
const BASE = clone(GROUPS);

export const MODES = {
  easy: {
    label: 'EASY',
    blurb: 'The ship carries itself round every bend. Learn the slide.',
    set: {},
  },
  hard: {
    label: 'HARD',
    blurb: 'Faster. Lasers. A slide only pays in a real bend.',
    set: {
      SHIP: {
        CRUISE: [46, 60],        // was 38 -> 50
        START_SPEED: 32,
        GRIP: 37,                // a little more bite, so steering at the higher speed is not heavier
        STEER_ANGLE: 0.2,
        CRASH_KEEP: 0.26,
        HIT_KEEP: [0.8, 0.45],
      },
      DRIFT: {
        // The slide commits. On a straight it turns at least this tight, almost at once, and earns next
        // to no charge, so it cannot be tapped down a straight for boosts. In a real bend nothing changes:
        // it follows the bend, and steering against it runs it wider.
        R_HOOK: 58,
        R_COUNTER: 135,
        HOOK_DELAY: 0.08,
        HOOK_RAMP: 0.22,
        ARM_LOOK: 0.26,          // the button held early starts the slide later: there is less straight to spend
        CHARGE_STRAIGHT: 0.15,
        SLIP: 0.5,               // and the nose swings further (about 29 degrees)
        SLIP_IN: 0.22,
      },
      FAIR: {
        LANE: [2.7, 2.1],
        COMFORT: [0.72, 0.86],
        REACT_FIRST: [0.5, 0.42],
        REACT_NEXT: [0.24, 0.2],
        SEE: [1.25, 1.05],
        MIN_GAP: 24,
        OPEN: 5.4,
        NO_ROWS_BEFORE: 260,
        SLIDE: 0.6,
      },
      COURSE: { SPANS: true, LASERS: true, BEND_CLOSURE: [0.5, 0.85], MAX_ROWS: 6 },
      CLOCK: { CARRY: 7 },
    },
  },
};

/** Make `name` the live rule set. Unknown names fall back to easy. */
export function applyMode(name) {
  const mode = MODES[name] ? name : 'easy';
  for (const [g, target] of Object.entries(GROUPS)) {
    for (const k of Object.keys(target)) if (!(k in BASE[g])) delete target[k];
    Object.assign(target, clone(BASE[g]), clone(MODES[mode].set[g] || {}));
  }
  MODE.name = mode;
  return mode;
}

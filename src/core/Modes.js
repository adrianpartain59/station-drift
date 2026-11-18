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
    blurb: 'Faster. Lasers. You steer every bend yourself, and the slide runs wide.',
    set: {
      SHIP: {
        CRUISE: [46, 60],        // was 38 -> 50
        START_SPEED: 32,
        CRASH_KEEP: 0.26,
        HIT_KEEP: [0.8, 0.45],
        // Fully manual handling (ShipPhysics.stepManual). Nothing steers for you.
        MANUAL: {
          TURN_RATE: 2.3,        // rad/s the nose turns with a key held in. No angle it stops at.
          STEER_IN: 7,           // 1/s: how fast a held key builds to that rate (a tap is a nudge)
          STEER_OUT: 18,         // 1/s: how fast it lets go
          GRIP_RATE: 11,         // 1/s: how hard the direction of travel is pulled round to the nose, with grip
          SLIDE_GRIP: 3.5,       // 1/s: the same while the drift button is held. Lower = slides wider
          LET_GO: 14,            // 1/s: how fast grip goes when the button goes down
          HOOK_UP: 6,            // 1/s: ...and comes back when it is let go
          SLIDE_DRAG: 5,         // m/s^2 lost per radian of slip while sliding
          CHARGE_SLIP: [0.08, 0.28], // slip (rad) at which charge starts, and at which it charges at full rate
          CHARGE_GAIN: 1.7,      // bends go by faster here and a slide takes a moment to build: charge this much quicker
          DETENT: 0.03,          // rad: on a straight, keys up, a nose this close to dead ahead settles dead ahead
          DETENT_RATE: 5,
          WALL_TURN: 1.6,        // rad/s a wall pushes the nose round while the ship rubs along it
          MAX_ANGLE: 1.25,       // rad: the ship cannot be turned to face back up the corridor
          // what the course layout and the proof may assume of this ship (gameplay/Pace.js):
          FAIR_SHARE: 0.45,      // this share of the turn rate
          FAIR_ANGLE: 0.22,      // and a nose up to this far (rad, about 13 degrees) off the corridor when a row appears
        },
      },
      DRIFT: {
        CHARGE_STRAIGHT: 0.15,   // a slide only pays in a real bend
      },
      FAIR: {
        LANE: [2.7, 2.1],
        COMFORT: [0.66, 0.82],
        REACT_FIRST: [0.56, 0.48],
        REACT_NEXT: [0.3, 0.24],
        SEE: [1.25, 1.05],
        MIN_GAP: 24,
        OPEN: 5.4,
        NO_ROWS_BEFORE: 260,
      },
      COURSE: { SPANS: true, LASERS: true, BEND_CLOSURE: [0.35, 0.6], CLOSE_INSIDE: true, MAX_ROWS: 7 },
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

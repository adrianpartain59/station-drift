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
          // --- steering ---
          TURN_RATE: 1.35,       // rad/s the nose turns with a key held in (assisted was about 0.7, the first manual 2.3)
          TURN_MAX: 1.85,        // ...winding up to this if the key stays down, for the tightest bends
          WIND: [0.4, 1.0],      // s of holding over which it winds up
          STEER_IN: 6,           // 1/s: how fast a held key builds to its rate (a tap is a nudge)
          STEER_OUT: 18,         // 1/s: how fast it lets go
          GRIP_RATE: 11,         // 1/s: how hard the direction of travel is pulled round to the nose, with grip
          // --- the slide (drift button held): same keys, the ship answers differently ---
          SLIDE_ANGLE: 0.45,     // rad: the drift angle a steer key swings the nose to at once (the flick)
          SLIDE_SWING: 3.5,      // rad/s: how fast it swings there (and across, on the other key)
          SLIDE_WIND: 0.7,       // rad/s: how fast the angle then deepens while the key stays down...
          MAX_SLIP: 0.95,        // rad: ...as far as this, the most the nose can be turned in from the direction of travel
          SLIDE_RETURN: 3,       // 1/s: keys up, how fast the nose eases back toward the way the ship is going
          SLIDE_GRIP: 2.4,       // 1/s: how hard travel is pulled to the nose once the slide has bitten. The ship turns
                                 //      at SLIDE_GRIP x angle: about 0.95 rad/s at SLIDE_ANGLE, 2.2 at MAX_SLIP
          SLIDE_LOOSE: 0.5,      // 1/s: ...and at the moment the button goes down: the ship breaks loose and runs wide
          BITE_TIME: 0.38,       // s from breaking loose to full bite
          // --- coming out of the slide: the nose swings back to the line of travel, the ship keeps its line ---
          EXIT_TIME: 0.32,       // s that takes
          EXIT_RATE: 11,         // 1/s: how fast the nose swings back
          EXIT_PULL: 3.0,        // 1/s: how much the ship is still pulled toward the nose at the moment of letting go
                                 //      (the rest of its grip comes back over EXIT_TIME). Higher = more of a tuck-in.
          LET_GO: 60,            // 1/s: how fast grip goes when the button goes down
          HOOK_UP: 6,            // 1/s: ...and comes back when it is let go
          SLIDE_DRAG: 5,         // m/s^2 lost per radian of slip while sliding
          CHARGE_SLIP: [0.08, 0.28], // slip (rad) at which charge starts, and at which it charges at full rate
          CHARGE_GAIN: 1.7,      // bends go by faster here and a slide takes a moment to build: charge this much quicker
          // --- small print ---
          DETENT: 0.03,          // rad: on a straight, keys up, a nose this close to dead ahead settles dead ahead
          DETENT_RATE: 5,
          WALL_TURN: 1.6,        // rad/s a wall pushes the nose round while the ship rubs along it
          MAX_ANGLE: 1.25,       // rad: the ship cannot be turned to face back up the corridor
          // what the course layout and the proof may assume of this ship (gameplay/Pace.js):
          FAIR_SHARE: 0.55,      // this share of the (un-wound) turn rate
          FAIR_ANGLE: 0.22,      // and a nose up to this far (rad, about 13 degrees) off the corridor when a row appears
        },
      },
      DRIFT: {
        CHARGE_STRAIGHT: 0.15,   // a slide only pays in a real bend
      },
      FAIR: {
        LANE: [2.7, 2.1],
        COMFORT: [0.68, 0.84],
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

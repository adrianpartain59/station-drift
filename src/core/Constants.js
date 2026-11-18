// Every tunable number lives here.

export const TRACK = {
  STEP: 1,               // metres between centreline samples
  MESH_STEP: 2,          // samples between sweep rings
  CHUNK: 48,             // samples per geometry chunk
  VIEW_AHEAD: 720,       // metres of world built ahead of the ship
  KEEP_BEHIND: 90,       // metres kept behind before disposal
  MAX_HEADING: 0.95,     // rad: path never turns further than this from world forward
  HEIGHT: 10,            // corridor ceiling height
  HOVER: 2.4,            // ship height above the floor
  STATION_W: [7.5, 10.5],// corridor half-width range
  HALL_W: 13,            // wide hall half-width
  SPACE_W: 15,           // open-space lane half-width
  W_RATE: 0.16,          // max half-width change per metre
  HULL_PAD: 6,           // hull thickness around the corridor
  START_SPACE: 150,      // open space before the first station
};

// ---------------------------------------------------------------------------------------------
// Handling. The ship lives in the corridor's own frame: s along the centreline, x across it,
// theta = angle of travel relative to the corridor (+ right). Everything below is in metres,
// seconds and radians.
// ---------------------------------------------------------------------------------------------
export const SHIP = {
  RADIUS: 1.25,          // collision circle against walls, and the size obstacles are laid out for
  HIT_RADIUS: 1.0,       // what actually counts as hitting an obstacle (smaller than the hull: forgiving)
  WALL_INSET: 0.85,      // station ribs and light bars stand this far proud of the wall
  CRUISE: [38, 50],      // cruise speed at difficulty 0 and 1 (difficulty = distance / 7.5 km)
  START_SPEED: 26,
  ACCEL: 12,             // toward cruise: speed you throw away takes a while to come back
  COAST: 9,              // back down to cruise after a boost
  BRAKE_DECEL: 36,
  BRAKE_FACTOR: 0.56,    // brake holds this fraction of cruise
  DISPLAY_KMH: 7.2,      // HUD speed = m/s x this (ships read faster than cars)

  // Grip steering: left/right asks for a travel angle across the corridor; the ship can only
  // swing toward it as fast as its lateral grip allows. Grip is an acceleration, so the faster
  // you go the wider the tightest turn: R = v^2 / GRIP. That is what makes the drift matter.
  GRIP: 31,              // m/s^2 of lateral acceleration
  MAX_YAW: 1.7,          // rad/s cap at low speed
  STEER_ANGLE: 0.22,     // rad: travel angle held at full steer (about 12.5 degrees)
  STEER_SMOOTH: 14,      // 1/s: key press -> steering ramp
  STEER_TAU: 0.1,        // s: how eagerly the ship swings to the asked angle
  ALIGN_TAU: 0.16,       // s: hands off, it settles back along the corridor
  ASSIST_K: 1 / 110,     // bends gentler than this are followed for you
  ASSIST_K_OFF: 1 / 78,  // tighter than this, hands off only half-follows (you must steer or drift)
  HANDS_OFF: 0.45,       // share of a real bend the ship still follows with no input
  GUARD: 0.8,            // share of turning ability the wall guard assumes when it limits your angle
  SAVE: 0.6,             // the guard turns the ship away by itself once stopping would use this share of the gap
  NOSE_LEAD: 0.2,        // s: nose points this far ahead of the turn in grip (liveliness only)

  // Walls: a glancing touch slides along, a square hit bounces and costs speed. Never damage.
  GRAZE_SPEED: 7,        // m/s into the wall below which it is a graze
  GRAZE_KEEP: 0.975,
  SCRAPE_DRAG: 11,       // m/s^2 while rubbing
  HIT_KEEP: [0.84, 0.5], // speed kept on a hard hit: light .. square-on
  SCRUB: 20,             // m/s^2 lost while steering harder than grip can turn (running wide = slowing down)
  SCRUB_FLOOR: 0.55,     // ...but never below this share of cruise
  HIT_BOUNCE: 0.09,      // rad of rebound
  SPACE_SOFT: 0.35,      // open-space lane rails are energy fields: this much of a wall's penalty

  // Obstacles: you smash through, lose most of your speed and your combo, and flicker for a moment.
  CRASH_KEEP: 0.3,
  CRASH_MIN: 12,
  GHOST: 1.5,            // s of no-collision after a crash...
  GHOST_DIST: 55,        // ...and at least this many metres, so one set-piece can only ever cost you once

  // null = the assisted handling above (EASY). HARD replaces it with fully manual handling:
  // see core/Modes.js for the numbers and ShipPhysics.stepManual for what they do.
  MANUAL: null,
};

// The drift. Hold the button: the tail steps out, the ship carries itself round the bend, and
// left/right slide you across the corridor. Release to snap straight with the boost you charged.
export const DRIFT = {
  MIN_SPEED: 16,
  R_TIGHT: 19,           // tightest arc a drift can hold (the map's sharpest corner is 30 m)
  R_WIDE: 150,           // a drift always curves at least this much: on a straight it creeps inward...
  HOOK_DELAY: 0.14,      // ...but only after this long on the straight,
  HOOK_RAMP: 0.5,        // easing in over this long (so a late release at a bend exit is forgiven)
  INSIDE_GAP: 0.95,      // how close to the inside wall the guard lets a held slide settle
  R_COUNTER: 520,        // ...unless you steer against it, which nearly straightens the slide
  ANGLE: 0.21,           // rad: travel angle across the corridor at full steer while drifting
  TAU: 0.2,              // s: lateral response in a drift (heavier than grip: it slides)
  ARM_LOOK: 0.55,        // s: button held with no steer -> the drift starts itself this far before a bend
  ARM_K: 1 / 125,        // bends at least this tight count for that
  ENTRY: 0.16,           // s for the arc to build
  SPEED: 0.965,          // share of cruise held while sliding
  SLIP: 0.44,            // rad: nose angle into the bend (about 25 degrees)
  SLIP_IN: 0.2,          // more when steering into it
  SLIP_OUT: 0.2,         // less when steering against it
  SLIP_RATE: 9,          // 1/s
  FLICK: 0.14,           // rad of overshoot as the tail steps out
  CHARGE_APEX: 0.9,      // extra charge per second on the inside line (within APEX_ZONE of the inside wall)
  APEX_ZONE: 3.4,
  CHARGE_COUNTER: 0.45,  // charge rate while counter-steering a straight slide
  SWITCH_KEEP: 0.7,      // charge kept when the drift flips for an S-bend
  TIERS: [
    { at: 0.55, name: 'SPARK', color: 0x46c8ff, time: 0.7, gain: 0.12, clock: 0.4 },
    { at: 1.35, name: 'FLARE', color: 0xffa040, time: 1.1, gain: 0.16, clock: 0.8 },
    { at: 2.3,  name: 'NOVA',  color: 0xff4fd8, time: 1.6, gain: 0.2, clock: 1.4 },
  ],
  BOOST_ACCEL: 46,
  CHAIN_WINDOW: 4,       // s after a banked drift to start the next and keep the chain
  MAX_CHAIN: 8,
  PAD_TIME: 0.9,         // boost pads
  PAD_GAIN: 0.14,
  // Boosts are small in metres per second and big on screen (the camera sells them): the fastest the
  // ship can ever go is cruise + this, and the whole course is laid out and proved at that speed.
  MAX_GAIN: 0.2,
  // Share of the charge rate a slide earns where the corridor is not bending (hard mode lowers it,
  // so a slide cannot be worked down a straight for boosts).
  CHARGE_STRAIGHT: 1,
};
// ---------------------------------------------------------------------------------------------
// Fairness rules for the course layout (gameplay/Course.js). Everything the ship can hit is a
// static box or post. Rows of them are laid around a safe line, and the gap between two rows is
// never shorter than the ship needs, at the fastest speed it can have there (cruise + the biggest
// boost), to see the row, react, and slide from the worst place it could be into the opening,
// using only part of its steering. tools/verify re-proves all of this from the outside.
// ---------------------------------------------------------------------------------------------
export const FAIR = {
  LANE: [3.3, 2.4],        // half-width (ship centre) of the safe lane, difficulty 0 .. 1
  COMFORT: [0.5, 0.68],    // share of lateral grip the layout assumes you use
  REACT_FIRST: [0.62, 0.5],// s to notice the first row of a set
  REACT_NEXT: [0.3, 0.24], // s between rows inside a set (you already saw it coming)
  SEE: [1.5, 1.2],         // s any row must be in plain sight before you reach it
  MIN_GAP: 30,             // m between rows, whatever the maths says
  PAD: 0.35,               // extra clearance around every obstacle when planning the lane
  OPEN: 6.3,               // m: no opening is ever narrower than this (the hull is 2.5 m)
  NO_ROWS_BEFORE: 330,     // m: the first stretch is a warm-up
  SLIDE: 1,                // share of its top sideways speed the ship may already have when a row appears
};

// What the course is made of. Easy mode is the plain set; hard mode switches the rest on (core/Modes.js).
export const COURSE = {
  SPANS: false,            // lay rows over whole straights (several map pieces) instead of piece by piece
  LASERS: false,           // laser gates, sweeping lasers, laser-fenced lane closures
  BEND_CLOSURE: [0, 0],    // chance (difficulty 0 .. 1) that a bend has a lane fenced off through it
  CLOSE_INSIDE: false,     // only ever fence off the inside lane of a bend
  MAX_ROWS: 4,             // most set-pieces in one zone
};

// Which rule set is live. Changed only through core/Modes.js applyMode().
export const MODE = { name: 'easy' };

// The clock. It is the only thing that ends a run. Time comes from two places:
//  - every gate adds the par time for the stretch to the next gate, at a pace that starts generous
//    and, a few kilometres in, asks for more than cruise speed alone can give;
//  - every drift you bank adds time on the spot (see DRIFT.TIERS[].clock). That is what makes up the difference.
// You never carry more than CARRY seconds of slack through a gate, so the clock stays tight all run.
export const CLOCK = {
  START: 18,
  CARRY: 8,
  // [distance m, share of cruise speed the par assumes]
  PACE: [[0, 0.84], [1000, 0.96], [2500, 1.08], [5000, 1.14], [8000, 1.19], [12000, 1.25], [18000, 1.31], [40000, 1.4]],
  LOW: 6,                // warning below this
  COAST_DECEL: 16,       // engine cut when the clock hits zero; a gate reached while coasting revives it
};

export const SCORE = {
  PER_METRE: 1,
  DRIFT_PER_METRE: 9,    // while sliding, before tier and chain multipliers
  COIN: 40,
  COIN_COMBO_WINDOW: 1.2,
  NEAR_MISS: 200,
  NEAR_MISS_DIST: 1.1,   // clearance below this when passing an obstacle
  GATE: 400,
  CHAIN_STEP: 0.5,       // score multiplier gained per chained drift
};

export const CAMERA = {
  FOV: 70,
  FOV_SPEED: 13,
  FOV_BOOST: 11,
  CHASE_DIST: 10.4,
  CHASE_HEIGHT: 3.6,
  LOOK_AHEAD: 15,
  SMOOTH: 6.5,
  FP_FOV: 84,
  NEAR: 0.05,
  FAR: 20000,
};

export const RENDER = {
  MAX_DPR: 1.6,
  EXPOSURE: 1.0,
  BLOOM_STRENGTH: 0.5,
  BLOOM_RADIUS: 0.3,
  BLOOM_THRESHOLD: 1.0,
  FOG_COLOR: 0x050714,
  FOG_NEAR: 170,
  FOG_FAR: 700,
};

// Neon liveries for stations: [primary strip, secondary strip, accent].
export const PALETTES = [
  [0x37e6ff, 0xff3fb4, 0xfff1a8],
  [0xffa63d, 0x2ff3d2, 0xffffff],
  [0xb06bff, 0xff5f7e, 0x9af7ff],
  [0x7dff6b, 0x3b8cff, 0xfff3c2],
  [0xff4a4a, 0xffd23f, 0xa8e8ff],
];

export const STATION_NAMES = [
  'KESTREL-9', 'SHINJI RING', 'HALCYON YARD', 'ORIX DOCK', 'MERIDIAN 4', 'TAKANE SPIRE',
  'VESPER HUB', 'NAGI ORBITAL', 'CORVID WORKS', 'SABLE GATE', 'HIKARI LOOP', 'ARGENT DEEP',
];

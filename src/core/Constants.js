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
  CRUISE: [38, 54],      // cruise speed at difficulty 0 and 1 (difficulty = distance / 7.5 km)
  START_SPEED: 26,
  ACCEL: 15,             // toward cruise
  COAST: 9,              // back down to cruise after a boost
  BRAKE_DECEL: 36,
  BRAKE_FACTOR: 0.56,    // brake holds this fraction of cruise
  DISPLAY_KMH: 7.2,      // HUD speed = m/s x this (ships read faster than cars)

  // Grip steering: left/right asks for a travel angle across the corridor; the ship can only
  // swing toward it as fast as its lateral grip allows. Grip is an acceleration, so the faster
  // you go the wider the tightest turn: R = v^2 / GRIP. That is what makes the drift matter.
  GRIP: 31,              // m/s^2 of lateral acceleration
  MAX_YAW: 1.7,          // rad/s cap at low speed
  STEER_ANGLE: 0.27,     // rad: travel angle held at full steer (about 15 degrees)
  STEER_SMOOTH: 14,      // 1/s: key press -> steering ramp
  STEER_TAU: 0.1,        // s: how eagerly the ship swings to the asked angle
  ALIGN_TAU: 0.16,       // s: hands off, it settles back along the corridor
  ASSIST_K: 1 / 110,     // bends gentler than this are followed for you
  ASSIST_K_OFF: 1 / 78,  // tighter than this, hands off means straight on (you must steer or drift)
  GUARD: 0.8,            // share of turning ability the wall guard assumes when it limits your angle
  NOSE_LEAD: 0.2,        // s: nose points this far ahead of the turn in grip (liveliness only)

  // Walls: a glancing touch slides along, a square hit bounces and costs speed. Never damage.
  GRAZE_SPEED: 7,        // m/s into the wall below which it is a graze
  GRAZE_KEEP: 0.985,
  SCRAPE_DRAG: 5,        // m/s^2 while rubbing
  HIT_KEEP: [0.9, 0.55], // speed kept on a hard hit: light .. square-on
  HIT_BOUNCE: 0.09,      // rad of rebound
  SPACE_SOFT: 0.35,      // open-space lane rails are energy fields: this much of a wall's penalty

  // Obstacles: you smash through, lose most of your speed and your combo, and flicker for a moment.
  CRASH_KEEP: 0.34,
  CRASH_MIN: 12,
  GHOST: 1.5,            // s of no-collision after a crash
};

// The drift. Hold the button: the tail steps out, the ship carries itself round the bend, and
// left/right slide you across the corridor. Release to snap straight with the boost you charged.
export const DRIFT = {
  MIN_SPEED: 16,
  R_TIGHT: 19,           // tightest arc a drift can hold (the map's sharpest corner is 30 m)
  R_WIDE: 150,           // a drift always curves at least this much: on a straight it creeps inward
  R_COUNTER: 520,        // ...unless you steer against it, which nearly straightens the slide
  ANGLE: 0.24,           // rad: travel angle across the corridor at full steer while drifting
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
    { at: 0.55, name: 'SPARK', color: 0x46c8ff, time: 0.7, gain: 0.2 },
    { at: 1.35, name: 'FLARE', color: 0xffa040, time: 1.05, gain: 0.26 },
    { at: 2.3,  name: 'NOVA',  color: 0xff4fd8, time: 1.5, gain: 0.32 },
  ],
  BOOST_ACCEL: 46,
  CHAIN_WINDOW: 4,       // s after a banked drift to start the next and keep the chain
  MAX_CHAIN: 8,
  PAD_TIME: 0.9,         // boost pads
  PAD_GAIN: 0.24,
};
export const MAX_BOOST_GAIN = 0.32;

// The clock. Every gate adds time for the stretch to the next one at a par pace that starts
// generous and tightens with distance. Out of time = run over.
export const CLOCK = {
  START: 26,
  PACE: [0.68, 0.9],     // share of cruise speed the par assumes, difficulty 0 .. 1
  PACE_LATE: 0.95,       // by 20 km
  MAX: 99.9,
  LOW: 8,                // warning below this
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
  CHASE_DIST: 9.2,
  CHASE_HEIGHT: 3.3,
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

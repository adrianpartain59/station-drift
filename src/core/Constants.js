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

export const SHIP = {
  RADIUS: 1.15,
  BASE_SPEED: 66,
  MAX_BASE_SPEED: 128,
  SPEED_RAMP: 0.55,      // base speed gained per second of play
  ACCEL: 26,
  DECEL: 34,
  BRAKE_FACTOR: 0.62,
  STEER_RATE: 1.55,      // rad/s of facing change at full lock
  STEER_SMOOTH: 9,
  ALIGN_RATE: 1.6,       // facing relaxes to the track with no input
  GRIP: 7.5,             // how fast travel direction follows facing
  MAX_FACING: 1.25,
  MAX_TRAVEL: 1.05,
  DRIFT_DRAG: 0.07,      // speed lost per second per radian of slip
  BOOST_SPEED: 46,
  PAD_BOOST_TIME: 1.1,
  WALL_DRAG: 26,         // speed lost per second while scraping
  WALL_DAMAGE: 9,        // hull lost per second of head-on scrape
  WALL_BOUNCE: 0.35,
  CRASH_DAMAGE: 34,
  CRASH_SPEED_KEEP: 0.5,
  INVULN: 1.2,
  HULL: 100,
};

// The hop: W / up arrow. Tap for a short hop, hold for a full one. Each hop spends thrust,
// which refills from coins, near misses, drift boosts and a slow trickle. It clears low things
// (spinner bars, tripwires, single crates, small debris), never full-height ones, and hopping
// into an overhead girder is a crash, so it can't be used to skip everything.
export const HOP = {
  VEL: 10.5,             // launch speed (m/s); full hop apex ~2 m, ~0.75 s airtime
  GRAV: 28,
  CUT: 0.45,             // releasing the key on the way up keeps this much upward speed
  COST: 0.34,            // thrust per hop (a full meter is ~3 hops)
  REGEN: 0.03,           // thrust per second, trickle
  START: 0.4,            // thrust at the start of a run
  AIR_STEER: 0.6,
  SHIP_HALF: 0.45,       // ship's half-height for vertical collision
  AIR_MISS: 0.8,         // clearing a low obstacle by less than this = AIR MISS bonus
  COOLDOWN: 0.12,
};

// Drift charge tiers: release a drift to cash in a mini-turbo.
export const DRIFT = {
  TIERS: [
    { at: 0.5,  name: 'SPARK', color: 0x46c8ff, boost: 0.55, meter: 0.08 },
    { at: 1.2,  name: 'FLARE', color: 0xffa040, boost: 0.95, meter: 0.16 },
    { at: 2.1,  name: 'NOVA',  color: 0xff4fd8, boost: 1.5,  meter: 0.28 },
  ],
  R_TIGHT: 30,           // arc radius (m) holding steer into the drift
  R_NEUTRAL: 55,         // arc radius with no steer held
  R_WIDE: 115,           // arc radius steering away
  ARC_SMOOTH: 3.5,       // how quickly the arc follows steering (lower = steadier)
  SLIP_MIN: 0.38,        // nose angle (rad) on a wide arc, ~22 deg
  SLIP_MAX: 0.68,        // nose angle on a tight arc, ~39 deg
  SLIP_IN: 4.5,          // how fast the nose swings in
  EXIT_TIME: 0.45,       // seconds of straightening after release
  EXIT_STRAIGHTEN: 9,
  EXIT_ALIGN: 2.2,
  MIN_SLIP: 0.2,         // slip below this does not count as a drift
  CHARGE_BASE: 0.95,     // charge per second while held
  CHARGE_TIGHT: 0.85,    // extra per second on the tightest arc
  POINTS_RATE: 1.6,      // points per metre per radian
  CHAIN_WINDOW: 2.2,     // seconds between drifts to keep the chain
  MAX_CHAIN: 8,
};

export const SCORE = {
  PER_METRE: 1,
  COIN: 50,
  COIN_COMBO_WINDOW: 1.4,
  NEAR_MISS: 250,
  NEAR_MISS_DIST: 2.4,
  AIR_MISS: 350,
};

export const CAMERA = {
  FOV: 68,
  FOV_SPEED: 16,
  FOV_BOOST: 9,
  CHASE_DIST: 10.5,
  CHASE_HEIGHT: 3.9,
  LOOK_AHEAD: 14,
  SMOOTH: 7,
  FP_FOV: 82,
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

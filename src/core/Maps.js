import { Track } from '../level/Track.js';
import { SkywayTrack } from '../level/TrackSkyway.js';
import { SHIP, DRIFT, CLOCK, SCORE, FAIR, COURSE } from './Constants.js';
import { applyMode } from './Modes.js';

// The maps. Each is a track generator: same arrays, same `pieces` contract, a pure function of the seed.
// CLASSIC is the original map (stations with short open-space links) and is kept exactly as it was:
// tools/verify/fingerprint.mjs proves it. SKYWAY turns it inside out: wide, hilly, always-bending open
// air with short ship stations between.
const PACE_SKYWAY_EASY = [[0, 0.84], [1000, 0.97], [2500, 1.11], [5000, 1.19], [8000, 1.25], [12000, 1.31], [18000, 1.38], [40000, 1.47]];
const PACE_SKYWAY_HARD = [[0, 0.84], [1000, 1.0], [2500, 1.18], [5000, 1.3], [8000, 1.38], [12000, 1.45], [18000, 1.52], [40000, 1.62]];

export const MAPS = {
  skyway: {
    label: 'SKYWAY',
    blurb: 'Wide open road, always bending, up and down. Ships to thread between.',
    make: (seed) => new SkywayTrack(seed),
    // What this map changes in the rules, per mode, laid over the mode's own numbers. Only the clock:
    // the bends here are long, so a good slide banks far more time per kilometre than on the classic
    // map, and the par pace has to ask for more or the clock would never bite. Tuned so the scripted
    // drivers last about as long as they do on CLASSIC (tools/verify prints how far each gets).
    set: {
      easy: { CLOCK: { PACE: PACE_SKYWAY_EASY } },
      hard: { CLOCK: { PACE: PACE_SKYWAY_HARD } },
    },
  },
  classic: {
    label: 'CLASSIC',
    blurb: 'The original: long stations, short hops of open space.',
    make: (seed) => new Track(seed),
  },
};

/** The map a new player starts on, until they pick the other one (their pick is remembered). */
export const DEFAULT_MAP = 'skyway';

export const mapName = (name) => (MAPS[name] ? name : DEFAULT_MAP);
export const makeTrack = (name, seed) => MAPS[mapName(name)].make(seed);

const GROUPS = { SHIP, DRIFT, CLOCK, SCORE, FAIR, COURSE };
const clone = (v) => (Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);

/**
 * Make `mode` on `map` the live rule set: the mode's numbers (core/Modes.js), then whatever the map
 * lays over them. CLASSIC lays nothing over, so it is exactly the mode. Returns the mode's name.
 */
export function applyGame(mode, map) {
  const m = applyMode(mode);
  const set = MAPS[mapName(map)].set?.[m] || {};
  for (const [g, vals] of Object.entries(set)) Object.assign(GROUPS[g], clone(vals));
  return m;
}

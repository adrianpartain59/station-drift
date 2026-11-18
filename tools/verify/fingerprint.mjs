#!/usr/bin/env node
// Fingerprints of the CLASSIC map: its course layout and the trace of the autopilot driving it, in
// each mode. The classic map is meant to stay exactly as it was when the second map was added (and
// EASY exactly as it was when HARD was split off). Run this after any change: if a hash moves, the
// classic game has changed.
//
//   node tools/verify/fingerprint.mjs            prints both hashes and says whether they match
//   node tools/verify/fingerprint.mjs --mode hard   one mode only
//
// The EASY hash is the original one and is computed exactly as it always was. The HARD hash was
// recorded from main @ 4acc798, before any shared code was touched for the second map; it also
// covers what only hard has (sweeping-laser timing, the nose angle, the live grip).
import { createHash } from 'node:crypto';
import { Track } from '../../src/level/Track.js';
import { Course } from '../../src/gameplay/Course.js';
import { ShipPhysics } from '../../src/gameplay/ShipPhysics.js';
import { Autopilot } from '../../src/gameplay/Autopilot.js';

const EXPECTED = {
  easy: '4c21b3290adce23fce7fb16effeb6a4210fd06ff726e17ecbc97e7dadf0a89a3',
  hard: '7df664ceb61d4e5b8b466b2a50971d58aae79508b606683e76f2c5c0402de67f',
};
const modes = await import('../../src/core/Modes.js').catch(() => null);
const only = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : null;
const r = (v, n) => +(+v || 0).toFixed(n);

function fingerprint(mode) {
  if (modes) modes.applyMode(mode);
  const hard = mode === 'hard';
  const h = createHash('sha256');
  for (const seed of [1, 2, 3, 42, 777, 5008]) {
    const T = new Track(seed); T.ensure(9000); const C = new Course(T, seed);
    h.update(JSON.stringify(C.obstacles.map((o) => (hard
      ? [o.kind, r(o.s, 3), r(o.x, 3), o.r ?? 0, r(o.hw, 3), r(o.hl, 3), r(o.bx, 3), r(o.amp, 3), r(o.om, 4), r(o.ph, 4), o.side ?? 0]
      : [o.kind, +o.s.toFixed(3), +o.x.toFixed(3), o.r ?? 0, o.hw ?? 0, o.hl ?? 0]))));
    h.update(JSON.stringify(C.coins.map((c) => [+c.s.toFixed(3), +c.x.toFixed(3)])));
    h.update(JSON.stringify(C.gates.map((g) => [g.s, g.kind])) + JSON.stringify(C.pads.map((p) => [p.s, p.x])) + JSON.stringify(C.signs.map((g) => [+g.s.toFixed(2), g.side, g.level])));
    // handling: the bot drives 3 km; any change to physics or planner changes this trace
    const p = new ShipPhysics(T, () => {}); const bot = new Autopilot(T, C, {});
    let t = 0; const dt = 1 / 120, tr = [];
    const hooks = { crash: () => p.crash(), nearMiss() {}, coin() {}, pad: () => p.boost(0.9, 0.14, 0), gate() {} };
    while (p.s < 3000 && t < 400) {
      p.step(dt, bot.control(p, t)); C.update(p, hooks, t); t += dt;
      if (Math.floor(t * 120) % 60 === 0) tr.push(hard
        ? [r(p.s, 2), r(p.x, 3), r(p.theta, 4), r(p.psi, 4), r(p.v, 3), r(p.charge, 3), r(p.gripNow, 3), p.drift ? 1 : 0]
        : [+p.s.toFixed(2), +p.x.toFixed(3), +p.theta.toFixed(4), +p.v.toFixed(3), +p.charge.toFixed(3)]);
    }
    h.update(JSON.stringify(tr));
  }
  return h.digest('hex');
}

let ok = true;
for (const mode of only ? [only] : ['easy', 'hard']) {
  const got = fingerprint(mode);
  const same = got === EXPECTED[mode];
  ok = ok && same;
  console.log(`${mode.toUpperCase()}  ${got}  ${same ? 'classic map unchanged.' : 'CLASSIC MAP HAS CHANGED (expected ' + EXPECTED[mode] + ')'}`);
}
process.exit(ok ? 0 : 1);

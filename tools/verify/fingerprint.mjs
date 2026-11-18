#!/usr/bin/env node
// Fingerprint of EASY mode: its course layout and the trace of the autopilot driving it.
// EASY is meant to stay exactly as it was when HARD was split off. Run this after any change:
// if the hash moves, easy mode has changed.
//
//   node tools/verify/fingerprint.mjs            prints the hash and says whether it matches
//
// Expected: 4c21b3290adce23fce7fb16effeb6a4210fd06ff726e17ecbc97e7dadf0a89a3
import { createHash } from 'node:crypto';
import { Track } from '../../src/level/Track.js';
import { Course } from '../../src/gameplay/Course.js';
import { ShipPhysics } from '../../src/gameplay/ShipPhysics.js';
import { Autopilot } from '../../src/gameplay/Autopilot.js';

const EXPECTED = '4c21b3290adce23fce7fb16effeb6a4210fd06ff726e17ecbc97e7dadf0a89a3';
const modes = await import('../../src/core/Modes.js').catch(() => null);
if (modes) modes.applyMode('easy');
const h = createHash('sha256');
for (const seed of [1, 2, 3, 42, 777, 5008]) {
  const T = new Track(seed); T.ensure(9000); const C = new Course(T, seed);
  h.update(JSON.stringify(C.obstacles.map((o) => [o.kind, +o.s.toFixed(3), +o.x.toFixed(3), o.r ?? 0, o.hw ?? 0, o.hl ?? 0])));
  h.update(JSON.stringify(C.coins.map((c) => [+c.s.toFixed(3), +c.x.toFixed(3)])));
  h.update(JSON.stringify(C.gates.map((g) => [g.s, g.kind])) + JSON.stringify(C.pads.map((p) => [p.s, p.x])) + JSON.stringify(C.signs.map((g) => [+g.s.toFixed(2), g.side, g.level])));
  // handling: the bot drives 3 km; any change to physics or planner changes this trace
  const p = new ShipPhysics(T, () => {}); const bot = new Autopilot(T, C, {});
  let t = 0; const dt = 1 / 120, tr = [];
  const hooks = { crash: () => p.crash(), nearMiss() {}, coin() {}, pad: () => p.boost(0.9, 0.14, 0), gate() {} };
  while (p.s < 3000) { p.step(dt, bot.control(p, t)); C.update(p, hooks, t); t += dt; if (Math.floor(t * 120) % 60 === 0) tr.push([+p.s.toFixed(2), +p.x.toFixed(3), +p.theta.toFixed(4), +p.v.toFixed(3), +p.charge.toFixed(3)]); }
  h.update(JSON.stringify(tr));
}
const got = h.digest('hex');
console.log(got);
console.log(got === EXPECTED ? 'EASY mode unchanged.' : 'EASY MODE HAS CHANGED (expected ' + EXPECTED + ')');
process.exit(got === EXPECTED ? 0 : 1);

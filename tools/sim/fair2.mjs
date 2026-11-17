const root = process.argv[2];
const { Track, vspan } = await import(root + '/src/level/Track.js');
const { ShipPhysics } = await import(root + '/src/gameplay/ShipPhysics.js');
const { Autopilot } = await import(root + '/src/gameplay/Autopilot.js');
const { GameState } = await import(root + '/src/core/GameState.js');
const { SHIP, HOP, TRACK } = await import(root + '/src/core/Constants.js');
const { EventBus } = await import(root + '/src/core/EventBus.js');
const DIST = +process.argv[3] || 3000;
let hops = 0, fails = 0; EventBus.on('ship:hop', () => hops++); EventBus.on('ship:hopFail', () => fails++);
const kinds = {}, overs = {};
function run(seed) {
  GameState.reset(); GameState.phase = 'playing';
  const tr = new Track(seed); tr.ensure(DIST + 800);
  const p = new ShipPhysics(tr), ap = new Autopilot(tr);
  const near = () => tr.obstacles.filter((o) => o.s > p.s - 2 && o.s < p.s + 80);
  const cost = (ph, xc, tt) => { let c = 0; for (const o of near()) { if (vspan(o)[0] > TRACK.HOVER + HOP.SHIP_HALF) continue; const du = o.s - ph.s; if (Track.clearance(o, 0, xc, tt + du / Math.max(30, ph.v)) < SHIP.RADIUS + 1) c += 14 / (1 + du / 25); } return c; };
  const hopCheck = (ph, tt) => { let block = null; for (const o of near()) { const du = o.s - ph.s; if (du < ph.v * 0.12 || du > ph.v * 0.32) continue; if (Track.clearance(o, 0, ph.x, tt + du / Math.max(30, ph.v)) >= SHIP.RADIUS + 0.4) continue; if (vspan(o)[1] > TRACK.HOVER + 1.9 - HOP.SHIP_HALF) return false; block = o; } if (!block) return false; for (const o of near()) if (o.type === 'overhead' && o.s - ph.s < ph.v * 0.85) return false; return true; };
  const dt = 1 / 120; let t = 0, crashes = 0;
  while (p.s < DIST && t < 200) {
    t += dt; GameState.time = t;
    p.step(dt, ap.control(p, cost, t, dt, hopCheck));
    for (const o of near()) {
      if (o.hit || Math.abs(o.s - p.s) > 9) continue;
      if (Track.clearance(o, p.s - o.s, p.x, t) < SHIP.RADIUS) {
        const [b0, b1] = vspan(o), y0 = p.y - HOP.SHIP_HALF, y1 = p.y + HOP.SHIP_HALF;
        if (y1 > b0 && y0 < b1) { o.hit = true; crashes++; kinds[o.type] = (kinds[o.type] || 0) + 1; p.crash(1); }
        else if (y0 >= b1) overs[o.type] = (overs[o.type] || 0) + 1;
      }
    }
  }
  return { seed, km: (p.s / 1000).toFixed(2), avgV: Math.round(p.s / t), crashes, hull: Math.round(GameState.hull) };
}
for (const seed of [3, 11, 42, 77, 1234]) console.log(JSON.stringify(run(seed)));
console.log('hops', hops, 'failed hops (no thrust)', fails, 'crashed into', JSON.stringify(kinds), 'cleared by hopping (frames)', JSON.stringify(overs));
const tr = new Track(3); tr.ensure(6000); const ty = {}; for (const o of tr.obstacles) ty[o.type] = (ty[o.type] || 0) + 1; console.log('obstacle mix (6 km)', JSON.stringify(ty));

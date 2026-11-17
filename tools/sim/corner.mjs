// Drive real station corners holding the drift the whole bend, three keyboard styles, from the outside line.
const root = process.argv[2];
const { Track } = await import(root + '/src/level/Track.js');
const { ShipPhysics } = await import(root + '/src/gameplay/ShipPhysics.js');
const { GameState } = await import(root + '/src/core/GameState.js');
const tr = new Track(3); tr.ensure(9000);
// find arcs: runs of constant nonzero k inside stations
const arcs = [];
for (let i = 1; i < tr.len - 1; i++) if (tr.K[i] !== 0 && tr.K[i - 1] === 0 && tr.ZONE[i] === 0) { let j = i; while (tr.K[j] === tr.K[i]) j++; arcs.push({ s0: i, s1: j, R: 1 / Math.abs(tr.K[i]), dir: Math.sign(tr.K[i]), ang: Math.abs(tr.K[i]) * (j - i) }); }
const styles = { 'tap into→hold': (t) => 1, 'into→none': (t) => (t < 0.15 ? 1 : 0), 'into→modulate': null };
const res = {};
for (const [name, fn] of Object.entries(styles)) {
  let clean = 0, tiers = [0, 0, 0, 0];
  for (const a of arcs.slice(0, 25)) {
    GameState.reset();
    const p = new ShipPhysics(tr); p.s = a.s0 - 6; const w = tr.W[a.s0]; p.x = a.dir * (w * 0.55); p.v = 82;
    const into = -a.dir; // left bend (k>0) → steer left (-1)
    let t = 0, hit = false;
    const dt = 1 / 120;
    while (p.s < a.s1 + 4 && t < 4) {
      t += dt;
      let steer;
      if (fn) steer = into * fn(t);
      else { // a player nudging: tighten when drifting wide, ease off when near the inside
        const inside = -a.dir * p.x; steer = t < 0.15 ? into : into * (inside > w * 0.35 ? -0.6 : inside < -w * 0.3 ? 1 : 0.2);
      }
      p.step(dt, { steer, drift: true, boost: false, brake: false });
      if (p.wallSide) hit = true;
    }
    const tier = GameState.driftTier;
    if (!hit) clean++;
    tiers[tier + 1]++;
  }
  res[name] = `${clean}/${Math.min(25, arcs.length)} corners clean; end tier none/spark/flare/nova = ${tiers.join('/')}`;
}
console.log('arcs', arcs.length, 'radius', Math.min(...arcs.map((a) => a.R)).toFixed(0), '-', Math.max(...arcs.map((a) => a.R)).toFixed(0));
console.log(res);

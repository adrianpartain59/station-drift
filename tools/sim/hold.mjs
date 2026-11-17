// What a keyboard player gets: hold drift + the steer key for N seconds on a straight, from the centre.
const root = process.argv[2];
const { Track } = await import(root + '/src/level/Track.js');
const { ShipPhysics } = await import(root + '/src/gameplay/ShipPhysics.js');
const { GameState } = await import(root + '/src/core/GameState.js');
for (const steerKey of [1, 0, -1]) {
  GameState.reset();
  const tr = new Track(3); tr.ensure(800);
  const p = new ShipPhysics(tr); p.s = 20; p.v = 80; p.w = 99;
  const dt = 1 / 120; const rows = [];
  // first frame needs a steer press to start the drift
  for (let i = 0; i <= 150; i++) {
    const steer = i < 2 ? 1 : steerKey;
    p.step(dt, { steer, drift: true, boost: false, brake: false });
    if (i % 30 === 0) rows.push(`${(i * dt).toFixed(2)}s phi=${(p.phi * 57.3).toFixed(0)}° nose=${(p.psi * 57.3).toFixed(0)}° x=${p.x.toFixed(1)} tier=${GameState.driftTier}`);
  }
  console.log(`steer ${steerKey > 0 ? 'INTO' : steerKey < 0 ? 'AWAY' : 'NONE'}: ` + rows.join(' | '));
}

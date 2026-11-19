import * as THREE from 'three';
import { TRACK } from '../core/Constants.js';

// Light that lands on things.
//
// The world's lamps and neon are unlit, glowing geometry: they shine through the bloom but light nothing. This
// adds what the renderer can afford, and leaves the rest to paint (level/WorldBuilder.js draws a pool of light on
// the deck under every lamp, and a wash along every neon strip):
//   the headlights   not a light at all. The look's haze pass (systems/Look.js) already knows how far away every
//                    pixel is, so it works out where that pixel is in the beams and brightens it there. A real
//                    spotlight was tried first: it either left the road dark (the beam only grazes it) or burnt out
//                    whatever stood up in front of it, and it cost a light on every lit pixel. This costs a few
//                    sums per pixel in a pass that runs anyway, and it lights the road, walls and obstacles alike.
//   the lamps        four real point lights, handed from lamp to lamp so they are always on the two rows nearest
//                    the ship, a pair to a row: these are what slide over the ship's paint and glass as it passes.
//                    A real light on every lamp is out of the question: every light is paid for on every lit
//                    pixel, and there are hundreds of lamps.
// The number of lights in the scene never changes while playing, so no shader is ever rebuilt mid-run.
// Every number is in LIGHTS.

export const LIGHTS = {
  // The headlights. Where they sit on the ship and which way they point (ship space: +z is the nose); `gap`:
  // how far each lamp is from the middle; `toe`: how far each points outward. `edge` and `core`: the cosines of
  // the beam's edge and of its bright middle. `reach`: where the beam ends (m); `half`: the distance at which
  // it is down to half. `gain`: how many times brighter a dark surface in the middle of the beam gets; `lift`:
  // light added even where the surface is black; `cap`: the most any surface is ever given, however near it is.
  // The chase camera sees the road ahead of the ship almost edge on, as a thin strip, so the beam is wide and
  // strong: what shows is a fan of lit road in front of the nose, and whatever stands in it.
  HEAD: { from: [0, 0.1, 2.6], dir: [0, -0.08, 1], gap: 0.6, toe: 0.12, edge: 0.84, core: 0.975, reach: 110, half: 22, gain: 8, lift: 16, cap: 0.8 },
  // (Shafts of light in the haze were tried and taken out: the camera looks down the beams from behind, so they
  // were either invisible or a ball of glare over the road ahead, and they cost eight steps a pixel.)
  // the tail lights and the thrusters, on the road behind the ship: the same numbers as the headlights
  TAIL: { from: [0, 0.25, -2.7], dir: [0, -0.32, -1], edge: 0.35, core: 0.93, reach: 26, half: 9, gain: 6, lift: 2.2 },
  // a roadside lamp, open air: every `every` metres, `out` metres outside the road's edge, `up` metres high
  LAMP: { every: 16, out: 0.6, up: 2.55, power: 60, reach: 46, decay: 1.5, colors: [0x37e6ff, 0xff3fb4] },
  // a rib's light inside a station or a ship: every 12 m, 2.2 m in from the wall (nearer the ship than the light
  // bar itself, so it is the ship's paint that catches it and not the wall beside the bar), halfway up
  RIB: { every: 12, out: -2.2, up: TRACK.HEIGHT * 0.55, power: 40, reach: 34, decay: 1.5 },
  // How rough the window glass is while these lights are on. As polished as it was (0.04), every lamp light showed
  // in it as a ball of glare hanging in the window; at this it is a faint sheen across the pane.
  GLASS: 0.7,
};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Lighting {
  /** `ship`: the ShipModel, whose nose the headlights are on. The lamp lights live in the scene. */
  constructor(scene, ship) {
    this.ship = ship;
    // two rows of lamps, a light on each side of each
    this.slots = [0, 1].map(() => ({ key: -1, lights: [-1, 1].map(() => { const l = new THREE.PointLight(0xffffff, 0, LIGHTS.LAMP.reach, LIGHTS.LAMP.decay); scene.add(l); return l; }) }));
    this.color = new THREE.Color();
    this.f = {};
    // where the headlights are, where they point, and which way is the ship's right (world space)
    this.headPos = new THREE.Vector3(); this.headDir = new THREE.Vector3(); this.headRight = new THREE.Vector3();
    this.tailPos = new THREE.Vector3(); this.tailDir = new THREE.Vector3();
    this.high = true;
    this.cfg = LIGHTS;   // for tuning from the console: __game.lighting.cfg
  }

  /** Low quality keeps the headlights (they cost next to nothing) and drops the four lamp lights (one rebuild of the shaders, on the key press). */
  setQuality(high) {
    this.high = high;
    for (const s of this.slots) for (const l of s.lights) l.visible = high;
  }

  /**
   * Put the lamp lights on the rows nearest the ship. `s`: how far along the track the ship is.
   * A row is lit from a little ahead of the ship until it is just behind; the window is under two rows long, so
   * there are never more than two rows in it and a light is dark when it changes rows.
   */
  update(track, s) {
    const H = LIGHTS.HEAD, m = this.ship.group;
    m.updateWorldMatrix(true, false);
    this.headPos.set(...H.from).applyMatrix4(m.matrixWorld);
    this.headDir.set(...H.dir).transformDirection(m.matrixWorld);
    this.headRight.set(-1, 0, 0).transformDirection(m.matrixWorld);   // the nose is +z and up is +y, so the ship's right is -x
    this.tailPos.set(...LIGHTS.TAIL.from).applyMatrix4(m.matrixWorld);
    this.tailDir.set(...LIGHTS.TAIL.dir).transformDirection(m.matrixWorld);
    if (!this.high) return;
    const rows = [];
    for (const [kind, zone] of [[LIGHTS.LAMP, 1], [LIGHTS.RIB, 0]]) {
      const E = kind.every, ahead = E * 1.45, behind = E * 0.5;
      for (let k = Math.ceil((s - behind) / E); k * E < s + ahead; k++) {
        const i = k * E;
        if (i < 0 || i >= track.len - 1 || track.ZONE[i] !== zone) continue;
        const d = i - s;
        const w = (1 - smooth(ahead * 0.55, ahead, d)) * smooth(-behind, -behind * 0.3, d);
        if (w > 0.001) rows.push({ key: zone * 1e7 + k, kind, i, k, w });
      }
    }
    rows.sort((a, b) => b.w - a.w); rows.length = Math.min(rows.length, this.slots.length);
    // a row keeps its lights for as long as it is lit; a new row takes whichever pair has gone dark
    for (const slot of this.slots) if (!rows.some((r) => r.key === slot.key)) slot.key = -1;
    for (const r of rows) {
      let slot = this.slots.find((sl) => sl.key === r.key);
      if (!slot) { slot = this.slots.find((sl) => sl.key === -1); slot.key = r.key; }
      r.slot = slot;
    }
    for (const slot of this.slots) {
      const r = rows.find((x) => x.slot === slot);
      if (!r) { for (const l of slot.lights) l.intensity = 0; continue; }
      const f = track.sample(r.i, this.f), w = track.W[r.i], K = r.kind;
      const hex = K.colors ? K.colors[r.k % 2] : (track.sections[track.SEC[r.i]].palette || [0x37e6ff])[0];
      slot.lights.forEach((l, n) => {
        const lx = (n ? 1 : -1) * (w + K.out);
        l.position.set(f.x - Math.cos(f.h) * lx, f.y + K.up, f.z + Math.sin(f.h) * lx);
        l.color.setHex(hex).lerp(this.color.set(0xffffff), 0.35);   // a lamp's light is paler than its lens
        l.intensity = K.power * r.w; l.distance = K.reach; l.decay = K.decay;
      });
    }
  }
}

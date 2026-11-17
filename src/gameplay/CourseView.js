import * as THREE from 'three';
import { TRACK } from '../core/Constants.js';
import { beamX } from './Course.js';

const H = TRACK.HEIGHT, HOVER = TRACK.HOVER;

// What the course looks like: obstacles, coins, boost pads, gates and the chevron boards on bends.
// Pure presentation. What the ship hits or collects is decided in Course.update().
//
// Visual language: anything you must not touch is lit in warm hazard colours (amber / red) and
// reaches from the floor to above the ship; the way through is marked in green, and the arrows on
// a barricade point at it.
export class CourseView {
  constructor(scene, track, course, mats, rockGeos) {
    this.scene = scene; this.track = track; this.course = course; this.m = mats; this.rockGeos = rockGeos;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.f = {};
    this.active = []; this.padsOn = []; this.gatesOn = []; this.signsOn = [];
    this.oi = 0; this.pi = 0; this.gi = 0; this.si = 0; this.ci = 0;
    this.own = []; // materials and textures to dispose

    this.geo = {
      box: new THREE.BoxGeometry(1, 1, 1),
      plane: new THREE.PlaneGeometry(1, 1),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
      oct: new THREE.CylinderGeometry(1, 1, 1, 8),
      ring: new THREE.TorusGeometry(1, 0.07, 8, 28).rotateX(Math.PI / 2),
      band: new THREE.CylinderGeometry(1.04, 1.04, 1, 18, 1, true),
      coin: new THREE.CylinderGeometry(0.62, 0.62, 0.16, 6).rotateX(Math.PI / 2),
      gem: new THREE.OctahedronGeometry(1),
      halo: new THREE.RingGeometry(0.94, 1, 44),
    };
    const keep = (x) => { this.own.push(x); return x; };
    const basic = (r, g, b, opt = {}) => keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), ...opt }));
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide };

    this.arrowTex = keep(arrowTexture());
    this.gateTex = keep(gateTexture());
    this.scanTex = keep(scanTexture());
    this.mat = {
      hazard: basic(3.2, 1.25, 0.2),                 // amber edge lights
      danger: basic(3.4, 0.35, 0.3),                 // red edge lights
      blink: basic(3.2, 1.4, 0.2),                   // hazard flashers (animated)
      safe: basic(0.5, 3.0, 1.2),                    // green: the way through
      fence: keep(new THREE.MeshBasicMaterial({ map: mats.barrier.map, color: new THREE.Color(1.7, 0.5, 0.35), ...add })),
      arrow: keep(new THREE.MeshBasicMaterial({ map: this.arrowTex, color: new THREE.Color(2.6, 1.5, 0.3), transparent: true, side: THREE.DoubleSide })),
      sign: [0xffc23d, 0xff8a3d, 0xff4a5a].map((c) => keep(new THREE.MeshBasicMaterial({ map: this.arrowTex, color: new THREE.Color(c).multiplyScalar(2.1), transparent: true, side: THREE.DoubleSide }))),
      body: keep(new THREE.MeshStandardMaterial({ map: mats.textures.panel, color: 0xa9b2c6, metalness: 0.45, roughness: 0.45, emissive: 0x2c3448, emissiveIntensity: 1 })),
      dark: keep(new THREE.MeshStandardMaterial({ color: 0x232733, metalness: 0.7, roughness: 0.45, emissive: 0x0d1018 })),
      cone: keep(new THREE.MeshStandardMaterial({ color: 0x3a3f4c, metalness: 0.5, roughness: 0.5, emissive: 0x161a24 })),
      gate: keep(new THREE.MeshBasicMaterial({ map: this.scanTex, color: new THREE.Color(0.25, 1.5, 1.0), opacity: 0.5, ...add })),
      gateDone: keep(new THREE.MeshBasicMaterial({ map: this.scanTex, color: new THREE.Color(0.1, 0.35, 0.3), opacity: 0.25, ...add })),
      gateText: keep(new THREE.MeshBasicMaterial({ map: this.gateTex, color: new THREE.Color(1.2, 2.6, 1.9), transparent: true, side: THREE.DoubleSide, depthWrite: false })),
      gateEdge: basic(0.6, 3.2, 2.2),
      rockGlow: keep(new THREE.MeshBasicMaterial({ map: mats.glowTex, color: new THREE.Color(1.3, 0.2, 0.16), ...add })),
      halo: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.3, 0.25), ...add })),
    };

    this.coinMesh = new THREE.InstancedMesh(this.geo.coin, mats.coin, 600);
    this.coinMesh.frustumCulled = false; this.coinMesh.count = 0;
    scene.add(this.coinMesh);
    this.dummy = new THREE.Object3D();
  }

  /** Put obj in the track frame at s: local +x = right across the corridor, local -z = forward. */
  place(obj, s, x = 0, y = 0) {
    const f = this.track.sample(s, this.f);
    obj.position.set(f.x - Math.cos(f.h) * x, y, f.z + Math.sin(f.h) * x);
    obj.rotation.set(0, f.h + Math.PI, 0);
    return f;
  }

  mesh(g, geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const k = new THREE.Mesh(geo, mat); k.position.set(x, y, z); k.scale.set(sx, sy, sz); g.add(k); return k;
  }

  // ---------- obstacles ----------
  makeObstacle(o) {
    const g = new THREE.Group(), G = this.geo, M = this.mat, m = this.m;
    const top = 5.6; // everything solid reaches well above the ship (which rides at 2.4 m)
    switch (o.kind) {
      case 'barrier': {
        // a barricade out from the wall: solid base, energy fence above, arrows pointing at the way through
        const w = 2 * o.hw, tip = o.x - o.side * o.hw; // tip = its free end
        this.mesh(g, G.box, m.hazard, o.x, 0.7, 0, w, 1.4, 1.2);
        this.mesh(g, G.box, M.dark, o.x, 1.5, 0, w, 0.2, 1.3);
        this.mesh(g, G.plane, M.fence, o.x, (1.6 + top) / 2, 0, w, top - 1.6, 1);
        this.mesh(g, G.box, M.dark, o.x, top + 0.15, 0, w, 0.3, 0.5);
        this.mesh(g, G.box, M.hazard, o.x, top - 0.08, 0, w, 0.08, 0.3);
        // end post with a bright edge: this is exactly where the opening starts
        this.mesh(g, G.box, M.dark, tip + o.side * 0.25, (top + 0.3) / 2, 0, 0.5, top + 0.3, 1.3);
        this.mesh(g, G.box, M.danger, tip + o.side * 0.02, (top + 0.3) / 2, 0, 0.1, top + 0.3, 1.36);
        // arrow board(s), pointing away from the wall it grows from
        const span = Math.min(w - 1.2, 9), n = span > 6.5 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const bw = Math.min(4.6, span / n - 0.4);
          const bx = tip + o.side * (0.9 + bw / 2 + i * (bw + 0.5));
          this.mesh(g, G.plane, M.arrow, bx, 3.35, 0.72, -o.side * bw, 1.5, 1);
          this.mesh(g, G.box, M.dark, bx, 3.35, 0.66, bw + 0.2, 1.7, 0.08);
        }
        // green floor strip on the open side
        this.mesh(g, G.box, M.safe, tip - o.side * 1.6, 0.04, 0, 2.6, 0.05, 0.35);
        // the lane behind it stays closed: an amber line along its edge and hatching across it
        if (o.deep > 2) {
          this.mesh(g, G.box, M.hazard, tip, 0.04, -o.deep / 2, 0.16, 0.05, o.deep);
          for (let z = 5; z < o.deep; z += 7) this.mesh(g, G.box, m.hazard, o.x, 0.03, -z, w, 0.04, 0.7);
        }
        break;
      }
      case 'hauler': {
        // a stalled cargo hauler, hazard lights going. Local -z is forward, so we see its back doors.
        // Outlined in light on every edge that faces the ship: it has to read from a long way off.
        const L = 2 * o.hl - 0.4, W = 2 * o.hw - 0.2, back = L / 2;
        this.mesh(g, G.box, M.body, o.x, 2.75, 0, W, 3.1, L);                        // container
        this.mesh(g, G.box, M.dark, o.x, 1.05, 0, W - 0.3, 0.4, L - 0.6);            // chassis
        this.mesh(g, G.box, M.dark, o.x, 2.6, -back - 0.9, W - 0.5, 2.4, 1.8);      // cab, far end
        // back doors: lit frame, seam, stripes, flashers
        this.mesh(g, G.box, M.danger, o.x, 4.24, back + 0.03, W, 0.12, 0.06);
        this.mesh(g, G.box, M.danger, o.x, 1.26, back + 0.03, W, 0.12, 0.06);
        for (const sx of [-1, 1]) {
          this.mesh(g, G.box, M.danger, o.x + sx * (W / 2 - 0.06), 2.75, back + 0.03, 0.12, 3.1, 0.06);
          this.mesh(g, G.box, M.blink, o.x + sx * (W / 2 - 0.55), 3.6, back + 0.05, 0.55, 0.55, 0.06);
          this.mesh(g, G.box, M.blink, o.x + sx * (W / 2 - 0.55), 1.85, back + 0.05, 0.55, 0.3, 0.06);
          this.mesh(g, G.box, M.dark, o.x + sx * (W / 2 - 0.2), 0.7, back - 1.3, 0.5, 0.35, 1.6); // lift skids
          this.mesh(g, G.box, M.dark, o.x + sx * (W / 2 - 0.2), 0.7, -back + 1.3, 0.5, 0.35, 1.6);
          this.mesh(g, G.box, M.hazard, o.x + sx * (W / 2 + 0.01), 4.25, 0, 0.06, 0.1, L);           // roof-edge strips
          this.mesh(g, G.box, M.hazard, o.x + sx * (W / 2 + 0.01), 1.25, 0, 0.06, 0.1, L);           // sill strips
        }
        this.mesh(g, G.box, m.hazard, o.x, 2.75, back + 0.02, W - 0.5, 0.7, 0.05);  // chevron band across the doors
        this.mesh(g, G.box, M.dark, o.x, 2.75, back + 0.04, 0.07, 2.9, 0.05);       // door seam
        // warning beacon riding above it
        this.mesh(g, G.gem, M.blink, o.x, 5.1, back - 0.6, 0.38, 0.5, 0.38);
        break;
      }
      case 'laser': {
        // a wall of light out from the wall: six beams, knee height to well over the ship, and a lit post at its free end
        const f = this.track.sample(o.s, this.f), wallX = f.w - 0.15;
        const x0 = Math.max(-wallX, o.x - o.hw), x1 = Math.min(wallX, o.x + o.hw), w = x1 - x0, cx = (x0 + x1) / 2;
        if (w < 0.3) break;
        for (const y of [0.8, 1.6, 2.4, 3.2, 4.0, 4.8]) this.mesh(g, G.box, m.laser, cx, y, 0, w, 0.08, 0.08);
        this.mesh(g, G.plane, m.laserGlow, cx, 2.8, 0, w, 4.9, 1);
        for (const px of [x0, x1]) {
          if (Math.abs(px) > wallX - 0.05) continue;   // that end is in the wall
          this.mesh(g, G.box, M.dark, px, 2.75, 0, 0.36, 5.5, 0.5);
          this.mesh(g, G.box, M.danger, px, 2.75, 0.27, 0.12, 5.5, 0.05);
          this.mesh(g, G.gem, M.blink, px, 5.75, 0, 0.24, 0.32, 0.24);
        }
        break;
      }
      case 'fence': {
        // the same beams run along the corridor: the edge of a lane that is shut. Local z is along the track.
        const L = 2 * o.hl;
        for (const y of [0.8, 1.6, 2.4, 3.2, 4.0, 4.8]) this.mesh(g, G.box, m.laser, o.x, y, 0, 0.08, 0.08, L);
        this.mesh(g, G.plane, m.laserGlow, o.x, 2.8, 0, L, 4.9, 1).rotation.y = Math.PI / 2;
        this.mesh(g, G.box, M.dark, o.x, 2.75, o.hl, 0.3, 5.5, 0.3);          // a post where each stretch starts
        this.mesh(g, G.box, M.danger, o.x, 2.75, o.hl + 0.17, 0.1, 5.5, 0.04);
        break;
      }
      case 'sweep': {
        // one beam running back and forth along a lit rail. The rail shows exactly how far it reaches.
        const f = this.track.sample(o.s, this.f), wallX = f.w - 0.15;
        const x0 = Math.max(-wallX, o.x - o.hw), x1 = Math.min(wallX, o.x + o.hw), w = x1 - x0, cx = (x0 + x1) / 2;
        const tip = o.x - o.side * o.hw;
        this.mesh(g, G.box, M.dark, cx, 0.14, 0, w, 0.28, 1.0);
        this.mesh(g, G.box, M.dark, cx, 5.5, 0, w, 0.3, 0.7);
        this.mesh(g, G.box, M.danger, cx, 0.3, 0, w, 0.05, 0.6);
        this.mesh(g, G.box, M.danger, cx, 5.33, 0, w, 0.05, 0.4);
        this.mesh(g, G.box, m.hazard, cx, 0.03, -2.2, w, 0.04, 0.7);
        this.mesh(g, G.box, m.hazard, cx, 0.03, 2.2, w, 0.04, 0.7);
        this.mesh(g, G.box, M.dark, tip, 2.8, 0, 0.34, 5.6, 0.8);
        this.mesh(g, G.box, M.hazard, tip - o.side * 0.19, 2.8, 0, 0.06, 5.6, 0.82);
        const beam = new THREE.Group();
        this.mesh(beam, G.cyl, m.laser, 0, 2.82, 0, 0.17, 5.0, 0.17);
        this.mesh(beam, G.plane, m.laserGlow, 0, 2.82, 0.06, 1.9, 5.0, 1);
        this.mesh(beam, G.box, M.dark, 0, 0.42, 0, 0.6, 0.3, 0.6);
        this.mesh(beam, G.box, M.dark, 0, 5.25, 0, 0.6, 0.3, 0.6);
        g.add(beam); g.userData.beam = beam;
        break;
      }
      case 'pylon': {
        // a bollard: dark post, lit rings, beacon on top
        this.mesh(g, G.cyl, M.cone, o.x, top / 2, 0, o.r * 0.82, top, o.r * 0.82);
        this.mesh(g, G.cyl, M.dark, o.x, 0.25, 0, o.r * 1.25, 0.5, o.r * 1.25);
        for (const y of [1.3, 2.4, 3.5]) this.mesh(g, G.band, y === 2.4 ? M.danger : M.hazard, o.x, y, 0, o.r * 0.82, 0.3, o.r * 0.82);
        this.mesh(g, G.gem, M.blink, o.x, top + 0.35, 0, 0.3, 0.42, 0.3);
        break;
      }
      case 'column': {
        // a structural column of the hall, floor to ceiling, with a hazard collar at ship height
        this.mesh(g, G.oct, M.body, o.x, H / 2, 0, o.r, H, o.r).rotation.y = Math.PI / 8;
        this.mesh(g, G.oct, M.dark, o.x, 0.4, 0, o.r * 1.25, 0.8, o.r * 1.25).rotation.y = Math.PI / 8;
        this.mesh(g, G.oct, M.dark, o.x, H - 0.4, 0, o.r * 1.25, 0.8, o.r * 1.25).rotation.y = Math.PI / 8;
        this.mesh(g, G.band, m.hazard, o.x, HOVER, 0, o.r * 1.0, 1.5, o.r * 1.0);
        this.mesh(g, G.band, M.danger, o.x, HOVER + 0.9, 0, o.r * 1.01, 0.16, o.r * 1.01);
        this.mesh(g, G.band, M.danger, o.x, HOVER - 0.9, 0, o.r * 1.01, 0.16, o.r * 1.01);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          this.mesh(g, G.box, M.hazard, o.x + Math.cos(a) * o.r * 0.94, (HOVER + 1.1 + H - 0.8) / 2, Math.sin(a) * o.r * 0.94, 0.09, H - 0.8 - HOVER - 1.1, 0.09);
        }
        break;
      }
      case 'rock': {
        const rock = new THREE.Mesh(this.rockGeos[o.id % this.rockGeos.length], this.m.rock);
        rock.scale.setScalar(o.r * 1.02); rock.position.set(o.x, HOVER, 0); rock.rotation.y = o.spin || 0;
        g.add(rock); g.userData.spin = rock;
        this.mesh(g, G.plane, M.rockGlow, o.x, HOVER, 0.2, o.r * 4.4, o.r * 4.4, 1);
        this.mesh(g, G.halo, M.halo, o.x, HOVER, o.r * 0.5, o.r * 1.3, o.r * 1.3, 1); // red ring: this one is in the lane
        this.mesh(g, G.gem, M.blink, o.x, HOVER + o.r * 1.3 + 0.35, o.r * 0.5, 0.28, 0.4, 0.28);
        break;
      }
      case 'wreck': {
        // a dead hull section, tumbling, one light still blinking
        const core = new THREE.Group(); core.position.set(o.x, HOVER, 0); core.rotation.set(o.spin, o.spin * 1.7, 0.4);
        const s = o.r;
        this.mesh(core, G.box, M.body, 0, 0, 0, s * 1.25, s * 0.95, s * 1.4);
        this.mesh(core, G.box, M.dark, s * 0.25, s * 0.5, -s * 0.3, s * 0.9, s * 0.5, s * 0.9).rotation.z = 0.5;
        this.mesh(core, G.box, M.dark, -s * 0.55, -s * 0.2, s * 0.5, s * 0.5, s * 1.1, s * 0.4).rotation.x = 0.6;
        this.mesh(core, G.box, m.hazard, 0, 0, s * 0.71, s * 1.0, s * 0.3, 0.05);
        this.mesh(core, G.gem, M.blink, s * 0.5, s * 0.62, s * 0.4, 0.28, 0.28, 0.28);
        g.add(core); g.userData.spin = core;
        this.mesh(g, G.plane, M.rockGlow, o.x, HOVER, 0.2, o.r * 4, o.r * 4, 1);
        this.mesh(g, G.halo, M.halo, o.x, HOVER, o.r * 0.5, o.r * 1.3, o.r * 1.3, 1);
        break;
      }
    }
    // local z runs backward along the track, so an item ahead of the row centre sits at -ds
    this.place(g, o.s, 0, 0);
    this.root.add(g);
    return g;
  }

  makeGate(gate) {
    const g = new THREE.Group(), G = this.geo, M = this.mat;
    const f = this.track.sample(gate.s, this.f), w = f.w;
    const curtain = this.mesh(g, G.plane, M.gate, 0, H / 2, 0, 2 * w, H, 1);
    for (const sx of [-1, 1]) this.mesh(g, G.box, M.gateEdge, sx * (w - 0.25), H / 2, 0, 0.14, H, 0.14);
    this.mesh(g, G.box, M.gateEdge, 0, 0.05, 0, 2 * w, 0.06, 0.5);
    this.mesh(g, G.plane, M.gateText, 0, H - 1.5, 0.05, Math.min(2 * w - 2, 15), 1.5, 1);
    this.place(g, gate.s, 0, 0);
    this.root.add(g);
    return { gate, g, curtain };
  }

  makeSign(sg) {
    const f = this.track.sample(sg.s, this.f);
    const k = new THREE.Mesh(this.geo.plane, this.mat.sign[sg.level]);
    // on the outside wall, turned to face the oncoming ship; arrows point the way the bend goes
    this.place(k, sg.s, sg.side * (f.w - 2.0), 5.2);
    k.rotation.y += sg.side * 0.5;
    k.scale.set(sg.turn * 3.2, 2.0, 1);
    this.root.add(k);
    return k;
  }

  // ---------- per frame ----------
  update(ship, t, dt) {
    const C = this.course, s = ship.s;
    const ahead = s + TRACK.VIEW_AHEAD, behind = s - TRACK.KEEP_BEHIND;

    while (this.oi < C.obstacles.length && C.obstacles[this.oi].s < ahead) {
      const o = C.obstacles[this.oi++];
      if (o.s > behind) this.active.push({ o, g: this.makeObstacle(o) });
    }
    while (this.pi < C.pads.length && C.pads[this.pi].s < ahead) {
      const p = C.pads[this.pi++];
      if (p.s < behind) continue;
      const k = new THREE.Mesh(this.geo.plane, this.m.pad);
      this.place(k, p.s, p.x, 0.07);
      k.rotation.order = 'YXZ'; k.rotation.x = -Math.PI / 2;
      k.scale.set(p.hw * 2, p.hl * 2, 1);
      this.root.add(k);
      this.padsOn.push({ p, k });
    }
    while (this.gi < C.gates.length && C.gates[this.gi].s < ahead) {
      const gate = C.gates[this.gi++];
      if (gate.s > behind) this.gatesOn.push(this.makeGate(gate));
    }
    while (this.si < C.signs.length && C.signs[this.si].s < ahead) {
      const sg = C.signs[this.si++];
      if (sg.s > behind) this.signsOn.push({ sg, k: this.makeSign(sg) });
    }

    // shared animation: hazard flashers, running arrows, gate scan, pad chevrons
    const on = Math.floor(t * 2.6) % 2 === 0;
    this.mat.blink.color.setRGB(on ? 3.4 : 0.5, on ? 1.5 : 0.2, on ? 0.2 : 0.05);
    this.arrowTex.offset.x = -(t * 0.9) % 1;
    this.scanTex.offset.y = (t * 0.25) % 1;
    this.m.pad.map.offset.y = -t * 1.8;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i], o = a.o;
      if (o.s < behind) { this.root.remove(a.g); this.active.splice(i, 1); continue; }
      if (a.g.userData.beam) a.g.userData.beam.position.x = beamX(o, t);
      const sp = a.g.userData.spin;
      if (sp) { sp.rotation.x += dt * 0.35; sp.rotation.z += dt * 0.22; }
      if (o.hit && a.tilt === undefined && o.kind === 'pylon') { a.tilt = 0; a.g.rotation.order = 'YXZ'; } // knocked bollards go over
      if (a.tilt !== undefined && a.tilt < 1) { a.tilt = Math.min(1, a.tilt + dt * 4); a.g.rotation.x = -1.4 * a.tilt * (2 - a.tilt); }
    }
    for (let i = this.padsOn.length - 1; i >= 0; i--) if (this.padsOn[i].p.s < behind) { this.root.remove(this.padsOn[i].k); this.padsOn.splice(i, 1); }
    for (let i = this.gatesOn.length - 1; i >= 0; i--) {
      const e = this.gatesOn[i];
      if (e.gate.s < behind) { this.root.remove(e.g); this.gatesOn.splice(i, 1); continue; }
      if (e.gate.passed && e.curtain.material !== this.mat.gateDone) e.curtain.material = this.mat.gateDone;
    }
    for (let i = this.signsOn.length - 1; i >= 0; i--) if (this.signsOn[i].sg.s < behind) { this.root.remove(this.signsOn[i].k); this.signsOn.splice(i, 1); }

    // coins: one instanced mesh
    const coins = C.coins, d = this.dummy;
    while (this.ci < coins.length && coins[this.ci].s < s - 12) this.ci++;
    let n = 0;
    for (let i = this.ci; i < coins.length && n < 600; i++) {
      const c = coins[i];
      if (c.s > ahead) break;
      if (c.taken) continue;
      const f = this.track.sample(c.s, this.f);
      d.position.set(f.x - Math.cos(f.h) * c.x, HOVER + Math.sin(t * 3 + c.s) * 0.14, f.z + Math.sin(f.h) * c.x);
      d.rotation.set(0, t * 1.7 + c.s * 0.3, 0);
      d.updateMatrix();
      this.coinMesh.setMatrixAt(n++, d.matrix);
    }
    this.coinMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.root);
    this.scene.remove(this.coinMesh);
    this.coinMesh.dispose();
    for (const g of Object.values(this.geo)) g.dispose();
    for (const x of this.own) x.dispose();
  }
}

// Three chevrons pointing right. Flipped in x for a left-pointing board; scrolled to make them run.
function arrowTexture() {
  const c = document.createElement('canvas'); c.width = 384; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 384, 128);
  g.fillStyle = 'rgba(10,6,2,0.92)'; g.fillRect(0, 0, 384, 128);
  g.strokeStyle = '#fff'; g.lineWidth = 22; g.lineJoin = 'miter'; g.lineCap = 'butt';
  for (let i = 0; i < 3; i++) {
    const x = 34 + i * 128;
    g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 50, 64); g.lineTo(x, 112); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

function gateTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 128);
  g.font = '900 86px Orbitron, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText('CHECKPOINT', 512, 68);
  g.fillRect(20, 54, 170, 14); g.fillRect(834, 54, 170, 14);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function scanTexture() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  for (let y = 0; y < 256; y++) {
    const v = 0.12 + 0.2 * (y % 16 < 2 ? 1 : 0) + 0.68 * Math.pow(Math.max(0, Math.sin((y / 256) * Math.PI * 2)), 12);
    g.fillStyle = `rgba(255,255,255,${Math.min(1, v).toFixed(3)})`; g.fillRect(0, y, 8, 1);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping;
  return t;
}

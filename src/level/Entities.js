import * as THREE from 'three';
import { TRACK, SHIP, SCORE, HOP } from '../core/Constants.js';
import { Track, doorGap, vspan, CRATE_LOW, CRATE_TALL, OVERHEAD_Y } from './Track.js';

const H = TRACK.HEIGHT;

// Obstacles, coins, boost pads and repair orbs: spawned ahead of the ship, animated, collided, despawned.
export class Entities {
  constructor(scene, track, mats, rockGeos) {
    this.scene = scene; this.track = track; this.m = mats; this.rockGeos = rockGeos;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.active = [];
    this.oIdx = 0; this.pIdx = 0; this.rIdx = 0; this.cIdx = 0;
    this.pads = []; this.repairs = [];
    this.f = {};

    this.geo = {
      cyl: new THREE.CylinderGeometry(1, 1, H, 20),
      band: new THREE.CylinderGeometry(1.07, 1.07, 0.22, 20, 1, true),
      box: new THREE.BoxGeometry(1, 1, 1),
      plane: new THREE.PlaneGeometry(1, 1),
      beam: new THREE.CylinderGeometry(0.12, 0.12, H, 8),
      beamGlow: new THREE.CylinderGeometry(0.5, 0.5, H, 12, 1, true),
      coin: new THREE.CylinderGeometry(0.62, 0.62, 0.14, 28).rotateX(Math.PI / 2),
      octa: new THREE.OctahedronGeometry(0.85),
      torus: new THREE.TorusGeometry(1.3, 0.07, 8, 32),
    };
    this.bandA = mats.neon(0xffb23d, 3);
    this.bandB = mats.neon(0xff3fb4, 3);
    this.edgeM = mats.neon(0xff4a4a, 3.5);
    this.hopM = mats.neon(0x5dff8a, 1.6);       // green = you can hop this
    this.tripM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 2.0, 0.6) });
    this.tripGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.6, 0.2), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });

    this.coinMesh = new THREE.InstancedMesh(this.geo.coin, mats.coin, 600);
    this.coinMesh.frustumCulled = false;
    this.coinMesh.count = 0;
    scene.add(this.coinMesh);
    this.dummy = new THREE.Object3D();
  }

  place(obj, s, x, y = 0) {
    const f = this.track.sample(s, this.f);
    obj.position.set(f.x - Math.cos(f.h) * x, y, f.z + Math.sin(f.h) * x);
    obj.rotation.set(0, f.h + Math.PI, 0); // local +x = track right, local -z = forward
    return f;
  }

  makeObstacle(o) {
    const g = new THREE.Group();
    const m = this.m, G = this.geo;
    const mesh = (geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const k = new THREE.Mesh(geo, mat); k.position.set(x, y, z); k.scale.set(sx, sy, sz); g.add(k); return k;
    };
    switch (o.type) {
      case 'pillar':
        mesh(G.cyl, o.big ? m.door : m.trim, o.x, H / 2, 0, o.r, 1, o.r);
        mesh(G.band, o.big ? this.bandB : this.bandA, o.x, 1.2, 0, o.r, 1, o.r);
        mesh(G.band, o.big ? this.bandB : this.bandA, o.x, H - 1.4, 0, o.r, 1, o.r);
        if (o.big) mesh(G.band, this.bandA, o.x, H / 2, 0, o.r, 2, o.r);
        break;
      case 'crate': {
        const k = mesh(G.box, m.crate, o.x, CRATE_LOW / 2, 0, o.size, CRATE_LOW, o.size);
        k.rotation.y = o.rot;
        if (o.stack) { const h2 = CRATE_TALL - CRATE_LOW; const k2 = mesh(G.box, m.crate, o.x, CRATE_LOW + h2 / 2, 0, o.size * 0.85, h2, o.size * 0.85); k2.rotation.y = -o.rot * 0.6; }
        else mesh(G.box, this.hopM, o.x, CRATE_LOW + 0.03, 0, o.size * 0.7, 0.04, o.size * 0.7); // hop marker on top
        break;
      }
      case 'tripwire': {
        const x0 = o.side > 0 ? -o.w : -o.w + o.gap, x1 = o.side > 0 ? o.w - o.gap : o.w;
        const beam = mesh(G.beam, this.tripM, (x0 + x1) / 2, TRACK.HOVER, 0, 1.1, (x1 - x0) / TRACK.HEIGHT, 1.1); beam.rotation.z = Math.PI / 2;
        const glow = mesh(G.beamGlow, this.tripGlow, (x0 + x1) / 2, TRACK.HOVER, 0, 0.6, (x1 - x0) / TRACK.HEIGHT, 0.6); glow.rotation.z = Math.PI / 2;
        const post = o.side > 0 ? x1 : x0;
        mesh(G.box, m.trim, post, TRACK.HOVER / 2 + 0.3, 0, 0.5, TRACK.HOVER + 0.9, 0.5);
        mesh(G.box, this.tripM, post, TRACK.HOVER, 0, 0.6, 0.3, 0.6);
        // floor chevrons in the hop colour: "go over"
        for (let k = -2; k <= 2; k++) mesh(G.box, this.hopM, (x0 + x1) / 2 + k * 1.6, 0.03, -3.5, 1.0, 0.04, 0.3);
        break;
      }
      case 'overhead': {
        const y0 = OVERHEAD_Y[0], y1 = OVERHEAD_Y[1];
        mesh(G.box, m.hazard, 0, (y0 + y1) / 2, 0, 2 * o.w, y1 - y0, 1.2);
        mesh(G.box, m.trim, 0, (y1 + TRACK.HEIGHT) / 2, 0, 1.0, TRACK.HEIGHT - y1, 0.8);
        mesh(G.box, this.edgeM, 0, y0 - 0.05, 0, 2 * o.w, 0.08, 1.25);
        for (const sx of [-1, 1]) mesh(G.box, m.trim, sx * (o.w - 0.4), (y0 + TRACK.HEIGHT) / 2, 0, 0.8, TRACK.HEIGHT - y0, 1.0);
        break;
      }
      case 'gate': {
        const a = -o.w - 1, b = o.gx - o.gh, c = o.gx + o.gh, e = o.w + 1;
        mesh(G.plane, m.barrier, (a + b) / 2, H / 2, 0, b - a, H, 1);
        mesh(G.plane, m.barrier, (c + e) / 2, H / 2, 0, e - c, H, 1);
        mesh(G.box, m.trim, b, H / 2, 0, 0.5, H, 0.6);
        mesh(G.box, m.trim, c, H / 2, 0, 0.5, H, 0.6);
        mesh(G.box, this.edgeM, b + 0.27, H / 2, 0, 0.05, H, 0.4);
        mesh(G.box, this.edgeM, c - 0.27, H / 2, 0, 0.05, H, 0.4);
        mesh(G.box, m.trim, 0, H - 0.3, 0, 2 * o.w, 0.6, 0.6);
        break;
      }
      case 'laser': {
        mesh(G.box, m.trim, 0, 0.12, 0, 2 * o.w, 0.24, 0.5);
        mesh(G.box, m.trim, 0, H - 0.12, 0, 2 * o.w, 0.24, 0.5);
        mesh(G.box, this.edgeM, 0, 0.26, 0, 2 * o.w, 0.04, 0.1);
        o.beam = new THREE.Group();
        o.beam.add(new THREE.Mesh(G.beam, m.laser));
        o.beam.add(new THREE.Mesh(G.beamGlow, m.laserGlow));
        const cap = new THREE.Mesh(G.box, m.laser); cap.scale.set(0.5, 0.3, 0.6); cap.position.y = H / 2 - 0.3; o.beam.add(cap);
        const cap2 = cap.clone(); cap2.position.y = -H / 2 + 0.3; o.beam.add(cap2);
        o.beam.position.y = H / 2;
        g.add(o.beam);
        break;
      }
      case 'doors': {
        o.left = mesh(G.box, m.door, 0, H / 2, 0, 1, H, 1.2);
        o.right = mesh(G.box, m.door, 0, H / 2, 0, 1, H, 1.2);
        o.le = mesh(G.box, m.hazard, 0, H / 2, 0, 0.3, H, 1.3);
        o.re = mesh(G.box, m.hazard, 0, H / 2, 0, 0.3, H, 1.3);
        mesh(G.box, m.trim, 0, H - 0.4, 0, 2 * o.w, 0.8, 1.6);
        mesh(G.box, m.trim, 0, 0.2, 0, 2 * o.w, 0.4, 1.6);
        break;
      }
      case 'spinner': {
        mesh(G.cyl, m.trim, 0, H / 2, 0, 0.75, 1, 0.75);
        mesh(G.band, this.bandB, 0, TRACK.HOVER, 0, 0.75, 3, 0.75);
        o.arm = new THREE.Group();
        o.arm.position.y = TRACK.HOVER;
        const bar = new THREE.Mesh(G.box, m.door); bar.scale.set(2 * o.L, 0.9, 1.0); o.arm.add(bar);
        const e1 = new THREE.Mesh(G.box, this.hopM); e1.scale.set(2 * o.L, 0.1, 1.05); // green = hoppable e1.position.y = 0.48; o.arm.add(e1);
        const e2 = e1.clone(); e2.position.y = -0.48; o.arm.add(e2);
        for (const s of [-1, 1]) { const tip = new THREE.Mesh(G.box, m.hazard); tip.scale.set(0.6, 1.0, 1.1); tip.position.x = s * (o.L - 0.3); o.arm.add(tip); }
        g.add(o.arm);
        break;
      }
      case 'rock': {
        o.rockMesh = new THREE.Mesh(this.rockGeos[o.id % this.rockGeos.length], m.rock);
        o.rockMesh.scale.setScalar(o.r * 1.05);
        o.rockMesh.position.y = TRACK.HOVER;
        g.add(o.rockMesh);
        break;
      }
      case 'debris': {
        for (let i = 0; i < 4; i++) {
          const k = mesh(G.box, i % 2 ? m.trim : m.door, o.x + (Math.sin(o.id * 7 + i) * o.r * 0.5), TRACK.HOVER + Math.cos(o.id + i * 2) * 0.8, Math.sin(i * 3.1) * o.r * 0.4,
            o.r * (0.6 + 0.4 * Math.sin(i + o.id)), 0.25 + 0.3 * i % 1, o.r * 0.9);
          k.rotation.set(i * 0.7 + o.id, i * 1.3, i * 0.4);
        }
        mesh(G.box, this.edgeM, o.x, TRACK.HOVER, 0, 0.12, 0.12, 0.12);
        break;
      }
    }
    this.place(g, o.s, 0, 0);
    this.root.add(g);
    return g;
  }

  update(ship, t, dt, hooks) {
    const T = this.track, s = ship.s;
    const ahead = s + TRACK.VIEW_AHEAD, behind = s - TRACK.KEEP_BEHIND;

    // spawn
    while (this.oIdx < T.obstacles.length && T.obstacles[this.oIdx].s < ahead) {
      const o = T.obstacles[this.oIdx++];
      this.active.push({ o, g: this.makeObstacle(o) });
    }
    while (this.pIdx < T.pads.length && T.pads[this.pIdx].s < ahead) {
      const p = T.pads[this.pIdx++];
      const mesh = new THREE.Mesh(this.geo.plane, this.m.pad);
      this.place(mesh, p.s, p.x, 0.06);
      mesh.rotation.x = -Math.PI / 2; mesh.rotation.order = 'YXZ';
      mesh.scale.set(p.half * 2, p.len, 1);
      this.root.add(mesh);
      this.pads.push({ p, mesh });
    }
    while (this.rIdx < T.repairs.length && T.repairs[this.rIdx].s < ahead) {
      const r = T.repairs[this.rIdx++];
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.geo.octa, this.m.repair));
      g.add(new THREE.Mesh(this.geo.torus, this.m.repair));
      this.place(g, r.s, r.x, TRACK.HOVER);
      this.root.add(g);
      this.repairs.push({ r, g });
    }

    // animate + collide obstacles
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i], o = a.o;
      if (o.s < behind) { this.root.remove(a.g); this.active.splice(i, 1); continue; }
      if (o.type === 'laser') o.beam.position.x = o.amp * Math.sin(o.om * t + o.ph);
      else if (o.type === 'spinner') o.arm.rotation.y = o.om * t + o.ph;
      else if (o.type === 'rock') { o.rockMesh.position.x = o.amp * Math.sin(o.om * t + o.ph); o.rockMesh.rotation.x += dt * 0.7; o.rockMesh.rotation.z += dt * 0.4; }
      else if (o.type === 'doors') {
        const gp = doorGap(o, t), a0 = -o.w - 1, b = o.gx - gp, c = o.gx + gp, e = o.w + 1;
        o.left.position.x = (a0 + b) / 2; o.left.scale.x = Math.max(0.01, b - a0);
        o.right.position.x = (c + e) / 2; o.right.scale.x = Math.max(0.01, e - c);
        o.le.position.x = b - 0.1; o.re.position.x = c + 0.1;
      }
      const u = s - o.s;
      if (Math.abs(u) < 9 && !o.hit) {
        const c = Track.clearance(o, u, ship.x, t);
        const [b0, b1] = vspan(o), y0 = ship.y - HOP.SHIP_HALF, y1 = ship.y + HOP.SHIP_HALF;
        if (c < SHIP.RADIUS) {
          if (y1 > b0 && y0 < b1) { o.hit = true; hooks.crash(o, Math.sign(ship.x - (o.x ?? 0)) || 1); }
          else if (y0 >= b1) o.over = Math.min(o.over ?? 99, y0 - b1); // passing over it
        } else o.near = Math.min(o.near, c - SHIP.RADIUS);
      }
      if (!o.passed && u > 6) {
        o.passed = true;
        if (!o.hit && o.over !== undefined) { if (o.over < HOP.AIR_MISS) hooks.airMiss(o); }
        else if (!o.hit && o.near < SCORE.NEAR_MISS_DIST - SHIP.RADIUS && o.near > -0.01) hooks.nearMiss(o);
      }
    }

    // pads
    for (let i = this.pads.length - 1; i >= 0; i--) {
      const { p, mesh } = this.pads[i];
      if (p.s < behind) { this.root.remove(mesh); this.pads.splice(i, 1); continue; }
      if (!p.used && Math.abs(s - p.s) < p.len / 2 + 0.5 && Math.abs(ship.x - p.x) < p.half + 0.7) { p.used = true; hooks.pad(p); }
    }
    this.m.pad.map.offset.y = -t * 1.8;

    // repairs
    for (let i = this.repairs.length - 1; i >= 0; i--) {
      const { r, g } = this.repairs[i];
      if (r.s < behind || r.taken) { this.root.remove(g); this.repairs.splice(i, 1); continue; }
      g.children[0].rotation.y = t * 2; g.children[1].rotation.x = t * 1.3; g.children[1].rotation.y = t;
      if (Math.abs(s - r.s) < 2.2 && Math.abs(ship.x - r.x) < 2.4) { r.taken = true; hooks.repair(r); }
    }

    // coins (one instanced mesh for all of them)
    const coins = T.coins;
    while (this.cIdx < coins.length && coins[this.cIdx].s < s - 12) this.cIdx++;
    let n = 0;
    const d = this.dummy;
    for (let i = this.cIdx; i < coins.length && n < 600; i++) {
      const c = coins[i];
      if (c.s > ahead) break;
      if (c.taken) continue;
      if (Math.abs(c.s - s) < 2.1 && Math.abs(c.x - ship.x) < 2.1) { c.taken = true; hooks.coin(c); continue; }
      const f = T.sample(c.s, this.f);
      d.position.set(f.x - Math.cos(f.h) * c.x, TRACK.HOVER + Math.sin(t * 3 + c.s) * 0.15, f.z + Math.sin(f.h) * c.x);
      d.rotation.set(0, t * 1.6 + c.s * 0.3, 0);
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
  }

  // For the autopilot: is something hoppable about to block the current lane, with room to land?
  hopNeeded(ship, t) {
    let block = null;
    for (const { o } of this.active) {
      const du = o.s - ship.s;
      if (du < ship.v * 0.12 || du > ship.v * 0.32) continue;
      if (Track.clearance(o, 0, ship.x, t + du / Math.max(30, ship.v)) >= SHIP.RADIUS + 0.4) continue;
      if (vspan(o)[1] > TRACK.HOVER + 1.9 - HOP.SHIP_HALF) return false; // too tall to hop: steer instead
      block = o;
    }
    if (!block) return false;
    for (const { o } of this.active) if (o.type === 'overhead' && o.s > ship.s && o.s - ship.s < ship.v * 0.85) return false;
    return true;
  }

  // For the autopilot: free lateral positions ahead.
  laneCost(ship, xc, t, lookahead = 70) {
    let cost = 0;
    for (const { o } of this.active) {
      const du = o.s - ship.s;
      if (du < -1 || du > lookahead) continue;
      if (vspan(o)[0] > TRACK.HOVER + HOP.SHIP_HALF) continue; // passes overhead
      const ta = t + du / Math.max(30, ship.v);
      const c = Track.clearance(o, 0, xc, ta);
      if (c < SHIP.RADIUS + 1.0) cost += 14 / (1 + du / 25);
    }
    return cost;
  }
}

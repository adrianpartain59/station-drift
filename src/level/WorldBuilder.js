import * as THREE from 'three';
import { TRACK } from '../core/Constants.js';
import { WIN_L, WIN_R, SKY, mulberry32 } from './Track.js';
import { stationNameTexture } from './Materials.js';

// Builds the static world in chunks of track samples: corridor, hull, windows, signage, space lane, rocks.
// Every surface is swept along the centreline; geometry is merged per material, so a chunk is a handful of draw calls.

const H = TRACK.HEIGHT;
const PAD = TRACK.HULL_PAD;
const WIN_LO = 1.7, WIN_HI = 7.7;

class Bucket {
  constructor(material) { this.material = material; this.pos = []; this.nor = []; this.uv = []; }
  tri(a, b, c, na, nb, nc, ua, ub, uc) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.nor.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }
  mesh() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, this.material);
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const PLANE = new THREE.PlaneGeometry(1, 1).toNonIndexed();

export { Bucket };

export class WorldBuilder {
  /** `rocks` (0..1): how much of the asteroid scenery is kept. 1 is the original; the dark look keeps under half. */
  constructor(track, mats, rocks = 1, lit = true) {
    this.lit = lit;   // paint the light the lamps and neon throw (see pool() and Materials.painted)
    this.track = track;
    this.m = mats;
    this.rocks = rocks;
    this.rockGeos = [];
    const rr = mulberry32(99);
    for (let v = 0; v < 5; v++) {
      const g = new THREE.IcosahedronGeometry(1, 2);
      const p = g.attributes.position;
      const f1 = rr() * 3 + 1.5, f2 = rr() * 6 + 3, seedA = rr() * 10;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = 1 + 0.22 * Math.sin(x * f1 + seedA) * Math.cos(y * f1 * 1.3) + 0.08 * Math.sin(z * f2 + x * f2);
        p.setXYZ(i, x * n * (1 + rr() * 0.04), y * n * 0.8, z * n);
      }
      const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals();
      this.rockGeos.push(ng);
    }
  }

  // ----- frame helpers -----
  P(i, lx, ly) {
    const T = this.track, h = T.H[i];
    return [T.X[i] - Math.cos(h) * lx, ly + T.Y[i], T.Z[i] + Math.sin(h) * lx];
  }
  N(i, nx, ny) {
    const T = this.track, h = T.H[i], g = T.G[i];
    if (!g) return [-Math.cos(h) * nx, ny, Math.sin(h) * nx];
    // on a slope the surface leans with the road
    const q = 1 / Math.sqrt(1 + g * g);
    return [-Math.cos(h) * nx - g * Math.sin(h) * ny * q, ny * q, Math.sin(h) * nx - g * Math.cos(h) * ny * q];
  }

  /** SKYWAY scenery: is the spot (px, pz) with radius r clear of the road and of every ship near sample i? */
  clear(px, pz, r, i) {
    const T = this.track;
    for (let j = Math.max(0, i - 760); j < Math.min(T.len, i + 760); j += 8) {
      const d = T.W[j] + r + (T.ZONE[j] === 0 ? 14 : 9);
      const dx = T.X[j] - px, dz = T.Z[j] - pz;
      if (dx * dx + dz * dz < d * d) return false;
    }
    for (let q = Math.max(0, T.SEC[i] - 2); q < Math.min(T.sections.length, T.SEC[i] + 3); q++) {
      const hu = T.sections[q].hull;
      if (hu && pz > hu.z0 - 70 - r && pz < hu.z1 + 70 + r && px > hu.x0 + hu.uMin - 75 - r && px < hu.x0 + hu.uMax + 75 + r) return false;
    }
    return true;
  }

  // Sweep a strip between two profile points (functions of the sample) from i0 to i1.
  // Normal points to the left of a→b in the local (x right, y up) plane.
  sweep(B, i0, i1, fa, fb, opt = {}) {
    const step = TRACK.MESH_STEP;
    const uScale = opt.uScale ?? 0.125, vScale = opt.vScale ?? 0.125, norm = opt.normalizeU;
    for (let i = i0; i < i1; i += step) {
      const j = Math.min(i + step, i1);
      if (opt.when && !opt.when(i)) continue;
      const a0 = fa(i), b0 = fb(i), a1 = fa(j), b1 = fb(j);
      const A0 = this.P(i, a0[0], a0[1]), B0 = this.P(i, b0[0], b0[1]);
      const A1 = this.P(j, a1[0], a1[1]), B1 = this.P(j, b1[0], b1[1]);
      const dx = b0[0] - a0[0], dy = b0[1] - a0[1], L = Math.hypot(dx, dy) || 1;
      const n0 = this.N(i, -dy / L, dx / L), n1 = this.N(j, -dy / L, dx / L);
      const L1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]);
      const ua0 = norm ? 0 : 0, ub0 = norm ? 1 : L * uScale, ub1 = norm ? 1 : L1 * uScale;
      const v0 = i * vScale, v1 = j * vScale;
      B.tri(A0, B0, A1, n0, n0, n1, [ua0, v0], [ub0, v0], [ua0, v1]);
      B.tri(B0, B1, A1, n0, n1, n1, [ub0, v0], [ub1, v1], [ua0, v1]);
    }
  }

  // A box positioned in the track frame at sample i: centre (lx, ly, along), size (sx, sy, sz), extra yaw.
  box(B, i, lx, ly, along, sx, sy, sz, yaw = 0) {
    const T = this.track, h = T.H[i] + yaw;
    const R = [-Math.cos(h), 0, Math.sin(h)], Tg = [Math.sin(h), 0, Math.cos(h)];
    const c = this.P(i, lx, ly);
    c[0] += Tg[0] * along; c[2] += Tg[2] * along;
    const p = BOX.attributes.position, n = BOX.attributes.normal, uv = BOX.attributes.uv;
    const tmp = [];
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k) * sx, y = p.getY(k) * sy, z = -p.getZ(k) * sz;
      tmp.push([
        [c[0] + R[0] * x + Tg[0] * z, c[1] + y, c[2] + R[2] * x + Tg[2] * z],
        [R[0] * n.getX(k) - Tg[0] * n.getZ(k), n.getY(k), R[2] * n.getX(k) - Tg[2] * n.getZ(k)],
        [uv.getX(k) * Math.max(sx, sz) * 0.25, uv.getY(k) * sy * 0.25],
      ]);
    }
    // (R, up, -T) is right-handed, so the box keeps its winding.
    for (let k = 0; k < tmp.length; k += 3) {
      const a = tmp[k], b = tmp[k + 1], c2 = tmp[k + 2];
      B.tri(a[0], b[0], c2[0], a[1], b[1], c2[1], a[2], b[2], c2[2]);
    }
  }

  // A quad in the track frame facing along -T (toward the approaching ship) or sideways.
  // A patch lying on the road, `w` across and `l` along, centred on sample i at `lx` across: it is cut where the
  // road's own plating is cut, so it rises and turns with it. `near`: which edge (+1 right, -1 left) is u = 1.
  pool(B, i, lx, ly, w, l, near = 1) {
    const T = this.track, st = TRACK.MESH_STEP, k = Math.max(st, Math.round(l / 2 / st) * st);
    const a = Math.max(0, i - k), b = Math.min(T.len - 1, i + k), n = [0, 1, 0];
    const x0 = lx - (near * w) / 2, x1 = lx + (near * w) / 2;   // u runs from x0 to x1
    for (let j = a; j < b; j += st) {
      const j1 = Math.min(j + st, b), v0 = (j - a) / (b - a), v1 = (j1 - a) / (b - a);
      const A0 = this.P(j, x0, ly), B0 = this.P(j, x1, ly), A1 = this.P(j1, x0, ly), B1 = this.P(j1, x1, ly);
      B.tri(A0, B0, A1, n, n, n, [0, v0], [1, v0], [0, v1]);
      B.tri(B0, B1, A1, n, n, n, [1, v0], [1, v1], [0, v1]);
    }
  }

  quad(B, i, lx, ly, along, w, h, facing = 'back', nudge = 0) {
    const T = this.track, hh = T.H[i];
    const R = [-Math.cos(hh), 0, Math.sin(hh)], Tg = [Math.sin(hh), 0, Math.cos(hh)];
    const c = this.P(i, lx, ly);
    c[0] += Tg[0] * along; c[2] += Tg[2] * along;
    let ax, nrm;
    if (facing === 'back') { ax = [R[0], 0, R[2]]; nrm = [-Tg[0], 0, -Tg[2]]; }
    else if (facing === 'left') { ax = [-Tg[0], 0, -Tg[2]]; nrm = [-R[0], 0, -R[2]]; } // on the right wall, facing inward
    else { ax = [Tg[0], 0, Tg[2]]; nrm = [R[0], 0, R[2]]; }
    c[0] += nrm[0] * nudge; c[2] += nrm[2] * nudge;
    const p = PLANE.attributes.position, uv = PLANE.attributes.uv;
    const verts = [];
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k) * w, y = p.getY(k) * h;
      verts.push([[c[0] + ax[0] * x, c[1] + y, c[2] + ax[2] * x], nrm, [uv.getX(k), uv.getY(k)]]);
    }
    for (let k = 0; k < verts.length; k += 3) B.tri(verts[k][0], verts[k + 1][0], verts[k + 2][0], verts[k][1], verts[k + 1][1], verts[k + 2][1], verts[k][2], verts[k + 1][2], verts[k + 2][2]);
  }

  rock(B, cx, cy, cz, scale, rotY, variant) {
    const g = this.rockGeos[variant % this.rockGeos.length];
    const p = g.attributes.position, n = g.attributes.normal;
    const c = Math.cos(rotY), s = Math.sin(rotY);
    for (let k = 0; k < p.count; k += 3) {
      const v = [], nn = [];
      for (let q = 0; q < 3; q++) {
        const x = p.getX(k + q) * scale, y = p.getY(k + q) * scale, z = p.getZ(k + q) * scale;
        v.push([cx + x * c + z * s, cy + y, cz - x * s + z * c]);
        const nx = n.getX(k + q), ny = n.getY(k + q), nz = n.getZ(k + q);
        nn.push([nx * c + nz * s, ny, -nx * s + nz * c]);
      }
      B.tri(v[0], v[1], v[2], nn[0], nn[1], nn[2], [0, 0], [1, 0], [0, 1]);
    }
  }

  // ----- chunk -----
  buildChunk(c) {
    const T = this.track;
    const i0 = c * TRACK.CHUNK, i1 = Math.min((c + 1) * TRACK.CHUNK, T.len - 1);
    const rng = mulberry32(T.seed * 131 + c * 977);
    const group = new THREE.Group();
    const buckets = new Map();
    const get = (key, mat) => { if (!buckets.has(key)) buckets.set(key, new Bucket(mat)); return buckets.get(key); };
    const W = (i) => T.W[i];
    const zoneAt = (i) => T.ZONE[i];
    const flag = (i) => T.FLAG[i];
    const st = (i) => zoneAt(i) === 0;
    const sec = (i) => T.sections[T.SEC[i]];
    const m = this.m;
    const hilly = T.map === 'skyway';
    // SKYWAY stations are ships: one rigid hull each (level/ShipHull.js) instead of the strip of hull swept here
    const hs = (i) => st(i) && !sec(i).ship;

    // ---------- station interior ----------
    const pal = (i) => sec(i).palette || [0x37e6ff, 0xff3fb4, 0xffffff];
    const midSec = sec(Math.min(i1, i0 + 2));
    const p0 = pal(Math.min(i1, i0 + 2));
    const floorB = get('floor', m.floorFor(p0[0]));
    const wallB = get('wall', m.wall), ceilB = get('ceil', m.ceiling), glassB = get('glass', m.glass);
    const trimB = get('trim', m.trim), hullB = get('hull', m.hull);
    const n1 = get('neon1', m.neon(p0[0], 2.0)), n2 = get('neon2', m.neon(p0[1], 2.0)), n3 = get('neon3', m.neon(p0[2], 1.5));

    const noWin = (bit) => (i) => st(i) && !(flag(i) & bit);
    const win = (bit) => (i) => st(i) && (flag(i) & bit);

    this.sweep(floorB, i0, i1, (i) => [-W(i), 0], (i) => [W(i), 0], { when: st, normalizeU: true, vScale: 1 / 16 });
    // right wall (CCW profile: up the right side)
    this.sweep(wallB, i0, i1, (i) => [W(i), 0], (i) => [W(i), H], { when: noWin(WIN_R) });
    this.sweep(wallB, i0, i1, (i) => [W(i), 0], (i) => [W(i), WIN_LO], { when: win(WIN_R) });
    this.sweep(wallB, i0, i1, (i) => [W(i), WIN_HI], (i) => [W(i), H], { when: win(WIN_R) });
    this.sweep(glassB, i0, i1, (i) => [W(i), WIN_LO], (i) => [W(i), WIN_HI], { when: win(WIN_R) });
    // left wall (down the left side)
    this.sweep(wallB, i0, i1, (i) => [-W(i), H], (i) => [-W(i), 0], { when: noWin(WIN_L) });
    this.sweep(wallB, i0, i1, (i) => [-W(i), WIN_LO], (i) => [-W(i), 0], { when: win(WIN_L) });
    this.sweep(wallB, i0, i1, (i) => [-W(i), H], (i) => [-W(i), WIN_HI], { when: win(WIN_L) });
    this.sweep(glassB, i0, i1, (i) => [-W(i), WIN_HI], (i) => [-W(i), WIN_LO], { when: win(WIN_L) });
    // ceiling with optional skylight
    this.sweep(ceilB, i0, i1, (i) => [W(i), H], (i) => [-W(i), H], { when: noWin(SKY) });
    this.sweep(ceilB, i0, i1, (i) => [W(i), H], (i) => [W(i) * 0.55, H], { when: win(SKY) });
    this.sweep(ceilB, i0, i1, (i) => [-W(i) * 0.55, H], (i) => [-W(i), H], { when: win(SKY) });
    this.sweep(glassB, i0, i1, (i) => [W(i) * 0.55, H], (i) => [-W(i) * 0.55, H], { when: win(SKY) });
    // cornices along the top corners
    this.sweep(trimB, i0, i1, (i) => [W(i), H - 1.3], (i) => [W(i) - 0.9, H], { when: st });
    this.sweep(trimB, i0, i1, (i) => [-W(i) + 0.9, H], (i) => [-W(i), H - 1.3], { when: st });
    // neon: low wall strips, ceiling spine, floor edge lines, window sills
    this.sweep(n1, i0, i1, (i) => [W(i) - 0.03, 0.45], (i) => [W(i) - 0.03, 0.7], { when: st });
    this.sweep(n1, i0, i1, (i) => [-W(i) + 0.03, 0.7], (i) => [-W(i) + 0.03, 0.45], { when: st });
    this.sweep(n2, i0, i1, (i) => [0.5, H - 0.03], (i) => [-0.5, H - 0.03], { when: noWin(SKY) });
    this.sweep(n2, i0, i1, (i) => [W(i) - 0.95, H - 0.1], (i) => [W(i) - 1.15, H - 0.1], { when: st });
    this.sweep(n2, i0, i1, (i) => [-W(i) + 1.15, H - 0.1], (i) => [-W(i) + 0.95, H - 0.1], { when: st });
    this.sweep(n3, i0, i1, (i) => [-W(i) + 0.7, 0.03], (i) => [-W(i) + 0.95, 0.03], { when: st });
    this.sweep(n3, i0, i1, (i) => [W(i) - 0.95, 0.03], (i) => [W(i) - 0.7, 0.03], { when: st });
    this.sweep(n2, i0, i1, (i) => [W(i) - 0.04, WIN_LO - 0.12], (i) => [W(i) - 0.04, WIN_LO + 0.02], { when: win(WIN_R) });
    this.sweep(n2, i0, i1, (i) => [-W(i) + 0.04, WIN_LO + 0.02], (i) => [-W(i) + 0.04, WIN_LO - 0.12], { when: win(WIN_L) });

    if (this.lit) {
      // what the strips light: the floor in front of each wall strip, the wall above it, the ceiling beside its spine
      const w1 = get('spill1', m.spill(p0[0], 0.2)), w2 = get('spill2', m.spill(p0[1], 0.14));
      for (const side of [-1, 1]) {
        this.sweep(w1, i0, i1, (i) => [side * (W(i) - 0.5), 0.05], (i) => [side * (W(i) - 7), 0.05], { when: st, normalizeU: true });
        this.sweep(w1, i0, i1, (i) => [side * (W(i) - 0.05), 0.72], (i) => [side * (W(i) - 0.05), 1.66], { when: st, normalizeU: true });
        this.sweep(w2, i0, i1, (i) => [side * 0.5, H - 0.05], (i) => [side * 5.5, H - 0.05], { when: noWin(SKY), normalizeU: true });
      }
    }

    // ribs every 12 m, with light bars
    for (let i = Math.ceil(i0 / 12) * 12; i < i1; i += 12) {
      if (!st(i)) continue;
      const w = W(i);
      this.box(trimB, i, w - 0.35, H / 2, 0, 0.8, H, 0.9);
      this.box(trimB, i, -w + 0.35, H / 2, 0, 0.8, H, 0.9);
      this.box(trimB, i, 0, H - 0.4, 0, 2 * w, 0.8, 0.9);
      this.box(n1, i, w - 0.78, H * 0.55, 0, 0.06, H * 0.5, 0.3);
      this.box(n1, i, -w + 0.78, H * 0.55, 0, 0.06, H * 0.5, 0.3);
      if (rng() < 0.5) this.box(n3, i, 0, H - 0.84, 0, w * 1.2, 0.08, 0.3);
    }

    // SKYWAY ships: a heavy bulkhead frame every 48 m, lit in the ship's colours. It stands no further
    // off the wall than the ribs do, so the room the ship has is unchanged.
    for (let i = Math.ceil(i0 / 48) * 48 + 24; i < i1; i += 48) {
      if (!st(i) || !sec(i).ship) continue;
      const w = W(i);
      for (const side of [-1, 1]) {
        this.box(trimB, i, side * (w - 0.4), H / 2, 0, 0.82, H, 3.2);
        this.box(n2, i, side * (w - 0.83), H / 2, 1.5, 0.05, H - 1.2, 0.16);
        this.box(n2, i, side * (w - 0.83), H / 2, -1.5, 0.05, H - 1.2, 0.16);
        this.box(get('hazardM', m.hazard), i, side * (w - 0.82), 1.1, 0, 0.04, 1.4, 3.0);
      }
      this.box(trimB, i, 0, H - 0.7, 0, 2 * w, 1.4, 3.2);
      this.box(n2, i, 0, H - 1.42, 1.5, 2 * w - 1.8, 0.05, 0.16);
      this.box(n2, i, 0, H - 1.42, -1.5, 2 * w - 1.8, 0.05, 0.16);
    }

    // signage: wall boards and hanging vertical banners facing the ship
    for (let i = i0 + 6; i < i1 - 2; i += 6) {
      if (!st(i)) continue;
      const w = W(i);
      if (rng() < 0.16) {
        const right = rng() < 0.5;
        if (!(flag(i) & (right ? WIN_R : WIN_L))) {
          const s = m.signs[Math.floor(rng() * m.signs.length)];
          this.quad(get('sign' + s.id, s), i, right ? w - 0.06 : -w + 0.06, 4.6, 0, 6.4, 2.6, right ? 'left' : 'right');
        }
      }
      if (rng() < 0.11) {
        const s = m.signsV[Math.floor(rng() * m.signsV.length)];
        const x = (rng() < 0.5 ? -1 : 1) * (w - 1.6);
        this.quad(get('signv' + s.id, s), i, x, H - 3.2, 0, 1.7, 4.2, 'back');
        this.box(trimB, i, x, H - 0.55, 0, 0.12, 1.1, 0.12);
      }
    }

    // ---------- hull exterior ----------
    const HT = H + PAD + 2, HB = -PAD;
    this.sweep(hullB, i0, i1, (i) => [-W(i) - PAD, HT], (i) => [W(i) + PAD, HT], { when: hs, uScale: 1 / 32, vScale: 1 / 32 });
    this.sweep(hullB, i0, i1, (i) => [W(i) + PAD, HT], (i) => [W(i) + PAD, HB], { when: hs, uScale: 1 / 32, vScale: 1 / 32 });
    this.sweep(hullB, i0, i1, (i) => [W(i) + PAD, HB], (i) => [-W(i) - PAD, HB], { when: hs, uScale: 1 / 32, vScale: 1 / 32 });
    this.sweep(hullB, i0, i1, (i) => [-W(i) - PAD, HB], (i) => [-W(i) - PAD, HT], { when: hs, uScale: 1 / 32, vScale: 1 / 32 });
    // window bands seen from outside
    // Exterior-only (front-facing, outward) so they never show through the windows from inside.
    const band = get('band', m.neonOut(0x9fe8ff, 0.9));
    const n1o = get('neon1o', m.neonOut(p0[0], 2.0));
    const winOut = (bit) => (i) => hs(i) && (flag(i) & bit);
    this.sweep(band, i0, i1, (i) => [W(i) + PAD + 0.05, 6.5], (i) => [W(i) + PAD + 0.05, 2.5], { when: winOut(WIN_R) });
    this.sweep(band, i0, i1, (i) => [-W(i) - PAD - 0.05, 2.5], (i) => [-W(i) - PAD - 0.05, 6.5], { when: winOut(WIN_L) });
    this.sweep(n1o, i0, i1, (i) => [W(i) + PAD + 0.06, HT - 0.6], (i) => [W(i) + PAD + 0.06, HT - 0.9], { when: hs });
    this.sweep(n1o, i0, i1, (i) => [-W(i) - PAD - 0.06, HT - 0.9], (i) => [-W(i) - PAD - 0.06, HT - 0.6], { when: hs });

    // roof skyline: towers and antennas (never above a skylight)
    for (let i = i0 + 3; i < i1 - 3; i += 7) {
      if (!hs(i) || (flag(i) & SKY)) continue;
      const w = W(i) + PAD;
      if (rng() < 0.55) {
        const tw = 3 + rng() * 6, th = 4 + rng() * (rng() < 0.2 ? 46 : 16), x = (rng() * 2 - 1) * (w - tw / 2);
        this.box(hullB, i, x, HT + th / 2, 0, tw, th, 3 + rng() * 5);
        if (rng() < 0.6) this.box(get('neonA', m.neon(pal(i)[Math.floor(rng() * 2)], 2.6)), i, x, HT + th - 0.6 - rng() * th * 0.5, 0, tw + 0.08, 0.35, 0.3);
      }
      if (rng() < 0.18) {
        const x = (rng() * 2 - 1) * w * 0.8, ah = 8 + rng() * 22;
        this.box(trimB, i, x, HT + ah / 2, 0, 0.3, ah, 0.3);
        this.box(get('beaconR', m.neon(0xff3030, 4)), i, x, HT + ah, 0, 0.7, 0.7, 0.7);
      }
    }

    // ---------- section caps (station entrances / exits) ----------
    for (const S of T.sections) {
      if (S.type !== 'station') continue;
      for (const [s, isEntry] of [[S.s0, true], [S.s1 - 1, false]]) {
        if (s < i0 || s >= i1) continue;
        const w = W(s), along = isEntry ? -0.8 : 0.8;
        const ow = w + PAD;
        if (!S.ship) {
          this.box(hullB, s, -(w + ow) / 2, (HB + HT) / 2, along, PAD, HT - HB, 1.6);
          this.box(hullB, s, (w + ow) / 2, (HB + HT) / 2, along, PAD, HT - HB, 1.6);
          this.box(hullB, s, 0, (H + HT) / 2, along, 2 * w, HT - H, 1.6);
          this.box(hullB, s, 0, HB / 2, along, 2 * w, -HB, 1.6);
        }
        const nA = get('capN', m.neon(S.palette[0], 4)), nB = get('capN2', m.neon(S.palette[1], 4));
        const e = isEntry ? -1.7 : 1.7;
        this.box(nA, s, -w - 0.25, H / 2, e, 0.4, H + 0.5, 0.2);
        this.box(nA, s, w + 0.25, H / 2, e, 0.4, H + 0.5, 0.2);
        this.box(nA, s, 0, H + 0.25, e, 2 * w + 0.9, 0.4, 0.2);
        // chevrons over the doors
        for (let k = -3; k <= 3; k++) this.box(nB, s, k * 2.4, H + 2.2, e, 1.4, 0.35, 0.2);
        if (isEntry) {
          const nameMat = new THREE.MeshBasicMaterial({ map: stationNameTexture(S.name, S.palette[0]), transparent: true, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2), side: THREE.DoubleSide });
          nameMat.userData.owned = true;
          this.quad(get('name' + S.id, nameMat), s, 0, HT + 6, -2.2, 34, 8.5, 'back');
          this.box(trimB, s, -12, HT + 3, -2, 0.4, 6, 0.4);
          this.box(trimB, s, 12, HT + 3, -2, 0.4, 6, 0.4);
        }
      }
    }

    // ---------- open space lane ----------
    const sp = (i) => zoneAt(i) === 1;
    if (!hilly) {
      const laneB = get('lane', m.lane);
      this.sweep(laneB, i0, i1, (i) => [-W(i), 0], (i) => [W(i), 0], { when: sp, normalizeU: true, vScale: 1 / 12 });
      const edgeB = get('edge', m.neon(0x37e6ff, 2.2));
      this.sweep(edgeB, i0, i1, (i) => [-W(i) - 0.15, 0.02], (i) => [-W(i) + 0.15, 0.02], { when: sp });
      this.sweep(edgeB, i0, i1, (i) => [W(i) - 0.15, 0.02], (i) => [W(i) + 0.15, 0.02], { when: sp });
    } else {
      // SKYWAY: a real deck, so the hills can be read. Plating on top, a kerb and a skirt down each side, an
      // underside (the road is often seen from below), and a soft energy rail along each edge:
      // cyan on the right, magenta on the left, so you always know which way round you are.
      const TH = 1.9, K = 0.9;
      const deckB = get('deck', m.deck), skirtB = get('skirt', m.trim);
      this.sweep(deckB, i0, i1, (i) => [-W(i), 0], (i) => [W(i), 0], { when: sp, normalizeU: true, vScale: 1 / 16 });
      this.sweep(skirtB, i0, i1, (i) => [W(i), 0], (i) => [W(i) + K, -0.5], { when: sp });
      this.sweep(skirtB, i0, i1, (i) => [W(i) + K, -0.5], (i) => [W(i) + K, -TH], { when: sp });
      this.sweep(skirtB, i0, i1, (i) => [W(i) + K, -TH], (i) => [-W(i) - K, -TH], { when: sp, uScale: 1 / 16, vScale: 1 / 16 });
      this.sweep(skirtB, i0, i1, (i) => [-W(i) - K, -TH], (i) => [-W(i) - K, -0.5], { when: sp });
      this.sweep(skirtB, i0, i1, (i) => [-W(i) - K, -0.5], (i) => [-W(i), 0], { when: sp });
      const eR = get('edgeR', m.neon(0x37e6ff, 2.4)), eL = get('edgeL', m.neon(0xff3fb4, 2.4));
      this.sweep(eR, i0, i1, (i) => [W(i) - 0.3, 0.03], (i) => [W(i) + 0.12, 0.03], { when: sp });
      this.sweep(eL, i0, i1, (i) => [-W(i) - 0.12, 0.03], (i) => [-W(i) + 0.3, 0.03], { when: sp });
      this.sweep(eR, i0, i1, (i) => [W(i) + K + 0.02, -0.75], (i) => [W(i) + K + 0.02, -1.0], { when: sp });
      this.sweep(eL, i0, i1, (i) => [-W(i) - K - 0.02, -1.0], (i) => [-W(i) - K - 0.02, -0.75], { when: sp });
      this.sweep(get('rail', m.rail), i0, i1, (i) => [W(i) + 0.35, 0.05], (i) => [W(i) + 0.35, 2.1], { when: sp, normalizeU: true, vScale: 1 / 8 });
      this.sweep(get('railW', m.railWarm), i0, i1, (i) => [-W(i) - 0.35, 0.05], (i) => [-W(i) - 0.35, 2.1], { when: sp, normalizeU: true, vScale: 1 / 8 });
      // Speed zones (Track.F): where the road brakes the ship on the way in to a ship, amber bars across the
      // deck, closing up as the mouth comes; where it launches the ship on the way out, a rail of running
      // chevrons down the middle. They are drawn wherever the map has the zones; whether the speed really
      // changes there is the mode's business (core/Maps.js).
      const F = T.F;
      if (F) {
        const fall = (i) => sp(i) && F[i + 1] < F[i], rise = (i) => sp(i) && F[i + 1] > F[i];
        this.sweep(get('launch', m.launch), i0, i1, () => [-3.4, 0.07], () => [3.4, 0.07], { when: rise, normalizeU: true, vScale: 1 / 7 });
        this.sweep(get('launchE', m.neon(0x5ff3ff, 1.6)), i0, i1, () => [-3.9, 0.06], () => [-3.6, 0.06], { when: rise });
        this.sweep(get('launchE', m.neon(0x5ff3ff, 1.6)), i0, i1, () => [3.6, 0.06], () => [3.9, 0.06], { when: rise });
        const bar = get('brake', m.neon(0xff8a3d, 2.2));
        for (let i = i0; i < i1; i++) {
          if (!fall(i)) continue;
          const gap = F[i] > 0.66 ? 16 : F[i] > 0.33 ? 10 : 6;          // closer together as the ship slows
          if (i % gap === 0) this.box(bar, i, 0, 0.05, 0, 2 * W(i) - 1.4, 0.06, 0.8);
        }
      }

      // ribs under the deck, and a lifter pod every so often: it floats, and it should look like it means to
      const podN = get('podN', m.neonOut(0x37e6ff, 2.6));
      for (let i = Math.ceil(i0 / 16) * 16; i < i1; i += 16) {
        if (!sp(i)) continue;
        this.box(skirtB, i, 0, -TH - 0.35, 0, 2 * W(i) + 1.2, 0.7, 1.4);
        if (i % 64 === 0) {
          this.box(skirtB, i, 0, -TH - 1.9, 0, Math.min(14, W(i)), 2.6, 16);
          this.box(podN, i, 0, -TH - 3.25, 0, Math.min(10, W(i) * 0.7), 0.12, 11);
        }
      }
    }
    const bA = get('beaconA', m.neon(0x37e6ff, 5)), bB = get('beaconB', m.neon(0xff3fb4, 5));
    for (let i = Math.ceil(i0 / 16) * 16; i < i1; i += 16) {
      if (!sp(i)) continue;
      const w = W(i), alt = (i / 16) % 2 === 0;
      for (const side of [-1, 1]) {
        this.box(trimB, i, side * (w + 0.6), 1.2, 0, 0.35, 2.4, 0.35);
        this.box(alt ? bA : bB, i, side * (w + 0.6), 2.55, 0, 0.6, 0.3, 0.6);
      }
    }
    if (this.lit) {
      // the pool each lamp throws on the road beside it, in the lamp's own colour
      const pA = get('poolA', m.pool(0x37e6ff, 0.16)), pB = get('poolB', m.pool(0xff3fb4, 0.16));
      for (let i = Math.ceil(i0 / 16) * 16; i < i1; i += 16) {
        if (!sp(i)) continue;
        for (const side of [-1, 1]) this.pool((i / 16) % 2 === 0 ? pA : pB, i, side * (W(i) - 4.7), 0.09, 9.8, 16, side);
      }
    }
    // runway lights before a station entrance
    for (let i = Math.ceil(i0 / 6) * 6; i < i1; i += 6) {
      if (!sp(i)) continue;
      const next = T.sections[T.SEC[i] + 1];
      if (!next || next.s0 - i > 110) continue;
      for (const side of [-1, 1]) {
        this.box(get('runway', m.neon(0xffe7a8, 4)), i, side * (W(i) - 0.6), 0.15, 0, 0.5, 0.25, 1.4);
        if (this.lit) this.pool(get('poolRun', m.pool(0xffe7a8, 0.18)), i, side * (W(i) - 2.3), 0.09, 4.6, 6, side);
      }
    }
    // asteroid scenery on both sides, and a few drifting near the lane
    const rockB = get('rock', m.rock);
    for (let i = i0; i < i1; i += 4) {
      if (!sp(i) || rng() > 0.4) continue;
      const side = rng() < 0.5 ? -1 : 1;
      const dist = W(i) + 10 + Math.pow(rng(), 1.6) * 170;
      const sc = 1.2 + Math.pow(rng(), 2.2) * (dist > 60 ? 26 : 7);
      const y = (rng() * 2 - 1) * (10 + dist * 0.35);
      const p = this.P(i, side * dist, y);
      const rot = rng() * 6.28, variant = Math.floor(rng() * 5);
      // SKYWAY doubles back beside itself: scenery never lands on another stretch of road or on a ship
      if (hilly && !this.clear(p[0], p[2], sc, i)) continue;
      if (this.rocks < 1 && ((i * 2654435761) >>> 0) / 4294967296 >= this.rocks) continue;   // thinned by position, not by the dice: the rest stay where they were
      this.rock(rockB, p[0], p[1], p[2], sc, rot, variant);
    }
    // a little debris drifting around station exteriors so they don't sit in empty space
    for (let i = i0; i < i1; i += 8) {
      if (!hs(i) || rng() > 0.12) continue;
      const side = rng() < 0.5 ? -1 : 1;
      const p = this.P(i, side * (W(i) + PAD + 8 + rng() * 40), (rng() * 2 - 1) * 20);
      if (this.rocks < 1 && ((i * 2654435761) >>> 0) / 4294967296 >= this.rocks) { rng(); rng(); rng(); continue; }
      this.rock(rockB, p[0], p[1], p[2], 0.8 + rng() * 2.5, rng() * 6.28, Math.floor(rng() * 5));
    }

    for (const b of buckets.values()) {
      const mesh = b.mesh();
      if (mesh) group.add(mesh);
    }
    group.userData.c = c;
    group.userData.station = midSec.type === 'station';
    return group;
  }

  disposeChunk(group) {
    group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (o.material.map && o.material.userData.owned) o.material.map.dispose();
      }
    });
  }
}

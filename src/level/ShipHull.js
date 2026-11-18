import * as THREE from 'three';
import { TRACK } from '../core/Constants.js';
import { mulberry32 } from './Track.js';
import { stationNameTexture } from './Materials.js';

// The outside of a SKYWAY station: one rigid vessel lying along world forward, lofted round the path
// the corridor really takes inside it (Track section `hull`). You fly in through a mouth in one end
// and out through the other. A handful of draw calls per ship.
//
// Everything here is drawn single-sided, facing out. That is what lets the corridor's windows and
// skylights look straight through the hull at the sky, as they always have.

const H = TRACK.HEIGHT;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

class Tris {
  constructor(material, uvScale = 1 / 32) { this.material = material; this.pos = []; this.nor = []; this.uv = []; this.k = uvScale; }
  /** One flat triangle, wound counter-clockwise as seen from outside. */
  tri(a, b, c, ua, ub, uc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    // hull plating runs along the ship: u = distance along, v = height (or across, on decks)
    const st = (p) => (Math.abs(ny) > 0.7 ? [p[2] * this.k, p[0] * this.k] : Math.abs(nz) > 0.7 ? [p[0] * this.k, p[1] * this.k] : [p[2] * this.k, p[1] * this.k]);
    const A = ua || st(a), B = ub || st(b), C = uc || st(c);
    this.uv.push(A[0], A[1], B[0], B[1], C[0], C[1]);
  }
  quad(a, b, c, d, uvs) { if (uvs) { this.tri(a, b, c, uvs[0], uvs[1], uvs[2]); this.tri(a, c, d, uvs[0], uvs[2], uvs[3]); } else { this.tri(a, b, c); this.tri(a, c, d); } }
  /** An axis-aligned box. `open` names a face to leave off ('bottom': it stands on the hull). */
  box(cx, cy, cz, sx, sy, sz, open = '') {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);                      // top
    if (open !== 'bottom') this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);                      // +x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);                      // -x
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);                      // +z
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);                      // -z
  }
  /** A tube along z from za to zb (radius ra to rb), no ends. */
  tube(cx, cy, za, zb, ra, rb, n = 14) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 6.2832, a1 = ((i + 1) / n) * 6.2832;
      const p = (a, z, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
      this.quad(p(a0, za, ra), p(a1, za, ra), p(a1, zb, rb), p(a0, zb, rb));
    }
  }
  /** A disc facing +z (dir 1) or -z (dir -1). */
  disc(cx, cy, z, r, dir, n = 14) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 6.2832, a1 = ((i + 1) / n) * 6.2832;
      const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z], p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z];
      if (dir > 0) this.tri([cx, cy, z], p0, p1); else this.tri([cx, cy, z], p1, p0);
    }
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

/** Build the hull of ship station `sec` of `track`. Returns a THREE.Group in world space. */
export function buildShipHull(track, sec, m) {
  const T = track, hu = sec.hull, pal = sec.palette;
  const L = hu.z1 - hu.z0, x0 = hu.x0, yF = hu.y;
  const rng = mulberry32((T.seed * 7919 + sec.id * 104729) >>> 0);
  const r = (a, b) => a + (b - a) * rng();
  const hull = new Tris(m.shipHull, 1 / 84), dark = new Tris(m.shipTrim, 1 / 8);
  const n1 = new Tris(m.far(pal[0], 2.2)), n2 = new Tris(m.far(pal[1], 2.2));
  const glow = new Tris(m.far(pal[2], 1.5)), red = new Tris(m.far(0xff3030, 3)), green = new Tris(m.far(0x30ff70, 2.4));
  const bell = new Tris(m.far(pal[0], 1.6)), core = new Tris(m.far(pal[0], 0.2));
  const plume = new Tris(m.plume(pal[0]));

  // ---- where the corridor is, slice by slice along the axis ----
  const N = Math.max(12, Math.round(L / 20));
  const need = Array.from({ length: N + 1 }, () => [0, 0]);
  for (let i = sec.s0; i < sec.s1; i++) {
    const q = ((T.Z[i] - hu.z0) / L) * N, u = T.X[i] - x0, w = T.W[i] + 8;
    for (let k = Math.max(0, Math.floor(q) - 1); k <= Math.min(N, Math.ceil(q) + 1); k++) { need[k][0] = Math.min(need[k][0], u - w); need[k][1] = Math.max(need[k][1], u + w); }
  }

  // ---- the shape: three hull forms, engines at one end, a prow at the other ----
  const V = hu.variant;                         // 0 carrier (wide, flat), 1 freighter (boxy, tall), 2 cruiser (lean, finned)
  const beam = [48, 32, 25][V], rise = [19, 36, 27][V], keel = [14, 21, 16][V];
  const eng = hu.flip ? 0 : 1;                  // which end (0 = where you come in, 1 = where you leave) carries the engines
  const wMouth = (t) => lerp(hu.w0, hu.w1, t) + 8;
  const slice = (k) => {
    const t = k / N;
    const te = eng ? 1 - t : t;                 // 0 at the engine end, 1 at the prow
    // how far the hull has swelled from a mouth to its full section: blunt at the engines, long taper at the prow
    const grow = Math.min(smooth(te / 0.12), smooth((1 - te) / 0.3));
    const waist = 1 - 0.12 * Math.sin(Math.PI * 3 * t) * (V === 2 ? 1 : 0.4);
    const lo = Math.min(need[k][0], -(wMouth(t) + grow * beam * waist));
    const hi = Math.max(need[k][1], wMouth(t) + grow * beam * waist);
    const top = H + 6 + grow * rise, bot = -(4.5 + grow * keel);
    const c = Math.min((top - bot) * 0.3, (hi - lo) * 0.2);
    return { z: hu.z0 + t * L, lo, hi, top: yF + top, bot: yF + bot, c };
  };
  const S = [];
  for (let k = 0; k <= N; k++) S.push(slice(k));
  const ring = (s) => [
    [x0 + s.lo + s.c, s.bot, s.z], [x0 + s.hi - s.c, s.bot, s.z], [x0 + s.hi, s.bot + s.c, s.z], [x0 + s.hi, s.top - s.c, s.z],
    [x0 + s.hi - s.c, s.top, s.z], [x0 + s.lo + s.c, s.top, s.z], [x0 + s.lo, s.top - s.c, s.z], [x0 + s.lo, s.bot + s.c, s.z],
  ];
  for (let k = 0; k < N; k++) {
    const A = ring(S[k]), B = ring(S[k + 1]);
    for (let e = 0; e < 8; e++) { const f = (e + 1) % 8; hull.quad(A[e], A[f], B[f], B[e]); }
  }
  // the two end faces, each with the mouth cut out of it
  for (const end of [0, 1]) {
    const s = S[end ? N : 0], P = ring(s), w = end ? hu.w1 : hu.w0;
    const BL = [x0 - w, yF, s.z], BR = [x0 + w, yF, s.z], TR = [x0 + w, yF + H, s.z], TL = [x0 - w, yF + H, s.z];
    const faces = [[P[0], P[1], BR, BL], [P[1], P[2], BR], [P[2], P[3], TR, BR], [P[3], P[4], TR], [P[4], P[5], TL, TR], [P[5], P[6], TL], [P[6], P[7], BL, TL], [P[7], P[0], BL]];
    for (const f of faces) {
      const g = end ? f : f.slice().reverse();
      if (g.length === 4) hull.quad(g[0], g[1], g[2], g[3]); else hull.tri(g[0], g[1], g[2]);
    }
  }
  const at = (t) => { const q = clamp(t, 0, 1) * N, k = Math.min(N - 1, Math.floor(q)), f = q - k, a = S[k], b = S[k + 1]; return { z: lerp(a.z, b.z, f), lo: lerp(a.lo, b.lo, f), hi: lerp(a.hi, b.hi, f), top: lerp(a.top, b.top, f), bot: lerp(a.bot, b.bot, f), c: lerp(a.c, b.c, f) }; };
  const fromEng = (te) => (eng ? 1 - te : te);  // te measured from the engine end -> t along the axis
  const zDir = eng ? 1 : -1;                    // the way the engines point

  // ---- running lights: the ship is usually seen against the light, so its outline is drawn in its own colours ----
  // along all four long edges of the flanks...
  for (let k = 0; k < N; k++) {
    const a = S[k], b = S[k + 1];
    for (const side of [-1, 1]) {
      const xa = x0 + (side > 0 ? a.hi : a.lo) + side * 0.15, xb = x0 + (side > 0 ? b.hi : b.lo) + side * 0.15;
      for (const up of [1, 0]) {
        const B = up ? (side > 0 ? n1 : n2) : (side > 0 ? n2 : n1);
        const ya = up ? a.top - a.c : a.bot + a.c, yb = up ? b.top - b.c : b.bot + b.c, hgt = up ? 0.8 : 0.5;
        const p = [[xa, ya - hgt, a.z], [xb, yb - hgt, b.z], [xb, yb + hgt, b.z], [xa, ya + hgt, a.z]];
        if (side > 0) B.quad(p[0], p[3], p[2], p[1]); else B.quad(p[0], p[1], p[2], p[3]);
      }
      if (k % 3 === 1) (side > 0 ? green : red).box((xa + xb) / 2 + side * 0.5, (a.top + a.bot + b.top + b.bot) / 4, (a.z + b.z) / 2, 1.1, 1.1, 3);
    }
  }
  // ...and a hoop of light round the hull at each end and at every quarter
  for (const q of [0, 0.25, 0.5, 0.75, 1]) {
    const k = Math.round(q * N), P = ring(S[k]), B = q === 0 || q === 1 ? n1 : n2, w = 0.5;
    for (let e = 0; e < 8; e++) {
      const A = P[e], Bq = P[(e + 1) % 8];
      const cx = (A[0] + Bq[0]) / 2, cy = (A[1] + Bq[1]) / 2, dx = Bq[0] - A[0], dy = Bq[1] - A[1], len = Math.hypot(dx, dy) || 1;
      const ox = (dy / len) * 0.16, oy = (-dx / len) * 0.16;                 // just proud of the plating
      const z = S[k].z + (q === 0 ? -0.2 : q === 1 ? 0.2 : 0);
      const a0 = [A[0] + ox, A[1] + oy, z - w], a1 = [Bq[0] + ox, Bq[1] + oy, z - w], b1 = [Bq[0] + ox, Bq[1] + oy, z + w], b0 = [A[0] + ox, A[1] + oy, z + w];
      B.quad(a0, a1, b1, b0);
      void cx; void cy;
    }
  }

  // ---- superstructure: all of it stands on the roof with no underside, so nothing shows through a skylight ----
  const roofBox = (B, t, u, sx, sy, sz) => { const s = at(t); B.box(x0 + clamp(u, s.lo + s.c + sx / 2, s.hi - s.c - sx / 2), s.top + sy / 2 - 0.05, s.z, sx, sy, sz, 'bottom'); return s; };
  // the bridge: an island of stacked decks with a lit window band and a mast
  const tb = fromEng([0.34, 0.42, 0.26][V] + r(-0.04, 0.04)), sb = at(tb);
  const bu = V === 0 ? (rng() < 0.5 ? -1 : 1) * (Math.min(-sb.lo, sb.hi) * 0.55) : 0;
  const bw = [34, 44, 24][V], bl = [56, 70, 50][V];
  roofBox(hull, tb, bu, bw, 10, bl);
  roofBox(hull, tb, bu, bw * 0.72, 20, bl * 0.62);
  roofBox(hull, tb, bu, bw * 0.5, 30, bl * 0.34);
  const bx = x0 + clamp(bu, sb.lo + sb.c + bw / 2, sb.hi - sb.c - bw / 2);
  glow.box(bx, sb.top + 26, sb.z, bw * 0.5 + 0.3, 1.5, bl * 0.34 + 0.3, 'bottom');     // the bridge windows, all the way round
  n1.box(bx, sb.top + 10.1, sb.z, bw + 0.3, 0.5, bl + 0.3, 'bottom');
  dark.box(bx, sb.top + 30 + 11, sb.z, 0.7, 22, 0.7, 'bottom');
  red.box(bx, sb.top + 30 + 22.6, sb.z, 1.6, 1.6, 1.6);
  // a spine down the middle, and deck housings scattered along it
  for (let te = 0.14; te < 0.86; te += 0.06 + rng() * 0.05) {
    const t = fromEng(te), s = at(t), span = s.hi - s.lo - 2 * s.c;
    if (Math.abs(t - tb) < (bl / L) * 0.7) continue;
    const sx = r(7, Math.min(30, span * 0.3)), sy = r(3, V === 1 ? 12 : 8), sz = r(10, 26);
    roofBox(hull, t, r(s.lo + s.c, s.hi - s.c), sx, sy, sz);
    if (rng() < 0.35) roofBox(rng() < 0.5 ? n1 : n2, t, r(s.lo + s.c, s.hi - s.c), r(4, 10), 0.35, 0.5);
    if (rng() < 0.16) { const u = r(s.lo + s.c + 2, s.hi - s.c - 2), hgt = r(9, 22); dark.box(x0 + u, s.top + hgt / 2, s.z, 0.35, hgt, 0.35, 'bottom'); red.box(x0 + u, s.top + hgt + 0.3, s.z, 0.8, 0.8, 0.8); }
  }
  if (V === 2) {      // cruiser: a tall dorsal fin
    const s = at(fromEng(0.2));
    hull.box(x0, s.top + 17, s.z, 2.2, 34, 60, 'bottom');
    n1.box(x0, s.top + 34.3, s.z, 2.5, 0.7, 60, 'bottom');
  }
  if (V === 1) {      // freighter: racks of containers down both sides of the roof
    for (let te = 0.5; te < 0.84; te += 0.05) for (const side of [-1, 1]) { const t = fromEng(te), s = at(t); roofBox(hull, t, side > 0 ? s.hi - s.c - 9 : s.lo + s.c + 9, 12, 6.5, (L * 0.05) * 0.82); }
  }

  // ---- wings / sponsons amidships, with a port and a starboard light ----
  const tw = fromEng(0.5), sw = at(tw), wy = (sw.top + sw.bot) / 2;
  const span = [40, 18, 34][V], chord = [80, 60, 50][V];
  for (const side of [-1, 1]) {
    const xe = x0 + (side > 0 ? sw.hi : sw.lo);
    hull.box(xe + side * span / 2, wy, sw.z, span, 4.5, chord);
    hull.box(xe + side * (span - 3), wy, sw.z, 6, 14, chord * 0.7);
    (side > 0 ? green : red).box(xe + side * (span + 0.4), wy, sw.z, 0.8, 2.6, chord * 0.5);
  }

  // ---- engines: nacelles flanking the mouth at one end, bells lit, plumes trailing ----
  const se = S[eng ? N : 0], ze = se.z, wm = (eng ? hu.w1 : hu.w0);
  const R = [11, 13, 8.5][V], count = V === 2 ? 4 : 2;
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1, row = i >> 1;
    const ex = x0 + side * (wm + 8 + R + 6 + (V === 0 ? 16 : 0)), ey = yF + H / 2 + (count === 4 ? (row ? 19 : -9) : 3);
    const zb = ze + zDir * 9, zf = ze - zDir * 52;                // bell end, far end
    hull.tube(ex, ey, Math.min(zb, zf), Math.max(zb, zf), eng ? R * 0.82 : R, eng ? R : R * 0.82);
    hull.disc(ex, ey, zf, R * 0.82, -zDir);
    dark.tube(ex, ey, Math.min(zb, zb + zDir * 5), Math.max(zb, zb + zDir * 5), eng ? R : R * 1.12, eng ? R * 1.12 : R);
    // the bell: dark inside, a ring of light at its lip, a dim core. (A whole lit disc this size whites the view out.)
    dark.disc(ex, ey, zb + zDir * 1.0, R * 0.9, zDir);
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * 6.2832, a1 = ((i + 1) / 16) * 6.2832, zz = zb + zDir * 1.3;
      const pt = (a, rr) => [ex + Math.cos(a) * rr, ey + Math.sin(a) * rr, zz];
      if (zDir > 0) bell.quad(pt(a0, R * 0.74), pt(a1, R * 0.74), pt(a1, R * 0.86), pt(a0, R * 0.86)); else bell.quad(pt(a0, R * 0.74), pt(a0, R * 0.86), pt(a1, R * 0.86), pt(a1, R * 0.74));
    }
    core.disc(ex, ey, zb + zDir * 1.2, R * 0.5, zDir);
    const pz0 = zb + zDir * 1.4, pz1 = zb + zDir * 26;
    plume.tube(ex, ey, Math.min(pz0, pz1), Math.max(pz0, pz1), eng ? R * 0.8 : 0.6, eng ? 0.6 : R * 0.8, 12);
    // the pylon that carries it
    hull.box(x0 + side * (wm + 8 + 3 + (V === 0 ? 8 : 0)), ey, ze - zDir * 24, 14 + (V === 0 ? 16 : 0), 5, 30);
  }

  // ---- prow: two prongs reaching out either side of the other mouth ----
  const sp = S[eng ? 0 : N], zp = sp.z, wp = (eng ? hu.w0 : hu.w1);
  for (const side of [-1, 1]) {
    const px = x0 + side * (wp + 13.5), len = [22, 16, 26][V];
    hull.box(px, yF + H * 0.5, zp - zDir * (len / 2), 6.5, 8, len);
    hull.box(px, yF + H * 0.5 + 0.2, zp - zDir * (len + 5), 4, 4.6, 10);
    (side > 0 ? n1 : n2).box(px - side * 3.3, yF + H * 0.5, zp - zDir * (len / 2 + 2), 0.14, 0.7, len);
    glow.box(px, yF + H * 0.5 + 0.2, zp - zDir * (len + 10.2), 1.2, 1.2, 0.5);
  }

  // ---- the name down both flanks ----
  const group = new THREE.Group();
  const nameMat = new THREE.MeshBasicMaterial({ map: stationNameTexture(sec.name, pal[0]), transparent: true, depthWrite: false, color: new THREE.Color(1.9, 1.9, 1.9), fog: false });
  nameMat.userData.owned = true;
  const name = new Tris(nameMat);
  const tn = fromEng(0.66), sn = at(tn), nl = Math.min(120, L * 0.24), nh = nl / 4, ny = (sn.top + sn.bot) / 2;
  for (const side of [-1, 1]) {
    const x = x0 + (side > 0 ? sn.hi : sn.lo) + side * 0.25;
    const zl = sn.z + side * nl / 2, zr = sn.z - side * nl / 2;      // text runs left to right for whoever is looking at that flank
    name.quad([x, ny - nh / 2, zl], [x, ny - nh / 2, zr], [x, ny + nh / 2, zr], [x, ny + nh / 2, zl], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }

  for (const b of [hull, dark, n1, n2, glow, bell, core, red, green, plume, name]) { const k = b.mesh(); if (k) group.add(k); }
  group.userData.sec = sec.id;
  return group;
}

export function disposeShipHull(group) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    if (o.material.userData.owned) { o.material.map?.dispose(); o.material.dispose(); }
  });
}

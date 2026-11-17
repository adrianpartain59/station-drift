import { TRACK, PALETTES, STATION_NAMES } from '../core/Constants.js';

// Seeded RNG so a seed always gives the same run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WIN_L = 1;
export const WIN_R = 2;
export const SKY = 4;

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The procedural track: the map. A centreline sampled every metre, cut into sections (stations and
 * the open space between them) and pieces (corners, chicanes, halls, straights). Nothing that the
 * ship can hit or collect lives here: gameplay/Course.js lays that out over the pieces.
 * Local frame at arc length s: tangent T = (sin h, 0, cos h), right R = (-cos h, 0, sin h), up = +Y.
 * Positive curvature k turns left (h grows).
 */
export class Track {
  constructor(seed) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.X = []; this.Z = []; this.H = []; this.K = []; this.W = [];
    this.ZONE = []; this.FLAG = []; this.SEC = [];
    this.sections = [];
    this.pieces = [];
    this.gx = 0; this.gz = 0; this.gh = 0;
    this.w = TRACK.SPACE_W;
    this.paletteIdx = Math.floor(this.rng() * PALETTES.length);
    this.nameIdx = Math.floor(this.rng() * STATION_NAMES.length);
    this.nextStationW = lerp(TRACK.STATION_W[0], TRACK.STATION_W[1], this.rng());
    this.buildOpening();
  }

  get len() { return this.X.length; }
  r(a = 0, b = 1) { return a + (b - a) * this.rng(); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  difficulty(s) { return Math.min(1, s / 7500); }

  ensure(s) { while (this.len < s + 40) this.nextSection(); }

  // ---------- sampling ----------
  sample(s, out) {
    const n = this.len;
    let i = Math.floor(s);
    if (i < 0) i = 0;
    if (i > n - 2) i = n - 2;
    const f = Math.min(1, Math.max(0, s - i));
    out.x = lerp(this.X[i], this.X[i + 1], f);
    out.z = lerp(this.Z[i], this.Z[i + 1], f);
    out.h = lerp(this.H[i], this.H[i + 1], f);
    out.k = this.K[i];
    out.w = lerp(this.W[i], this.W[i + 1], f);
    out.zone = this.ZONE[i];
    out.flag = this.FLAG[i];
    out.sec = this.SEC[i];
    return out;
  }

  sectionAt(s) {
    const i = Math.max(0, Math.min(this.len - 1, Math.floor(s)));
    return this.sections[this.SEC[i]];
  }

  // ---------- centreline emission ----------
  emit(n, k, wTarget, flag = 0) {
    const sec = this.sections.length - 1;
    const zone = this.sections[sec].type === 'station' ? 0 : 1;
    for (let j = 0; j < n; j++) {
      const dw = Math.max(-TRACK.W_RATE, Math.min(TRACK.W_RATE, wTarget - this.w));
      this.w += dw;
      this.X.push(this.gx); this.Z.push(this.gz); this.H.push(this.gh); this.K.push(k);
      this.W.push(this.w); this.ZONE.push(zone); this.FLAG.push(flag); this.SEC.push(sec);
      const hm = this.gh + k * 0.5;
      this.gx += Math.sin(hm); this.gz += Math.cos(hm);
      this.gh += k;
    }
  }

  straight(len, w, flag = 0) {
    const s0 = this.len;
    this.emit(Math.round(len), 0, w, flag);
    return { s0, s1: this.len, k: 0 };
  }

  // Turn by up to `angle` radians at `radius`, choosing a side that keeps heading within limits.
  arc(angle, radius, w, flag = 0, forceDir = 0) {
    const max = TRACK.MAX_HEADING;
    const roomL = max - this.gh;
    const roomR = this.gh + max;
    let dir = forceDir;
    if (!dir) {
      const pl = roomL / (roomL + roomR);
      dir = this.rng() < pl ? 1 : -1;
    }
    let room = dir > 0 ? roomL : roomR;
    if (room < 0.3) { dir = -dir; room = dir > 0 ? roomL : roomR; }
    const a = Math.max(0.2, Math.min(angle, room));
    const len = Math.max(8, Math.round(a * radius));
    const k = (dir * a) / len;
    const s0 = this.len;
    this.emit(len, k, w, flag);
    return { s0, s1: this.len, k, dir };
  }

  setFlags(s0, s1, bits) {
    for (let i = Math.max(0, s0); i < Math.min(this.len, s1); i++) this.FLAG[i] |= bits;
  }

  // ---------- sections ----------
  beginSection(type) {
    const sec = { id: this.sections.length, type, s0: this.len, s1: this.len };
    if (type === 'station') {
      sec.palette = PALETTES[this.paletteIdx % PALETTES.length];
      sec.name = STATION_NAMES[this.nameIdx % STATION_NAMES.length];
      this.paletteIdx += 1 + Math.floor(this.rng() * 2);
      this.nameIdx += 1 + Math.floor(this.rng() * 3);
    }
    this.sections.push(sec);
    return sec;
  }

  // Record a piece of map for the course layout to dress. `turn` is +1 for a right-hander.
  piece(type, s0, extra = {}) {
    const p = { type, sec: this.sections.length - 1, s0, s1: this.len, d: this.difficulty(s0), ...extra };
    this.pieces.push(p);
    return p;
  }

  buildOpening() {
    const sec = this.beginSection('space');
    sec.opening = true;
    this.w = this.nextStationW + 4;
    const p = this.straight(TRACK.START_SPACE, this.nextStationW);
    this.piece('opening', p.s0);
    sec.s1 = this.len;
  }

  nextSection() {
    const last = this.sections[this.sections.length - 1];
    if (last.type === 'space') this.buildStation(); else this.buildSpace();
  }

  buildStation() {
    const sec = this.beginSection('station');
    const d = this.difficulty(this.len);
    let w = this.nextStationW;
    const total = 950 + d * 550 + this.r(0, 350);
    const entry = this.straight(70, w);
    this.piece('entry', entry.s0, { w });

    let sinceRun = 0;
    while (this.len - sec.s0 < total) {
      const roll = this.rng();
      if (roll < 0.42 || sinceRun > 1) {
        this.cornerPiece(w, d);
        sinceRun = 0;
      } else if (roll < 0.56) {
        this.chicanePiece(w, d);
      } else if (roll < 0.7) {
        this.hallPiece(d);
        sinceRun++;
      } else {
        w = lerp(TRACK.STATION_W[0], TRACK.STATION_W[1], this.rng());
        this.runPiece(w, d);
        sinceRun++;
      }
      if (this.rng() < 0.4) { const p = this.straight(this.r(10, 24), w); this.piece('link', p.s0, { w }); }
    }
    const out = this.straight(60, w);
    this.piece('exit', out.s0, { w });
    sec.s1 = this.len;
    this.nextStationW = lerp(TRACK.STATION_W[0], TRACK.STATION_W[1], this.rng());
  }

  buildSpace() {
    const sec = this.beginSection('space');
    const total = 360 + this.r(0, 260);
    const W = TRACK.SPACE_W;
    const lead = this.straight(50, W);
    this.piece('space-lead', lead.s0, { w: W });
    while (this.len - sec.s0 < total) {
      if (this.rng() < 0.5) {
        const p = this.arc(this.r(0.25, 0.6), this.r(120, 240), W);
        this.piece('space-arc', p.s0, { w: W, k: p.k, turn: -p.dir });
      } else {
        const p = this.straight(this.r(70, 130), W);
        this.piece('space-straight', p.s0, { w: W });
      }
    }
    // Funnel down to the next station's corridor width before its doors.
    const ap = this.straight(120, this.nextStationW);
    this.piece('funnel', ap.s0, { w: this.nextStationW });
    sec.s1 = this.len;
  }

  // ---------- pieces ----------
  cornerPiece(w, d) {
    const radius = lerp(this.r(48, 72), this.r(30, 46), d);
    const angle = this.r(0.65, 1.55);
    const lead = this.straight(this.r(14, 26), w);
    const p = this.arc(angle, radius, w);
    const out = this.straight(this.r(20, 34), w);
    // Windows on the outside of the bend: you see the planet while you slide.
    const outer = p.dir > 0 ? WIN_R : WIN_L;
    if (this.rng() < 0.75) this.setFlags(lead.s0, out.s1, outer | (this.rng() < 0.3 ? (WIN_L | WIN_R) : 0));
    this.piece('corner', lead.s0, { w, arcs: [{ s0: p.s0, s1: p.s1, k: p.k, turn: -p.dir }] });
  }

  chicanePiece(w, d) {
    const radius = lerp(this.r(55, 75), this.r(38, 52), d);
    const a = this.straight(14, w);
    const p1 = this.arc(this.r(0.45, 0.75), radius, w);
    this.straight(this.r(6, 14), w);
    const p2 = this.arc(this.r(0.45, 0.8), radius, w, 0, -p1.dir);
    this.straight(16, w);
    if (this.rng() < 0.6) this.setFlags(a.s0, this.len, this.rng() < 0.5 ? WIN_L : WIN_R);
    this.piece('chicane', a.s0, { w, arcs: [{ s0: p1.s0, s1: p1.s1, k: p1.k, turn: -p1.dir }, { s0: p2.s0, s1: p2.s1, k: p2.k, turn: -p2.dir }] });
  }

  hallPiece() {
    const W = TRACK.HALL_W;
    const p = this.straight(this.r(110, 160), W);
    const inner0 = p.s0 + 40, inner1 = p.s1 - 30;
    this.setFlags(inner0 - 20, inner1 + 10, SKY | (this.rng() < 0.5 ? WIN_L | WIN_R : 0));
    this.piece('hall', p.s0, { w: W, inner0, inner1 });
  }

  runPiece(w) {
    const p = this.straight(this.r(90, 170), w);
    if (this.rng() < 0.65) this.setFlags(p.s0, p.s1, this.rng() < 0.5 ? WIN_L : this.rng() < 0.5 ? WIN_R : WIN_L | WIN_R);
    this.piece('run', p.s0, { w });
  }
}

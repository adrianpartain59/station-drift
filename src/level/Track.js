import { TRACK, PALETTES, STATION_NAMES } from '../core/Constants.js';

export const CRATE_LOW = 3.0, CRATE_TALL = 5.6;
export const OVERHEAD_Y = [3.35, 4.35];

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
export const PAD_FLOOR = 8;

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The procedural track: a centreline sampled every metre, plus everything placed on it.
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
    this.obstacles = [];
    this.coins = [];
    this.pads = [];
    this.repairs = [];
    this.gx = 0; this.gz = 0; this.gh = 0;
    this.w = TRACK.SPACE_W;
    this.paletteIdx = Math.floor(this.rng() * PALETTES.length);
    this.nameIdx = Math.floor(this.rng() * STATION_NAMES.length);
    this.nextStationW = lerp(TRACK.STATION_W[0], TRACK.STATION_W[1], this.rng());
    this.obstacleId = 0;
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

  buildOpening() {
    const sec = this.beginSection('space');
    sec.opening = true;
    this.w = this.nextStationW + 4;
    this.straight(TRACK.START_SPACE, this.nextStationW);
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
    this.coinLine(entry.s0 + 22, entry.s1 - 4, 0, 0);

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
        this.obstacleRun(w, d);
        sinceRun++;
      }
      if (this.rng() < 0.4) this.straight(this.r(10, 24), w);
    }
    this.straight(60, w);
    sec.s1 = this.len;
    this.nextStationW = lerp(TRACK.STATION_W[0], TRACK.STATION_W[1], this.rng());
  }

  buildSpace() {
    const sec = this.beginSection('space');
    const d = this.difficulty(this.len);
    const total = 360 + this.r(0, 260);
    const W = TRACK.SPACE_W;
    this.straight(50, W);
    while (this.len - sec.s0 < total) {
      if (this.rng() < 0.5) {
        const p = this.arc(this.r(0.25, 0.6), this.r(120, 240), W);
        this.coinWave(p.s0 + 6, p.s1 - 6, W * 0.55, this.r(60, 110));
      } else {
        const p = this.straight(this.r(70, 130), W);
        this.spaceHazards(p.s0 + 12, p.s1 - 8, W, d);
      }
    }
    if (this.rng() < 0.7) this.repairs.push({ s: this.len - 80, x: this.r(-6, 6), taken: false });
    // Funnel down to the next station's corridor width before its doors.
    const ap = this.straight(120, this.nextStationW);
    this.coinLine(ap.s0 + 50, ap.s1 - 8, 0, 0);
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
    // Apex coins on the inside line reward a committed drift.
    const inner = p.dir > 0 ? -1 : 1;
    for (let s = p.s0 + 4; s < p.s1 - 3; s += 4.5) {
      const t = (s - p.s0) / (p.s1 - p.s0);
      this.coins.push({ s, x: inner * (w - 2.6) * Math.sin(Math.PI * t), taken: false });
    }
    if (d > 0.35 && this.rng() < d * 0.6) {
      const sm = (p.s0 + p.s1) / 2;
      this.addObstacle({ type: 'pillar', s: sm, x: -inner * (w - 1.6), r: 1.1, w });
    }
    if (this.rng() < 0.45) this.pads.push({ s: out.s0 + 6, x: inner * (w * 0.35), half: 2.2, len: 6, used: false });
  }

  chicanePiece(w, d) {
    const radius = lerp(this.r(55, 75), this.r(38, 52), d);
    const a = this.straight(14, w);
    const p1 = this.arc(this.r(0.45, 0.75), radius, w);
    const mid = this.straight(this.r(6, 14), w);
    const p2 = this.arc(this.r(0.45, 0.8), radius, w, 0, -p1.dir);
    this.straight(16, w);
    if (this.rng() < 0.6) this.setFlags(a.s0, this.len, this.rng() < 0.5 ? WIN_L : WIN_R);
    this.coinLine(p1.s0 + 3, mid.s1, p1.dir > 0 ? -(w - 3) : (w - 3), 0);
    this.coinLine(mid.s1, p2.s1 - 3, 0, p2.dir > 0 ? -(w - 3) : (w - 3));
  }

  hallPiece(d) {
    const W = TRACK.HALL_W;
    const p = this.straight(this.r(110, 160), W);
    const inner0 = p.s0 + 40, inner1 = p.s1 - 30;
    this.setFlags(inner0 - 20, inner1 + 10, SKY | (this.rng() < 0.5 ? WIN_L | WIN_R : 0));
    // Rows of structural columns with offset gaps.
    const gap = lerp(46, 30, d);
    let row = 0;
    for (let s = inner0; s < inner1; s += gap + this.r(0, 8)) {
      const off = row++ % 2 === 0 ? -1 : 1;
      const cols = d > 0.5 ? 3 : 2;
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * (W * 0.9 / cols) * 1.6 + off * 2.2;
        if (Math.abs(x) < W - 2) this.addObstacle({ type: 'pillar', s, x, r: 1.3, w: W, big: true });
      }
      if (this.rng() < 0.5) this.coins.push({ s: s + gap / 2, x: -off * 4, taken: false });
    }
  }

  obstacleRun(w, d) {
    const len = this.r(90, 170);
    const p = this.straight(len, w);
    if (this.rng() < 0.65) this.setFlags(p.s0, p.s1, this.rng() < 0.5 ? WIN_L : this.rng() < 0.5 ? WIN_R : WIN_L | WIN_R);
    if (this.rng() < 0.35) this.pads.push({ s: p.s0 + 8, x: this.r(-w * 0.5, w * 0.5), half: 2.2, len: 6, used: false });
    const spacing = lerp(58, 36, d);
    let s = p.s0 + 26;
    let prevGap = 0;
    while (s < p.s1 - 16) {
      const gapX = this.placeRow(s, w, d);
      this.coinLine(s - spacing + 10, s - 6, prevGap, gapX);
      prevGap = gapX;
      s += spacing + this.r(0, 14);
    }
  }

  // One obstacle row. Returns the x of the safest lane through it (for the coin trail).
  placeRow(s, w, d) {
    const types = ['pillars', 'gate', 'laser', 'doors', 'spinner', 'crates', 'tripwire', 'overhead'];
    const early = s < 380; // the first stretch teaches drifting before it asks for hops
    const weights = [3, 2.2, 1.6 + d, 1.2 + d, 0.8 + d * 1.4, 2, early ? 0 : 1.4 + d, early ? 0 : 0.5 + d];
    let tot = weights.reduce((a, b) => a + b, 0), roll = this.rng() * tot, type = types[0];
    for (let i = 0; i < types.length; i++) { roll -= weights[i]; if (roll <= 0) { type = types[i]; break; } }
    const gapX = this.r(-(w - 3.2), w - 3.2);
    switch (type) {
      case 'pillars': {
        const n = 2 + Math.floor(this.rng() * (2 + d * 2));
        for (let i = 0; i < n; i++) {
          let x = this.r(-(w - 1.5), w - 1.5);
          if (Math.abs(x - gapX) < 3.6) x = gapX + Math.sign(x - gapX || 1) * 3.8;
          if (Math.abs(x) < w - 0.8) this.addObstacle({ type: 'pillar', s: s + this.r(-3, 3), x, r: this.r(0.8, 1.25), w });
        }
        break;
      }
      case 'gate':
        this.addObstacle({ type: 'gate', s, gx: gapX, gh: lerp(3.6, 2.5, d), w });
        break;
      case 'laser': {
        const n = d > 0.45 && this.rng() < 0.5 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          this.addObstacle({ type: 'laser', s: s + i * 9, amp: w - 1.2, om: lerp(1.1, 2.1, d) * (this.rng() < 0.5 ? 1 : -1), ph: this.r(0, 6.28), w });
        }
        return 0;
      }
      case 'doors':
        this.addObstacle({ type: 'doors', s, gx: this.r(-(w - 4), w - 4), om: lerp(1.0, 1.7, d), ph: this.r(0, 6.28), w });
        break;
      case 'spinner':
        // Arm stops 3.6 m short of each wall: hug a wall, or hop the bar.
        this.addObstacle({ type: 'spinner', s, L: w - 3.6, om: lerp(1.0, 1.7, d) * (this.rng() < 0.5 ? 1 : -1), ph: this.r(0, 6.28), w });
        return (this.rng() < 0.5 ? -1 : 1) * (w - 1.8);
      case 'crates': {
        const n = 2 + Math.floor(this.rng() * 3);
        for (let i = 0; i < n; i++) {
          let x = this.r(-(w - 1.8), w - 1.8);
          if (Math.abs(x - gapX) < 3.8) x = gapX + Math.sign(x - gapX || 1) * 4.2;
          // single crates can be hopped; stacked ones can't
          if (Math.abs(x) < w - 1) this.addObstacle({ type: 'crate', s: s + this.r(-5, 5), x, size: this.r(1.6, 2.6), stack: this.rng() < 0.35 + d * 0.3, rot: this.r(-0.5, 0.5), w });
        }
        break;
      }
      case 'tripwire': {
        // A low beam across the corridor at ship height: hop it, or take the narrow gap at one wall.
        const side = this.rng() < 0.5 ? -1 : 1;
        this.addObstacle({ type: 'tripwire', s, side, gap: lerp(3.6, 2.8, d), w });
        return side * (w - 1.6);
      }
      case 'overhead':
        // A girder just above the ship: fly under it. Hopping into it is a crash.
        this.addObstacle({ type: 'overhead', s, w });
        return gapX;
    }
    return gapX;
  }

  spaceHazards(s0, s1, w, d) {
    for (let s = s0; s < s1; s += lerp(34, 20, d) + this.r(0, 10)) {
      if (this.rng() < 0.55) {
        this.addObstacle({ type: 'rock', s, amp: this.r(4, w - 2), om: this.r(0.35, 0.8) * (this.rng() < 0.5 ? 1 : -1), ph: this.r(0, 6.28), r: this.r(1.6, 3.2), w });
      } else {
        const n = 2 + Math.floor(this.rng() * 3);
        const gapX = this.r(-(w - 4), w - 4);
        for (let i = 0; i < n; i++) {
          let x = this.r(-(w - 2), w - 2);
          if (Math.abs(x - gapX) < 4.5) x = gapX + Math.sign(x - gapX || 1) * 5;
          this.addObstacle({ type: 'debris', s: s + this.r(-4, 4), x, r: this.r(1.0, 2.2), w });
        }
        this.coins.push({ s, x: gapX, taken: false });
      }
    }
  }

  coinLine(s0, s1, x0, x1) {
    if (s1 - s0 < 6) return;
    for (let s = s0; s <= s1; s += 5) {
      const t = (s - s0) / Math.max(1, s1 - s0);
      const e = t * t * (3 - 2 * t);
      this.coins.push({ s, x: lerp(x0, x1, e), taken: false });
    }
  }

  coinWave(s0, s1, amp, period) {
    const ph = this.r(0, 6.28);
    for (let s = s0; s < s1; s += 5) this.coins.push({ s, x: amp * Math.sin(ph + (s * 6.283) / period), taken: false });
  }

  addObstacle(o) {
    o.id = this.obstacleId++;
    o.hit = false; o.near = 99; o.passed = false;
    this.obstacles.push(o);
  }

  // ---------- collision shapes in local (u = ship.s - o.s, x) ----------
  // Returns the clearance from point (u, x) to the obstacle surface (negative = inside).
  static clearance(o, u, x, t) {
    switch (o.type) {
      case 'pillar':
      case 'debris':
        return Math.hypot(u, x - o.x) - o.r;
      case 'rock':
        return Math.hypot(u, x - o.amp * Math.sin(o.om * t + o.ph)) - o.r;
      case 'crate': {
        const h = o.size / 2;
        return sdBox(u, x - o.x, h, h);
      }
      case 'laser':
        return Math.hypot(u, x - o.amp * Math.sin(o.om * t + o.ph)) - 0.35;
      case 'gate': {
        const left = sdBox(u, x - (-o.w - 2 + (o.gx - o.gh)) / 2, 0.5, (o.gx - o.gh + o.w + 2) / 2);
        const right = sdBox(u, x - (o.gx + o.gh + o.w + 2) / 2, 0.5, (o.w + 2 - o.gx - o.gh) / 2);
        return Math.min(left, right);
      }
      case 'doors': {
        const g = doorGap(o, t);
        const a = -o.w - 1, b = o.gx - g, c = o.gx + g, e = o.w + 1;
        return Math.min(sdBox(u, x - (a + b) / 2, 0.7, (b - a) / 2), sdBox(u, x - (c + e) / 2, 0.7, (e - c) / 2));
      }
      case 'tripwire': {
        const x0 = o.side > 0 ? -o.w - 1 : -o.w + o.gap, x1 = o.side > 0 ? o.w - o.gap : o.w + 1;
        return sdBox(u, x - (x0 + x1) / 2, 0.25, (x1 - x0) / 2);
      }
      case 'overhead':
        return sdBox(u, x, 0.6, o.w + 1);
      case 'spinner': {
        const th = o.om * t + o.ph;
        const du = Math.sin(th) * o.L, dx = Math.cos(th) * o.L;
        return sdSegment(u, x, -du, -dx, du, dx) - 0.5;
      }
    }
    return 99;
  }
}

// Vertical extent [bottom, top] of an obstacle. The ship collides only where both its footprint
// and its height overlap, which is what makes the hop work.
export function vspan(o) {
  const hv = TRACK.HOVER;
  switch (o.type) {
    case 'crate': return [0, o.stack ? CRATE_TALL : CRATE_LOW];
    case 'spinner': return [hv - 0.45, hv + 0.45];
    case 'tripwire': return [hv - 0.3, hv + 0.3];
    case 'overhead': return OVERHEAD_Y;
    case 'rock': return [hv - o.r, hv + o.r];
    case 'debris': return [hv - 0.9, hv + 0.9];
    default: return [0, TRACK.HEIGHT];
  }
}

export function doorGap(o, t) {
  return 2.15 + (o.w - 2.15) * (0.5 + 0.5 * Math.sin(o.om * t + o.ph));
}

function sdBox(px, py, hx, hy) {
  const dx = Math.abs(px) - hx, dy = Math.abs(py) - hy;
  const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0);
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

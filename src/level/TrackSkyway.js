import { TRACK } from '../core/Constants.js';
import { Track, WIN_L, WIN_R } from './Track.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Every number that shapes the SKYWAY map.
export const SKYWAY = {
  OPEN_W: 32,              // open-air half-width: 64 m between the soft rails (classic: 30 m)
  HEADING: 1.48,           // rad: the path never turns further than this (85 degrees) from world forward,
                           //      so it never travels backward and cannot cross itself
  AIR_LEN: [1250, 1900],   // metres of open air between two stations
  FIRST_AIR: [760, 940],   // ...and before the first one
  STATION_LEN: [400, 500], // metres of station at the start of a run (+ up to 120 with distance)

  // open-air bends. Every one is at least as tight as DRIFT.ARM_K (1/125), so every one arms a held
  // drift, flips a slide in an S and pays charge in hard.
  SWEEP_R: [90, 120], SWEEP_A: [1.2, 2.3],
  HAIRPIN_R: [70, 90], HAIRPIN_A: [2.44, 2.96],
  ESS_R: [78, 116], ESS_A: [0.95, 1.7], ESS_GAP: [8, 14],
  // calm sweepers: the only place something can stand in open air (gameplay/Course.js)
  CALM_R: [420, 640], CALM_LEN: [200, 270], CALM_EVERY: [400, 760],
  CALM_K: 1 / 400,         // what counts as calm: the proof gives away the turning a sweeper this gentle needs
  LEAD: 40,                // straight out of a station's exit (the road widens on through the first bend)
  FUNNEL: [8, 150],        // straight in to a station's mouth: full width, then narrowing

  // height. Slope and vertical curvature are both continuous (grade is a cosine blend between knots).
  GRADE: 0.13,             // steepest slope, metres per metre
  GRADE_MIN: 0.05,         // a knot's slope is at least this: bends are climbed or descended, not flat
  CREST_R: 700,            // tightest vertical radius over a crest...
  SAG_R: 420,              // ...and through a dip
  KNOT_MIN: 60,            // m: slope knots are never closer than this, so a ramp eases in over at least 30 m
  HEIGHT_PULL: 80,         // m: how hard the profile is steered back toward the height it started at
  LEVEL: 80,               // m of level road before a station's mouth

  // stations: ships lying along world forward. The path inside swings left and right in pairs.
  SHIP_U: 70,              // m: furthest the corridor's centre strays from the ship's axis
  SHIP_R: [[42, 56], [30, 40]],   // corner radius at difficulty 0 .. 1
  SHIP_A: [0.75, 1.3],     // corner angle: tight enough that plain steering will not always do
};
const S = SKYWAY;

/**
 * The SKYWAY map: open air is the main event. A wide deck that is nearly always bending (sweepers,
 * hairpins, linked esses), rising and falling as it goes, with short stations (ships you fly
 * through) between the stretches. Same arrays and the same `pieces` contract as the classic Track,
 * plus real heights in Y / G. A pure function of the seed.
 */
export class SkywayTrack extends Track {
  init() {
    this.map = 'skyway';
    this.calmK = S.CALM_K;
  }

  room(dir) { return dir > 0 ? S.HEADING - this.gh : this.gh + S.HEADING; }

  /** An arc of exactly `angle` radians. dir +1 turns left (heading grows), -1 right. */
  bend(angle, radius, w, dir, flag = 0) {
    const len = Math.max(8, Math.round(angle * radius));
    const k = (dir * angle) / len;
    const s0 = this.len;
    this.emit(len, k, w, flag);
    return { s0, s1: this.len, k, dir, turn: -dir };
  }

  buildOpening() { this.buildAir(true); }

  nextSection() {
    const last = this.sections[this.sections.length - 1];
    if (last.type === 'space') this.buildShip(); else this.buildAir(false);
  }

  // ---------- open air ----------
  buildAir(first) {
    const sec = this.beginSection('space');
    sec.air = true;
    const W = S.OPEN_W;
    const p0 = this.len;
    if (first) {
      sec.opening = true;
      this.w = W;
      const p = this.straight(120, W);
      this.piece('opening', p.s0, { w: W });
    } else {
      const p = this.straight(S.LEAD, W);
      this.piece('space-lead', p.s0, { w: W });
    }
    const total = first ? this.r(S.FIRST_AIR[0], S.FIRST_AIR[1]) : this.r(S.AIR_LEN[0], S.AIR_LEN[1]);
    const endAt = sec.s0 + total - (S.FUNNEL[0] + S.FUNNEL[1]) - 260;   // room kept for the last bends and the funnel
    let sinceCalm = first ? 260 : 120, lastDir = 0;
    const arcOf = (b) => ({ s0: b.s0, s1: b.s1, k: b.k, turn: b.turn });

    while (this.len < endAt) {
      if (sinceCalm > S.CALM_EVERY[0] && (sinceCalm > S.CALM_EVERY[1] || this.rng() < 0.4)) {
        this.calm(W);
        sinceCalm = 0;
        continue;
      }
      const s0 = this.len;
      const roll = this.rng();
      const big = this.room(1) > this.room(-1) ? 1 : -1;      // the side with more heading left
      if (roll < 0.26 && this.room(big) > S.HAIRPIN_A[0] + 0.02) {
        // a wide hairpin: right round from one side to the other
        const a = this.r(S.HAIRPIN_A[0], Math.min(this.room(big), S.HAIRPIN_A[1]));
        const b = this.bend(a, this.r(S.HAIRPIN_R[0], S.HAIRPIN_R[1]), W, big);
        this.piece('air-bend', b.s0, { w: W, arcs: [arcOf(b)], hairpin: true });
        lastDir = big;
      } else if (roll < 0.62) {
        // linked esses: two to four arcs, alternating, a breath of neutral road between
        const n = 2 + Math.floor(this.rng() * 3);
        let dir = big;
        const arcs = [];
        for (let i = 0; i < n; i++) {
          if (this.room(dir) < 0.55) break;
          const a = Math.min(this.r(S.ESS_A[0], S.ESS_A[1]), this.room(dir));
          if (arcs.length) this.emit(Math.round(this.r(S.ESS_GAP[0], S.ESS_GAP[1])), 0, W);
          arcs.push(arcOf(this.bend(a, this.r(S.ESS_R[0], S.ESS_R[1]), W, dir)));
          lastDir = dir; dir = -dir;
        }
        if (arcs.length) this.piece(arcs.length > 1 ? 'air-ess' : 'air-bend', s0, { w: W, arcs });
      } else {
        // a long sweeper, more often than not the other way from the last bend
        let dir = lastDir && this.rng() < 0.62 ? -lastDir : this.rng() < this.room(1) / (2 * S.HEADING) ? 1 : -1;
        if (this.room(dir) < 0.8) dir = -dir;
        const a = Math.min(this.r(S.SWEEP_A[0], S.SWEEP_A[1]), this.room(dir));
        const b = this.bend(a, this.r(S.SWEEP_R[0], S.SWEEP_R[1]), W, dir);
        this.piece('air-bend', b.s0, { w: W, arcs: [arcOf(b)] });
        lastDir = dir;
      }
      sinceCalm += this.len - s0;
      if (this.rng() < 0.14) {
        const p = this.straight(this.r(28, 50), W);
        this.piece('air-straight', p.s0, { w: W });
      }
    }

    // line up with the next ship's axis (world forward) on a real bend, never a twitch
    if (Math.abs(this.gh) < 0.6) {
      const dir = this.gh === 0 ? (this.rng() < 0.5 ? 1 : -1) : Math.sign(this.gh);
      const b = this.bend(this.r(0.95, 1.3) - Math.abs(this.gh), this.r(S.SWEEP_R[0], S.SWEEP_R[1]), W, dir);
      this.piece('air-bend', b.s0, { w: W, arcs: [arcOf(b)] });
      const g = this.straight(this.r(10, 18), W);
      this.piece('air-straight', g.s0, { w: W });
    }
    const back = this.bend(Math.abs(this.gh), this.r(S.SWEEP_R[0], S.SWEEP_R[1]), W, -Math.sign(this.gh));
    this.piece('air-bend', back.s0, { w: W, arcs: [arcOf(back)], align: true });
    this.gh = 0;

    // the funnel: full width for a moment, then down to the ship's corridor before its mouth
    const f0 = this.len;
    this.straight(S.FUNNEL[0], W);
    this.straight(S.FUNNEL[1], this.nextStationW);
    this.piece('funnel', f0, { w: this.nextStationW });
    sec.s1 = this.len;
    this.layHeights(sec, p0);
  }

  /** A calm sweeper: gentle enough for something to stand on it fairly. Straight if the heading has no room. */
  calm(W) {
    const len = this.r(S.CALM_LEN[0], S.CALM_LEN[1]), R = this.r(S.CALM_R[0], S.CALM_R[1]);
    const big = this.room(1) > this.room(-1) ? 1 : -1;
    let dir = this.rng() < 0.7 ? big : -big;
    const a = len / R;
    if (this.room(dir) < a + 0.02) dir = -dir;
    if (this.room(dir) < a + 0.02) {
      const p = this.straight(len, W);
      this.piece('air-calm', p.s0, { w: W, k: 0 });
      return;
    }
    const b = this.bend(a, R, W, dir);
    this.piece('air-calm', b.s0, { w: W, k: b.k, turn: b.turn });
  }

  /**
   * Heights for one open-air section. A knot at every piece boundary carries a slope; between two
   * knots the slope is a cosine blend, so the slope is continuous and so is its rate of change
   * (zero at each knot). How far a slope may move between two knots is set by the crest and sag
   * radii. Level at both ends: stations sit flat.
   */
  layHeights(sec) {
    const P = this.pieces.filter((p) => p.sec === sec.id);
    const first = P[0], last = P[P.length - 1];
    // knots: [s, slope, fixed, calm (no crest over the stretch that ends here)]
    const knots = [[sec.s0, 0, true, false], [first.s0 + Math.min(30, (first.s1 - first.s0) * 0.5), 0, true, false]];
    for (const p of P.slice(1, -1)) {
      const len = p.s1 - p.s0, calm = p.type === 'air-calm';
      // long bends get a knot in the middle too, so a hairpin can climb in and drop out (or the reverse)
      if (!calm && len > 190 && this.rng() < 0.75) knots.push([Math.round(p.s0 + len * this.r(0.4, 0.6)), null, false, false]);
      knots.push([p.s1, null, false, calm]);
    }
    const level = Math.max(last.s0 + 24, sec.s1 - S.LEVEL);
    knots.push([level, 0, true, false], [sec.s1, 0, true, false]);
    // too close to the knot before it: drop the free one of the pair (a stretch that is calm keeps saying so)
    for (let i = 2; i < knots.length - 1; i++) {
      if (knots[i][0] - knots[i - 1][0] >= S.KNOT_MIN) continue;
      if (!knots[i][2]) { if (knots[i][3] && knots[i + 1]) knots[i + 1][3] = true; knots.splice(i, 1); i--; }
      else if (!knots[i - 1][2]) { knots[i][3] = knots[i][3] || knots[i - 1][3]; knots.splice(i - 1, 1); i -= 2; if (i < 1) i = 1; }
    }

    const up = (L) => (2 * L) / (Math.PI * S.SAG_R), down = (L) => (2 * L) / (Math.PI * S.CREST_R);
    const lo = (i) => (knots[i][3] ? 0 : -down(knots[i][0] - knots[i - 1][0]));   // least the slope may change into knot i
    const hi = (i) => up(knots[i][0] - knots[i - 1][0]);
    // forward: pick a slope at each free knot, pulled back toward the height the run started at
    let y = sec.s0 > 0 ? this.Y[sec.s0 - 1] : 0;
    for (let i = 1; i < knots.length; i++) {
      const k = knots[i], prev = knots[i - 1][1], L = k[0] - knots[i - 1][0];
      if (!k[2]) {
        const mag = this.r(S.GRADE_MIN, S.GRADE);
        const want = this.rng() < clamp(0.5 - y / S.HEIGHT_PULL, 0.1, 0.9) ? mag : -mag;
        k[1] = clamp(clamp(want, prev + lo(i), prev + hi(i)), -S.GRADE, S.GRADE);
      }
      y += ((prev + k[1]) / 2) * L;
    }
    // then relax until every pair of neighbours is within the curvature caps (the fixed ends win)
    for (let pass = 0; pass < 6; pass++) {
      for (let i = knots.length - 2; i > 0; i--) if (!knots[i][2]) knots[i][1] = clamp(knots[i][1], knots[i + 1][1] - hi(i + 1), knots[i + 1][1] - lo(i + 1));
      for (let i = 1; i < knots.length - 1; i++) if (!knots[i][2]) knots[i][1] = clamp(knots[i][1], knots[i - 1][1] + lo(i), knots[i - 1][1] + hi(i));
    }

    // fill Y and G for the section
    const Y = this.Y, G = this.G;
    let h = sec.s0 > 0 ? Y[sec.s0 - 1] : 0, gPrev = 0, ki = 1;
    for (let i = sec.s0; i < sec.s1; i++) {
      while (ki < knots.length - 1 && i >= knots[ki][0]) ki++;
      const a = knots[ki - 1], b = knots[ki];
      const t = clamp((i - a[0]) / Math.max(1, b[0] - a[0]), 0, 1);
      const g = a[1] + (b[1] - a[1]) * (1 - Math.cos(Math.PI * t)) / 2;
      if (i > sec.s0) h += (gPrev + g) / 2;
      Y[i] = h; G[i] = g; gPrev = g;
    }
    this.gy = h;
    sec.knots = knots.map((k) => [k[0], k[1]]);
  }

  // ---------- stations: ships ----------
  /**
   * A ship lying along world forward. You come in through one end and leave by the other; inside,
   * the corridor swings left and right in pairs, so it always comes back to the axis and the hull
   * around it can be one rigid vessel.
   */
  buildShip() {
    const sec = this.beginSection('station');
    sec.ship = true;
    const d = this.difficulty(this.len);
    let w = this.nextStationW;
    this.gh = 0;
    const x0 = this.gx, z0 = this.gz;
    const total = this.r(S.STATION_LEN[0], S.STATION_LEN[1]) + d * 120;
    const entry = this.straight(64, w);
    this.piece('entry', entry.s0, { w });

    let lastRun = true;      // not straight into a long straight: the mouth is one already
    while (this.len - sec.s0 < total - 70) {
      const roll = this.rng(), u = this.gx - x0;
      if (roll < 0.2 && !lastRun) { this.hallPiece(d); lastRun = true; }
      else if (roll < 0.38 && !lastRun) { w = lerp(TRACK.STATION_W[0], TRACK.STATION_W[1], this.rng()); this.runPiece(w, d); lastRun = true; }
      else if (roll < 0.56) { this.shipChicane(w, d, u); lastRun = false; }
      else { this.shipEss(w, d, u, !lastRun); lastRun = false; }
      this.gh = 0;
      if (this.rng() < 0.4) { const p = this.straight(this.r(10, 24), w); this.piece('link', p.s0, { w }); }
    }
    const out = this.straight(56, w);
    this.piece('exit', out.s0, { w });
    sec.s1 = this.len;
    this.nextStationW = lerp(TRACK.STATION_W[0], TRACK.STATION_W[1], this.rng());

    // the hull is built from where the corridor really goes
    let uMin = 0, uMax = 0, wMax = 0;
    for (let i = sec.s0; i < sec.s1; i++) {
      uMin = Math.min(uMin, this.X[i] - x0 - this.W[i]); uMax = Math.max(uMax, this.X[i] - x0 + this.W[i]);
      wMax = Math.max(wMax, this.W[i]);
    }
    // Which hull form, and which end you come in by. (You always come in between the engines: seen from
    // astern a ship reads as a ship at once, which its bow, head-on and against the light, does not. The
    // draw is still made, so the seed's map is the same whichever way this is set.)
    const variant = Math.floor(this.rng() * 3), bowFirst = this.rng() < 0.5;
    void bowFirst;
    sec.hull = { x0, z0, z1: this.gz, y: this.gy, uMin, uMax, w0: this.W[sec.s0], w1: this.W[sec.s1 - 1], variant, flip: true };
  }

  shipRadius(d) { return lerp(this.r(S.SHIP_R[0][0], S.SHIP_R[0][1]), this.r(S.SHIP_R[1][0], S.SHIP_R[1][1]), d); }

  /** One corner with its run-in and run-out: the classic corner piece, with the side and angle given. */
  shipCorner(w, dir, angle, radius, leadLen = this.r(14, 26), outLen = this.r(20, 34)) {
    const lead = this.straight(leadLen, w);
    const p = this.bend(angle, radius, w, dir);
    const out = this.straight(outLen, w);
    const outer = dir > 0 ? WIN_R : WIN_L;
    if (this.rng() < 0.75) this.setFlags(lead.s0, out.s1, outer | (this.rng() < 0.3 ? (WIN_L | WIN_R) : 0));
    this.piece('corner', lead.s0, { w, arcs: [{ s0: p.s0, s1: p.s1, k: p.k, turn: -dir }] });
  }

  /** Two corners, one each way: off the axis and back onto it, sometimes with a run on the diagonal between. */
  shipEss(w, d, u, mayRun) {
    const dir = u > 8 ? -1 : u < -8 ? 1 : this.rng() < 0.5 ? 1 : -1;      // back toward the axis when well off it
    const R = this.shipRadius(d);
    let a = this.r(S.SHIP_A[0], S.SHIP_A[1]);
    let run = mayRun && this.rng() < 0.4 ? this.r(70, 110) : 0;
    // the two corners are linked closely (a short straight on the diagonal), unless a run stands between them
    const link = [this.r(10, 16), this.r(8, 12)];
    const shift = () => 2 * R * (1 - Math.cos(a)) + (run ? run + 60 : link[0] + link[1]) * Math.sin(a);
    while (Math.abs(u + dir * shift()) > S.SHIP_U && (run || a > 0.56)) { if (run) run = 0; else a = Math.max(0.55, a * 0.9); }
    if (run) {
      this.shipCorner(w, dir, a, R);
      this.runPieceLen(w, run);
      this.shipCorner(w, -dir, a, this.shipRadius(d));
    } else {
      this.shipCorner(w, dir, a, R, undefined, link[0]);
      this.shipCorner(w, -dir, a, this.shipRadius(d), link[1]);
    }
  }

  runPieceLen(w, len) {
    const p = this.straight(len, w);
    if (this.rng() < 0.65) this.setFlags(p.s0, p.s1, this.rng() < 0.5 ? WIN_L : this.rng() < 0.5 ? WIN_R : WIN_L | WIN_R);
    this.piece('run', p.s0, { w });
  }

  /** The classic chicane with both arcs the same size, so it ends pointing the way it started. */
  shipChicane(w, d, u) {
    const dir = u > 6 ? -1 : u < -6 ? 1 : this.rng() < 0.5 ? 1 : -1;
    const radius = lerp(this.r(55, 75), this.r(38, 52), d);
    const a = this.straight(14, w);
    const ang = this.r(0.45, 0.75);
    const p1 = this.bend(ang, radius, w, dir);
    this.straight(this.r(6, 14), w);
    const p2 = this.bend(ang, radius, w, -dir);
    this.straight(16, w);
    if (this.rng() < 0.6) this.setFlags(a.s0, this.len, this.rng() < 0.5 ? WIN_L : WIN_R);
    this.piece('chicane', a.s0, { w, arcs: [{ s0: p1.s0, s1: p1.s1, k: p1.k, turn: -dir }, { s0: p2.s0, s1: p2.s1, k: p2.k, turn: dir }] });
  }
}

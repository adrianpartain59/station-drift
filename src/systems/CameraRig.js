import * as THREE from 'three';
import { CAMERA, TRACK, SHIP, DRIFT } from '../core/Constants.js';

const ease = (r, dt) => 1 - Math.exp(-r * dt);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Chase camera and cockpit camera.
// The chase camera sits behind the direction of TRAVEL, not behind the nose, so when the ship
// slides you see it turned across the screen. It looks partly down the corridor ahead, which
// opens the view into a bend. Boosts are sold here: the view widens and pulls back.
export class CameraRig {
  constructor(camera, track) {
    this.cam = camera; this.track = track;
    this.f = {}; this.f2 = {}; this.f3 = {};
    this.mode = 'chase';
    this.rel = 0; this.roll = 0; this.trauma = 0; this.fovKick = 0; this.boost = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.cpos = new THREE.Vector3(); this.clook = new THREE.Vector3();
    this.seed = Math.random() * 100;
    this.blend = 0; // 0 chase .. 1 cockpit (eased swap)
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }
  kick(amount) { this.fovKick = Math.max(this.fovKick, amount); }
  setMode(m) { this.mode = m; }

  update(dt, t, ship, pose, eye) {
    const cam = this.cam, T = this.track;
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.fovKick = Math.max(0, this.fovKick - dt * 1.8);
    this.boost += ((ship.boosting ? 1 : 0) - this.boost) * ease(ship.boosting ? 7 : 2.2, dt);
    const speedN = clamp((ship.v - SHIP.CRUISE[0]) / (SHIP.CRUISE[1] * (1 + DRIFT.MAX_GAIN) - SHIP.CRUISE[0]), 0, 1);

    const target = this.mode === 'cockpit' ? 1 : 0;
    this.blend += (target - this.blend) * ease(10, dt);
    if (Math.abs(this.blend - target) < 0.002) this.blend = target;
    const b = this.blend;

    // ---- chase: behind the travel direction, in the corridor's frame so it never cuts through a wall ----
    const want = ship.theta + ship.beta * 0.2;
    this.rel += (want - this.rel) * ease(CAMERA.SMOOTH, dt);
    const D = CAMERA.CHASE_DIST + speedN * 1.0 + this.boost * 1.5;
    const sc = Math.max(0, ship.s - D * Math.cos(this.rel));
    let xc = ship.x - D * Math.sin(this.rel);
    const f = T.sample(sc, this.f);
    if (f.zone === 0) xc = clamp(xc, -f.w + 2.9, f.w - 2.9); // stay clear of the wall light bars
    // heights ride on the road: the camera over the road where the camera is, the look point over the road
    // where it looks, so the view pitches up a climb and tips over a crest by itself
    const y = f.y + TRACK.HOVER + CAMERA.CHASE_HEIGHT - speedN * 0.35 - this.boost * 0.25;
    this.pos.set(f.x - Math.cos(f.h) * xc, y, f.z + Math.sin(f.h) * xc);
    // look: mostly where the ship is going, partly down the corridor ahead (leans the view into a bend)
    const ty = pose.travelYaw;
    const L = CAMERA.LOOK_AHEAD;
    const lookY = T.sample(Math.min(T.len - 2, ship.s + L), this.f3).y;
    const g = T.sample(Math.min(T.len - 2, ship.s + 20 + ship.v * 0.28), this.f2);
    const gx = g.x - Math.cos(g.h) * ship.x * 0.6, gz = g.z + Math.sin(g.h) * ship.x * 0.6;
    const ax = pose.x + Math.sin(ty) * L, az = pose.z + Math.cos(ty) * L;
    const dg = Math.hypot(gx - pose.x, gz - pose.z) || 1;
    const wgt = 0.42;
    this.look.set(ax + (pose.x + ((gx - pose.x) / dg) * L - ax) * wgt, lookY + TRACK.HOVER + 0.7, az + (pose.z + ((gz - pose.z) / dg) * L - az) * wgt);
    const wantRoll = -ship.driftDir * (ship.drift ? ship.slide : 0) * 0.055 - ship.steer * 0.02;
    this.roll += (wantRoll - this.roll) * ease(5, dt);

    // ---- cockpit: the pilot's head, looking between the nose and the way the ship is going ----
    const ny = pose.yaw, cy = Math.cos(ny), sy = Math.sin(ny);
    this.cpos.set(pose.x + sy * eye.z, pose.y + eye.y + (pose.bob || 0), pose.z + cy * eye.z);
    const ly = ny + (ty - ny) * 0.6;
    const rise = T.sample(Math.min(T.len - 2, ship.s + 30), this.f3).y - (pose.floor || 0);   // how much the road climbs over the next 30 m
    this.clook.set(this.cpos.x + Math.sin(ly) * 30 + ((gx - pose.x) / dg) * 6, this.cpos.y - 1.2 + rise, this.cpos.z + Math.cos(ly) * 30 + ((gz - pose.z) / dg) * 6);

    cam.position.copy(this.pos).lerp(this.cpos, b);
    this.look.lerp(this.clook, b);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    cam.rotateZ(this.roll * (1 - b) - (pose.roll || 0) * b * 0.4);

    // shake (gentler in the cockpit)
    const tr = this.trauma * this.trauma * (1 - b * 0.45);
    if (tr > 0.0001) {
      const n = (k) => Math.sin(t * 47 + this.seed * k) * 0.6 + Math.sin(t * 91 + k * 3.1) * 0.4;
      cam.position.x += n(1) * tr * 0.4; cam.position.y += n(2) * tr * 0.32;
      cam.rotateZ(n(3) * tr * 0.045);
    }
    if (ship.boosting) cam.position.y += Math.sin(t * 70) * 0.018 * this.boost; // boost rumble

    const fovBase = CAMERA.FOV * (1 - b) + CAMERA.FP_FOV * b;
    cam.fov = fovBase + speedN * CAMERA.FOV_SPEED + this.boost * CAMERA.FOV_BOOST + this.fovKick * 7;
    cam.updateProjectionMatrix();
  }
}

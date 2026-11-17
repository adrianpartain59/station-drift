import * as THREE from 'three';
import { CAMERA, TRACK, SHIP } from '../core/Constants.js';

const ease = (r, dt) => 1 - Math.exp(-r * dt);

// Chase camera that swings out with the drift, and a cockpit camera. Trauma-based shake on top.
export class CameraRig {
  constructor(camera, track) {
    this.cam = camera; this.track = track;
    this.f = {};
    this.mode = 'chase';
    this.camYaw = 0; this.roll = 0; this.trauma = 0; this.fovKick = 0;
    this.tmp = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.seed = Math.random() * 100;
    this.blend = 0; // 0 chase .. 1 cockpit (eased swap)
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }
  kick(amount) { this.fovKick = Math.max(this.fovKick, amount); }
  setMode(m) { this.mode = m; }

  update(dt, t, ship, pose, comfort) {
    const cam = this.cam;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.fovKick = Math.max(0, this.fovKick - dt * 2.2);
    const speedN = Math.min(1, Math.max(0, (ship.v - SHIP.BASE_SPEED) / (SHIP.MAX_BASE_SPEED + SHIP.BOOST_SPEED - SHIP.BASE_SPEED)));
    const boost = ship.boostActive ? 1 : 0;

    const target = this.mode === 'cockpit' ? 1 : 0;
    this.blend += (target - this.blend) * ease(10, dt);
    if (Math.abs(this.blend - target) < 0.002) this.blend = target;

    // Swing toward the travel line so the drift angle reads on screen.
    const wantYaw = ship.drift ? ship.phi * 0.95 + ship.psi * 0.05 : ship.phi * 0.8 + ship.psi * 0.2;
    this.camYaw += (wantYaw - this.camYaw) * ease(CAMERA.SMOOTH, dt);
    const wantRoll = -(ship.drift ? ship.driftDir * Math.min(ship.slip, 1) * 0.12 : 0) - ship.steer * 0.03;
    this.roll += (wantRoll - this.roll) * ease(5, dt);

    // ---- chase position, computed in the curved frame so it never lags at speed ----
    const D = CAMERA.CHASE_DIST + speedN * 1.8;
    const sc = ship.s - D * Math.cos(this.camYaw);
    let xc = ship.x - D * Math.sin(this.camYaw) * 0.85;
    const f = this.track.sample(Math.max(0, sc), this.f);
    // keep well clear of the walls: the rib light bars sit 0.8 m out and bloom across the lens up close
    if (f.zone === 0) xc = Math.max(-f.w + 2.9, Math.min(f.w - 2.9, xc));
    const ch = Math.cos(f.h), sh = Math.sin(f.h);
    const chase = this.tmp.set(f.x - ch * xc, TRACK.HOVER + CAMERA.CHASE_HEIGHT - speedN * 0.5 + ship.h * 0.55, f.z + sh * xc);
    const fwdYaw = pose.yaw * 0.35 + pose.travelYaw * 0.65;
    const chaseLook = this.look.set(pose.x + Math.sin(fwdYaw) * CAMERA.LOOK_AHEAD, TRACK.HOVER + 0.8 + ship.h * 0.4, pose.z + Math.cos(fwdYaw) * CAMERA.LOOK_AHEAD);
    // In a drift, look toward where the arc is taking you, not where the nose points.
    this.aimW = (this.aimW || 0) + ((pose.aimW || 0) - (this.aimW || 0)) * ease(6, dt);
    if (pose.aim && this.aimW > 0.001) { this.tmp2 = this.tmp2 || new THREE.Vector3(); chaseLook.lerp(this.tmp2.copy(pose.aim).setY(TRACK.HOVER + 0.6), this.aimW); }

    // ---- cockpit ----
    const fy = pose.yaw;
    const cockpit = new THREE.Vector3(pose.x + Math.sin(fy) * 0.15, pose.y + 0.52, pose.z + Math.cos(fy) * 0.15);
    const cockLook = new THREE.Vector3(pose.x + Math.sin(fy) * 30, pose.y + 0.1, pose.z + Math.cos(fy) * 30);

    const b = this.blend;
    cam.position.copy(chase).lerp(cockpit, b);
    const look = chaseLook.lerp(cockLook, b);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    const bodyRoll = pose.roll || 0;
    cam.rotateZ(this.roll * (1 - b) + bodyRoll * b * 0.7);

    // shake (lighter in comfort mode and in the cockpit)
    const tr = this.trauma * this.trauma * (comfort ? 0.35 : 1) * (1 - b * 0.4);
    if (tr > 0.0001) {
      const n = (k) => Math.sin(t * 47 + this.seed * k) * 0.6 + Math.sin(t * 91 + k * 3.1) * 0.4;
      cam.position.x += n(1) * tr * 0.45; cam.position.y += n(2) * tr * 0.35;
      cam.rotateZ(n(3) * tr * 0.05);
    }
    // high-speed rumble
    if (ship.boostActive && !comfort) { cam.position.y += Math.sin(t * 70) * 0.03; }

    const fovBase = CAMERA.FOV * (1 - b) + CAMERA.FP_FOV * b;
    cam.fov = fovBase + speedN * CAMERA.FOV_SPEED + boost * CAMERA.FOV_BOOST * 0.6 + this.fovKick * CAMERA.FOV_BOOST;
    cam.updateProjectionMatrix();
  }
}

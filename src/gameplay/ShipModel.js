import * as THREE from 'three';

// The drift ship: a hover coupe. Long low hood, cabin set back, wide tail with a wing and a light bar,
// and a lift pod at each corner where a car has wheels. The front pods turn to face the direction of
// travel, so in a slide you see them counter-steer. Nose points down local +Z.

const PAINT = 0xf3f0ea, CARBON = 0x15171d, ACCENT = 0xff2d95, GLOW = 0x37e6ff, TAIL = 0xff2030;

function shape(geo, fn) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, v[0], v[1], v[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

export class ShipModel {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group();     // rolls and pitches
    this.exterior = new THREE.Group(); // hidden in first person
    this.cockpit = new THREE.Group();  // shown in first person
    this.group.add(this.body);
    this.body.add(this.exterior, this.cockpit);

    const paint = new THREE.MeshStandardMaterial({ color: PAINT, metalness: 0.25, roughness: 0.32, emissive: 0x2a2c33, emissiveIntensity: 0.55 });
    const carbon = new THREE.MeshStandardMaterial({ color: CARBON, metalness: 0.75, roughness: 0.38 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0a1622, metalness: 0.95, roughness: 0.06, emissive: 0x08263c, emissiveIntensity: 0.5 });
    this.stripe = new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(2.2) });
    this.glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(GLOW).multiplyScalar(1.6) });
    this.tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(TAIL).multiplyScalar(2.4) });
    const head = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdff4ff).multiplyScalar(2.2) });
    this.mats = { paint, carbon };
    const add = (geo, mat, x = 0, y = 0, z = 0, parent = this.exterior) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

    // floor pan: splitter at the nose, diffuser at the tail
    add(shape(new THREE.BoxGeometry(2.5, 0.22, 5.3, 4, 1, 10), (x, y, z) => {
      const t = (z + 2.65) / 5.3;                         // 0 tail .. 1 nose
      return [x * (1 - 0.3 * Math.pow(t, 3)), y, z];
    }), carbon, 0, -0.26, 0);

    // body shell: a wedge, lowest at the nose, widest over the rear pods
    add(shape(new THREE.BoxGeometry(2.3, 0.5, 5.1, 8, 3, 16), (x, y, z) => {
      const t = (z + 2.55) / 5.1;
      const wide = (0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, (1 - t) * 1.6))) * (1 - 0.42 * Math.pow(t, 2.6));
      const top = y > 0 ? 1 - 0.62 * Math.pow(t, 1.5) - 0.12 * Math.pow(1 - t, 3) : 1;
      const tuck = 1 - 0.16 * Math.max(0, y) * 2;        // shoulders lean in
      return [x * wide * tuck, y * top, z];
    }), paint, 0, 0.04, 0);

    // cabin: glass set well back, fastback into the tail
    add(shape(new THREE.SphereGeometry(0.72, 24, 14), (x, y, z) => [x * 1.0, Math.max(-0.05, y) * 0.62, z * (z > 0 ? 1.55 : 2.1)]), glass, 0, 0.27, -0.45);
    add(shape(new THREE.BoxGeometry(1.1, 0.05, 1.5, 2, 1, 4), (x, y, z) => [x * (1 - 0.2 * ((0.75 - z) / 1.5)), y, z]), paint, 0, 0.71, -0.6); // roof panel

    // twin stripes, hood to tail
    for (const sx of [-0.2, 0.2]) {
      add(new THREE.BoxGeometry(0.13, 0.012, 1.7), this.stripe, sx, 0.148, 1.5).rotation.x = 0.148;
      add(new THREE.BoxGeometry(0.13, 0.012, 1.3), this.stripe, sx, 0.742, -0.6);
    }

    // wing on two posts
    add(shape(new THREE.BoxGeometry(2.5, 0.07, 0.62, 6, 1, 2), (x, y, z) => [x, y + 0.05 * Math.abs(x / 1.25) ** 2 - z * 0.14, z]), carbon, 0, 0.86, -2.3);
    for (const sx of [-0.7, 0.7]) add(new THREE.BoxGeometry(0.07, 0.5, 0.3), carbon, sx, 0.6, -2.25).rotation.x = -0.25;
    for (const sx of [-1.25, 1.25]) add(new THREE.BoxGeometry(0.05, 0.3, 0.72), new THREE.MeshStandardMaterial({ color: ACCENT, metalness: 0.4, roughness: 0.3, emissive: ACCENT, emissiveIntensity: 0.5 }), sx, 0.9, -2.3);

    // light bar across the tail, headlight blades at the nose
    add(new THREE.BoxGeometry(2.0, 0.09, 0.06), this.tail, 0, 0.3, -2.57);
    for (const sx of [-0.52, 0.52]) add(new THREE.BoxGeometry(0.5, 0.05, 0.08), head, sx, 0.05, 2.5).rotation.y = -sx * 0.5;

    // lift pods at the four corners; the front pair steer
    this.frontPods = [];
    const podGeo = shape(new THREE.BoxGeometry(0.52, 0.34, 1.15, 2, 2, 6), (x, y, z) => [x * (1 - 0.3 * Math.abs(z / 0.575) ** 2), y * (1 - 0.35 * Math.abs(z / 0.575) ** 2), z]);
    for (const [sx, sz] of [[-1.24, 1.55], [1.24, 1.55], [-1.3, -1.6], [1.3, -1.6]]) {
      const pod = new THREE.Group();
      pod.position.set(sx, -0.16, sz);
      const big = sz < 0 ? 1.15 : 1;
      const shell = new THREE.Mesh(podGeo, carbon); shell.scale.setScalar(big); pod.add(shell);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.8 * big), this.glow); lamp.position.set(Math.sign(sx) * 0.25 * big, 0.02, 0); pod.add(lamp);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.16 * big, 0.26 * big, 20), this.glow); ring.rotation.x = Math.PI / 2; ring.position.y = -0.19 * big; pod.add(ring);
      this.exterior.add(pod);
      if (sz > 0) this.frontPods.push(pod);
      // arch over the pod
      add(shape(new THREE.BoxGeometry(0.62, 0.16, 1.5, 2, 1, 6), (x, y, z) => [x, y - 0.14 * Math.abs(z / 0.75) ** 2, z]), paint, sx * 0.94, 0.12, sz);
    }
    // where the floor trails start (rear pods) and where the tail-light streaks start
    this.skid = [new THREE.Vector3(-1.3, -0.4, -1.7), new THREE.Vector3(1.3, -0.4, -1.7)];
    this.tips = [new THREE.Vector3(-0.92, 0.3, -2.62), new THREE.Vector3(0.92, 0.3, -2.62)];
    this.tailPoint = new THREE.Vector3(0, -0.1, -2.9);

    // twin thrusters under the light bar
    this.flames = [];
    this.core = new THREE.MeshBasicMaterial({ color: new THREE.Color(GLOW) });
    for (const sx of [-0.55, 0.55]) {
      const can = add(new THREE.CylinderGeometry(0.27, 0.31, 0.7, 16), carbon, sx, 0.02, -2.4); can.rotation.x = Math.PI / 2;
      add(new THREE.TorusGeometry(0.25, 0.035, 8, 22), this.glow, sx, 0.02, -2.76);
      const core = add(new THREE.CircleGeometry(0.2, 18), this.core, sx, 0.02, -2.77); core.rotation.y = Math.PI;
      const flame = add(new THREE.ConeGeometry(0.17, 1.5, 14, 1, true).translate(0, 0.75, 0).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(GLOW).multiplyScalar(2), transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }), sx, 0.02, -2.78);
      this.flames.push(flame);
    }

    // underglow: a neon pool under the ship and a real light on the floor
    this.underMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: new THREE.Color(GLOW).multiplyScalar(0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = add(new THREE.PlaneGeometry(3.4, 6), this.underMat, 0, -0.42, -0.1); pool.rotation.x = -Math.PI / 2;
    this.under = new THREE.PointLight(GLOW, 22, 12, 1.6);
    this.under.position.set(0, -1.1, -0.2);
    this.group.add(this.under);

    this.buildCockpit(carbon, paint);
    this.setFirstPerson(false);
  }

  buildCockpit(carbon, paint) {
    const c = this.cockpit;
    const trim = new THREE.MeshStandardMaterial({ color: 0x191c24, metalness: 0.5, roughness: 0.55, emissive: 0x06080c });
    const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(GLOW).multiplyScalar(0.9) });
    const put = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); c.add(m); return m; };
    // a straight bar between two points (pillars)
    const bar = (ax, ay, az, bx, by, bz, t, mat) => {
      const A = new THREE.Vector3(ax, ay, az), B = new THREE.Vector3(bx, by, bz), d = B.clone().sub(A);
      const m = new THREE.Mesh(new THREE.BoxGeometry(t, d.length(), t), mat);
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      c.add(m);
    };
    // the pilot sits low and well back, looking down a long hood
    this.eye = new THREE.Vector3(0, 0.74, -0.35);
    put(new THREE.BoxGeometry(1.75, 0.2, 0.52), trim, 0, 0.3, 0.42);                       // dash
    put(new THREE.BoxGeometry(1.75, 0.012, 0.03), edge, 0, 0.405, 0.67);                   // light line along its far edge
    const screen = put(new THREE.PlaneGeometry(0.5, 0.13), new THREE.MeshBasicMaterial({ map: dashTexture(), color: new THREE.Color(1.3, 1.3, 1.3) }), 0, 0.43, 0.5);
    screen.rotation.set(-0.95, Math.PI, 0);
    // the yoke: turns with the steering, and against the slide; only its top arc shows
    this.yoke = new THREE.Group(); this.yoke.position.set(0, 0.3, 0.12); this.yoke.rotation.x = -0.35;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.016, 8, 24, Math.PI * 1.4), trim); rim.rotation.z = -Math.PI * 0.2; this.yoke.add(rim);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.04, 0.03), this.stripe); mark.position.y = 0.14; this.yoke.add(mark);
    c.add(this.yoke);
    for (const s of [-1, 1]) {
      bar(s * 0.74, 0.4, 0.7, s * 0.46, 1.08, -0.1, 0.05, trim);                           // A-pillar
      put(new THREE.BoxGeometry(0.07, 0.16, 1.4), trim, s * 0.82, 0.33, 0.02);             // door top
    }
    // the hood out front, with its stripes
    const hood = put(shape(new THREE.BoxGeometry(2.0, 0.08, 1.9, 4, 1, 6), (x, y, z) => { const t = (z + 0.95) / 1.9; return [x * (1 - 0.5 * t * t), y - 0.17 * t * t, z]; }), paint, 0, 0.3, 1.68);
    void hood;
    for (const sx of [-0.2, 0.2]) { const st = put(new THREE.BoxGeometry(0.13, 0.012, 1.8), this.stripe, sx, 0.3, 1.68); st.rotation.x = 0.09; }
    void carbon;
  }

  setFirstPerson(fp) {
    this.exterior.visible = !fp;
    this.cockpit.visible = fp;
  }

  /**
   * thrust 0..1.2, boost 0..1, color = drift tier colour, counter = angle (rad) the front pods and yoke
   * turn by: toward the direction of travel, so they visibly counter-steer in a slide.
   */
  update(dt, t, thrust, boost, color, counter, steer) {
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const len = 0.3 + thrust * 0.4 + boost * 1.3 + Math.sin(t * 60 + i * 2) * 0.05;
      f.scale.set(0.85 + boost * 0.5, 0.85 + boost * 0.5, len);
      f.material.color.copy(color).multiplyScalar(0.7 + boost * 1.1);
    }
    this.glow.color.copy(color).multiplyScalar(1.25 + boost * 1.2);
    this.core.color.copy(color).multiplyScalar(0.75 + boost * 1.6);
    this.underMat.color.copy(color).multiplyScalar(0.8 + boost * 0.5);
    this.under.color.copy(color);
    for (const p of this.frontPods) p.rotation.y += (counter - p.rotation.y) * Math.min(1, dt * 14);
    this.yoke.rotation.z += (-(steer * 0.5 - counter * 1.4) - this.yoke.rotation.z) * Math.min(1, dt * 12);
  }
}

function poolTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 128, 4, 64, 128, 120);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.3)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dashTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#05070c'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#37e6ff'; g.lineWidth = 3; g.shadowColor = '#37e6ff'; g.shadowBlur = 10;
  g.beginPath(); g.arc(256, 150, 110, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  g.fillStyle = '#ff2d95'; g.shadowColor = '#ff2d95';
  for (let i = 0; i < 12; i++) g.fillRect(40 + i * 12, 96 - i * 5, 8, 8 + i * 5);
  for (let i = 0; i < 12; i++) g.fillRect(472 - i * 12, 96 - i * 5, 8, 8 + i * 5);
  g.font = 'bold 34px monospace'; g.fillStyle = '#dff6ff'; g.shadowColor = '#37e6ff'; g.textAlign = 'center';
  g.fillText('SLIP', 256, 96);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

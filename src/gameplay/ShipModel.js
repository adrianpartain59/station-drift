import * as THREE from 'three';

// The drift ship, built from primitives: a low wedge with swept wings, twin engines,
// a canopy, and neon underglow (the street-racer tell). Nose points down local +Z.

function taper(geo, fn) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, v[0], v[1], v[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

export class ShipModel {
  constructor(paint = 0xe9edf5, accent = 0xff3fb4, glow = 0x37e6ff) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();     // rolls and pitches
    this.exterior = new THREE.Group(); // hidden in first person
    this.cockpit = new THREE.Group();  // shown in first person
    this.group.add(this.body);
    this.body.add(this.exterior);
    this.body.add(this.cockpit);

    const paintM = new THREE.MeshStandardMaterial({ color: paint, metalness: 0.55, roughness: 0.28 });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x1c2029, metalness: 0.7, roughness: 0.4 });
    const accentM = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.4, roughness: 0.3, emissive: accent, emissiveIntensity: 0.35 });
    const glassM = new THREE.MeshStandardMaterial({ color: 0x0b1a2a, metalness: 0.95, roughness: 0.05, emissive: 0x0a2a44, emissiveIntensity: 0.6 });
    this.glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(1.3) });
    this.stripeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(3) });

    // fuselage: tapered box, low and wide at the back, sharp at the nose
    const fus = taper(new THREE.BoxGeometry(1.5, 0.62, 4.6, 6, 2, 12), (x, y, z) => {
      const t = (z + 2.3) / 4.6; // 0 back .. 1 nose
      const wsc = 1 - 0.78 * Math.pow(t, 1.6);
      const ysc = 1 - 0.55 * t;
      const yOff = y > 0 ? -0.12 * t : 0.05 * t;
      return [x * wsc * (1 - 0.25 * Math.abs(y) * 2), y * ysc + yOff, z];
    });
    this.exterior.add(new THREE.Mesh(fus, paintM));

    // side pods / intakes
    for (const s of [-1, 1]) {
      const pod = taper(new THREE.BoxGeometry(0.7, 0.5, 2.6, 2, 2, 6), (x, y, z) => {
        const t = (z + 1.3) / 2.6;
        return [x * (1 - 0.4 * t), y * (1 - 0.5 * t), z];
      });
      const m = new THREE.Mesh(pod, darkM);
      m.position.set(s * 1.0, -0.05, -0.6);
      this.exterior.add(m);
    }

    // swept wings
    for (const s of [-1, 1]) {
      const wing = taper(new THREE.BoxGeometry(2.4, 0.09, 1.7, 6, 1, 3), (x, y, z) => {
        const t = (x + 1.2) / 2.4; // 0 root .. 1 tip
        return [x, y - t * 0.12, z * (1 - 0.55 * t) - t * 0.95];
      });
      const m = new THREE.Mesh(wing, paintM);
      m.position.set(s * 1.75, -0.12, -0.75);
      m.scale.x = s;
      this.exterior.add(m);
      // accent stripe along the wing's leading edge
      const st = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.12), this.stripeM);
      st.position.set(s * 1.75, -0.04, -0.12);
      st.rotation.y = -s * 0.38;
      this.exterior.add(st);
      // winglet
      const fin = taper(new THREE.BoxGeometry(0.07, 0.7, 0.9), (x, y, z) => [x, y, z - (y + 0.35) * 0.45]);
      const fm = new THREE.Mesh(fin, accentM);
      fm.position.set(s * 2.9, 0.15, -1.45);
      this.exterior.add(fm);
    }
    this.tips = [new THREE.Vector3(-2.95, 0.3, -1.7), new THREE.Vector3(2.95, 0.3, -1.7)];

    // canopy
    const can = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), glassM);
    can.scale.set(0.95, 0.55, 1.9);
    can.position.set(0, 0.32, 0.25);
    this.exterior.add(can);

    // spine stripe
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 2.8), this.stripeM);
    spine.position.set(0, 0.33, -1.0);
    this.exterior.add(spine);

    // twin engines with glowing nozzles and flames
    this.flames = [];
    for (const s of [-1, 1]) {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 1.5, 16), darkM);
      eng.rotation.x = Math.PI / 2;
      eng.position.set(s * 0.62, 0.0, -2.2);
      this.exterior.add(eng);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 8, 24), this.glowM);
      ring.position.set(s * 0.62, 0, -2.96);
      this.exterior.add(ring);
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), this.glowM);
      core.position.set(s * 0.62, 0, -2.97);
      core.rotation.y = Math.PI;
      this.exterior.add(core);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 2.4, 16, 1, true).translate(0, 1.2, 0).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(2.5), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      flame.position.set(s * 0.62, 0, -2.98);
      this.exterior.add(flame);
      this.flames.push(flame);
    }

    // underglow: a soft neon pool under the ship plus a real light on the floor
    const ug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5.2), new THREE.MeshBasicMaterial({ map: underglowTex(), color: new THREE.Color(accent).multiplyScalar(1.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ug.rotation.x = -Math.PI / 2;
    ug.position.set(0, -0.36, -0.3);
    this.exterior.add(ug);
    this.under = new THREE.PointLight(accent, 26, 13, 1.6);
    this.under.position.set(0, -1.2, -0.2);
    this.group.add(this.under);

    this.buildCockpit(darkM, accent, glow);
    this.setFirstPerson(false);
  }

  buildCockpit(darkM, accent, glow) {
    const c = this.cockpit;
    const frameM = new THREE.MeshStandardMaterial({ color: 0x15181f, metalness: 0.6, roughness: 0.45 });
    // dashboard
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.26, 0.6), frameM);
    dash.position.set(0, -0.08, 0.95);
    dash.rotation.x = -0.25;
    c.add(dash);
    // screens
    const screenM = new THREE.MeshBasicMaterial({ map: dashTexture(accent, glow), color: new THREE.Color(1.6, 1.6, 1.6) });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.22), screenM);
    scr.position.set(0, 0.06, 0.82);
    scr.rotation.x = -0.55;
    scr.rotation.y = Math.PI;
    c.add(scr);
    // canopy frame: two A-pillars and a top bow
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.2), frameM);
      p.position.set(s * 0.52, 0.32, 0.85);
      p.rotation.set(0.45, s * 0.22, 0);
      c.add(p);
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 1.6), frameM);
      side.position.set(s * 0.66, -0.05, 0.3);
      c.add(side);
    }
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 24, Math.PI), frameM);
    bow.position.set(0, 0.06, 0.32);
    c.add(bow);
    // nose visible ahead
    const nose = new THREE.Mesh(taper(new THREE.BoxGeometry(0.9, 0.2, 1.6, 2, 1, 4), (x, y, z) => [x * (1 - 0.85 * ((z + 0.8) / 1.6)), y, z]), new THREE.MeshStandardMaterial({ color: 0xe9edf5, metalness: 0.55, roughness: 0.28 }));
    nose.position.set(0, -0.32, 1.9);
    c.add(nose);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 1.4), this.stripeM);
    st.position.set(0, -0.21, 1.9);
    c.add(st);
  }

  setFirstPerson(fp) {
    this.exterior.visible = !fp;
    this.cockpit.visible = fp;
  }

  update(dt, t, thrust, boost, tierColor) {
    for (const f of this.flames) {
      const len = 0.45 + thrust * 0.35 + boost * 0.75 + Math.sin(t * 60 + f.id) * 0.05;
      f.scale.set(0.8 + boost * 0.25, 0.8 + boost * 0.25, len);
      f.material.color.copy(tierColor).multiplyScalar(0.7 + boost * 0.7);
    }
    this.glowM.color.copy(tierColor).multiplyScalar(1.3 + boost * 1.4);
  }
}

function underglowTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 128, 4, 64, 128, 120);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.4, 'rgba(255,255,255,0.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dashTexture(accent, glow) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  const a = '#' + new THREE.Color(accent).getHexString(), b = '#' + new THREE.Color(glow).getHexString();
  g.fillStyle = '#05070c'; g.fillRect(0, 0, 512, 96);
  g.strokeStyle = b; g.lineWidth = 2; g.shadowColor = b; g.shadowBlur = 8;
  g.strokeRect(6, 6, 150, 84); g.strokeRect(356, 6, 150, 84);
  g.beginPath(); for (let x = 0; x < 140; x += 4) g.lineTo(12 + x, 60 - Math.sin(x * 0.12) * 18); g.stroke();
  g.fillStyle = a; g.shadowColor = a;
  for (let i = 0; i < 9; i++) g.fillRect(370 + i * 14, 70 - i * 6, 10, 10 + i * 6);
  g.font = 'bold 30px monospace'; g.fillStyle = b; g.shadowColor = b; g.textAlign = 'center';
  g.fillText('DRIFT SYS', 256, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

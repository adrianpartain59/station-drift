import * as THREE from 'three';

// Sparks, wingtip light trails and speed streaks. All pooled, nothing allocated per frame.

export class Sparks {
  constructor(scene, max = 1400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      // Capped size and a fade near the lens, so sparks flying back past the camera don't white out the view.
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); float d = -mv.z;
          vC = color * smoothstep(2.0, 7.0, d);
          gl_PointSize = min(size * 300.0 / max(d, 0.5), 22.0); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vC*a*a*1.3, 1.0); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.c = new THREE.Color();
  }

  emit(x, y, z, vx, vy, vz, color, life = 0.5, size = 0.35, spread = 4, drag = 2) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx + (Math.random() - 0.5) * spread;
    this.vel[i * 3 + 1] = vy + (Math.random() - 0.5) * spread;
    this.vel[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
    this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.8);
    this.c.set(color);
    this.col[i * 3] = this.c.r; this.col[i * 3 + 1] = this.c.g; this.col[i * 3 + 2] = this.c.b;
    this.size[i] = size;
    this.drag[i] = drag;
    this.base = this.base || new Float32Array(this.max);
    this.base[i] = size;
  }

  burst(p, n, color, speed = 18, life = 0.7, size = 0.45) {
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, th = Math.random() * 6.283, r = Math.sqrt(1 - u * u);
      const v = speed * (0.3 + Math.random() * 0.7);
      this.emit(p.x, p.y, p.z, Math.cos(th) * r * v, u * v, Math.sin(th) * r * v, color, life, size, 1, 2.5);
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - 6 * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      this.size[i] = this.base[i] * f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

// A light ribbon that follows a point (wingtip trails, like tail lights in a long exposure).
export class Trail {
  constructor(scene, n = 44, width = 0.1) {
    this.n = n; this.width = width;
    this.pts = Array.from({ length: n }, () => new THREE.Vector3());
    this.side = Array.from({ length: n }, () => new THREE.Vector3());
    this.inited = false;
    const pos = new Float32Array(n * 2 * 3), a = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { a[i * 2] = a[i * 2 + 1] = 1 - i / (n - 1); }
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('fade', new THREE.BufferAttribute(a, 1));
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { color: { value: new THREE.Color(0x37e6ff) }, strength: { value: 0.3 } },
      vertexShader: `attribute float fade; varying float vF; void main(){ vF = fade; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float strength; varying float vF; void main(){ gl_FragColor = vec4(color * pow(vF, 1.6) * strength, 1.0); }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  reset() { this.inited = false; }
  update(head, sideDir, color, strength) {
    if (!this.inited) { for (const p of this.pts) p.copy(head); this.inited = true; }
    for (let i = this.n - 1; i > 0; i--) { this.pts[i].copy(this.pts[i - 1]); this.side[i].copy(this.side[i - 1]); }
    this.pts[0].copy(head); this.side[0].copy(sideDir);
    const pos = this.geo.attributes.position.array;
    for (let i = 0; i < this.n; i++) {
      const w = this.width * (1 - i / this.n * 0.6), p = this.pts[i], sd = this.side[i];
      pos[i * 6] = p.x + sd.x * w; pos[i * 6 + 1] = p.y + w; pos[i * 6 + 2] = p.z + sd.z * w;
      pos[i * 6 + 3] = p.x - sd.x * w; pos[i * 6 + 4] = p.y - w; pos[i * 6 + 5] = p.z - sd.z * w;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.mat.uniforms.color.value.copy(color);
    this.mat.uniforms.strength.value = strength;
  }
}

// The drift aim line: glowing dots on the floor along the arc the ship will follow if you keep holding.
// Turns red from the point where that arc meets a wall.
export class AimGuide {
  constructor(scene, n = 22) {
    this.n = n;
    this.pts = Array.from({ length: n }, () => ({ s: 0, x: 0 }));
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC;
        void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size * 300.0 / max(-mv.z, 0.5); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.15,d); gl_FragColor = vec4(vC*a, 1.0); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.alpha = 0;
    this.c = new THREE.Color(); this.red = new THREE.Color(1.6, 0.15, 0.2);
    this.f = {};
  }

  // Returns the world point about 0.45 s ahead (for the camera to look toward).
  update(dt, ph, track, color, show, y, out) {
    this.alpha += ((show ? 1 : 0) - this.alpha) * (1 - Math.exp(-(show ? 14 : 6) * dt));
    const hit = ph.predict(this.pts);
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i], f = track.sample(p.s, this.f);
      this.pos[i * 3] = f.x - Math.cos(f.h) * p.x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = f.z + Math.sin(f.h) * p.x;
      const bad = hit >= 0 && i >= hit;
      this.c.copy(bad ? this.red : color);
      const fade = 1.8 * this.alpha * (1 - 0.7 * i / this.n) * (i < 2 ? 0.3 : 1);
      this.col[i * 3] = this.c.r * fade; this.col[i * 3 + 1] = this.c.g * fade; this.col[i * 3 + 2] = this.c.b * fade;
      this.size[i] = this.alpha > 0.01 ? (bad ? 0.95 : 0.75) : 0;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; this.geo.attributes.size.needsUpdate = true;
    const k = Math.min(this.n - 1, 9);
    return out.set(this.pos[k * 3], this.pos[k * 3 + 1], this.pos[k * 3 + 2]);
  }
}

// Speed streaks around the camera while boosting.
export class SpeedLines {
  constructor(scene, n = 160) {
    this.n = n;
    const pos = new Float32Array(n * 2 * 3), a = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { a[i * 2] = 1; a[i * 2 + 1] = 0; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('fade', new THREE.BufferAttribute(a, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { strength: { value: 0 }, color: { value: new THREE.Color(0.7, 0.9, 1.0) } },
      vertexShader: `attribute float fade; varying float vF; void main(){ vF = fade; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float strength; uniform vec3 color; varying float vF; void main(){ gl_FragColor = vec4(color*vF*strength, 1.0); }`,
    });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.seeds = Array.from({ length: n }, () => [Math.random() * 6.283, 1.5 + Math.random() * 6, Math.random() * 80]);
  }
  update(cam, fwd, t, strength) {
    this.mat.uniforms.strength.value = strength;
    if (strength <= 0.01) return;
    const pos = this.geo.attributes.position.array;
    const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    for (let i = 0; i < this.n; i++) {
      const [ang, rad, off] = this.seeds[i];
      const z = 60 - ((t * 140 + off) % 80);
      const ox = Math.cos(ang) * rad, oy = Math.sin(ang) * rad * 0.6;
      const bx = cam.x + fwd.x * z + right.x * ox, by = cam.y + oy, bz = cam.z + fwd.z * z + right.z * ox;
      pos[i * 6] = bx; pos[i * 6 + 1] = by; pos[i * 6 + 2] = bz;
      pos[i * 6 + 3] = bx - fwd.x * 7; pos[i * 6 + 4] = by; pos[i * 6 + 5] = bz - fwd.z * 7;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

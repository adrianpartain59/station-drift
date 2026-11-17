import * as THREE from 'three';
import { mulberry32 } from './Track.js';

// The backdrop: nebula sky, star field, a star, and a few planets placed ahead of the track
// so one is always in view. The whole group follows the camera (it is "at infinity").

const NOISE = /* glsl */`
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){
  vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
`;

function skyMaterial(c1, c2, c3) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { c1: { value: new THREE.Color(c1) }, c2: { value: new THREE.Color(c2) }, c3: { value: new THREE.Color(c3) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: NOISE + `
      uniform vec3 c1, c2, c3; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float n = fbm(d*2.2 + vec3(3.1,1.7,0.4));
        float n2 = fbm(d*4.5 - vec3(1.3,4.2,2.2));
        float band = exp(-pow(d.y*2.4 + n*1.3 - 0.4, 2.0));
        vec3 col = vec3(0.004,0.006,0.016);
        col += c1 * pow(n, 3.0) * 1.1 * band;
        col += c2 * pow(n2, 4.0) * 1.3 * (0.4+band);
        col += c3 * pow(max(0.0, n*n2*1.8-0.35), 2.0) * 2.5;
        float dust = smoothstep(0.55, 0.75, fbm(d*9.0));
        col *= 1.0 - dust*0.6*band;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function planetMaterial(opts) {
  return new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      sunDir: { value: opts.sunDir.clone() },
      a: { value: new THREE.Color(opts.a) }, b: { value: new THREE.Color(opts.b) }, cc: { value: new THREE.Color(opts.c) },
      bands: { value: opts.bands }, seed: { value: opts.seed }, atmo: { value: new THREE.Color(opts.atmo) }, lights: { value: opts.cityLights ? 1 : 0 },
    },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vW;
      void main(){ vN = normalize(mat3(modelMatrix)*normal); vP = position; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
        gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + `
      uniform vec3 sunDir, a, b, cc, atmo; uniform float bands, seed, lights; varying vec3 vN; varying vec3 vP; varying vec3 vW;
      void main(){
        vec3 p = normalize(vP);
        vec3 col;
        if (bands > 0.5) {
          float t = p.y*bands + fbm(p*3.0+seed)*1.6 + 0.35*sin(p.y*40.0+fbm(p*8.0)*4.0);
          col = mix(a, b, 0.5+0.5*sin(t*3.0));
          col = mix(col, cc, smoothstep(0.6,0.9,fbm(p*6.0+seed*2.0)));
        } else {
          float h = fbm(p*3.5+seed);
          col = mix(a, b, smoothstep(0.35,0.65,h));
          col = mix(col, cc, smoothstep(0.62,0.7,h));
          float clouds = smoothstep(0.55,0.8,fbm(p*6.0-seed));
          col = mix(col, vec3(0.9), clouds*0.6);
        }
        float diff = dot(normalize(vN), normalize(sunDir));
        float lit = smoothstep(-0.15, 0.6, diff);
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(0.0, dot(normalize(vN), V)), 3.0);
        vec3 outc = col * (0.02 + lit*1.15) + atmo * rim * (0.15 + 1.2*smoothstep(-0.3,0.4,diff));
        if (lights > 0.5) {
          float city = smoothstep(0.72,0.8,fbm(p*28.0+seed)) * (1.0-smoothstep(-0.2,0.05,diff));
          outc += vec3(1.0,0.75,0.35) * city * 1.4;
        }
        gl_FragColor = vec4(outc, 1.0);
      }`,
  });
}

function atmoMaterial(color, sunDir) {
  return new THREE.ShaderMaterial({
    fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    uniforms: { color: { value: new THREE.Color(color) }, sunDir: { value: sunDir.clone() } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 color, sunDir; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 V = normalize(cameraPosition - vW); float f = pow(max(0.0, 1.0 - abs(dot(normalize(vN), V))*1.0), 1.4);
        float lit = 0.25 + smoothstep(-0.4,0.5, dot(-normalize(vN), normalize(sunDir)));
        float edge = smoothstep(0.0, 0.35, 1.0 - abs(dot(normalize(vN), V)));
        gl_FragColor = vec4(color * f * lit * 1.6, f*edge); }`,
  });
}

function ringMaterial(c1, c2, sunDir) {
  return new THREE.ShaderMaterial({
    fog: false, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    uniforms: { c1: { value: new THREE.Color(c1) }, c2: { value: new THREE.Color(c2) }, sunDir: { value: sunDir.clone() } },
    vertexShader: `varying vec2 vUv; varying vec3 vL; void main(){ vUv = uv; vL = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE + `uniform vec3 c1, c2, sunDir; varying vec3 vL;
      void main(){ float r = length(vL.xy); float t = (r - 1.0) / 1.0;
        float bands = 0.5+0.5*sin(t*90.0 + noise(vec3(t*40.0,0.0,0.0))*6.0);
        float gaps = smoothstep(0.05,0.12, abs(t-0.38)) * smoothstep(0.02,0.06, abs(t-0.7));
        float a = bands * gaps * smoothstep(0.0,0.06,t) * smoothstep(1.0,0.85,t) * 0.85;
        vec3 col = mix(c1, c2, noise(vec3(t*25.0,1.0,2.0)));
        gl_FragColor = vec4(col*1.1, a); }`,
  });
}

export class Sky {
  constructor(scene, seed) {
    const r = mulberry32(seed * 7 + 3);
    this.group = new THREE.Group();
    scene.add(this.group);

    const palettes = [
      [0x2b4cff, 0xff3f9a, 0x6af0ff],
      [0x7a2bff, 0xff8a3d, 0x3dfff0],
      [0x0fb5ff, 0x9b2bff, 0xffd36b],
      [0xff3b5c, 0x3b62ff, 0xb3ffea],
    ];
    const pal = palettes[Math.floor(r() * palettes.length)];
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 32), skyMaterial(...pal));
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    // stars
    const N = 6000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const d = 8000;
      pos[i * 3] = Math.cos(th) * s * d; pos[i * 3 + 1] = u * d; pos[i * 3 + 2] = Math.sin(th) * s * d;
      const b = Math.pow(r(), 3) * 2.2 + 0.25, tint = r();
      col[i * 3] = b * (tint < 0.2 ? 1.0 : 0.85); col[i * 3 + 1] = b * 0.9; col[i * 3 + 2] = b * (tint > 0.7 ? 1.2 : 0.95);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
    this.group.add(this.stars);

    // The star (sun): ahead and to one side, low on the horizon.
    const sunYaw = (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), sunPitch = 0.08 + r() * 0.18;
    this.sunDir = new THREE.Vector3(Math.sin(sunYaw) * Math.cos(sunPitch), Math.sin(sunPitch), Math.cos(sunYaw) * Math.cos(sunPitch)).normalize();
    const sunColor = new THREE.Color().setHSL(0.06 + r() * 0.08, 0.9, 0.62);
    const sunCore = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), new THREE.MeshBasicMaterial({ color: sunColor.clone().multiplyScalar(6), fog: false }));
    sunCore.position.copy(this.sunDir).multiplyScalar(7600);
    this.group.add(sunCore);
    const glowTex = makeGlow();
    for (const [size, op] of [[2600, 0.9], [6400, 0.35]]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: sunColor.clone().multiplyScalar(op * 2.2), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      sp.scale.setScalar(size); sp.position.copy(sunCore.position);
      this.group.add(sp);
    }
    this.sunColor = sunColor;

    // Planets: a giant ringed world dominating one side, a terrestrial world with night lights, and a moon.
    this.planets = [];
    const sides = r() < 0.5 ? [-1, 1] : [1, -1];
    const giantPal = [
      [0xd9a066, 0x8a4f2e, 0xf3dfb8, 0xffc48a], [0x6f9bd6, 0x2c3f7a, 0xd7ecff, 0x8fd2ff],
      [0xc77dd6, 0x4a2a6e, 0xf4d9ff, 0xff9af0], [0x7fd6b7, 0x245f57, 0xe2fff2, 0x9effe2],
    ][Math.floor(r() * 4)];
    this.addPlanet({ yaw: sides[0] * (0.35 + r() * 0.35), pitch: 0.12 + r() * 0.2, dist: 6200, radius: 1700, bands: 7 + r() * 5,
      a: giantPal[0], b: giantPal[1], c: giantPal[2], atmo: giantPal[3], ring: true, tilt: 0.35 + r() * 0.4, seed: r() * 10 });
    const terraPal = [[0x1f5aa6, 0x3f8a3a, 0xc9b98a, 0x6fb6ff], [0x8a3020, 0xc2672e, 0xf2d08a, 0xff9a6a], [0x2a7a8a, 0xd8f0ff, 0x9fb0b8, 0x9fe8ff]][Math.floor(r() * 3)];
    this.addPlanet({ yaw: sides[1] * (0.25 + r() * 0.4), pitch: -0.05 + r() * 0.2, dist: 5200, radius: 700, bands: 0,
      a: terraPal[0], b: terraPal[1], c: terraPal[2], atmo: terraPal[3], cityLights: true, seed: r() * 10 });
    this.addPlanet({ yaw: sides[0] * (0.05 + r() * 0.2), pitch: 0.28 + r() * 0.15, dist: 5600, radius: 180, bands: 0,
      a: 0x6c6a68, b: 0x9a9690, c: 0xc8c4bc, atmo: 0x404448, seed: r() * 10 });
    // a far planet behind, visible when looking back or through side windows on turns
    this.addPlanet({ yaw: Math.PI + (r() - 0.5), pitch: 0.1, dist: 6000, radius: 900, bands: 5, a: 0x6a3f8a, b: 0x2a1840, c: 0xb58ad6, atmo: 0xb58ad6, seed: r() * 10 });
  }

  addPlanet(o) {
    const dir = new THREE.Vector3(Math.sin(o.yaw) * Math.cos(o.pitch), Math.sin(o.pitch), Math.cos(o.yaw) * Math.cos(o.pitch));
    const pos = dir.multiplyScalar(o.dist);
    const g = new THREE.Group();
    g.position.copy(pos);
    const toSun = this.sunDir.clone().multiplyScalar(7600).sub(pos).normalize();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(o.radius, 96, 64), planetMaterial({ ...o, sunDir: toSun }));
    mesh.rotation.z = o.tilt ? o.tilt * 0.4 : 0;
    g.add(mesh);
    const at = new THREE.Mesh(new THREE.SphereGeometry(o.radius * 1.045, 64, 48), atmoMaterial(o.atmo, toSun));
    g.add(at);
    if (o.ring) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(o.radius * 1.35, o.radius * 2.6, 160, 1), ringMaterial(o.a, o.c, toSun));
      // RingGeometry spans radius r..R; the shader expects 1..2 in units of the inner radius.
      ring.geometry.scale(1 / (o.radius * 1.35), 1 / (o.radius * 1.35), 1);
      ring.scale.setScalar(o.radius * 1.35);
      ring.rotation.x = Math.PI / 2 - o.tilt;
      ring.rotation.y = 0.3;
      g.add(ring);
    }
    this.group.add(g);
    this.planets.push({ g, mesh });
  }

  update(camera, dt) {
    this.group.position.copy(camera.position);
    for (const p of this.planets) p.mesh.rotation.y += dt * 0.004;
  }
}

function makeGlow() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.12, 'rgba(255,255,255,0.6)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.14)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Space dust: points that wrap around the camera, so there is always dust drifting past.
export class Dust {
  constructor(scene) {
    const N = 2400, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    const r = mulberry32(5);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = r() * 140; pos[i * 3 + 1] = r() * 70; pos[i * 3 + 2] = r() * 220;
      seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { cam: { value: new THREE.Vector3() }, box: { value: new THREE.Vector3(140, 70, 220) }, time: { value: 0 }, speed: { value: 0 }, tint: { value: new THREE.Color(0.75, 0.85, 1.0) } },
      vertexShader: `uniform vec3 cam, box; uniform float time, speed; attribute float seed; varying float vA;
        void main(){
          vec3 p = position + vec3(sin(time*0.3+seed*40.0)*2.0, cos(time*0.21+seed*17.0)*1.5, 0.0);
          p = mod(p - cam + box*0.5, box) - box*0.5 + cam;
          vec4 mv = modelViewMatrix*vec4(p,1.0);
          float d = -mv.z;
          vA = smoothstep(110.0, 20.0, d) * smoothstep(0.5, 3.0, d) * (0.35 + seed*0.65);
          gl_PointSize = (1.2 + seed*2.2 + speed*0.012) * 130.0 / max(d, 1.0);
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: `uniform vec3 tint; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(tint * a * vA * 0.55, 1.0); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(camera, t, speed) {
    this.mat.uniforms.cam.value.copy(camera.position);
    this.mat.uniforms.time.value = t;
    this.mat.uniforms.speed.value = speed;
  }
}

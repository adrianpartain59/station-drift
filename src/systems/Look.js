import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// The look: black and one colour, picked afresh for every run, with haze in the air.
//
// Nothing here knows about the rules of the game, and nothing in the rules knows about this. It is two
// full-screen passes and a little scenery policy:
//  - HAZE (before the bloom): thick banks of haze round every ship, thin drifting banks along the road and
//    a faint fog everywhere, worked out per pixel from the depth buffer, so it sits in the world properly
//    (it swallows the foot of a ship, the road runs into it). It never starts closer than CLEAR metres from
//    the camera, and the banks are thinned on the way into a ship, so the track stays readable.
//  - GRADE (last): every pixel's brightness is mapped onto one ramp, black to a deep shade to the colour to
//    nearly white. That is what keeps the detail: a flat two-ink duotone would lose the lane lines.
//    Then scanlines, grain and a vignette.
// `?look=classic` turns all of it off and the game looks exactly as it did; `?look=<name>` holds one colour.

export const LOOK = {
  CLEAR: 26,              // no haze nearer the camera than this, metres
  FOG: 1 / 15000,         // the thin fog everywhere: density per metre...
  FOG_CAP: 1500,          // ...and the distance beyond which it stops building up (the sky gets this much)
  HAZE: [0.105, 0.12, 0.135],  // the haze's own light, before the grade (linear; only its brightness matters)
  GLOW: 2.6,              // how much brighter the heart of a ship's bank is (lit by the ship)
  SHIP: 0.0062,           // density at the heart of the bank round a ship, per metre
  FLANK: 0.012,           // the two thicker banks either side of a ship's mouth
  INSIDE: 0.04,           // how much of a ship's haze is left once you are inside it
  THIN: [230, 30],        // it thins from this far before the mouth to this far before it, so the way in is clear
  BANK: [0.0017, 0.0028], // density of a drifting bank along the road, for one 100 m across (a bigger one is thinner:
                          // looking straight through the heart of any of them, at least half of what is behind shows)
  BANK_EVERY: 420,        // one place a bank may be per this many metres of road
  AHEAD: 2600,            // banks and ships further ahead than this are not drawn yet (they fade in)
  LIGHT: [0.24, 0.62, 0.86, 0.975],   // the ramp: how light the deep shade, the colour, the bright and the hot end are
  STOPS: [0.27, 0.58, 0.82],          // ...and the brightness at which a pixel gets each of the first three
  GAMMA: 1.18,            // above 1 the middle shades sink toward black (darker, more contrast)
  AMBIENT: 0.5,           // how much of the soft fill light is kept: the plating goes dark, the lights stay
  INDOORS: [0.58, 0.7],   // inside a ship: exposure and bloom, as a share of what they are outside
  SCAN: 0.085,            // scanlines
  GRAIN: 0.05,
  VIGNETTE: 0.42,
  STARS: 0.22,            // how much of the old sky's clutter is kept: stars,
  NEBULA: 0.16,           // nebula (it reads as far haze now),
  ROCKS: 0.45,            // asteroids beside the road,
  DUST: 0.06,             // and dust near the camera
  PLANET: [0.1, 0.2],     // planets: how bright the lit face and the rim are (silhouettes with a rim)
  SUN: 0.1, 
  STREAKS: 0.4,           // the speed streaks round the edge of the view
};

// The colours a run can get. `h` is the hue angle and `c` the colourfulness (OKLCH), so every colour gets
// the same ramp of lightness and none comes out muddy. NOIR is the odd one: no colour, and red things
// (the tail lights, lasers) stay red, as on the Noir Tape concept.
export const LOOKS = [
  { id: 'toxic', name: 'TOXIC', h: 142, c: 0.15 },
  { id: 'noir', name: 'NOIR', h: 0, c: 0, accent: [22, 0.19], grain: 1.5 },
  { id: 'blood', name: 'BLOOD', h: 22, c: 0.19 },
  { id: 'violet', name: 'VIOLET', h: 300, c: 0.17 },
  { id: 'ice', name: 'ICE', h: 236, c: 0.12 },
  { id: 'teal', name: 'TEAL', h: 192, c: 0.11 },
  { id: 'ember', name: 'EMBER', h: 52, c: 0.16 },
  { id: 'rose', name: 'ROSE', h: 352, c: 0.19 },
  { id: 'amber', name: 'AMBER', h: 86, c: 0.14 },
  { id: 'acid', name: 'ACID', h: 118, c: 0.17 },
];

// ---------- colour ----------
const gam = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
function oklab(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
/** A colour of lightness L (0..1), colourfulness C and hue h, as sRGB 0..1, pulled in until a screen can show it. */
function oklch(L, C, h) {
  for (let k = 0; k < 24; k++) {
    const rgb = oklab(L, C, h);
    if (rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) return rgb.map((v) => gam(Math.min(1, Math.max(0, v))));
    C *= 0.9;
  }
  return oklab(L, 0, h).map((v) => gam(Math.min(1, Math.max(0, v))));
}
/** The ramp for a hue: [deep shade, the colour, bright, nearly white]. */
const ramp = (h, c) => [oklch(LOOK.LIGHT[0], c * 0.5, h), oklch(LOOK.LIGHT[1], c, h), oklch(LOOK.LIGHT[2], c * 0.82, h), oklch(LOOK.LIGHT[3], c * 0.22, h)];
const css = (rgb) => '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

// ---------- haze ----------
const NV = 12;

function noiseTexture() {
  const N = 32, r = (() => { let s = 20231; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  let a = new Float32Array(N * N * N).map(() => r());
  const at = (x, y, z) => a[((x + N) % N) + ((y + N) % N) * N + ((z + N) % N) * N * N];
  const b = new Float32Array(a.length);          // one soft blur, wrapping, so the billows are round and it tiles
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    b[x + y * N + z * N * N] = (at(x, y, z) * 2 + at(x - 1, y, z) + at(x + 1, y, z) + at(x, y - 1, z) + at(x, y + 1, z) + at(x, y, z - 1) + at(x, y, z + 1)) / 8;
  }
  let lo = 1, hi = 0;
  for (const v of b) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const data = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) data[i] = Math.round(((b[i] - lo) / (hi - lo)) * 255);
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

class HazePass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null }, tNoise: { value: noiseTexture() },
        near: { value: 0.1 }, far: { value: 1000 }, projInv: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() },
        vPos: { value: Array.from({ length: NV }, () => new THREE.Vector4()) },      // centre from the camera, density
        vInv: { value: Array.from({ length: NV }, () => new THREE.Vector4()) },      // 1 / radii, glow
        haze: { value: new THREE.Vector3(...LOOK.HAZE) }, fog: { value: LOOK.FOG }, fogCap: { value: LOOK.FOG_CAP },
        clearD: { value: LOOK.CLEAR }, glow: { value: LOOK.GLOW }, drift: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */`
        uniform mat4 projInv, camWorld; varying vec2 vUv; varying vec3 vRay;
        void main(){
          vUv = uv;
          vec4 p = projInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
          vec3 v = p.xyz / p.w;
          vRay = (camWorld * vec4(v / -v.z, 0.0)).xyz;      // world direction, one unit of view depth long
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        #include <packing>
        #define NV ${NV}
        uniform sampler2D tDiffuse, tDepth; uniform highp sampler3D tNoise;
        uniform float near, far, fog, fogCap, clearD, glow; uniform vec3 haze, drift;
        uniform vec4 vPos[NV]; uniform vec4 vInv[NV];
        varying vec2 vUv; varying vec3 vRay;
        void main(){
          vec4 src = texture2D(tDiffuse, vUv);
          float d = texture2D(tDepth, vUv).x;
          float rl = length(vRay);
          vec3 rd = vRay / rl;
          float dist = d >= 0.999999 ? 1.0e6 : -perspectiveDepthToViewZ(d, near, far) * rl;
          // the thin fog everywhere
          float tau = fog * clamp(dist - clearD, 0.0, fogCap);
          float lit = 0.0;
          // the banks: each a soft ball of haze, densest at its heart. The amount of haze the ray crosses is
          // worked out exactly (no marching), measured from the point where the ray passes nearest the heart.
          for (int i = 0; i < NV; i++) {
            float dens = vPos[i].w;
            if (dens <= 0.0) continue;
            vec3 o = -vPos[i].xyz * vInv[i].xyz, dd = rd * vInv[i].xyz;
            float a = dot(dd, dd), b = dot(o, dd);
            float tm = -b / a;
            float q2 = dot(o, o) - b * b / a;                 // how far from the heart the ray passes, squared (1 = the edge)
            if (q2 >= 1.0) continue;
            float half_ = sqrt((1.0 - q2) / a);
            float u0 = max(tm - half_, clearD) - tm, u1 = min(tm + half_, dist) - tm;
            if (u1 <= u0) continue;
            float I = (1.0 - q2) * (u1 - u0) - a * (u1 * u1 * u1 - u0 * u0 * u0) / 3.0;
            vec3 p = (o + dd * clamp(tm, u0 + tm, u1 + tm)) / vInv[i].xyz + float(i) * 37.0;   // metres from the heart
            float n = texture(tNoise, p * 0.0011 + drift).r * 0.62 + texture(tNoise, p * 0.0031 - drift * 1.7).r * 0.38;
            float t = dens * max(I, 0.0) * (0.12 + 1.76 * smoothstep(0.22, 0.78, n));
            tau += t;
            lit += t * vInv[i].w * (1.0 - q2);
          }
          float T = exp(-tau);
          vec3 light = haze * (1.0 + glow * lit / max(tau, 1.0e-4));
          gl_FragColor = vec4(src.rgb * T + light * (1.0 - T), src.a);
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms, cam = this.camera;
    u.tDiffuse.value = readBuffer.texture; u.tDepth.value = readBuffer.depthTexture;
    u.near.value = cam.near; u.far.value = cam.far;
    u.projInv.value.copy(cam.projectionMatrixInverse); u.camWorld.value.copy(cam.matrixWorld);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }

  dispose() { this.material.uniforms.tNoise.value.dispose(); this.material.dispose(); this.fsQuad.dispose(); }
}

// ---------- grade ----------
class GradePass extends Pass {
  constructor() {
    super();
    const v3 = () => ({ value: new THREE.Vector3() });
    this.material = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: null }, c0: v3(), c1: v3(), c2: v3(), c3: v3(), a1: v3(), a2: v3(), accent: { value: 0 }, stops: { value: new THREE.Vector3(...LOOK.STOPS) },
        time: { value: 0 }, gamma: { value: LOOK.GAMMA }, scan: { value: LOOK.SCAN }, grain: { value: LOOK.GRAIN }, vignette: { value: LOOK.VIGNETTE },
      },
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec3 c0, c1, c2, c3, a1, a2, stops;
        uniform float accent, time, gamma, scan, grain, vignette; varying vec2 vUv;
        float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        float seg(float a, float b, float v){ return clamp((v - a) / (b - a), 0.0, 1.0); }
        // black, a deep shade, the colour, bright, nearly white
        vec3 ramp(float v, vec3 k0, vec3 k1, vec3 k2, vec3 k3){
          vec3 c = mix(vec3(0.0), k0, seg(0.0, stops.x, v));
          c = mix(c, k1, seg(stops.x, stops.y, v));
          c = mix(c, k2, seg(stops.y, stops.z, v));
          return mix(c, k3, seg(stops.z, 1.0, v));
        }
        void main(){
          vec3 s = texture2D(tDiffuse, vUv).rgb;
          float mx = max(s.r, max(s.g, s.b));
          // brightness, leaning on the strongest channel so a pure blue or red light is as bright as a white one
          float v = mix(dot(s, vec3(0.2126, 0.7152, 0.0722)), mx, 0.62);
          v = pow(clamp((v - 0.012) * 1.1, 0.0, 1.0), gamma);
          vec2 q = vUv - 0.5;
          v *= 1.0 - vignette * smoothstep(0.32, 0.86, length(q * vec2(1.0, 0.92)));
          v *= 1.0 - scan * (0.5 - 0.5 * cos(gl_FragCoord.y * 1.5708));                       // a line every 4 pixels
          v = clamp(v + (hash(gl_FragCoord.xy + fract(time) * 517.0) - 0.5) * grain * (0.35 + 0.65 * (1.0 - v)), 0.0, 1.0);
          vec3 c = ramp(v, c0, c1, c2, c3);
          if (accent > 0.0) {
            // red things keep their red (NOIR): the tail lights and their trails, lasers
            float red = (1.0 - smoothstep(0.3, 0.52, max(s.g, s.b) / max(s.r, 1.0e-3))) * smoothstep(0.1, 0.3, s.r);
            c = mix(c, ramp(clamp(v * 1.25, 0.0, 1.0), a1 * 0.45, a1, a2, c3), red * accent);
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }

  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

// ---------- the look ----------
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export class Look {
  /** `want`: undefined or 'random' for a new colour each run, a name from LOOKS to hold one, 'classic' for the old look. */
  constructor(camera, want) {
    this.want = LOOKS.find((l) => l.id === want) ? want : want === 'classic' ? 'classic' : 'random';
    this.on = this.want !== 'classic';
    this.haze = new HazePass(camera);
    this.grade = new GradePass();
    this.haze.enabled = this.grade.enabled = this.on;
    this.current = null;
    this.vols = [];
    this.cfg = LOOK;            // for tuning by hand from the console: __game.look.cfg
    this.tmp = {};
    if (this.on) this.pick();
  }

  /** Choose the colour for the next run: never the one just played. */
  pick(id) {
    if (!this.on) return null;
    let next = LOOKS.find((l) => l.id === (id || this.want));
    while (!next || (!id && this.want === 'random' && next === this.current)) next = LOOKS[Math.floor(Math.random() * LOOKS.length)];
    this.current = next;
    const [k0, k1, k2, k3] = ramp(next.h, next.c), u = this.grade.material.uniforms;
    u.c0.value.set(...k0); u.c1.value.set(...k1); u.c2.value.set(...k2); u.c3.value.set(...k3);
    u.accent.value = next.accent ? 1 : 0; u.stops.value.set(...LOOK.STOPS);
    if (next.accent) { const a = ramp(...next.accent); u.a1.value.set(...a[1]); u.a2.value.set(...a[2]); }
    u.grain.value = LOOK.GRAIN * (next.grain || 1);
    this.paintHud([k0, k1, k2, k3], next.accent ? ramp(...next.accent) : null);
    return next;
  }

  /** The HUD and the menus are HTML: they take the ramp through CSS variables (index.html, `body.look`). */
  paintHud(k, accent) {
    const st = document.body.style;
    document.body.classList.add('look');
    k.forEach((c, i) => st.setProperty('--lk' + i, css(c)));
    st.setProperty('--lkg', `rgba(${k[1].map((v) => Math.round(v * 255)).join(',')},0.6)`);
    st.setProperty('--lka', css(accent ? accent[2] : k[3]));
    this.k = k; this.accent = accent; this.toned = new Map();
  }

  /**
   * Any colour the game hands the HUD (a tier's colour, a warning's red), as the run's colour: bright, nearly
   * white if it was nearly white, and the warning colour if it was red. The transparency is kept.
   */
  tone(color) {
    if (!this.on) return color;
    let out = this.toned.get(color);
    if (out) return out;
    const m = /^#([0-9a-f]{3,8})$/i.exec(color) || /^rgba?\(([^)]+)\)$/i.exec(color);
    if (!m) return color;
    let r, g, b, a = 1;
    if (color[0] === '#') {
      const h = m[1].length < 6 ? [...m[1]].map((c) => c + c).join('') : m[1];
      [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    } else { const v = m[1].split(',').map(Number); [r, g, b] = v.map((x) => x / 255); a = v[3] ?? 1; }
    const mx = Math.max(r, g, b), val = 0.38 * (0.2126 * r + 0.7152 * g + 0.0722 * b) + 0.62 * mx;
    const red = r > 0.5 && Math.max(g, b) / r < 0.5;
    // a warning is the hot end of the ramp (or NOIR's red); a see-through wash over the screen stays in the colour
    const c = red ? (this.accent ? this.accent[2] : a < 1 ? this.k[2] : this.k[3]) : val > 0.93 ? this.k[3] : this.k[2];
    out = `rgba(${c.map((v) => Math.round(v * 255)).join(',')},${a})`;
    this.toned.set(color, out);
    return out;
  }

  /**
   * Where the haze is, this frame: the banks round the ships in range, and the drifting banks along the road.
   * `s` is how far along the track the ship is.
   */
  update(time, camera, track, s) {
    if (!this.on) return;
    this.grade.material.uniforms.time.value = time;
    const hu = this.haze.material.uniforms, gu = this.grade.material.uniforms;
    hu.drift.value.set(time * 0.006, time * 0.002, time * 0.004);
    hu.fog.value = LOOK.FOG; hu.fogCap.value = LOOK.FOG_CAP; hu.clearD.value = LOOK.CLEAR; hu.glow.value = LOOK.GLOW; hu.haze.value.set(...LOOK.HAZE);
    gu.gamma.value = LOOK.GAMMA; gu.scan.value = LOOK.SCAN; gu.vignette.value = LOOK.VIGNETTE; gu.grain.value = LOOK.GRAIN * (this.current.grain || 1);
    const V = this.vols; V.length = 0;
    const add = (x, y, z, rx, ry, rz, dens, glow, at) => {
      const w = smooth(-700, -350, at - s) * (1 - smooth(LOOK.AHEAD - 500, LOOK.AHEAD, at - s));     // fades in ahead, out behind
      if (w * dens > 1e-6) V.push([x, y, z, rx, ry, rz, dens * w, glow, Math.abs(at - s)]);
    };
    for (const S of track.sections) {
      if (S.type !== 'station' || S.s1 < s - 800) continue;
      if (S.s0 > s + LOOK.AHEAD) break;
      // thin on the way in, so the corridor inside is clear; back again once you are out
      const inside = smooth(S.s0 - LOOK.THIN[0], S.s0 - LOOK.THIN[1], s) * (1 - smooth(S.s1 - 20, S.s1 + 140, s));
      const k = 1 - (1 - LOOK.INSIDE) * inside;
      const hu = S.hull;
      if (hu) {
        const cx = hu.x0 + (hu.uMin + hu.uMax) / 2, half = (hu.uMax - hu.uMin) / 2, L = hu.z1 - hu.z0;
        // the ship stands in one great bank; a thicker one hugs each side of the mouth (the foot of the hull is
        // lost in it), one rises over the stern, and one trails off the bow
        add(cx, hu.y + 8, (hu.z0 + hu.z1) / 2, half + 200, 140, L / 2 + 240, LOOK.SHIP * k, 1, (S.s0 + S.s1) / 2);
        for (const side of [-1, 1]) add(hu.x0 + side * (hu.w0 + 104), hu.y - 4, hu.z0 - 24, 124, 62, 156, LOOK.FLANK * k, 1, S.s0);
        add(cx, hu.y + 84, hu.z0 + 70, half + 130, 112, 210, LOOK.SHIP * 0.8 * k, 1, S.s0);
        add(cx, hu.y - 6, hu.z1 + 50, half + 110, 64, 170, LOOK.SHIP * k, 0.8, S.s1);
      } else {
        // the classic map's stations have no hull to wrap: a bank at each mouth
        for (const at of [S.s0, S.s1 - 1]) {
          if (at >= track.len) continue;
          const f = track.sample(at, this.tmp);
          add(f.x, f.y + 4, f.z, 120, 52, 120, LOOK.SHIP * 0.9 * k, 1, at);
        }
      }
    }
    const E = LOOK.BANK_EVERY;
    for (let n = Math.max(0, Math.floor((s - 600) / E)); n * E < s + LOOK.AHEAD; n++) {
      const at = n * E + hash(n + 0.5) * E * 0.6;
      if (at >= track.len - 2 || track.ZONE[Math.floor(at)] !== 1) continue;
      const f = track.sample(at, this.tmp), w = track.W[Math.floor(at)];
      const off = (hash(n * 3 + 1) * 2 - 1) * (w + 40), size = 0.7 + hash(n * 5 + 2) * 0.9;
      add(f.x - Math.cos(f.h) * off, f.y - 5 + hash(n * 7 + 3) * 14, f.z + Math.sin(f.h) * off, 100 * size, 30 * size, 100 * size,
        (LOOK.BANK[0] + (LOOK.BANK[1] - LOOK.BANK[0]) * hash(n * 11 + 4)) / size, 0.9, at);
    }
    V.sort((a, b) => a[8] - b[8]);
    const u = this.haze.material.uniforms, c = camera.position;
    for (let i = 0; i < NV; i++) {
      const v = V[i];
      if (!v) { u.vPos.value[i].set(0, 0, 0, 0); continue; }
      u.vPos.value[i].set(v[0] - c.x, v[1] - c.y, v[2] - c.z, v[6]);
      u.vInv.value[i].set(1 / v[3], 1 / v[4], 1 / v[5], v[7]);
    }
  }
}

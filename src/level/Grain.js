import * as THREE from 'three';

// Grain: one texture that every lit surface in the game wears.
//
// Each surface used to have one shine value across its whole face and no relief at all, so a highlight slid over
// it as a single even sheen: the way moulded plastic catches light. This gives all of them the same two things at
// once, from one texture made here when the game loads:
//   relief   the surface is no longer flat: sheet metal that bows a little between its fixings, dents, pits and
//            scratches. Highlights wobble and break as they cross it.
//   shine    patches that are duller and patches that are more polished, so no highlight is even.
// It is not laid with each model's own texture coordinates (walls, the ship and the obstacles are all mapped at
// different sizes, and some have none): it is laid by where the surface is, in metres, along whichever axis the
// surface faces most. So it is the same size on everything, and it stays put on things that move.
//
// It goes on by one hook on the renderer's standard material, which is what every lit surface here is made of;
// nothing has to remember to ask for it. Glass and anything else see-through is left alone.
// Costs three reads of one small texture for each lit pixel. `?grain=off` is the game without it.

export const GRAIN = {
  TILE: 8,        // metres one repeat of the texture covers
  DEPTH: 0.014,   // relief: metres between the lowest and the highest point of the texture (at 0.03 every surface
                  // looks beaten with a hammer; at 0.006 it is only just there)
  SHINE: 0.2,     // how uneven the shine is: a surface's roughness swings this far either side of its own value
};

const SIZE = 512;
const shared = { grainMap: { value: null }, grainK: { value: new THREE.Vector3() } };

/** Smooth noise that repeats: `cells` lumps across the texture. */
function noise(cells, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const out = new Float32Array(SIZE * SIZE), ease = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < SIZE; y++) {
    const fy = (y / SIZE) * cells, y0 = Math.floor(fy), ty = ease(fy - y0), ya = (y0 % cells) * cells, yb = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < SIZE; x++) {
      const fx = (x / SIZE) * cells, x0 = Math.floor(fx), tx = ease(fx - x0), xa = x0 % cells, xb = (x0 + 1) % cells;
      const top = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * tx, bot = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * tx;
      out[y * SIZE + x] = top + (bot - top) * ty;
    }
  }
  return out;
}

/** The texture: red is height, green is how polished (above a half) or dull (below) the spot is. */
function texture() {
  const n = SIZE * SIZE, h = new Float32Array(n), g = new Float32Array(n);
  // height: a slow bow across the sheet (the widest lumps are 1.5 m), dents, and fine pitting
  for (const [cells, w, seed] of [[4, 0.46, 11], [12, 0.3, 23], [40, 0.17, 37], [150, 0.07, 53]]) { const a = noise(cells, seed); for (let i = 0; i < n; i++) h[i] += a[i] * w; }
  // shine: big smudges, smaller ones, and a fine speckle
  for (const [cells, w, seed] of [[3, 0.5, 71], [9, 0.32, 83], [48, 0.18, 97]]) { const a = noise(cells, seed); for (let i = 0; i < n; i++) g[i] += a[i] * w; }
  // scratches: short, in every direction, cut a little into the surface and polished along their length
  let s = 4242;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 150; k++) {
    const len = 10 + rnd() * 70, ang = rnd() * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang), deep = 0.04 + rnd() * 0.08;
    let x = rnd() * SIZE, y = rnd() * SIZE;
    for (let t = 0; t < len; t++, x += dx, y += dy) {
      const i = (((Math.floor(y) % SIZE) + SIZE) % SIZE) * SIZE + (((Math.floor(x) % SIZE) + SIZE) % SIZE);
      h[i] -= deep; g[i] += 0.18;
    }
  }
  const span = (a) => { let lo = Infinity, hi = -Infinity; for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi - lo || 1]; };
  const [h0, hs] = span(h), [g0, gs] = span(g), px = new Uint8Array(n * 4);
  // the shine is moved so that its average is exactly a half: the grain makes a surface uneven, never shinier or
  // duller on the whole, so it does not change how bright the picture is
  let mean = 0;
  for (let i = 0; i < n; i++) mean += (g[i] - g0) / gs / n;
  for (let i = 0; i < n; i++) {
    px[i * 4] = ((h[i] - h0) / hs) * 255;
    px[i * 4 + 1] = Math.min(1, Math.max(0, (g[i] - g0) / gs - mean + 0.5)) * 255;
    px[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(px, SIZE, SIZE, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** After changing GRAIN: every surface follows at once (they share these numbers). */
export function setGrain() { shared.grainK.value.set(1 / GRAIN.TILE, GRAIN.DEPTH, GRAIN.SHINE); }

const VERT_HEAD = 'varying vec3 vGrainP;\nvarying vec3 vGrainN;\n';
const FRAG_HEAD = 'uniform sampler2D grainMap;\nuniform vec3 grainK;\nvarying vec3 vGrainP;\nvarying vec3 vGrainN;\n';
// Where the surface is in the texture, and how fast that changes across a pixel. Read once here, then once a
// pixel to the right and once a pixel down, which gives the slope of the relief.
const FRAG_READ = `
  vec3 gA = abs(vGrainN), gP = vGrainP * grainK.x, gPx = dFdx(gP), gPy = dFdy(gP);
  vec2 gUv, gDx, gDy;
  if (gA.x >= gA.y && gA.x >= gA.z) { gUv = gP.zy; gDx = gPx.zy; gDy = gPy.zy; }
  else if (gA.y >= gA.z) { gUv = gP.xz; gDx = gPx.xz; gDy = gPy.xz; }
  else { gUv = gP.xy; gDx = gPx.xy; gDy = gPy.xy; }
  vec4 gT = textureGrad(grainMap, gUv, gDx, gDy);
  vec2 gH = vec2(textureGrad(grainMap, gUv + gDx, gDx, gDy).r, textureGrad(grainMap, gUv + gDy, gDx, gDy).r) - gT.r;
`;
const FRAG_SHINE = '\n  roughnessFactor = clamp(roughnessFactor + (gT.g - 0.5) * 2.0 * grainK.z, 0.045, 1.0);\n';
// Tilt the surface by the relief's slope. The pixel's size on the surface is left in metres (not made a unit
// length, as the renderer's own bump mapping does), so the relief has a real height and looks the same near and far.
const FRAG_RELIEF = `
  {
    vec3 gSx = dFdx(-vViewPosition), gSy = dFdy(-vViewPosition);
    vec3 gR1 = cross(gSy, normal), gR2 = cross(normal, gSx);
    float gDet = dot(gSx, gR1) * faceDirection;
    normal = normalize(max(abs(gDet), 1.0e-12) * normal - sign(gDet) * (gH.x * gR1 + gH.y * gR2) * grainK.y);
  }
`;

function patch(shader) {
  if (this.transparent) return;
  shader.uniforms.grainMap = shared.grainMap; shader.uniforms.grainK = shared.grainK;
  shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGrainP = position; vGrainN = normal;');
  shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
    .replace('#include <roughnessmap_fragment>', FRAG_READ + '#include <roughnessmap_fragment>' + FRAG_SHINE)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + FRAG_RELIEF);
}

/** Put the grain on every lit surface: those made already and those made later. Call once, before the first frame. */
export function installGrain() {
  shared.grainMap.value = texture();
  setGrain();
  const P = THREE.MeshStandardMaterial.prototype;
  P.onBeforeCompile = patch;
  P.customProgramCacheKey = function () { return this.transparent ? 'plain' : 'grain'; };
}

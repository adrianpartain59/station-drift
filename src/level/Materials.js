import * as THREE from 'three';

// All shared materials and procedural canvas textures. Built once, reused by every chunk.

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function rnd(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function panelTexture() {
  const r = rnd(7);
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#2a2f3a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(r() * 8) * 64, y = Math.floor(r() * 8) * 64;
      const pw = 64 * (1 + Math.floor(r() * 3)), ph = 64 * (1 + Math.floor(r() * 2));
      const v = 36 + Math.floor(r() * 22);
      g.fillStyle = `rgb(${v},${v + 3},${v + 10})`;
      g.fillRect(x + 2, y + 2, pw - 4, ph - 4);
    }
    g.strokeStyle = '#11141b'; g.lineWidth = 3;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); }
    for (let i = 0; i <= 8; i += 2) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    g.fillStyle = '#5a6272';
    for (let i = 0; i < 160; i++) g.fillRect(Math.floor(r() * 64) * 8 + 3, Math.floor(r() * 64) * 8 + 3, 2, 2);
    // vents
    for (let i = 0; i < 5; i++) {
      const x = r() * 440, y = r() * 440;
      g.fillStyle = '#161a22'; g.fillRect(x, y, 60, 26);
      g.fillStyle = '#3c4352';
      for (let k = 0; k < 6; k++) g.fillRect(x + 4, y + 3 + k * 4, 52, 2);
    }
  });
}

function floorTexture() {
  const r = rnd(11);
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#1b1e26'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
      const v = 26 + Math.floor(r() * 10);
      g.fillStyle = `rgb(${v},${v + 2},${v + 7})`;
      g.fillRect(x + 1, y + 1, 14, 14);
    }
    g.strokeStyle = '#0c0e13'; g.lineWidth = 4;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); }
    // scuffed drift marks
    g.strokeStyle = 'rgba(8,8,10,0.55)'; g.lineWidth = 5;
    for (let i = 0; i < 6; i++) {
      g.beginPath(); const x = r() * w; g.moveTo(x, 0);
      g.bezierCurveTo(x + (r() - 0.5) * 200, h * 0.3, x + (r() - 0.5) * 200, h * 0.7, x + (r() - 0.5) * 120, h); g.stroke();
    }
  });
}

function floorGlowTexture() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.fillRect(126, 0, 4, 72); g.fillRect(126, 128, 4, 72); // centre dashes
    g.globalAlpha = 0.25; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
  });
}

function hullTexture() {
  const r = rnd(23);
  const map = canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#20242e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const v = 30 + Math.floor(r() * 26);
      g.fillStyle = `rgb(${v},${v + 2},${v + 8})`;
      g.fillRect(Math.floor(r() * 16) * 32, Math.floor(r() * 16) * 32, 32 * (1 + Math.floor(r() * 4)), 32 * (1 + Math.floor(r() * 2)));
    }
    g.strokeStyle = '#0d0f14'; g.lineWidth = 2;
    for (let i = 0; i <= 16; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); }
  });
  const emi = canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 16; row++) {
      if (r() < 0.45) continue;
      for (let col = 0; col < 32; col++) {
        if (r() < 0.55) continue;
        const warm = r() < 0.7;
        g.fillStyle = warm ? '#ffd9a0' : '#9fe8ff';
        g.fillRect(col * 16 + 4, row * 32 + 12, 8, 6);
      }
    }
  });
  return { map, emi };
}

function crateTexture() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#c4621d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#a24f15';
    for (let x = 8; x < w; x += 24) g.fillRect(x, 0, 10, h);
    g.strokeStyle = '#3a1d08'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#f2e6c9'; g.font = 'bold 34px monospace'; g.fillText('CRG-7', 70, 140);
    g.fillStyle = '#111';
    for (let i = 0; i < 8; i++) { g.save(); g.translate(i * 34, 220); g.rotate(-0.6); g.fillRect(0, 0, 14, 40); g.restore(); }
  });
}

function hazardTexture() {
  return canvas(256, 64, (g, w, h) => {
    g.fillStyle = '#ffcc1a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111';
    for (let x = -64; x < w + 64; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 20, 0); g.lineTo(x + 52, h); g.lineTo(x + 32, h); g.fill(); }
  });
}

function gridTexture() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
    g.globalAlpha = 0.35; g.lineWidth = 1;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
}

function barrierTexture() {
  return canvas(128, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,60,90,0.9)'); grad.addColorStop(0.5, 'rgba(255,40,70,0.35)'); grad.addColorStop(1, 'rgba(255,60,90,0.9)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,200,210,0.6)';
    for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1);
    g.strokeStyle = 'rgba(255,220,230,0.9)'; g.lineWidth = 3;
    for (let y = 16; y < h; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(w / 2, y + 20); g.lineTo(w, y); g.stroke(); }
  });
}

// The SKYWAY deck: dark plating, with lane lines and cross seams that glow. One repeat is the full
// width of the road across and 16 m along, so the lines converge as the road funnels into a ship.
function deckTextures() {
  const r = rnd(41);
  const map = canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#10141d'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 32) {
      const v = 15 + Math.floor(r() * 9);
      g.fillStyle = `rgb(${v},${v + 3},${v + 9})`;
      g.fillRect(x + 1, y + 1, 30, 62);
    }
    g.strokeStyle = '#06080d'; g.lineWidth = 3;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); }
    g.beginPath(); g.moveTo(0, 2); g.lineTo(w, 2); g.stroke();
  });
  const emi = canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    for (let i = 1; i < 8; i++) { g.globalAlpha = i === 4 ? 0 : 0.5; g.fillRect(i * 64 - 1, 0, 3, h); }   // lane lines, 8 m apart
    g.globalAlpha = 1; g.fillRect(253, 0, 6, h * 0.45);                                                    // centre dashes
    g.globalAlpha = 0.28; g.fillRect(0, 0, w, 5);                                                          // a seam every 16 m
    g.globalAlpha = 0.9; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);                            // the edges
  });
  return { map, emi };
}

// The soft rail along the SKYWAY deck: an energy field, brightest at the bottom.
function railTexture() {
  return canvas(64, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.4)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 2, h);
  });
}

function padTexture() {
  return canvas(128, 256, (g, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 12; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let y = 30; y < h; y += 70) { g.beginPath(); g.moveTo(16, y + 34); g.lineTo(w / 2, y); g.lineTo(w - 16, y + 34); g.stroke(); }
  });
}

function glowSprite(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const t = canvas(256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, inner); grad.addColorStop(0.18, 'rgba(255,255,255,0.55)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.12)'); grad.addColorStop(1, outer);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Neon signage: original brands and katakana, glowing on dark plates.
const SIGN_WORDS = [
  ['ドリフト', 'DRIFT CLUB'], ['宇宙', 'ZERO-G BAR'], ['夜', 'NIGHT RUN'], ['ラーメン', 'VOLT RAMEN'],
  ['エンジン', 'ENGINE PIT'], ['星', 'STARLIGHT'], ['ネオン', 'NEON 24H'], ['軌道', 'ORBIT LINE'],
  ['加速', 'BOOST LANE'], ['スピード', 'TOP SPEED'], ['月', 'MOON GATE'], ['ガレージ', 'GARAGE 9'],
];
const NEON = ['#37e6ff', '#ff3fb4', '#ffb23d', '#b06bff', '#7dff6b', '#ff4a4a', '#fff3c2'];

function signTexture(i, vertical) {
  const [jp, en] = SIGN_WORDS[i % SIGN_WORDS.length];
  const col = NEON[(i * 3) % NEON.length], col2 = NEON[(i * 5 + 2) % NEON.length];
  const W = vertical ? 256 : 640, H = vertical ? 640 : 256;
  const t = canvas(W, H, (g) => {
    g.fillStyle = 'rgba(6,6,12,0.92)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = col2; g.lineWidth = 6; g.shadowColor = col2; g.shadowBlur = 18; g.strokeRect(12, 12, W - 24, H - 24);
    g.shadowColor = col; g.shadowBlur = 26; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (vertical) {
      g.font = 'bold 132px "Hiragino Sans", "Noto Sans JP", sans-serif';
      const chars = [...jp];
      const step = Math.min(150, (H - 140) / chars.length);
      chars.forEach((c, k) => g.fillText(c, W / 2, 90 + k * step + step / 2 - 30));
      g.font = 'bold 30px "Orbitron", monospace'; g.fillStyle = col2; g.shadowColor = col2;
      g.fillText(en.split(' ')[0], W / 2, H - 50);
    } else {
      g.font = 'bold 110px "Hiragino Sans", "Noto Sans JP", sans-serif';
      g.fillText(jp, W / 2, H * 0.4);
      g.font = 'bold 54px "Orbitron", monospace'; g.fillStyle = col2; g.shadowColor = col2;
      g.fillText(en, W / 2, H * 0.78);
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function stationNameTexture(name, color) {
  const hex = '#' + new THREE.Color(color).getHexString();
  const t = canvas(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 120px "Orbitron", monospace';
    g.shadowColor = hex; g.shadowBlur = 30; g.fillStyle = hex;
    g.fillText(name, w / 2, h / 2 + 6);
    g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.85;
    g.fillText(name, w / 2, h / 2 + 6);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export class Materials {
  constructor() {
    const panel = panelTexture();
    const floor = floorTexture();
    const hull = hullTexture();
    this.textures = { panel, floor, hull };

    this.wall = new THREE.MeshStandardMaterial({ map: panel, metalness: 0.55, roughness: 0.48, color: 0xb9c0d0 });
    this.floor = new THREE.MeshStandardMaterial({ map: floor, metalness: 0.6, roughness: 0.42, color: 0x9aa2b4 });
    this.ceiling = new THREE.MeshStandardMaterial({ map: panel, metalness: 0.4, roughness: 0.6, color: 0x7e8596 });
    this.trim = new THREE.MeshStandardMaterial({ color: 0x3a404d, metalness: 0.8, roughness: 0.35 });
    this.hull = new THREE.MeshStandardMaterial({ map: hull.map, emissiveMap: hull.emi, emissive: 0xffffff, emissiveIntensity: 1.6, metalness: 0.6, roughness: 0.5, color: 0xa4abba });
    this.glass = new THREE.MeshStandardMaterial({ color: 0x8fd8ff, metalness: 0.9, roughness: 0.04, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    this.rock = new THREE.MeshStandardMaterial({ color: 0x6b625c, roughness: 0.92, metalness: 0.08, flatShading: true });
    this.crate = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.6, metalness: 0.3 });
    this.hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.5, metalness: 0.2, emissive: 0x332200 });
    this.door = new THREE.MeshStandardMaterial({ map: panel, color: 0x8b93a6, metalness: 0.75, roughness: 0.3 });
    this.barrier = new THREE.MeshBasicMaterial({ map: barrierTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(1.6, 0.6, 0.8) });
    this.laser = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.12, 0.25) }); // stays red; brighter tone-maps to white
    this.laserGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.05, 0.15), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lane = new THREE.MeshBasicMaterial({ map: gridTexture(), color: new THREE.Color(0.08, 0.35, 0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.coin = new THREE.MeshStandardMaterial({ color: 0xffe08a, metalness: 0.9, roughness: 0.18, emissive: 0xffb02e, emissiveIntensity: 0.7 });
    this.repair = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 3, 1.2) });
    this.pad = new THREE.MeshBasicMaterial({ map: padTexture(), color: new THREE.Color(0.4, 2.6, 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    // SKYWAY: the open-air deck, its rails, and the things that move on it
    const deck = deckTextures();
    this.deck = new THREE.MeshStandardMaterial({ map: deck.map, emissiveMap: deck.emi, emissive: new THREE.Color(0x37e6ff), emissiveIntensity: 1.25, metalness: 0.35, roughness: 0.66, color: 0xaab2c6 });
    this.rail = new THREE.MeshBasicMaterial({ map: railTexture(), color: new THREE.Color(0.2, 0.95, 1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.railWarm = new THREE.MeshBasicMaterial({ map: this.rail.map, color: new THREE.Color(1.5, 0.3, 0.95), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    // a ship's hull is seen from a kilometre away and usually against the light, so it takes no fog and
    // answers the sky's fill light more than the station plating does
    this.shipHull = new THREE.MeshStandardMaterial({ map: hull.map, emissiveMap: hull.emi, emissive: 0xffffff, emissiveIntensity: 2.4, metalness: 0.2, roughness: 0.72, color: 0xc4cbdb, fog: false });
    this.shipTrim = new THREE.MeshStandardMaterial({ color: 0x4a5162, metalness: 0.5, roughness: 0.5, fog: false });
    // the launch rail out of a ship: the boost pad's running chevrons, turned down (it is 170 m long)
    this.launch = new THREE.MeshBasicMaterial({ map: this.pad.map, color: new THREE.Color(0.14, 0.9, 1.15), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.floorGlow = floorGlowTexture();
    this.glowTex = glowSprite();

    this.neonCache = new Map();
    this.floorCache = new Map();
    this.signs = [];
    this.signsV = [];
    for (let i = 0; i < SIGN_WORDS.length; i++) {
      this.signs.push(new THREE.MeshBasicMaterial({ map: signTexture(i, false), color: new THREE.Color(1.7, 1.7, 1.7), transparent: true, side: THREE.DoubleSide }));
      this.signsV.push(new THREE.MeshBasicMaterial({ map: signTexture(i + 5, true), color: new THREE.Color(1.7, 1.7, 1.7), transparent: true, side: THREE.DoubleSide }));
    }
  }

  // HDR neon strip material (values above 1 feed the bloom).
  neon(hex, intensity = 3) {
    const key = hex + ':' + intensity;
    if (!this.neonCache.has(key)) {
      const c = new THREE.Color(hex).multiplyScalar(intensity);
      this.neonCache.set(key, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    }
    return this.neonCache.get(key);
  }

  neonOut(hex, intensity = 2) {
    const key = 'out:' + hex + ':' + intensity;
    if (!this.neonCache.has(key)) this.neonCache.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity) }));
    return this.neonCache.get(key);
  }

  // Lights on a ship's hull: like neonOut, but they carry through the fog.
  far(hex, intensity = 2) {
    const key = 'far:' + hex + ':' + intensity;
    if (!this.neonCache.has(key)) this.neonCache.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity), fog: false }));
    return this.neonCache.get(key);
  }

  // An engine plume: see-through, additive, one per colour.
  plume(hex) {
    const key = 'plume:' + hex;
    if (!this.neonCache.has(key)) this.neonCache.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(0.3), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    return this.neonCache.get(key);
  }

  floorFor(hex) {
    if (!this.floorCache.has(hex)) {
      const m = this.floor.clone();
      m.emissiveMap = this.floorGlow;
      m.emissive = new THREE.Color(hex);
      m.emissiveIntensity = 1.4;
      this.floorCache.set(hex, m);
    }
    return this.floorCache.get(hex);
  }
}

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { TRACK, SHIP, DRIFT, SCORE, CLOCK, CAMERA, RENDER } from './Constants.js';
import { GameState } from './GameState.js';
import { MODES } from './Modes.js';
import { MAPS, TEST, makeTrack, applyGame } from './Maps.js';
import { buildShipHull, disposeShipHull } from '../level/ShipHull.js';
import { Materials } from '../level/Materials.js';
import { WorldBuilder } from '../level/WorldBuilder.js';
import { Sky, Dust } from '../level/Sky.js';
import { Course } from '../gameplay/Course.js';
import { clockAfterGate } from '../gameplay/Pace.js';
import { CourseView } from '../gameplay/CourseView.js';
import { ShipPhysics } from '../gameplay/ShipPhysics.js';
import { ShipModel } from '../gameplay/ShipModel.js';
import { Autopilot } from '../gameplay/Autopilot.js';
import { CameraRig } from '../systems/CameraRig.js';
import { Sparks, Trail, Skid, SpeedLines } from '../systems/Effects.js';
import { Audio } from '../systems/Audio.js';
import { Input } from '../systems/Input.js';
import { HUD } from '../ui/HUD.js';
import { Look, LOOK } from '../systems/Look.js';
import { Lighting, LIGHTS } from '../systems/Lighting.js';

const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hexOf = (c) => '#' + c.toString(16).padStart(6, '0');
const BASE_GLOW = new THREE.Color(0x37e6ff);
const TIER_COLORS = [BASE_GLOW, ...DRIFT.TIERS.map((t) => new THREE.Color(t.color))];
const TAIL_RED = new THREE.Color(1, 0.12, 0.16);
const IDLE = { steer: 0, drift: false, brake: false };

export class Game {
  constructor(container) {
    this.container = container;
    this.input = new Input();
    this.audio = new Audio();
    this.audio.muted = GameState.muted || params.has('mute');
    this.hud = new HUD();
    this.pose = {};
    this.hitStop = 0; this.overTimer = 0; this.lastTick = 99;
    this.chunks = new Map();
    this.hulls = new Map();     // SKYWAY: the rigid hull of each ship in range, by section id
    this.bot = params.has('bot');
    this.tmpV = new THREE.Vector3(); this.tmpV2 = new THREE.Vector3(); this.tmpV3 = new THREE.Vector3();
    this.hudView = { speed: 0, drifting: false, charge: 0, tier: -1, points: 0, mult: 1, boost: 0, boostTier: 0, gateDist: null, gateFrac: 0 };
    this.hintT = 0;
  }

  init() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.MAX_DPR));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = RENDER.EXPOSURE;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(RENDER.FOG_COLOR, RENDER.FOG_NEAR, RENDER.FOG_FAR);
    this.camera = new THREE.PerspectiveCamera(CAMERA.FOV, window.innerWidth / window.innerHeight, CAMERA.NEAR, CAMERA.FAR);

    // The look (systems/Look.js): black and one colour, new each run, with haze in the air. ?look=classic is the old look.
    this.look = new Look(this.camera, params.get('look'));
    this.hud.tone = (c) => this.look.tone(c);
    // the haze is worked out from how far away each pixel is, so the composer's targets carry a depth texture
    const target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(window.innerWidth, window.innerHeight) });
    this.composer = new EffectComposer(r, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(this.look.haze);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), RENDER.BLOOM_STRENGTH, RENDER.BLOOM_RADIUS, RENDER.BLOOM_THRESHOLD);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.look.grade);
    this.applyQuality();

    this.hemi = new THREE.HemisphereLight(0x9ab8ff, 0x20141c, 1.1 * (this.look.on ? LOOK.AMBIENT : 1));
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.scene.add(this.sun); this.scene.add(this.sun.target);

    this.mats = new Materials();
    this.sparks = new Sparks(this.scene);
    this.trails = [new Trail(this.scene, 12, 0.05), new Trail(this.scene, 12, 0.05)];
    this.skids = [new Skid(this.scene), new Skid(this.scene)];
    this.speedLines = new SpeedLines(this.scene);
    this.dust = new Dust(this.scene, this.look.on ? LOOK.DUST : 1);
    this.ship = new ShipModel();
    this.scene.add(this.ship.group);
    // Headlights, and real light from the lamps nearest the ship (systems/Lighting.js). ?lights=off is the game
    // as it was lit before, for comparing pictures and frame times.
    this.lit = params.get('lights') !== 'off';
    if (this.lit) { this.lighting = new Lighting(this.scene, this.ship); this.lighting.setQuality(GameState.quality === 'high'); this.mats.glass.roughness = LIGHTS.GLASS; }

    window.addEventListener('resize', () => this.resize());
    document.getElementById('playBtn').addEventListener('click', () => this.start());
    document.getElementById('againBtn').addEventListener('click', () => this.start());
    document.getElementById('resumeBtn').addEventListener('click', () => this.togglePause());

    // Test hook: ?speed=2 runs everything twice as fast (core/Maps.js TEST). Not saved, and no best is kept.
    const speed = Number(params.get('speed'));
    if (speed >= 0.5 && speed <= 3 && speed !== 1) { TEST.speed = speed; GameState.test = true; }
    // Test hook: ?air=1.5 sets how many times the ships' speed the open air runs at on SKYWAY (1 = all one speed).
    const air = Number(params.get('air'));
    if (air >= 1 && air <= 3) { TEST.air = air; GameState.test = true; }
    // which game: HARD on SKYWAY, always. Test hooks: ?mode=easy and ?map=classic play the other two for this page
    // load; they are named next to the score and keep their own bests.
    GameState.setMode(params.get('mode'));
    GameState.setMap(params.get('map'));
    this.hud.setMode(applyGame(GameState.mode, GameState.map), MODES);
    this.hud.setMap(GameState.map, MAPS);
    if (TEST.speed !== 1) this.hud.testTag(`SPEED x${TEST.speed}`);
    if (TEST.air) this.hud.testTag(`OPEN AIR x${TEST.air}`);

    this.newRun(params.has('seed') ? Number(params.get('seed')) : (Math.random() * 1e9) | 0);
    GameState.phase = 'title';
    this.hud.phase('title');
    this.timer = new THREE.Timer();
    this.fixedDt = 0;
    r.setAnimationLoop(() => this.frame());
    // Debug: advance a fixed number of frames even when the tab is in the background.
    window.__step = (n = 60, dt = 1 / 60) => { this.fixedDt = dt; for (let i = 0; i < n; i++) this.frame(); this.fixedDt = 0; };
    if (params.has('autostart')) this.start();
  }

  applyQuality() {
    const high = GameState.quality === 'high';
    this.bloom.enabled = high;
    this.lighting?.setQuality(high);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? RENDER.MAX_DPR : 1));
    this.composer.setPixelRatio?.(Math.min(window.devicePixelRatio, high ? RENDER.MAX_DPR : 1));
  }

  // ---------- run lifecycle ----------
  newRun(seed) {
    this.seed = seed;
    for (const g of this.chunks.values()) { this.scene.remove(g); this.builder.disposeChunk(g); }
    this.chunks.clear();
    for (const g of this.hulls.values()) { this.scene.remove(g); disposeShipHull(g); }
    this.hulls.clear();
    this.view?.dispose();
    this.builder?.rockGeos.forEach((g) => g.dispose());
    this.scene.environment?.dispose();
    this.scene.environment = null;
    if (this.sky) {
      this.scene.remove(this.sky.group);
      this.sky.group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); });
    }

    this.track = makeTrack(GameState.map, seed);
    this.track.ensure(TRACK.VIEW_AHEAD + 400);
    this.course = new Course(this.track, seed);
    this.builder = new WorldBuilder(this.track, this.mats, this.look.on ? LOOK.ROCKS : 1, this.lit);
    this.view = new CourseView(this.scene, this.track, this.course, this.mats, this.builder.rockGeos);
    this.sky = new Sky(this.scene, seed, this.look.on ? LOOK : null);
    this.sun.position.copy(this.sky.sunDir).multiplyScalar(100);
    this.sun.color.copy(this.sky.sunColor).lerp(new THREE.Color(1, 1, 1), 0.5);

    // Reflections come from the actual sky, so metal and glass pick up the nebula and the star.
    const envScene = new THREE.Scene();
    const envSky = new Sky(envScene, seed);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.55 * (this.look.on ? LOOK.AMBIENT : 1);
    pmrem.dispose();
    envSky.group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); });

    this.phys = new ShipPhysics(this.track, (name, d) => this.onShip(name, d));
    this.pilot = new Autopilot(this.track, this.course, { horizon: 1.6, lanes: 7 });
    this.rig = new CameraRig(this.camera, this.track);
    this.rig.setMode(GameState.camMode);
    this.rig.blend = GameState.camMode === 'cockpit' ? 1 : 0;
    this.ship.setFirstPerson(GameState.camMode === 'cockpit');
    this.ship.group.visible = true;
    for (const t of this.trails) t.reset();
    for (const k of this.skids) k.reset();
    this.lastGateS = 0; this.zone = -1; this.ramp = 0; this.inSpiral = null;
    this.updateChunks(true);
    this.warmUp();
  }

  /**
   * Draw every material the run can show once, now, through the real render path. A material's shader is
   * compiled the first time it is drawn, and that used to cost a dropped frame or ten each time something
   * new came round a bend (a laser, a hauler, a ship's hull). Paid here instead, behind the title screen.
   */
  warmUp() {
    const mats = new Set();
    const add = (x) => { if (Array.isArray(x)) x.forEach(add); else if (x && x.isMaterial) mats.add(x); };
    const M = this.mats;
    Object.values(M).forEach(add);
    Object.values(this.view.mat).forEach(add);
    add([M.neon(0xffffff, 1), M.neonOut(0xffffff, 1), M.far(0xffffff, 1), M.plume(0xffffff), M.floorFor(0xffffff)]);
    // the name boards are made per station; these stand in for them (same shader, same blending, same depth rule)
    const board = (side) => new THREE.MeshBasicMaterial({ map: M.glowTex, transparent: true, depthWrite: false, side });
    const boards = [board(THREE.DoubleSide), board(THREE.FrontSide)];
    add(boards);
    // The GPU builds a pipeline per shader and per kind of mesh it is drawn with, so each material is drawn
    // both ways the game draws things: loose triangles (the world's swept strips) and an indexed mesh (boxes, planes).
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1e-3, 0, 0, 0, 1e-3, 0], 3));
    tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    const box = new THREE.BoxGeometry(1e-3, 1e-3, 1e-3);
    const grp = new THREE.Group();
    for (const m of mats) for (const geo of [tri, box]) { const k = new THREE.Mesh(geo, m); k.frustumCulled = false; grp.add(k); }
    this.camera.updateMatrixWorld();
    grp.position.copy(this.camera.position).add(this.tmpV.set(0, 0, -6).applyQuaternion(this.camera.quaternion));
    this.scene.add(grp);
    this.composer.render(); this.composer.render();     // twice: the composer alternates between two targets
    this.scene.remove(grp);
    tri.dispose(); box.dispose();
    for (const m of boards) m.dispose();
  }

  start() {
    this.audio.start();
    this.audio.setMuted(GameState.muted || params.has('mute'));
    this.audio.ui();
    GameState.reset();
    if (this.ran) this.look.pick();    // a new colour for every run; the first run keeps the one the title screen showed
    this.ran = true;
    this.newRun(params.has('seed') ? Number(params.get('seed')) : (Math.random() * 1e9) | 0);
    GameState.phase = 'playing';
    this.hud.phase('playing');
    this.hud.hint('');
    if (this.look.on) this.hud.note(this.look.current.name);
    this.overTimer = 0; this.hintT = 0; this.lastTick = 99;
    // Test hooks: ?jump=<metres> starts further down the track, ?cam=cockpit picks the view.
    if (params.has('jump')) {
      this.phys.s = Number(params.get('jump'));
      this.track.ensure(this.phys.s + TRACK.VIEW_AHEAD + 400);
      this.course.sync(); this.course.skipTo(this.phys.s);
      this.lastGateS = this.phys.s;
      this.updateChunks(true);
    }
    if (params.get('cam') === 'cockpit') { this.rig.setMode('cockpit'); this.rig.blend = 1; this.ship.setFirstPerson(true); }
    this.audio.whoosh();
  }

  /**
   * Switch between EASY and HARD. Only between runs: the course and the handling are built for one or the other.
   * Nothing in the page calls this or setMap since the game became HARD on SKYWAY only (2026-11-18); they are kept
   * so a picker can be put back by wiring a control to them.
   */
  setMode(name) {
    const g = GameState;
    if (!MODES[name] || name === g.mode || g.phase === 'playing' || g.phase === 'paused') return;
    g.setMode(name);
    this.hud.setMode(applyGame(name, g.map), MODES);
    this.audio.ui();
    if (g.phase === 'title') { this.newRun(this.seed); this.hud.phase('title'); }
  }

  /** Switch between the maps. Only between runs, like the mode: a run is built for one map. */
  setMap(name) {
    const g = GameState;
    if (!MAPS[name] || name === g.map || g.phase === 'playing' || g.phase === 'paused') return;
    g.setMap(name);
    applyGame(g.mode, name);
    this.hud.setMap(name, MAPS);
    this.audio.ui();
    if (g.phase === 'title') { this.newRun(this.seed); this.hud.phase('title'); }
  }

  togglePause() {
    const g = GameState;
    if (g.phase === 'playing') { g.phase = 'paused'; this.audio.ctx?.suspend(); }
    else if (g.phase === 'paused') { g.phase = 'playing'; this.audio.ctx?.resume(); }
    this.hud.phase(g.phase);
  }

  gameOver() {
    const g = GameState;
    g.phase = 'over';
    const newBest = g.score > g.best;
    g.bank += g.coins;
    g.persist();
    this.hud.hint('');
    // one line on what would have got further
    const km = Math.max(0.3, g.distance / 1000), perKm = g.drifts / km;
    const tip = perKm < 2 ? 'Every drift you bank adds time. Hold SPACE through each bend and let go on the way out.'
      : g.driftTime / Math.max(1, g.drifts) < 0.65 ? 'Start the slide earlier and ride the inside wall: FLARE and NOVA add twice the time.'
      : g.crashes > km ? 'The coins trace a safe line through every obstacle.'
      : 'Chain drifts without touching a wall and the score multiplier climbs.';
    this.hud.gameOver({ score: g.score, best: g.best, newBest, distance: g.distance, stations: g.stations, drifts: g.drifts, bestDrift: g.bestDrift, bestChain: Math.max(1, g.bestChain), coins: g.coins, driftTime: g.driftTime, tip });
    this.hud.phase('over');
  }

  get playing() { return GameState.phase === 'playing'; }
  /** Score multiplier from the chain of banked drifts. */
  get mult() { return 1 + Math.max(0, GameState.chain - 1) * SCORE.CHAIN_STEP; }

  // ---------- what the ship reports ----------
  onShip(name, d) {
    const g = GameState, hud = this.hud, au = this.audio;
    const live = this.playing;
    switch (name) {
      case 'driftStart':
        if (d.switched) { au.driftSwitch(); if (live) hud.pop('SWITCH', '#dff6ff'); } else au.driftStart();
        this.rig.shake(0.05);
        break;
      case 'tier': {
        au.tierUp(d.tier);
        this.rig.shake(0.08);
        this.sparks.burst(this.shipWorld(), 22, DRIFT.TIERS[d.tier].color, 11, 0.45, 0.45);
        break;
      }
      case 'driftEnd': {
        const tier = d.tier;
        if (tier >= 0) {
          au.driftBank(tier); au.boost(tier);
          this.rig.kick(0.5 + tier * 0.25); this.rig.shake(0.12 + tier * 0.07);
          const tail = this.tmpV3.copy(this.ship.tailPoint).applyMatrix4(this.ship.group.matrixWorld);
          this.sparks.burst(tail, 30 + tier * 16, DRIFT.TIERS[tier].color, 16, 0.5, 0.5);
        }
        if (!live) break;
        if (tier >= 0) {
          g.chain = g.time - g.lastDriftEnd < DRIFT.CHAIN_WINDOW ? Math.min(DRIFT.MAX_CHAIN, g.chain + 1) : 1;
          g.bestChain = Math.max(g.bestChain, g.chain);
          g.lastDriftEnd = g.time;
          g.drifts++; g.learned++;
          const pts = Math.round(d.points * SCORE.DRIFT_PER_METRE * this.mult);
          g.score += pts; g.bestDrift = Math.max(g.bestDrift, pts);
          // a banked drift buys time: this is how you stay ahead of the clock
          const T = DRIFT.TIERS[tier];
          if (!g.clockOut) g.clock += T.clock;
          g.driftTime += T.clock;
          hud.pop(`${T.name}  +${T.clock.toFixed(1)} s`, hexOf(T.color), tier >= 1);
          hud.addTime(T.clock, hexOf(T.color));
        }
        break;
      }
      case 'driftLost':
        if (live) { g.chain = 0; if (d.points > 30 || d.tier >= 0) { hud.pop('DRIFT LOST', '#ff5a6a'); au.driftLost(); } }
        break;
      case 'wallHit':
        au.impact(d.vn); this.rig.shake(Math.min(0.5, 0.15 + d.vn * 0.02));
        this.wallSparks(d.side, 26, d.soft);
        if (live && !d.soft) { g.chain = 0; hud.flash('rgba(255,120,60,0.16)'); }
        break;
      case 'graze':
        au.graze(); this.rig.shake(0.06);
        this.wallSparks(d.side, 8, d.soft);
        break;
      case 'crash': {
        au.crash(); this.rig.shake(0.9); this.hitStop = 0.09;
        const p = this.shipWorld();
        this.sparks.burst(p, 90, 0xffa040, 26, 0.9, 0.6);
        this.sparks.burst(p, 40, 0xffffff, 14, 0.5, 0.4);
        const laser = this.hitKind === 'laser' || this.hitKind === 'fence' || this.hitKind === 'sweep';
        if (live) { g.chain = 0; g.crashes++; hud.flash(); hud.pop(laser ? 'LASER' : 'CRASH', '#ff5a6a', true); }
        break;
      }
    }
  }

  // ---------- what the course reports ----------
  hooks() {
    if (this._hooks) return this._hooks;
    const g = GameState, hud = this.hud, au = this.audio;
    return (this._hooks = {
      crash: (o) => { this.hitKind = o.kind; return this.phys.crash(); },
      nearMiss: () => {
        if (!this.playing) return;
        g.score += SCORE.NEAR_MISS * this.mult;
        au.nearMiss(); hud.pop('CLOSE ONE  +' + SCORE.NEAR_MISS * this.mult, '#9fe8ff');
      },
      coin: (c) => {
        if (!this.playing) return;
        g.coinCombo = g.time - g.lastCoinAt < SCORE.COIN_COMBO_WINDOW ? g.coinCombo + 1 : 0;
        g.lastCoinAt = g.time;
        g.coins++;
        g.score += SCORE.COIN * this.mult;
        au.coin(g.coinCombo);
        this.sparks.burst(this.coinWorld(c), 9, 0xffd36b, 8, 0.4, 0.35);
      },
      pad: () => {
        this.phys.boost(DRIFT.PAD_TIME, DRIFT.PAD_GAIN, 0);
        au.pad(); this.rig.kick(0.6); this.rig.shake(0.18);
        if (this.playing) hud.pop('BOOST PAD', '#5ff3ff');
      },
      gate: (gate, bonus) => {
        this.lastGateS = gate.s;
        if (gate.kind !== 'mid') au.whoosh();
        if (!this.playing) return;
        g.clock = clockAfterGate(g.clock, bonus);
        g.clockOut = false; this.phys.engineCut = false;
        g.gates++; g.score += SCORE.GATE;
        au.gate(); hud.addTime(bonus); hud.flash('rgba(90,255,190,0.14)');
        if (gate.kind === 'in') hud.banner('ENTERING', gate.name, 2.6, gate.palette ? hexOf(gate.palette[0]) : '#9fe8ff');
        else if (gate.kind === 'out') { g.stations++; hud.banner('STATION CLEARED', 'OPEN SPACE', 2.4, '#9fe8ff'); }
        else hud.pop('CHECKPOINT', '#7dffc0', true);
      },
    });
  }

  shipWorld() { const p = this.pose; return this.tmpV.set(p.x, p.y, p.z); }
  coinWorld(c) {
    const f = this.track.sample(c.s, {});
    return this.tmpV2.set(f.x - Math.cos(f.h) * c.x, f.y + TRACK.HOVER, f.z + Math.sin(f.h) * c.x);
  }
  wallSparks(side, n, soft) {
    const ph = this.phys, f = this.track.sample(ph.s, {});
    const off = side * (ph.lim + SHIP.RADIUS);
    const wx = f.x - Math.cos(f.h) * off, wz = f.z + Math.sin(f.h) * off;
    const ty = this.pose.travelYaw ?? f.h;
    for (let i = 0; i < n; i++) this.sparks.emit(wx, f.y + TRACK.HOVER - 0.5 + Math.random() * 1.1, wz, Math.sin(ty) * ph.v * 0.6, 3, Math.cos(ty) * ph.v * 0.6, soft ? 0x37e6ff : 0xffb040, 0.4, 0.3, 10, 2);
  }

  /**
   * Test hook: ?perf=<seconds> measures real frame times over that long (use with ?bot&autostart), then
   * freezes and reports: on the page title, in window.__perf, and to the dev server's log.
   */
  perf(dt) {
    const P = (this._perf = this._perf || { t: 0, dts: [], done: false, s0: this.phys.s });
    if (P.done || GameState.phase !== 'playing') return;
    P.t += dt;
    if (P.t < 1.5) return;                                   // let the first frames settle
    P.dts.push(dt * 1000);
    if (P.t < 1.5 + Number(params.get('perf') || 60)) return;
    P.done = true;
    const a = P.dts.slice().sort((x, y) => x - y), q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
    const over = (ms) => P.dts.filter((x) => x > ms).length;
    const r = { map: GameState.map, mode: GameState.mode, cam: this.rig.mode, quality: GameState.quality, frames: a.length, km: ((this.phys.s - P.s0) / 1000).toFixed(2),
      fps: (1000 / (a.reduce((x, y) => x + y, 0) / a.length)).toFixed(1), ms50: q(0.5).toFixed(1), ms95: q(0.95).toFixed(1), ms99: q(0.99).toFixed(1), max: a[a.length - 1].toFixed(0),
      over20: over(20), over34: over(34), over60: over(60), size: this.renderer.domElement.width + 'x' + this.renderer.domElement.height };
    window.__perf = r;
    const txt = Object.entries(r).map(([k, v]) => k + '=' + v).join(' ');
    document.title = 'PERF ' + txt;
    fetch('/__perf?' + encodeURIComponent(txt)).catch(() => {});
    this.frozen = true;
  }

  // ---------- frame ----------
  frame() {
    this.timer.update();
    const raw = this.fixedDt || Math.min(this.timer.getDelta(), 0.1);
    const g = GameState, inp = this.input, ph = this.phys;

    // global keys
    if (inp.tap('KeyM')) { g.setMuted(!g.muted); this.audio.setMuted(g.muted); }
    if (inp.tap('KeyC', 'KeyV')) {
      const m = this.rig.mode === 'chase' ? 'cockpit' : 'chase';
      this.rig.setMode(m); g.setCam(m); this.ship.setFirstPerson(m === 'cockpit'); this.hud.camLabel(m); this.audio.ui();
    }
    if (inp.tap('KeyQ')) { g.setQuality(g.quality === 'high' ? 'low' : 'high'); this.applyQuality(); }
    if (g.phase === 'title' && inp.tap('Enter', 'Space', 'PadStart')) this.start();
    else if (g.phase === 'over' && this.overTimer > 1.0 && inp.tap('Enter', 'Space', 'KeyR', 'PadStart')) this.start();
    else if ((g.phase === 'playing' || g.phase === 'paused') && inp.tap('Escape', 'KeyP')) this.togglePause();

    if (g.phase === 'paused' || this.frozen) { inp.endFrame(); this.look.update(g.time, this.camera, this.track, ph.s); this.composer.render(); return; }
    if (params.has('perf')) this.perf(raw);
    // Test hook: ?stopwhen=drift freezes the game the first time a slide is well under way, for screenshots.
    if (params.get('stopwhen') === 'drift' && g.time > 0.5 && ph.drift && ph.driftT > 0.6) this.frozen = true;
    if (params.has('stopat') && ph.s >= Number(params.get('stopat'))) this.frozen = true; // ?stopat=<metres>

    // hit-stop: a few frames of near-freeze on impact
    let dt = raw;
    if (this.hitStop > 0) { this.hitStop -= raw; dt = raw * 0.06; }

    const playing = g.phase === 'playing';
    const human = playing && !this.bot;
    const hooks = this.hooks();
    if (human) this.control = inp.read();
    inp.endFrame();

    // physics in small fixed steps; the course is checked every step so nothing is tunnelled through
    let rem = dt;
    while (rem > 1e-6) {
      const h = Math.min(rem, 1 / 120);
      g.time += h;
      const control = human ? this.control : g.phase === 'over' ? IDLE : this.pilot.control(ph, g.time);
      this.lastControl = control;
      ph.step(h, control);
      this.course.update(ph, hooks, g.time);
      if (playing) {
        if (!g.clockOut) {
          g.clock -= h;
          if (g.clock <= 0) { g.clock = 0; g.clockOut = true; ph.engineCut = true; this.audio.timeUp(); this.hud.pop('OUT OF TIME', '#ff5a6a', true); }
        } else if (ph.v < 2.5) { this.gameOver(); break; }
      }
      rem -= h;
    }
    if (g.phase === 'over') this.overTimer += raw;
    if (g.phase === 'title') { ph.engineCut = false; }

    // SKYWAY with fast open air: say so as the road takes the speed over (the brake field into a ship, the launch out)
    const F = this.track.F;
    if (F && SHIP.AIR_SPEED && SHIP.AIR_SPEED !== 1) {
      const i = Math.min(F.length - 2, Math.max(0, Math.floor(ph.s))), ramp = Math.sign(F[i + 1] - F[i]);
      if (ramp !== this.ramp) {
        this.ramp = ramp;
        if (playing && ramp < 0) { this.hud.pop('BRAKE FIELD', '#ffb24a', true); this.audio.ui(); }
        else if (playing && ramp > 0) { this.hud.pop('LAUNCH', '#5ff3ff', true); this.audio.pad(); this.rig.kick(0.9); this.rig.shake(0.2); }
      }
    }

    if (playing) {
      g.distance = ph.dist;
      g.score += ph.v * dt * SCORE.PER_METRE;
      if (g.chain > 0 && !ph.drift && g.time - g.lastDriftEnd > DRIFT.CHAIN_WINDOW) g.chain = 0;
      // last seconds: a tick each second
      const sec = Math.ceil(g.clock);
      if (g.clock < CLOCK.LOW && g.clock > 0 && sec !== this.lastTick) { this.lastTick = sec; this.audio.tick(sec <= 3); }
      this.hints(dt);
    }

    // Starlight can't reach inside a station (there are no shadows to block it), so fade it out
    // indoors; otherwise the glossy floor throws a blinding specular hot spot at the camera.
    const sunTarget = ph.zone === 0 ? 0.15 : 2.4;
    this.sun.intensity += (sunTarget - this.sun.intensity) * (1 - Math.exp(-3 * dt));
    // The dark look: inside a ship the neon is everywhere and it would all go to one bright wash,
    // so the exposure and the bloom come down indoors and back up in the open.
    if (this.look.on) {
      const k = 1 - Math.exp(-2.5 * dt), [expo, glow] = ph.zone === 0 ? LOOK.INDOORS : [1, 1];
      this.renderer.toneMappingExposure += (RENDER.EXPOSURE * expo - this.renderer.toneMappingExposure) * k;
      this.bloom.strength += (RENDER.BLOOM_STRENGTH * glow - this.bloom.strength) * k;
    }

    this.track.ensure(this.span(ph.s)[1] + TRACK.CHUNK + 200);
    this.course.sync();
    this.updateChunks(false);
    this.view.update(ph, g.time, dt, this.span(ph.s));
    // a spiral: say so on the way in
    const sp = (this.track.spirals || []).find(([a, b]) => ph.s > a - 90 && ph.s < b);
    if (sp && sp !== this.inSpiral && playing) { this.hud.banner('SPIRAL', 'HOLD THE SLIDE', 2.4, '#c9a3ff'); this.audio.whoosh(); }
    this.inSpiral = sp || null;

    this.renderShip(dt);
    this.rig.update(raw, g.time, ph, this.pose, this.ship.eye);
    this.sky.update(this.camera, dt);
    this.dust.update(this.camera, g.time, ph.v * 1.8);
    const fwd = this.tmpV2.set(Math.sin(this.pose.travelYaw), 0, Math.cos(this.pose.travelYaw));
    const cruiseTop = SHIP.CRUISE[1];
    this.speedLines.update(this.camera.position, fwd, g.time, (ph.boosting ? 0.5 : clamp((ph.v - cruiseTop * 0.92) / 20, 0, 0.3)) * (this.look.on ? LOOK.STREAKS : 1));
    this.sparks.update(dt);

    // HUD
    const hv = this.hudView;
    hv.speed = ph.v * SHIP.DISPLAY_KMH;
    hv.drifting = ph.drift; hv.charge = ph.charge; hv.tier = ph.tier;
    hv.points = ph.driftPts * SCORE.DRIFT_PER_METRE * this.mult; hv.mult = this.mult;
    hv.boost = ph.boosting ? clamp(ph.boostT / DRIFT.TIERS[2].time, 0, 1) : 0; hv.boostTier = ph.boostTier;
    const next = this.course.nextGate();
    hv.gateDist = next ? next.s - ph.s : null;
    hv.gateFrac = next ? (ph.s - this.lastGateS) / Math.max(1, next.s - this.lastGateS) : 0;
    this.hud.update(raw, hv);

    const rev = clamp(ph.v / (SHIP.CRUISE[1] * (1 + DRIFT.MAX_GAIN)), 0, 1.3);
    this.audio.setIntensity(playing ? 0.35 + rev * 0.65 : 0.4);
    this.audio.update({ rev, boost: ph.boosting, slide: ph.slide, drifting: ph.drift, scrape: ph.touch > 0 && ph.zone === 0, tier: ph.tier + 1, zone: ph.zone, playing, brake: ph.braking });

    if (this.lighting) { this.lighting.update(this.track, ph.s); this.look.beam(this.lighting); }
    this.look.update(g.time, this.camera, this.track, ph.s);
    this.composer.render();
  }

  // The first few runs: one line of help at the moment it is useful. Stops once you clearly know how.
  hints(dt) {
    const g = GameState, ph = this.phys, hud = this.hud;
    // HARD: a slide where there is no bend earns nothing and is about to turn you into the wall
    if (SHIP.MANUAL && !this.bot && ph.drift && ph.driftT > 0.5 && ph.bendAhead(ph.v * 0.3) === 0 && g.learned < 60) { hud.hint('no bend, no charge &middot; <kbd>let go</kbd>'); return; }
    if (g.learned >= 6 || this.bot) { hud.hint(''); return; }
    this.hintT += dt;
    const bend = ph.bendAhead(ph.v * 1.5) !== 0;
    if (g.clockOut) hud.hint('');
    else if (ph.drift && ph.tier >= 0 && ph.bendAhead(ph.v * 0.25) === 0) hud.hint('<kbd>let go</kbd> to boost');
    else if (ph.drift) hud.hint(SHIP.MANUAL ? 'keep the nose turned in&hellip; it slides wide' : 'hold it&hellip; <kbd>&larr;</kbd> <kbd>&rarr;</kbd> slide you across');
    else if (bend && g.drifts < 4) hud.hint(SHIP.MANUAL ? 'steer in, and hold <kbd>SPACE</kbd> to slide' : 'hold <kbd>SPACE</kbd> through the bend to drift');
    else if (this.hintT < 6 && g.drifts === 0) hud.hint('<kbd>&larr;</kbd> <kbd>&rarr;</kbd> or <kbd>A</kbd> <kbd>D</kbd> to steer');
    else if (g.drifts > 0 && g.drifts < 3 && g.time - g.lastDriftEnd < 3) hud.hint('longer slides charge bigger boosts &middot; reach the gate before the clock runs out');
    else hud.hint('');
  }

  renderShip(dt) {
    const ph = this.phys, p = ph.pose(this.pose), m = this.ship, g = GameState;
    // bank into the turn like a hovering thing does; positive rolls the right side down
    const bankTarget = clamp(ph.yawRate * 0.13 + ph.beta * 0.42, -0.6, 0.6);
    m.bank = (m.bank || 0) + (bankTarget - (m.bank || 0)) * (1 - Math.exp(-7 * dt));
    p.roll = m.bank;
    p.bob = Math.sin(g.time * 1.7) * 0.05;
    m.group.position.set(p.x, p.y, p.z);
    // on a slope the ship lies along the road: nose up a climb, and leaning with the hill when it is turned across it
    const across = ph.theta + ph.beta, slope = Math.atan(p.g || 0);
    m.group.rotation.order = 'YXZ';
    m.group.rotation.set(-slope * Math.cos(across), p.yaw, slope * Math.sin(across));
    const pitch = (ph.boosting ? -0.035 : 0) + (ph.braking ? 0.05 : 0) + Math.sin(g.time * 2.1) * 0.01;
    m.pitch = (m.pitch || 0) + (pitch - (m.pitch || 0)) * (1 - Math.exp(-6 * dt));
    m.body.rotation.set(m.pitch, 0, m.bank);
    m.body.position.y = p.bob;
    const flicker = ph.ghost > 0 && Math.floor(g.time * 16) % 2 === 0;
    const cockpit = this.rig.blend >= 0.7;
    m.exterior.visible = !cockpit && !flicker;
    m.cockpit.visible = cockpit;

    const tier = ph.drift ? ph.tier + 1 : ph.boosting ? ph.boostTier + 1 : 0;
    const col = TIER_COLORS[clamp(tier, 0, 3)];
    const boostN = ph.boosting ? 1 : 0;
    // front pods and the yoke turn to face the way the ship is going: counter-steer in a slide
    const counter = clamp(ph.beta - ph.steer * 0.22, -0.75, 0.75);
    m.update(dt, g.time, clamp(ph.v / (50 * TEST.speed), 0, 1.2), boostN, col, counter, ph.steer);

    m.group.updateMatrixWorld();
    const side = this.tmpV.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    // tail-light streaks
    const strength = 0.06 + (ph.drift ? 0.3 : 0) + boostN * 0.45 + (ph.braking ? 0.7 : 0);
    for (let k = 0; k < 2; k++) {
      const tip = this.tmpV3.copy(m.tips[k]).applyMatrix4(m.body.matrixWorld);
      this.trails[k].update(tip, side, TAIL_RED, strength);
    }
    // skid marks under the rear pods while it slides, sparks off them as the charge builds
    const sliding = ph.drift ? ph.slide : 0;
    for (let k = 0; k < 2; k++) {
      const q = this.tmpV3.copy(m.skid[k]).applyMatrix4(m.group.matrixWorld);
      // the road's height under this pod (the pods sit behind the ship's centre, lower down a climb)
      const floor = p.floor + (p.g || 0) * ((q.x - p.x) * Math.sin(p.h) + (q.z - p.z) * Math.cos(p.h));
      this.skids[k].update(dt, q, side, sliding * (0.5 + 0.25 * tier), col, floor + 0.06);
      if (ph.drift && sliding > 0.3) {
        const n = 1 + (tier > 1 ? 1 : 0);
        const vx = Math.sin(p.travelYaw) * ph.v * 0.5, vz = Math.cos(p.travelYaw) * ph.v * 0.5;
        for (let i = 0; i < n; i++) this.sparks.emit(q.x + (Math.random() - 0.5) * 0.5, floor + 0.25, q.z + (Math.random() - 0.5) * 0.5, vx, 2.2, vz, tier > 0 ? DRIFT.TIERS[tier - 1].color : 0xcfefff, 0.4, 0.2, 7, 3);
      }
    }
    // rubbing a wall
    if (ph.touch > 0 && ph.wallSide) this.wallSparks(ph.wallSide, 3, ph.zone === 1);
  }

  /**
   * How much of the track is kept built round the ship: [from, to] in metres. Normally a little behind and
   * the view distance ahead. A spiral is different: the turn you have finished is the roof over your head
   * and the turn you have not reached is the floor below, so while one is near all of it stays.
   */
  span(s) {
    let from = s - TRACK.KEEP_BEHIND, to = s + TRACK.VIEW_AHEAD;
    for (const [a, b] of this.track.spirals || []) {
      if (s > a - TRACK.VIEW_AHEAD && s < b + 420) { from = Math.min(from, a - 160); to = Math.max(to, Math.min(b + 260, s + 2400)); }
    }
    return [from, to];
  }

  updateChunks(all) {
    const s = this.phys.s, [from, to] = this.span(s);
    const c0 = Math.max(0, Math.floor(from / TRACK.CHUNK));
    const c1 = Math.floor(to / TRACK.CHUNK);
    for (const [c, grp] of this.chunks) {
      if (c < c0 || c > c1) { this.scene.remove(grp); this.builder.disposeChunk(grp); this.chunks.delete(c); }
    }
    let built = 0;
    for (let c = c0; c <= c1; c++) {
      if (this.chunks.has(c)) continue;
      if ((c + 1) * TRACK.CHUNK + 4 > this.track.len) break;
      const grp = this.builder.buildChunk(c);
      this.scene.add(grp);
      this.chunks.set(c, grp);
      if (!all && ++built >= (to - s > TRACK.VIEW_AHEAD ? 4 : 2)) break;
    }
    this.updateHulls(s);
  }

  /** SKYWAY: build each ship's hull as it comes into range, and let it go once it is well behind. */
  updateHulls(s) {
    const T = this.track;
    for (const [id, grp] of this.hulls) {
      const S = T.sections[id];
      if (S.s1 < s - 900 || S.s0 > s + TRACK.VIEW_AHEAD + 700) { this.scene.remove(grp); disposeShipHull(grp); this.hulls.delete(id); }
    }
    for (let i = T.sections.length - 1; i >= 0; i--) {
      const S = T.sections[i];
      if (S.s1 < s - 700) break;
      if (!S.hull || this.hulls.has(S.id) || S.s0 > s + TRACK.VIEW_AHEAD + 500) continue;
      const grp = buildShipHull(T, S, this.mats);
      this.scene.add(grp);
      this.hulls.set(S.id, grp);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h); this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
  }
}

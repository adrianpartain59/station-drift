import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { TRACK, SHIP, DRIFT, SCORE, CAMERA, RENDER } from './Constants.js';
import { EventBus, Events } from './EventBus.js';
import { GameState } from './GameState.js';
import { Track } from '../level/Track.js';
import { Materials } from '../level/Materials.js';
import { WorldBuilder } from '../level/WorldBuilder.js';
import { Entities } from '../level/Entities.js';
import { Sky, Dust } from '../level/Sky.js';
import { ShipPhysics } from '../gameplay/ShipPhysics.js';
import { ShipModel } from '../gameplay/ShipModel.js';
import { Autopilot } from '../gameplay/Autopilot.js';
import { CameraRig } from '../systems/CameraRig.js';
import { Sparks, Trail, SpeedLines, AimGuide } from '../systems/Effects.js';
import { Audio } from '../systems/Audio.js';
import { Input } from '../systems/Input.js';
import { HUD } from '../ui/HUD.js';

const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TIER_COLORS = [new THREE.Color(0x37e6ff), ...DRIFT.TIERS.map((t) => new THREE.Color(t.color))];

export class Game {
  constructor(container) {
    this.container = container;
    this.input = new Input();
    this.audio = new Audio();
    this.audio.muted = GameState.muted || params.has('mute');
    this.hud = new HUD();
    this.pose = {};
    this.timeScale = 1; this.hitStop = 0;
    this.overTimer = 0;
    this.chunks = new Map();
    this.lastSec = -1;
    this.bot = params.has('bot');
    this.tmpV = new THREE.Vector3(); this.tmpV2 = new THREE.Vector3();
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

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), RENDER.BLOOM_STRENGTH, RENDER.BLOOM_RADIUS, RENDER.BLOOM_THRESHOLD);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.applyQuality();

    this.hemi = new THREE.HemisphereLight(0x9ab8ff, 0x20141c, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.scene.add(this.sun); this.scene.add(this.sun.target);

    this.mats = new Materials();
    this.sparks = new Sparks(this.scene);
    this.trails = [new Trail(this.scene), new Trail(this.scene)];
    this.speedLines = new SpeedLines(this.scene);
    this.aim = new AimGuide(this.scene);
    this.aimPoint = new THREE.Vector3();
    this.dust = new Dust(this.scene);
    this.ship = new ShipModel();
    this.scene.add(this.ship.group);

    this.wire();
    window.addEventListener('resize', () => this.resize());
    document.getElementById('playBtn').addEventListener('click', () => this.start());
    document.getElementById('againBtn').addEventListener('click', () => this.start());
    document.getElementById('resumeBtn').addEventListener('click', () => this.togglePause());

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? RENDER.MAX_DPR : 1));
    this.composer.setPixelRatio?.(Math.min(window.devicePixelRatio, high ? RENDER.MAX_DPR : 1));
  }

  // ---------- run lifecycle ----------
  newRun(seed) {
    this.seed = seed;
    for (const g of this.chunks.values()) { this.scene.remove(g); this.builder.disposeChunk(g); }
    this.chunks.clear();
    this.entities?.dispose();
    this.builder?.rockGeos.forEach((g) => g.dispose());
    this.scene.environment?.dispose();
    this.scene.environment = null;
    if (this.sky) {
      this.scene.remove(this.sky.group);
      this.sky.group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); });
    }

    this.track = new Track(seed);
    this.builder = new WorldBuilder(this.track, this.mats);
    this.entities = new Entities(this.scene, this.track, this.mats, this.builder.rockGeos);
    this.sky = new Sky(this.scene, seed);
    this.sun.position.copy(this.sky.sunDir).multiplyScalar(100);
    this.sun.color.copy(this.sky.sunColor).lerp(new THREE.Color(1, 1, 1), 0.5);

    // Reflections come from the actual sky, so metal and glass pick up the nebula and the star.
    const envScene = new THREE.Scene();
    const envSky = new Sky(envScene, seed);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment?.dispose();
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    envSky.group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); });

    this.phys = new ShipPhysics(this.track);
    this.pilot = new Autopilot(this.track);
    this.rig = new CameraRig(this.camera, this.track);
    this.rig.setMode(GameState.camMode);
    this.rig.blend = GameState.camMode === 'cockpit' ? 1 : 0;
    this.ship.setFirstPerson(GameState.camMode === 'cockpit');
    this.ship.group.visible = true;
    for (const t of this.trails) t.reset();
    this.lastSec = -1;
    this.track.ensure(TRACK.VIEW_AHEAD + 200);
    this.updateChunks(true);
  }

  start() {
    this.audio.start();
    this.audio.setMuted(GameState.muted || params.has('mute'));
    this.audio.ui();
    GameState.reset();
    this.newRun(params.has('seed') ? Number(params.get('seed')) : (Math.random() * 1e9) | 0);
    GameState.phase = 'playing';
    this.hud.phase('playing');
    this.overTimer = 0;
    // Test hooks: ?jump=<metres> starts further down the track, ?cam=cockpit picks the view.
    if (params.has('jump')) {
      this.phys.s = Number(params.get('jump'));
      this.track.ensure(this.phys.s + TRACK.VIEW_AHEAD + 200);
      this.entities.oIdx = this.entities.track.obstacles.findIndex((o) => o.s > this.phys.s - 20);
      this.updateChunks(true);
    }
    if (params.get('cam') === 'cockpit') { this.rig.setMode('cockpit'); this.rig.blend = 1; this.ship.setFirstPerson(true); }
    this.audio.whoosh();
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
    this.hud.gameOver({ score: g.score, best: g.best, newBest, distance: g.distance, stations: g.stationsCleared, bestDrift: g.bestDrift, coins: g.coins });
    this.hud.phase('over');
  }

  // ---------- events ----------
  wire() {
    const hud = this.hud, au = this.audio;
    EventBus.on(Events.DRIFT_START, () => au.driftStart());
    EventBus.on(Events.DRIFT_TIER, ({ tier }) => {
      if (tier < 0) return;
      au.tierUp(tier);
      this.rig.shake(0.08);
      const p = this.shipWorld();
      this.sparks.burst(p, 26, DRIFT.TIERS[tier].color, 12, 0.5, 0.5);
    });
    EventBus.on(Events.DRIFT_END, ({ points, tier, boost }) => {
      if (points > 0) hud.pop(`+${points.toLocaleString('en-US')} DRIFT`, tier >= 0 ? '#' + DRIFT.TIERS[tier].color.toString(16).padStart(6, '0') : '#dff6ff', tier >= 1);
      if (boost) {
        au.driftBank(tier); au.boost();
        this.rig.kick(0.6 + tier * 0.25); this.rig.shake(0.15 + tier * 0.08);
        hud.pop(`${DRIFT.TIERS[tier].name} BOOST`, '#' + DRIFT.TIERS[tier].color.toString(16).padStart(6, '0'));
      }
    });
    EventBus.on(Events.DRIFT_LOST, ({ points }) => {
      if (points > 50) { hud.pop('DRIFT LOST', '#ff5a6a'); au.driftLost(); }
    });
    EventBus.on(Events.HOP, () => {
      au.hop();
      this.rig.kick(0.25);
      const p = this.shipWorld();
      for (let i = 0; i < 26; i++) this.sparks.emit(p.x + (Math.random() - 0.5) * 2, p.y - 0.6, p.z + (Math.random() - 0.5) * 2, 0, -10, 0, 0x7dff9b, 0.35, 0.3, 7, 4);
    });
    EventBus.on(Events.HOP_FAIL, () => { au.hopFail(); hud.thrustFail(); });
    EventBus.on(Events.LAND, ({ impact }) => {
      au.land(impact);
      this.rig.shake(Math.min(0.25, impact * 0.015));
      this.ship.squash = 1;
      const p = this.shipWorld();
      for (let i = 0; i < 18; i++) { const a = Math.random() * 6.283; this.sparks.emit(p.x, 0.15, p.z, Math.cos(a) * 9, 1.5, Math.sin(a) * 9, 0xbfefff, 0.3, 0.25, 2, 3); }
    });
    EventBus.on(Events.SCRAPE, ({ impact, soft }) => {
      if (impact > 4) { au.impact(impact); this.rig.shake(Math.min(0.45, impact * 0.012)); if (!soft && impact > 18) hud.flash('rgba(255,120,60,0.18)'); }
    });
  }

  hooks() {
    const g = GameState, hud = this.hud, au = this.audio, ph = this.phys;
    const playing = g.phase === 'playing';
    return {
      crash: (o, side) => {
        if (!playing) return;
        if (!ph.crash(side)) return;
        au.crash(); this.rig.shake(0.95); hud.flash();
        this.hitStop = 0.09;
        const p = this.shipWorld();
        this.sparks.burst(p, 90, 0xffa040, 26, 0.9, 0.6);
        this.sparks.burst(p, 40, 0xffffff, 14, 0.5, 0.4);
        hud.pop('HULL HIT', '#ff5a6a', true);
      },
      airMiss: () => {
        if (!playing) return;
        g.score += SCORE.AIR_MISS * (1 + g.chain * 0.5);
        g.thrust = Math.min(1, g.thrust + 0.06);
        au.nearMiss(); hud.pop('AIR MISS', '#7dff9b');
      },
      nearMiss: () => {
        if (!playing) return;
        g.score += SCORE.NEAR_MISS * (1 + g.chain * 0.5);
        g.thrust = Math.min(1, g.thrust + 0.05);
        au.nearMiss(); hud.pop('NEAR MISS', '#9fe8ff');
      },
      coin: (c) => {
        if (!playing) return;
        g.coinCombo = g.time - g.lastCoinAt < SCORE.COIN_COMBO_WINDOW ? g.coinCombo + 1 : 0;
        g.lastCoinAt = g.time;
        g.coins++;
        g.score += SCORE.COIN * (1 + Math.min(10, g.coinCombo) * 0.2);
        g.thrust = Math.min(1, g.thrust + 0.03);
        au.coin(g.coinCombo);
        const p = this.coinWorld(c);
        this.sparks.burst(p, 10, 0xffd36b, 8, 0.4, 0.35);
      },
      pad: () => {
        ph.padBoost();
        if (!playing) return;
        au.pad(); this.rig.kick(0.8); this.rig.shake(0.2);
        hud.pop('BOOST PAD', '#5ff3ff');
      },
      repair: () => {
        if (!playing) return;
        g.hull = Math.min(SHIP.HULL, g.hull + 34);
        au.repair(); hud.pop('+HULL', '#7dff9b', true); hud.flash('rgba(90,255,150,0.2)');
      },
    };
  }

  shipWorld() { const p = this.pose; return this.tmpV.set(p.x, p.y, p.z); }
  coinWorld(c) {
    const f = this.track.sample(c.s, {});
    return this.tmpV2.set(f.x - Math.cos(f.h) * c.x, TRACK.HOVER, f.z + Math.sin(f.h) * c.x);
  }

  // ---------- frame ----------
  frame() {
    this.timer.update();
    const raw = this.fixedDt || Math.min(this.timer.getDelta(), 0.1);
    const g = GameState, inp = this.input;

    // global keys
    if (inp.tap('KeyM')) { g.setMuted(!g.muted); this.audio.setMuted(g.muted); }
    if (inp.tap('KeyC', 'KeyV')) {
      const m = this.rig.mode === 'chase' ? 'cockpit' : 'chase';
      this.rig.setMode(m); g.setCam(m); this.ship.setFirstPerson(m === 'cockpit'); this.hud.camLabel(m); this.audio.ui();
    }
    if (inp.tap('KeyQ')) { g.setQuality(g.quality === 'high' ? 'low' : 'high'); this.applyQuality(); }
    if (g.phase === 'title' && inp.tap('Enter', 'Space', 'PadStart')) this.start();
    else if (g.phase === 'over' && this.overTimer > 1.2 && inp.tap('Enter', 'Space', 'KeyR', 'PadStart')) this.start();
    else if ((g.phase === 'playing' || g.phase === 'paused') && inp.tap('Escape', 'KeyP')) this.togglePause();

    if (g.phase === 'paused' || this.frozen) { inp.endFrame(); this.composer.render(); return; }
    // Test hook: ?stopwhen=hop|drift freezes the game the first time that happens, for screenshots.
    const sw = params.get('stopwhen');
    if (sw && g.time > 0.5 && ((sw === 'hop' && this.phys.air && this.phys.h > 1.3) || (sw === 'drift' && this.phys.drift && this.phys.driftTime > 0.5))) this.frozen = true;

    // hit-stop: a few frames of near-freeze on impact
    let dt = raw;
    if (this.hitStop > 0) { this.hitStop -= raw; dt = raw * 0.06; }

    const playing = g.phase === 'playing';
    let control;
    if (playing && !this.bot) control = inp.read();
    else if (g.phase === 'over') control = { steer: 0, drift: false, hop: false, brake: true };
    else control = this.pilot.control(this.phys, (ph, xc, t) => this.entities.laneCost(ph, xc, t), g.time, dt, (ph, t) => this.entities.hopNeeded(ph, t));
    inp.endFrame();

    // physics in small fixed steps
    let rem = dt;
    while (rem > 1e-6) {
      const h = Math.min(rem, 1 / 120);
      if (playing || g.phase === 'title') g.time += h;
      this.phys.step(h, control);
      rem -= h;
    }
    if (g.phase === 'over') { this.phys.v *= Math.exp(-dt * 1.5); this.overTimer += raw; }
    if (!playing && g.phase !== 'over') { g.hull = SHIP.HULL; this.phys.invuln = 1; }

    const ph = this.phys;
    // Starlight can't reach inside a station (there are no shadows to block it), so fade it out
    // indoors; otherwise the glossy floor throws a blinding specular hot spot at the camera.
    const sunTarget = ph.zone === 0 ? 0.15 : 2.4;
    this.sun.intensity += (sunTarget - this.sun.intensity) * (1 - Math.exp(-3 * dt));
    if (playing) g.score += ph.v * dt * SCORE.PER_METRE * (1 + g.chain * 0.1);

    this.track.ensure(ph.s + TRACK.VIEW_AHEAD + TRACK.CHUNK + 20);
    this.updateChunks(false);
    this.entities.update(ph, g.time, dt, this.hooks());
    this.zoneCheck();

    if (playing && g.hull <= 0) {
      const p = this.shipWorld();
      this.sparks.burst(p, 200, 0xffa040, 40, 1.4, 0.8);
      this.sparks.burst(p, 120, 0xff3fb4, 30, 1.2, 0.6);
      this.ship.group.visible = false;
      this.audio.crash(); this.rig.shake(1);
      this.gameOver();
    }

    this.renderShip(dt, control);
    const guideCol = TIER_COLORS[Math.max(0, Math.min(3, g.driftTier + 1))];
    this.pose.aim = this.aim.update(raw, ph, this.track, guideCol, ph.drift && g.phase !== 'over', 0.12, this.aimPoint);
    this.pose.aimW = ph.drift ? 0.3 : ph.exitT > 0 ? 0.15 : 0;
    this.rig.update(raw, g.time, ph, this.pose, false);
    this.sky.update(this.camera, dt);
    this.dust.update(this.camera, g.time, ph.v);
    const fwd = this.tmpV2.set(Math.sin(this.pose.travelYaw), 0, Math.cos(this.pose.travelYaw));
    this.speedLines.update(this.camera.position, fwd, g.time, ph.boostActive ? 0.55 : Math.max(0, (ph.v - 110) / 120));
    this.sparks.update(dt);

    this.hud.update(raw);
    const speedN = clamp((ph.v - SHIP.BASE_SPEED) / 80, 0, 1);
    this.audio.setIntensity(playing ? 0.35 + speedN * 0.65 : 0.4);
    this.audio.update({ speed: ph.v, boost: ph.boostActive, slip: ph.slip, drifting: ph.drift, scrape: ph.scrape && ph.zone === 0, tier: Math.max(0, g.driftTier + 1), zone: ph.zone, playing });

    this.composer.render();
  }

  renderShip(dt, control) {
    const ph = this.phys, p = ph.pose(this.pose), m = this.ship, g = GameState;
    const bankTarget = clamp(-ph.yawRate * 0.22 - (ph.drift ? ph.driftDir * ph.slip * 0.35 : 0), -0.75, 0.75);
    m.bank = (m.bank || 0) + (bankTarget - (m.bank || 0)) * (1 - Math.exp(-8 * dt));
    p.roll = m.bank;
    m.group.position.set(p.x, p.y, p.z);
    m.group.rotation.set(0, p.yaw, 0);
    m.body.rotation.set(-0.04 * (ph.boostActive ? 1 : 0) + Math.sin(g.time * 2.1) * 0.012, 0, m.bank);
    m.squash = Math.max(0, (m.squash || 0) - dt * 6);
    m.body.position.y = Math.sin(g.time * 1.7) * 0.06 - m.squash * 0.18;
    m.body.rotation.x += ph.air ? -clamp(ph.vh * 0.025, -0.25, 0.25) : 0; // nose up on the climb, down on the fall
    const flicker = ph.invuln > 0 && g.phase === 'playing' && Math.floor(g.time * 18) % 2 === 0;
    m.exterior.visible = this.rig.mode === 'chase' && !flicker && this.rig.blend < 0.7;
    m.cockpit.visible = this.rig.blend >= 0.7;

    const tier = ph.drift ? g.driftTier + 1 : ph.boostActive ? 1 : 0;
    const col = TIER_COLORS[Math.max(0, Math.min(3, tier))];
    m.update(dt, g.time, clamp(ph.v / 120, 0, 1.2), ph.boostActive ? 1 : 0, col);

    // trails from the wingtips
    m.group.updateMatrixWorld();
    const side = this.tmpV.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const strength = 0.12 + (ph.drift ? 0.45 + Math.max(0, g.driftTier + 1) * 0.18 : 0) + (ph.boostActive ? 0.35 : 0);
    for (let k = 0; k < 2; k++) {
      const tip = m.tips[k].clone().applyMatrix4(m.body.matrixWorld);
      this.trails[k].update(tip, side, col, strength);
    }

    // drift sparks off the tail, wall sparks at the contact point
    if (ph.drift && ph.slip > DRIFT.MIN_SLIP) {
      const n = 1 + Math.floor(ph.slip * 2) + (g.driftTier + 1);
      const cHex = g.driftTier >= 0 ? DRIFT.TIERS[g.driftTier].color : 0xbfefff;
      for (let i = 0; i < n; i++) {
        const back = this.tmpV2.set(0, -0.3, -2.6).applyMatrix4(m.group.matrixWorld);
        const vx = Math.sin(p.travelYaw) * ph.v * 0.55, vz = Math.cos(p.travelYaw) * ph.v * 0.55; // trail behind the ship, not into the lens
        this.sparks.emit(back.x + (Math.random() - 0.5) * 1.6, back.y, back.z, vx, 1.5, vz, cHex, 0.45, 0.2, 9, 3);
      }
    }
    if (ph.scrape && ph.wallSide) {
      const f = this.track.sample(ph.s, {});
      const wx = f.x - Math.cos(f.h) * (ph.wallSide * f.w), wz = f.z + Math.sin(f.h) * (ph.wallSide * f.w);
      for (let i = 0; i < 6; i++) this.sparks.emit(wx, p.y - 0.4 + Math.random(), wz, Math.sin(p.travelYaw) * ph.v * 0.6, 3, Math.cos(p.travelYaw) * ph.v * 0.6, ph.zone === 1 ? 0x37e6ff : 0xffb040, 0.4, 0.3, 10, 2);
    }
    if (g.phase !== 'over') m.group.visible = true;
    if (g.phase === 'over') m.group.visible = false;
  }

  zoneCheck() {
    const g = GameState, ph = this.phys;
    const sec = this.track.sectionAt(ph.s);
    if (sec.id === this.lastSec) return;
    const first = this.lastSec === -1;
    this.lastSec = sec.id;
    g.zone = sec.type;
    if (g.phase !== 'playing' && !first) return;
    if (sec.type === 'station') {
      const hexc = '#' + sec.palette[0].toString(16).padStart(6, '0');
      if (g.phase === 'playing') this.hud.banner('ENTERING', sec.name, 2.6, hexc);
      this.audio.whoosh();
    } else if (!first) {
      g.stationsCleared++;
      const next = this.track.sections[sec.id + 1];
      this.hud.banner('OPEN SPACE', next ? `NEXT  ${next.name}` : '', 2.6, '#9fe8ff');
      this.audio.whoosh();
      g.score += 1000;
      this.hud.pop('+1,000 STATION CLEAR', '#fff3c2', true);
    }
  }

  updateChunks(all) {
    const s = this.phys.s;
    const c0 = Math.max(0, Math.floor((s - TRACK.KEEP_BEHIND) / TRACK.CHUNK));
    const c1 = Math.floor((s + TRACK.VIEW_AHEAD) / TRACK.CHUNK);
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
      if (!all && ++built >= 2) break;
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h); this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
  }
}

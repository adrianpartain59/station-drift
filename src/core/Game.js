import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { TRACK, SHIP, DRIFT, SCORE, CLOCK, CAMERA, RENDER, MAX_BOOST_GAIN } from './Constants.js';
import { GameState } from './GameState.js';
import { Track } from '../level/Track.js';
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
    this.trails = [new Trail(this.scene, 12, 0.05), new Trail(this.scene, 12, 0.05)];
    this.skids = [new Skid(this.scene), new Skid(this.scene)];
    this.speedLines = new SpeedLines(this.scene);
    this.dust = new Dust(this.scene);
    this.ship = new ShipModel();
    this.scene.add(this.ship.group);

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
    this.view?.dispose();
    this.builder?.rockGeos.forEach((g) => g.dispose());
    this.scene.environment?.dispose();
    this.scene.environment = null;
    if (this.sky) {
      this.scene.remove(this.sky.group);
      this.sky.group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); });
    }

    this.track = new Track(seed);
    this.track.ensure(TRACK.VIEW_AHEAD + 400);
    this.course = new Course(this.track, seed);
    this.builder = new WorldBuilder(this.track, this.mats);
    this.view = new CourseView(this.scene, this.track, this.course, this.mats, this.builder.rockGeos);
    this.sky = new Sky(this.scene, seed);
    this.sun.position.copy(this.sky.sunDir).multiplyScalar(100);
    this.sun.color.copy(this.sky.sunColor).lerp(new THREE.Color(1, 1, 1), 0.5);

    // Reflections come from the actual sky, so metal and glass pick up the nebula and the star.
    const envScene = new THREE.Scene();
    const envSky = new Sky(envScene, seed);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.55;
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
    this.lastGateS = 0; this.zone = -1;
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
    this.hud.hint('');
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
        if (live) { g.chain = 0; g.crashes++; hud.flash(); hud.pop('CRASH', '#ff5a6a', true); }
        break;
      }
    }
  }

  // ---------- what the course reports ----------
  hooks() {
    if (this._hooks) return this._hooks;
    const g = GameState, hud = this.hud, au = this.audio;
    return (this._hooks = {
      crash: () => this.phys.crash(),
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
    return this.tmpV2.set(f.x - Math.cos(f.h) * c.x, TRACK.HOVER, f.z + Math.sin(f.h) * c.x);
  }
  wallSparks(side, n, soft) {
    const ph = this.phys, f = this.track.sample(ph.s, {});
    const off = side * (ph.lim + SHIP.RADIUS);
    const wx = f.x - Math.cos(f.h) * off, wz = f.z + Math.sin(f.h) * off;
    const ty = this.pose.travelYaw ?? f.h;
    for (let i = 0; i < n; i++) this.sparks.emit(wx, TRACK.HOVER - 0.5 + Math.random() * 1.1, wz, Math.sin(ty) * ph.v * 0.6, 3, Math.cos(ty) * ph.v * 0.6, soft ? 0x37e6ff : 0xffb040, 0.4, 0.3, 10, 2);
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

    if (g.phase === 'paused' || this.frozen) { inp.endFrame(); this.composer.render(); return; }
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
      this.course.update(ph, hooks);
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

    this.track.ensure(ph.s + TRACK.VIEW_AHEAD + TRACK.CHUNK + 200);
    this.course.sync();
    this.updateChunks(false);
    this.view.update(ph, g.time, dt);

    this.renderShip(dt);
    this.rig.update(raw, g.time, ph, this.pose, this.ship.eye);
    this.sky.update(this.camera, dt);
    this.dust.update(this.camera, g.time, ph.v * 1.8);
    const fwd = this.tmpV2.set(Math.sin(this.pose.travelYaw), 0, Math.cos(this.pose.travelYaw));
    const cruiseTop = SHIP.CRUISE[1];
    this.speedLines.update(this.camera.position, fwd, g.time, ph.boosting ? 0.5 : clamp((ph.v - cruiseTop * 0.92) / 20, 0, 0.3));
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

    const rev = clamp(ph.v / (SHIP.CRUISE[1] * (1 + MAX_BOOST_GAIN)), 0, 1.3);
    this.audio.setIntensity(playing ? 0.35 + rev * 0.65 : 0.4);
    this.audio.update({ rev, boost: ph.boosting, slide: ph.slide, drifting: ph.drift, scrape: ph.touch > 0 && ph.zone === 0, tier: ph.tier + 1, zone: ph.zone, playing, brake: ph.braking });

    this.composer.render();
  }

  // The first few runs: one line of help at the moment it is useful. Stops once you clearly know how.
  hints(dt) {
    const g = GameState, ph = this.phys, hud = this.hud;
    if (g.learned >= 6 || this.bot) { hud.hint(''); return; }
    this.hintT += dt;
    const bend = ph.bendAhead(ph.v * 1.5) !== 0;
    if (g.clockOut) hud.hint('');
    else if (ph.drift && ph.tier >= 0 && ph.bendAhead(ph.v * 0.25) === 0) hud.hint('<kbd>let go</kbd> to boost');
    else if (ph.drift) hud.hint('hold it&hellip; <kbd>&larr;</kbd> <kbd>&rarr;</kbd> slide you across');
    else if (bend && g.drifts < 4) hud.hint('hold <kbd>SPACE</kbd> through the bend to drift');
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
    m.group.rotation.set(0, p.yaw, 0);
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
    m.update(dt, g.time, clamp(ph.v / 50, 0, 1.2), boostN, col, counter, ph.steer);

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
      this.skids[k].update(dt, q, side, sliding * (0.5 + 0.25 * tier), col, 0.06);
      if (ph.drift && sliding > 0.3) {
        const n = 1 + (tier > 1 ? 1 : 0);
        const vx = Math.sin(p.travelYaw) * ph.v * 0.5, vz = Math.cos(p.travelYaw) * ph.v * 0.5;
        for (let i = 0; i < n; i++) this.sparks.emit(q.x + (Math.random() - 0.5) * 0.5, 0.25, q.z + (Math.random() - 0.5) * 0.5, vx, 2.2, vz, tier > 0 ? DRIFT.TIERS[tier - 1].color : 0xcfefff, 0.4, 0.2, 7, 3);
      }
    }
    // rubbing a wall
    if (ph.touch > 0 && ph.wallSide) this.wallSparks(ph.wallSide, 3, ph.zone === 1);
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

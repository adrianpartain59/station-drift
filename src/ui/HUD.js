import { GameState } from '../core/GameState.js';
import { DRIFT, CLOCK } from '../core/Constants.js';
import { DEFAULT_MODE } from '../core/Modes.js';
import { DEFAULT_MAP } from '../core/Maps.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const top = () => DRIFT.TIERS[DRIFT.TIERS.length - 1].at;

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), score: $('score'), dist: $('dist'), coins: $('coins'), speed: $('speed'), chain: $('chain'),
      clockBox: $('clockBox'), clock: $('clock'), clockAdd: $('clockAdd'),
      gateDist: $('gateDist'), gateFill: $('gateFill'), boostFill: $('boostFill'),
      drift: $('drift'), driftPts: $('driftPts'), driftMult: $('driftMult'), driftTier: $('driftTier'),
      banner: $('banner'), bannerTop: $('bannerTop'), bannerMain: $('bannerMain'), pops: $('pops'), hint: $('hint'),
      title: $('title'), pause: $('pause'), over: $('over'), overStats: $('overStats'), best: $('bestTitle'), cam: $('camLabel'), flash: $('flash'),
    };
    $('tick1').style.left = (DRIFT.TIERS[0].at / top()) * 100 + '%';
    $('tick2').style.left = (DRIFT.TIERS[1].at / top()) * 100 + '%';
    this.bannerT = 0; this.hintText = ''; this.linger = 0;
    this.tests = [];            // test hooks that are on, named next to the score
    this.tone = (c) => c;       // the look maps every colour the game hands the HUD onto the run's colour (systems/Look.js)
  }

  show(id, on) { this.el[id].classList.toggle('hidden', !on); }

  /**
   * The game is HARD on SKYWAY and the page offers nothing else, so that game goes unnamed. A mode or a map reached
   * by a test hook (?mode=easy, ?map=classic) is named next to the score and on the title's best line.
   */
  setMode(name, modes) {
    this.modeLabel = name === DEFAULT_MODE ? '' : modes[name].label;
    this.tag();
  }

  setMap(name, maps) {
    this.mapLabel = name === DEFAULT_MAP ? '' : maps[name].label;
    this.tag();
  }

  /** A test hook is on (?speed=, ?air=): say so next to the score, after the game. */
  testTag(text) {
    if (!this.tests.includes(text)) this.tests.push(text);
    this.tag();
  }

  tag() {
    $('modeTag').textContent = [this.mapLabel, this.modeLabel, ...this.tests].filter(Boolean).join('  \u00b7  ');
    if (!this.el.title.classList.contains('hidden')) this.phase('title');
  }

  phase(p) {
    this.show('title', p === 'title');
    this.show('pause', p === 'paused' && !this.quietPause);   // quietPause: the lighting bench (?tune) pauses with nothing over the picture
    this.show('over', p === 'over');
    this.show('hud', p === 'playing' || p === 'paused');
    if (p === 'title') this.el.best.textContent = GameState.best ? `${[this.mapLabel, this.modeLabel, 'BEST'].filter(Boolean).join(' ')} ${fmt(GameState.best)}  ·  BANK ${fmt(GameState.bank)} ◎` : '';
  }

  /** v: { speed (shown units), drifting, charge, tier, points, mult, boost 0..1, boostTier, gateDist, gateFrac } */
  update(dt, v) {
    const g = GameState, e = this.el;
    e.score.textContent = fmt(g.score);
    e.dist.textContent = (g.distance / 1000).toFixed(2) + ' km';
    e.coins.textContent = fmt(g.coins);
    e.speed.textContent = Math.round(v.speed);
    e.chain.textContent = g.chain > 1 ? `CHAIN x${g.chain}` : '';

    const c = Math.max(0, g.clock);
    e.clock.innerHTML = `${Math.floor(c)}<small>.${Math.floor((c % 1) * 10)}</small>`;
    e.clockBox.classList.toggle('low', c < CLOCK.LOW && c > 0);
    e.clockBox.classList.toggle('out', c <= 0);

    e.gateDist.textContent = v.gateDist != null ? `${Math.max(0, Math.round(v.gateDist / 10) * 10)} m` : '';
    e.gateFill.style.transform = `scaleX(${Math.max(0, Math.min(1, v.gateFrac || 0)).toFixed(3)})`;
    e.boostFill.style.transform = `scaleX(${Math.max(0, Math.min(1, v.boost)).toFixed(3)})`;
    e.boostFill.style.setProperty('--tier', this.tone(hex(DRIFT.TIERS[Math.max(0, v.boostTier)].color)));

    // the drift panel stays up for a moment after the slide so you can read what it banked
    if (v.drifting) this.linger = 0.9; else this.linger -= dt;
    if (v.drifting) {
      const tier = v.tier;
      e.driftPts.textContent = fmt(v.points);
      e.driftMult.textContent = v.mult > 1 ? `x${v.mult % 1 ? v.mult.toFixed(1) : v.mult}` : '';
      e.driftTier.textContent = tier >= 0 ? DRIFT.TIERS[tier].name : 'DRIFT';
      e.drift.style.setProperty('--tier', this.tone(tier >= 0 ? hex(DRIFT.TIERS[tier].color) : '#ffffff'));
      e.drift.style.setProperty('--prog', Math.max(0, Math.min(1, v.charge / top())).toFixed(3));
    }
    e.drift.classList.toggle('on', v.drifting || this.linger > 0);

    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) e.banner.classList.remove('on'); }
  }

  banner(top, main, time = 2.6, color = '#9fe8ff') {
    const e = this.el;
    e.bannerTop.textContent = top; e.bannerMain.textContent = main;
    e.banner.style.setProperty('--c', this.tone(color));
    e.banner.classList.remove('on'); void e.banner.offsetWidth; e.banner.classList.add('on');
    this.bannerT = time;
  }

  pop(text, color = '#fff', big = false) {
    const d = document.createElement('div');
    d.className = 'pop' + (big ? ' big' : '');
    d.textContent = text; d.style.color = this.tone(color);
    d.style.left = 50 + (Math.random() - 0.5) * 10 + '%';
    this.el.pops.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  /** Time added to the clock (a gate, or a banked drift in its tier colour). */
  addTime(seconds, color = '#7dffc0') {
    const a = this.el.clockAdd;
    color = this.tone(color);
    a.textContent = `+${seconds.toFixed(1)} s`;
    a.style.color = color; a.style.textShadow = `0 0 14px ${color}`;
    a.classList.remove('on'); void a.offsetWidth; a.classList.add('on');
  }

  /** A one-line prompt above the speedo. HTML allowed (for <kbd>). Empty string hides it. */
  hint(html) {
    if (html === this.hintText) return;
    this.hintText = html;
    const h = this.el.hint;
    if (html) { h.innerHTML = html; h.classList.add('on'); } else h.classList.remove('on');
  }

  flash(color = 'rgba(255,60,80,0.35)') {
    const f = this.el.flash;
    f.style.background = this.tone(color);
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }

  camLabel(mode) { this.note(mode === 'cockpit' ? 'COCKPIT VIEW' : 'CHASE VIEW'); }

  /** A word in the corner for a moment (the view just chosen, the run's colour). */
  note(text) {
    const e = this.el.cam;
    e.textContent = text;
    e.classList.remove('on'); void e.offsetWidth; e.classList.add('on');
  }

  gameOver(s) {
    this.el.overStats.innerHTML = `
      <div class="row big"><span>SCORE</span><b>${fmt(s.score)}</b></div>
      ${s.newBest ? '<div class="newbest">NEW PERSONAL BEST</div>' : `<div class="row"><span>BEST</span><b>${fmt(s.best)}</b></div>`}
      <div class="row"><span>DISTANCE</span><b>${(s.distance / 1000).toFixed(2)} km</b></div>
      <div class="row"><span>STATIONS CLEARED</span><b>${s.stations}</b></div>
      <div class="row"><span>DRIFTS BANKED</span><b>${s.drifts}</b></div>
      <div class="row"><span>BEST DRIFT</span><b>${fmt(s.bestDrift)}</b></div>
      <div class="row"><span>LONGEST CHAIN</span><b>x${s.bestChain}</b></div>
      <div class="row"><span>TIME EARNED DRIFTING</span><b>+${s.driftTime.toFixed(1)} s</b></div>
      <div class="row"><span>COINS</span><b>${fmt(s.coins)} ◎</b></div>
      <div class="tip">${s.tip}</div>`;
  }
}

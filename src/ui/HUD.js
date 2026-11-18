import { GameState } from '../core/GameState.js';
import { DRIFT, CLOCK } from '../core/Constants.js';

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
  }

  show(id, on) { this.el[id].classList.toggle('hidden', !on); }

  /** Mark the chosen mode on every mode chip, fill in the blurbs, tag the HUD. */
  setMode(name, modes) {
    for (const b of document.querySelectorAll('.mode')) {
      b.classList.toggle('sel', b.dataset.mode === name);
      b.querySelector('span').textContent = modes[b.dataset.mode].blurb;
    }
    $('modeTag').textContent = name === 'easy' ? '' : modes[name].label;
    this.modeLabel = modes[name].label;
    if (!this.el.title.classList.contains('hidden')) this.phase('title');
  }

  /** A test hook is on (?speed=): say so next to the score, after the mode. */
  testTag(text) {
    const t = $('modeTag');
    t.textContent = (t.textContent ? t.textContent + '  \u00b7  ' : '') + text;
  }

  /** Mark the chosen map on every map chip and fill in the blurbs. */
  setMap(name, maps) {
    for (const b of document.querySelectorAll('.map')) {
      b.classList.toggle('sel', b.dataset.map === name);
      b.querySelector('span').textContent = maps[b.dataset.map].blurb;
    }
    this.mapLabel = maps[name].label;
    if (!this.el.title.classList.contains('hidden')) this.phase('title');
  }

  phase(p) {
    this.show('title', p === 'title');
    this.show('pause', p === 'paused');
    this.show('over', p === 'over');
    this.show('hud', p === 'playing' || p === 'paused');
    if (p === 'title') this.el.best.textContent = GameState.best ? `${this.mapLabel || ''} ${this.modeLabel || ''} BEST ${fmt(GameState.best)}  ·  BANK ${fmt(GameState.bank)} ◎` : '';
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
    e.boostFill.style.setProperty('--tier', hex(DRIFT.TIERS[Math.max(0, v.boostTier)].color));

    // the drift panel stays up for a moment after the slide so you can read what it banked
    if (v.drifting) this.linger = 0.9; else this.linger -= dt;
    if (v.drifting) {
      const tier = v.tier;
      e.driftPts.textContent = fmt(v.points);
      e.driftMult.textContent = v.mult > 1 ? `x${v.mult % 1 ? v.mult.toFixed(1) : v.mult}` : '';
      e.driftTier.textContent = tier >= 0 ? DRIFT.TIERS[tier].name : 'DRIFT';
      e.drift.style.setProperty('--tier', tier >= 0 ? hex(DRIFT.TIERS[tier].color) : '#ffffff');
      e.drift.style.setProperty('--prog', Math.max(0, Math.min(1, v.charge / top())).toFixed(3));
    }
    e.drift.classList.toggle('on', v.drifting || this.linger > 0);

    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) e.banner.classList.remove('on'); }
  }

  banner(top, main, time = 2.6, color = '#9fe8ff') {
    const e = this.el;
    e.bannerTop.textContent = top; e.bannerMain.textContent = main;
    e.banner.style.setProperty('--c', color);
    e.banner.classList.remove('on'); void e.banner.offsetWidth; e.banner.classList.add('on');
    this.bannerT = time;
  }

  pop(text, color = '#fff', big = false) {
    const d = document.createElement('div');
    d.className = 'pop' + (big ? ' big' : '');
    d.textContent = text; d.style.color = color;
    d.style.left = 50 + (Math.random() - 0.5) * 10 + '%';
    this.el.pops.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  /** Time added to the clock (a gate, or a banked drift in its tier colour). */
  addTime(seconds, color = '#7dffc0') {
    const a = this.el.clockAdd;
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
    f.style.background = color;
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }

  camLabel(mode) {
    const e = this.el.cam;
    e.textContent = mode === 'cockpit' ? 'COCKPIT VIEW' : 'CHASE VIEW';
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

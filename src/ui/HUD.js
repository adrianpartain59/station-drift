import { GameState } from '../core/GameState.js';
import { DRIFT, SHIP } from '../core/Constants.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), score: $('score'), dist: $('dist'), coins: $('coins'), speed: $('speed'),
      thrust: $('thrustFill'), hull: $('hullFill'), drift: $('drift'), driftPts: $('driftPts'), driftMult: $('driftMult'), driftTier: $('driftTier'),
      banner: $('banner'), bannerTop: $('bannerTop'), bannerMain: $('bannerMain'), pops: $('pops'),
      title: $('title'), pause: $('pause'), over: $('over'), overStats: $('overStats'), best: $('bestTitle'), cam: $('camLabel'), chain: $('chain'), flash: $('flash'),
    };
    this.bannerT = 0;
  }

  show(id, on) { this.el[id].classList.toggle('hidden', !on); }

  phase(p) {
    this.show('title', p === 'title');
    this.show('pause', p === 'paused');
    this.show('over', p === 'over');
    this.show('hud', p === 'playing' || p === 'paused');
    if (p === 'title') this.el.best.textContent = GameState.best ? `BEST ${fmt(GameState.best)}  ·  BANK ${fmt(GameState.bank)} ◎` : '';
  }

  update(dt) {
    const g = GameState, e = this.el;
    e.score.textContent = fmt(g.score);
    e.dist.textContent = (g.distance / 1000).toFixed(2) + ' km';
    e.coins.textContent = fmt(g.coins);
    e.speed.textContent = Math.round(g.speed * 3.6);
    e.thrust.style.transform = `scaleX(${g.thrust.toFixed(3)})`;
    e.thrust.classList.toggle('ready', g.thrust >= 0.34);
    const hull = Math.max(0, g.hull / SHIP.HULL);
    e.hull.style.transform = `scaleX(${hull.toFixed(3)})`;
    e.hull.classList.toggle('low', hull < 0.35);
    e.chain.textContent = g.chain > 0 ? `CHAIN x${1 + g.chain}` : '';

    if (g.drifting || g.driftPoints > 0) {
      e.drift.classList.add('on');
      e.driftPts.textContent = fmt(g.driftPoints * (1 + g.chain));
      e.driftMult.textContent = g.chain > 0 ? `x${1 + g.chain}` : '';
      const tier = g.driftTier;
      e.driftTier.textContent = tier >= 0 ? DRIFT.TIERS[tier].name : 'DRIFT';
      e.drift.style.setProperty('--tier', tier >= 0 ? hex(DRIFT.TIERS[tier].color) : '#ffffff');
      const next = DRIFT.TIERS[Math.min(DRIFT.TIERS.length - 1, tier + 1)];
      const prevAt = tier >= 0 ? DRIFT.TIERS[tier].at : 0;
      const prog = tier >= DRIFT.TIERS.length - 1 ? 1 : (g.driftCharge - prevAt) / (next.at - prevAt);
      e.drift.style.setProperty('--prog', Math.max(0, Math.min(1, prog)).toFixed(3));
    } else e.drift.classList.remove('on');

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

  thrustFail() {
    const b = this.el.thrust.parentElement;
    b.classList.remove('fail'); void b.offsetWidth; b.classList.add('fail');
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

  gameOver(stats) {
    const e = this.el;
    e.overStats.innerHTML = `
      <div class="row big"><span>SCORE</span><b>${fmt(stats.score)}</b></div>
      ${stats.newBest ? '<div class="newbest">NEW PERSONAL BEST</div>' : `<div class="row"><span>BEST</span><b>${fmt(stats.best)}</b></div>`}
      <div class="row"><span>DISTANCE</span><b>${(stats.distance / 1000).toFixed(2)} km</b></div>
      <div class="row"><span>STATIONS RUN</span><b>${stats.stations}</b></div>
      <div class="row"><span>BEST DRIFT</span><b>${fmt(stats.bestDrift)}</b></div>
      <div class="row"><span>COINS</span><b>${fmt(stats.coins)} ◎</b></div>`;
  }
}

import { LIGHTS } from '../systems/Lighting.js';
import { LOOK } from '../systems/Look.js';
import { RENDER } from '../core/Constants.js';
import { GameState } from '../core/GameState.js';

// The lighting bench: open the game with ?tune.
//
// A panel of sliders, one on every number that decides how the game is lit, each wired straight to the table the
// game reads (LIGHTS in systems/Lighting.js, LOOK in systems/Look.js, RENDER in core/Constants.js). Hold the
// game with FREEZE (or P / Esc, the pause keys: on the bench the pause puts nothing over the picture) and move
// them; the still frame follows. STEP lets the game run on for half a second. Nothing here adds a key.
//
// What is set is kept in this browser and is only ever applied when the page is opened with ?tune, so the game
// without it is the game as shipped. SAVE copies every number to the clipboard and, on the dev server, prints
// them in its log ([tune] ...): that is how they get from the bench into the tables.
// This file is only loaded by ?tune. Its style classes are all prefixed tn-: the page already has .bar, .row and .on.

const KEY = 'sd.tune.lights';
const deg = (c) => (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
const cos = (d) => Math.cos((d * Math.PI) / 180);
const round = (v) => +(+v).toPrecision(5);
// a number as the panel shows it: no more decimals than the slider's own step has
const show = (v, step) => String(+(+v).toFixed(Math.max(0, Math.ceil(-Math.log10(step)))));

// a slider on a plain number in a table
const num = (id, label, o, k, min, max, step, unit = '') => ({ id, label, min, max, step, unit, get: () => o[k], set: (v) => { o[k] = v; } });
// a beam's edge or its bright middle: the table holds a cosine, the slider shows the angle out from the beam's axis
const ang = (id, label, o, k, min, max) => ({ id, label, min, max, step: 0.5, unit: '°', get: () => deg(o[k]), set: (v) => { o[k] = cos(v); } });
// a slider that turns a number up and down as a multiple of what it is in the table
const times = (id, label, max, read, write) => ({ id, label, min: 0, max, step: 0.05, unit: '×', get: read, set: write });

/** Every control, in the order shown. `G` is the Game. The last flag: is the group open to begin with. */
function groups(G) {
  const H = LIGHTS.HEAD, T = LIGHTS.TAIL, Lp = LIGHTS.LAMP, Rb = LIGHTS.RIB;
  const fog0 = LOOK.FOG, haze0 = [...LOOK.HAZE], ship0 = LOOK.SHIP, bank0 = [...LOOK.BANK];
  return [
    ['HEADLIGHTS', true, [
      num('head.lift', 'Brightness', H, 'lift', 0, 60, 0.5),
      num('head.gain', 'Detail it brings out', H, 'gain', 0, 30, 0.5),
      num('head.cap', 'Most a surface gets', H, 'cap', 0.05, 3, 0.05),
      ang('head.edge', 'Beam width', H, 'edge', 4, 75),
      ang('head.core', 'Bright middle', H, 'core', 1, 70),
      num('head.reach', 'Reach', H, 'reach', 10, 400, 5, ' m'),
      num('head.half', 'Half as bright by', H, 'half', 2, 200, 1, ' m'),
      { id: 'head.tilt', label: 'Tilt down', min: -0.1, max: 0.5, step: 0.01, unit: '', get: () => -H.dir[1], set: (v) => { H.dir[1] = -v; } },
      num('head.toe', 'Splay apart', H, 'toe', 0, 0.6, 0.01),
      num('head.gap', 'Lamp spacing', H, 'gap', 0.05, 1.5, 0.05, ' m'),
    ]],
    ['TAIL WASH', true, [
      num('tail.lift', 'Brightness', T, 'lift', 0, 20, 0.1),
      num('tail.gain', 'Detail it brings out', T, 'gain', 0, 30, 0.5),
      ang('tail.edge', 'Width', T, 'edge', 10, 89),
      ang('tail.core', 'Bright middle', T, 'core', 1, 80),
      num('tail.reach', 'Reach', T, 'reach', 2, 80, 1, ' m'),
      num('tail.half', 'Half as bright by', T, 'half', 1, 40, 0.5, ' m'),
    ]],
    ['ROADSIDE LAMPS', true, [
      num('lamp.power', 'Light on the ship: power', Lp, 'power', 0, 400, 2),
      num('lamp.reach', 'Light on the ship: reach', Lp, 'reach', 5, 150, 1, ' m'),
      num('lamp.decay', 'Light on the ship: falloff', Lp, 'decay', 0.5, 3, 0.05),
      times('paint.pool', 'Pools painted on the road', 6, () => LIGHTS.PAINT.pool, (v) => { LIGHTS.PAINT.pool = v; G.mats.setPaint('pool', v); }),
    ]],
    ['INSIDE SHIPS', true, [
      num('rib.power', 'Light on the ship: power', Rb, 'power', 0, 300, 2),
      num('rib.reach', 'Light on the ship: reach', Rb, 'reach', 5, 120, 1, ' m'),
      num('rib.decay', 'Light on the ship: falloff', Rb, 'decay', 0.5, 3, 0.05),
      times('paint.spill', 'Neon wash on floor and walls', 6, () => LIGHTS.PAINT.spill, (v) => { LIGHTS.PAINT.spill = v; G.mats.setPaint('spill', v); }),
      { id: 'glass', label: 'Window glass roughness', min: 0.04, max: 1, step: 0.01, unit: '', get: () => LIGHTS.GLASS, set: (v) => { LIGHTS.GLASS = v; G.mats.glass.roughness = v; } },
      num('in.expo', 'Exposure indoors', LOOK.INDOORS, 0, 0.2, 1.5, 0.01, '×'),
      num('in.bloom', 'Bloom indoors', LOOK.INDOORS, 1, 0, 1.5, 0.01, '×'),
    ]],
    ['THE SHIP', false, [
      { id: 'ship.under', label: 'Underglow', min: 0, max: 120, step: 1, unit: '', get: () => G.ship.under.intensity, set: (v) => { G.ship.under.intensity = v; } },
      { id: 'ship.underReach', label: 'Underglow reach', min: 2, max: 40, step: 0.5, unit: ' m', get: () => G.ship.under.distance, set: (v) => { G.ship.under.distance = v; } },
    ]],
    ['SKY AND FILL', false, [
      num('sun.out', 'Starlight outdoors', LIGHTS.SUN, 0, 0, 8, 0.05),
      num('sun.in', 'Starlight indoors', LIGHTS.SUN, 1, 0, 3, 0.01),
      num('ambient', 'Soft fill', LOOK, 'AMBIENT', 0, 2.5, 0.01),
    ]],
    ['BLOOM AND EXPOSURE', false, [
      num('expo', 'Exposure', RENDER, 'EXPOSURE', 0.3, 2.5, 0.01),
      num('bloom.strength', 'Bloom strength', RENDER, 'BLOOM_STRENGTH', 0, 2.5, 0.01),
      num('bloom.radius', 'Bloom spread', RENDER, 'BLOOM_RADIUS', 0, 1, 0.01),
      num('bloom.threshold', 'Bloom starts at', RENDER, 'BLOOM_THRESHOLD', 0, 2, 0.01),
    ]],
    ['HAZE', false, [
      times('haze.light', 'Haze brightness', 4, () => LOOK.HAZE[1] / haze0[1], (v) => { LOOK.HAZE = haze0.map((x) => x * v); }),
      times('haze.fog', 'Thin fog everywhere', 6, () => LOOK.FOG / fog0, (v) => { LOOK.FOG = fog0 * v; }),
      times('haze.ship', 'Banks round ships', 4, () => LOOK.SHIP / ship0, (v) => { LOOK.SHIP = ship0 * v; }),
      times('haze.bank', 'Banks along the road', 4, () => LOOK.BANK[0] / bank0[0], (v) => { LOOK.BANK = bank0.map((x) => x * v); }),
      num('haze.glow', 'Glow at a bank’s heart', LOOK, 'GLOW', 0, 8, 0.05),
    ]],
    ['GRADE', false, [
      num('grade.gamma', 'Contrast (gamma)', LOOK, 'GAMMA', 0.6, 2, 0.01),
      num('grade.vignette', 'Vignette', LOOK, 'VIGNETTE', 0, 1, 0.01),
      num('grade.scan', 'Scanlines', LOOK, 'SCAN', 0, 0.3, 0.005),
      num('grade.grain', 'Grain', LOOK, 'GRAIN', 0, 0.2, 0.005),
    ]],
  ];
}

const CSS = `
#tune { position: fixed; top: 0; right: 0; bottom: 0; width: 318px; z-index: 60; display: flex; flex-direction: column;
  background: rgba(4, 6, 10, 0.84); border-left: 1px solid rgba(255, 255, 255, 0.14); color: #dfe6ee;
  font: 500 12px/1.25 ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.01em; pointer-events: auto; }
#tune.tn-shut { display: none; }
#tuneTab { position: fixed; top: 10px; right: 10px; z-index: 60; display: none; pointer-events: auto; }
#tuneTab.tn-on { display: block; }
#tune button, #tuneTab { font: 700 11px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.08em; color: #dfe6ee; cursor: pointer;
  background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 4px; padding: 7px 8px; }
#tune button:hover, #tuneTab:hover { background: rgba(255, 255, 255, 0.18); }
#tune button.tn-on { background: #dfe6ee; color: #05070c; }
#tune .tn-bar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 10px 10px 6px; }
#tune .tn-note { padding: 0 10px 8px; color: rgba(223, 230, 238, 0.62); font-size: 11px; min-height: 28px; }
#tune .tn-note b { color: #fff; font-weight: 700; }
#tune .tn-list { overflow-y: auto; flex: 1; min-height: 0; padding-bottom: 20px; overscroll-behavior: contain; }
#tune details { border-top: 1px solid rgba(255, 255, 255, 0.1); }
#tune summary { cursor: pointer; padding: 8px 10px 7px; font: 700 11px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.14em; color: #fff; list-style: none; }
#tune summary::before { content: '+ '; opacity: 0.6; }
#tune details[open] summary::before { content: '\\2212  '; }
#tune .tn-row { display: grid; grid-template-columns: 1fr 58px; gap: 1px 8px; padding: 3px 10px 5px; align-items: center; }
#tune .tn-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#tune .tn-row output { text-align: right; font-variant-numeric: tabular-nums; color: rgba(223, 230, 238, 0.7); cursor: pointer; }
#tune .tn-row.tn-moved span, #tune .tn-row.tn-moved output { color: #fff; font-weight: 700; }
#tune .tn-row.tn-moved output::after { content: ' \\21BA'; opacity: 0.7; }
#tune input[type=range] { grid-column: 1 / 3; width: 100%; margin: 0; height: 16px; accent-color: #dfe6ee; cursor: pointer; }
body.tune-nohud #hud { visibility: hidden; }
`;

export class TunePanel {
  constructor(game) {
    this.game = game;
    document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    const root = (this.root = el('div')); root.id = 'tune';
    const bar = el('div', 'tn-bar');
    const btn = (text, fn) => { const b = el('button', '', text); b.type = 'button'; b.addEventListener('click', fn); bar.appendChild(b); return b; };
    this.freeze = btn('FREEZE', () => game.tuneFreeze());
    btn('STEP ½ S', () => game.tuneStepBy(30));
    this.hudBtn = btn('HIDE HUD', () => { const off = document.body.classList.toggle('tune-nohud'); this.hudBtn.classList.toggle('tn-on', off); });
    btn('RESET ALL', () => this.reset());
    btn('SAVE', () => this.save());
    btn('HIDE PANEL', () => this.shut(true));
    root.appendChild(bar);
    this.note = el('div', 'tn-note'); root.appendChild(this.note);
    const list = el('div', 'tn-list'); root.appendChild(list);

    this.rows = [];
    for (const [title, open, controls] of groups(game)) {
      const d = el('details'); d.open = open; d.appendChild(el('summary', '', title));
      for (const c of controls) {
        const row = el('label', 'tn-row'), name = el('span', '', c.label), out = el('output'), input = el('input');
        input.type = 'range'; input.min = c.min; input.max = c.max; input.step = c.step;
        row.append(name, out, input); d.appendChild(row);
        const r = { c, row, out, input, base: c.get() };
        input.addEventListener('input', () => { c.set(Number(input.value)); this.changed(); });
        out.title = 'Click to put this one back';
        out.addEventListener('click', (e) => { e.preventDefault(); c.set(r.base); this.changed(); });
        this.rows.push(r);
      }
      list.appendChild(d);
    }
    document.body.appendChild(root);
    this.tab = el('button', '', 'LIGHTS'); this.tab.id = 'tuneTab'; this.tab.type = 'button';
    this.tab.addEventListener('click', () => this.shut(false));
    document.body.appendChild(this.tab);

    // A slider or a button that keeps the keyboard would take the arrow keys and Space away from the ship.
    for (const ev of ['pointerup', 'change', 'click']) root.addEventListener(ev, () => setTimeout(() => document.activeElement?.blur?.(), 0));
    this.tab.addEventListener('click', () => this.tab.blur());

    // what was set last time on this browser
    let kept = {};
    try { kept = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* nothing kept */ }
    for (const r of this.rows) if (typeof kept[r.c.id] === 'number') r.c.set(kept[r.c.id]);
    this.changed(false);
    setInterval(() => this.status(), 200);
    this.status();
  }

  /** After any change: keep the beams sane, show every number as the tables now have it, and keep it. */
  changed(keep = true) {
    // a beam's bright middle is always inside its edge (the shader divides by the difference)
    for (const b of [LIGHTS.HEAD, LIGHTS.TAIL]) b.core = Math.max(b.core, Math.cos(Math.acos(b.edge) - 0.0087));
    const all = {};
    for (const r of this.rows) {
      const v = r.c.get(), moved = Math.abs(v - r.base) > Math.abs(r.c.step) * 0.25;
      r.input.value = v; r.out.textContent = show(v, r.c.step) + (r.c.unit || ''); r.row.classList.toggle('tn-moved', moved);
      if (moved) all[r.c.id] = round(v);
    }
    this.moved = all;
    if (keep) { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private window */ } }
  }

  reset() {
    for (const r of this.rows) r.c.set(r.base);
    this.changed();
    this.say('Everything is back as shipped.');
  }

  /** Copy every number, and hand them to the dev server's log when there is one. */
  save() {
    const all = {};
    for (const r of this.rows) all[r.c.id] = round(r.c.get());
    const pack = { changed: this.moved, all };
    navigator.clipboard?.writeText(JSON.stringify(pack, null, 1)).catch(() => {});
    fetch('/__tune?' + encodeURIComponent(JSON.stringify(pack)))
      .then((res) => this.say(res.ok ? 'Saved. Tell Claude to read them.' : 'Copied to the clipboard.'))
      .catch(() => this.say('Copied to the clipboard.'));
  }

  shut(yes) { this.root.classList.toggle('tn-shut', yes); this.tab.classList.toggle('tn-on', yes); }

  say(text) { this.said = text; this.saidAt = performance.now(); this.status(); }

  status() {
    const p = GameState.phase, held = p === 'paused';
    this.freeze.textContent = held ? 'RESUME' : 'FREEZE'; this.freeze.classList.toggle('tn-on', held);
    const n = Object.keys(this.moved || {}).length;
    if (this.said && performance.now() - this.saidAt < 4000) { this.note.textContent = this.said; return; }
    this.note.innerHTML = (p === 'playing' || held ? (held ? '<b>Held.</b> ' : 'P or Esc holds the game too. ') : 'Start a run, then FREEZE. ')
      + (n ? `<b>${n}</b> changed, kept in this browser.` : 'Click a number to put it back.');
  }
}

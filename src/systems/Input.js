// Keyboard, gamepad and touch merged into what the ship understands: steer, drift, brake.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.touch = { steer: 0, drift: false };
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.bindTouch();
    this.padPrev = [];
    this.out = { steer: 0, drift: false, brake: false };
  }

  // Touch: left and right thirds steer, the middle is the drift button.
  bindTouch() {
    const zones = new Map();
    const recompute = () => {
      let steer = 0, drift = false;
      for (const z of zones.values()) { if (z === 'L') steer -= 1; else if (z === 'R') steer += 1; else drift = true; }
      this.touch = { steer: Math.max(-1, Math.min(1, steer)), drift };
    };
    const zoneFor = (x) => { const w = window.innerWidth; return x < w * 0.3 ? 'L' : x > w * 0.7 ? 'R' : 'D'; };
    const opts = { passive: false };
    window.addEventListener('touchstart', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      for (const t of e.changedTouches) zones.set(t.identifier, zoneFor(t.clientX));
      recompute(); this.pressed.add('Touch');
    }, opts);
    window.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) zones.set(t.identifier, zoneFor(t.clientX)); recompute(); }, opts);
    const end = (e) => { for (const t of e.changedTouches) zones.delete(t.identifier); recompute(); };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
  }

  has(...codes) { return codes.some((c) => this.keys.has(c)); }
  tap(...codes) { return codes.some((c) => this.pressed.has(c)); }

  read() {
    let steer = 0;
    if (this.has('ArrowLeft', 'KeyA')) steer -= 1;
    if (this.has('ArrowRight', 'KeyD')) steer += 1;
    let drift = this.has('Space', 'ShiftLeft', 'ShiftRight', 'KeyJ');
    let brake = this.has('ArrowDown', 'KeyS', 'KeyK');
    steer += this.touch.steer; drift = drift || this.touch.drift;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.15) steer += ax;
      if (p.buttons[14]?.pressed) steer -= 1;
      if (p.buttons[15]?.pressed) steer += 1;
      const b = (i) => p.buttons[i]?.pressed || (p.buttons[i]?.value || 0) > 0.4;
      if (b(0) || b(7) || b(5)) drift = true;   // A / RT / RB
      if (b(1) || b(2) || b(6)) brake = true;   // B / X / LT
      const prev = this.padPrev[p.index] || [];
      const edge = (i) => b(i) && !prev[i];
      if (edge(3)) this.pressed.add('KeyC');      // Y: camera
      if (edge(9)) this.pressed.add('Escape');    // Start: pause
      if (edge(0) || edge(9)) this.pressed.add('PadStart');
      this.padPrev[p.index] = p.buttons.map((_, i) => b(i));
    }
    const o = this.out;
    o.steer = Math.max(-1, Math.min(1, steer)); o.drift = drift; o.brake = brake;
    return o;
  }

  endFrame() { this.pressed.clear(); }
}

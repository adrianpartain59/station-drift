// Keyboard, gamepad and touch merged into one state the game reads each frame.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.touch = { steer: 0, drift: false, hop: false };
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.bindTouch();
    this.padPrev = [];
  }

  bindTouch() {
    const zones = new Map();
    const recompute = () => {
      let steer = 0, drift = false, hop = false;
      for (const z of zones.values()) {
        if (z === 'L') steer -= 1; else if (z === 'R') steer += 1; else if (z === 'D') drift = true; else if (z === 'B') hop = true;
      }
      this.touch = { steer: Math.max(-1, Math.min(1, steer)), drift, hop };
    };
    const zoneFor = (x, y) => {
      const w = window.innerWidth, h = window.innerHeight;
      if (x < w * 0.3) return 'L';
      if (x > w * 0.7) return 'R';
      return y < h * 0.5 ? 'B' : 'D';
    };
    const opts = { passive: false };
    window.addEventListener('touchstart', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      for (const t of e.changedTouches) zones.set(t.identifier, zoneFor(t.clientX, t.clientY));
      // Holding a steer side while also touching the centre bottom = drift.
      recompute(); this.pressed.add('Touch');
    }, opts);
    window.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) zones.set(t.identifier, zoneFor(t.clientX, t.clientY)); recompute(); }, opts);
    const end = (e) => { for (const t of e.changedTouches) zones.delete(t.identifier); recompute(); };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
  }

  has(...codes) { return codes.some((c) => this.keys.has(c)); }
  tap(...codes) { return codes.some((c) => this.pressed.has(c)); }

  read() {
    let steer = 0;
    if (this.has('ArrowLeft', 'KeyA')) steer -= 1;
    if (this.has('ArrowRight', 'KeyD')) steer += 1;
    let drift = this.has('Space', 'ShiftLeft', 'KeyJ');
    let hop = this.has('ArrowUp', 'KeyW', 'KeyK');
    let brake = this.has('ArrowDown', 'KeyS');
    steer += this.touch.steer; drift = drift || this.touch.drift; hop = hop || this.touch.hop;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.15) steer += ax;
      if (p.buttons[14]?.pressed) steer -= 1;
      if (p.buttons[15]?.pressed) steer += 1;
      const b = (i) => p.buttons[i]?.pressed || (p.buttons[i]?.value || 0) > 0.4;
      if (b(0) || b(7) || b(5)) drift = true;   // A / RT / RB
      if (b(2) || b(1) || b(6)) hop = true;     // X / B / LT
      if (b(13)) brake = true;
      const prev = this.padPrev[p.index] || [];
      const edge = (i) => b(i) && !prev[i];
      if (edge(3)) this.pressed.add('KeyC');      // Y: camera
      if (edge(9)) this.pressed.add('Escape');    // Start: pause
      if (edge(0) || edge(9)) this.pressed.add('PadStart');
      this.padPrev[p.index] = p.buttons.map((_, i) => b(i));
    }
    return { steer: Math.max(-1, Math.min(1, steer)), drift, hop, brake };
  }

  endFrame() { this.pressed.clear(); }
}

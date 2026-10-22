// Unified keyboard + pointer + touch input. Touch controls feed the same axes as the keyboard.
export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.axis = { x: 0, y: 0 }; // touch joystick (x steer, y throttle)
    this.look = { dx: 0, dy: 0, zoom: 0 };
    this.touchHeld = new Set(); // virtual keys held from touch buttons
    this.dragging = false;
    this.lastLookTime = -1e9;

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    let lx = 0, ly = 0, pid = null;
    dom.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;
      pid = e.pointerId; lx = e.clientX; ly = e.clientY; this.dragging = true;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      this.look.dx += e.clientX - lx; this.look.dy += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      this.lastLookTime = performance.now();
    });
    const up = (e) => { if (e.pointerId === pid) { pid = null; this.dragging = false; } };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => { this.look.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  down(...codes) {
    for (const c of codes) if (this.keys.has(c) || this.touchHeld.has(c)) return true;
    return false;
  }

  hit(code) { return this.pressed.has(code); }
  tap(code) { this.pressed.add(code); }

  throttle() {
    let t = this.axis.y;
    if (this.down('KeyW', 'ArrowUp')) t += 1;
    if (this.down('KeyS', 'ArrowDown')) t -= 1;
    return Math.max(-1, Math.min(1, t));
  }

  steer() {
    let s = this.axis.x;
    if (this.down('KeyA', 'ArrowLeft')) s -= 1;
    if (this.down('KeyD', 'ArrowRight')) s += 1;
    return Math.max(-1, Math.min(1, s));
  }

  endFrame() {
    this.pressed.clear();
    this.look.dx = this.look.dy = this.look.zoom = 0;
  }
}

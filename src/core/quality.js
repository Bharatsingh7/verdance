// Quality presets + automatic downgrade when the frame rate stays low.
export const PRESETS = [
  { name: 'Low', pixel: 0.85, view: 800, veg: 220, near: 70, density: 0.4, shadows: 0, npcs: 8, sites: 600, underwater: 0 },
  { name: 'Medium', pixel: 1, view: 1100, veg: 320, near: 100, density: 0.65, shadows: 1, npcs: 20, sites: 800, underwater: 1 },
  { name: 'High', pixel: 1.5, view: 1400, veg: 420, near: 130, density: 0.85, shadows: 2, npcs: 40, sites: 1000, underwater: 2 },
];

export class Quality {
  constructor(level, onChange) {
    this.level = level;
    this.onChange = onChange;
    this.acc = 0; this.frames = 0; this.low = 0;
    this.auto = true;
    this.grace = 8; // seconds before judging (loading hitches)
  }
  get preset() { return PRESETS[this.level]; }
  set(level, manual = false) {
    this.level = (level + PRESETS.length) % PRESETS.length;
    if (manual) this.auto = false;
    this.low = 0; this.grace = 6;
    this.onChange(this.preset);
  }
  sample(dt) {
    if (this.grace > 0) { this.grace -= dt; return; }
    this.acc += dt; this.frames++;
    if (this.acc < 2) return;
    const fps = this.frames / this.acc;
    this.acc = 0; this.frames = 0;
    this.fps = fps;
    if (!this.auto || this.level === 0) return;
    this.low = fps < 45 ? this.low + 1 : 0;
    if (this.low >= 3) this.set(this.level - 1);
  }
}

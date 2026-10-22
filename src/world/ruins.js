// Ruins of the old world, reclaimed by nature. Each landmark is merged into one or two meshes
// (lit + glow material groups) with simple colliders registered on the World.
import * as THREE from 'three';
import { Builder, staticMats, vegGeometry } from './models.js';
import { heightAt, VALLEY_DATA, WATER_LEVEL } from './terrain.js';
import { LANDMARKS, TRACK, GORGE } from './features.js';
import { mulberry32 } from '../core/rng.js';

const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (a, b, h, s = 8, open = false) => new THREE.CylinderGeometry(a, b, h, s, 1, open);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const cone = (r, h, s = 6) => new THREE.ConeGeometry(r, h, s);

const CONCRETE = [0xb9b4a8, 0xa8a59c, 0xc4bdae, 0x9d9a92, 0xb3aa98];
const MOSS = [0x5e8a3a, 0x6f9a42, 0x4f7d34];
const RUST = [0x8a4f2e, 0x9a6a3e, 0x7a5a48, 0x5f7a8a, 0x8a3a32, 0xb8a888];
const DARKWIN = 0x2c3236;

const MATS = staticMats();

class Kit {
  constructor(world, ox, oz, seed) {
    this.b = new Builder();
    this.world = world;
    this.ox = ox; this.oz = oz;
    this.rnd = mulberry32(seed);
    this.colliders = [];
    this.animated = [];
  }
  r(a = 0, b = 1) { return a + (b - a) * this.rnd(); }
  pick(arr) { return arr[Math.floor(this.rnd() * arr.length)]; }
  g(lx, lz) { return heightAt(this.ox + lx, this.oz + lz); }
  add(geom, color, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, o) { this.b.add(geom, color, x, y, z, rx, ry, rz, sx, sy, sz, o); return this; }
  // rot is the negated mesh rotation.y (callers pass -ry); physics wants ry.
  collideBox(lx, lz, hw, hd, rot, y0, top) { this.colliders.push({ x: this.ox + lx, z: this.oz + lz, hw, hd, rot: -rot, y0, top }); }
  collideCircle(lx, lz, r, y0, top) { this.colliders.push({ x: this.ox + lx, z: this.oz + lz, r, y0, top }); }

  // A real tree from the vegetation kit (rooftops, streets, overgrown corners).
  tree(x, y, z, s = 1) {
    const g = vegGeometry(this.pick(['oak', 'oak', 'maple', 'birch']), 0);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.r(0, 6.28)), new THREE.Vector3(1, 1, 1).multiplyScalar(s * 0.5));
    this.b.addBuilt(g, m);
  }

  vines(x, y0, y1, z, rot) {
    const n = Math.floor(this.r(1, 4));
    for (let i = 0; i < n; i++) {
      const h = (y1 - y0) * this.r(0.3, 0.9);
      const off = this.r(-2, 2);
      this.add(box(0.35, h, 0.12), this.pick(MOSS), x + Math.cos(rot) * off, y1 - h / 2, z - Math.sin(rot) * off, 0, rot, 0);
    }
  }

  // Overgrown concrete tower with window bands, broken crown, moss ledges, vines and a rooftop tree.
  tower(x, z, w, d, floors, rot = 0, opts = {}) {
    const y = this.g(x, z) - 0.5;
    const fh = 3.6;
    const col = this.pick(CONCRETE);
    const lean = opts.lean || 0;
    const full = floors * fh;
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    // core
    let p = P(0, full / 2, 0);
    this.add(box(w, full, d), col, p[0], p[1], p[2], lean, rot, lean * 0.5, 1, 1, 1, { shade: 0.08 });
    // window bands (recessed dark strips on each face)
    for (let f = 1; f < floors; f++) {
      const wy = f * fh + 0.4;
      if (this.rnd() < 0.15) continue;
      p = P(0, wy, 0);
      this.add(box(w + 0.1, 1.3, d * 0.86), DARKWIN, p[0], p[1], p[2], lean, rot, lean * 0.5);
      this.add(box(w * 0.86, 1.3, d + 0.1), DARKWIN, p[0], p[1], p[2], lean, rot, lean * 0.5);
      if (this.rnd() < 0.3) { p = P(this.r(-w / 3, w / 3), wy - 1.1, d / 2 + 0.3); this.add(box(this.r(2, 5), 0.5, 0.8), this.pick(MOSS), p[0], p[1], p[2], 0, rot, 0); }
    }
    // broken crown: jagged chunks of the next floors
    for (let i = 0; i < 5; i++) {
      const bw = this.r(w * 0.2, w * 0.5), bh = this.r(1, fh * 1.6);
      p = P(this.r(-w / 2 + bw / 2, w / 2 - bw / 2), full + bh / 2, this.r(-d / 2 + 1, d / 2 - 1));
      this.add(box(bw, bh, this.r(2, d * 0.5)), col, p[0], p[1], p[2], lean, rot + this.r(-0.1, 0.1), this.r(-0.15, 0.15));
    }
    // rebar
    for (let i = 0; i < 4; i++) { p = P(this.r(-w / 2, w / 2), full + 2, this.r(-d / 2, d / 2)); this.add(cyl(0.05, 0.05, this.r(2, 4), 3), 0x6a4a3a, p[0], p[1], p[2], this.r(-0.3, 0.3), 0, this.r(-0.3, 0.3)); }
    // moss cap + rooftop tree
    p = P(0, full + 0.1, 0);
    this.add(box(w * 0.8, 0.4, d * 0.7), this.pick(MOSS), p[0], p[1], p[2], lean, rot, lean * 0.5, 1, 1, 1, { shade: 0.1 });
    if (this.rnd() < 0.7) { p = P(this.r(-w / 4, w / 4), full, this.r(-d / 4, d / 4)); this.tree(p[0], p[1], p[2], this.r(1.2, 2.2)); }
    // vines on the faces
    p = P(0, 0, d / 2 + 0.1); this.vines(p[0], y + 2, y + full, p[2], rot);
    p = P(0, 0, -d / 2 - 0.1); this.vines(p[0], y + 2, y + full, p[2], rot);
    // rubble at the base
    for (let i = 0; i < 4; i++) { p = P(this.r(-w, w), 0.5, this.r(-d, d)); this.add(box(this.r(1, 3), this.r(0.6, 1.4), this.r(1, 3)), col, p[0], p[1], p[2], this.r(0, 0.5), this.r(0, 3), this.r(0, 0.5)); }
    this.collideBox(x, z, w / 2, d / 2, -rot, y, y + full);
  }

  // Rusty car, sunk a little into the ground, with moss on the roof.
  car(x, z, rot, sink = 0.25) {
    const y = this.g(x, z) - sink;
    const col = this.pick(RUST);
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    let p = P(0, 0.6, 0); this.add(box(1.9, 0.75, 4.3), col, p[0], p[1], p[2], 0, rot, this.r(-0.05, 0.05), 1, 1, 1, { mat: 4 });
    p = P(0, 1.25, -0.3); this.add(box(1.7, 0.6, 2.2), col, p[0], p[1], p[2], 0, rot, 0, 1, 1, 1, { mat: 4 });
    p = P(0, 1.25, -0.3); this.add(box(1.75, 0.45, 2.0), DARKWIN, p[0], p[1], p[2], 0, rot, 0);
    p = P(0, 1.58, -0.3); this.add(box(1.4, 0.1, 1.8), this.pick(MOSS), p[0], p[1], p[2], 0, rot, 0);
    for (const [wx, wz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) { p = P(wx, 0.3, wz); this.add(cyl(0.35, 0.35, 0.3, 7), 0x2a2a2a, p[0], p[1], p[2], 0, rot, Math.PI / 2); }
    if (this.rnd() < 0.5) { p = P(this.r(-1, 1), 0.4, this.r(-2.5, 2.5)); this.add(ico(0.8), this.pick(MOSS), p[0], p[1], p[2], 0, 0, 0, 1, 0.6, 1, { jitter: 0.3 }); }
    this.collideBox(x, z, 1.0, 2.2, -rot, y, y + 1.8);
  }

  house(x, z, rot, roofCol) {
    const y = this.g(x, z) - 0.2;
    const w = this.r(7, 9), d = this.r(8, 11), h = 3.2;
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    const wall = this.pick([0xe8e0cc, 0xd8c8a8, 0xc8d4d0, 0xe0c8b8]);
    let p = P(0, h / 2, 0); this.add(box(w, h, d), wall, p[0], p[1], p[2], 0, rot, 0, 1, 1, 1, { shade: 0.06 });
    const collapsed = this.rnd() < 0.35;
    const roof = new THREE.CylinderGeometry(1, 1, 1, 3, 1); // triangular prism
    p = P(0, h + 1.2, 0);
    if (!collapsed) this.add(roof, roofCol, p[0], p[1], p[2], 0, rot, Math.PI / 2, 1.9, d + 0.6, w * 0.62);
    else { this.add(box(w * 0.6, 0.2, d * 0.9), roofCol, p[0] - 1, y + h + 0.2, p[2], 0.1, rot, 0.4); this.tree(p[0], y, p[2], 1.3); }
    // door + windows
    p = P(0, 1.1, d / 2 + 0.05); this.add(box(1.1, 2.1, 0.1), 0x4a3a2c, p[0], p[1], p[2], 0, rot, 0);
    for (const sx of [-2.4, 2.4]) { p = P(sx, 1.7, d / 2 + 0.05); this.add(box(1.2, 1, 0.1), DARKWIN, p[0], p[1], p[2], 0, rot, 0); }
    // chimney, vines, porch plants
    p = P(w / 3, h + 2, -d / 4); this.add(box(0.7, 2.2, 0.7), 0x9a6a50, p[0], p[1], p[2], 0, rot, 0);
    p = P(-w / 2 - 0.1, 0, 0); this.vines(p[0], y + 0.5, y + h, p[2], rot + Math.PI / 2);
    for (let i = 0; i < 3; i++) { p = P(this.r(-w / 2, w / 2), 0.4, d / 2 + this.r(1, 3)); this.add(ico(0.7), this.pick([0x6f9a42, 0x8aa84a]), p[0], p[1], p[2], 0, 0, 0, 1, 0.7, 1, { jitter: 0.25 }); }
    // fence
    for (let i = -4; i <= 4; i++) {
      if (this.rnd() < 0.25) continue;
      p = P(i * 1.2, 0.5, d / 2 + 5); this.add(box(0.12, 1, 0.12), 0xe8e4d8, p[0], p[1], p[2], 0, rot, this.r(-0.3, 0.3));
    }
    this.collideBox(x, z, w / 2, d / 2, -rot, y, y + h + 3);
  }

  build(scene, name) {
    const g = this.b.build();
    const mesh = new THREE.Mesh(g, MATS);
    mesh.position.set(this.ox, 0, this.oz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = name;
    scene.add(mesh);
    for (const c of this.colliders) this.world.addStatic(c.x, c.z, c);
    return mesh;
  }
}

// Canvas-texture sign.
function sign(text, w, h, bg, fg, font = 'bold 64px sans-serif') {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w);
  const x = cv.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, cv.width / 2, cv.height / 2);
  // weathering
  for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(90,120,60,${Math.random() * 0.35})`; x.fillRect(Math.random() * cv.width, Math.random() * cv.height, Math.random() * 30, Math.random() * 12); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.85 }));
}

// ---------------------------------------------------------------------------------
const BUILDERS = {
  city(k) {
    const sp = 46;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const x = i * sp + k.r(-4, 4), z = j * sp + k.r(-4, 4);
      if (Math.hypot(x, z) > 160 || (i === 0 && j === 0)) continue;
      const roll = k.rnd();
      if (roll < 0.15) { // collapsed into a mossy mound
        const y = k.g(x, z);
        k.add(ico(12, 0), k.pick(CONCRETE), x, y, z, 0, k.r(0, 3), 0, 1.3, 0.45, 1.1, { jitter: 4, shade: 0.15 });
        k.add(ico(10, 0), k.pick(MOSS), x + 2, y + 1.5, z, 0, k.r(0, 3), 0, 1.2, 0.4, 1, { jitter: 3, shade: 0.15 });
        k.tree(x - 3, y + 3, z + 2, 1.8);
        continue;
      }
      const floors = Math.floor(k.r(3, 13) * (1 - Math.hypot(x, z) / 260));
      k.tower(x, z, k.r(16, 24), k.r(16, 24), Math.max(2, floors), k.r(-0.05, 0.05), { lean: k.rnd() < 0.2 ? k.r(-0.06, 0.06) : 0 });
    }
    // The great fallen tower lying across the avenue.
    const y0 = k.g(0, 0);
    k.add(box(18, 18, 70), 0xb9b4a8, 10, y0 + 6, -8, 0.06, 0.6, 0.12, 1, 1, 1, { shade: 0.08 });
    for (let f = 0; f < 16; f++) k.add(box(18.2, 1.3, 2.6), DARKWIN, 10 + Math.sin(0.6) * (f * 4 - 30), y0 + 6, -8 + Math.cos(0.6) * (f * 4 - 30), 0.06, 0.6, 0.12);
    k.add(box(14, 0.6, 50), MOSS[0], 10, y0 + 15.3, -8, 0.06, 0.6, 0.12, 1, 1, 1, { shade: 0.15 });
    k.tree(4, y0 + 15, -14, 2); k.tree(16, y0 + 16, -2, 1.6);
    k.collideBox(10, -8, 9, 35, -0.6, y0, y0 + 15);
    // Streets: broken slabs + cars + street trees.
    for (let a = -3; a <= 3; a++) for (let t = -150; t < 150; t += 8) {
      for (const [x, z] of [[a * sp + sp / 2, t], [t, a * sp + sp / 2]]) {
        if (Math.hypot(x, z) > 165 || k.rnd() < 0.35) continue;
        k.add(box(k.r(6, 8), 0.25, k.r(6, 8)), 0x55594f, x + k.r(-1, 1), k.g(x, z) + 0.05, z + k.r(-1, 1), k.r(-0.04, 0.04), k.r(-0.1, 0.1), k.r(-0.04, 0.04));
        if (k.rnd() < 0.06) k.car(x + k.r(-2, 2), z + k.r(-2, 2), k.r(0, 6));
        else if (k.rnd() < 0.08) k.tree(x + 4, k.g(x + 4, z), z, k.r(1.4, 2.4));
      }
    }
  },

  overpass(k) {
    const dir = new THREE.Vector2(400, -240).normalize();
    const pts = [];
    for (let i = -6; i <= 6; i++) pts.push([dir.x * i * 26, dir.y * i * 26]);
    const rot = Math.atan2(dir.x, dir.y);
    const hs = pts.map(([x, z]) => k.g(x, z) + 11);
    pts.forEach(([x, z], i) => {
      const y = k.g(x, z);
      if (i === 4) return; // pillar gone
      k.add(box(2.4, hs[i] - y + 2, 2.4), 0xb3ada0, x, (hs[i] + y) / 2 - 1, z, 0, rot, 0, 1, 1, 1, { shade: 0.08 });
      k.add(box(10, 1.2, 2.6), 0xa8a296, x, hs[i] - 0.4, z, 0, rot + Math.PI / 2, 0);
      k.vines(x, y + 1, hs[i] - 1, z + 1.3, rot);
      k.collideCircle(x, z, 1.7, y, hs[i]);
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (i === 3 || i === 4) { // collapsed span, one end resting on the ground
        const ya = i === 3 ? hs[i] : k.g(ax, az) + 0.5, yb = i === 3 ? k.g(bx, bz) + 0.5 : hs[i + 1];
        const pitch = Math.atan2(yb - ya, 26);
        k.add(box(12, 1, 27), 0x9d988c, mx, (ya + yb) / 2, mz, -pitch * Math.cos(0), rot, 0, 1, 1, 1, { shade: 0.1 });
        k.add(box(9, 0.3, 20), MOSS[1], mx, (ya + yb) / 2 + 0.6, mz, -pitch, rot, 0, 1, 1, 1, { shade: 0.2 });
        k.collideBox(mx, mz, 6, 13, -rot, Math.min(ya, yb) - 2, Math.max(ya, yb) * 0.5 + Math.min(ya, yb) * 0.5);
        continue;
      }
      const pitch = Math.atan2(hs[i + 1] - hs[i], 26);
      const y = (hs[i] + hs[i + 1]) / 2 + 0.6;
      k.add(box(12, 1, 26.5), 0xa8a296, mx, y, mz, -pitch, rot, 0, 1, 1, 1, { shade: 0.08 });
      k.add(box(0.5, 1, 26.5), 0xc4bdae, mx + Math.cos(rot) * 5.8, y + 0.9, mz - Math.sin(rot) * 5.8, -pitch, rot, 0);
      k.add(box(0.5, 1, 26.5), 0xc4bdae, mx - Math.cos(rot) * 5.8, y + 0.9, mz + Math.sin(rot) * 5.8, -pitch, rot, 0);
      k.add(box(k.r(4, 9), 0.3, k.r(8, 18)), k.pick(MOSS), mx + k.r(-2, 2), y + 0.6, mz, -pitch, rot, 0, 1, 1, 1, { shade: 0.2 });
      if (k.rnd() < 0.5) { const t = k.r(-8, 8); k.tree(mx + Math.sin(rot) * t, y + 0.5, mz + Math.cos(rot) * t, 1.2); }
    }
    // A traffic jam that never cleared, on the ground beneath.
    for (let i = 0; i < 7; i++) k.car(dir.x * (i * 9 - 40) + k.r(-6, 6) + 14, dir.y * (i * 9 - 40) + k.r(-3, 3) + 20, rot + k.r(-0.4, 0.4));
    const sg = sign('EXIT 12  ·  HOME', 10, 2.4, '#2f6b4a', '#f2f2e8', 'bold 56px sans-serif');
    sg.position.set(k.ox + dir.x * 26 * 2, hs[8] + 3.5, k.oz + dir.y * 26 * 2); sg.rotation.y = rot + Math.PI / 2;
    return [sg];
  },

  village(k) {
    const roofs = [0xa8553a, 0x5a6f8a, 0x7a4a3a, 0x6a7a5a];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + k.r(-0.2, 0.2), r = k.r(30, 62);
      k.house(Math.cos(a) * r, Math.sin(a) * r, -a + Math.PI / 2 + Math.PI, k.pick(roofs));
    }
    // Old playground swing + mailbox + a car in a driveway.
    const y = k.g(0, 0);
    k.add(box(0.15, 3, 0.15), 0xb85a3a, -2, y + 1.5, 0, 0, 0, 0.2).add(box(0.15, 3, 0.15), 0xb85a3a, 2, y + 1.5, 0, 0, 0, -0.2).add(box(4.4, 0.15, 0.15), 0xb85a3a, 0, y + 2.9, 0);
    k.add(box(0.05, 1.6, 0.05), 0x666666, -0.6, y + 2.0, 0).add(box(0.05, 1.6, 0.05), 0x666666, 0.6, y + 2.0, 0).add(box(1.3, 0.08, 0.4), 0x8a5a3a, 0, y + 1.2, 0);
    k.car(18, -10, 0.4); k.car(-25, 22, 2.1);
    for (let i = 0; i < 6; i++) { const x = k.r(-70, 70), z = k.r(-70, 70); k.tree(x, k.g(x, z), z, k.r(1.5, 2.2)); }
  },

  turbines(k) {
    const spots = [[0, 0], [80, -50], [-70, 40], [150, 20], [40, 110]];
    const parts = [];
    spots.forEach(([x, z], i) => {
      const y = k.g(x, z);
      if (i === 3) { // fallen tower
        k.add(cyl(1.0, 1.6, 44, 8), 0xe8e4dc, x + 20, y + 1.2, z, 0, 0.6, Math.PI / 2 - 0.03, 1, 1, 1, { shade: 0.06 });
        k.add(box(3, 3, 7), 0xd8d4cc, x + 43, y + 1.6, z - 1, 0, 0.6, 0.2);
        k.add(box(1.4, 0.4, 24), 0xe8e4dc, x + 46, y + 0.5, z + 10, 0, 1.1, 0.1);
        k.add(cyl(1.8, 1.8, 1.2, 8), 0x9a9a92, x, y + 0.6, z);
        k.collideBox(x + 20, z, 22, 1.7, -0.6, y, y + 3);
        return;
      }
      k.add(cyl(0.9, 1.6, 46, 8), 0xe8e4dc, x, y + 23, z, 0, 0, 0, 1, 1, 1, { shade: 0.05 });
      k.add(box(1.3, 6, 1.7), MOSS[i % 3], x, y + 3, z + 1.2);
      k.collideCircle(x, z, 1.8, y, y + 46);
      // Nacelle + rotor as an animated child.
      const g = new Builder();
      g.add(box(2.6, 2.6, 7), 0xd8d4cc, 0, 0, -1.5);
      g.add(cone(1.1, 2, 8), 0xe8e4dc, 0, 0, 2.6, Math.PI / 2, 0, 0);
      const rotor = new Builder();
      const blades = i === 2 ? 2 : 3;
      for (let bl = 0; bl < blades; bl++) {
        const bg = new THREE.BoxGeometry(1.4, 21, 0.35); bg.translate(0, 11, 0); bg.rotateZ((bl / 3) * Math.PI * 2);
        rotor.add(bg, 0xf0ece4, 0, 0, 0);
      }
      const nac = new THREE.Mesh(g.build(), MATS);
      nac.position.set(k.ox + x, y + 46.5, k.oz + z);
      nac.rotation.y = 0.9;
      const rot = new THREE.Mesh(rotor.build(), MATS);
      rot.position.z = 2.4;
      rot.rotation.z = i * 1.3;
      nac.add(rot);
      nac.castShadow = rot.castShadow = true;
      parts.push(nac);
      if (i === 0) k.animated.push((dt) => { rot.rotation.z += dt * 0.25; });
    });
    return parts;
  },

  fuel(k) {
    const y = k.g(0, 0);
    for (const [x, z] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) { k.add(box(0.6, 5.5, 0.6), 0xd8d0c0, x, y + 2.75, z); k.collideCircle(x, z, 0.6, y, y + 5.5); }
    k.add(box(19, 0.8, 15), 0xe8e0d0, 0, y + 5.8, 0, 0.03, 0, -0.04, 1, 1, 1, { shade: 0.05 });
    k.add(box(19.2, 0.5, 15.2), 0xc85a3a, 0, y + 5.3, 0, 0.03, 0, -0.04);
    for (const x of [-3, 3]) { k.add(box(1.2, 1.8, 0.8), 0xc85a3a, x, y + 0.9, 0, 0, 0, 0, 1, 1, 1, { mat: 4 }); k.add(box(0.9, 0.5, 0.82), DARKWIN, x, y + 1.4, 0.05); k.collideBox(x, 0, 0.7, 0.5, 0, y, y + 2); }
    // shop
    k.add(box(14, 4.2, 9), 0xe4dccb, 0, y + 2.1, -17, 0, 0, 0, 1, 1, 1, { shade: 0.06 });
    k.add(box(10, 2, 0.1), DARKWIN, 0, y + 2.2, -12.45);
    k.add(box(14.4, 0.4, 9.4), 0xc85a3a, 0, y + 4.3, -17);
    k.collideBox(0, -17, 7, 4.5, 0, y, y + 4.5);
    // Sand drifts creeping in.
    for (let i = 0; i < 8; i++) k.add(ico(4), 0xe2c287, k.r(-14, 14), y - 1.5, k.r(-22, 10), 0, k.r(0, 3), 0, k.r(1, 2), 0.35, k.r(0.8, 1.6), { jitter: 1, shade: 0.06 });
    // tall sign pole
    k.add(cyl(0.3, 0.3, 12, 6), 0x9a9a92, 14, y + 6, 6).add(cyl(2.6, 2.6, 0.5, 16), 0xc85a3a, 14, y + 12.5, 6, Math.PI / 2, 0, 0);
    k.collideCircle(14, 6, 0.5, y, y + 12);
    k.car(-12, 8, 1.2, 0.6);
    const sg = sign('OPEN 24 HRS', 7, 1.4, '#f4ecd8', '#c85a3a', 'bold 72px sans-serif');
    sg.position.set(k.ox, y + 6.9, k.oz + 7.6);
    const s2 = sign('FUEL', 4.4, 4.4, '#c85a3a', '#fff4e0', 'bold 150px sans-serif');
    s2.position.set(k.ox + 14, y + 12.5, k.oz + 6.3);
    return [sg, s2];
  },

  dishes(k) {
    const prof = [];
    for (let i = 0; i <= 8; i++) { const r = i * 1.6; prof.push(new THREE.Vector2(r, r * r * 0.035)); }
    const dish = new THREE.LatheGeometry(prof, 14);
    [[0, 0, 0.7, 0], [40, -25, 0.5, 1.2], [-38, 22, 0.8, 2.6], [25, 40, 2.6, 4]].forEach(([x, z, tilt, rot], i) => {
      const y = k.g(x, z);
      if (i === 3) { // face-down in the sand
        k.add(dish, 0xdcd8d0, x, y + 2, z, Math.PI - 0.3, rot, 0.2, 1, 1, 1, { mat: 4 });
        k.collideCircle(x, z, 10, y, y + 5);
        return;
      }
      k.add(cyl(1.2, 2.0, 8, 8), 0xb8b4ac, x, y + 4, z);
      k.add(box(3, 2, 3), 0xa8a49c, x, y + 8.5, z, tilt * 0.3, rot, 0);
      k.add(dish, 0xe8e4dc, x, y + 9.5, z, -tilt, rot, 0, 1, 1, 1, { mat: 4 });
      k.add(cyl(0.1, 0.1, 8, 4), 0x8a8a8a, x - Math.sin(rot) * Math.sin(tilt) * 4, y + 13, z - Math.cos(rot) * Math.sin(tilt) * 4, -tilt, rot, 0);
      k.add(ico(4), 0xe2c287, x + 2, y - 0.8, z + 1, 0, 0, 0, 2, 0.4, 1.6, { jitter: 1 });
      k.collideCircle(x, z, 2.2, y, y + 9);
    });
    const y = k.g(-10, -30);
    k.add(box(16, 5, 10), 0xd0c8b8, -10, y + 2.5, -30).add(box(16.4, 0.4, 10.4), 0x8a8a82, -10, y + 5.1, -30).add(box(12, 1.2, 0.1), DARKWIN, -10, y + 3, -24.95);
    k.collideBox(-10, -30, 8, 5, 0, y, y + 5);
  },

  giant(k) {
    const y = k.g(0, 0);
    const stone = 0xbfae94;
    const b = new Builder();
    // head lying on its cheek (local: face toward +z)
    b.add(ico(8, 1), stone, 0, 0, 0, 0, 0, 0, 0.85, 1.1, 0.9, { jitter: 0.6, shade: 0.1 })
      .add(box(2.4, 4.2, 3), stone, 0, -0.5, 7.4, -0.15, 0, 0)
      .add(box(9, 1.2, 2), stone, 0, 3.0, 6.6, 0.2, 0, 0)
      .add(box(3, 0.5, 0.6), 0x9a8a74, -2.6, 1.6, 7.4).add(box(3, 0.5, 0.6), 0x9a8a74, 2.6, 1.6, 7.4)
      .add(box(4.5, 0.7, 1.2), 0xa89880, 0, -4.4, 7.0)
      .add(box(10, 3, 9), stone, 0, 8.2, -1, 0, 0, 0, 1, 1, 1, { jitter: 0.6 })
      .add(box(3, 6, 2), stone, -7.4, 0.5, 0).add(box(3, 6, 2), stone, 7.4, 0.5, 0)
      .add(box(4, 0.6, 5), MOSS[0], 0, 9.9, -1, 0, 0, 0, 1, 1, 1, { shade: 0.2 });
    const head = b.build();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0, y + 3, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0.7, 1.25)), new THREE.Vector3(1, 1, 1));
    k.b.addGeo(head, m);
    k.collideCircle(0, 0, 9, y, y + 14);
    // a hand rising from the dunes
    const hx = 26, hz = 14, hy = k.g(hx, hz);
    k.add(box(4, 5, 2.4), stone, hx, hy + 1.5, hz, 0, 0.4, 0.15);
    for (let f = 0; f < 4; f++) k.add(cyl(0.45, 0.55, 3.6 - Math.abs(f - 1.5) * 0.5, 6), stone, hx - 1.4 + f * 0.95, hy + 5.3, hz + Math.sin(f) * 0.3, 0.1 * f - 0.2, 0.4, 0.15);
    k.add(cyl(0.5, 0.55, 2.6, 6), stone, hx + 2.5, hy + 3.4, hz + 0.8, 0, 0.4, -0.9);
    k.collideCircle(hx, hz, 2.6, hy, hy + 7);
    for (let i = 0; i < 6; i++) k.add(ico(5), 0xe2c287, k.r(-14, 30), y - 2, k.r(-14, 20), 0, k.r(0, 3), 0, k.r(1, 2), 0.35, k.r(1, 1.6), { jitter: 1.5 });
  },

  train(k) {
    const [a, b] = [TRACK[0], TRACK[2]];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len, rot = Math.atan2(ux, uz);
    // rails along the whole track
    for (let t = 0; t < len; t += 6) {
      const x = a[0] + ux * t - k.ox, z = a[1] + uz * t - k.oz;
      const y = k.g(x, z);
      k.add(box(3.2, 0.2, 0.5), 0x6a5a48, x, y + 0.1, z, 0, rot, 0);
      if (k.rnd() < 0.92) {
        k.add(box(0.15, 0.2, 6.1), 0x7a6a5a, x + Math.cos(rot) * 0.8, y + 0.3, z - Math.sin(rot) * 0.8, 0, rot, 0);
        k.add(box(0.15, 0.2, 6.1), 0x7a6a5a, x - Math.cos(rot) * 0.8, y + 0.3, z + Math.sin(rot) * 0.8, 0, rot, 0);
      }
    }
    // locomotive + carriages
    const cols = [0x3a6a8a, 0x8a3a32, 0x6a7a4a, 0x8a6a3a, 0x3a6a8a, 0x6a6a6a];
    for (let i = 0; i < 6; i++) {
      const t = i * 15.5;
      const x = ux * t, z = uz * t;
      const derail = i >= 4 ? (i - 3) * 0.12 : 0;
      const off = i >= 4 ? (i - 3) * 2.2 : 0;
      const px = x + Math.cos(rot) * off, pz = z - Math.sin(rot) * off;
      const y = k.g(px, pz);
      if (i === 0) {
        k.add(box(3.2, 4, 13.5), 0xc8b860, px, y + 2.6, pz, 0, rot, 0, 1, 1, 1, { mat: 4 });
        k.add(box(3.3, 1.2, 4), DARKWIN, px + ux * 4.5, y + 3.6, pz + uz * 4.5, 0, rot, 0);
        k.add(box(3.4, 0.8, 13.6), 0x3a3a3a, px, y + 0.7, pz, 0, rot, 0);
      } else {
        k.add(box(3.1, 3.6, 14), cols[i], px, y + 2.4, pz, 0, rot, derail, 1, 1, 1, { mat: 4 });
        for (let w = -2; w <= 2; w++) k.add(box(3.15, 1.1, 1.6), DARKWIN, px + ux * w * 2.7, y + 3, pz + uz * w * 2.7, 0, rot, derail);
        k.add(box(2.6, 0.3, 12), k.pick(MOSS), px, y + 4.3, pz, 0, rot, derail, 1, 1, 1, { shade: 0.2 });
      }
      if (k.rnd() < 0.6) k.tree(px + ux * 3, y + 4.3, pz + uz * 3, 1.1);
      k.collideBox(px, pz, 1.7, 7.2, -rot, y, y + 4.5);
    }
  },

  stadium(k) {
    const y = k.g(0, 0);
    const RX = 78, RZ = 58, N = 40;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      if (i === 6 || i === 7 || i === 25) continue; // collapsed gaps / entrances
      const x = Math.cos(a) * RX, z = Math.sin(a) * RZ;
      const outward = Math.atan2(x / RX, z / RZ);
      const segLen = (2 * Math.PI * Math.sqrt((RX * RX + RZ * RZ) / 2)) / N + 1;
      for (let s = 0; s < 5; s++) {
        const r2 = 1 + s * 0.06;
        const h = 2.5 + s * 3;
        k.add(box(segLen * r2, h, 5), CONCRETE[(i + s) % 5], x * r2, y + h / 2, z * r2, 0, outward, 0, 1, 1, 1, { shade: 0.05 });
        if (s === 4) k.add(box(segLen * r2, 0.4, 3.5), k.pick(MOSS), x * r2, y + h + 0.2, z * r2, 0, outward, 0, 1, 1, 1, { shade: 0.2 });
      }
      if (k.rnd() < 0.3) k.tree(x * 1.12, y + 14.5, z * 1.12, k.r(1.5, 2.5));
      if (i % 4 === 0) k.add(box(segLen * 0.5, 0.2, 12), [0xc85a3a, 0x3a6aa8, 0xe8c84a][i % 3], x * 1.12, y + 8.1, z * 1.12, 0.6, outward, 0);
      k.collideBox(x * 1.12, z * 1.12, segLen / 2 + 0.3, 7.5, -outward, y, y + 15);
    }
    // floodlight towers
    for (const [x, z] of [[RX * 0.95, RZ * 0.95], [-RX * 0.95, RZ * 0.95], [RX * 0.95, -RZ * 0.95], [-RX * 0.95, -RZ * 0.95]]) {
      k.add(cyl(0.6, 1.2, 40, 6), 0x9a9a92, x * 1.2, y + 20, z * 1.2, 0.04, 0, 0.03);
      k.add(box(7, 4, 1), 0x6a6a62, x * 1.2, y + 41, z * 1.2, 0, Math.atan2(x, z), 0);
      k.vines(x * 1.2, y + 2, y + 30, z * 1.2, 0);
      k.collideCircle(x * 1.2, z * 1.2, 1.4, y, y + 40);
    }
    // field became a pond
    k.add(new THREE.CircleGeometry(32, 18), 0x4f8f8a, 0, y + 0.25, 0, -Math.PI / 2, 0, 0, 1.4, 1, 1);
    k.add(box(0.3, 2.6, 0.3), 0xf0f0f0, -52, y + 1.3, 0).add(box(0.3, 0.3, 7), 0xf0f0f0, -52, y + 2.6, 0)
      .add(box(0.3, 2.6, 0.3), 0xf0f0f0, -52, y + 1.3, -3.5).add(box(0.3, 2.6, 0.3), 0xf0f0f0, -52, y + 1.3, 3.5);
    const sg = sign('HOME 2  ·  AWAY 1', 16, 4, '#1c2226', '#ffcf6a', 'bold 64px monospace');
    sg.position.set(k.ox, y + 22, k.oz - RZ * 1.35);
    k.add(box(17, 5, 0.6), 0x3a3a3a, 0, y + 22, -RZ * 1.35 - 0.35);
    k.add(box(1, 20, 1), 0x9a9a92, -6, y + 10, -RZ * 1.35 - 0.4).add(box(1, 20, 1), 0x9a9a92, 6, y + 10, -RZ * 1.35 - 0.4);
    return [sg];
  },

  plane(k) {
    const y = k.g(0, 0) - 1.4;
    const W = 0xe8e8e4;
    const rot = 0.5;
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (lx, ly, lz) => [lx * c + lz * s, y + ly, -lx * s + lz * c];
    let p;
    // nose section
    p = P(0, 2.5, 14); k.add(cyl(3, 3, 18, 12), W, p[0], p[1], p[2], Math.PI / 2 - 0.05, rot, 0.08, 1, 1, 1, { shade: 0.04 });
    p = P(0, 2.7, 25.5); k.add(new THREE.SphereGeometry(3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), W, p[0], p[1], p[2], Math.PI / 2 - 0.05, rot, 0);
    for (let i = 0; i < 9; i++) { p = P(2.95, 3.6, 7 + i * 2); k.add(box(0.1, 0.6, 0.8), DARKWIN, p[0], p[1], p[2], 0, rot, 0); }
    p = P(0, 2.4, 14); k.add(box(6.2, 0.6, 18.2), 0x3a6aa8, p[0], p[1], p[2], -0.05, rot, 0.08);
    // tail section, broken off and twisted
    p = P(4, 2.2, -14); k.add(cyl(3, 1.6, 20, 12), W, p[0], p[1], p[2], Math.PI / 2 + 0.06, rot + 0.35, -0.2, 1, 1, 1, { shade: 0.04 });
    p = P(7.5, 7.5, -21); k.add(box(0.6, 9, 6), 0x3a6aa8, p[0], p[1], p[2], -0.3, rot + 0.35, -0.2);
    // wings
    p = P(-15, 1.0, 9); k.add(box(24, 0.8, 6), 0xd8d8d4, p[0], p[1], p[2], 0.05, rot + 0.25, -0.08, 1, 1, 1, { shade: 0.05 });
    p = P(14, 0.2, 6); k.add(box(20, 0.8, 6), 0xd8d8d4, p[0], p[1], p[2], -0.1, rot - 0.2, 0.15, 1, 1, 1, { shade: 0.05 });
    p = P(-11, -0.1, 11); k.add(cyl(1.4, 1.4, 5, 10), 0xa8a8a8, p[0], p[1], p[2], Math.PI / 2, rot, 0);
    // marsh life
    for (let i = 0; i < 6; i++) { p = P(k.r(-12, 12), 0.7, k.r(-20, 20)); k.add(ico(1.2), k.pick(MOSS), p[0], p[1] + 1.4, p[2], 0, 0, 0, 1.5, 0.5, 1, { jitter: 0.4 }); }
    k.tree(...P(0, 5.2, 12), 1.4);
    k.collideBox(...[P(0, 0, 14)[0], P(0, 0, 14)[2]], 3.2, 9, -rot, y, y + 6);
    k.collideBox(P(4, 0, -14)[0], P(4, 0, -14)[2], 3, 10, -rot - 0.35, y, y + 6);
  },

  dam(k) {
    // Wall spans across the gorge, perpendicular to the river's flow; its middle has burst.
    const [ax, az] = GORGE[2], [bx, bz] = GORGE[3];
    const fx = bx - ax, fz = bz - az, fl = Math.hypot(fx, fz);
    const px = -fz / fl, pz = fx / fl; // across-gorge direction
    const rot = Math.atan2(px, pz);
    const y0 = -6;
    for (let i = -11; i <= 11; i++) {
      if (Math.abs(i) <= 1) continue; // the breach
      const t = i * 9;
      const arc = (t * t) / 900;
      const x = px * t + (fx / fl) * arc, z = pz * t + (fz / fl) * arc;
      const top = 44 - (Math.abs(i) <= 3 ? (4 - Math.abs(i)) * 7 * k.r(0.6, 1) : 0);
      k.add(box(9.4, top - y0, 10 - Math.abs(i) * 0.15), CONCRETE[Math.abs(i) % 5], x, (top + y0) / 2, z, 0, rot + Math.PI / 2 + t * 0.002, 0, 1, 1, 1, { shade: 0.05 });
      if (top > 40) k.add(box(9.4, 0.5, 4), k.pick(MOSS), x, top + 0.2, z, 0, rot + Math.PI / 2, 0, 1, 1, 1, { shade: 0.2 });
      if (k.rnd() < 0.35) k.vines(x - (fx / fl) * 5, y0 + 4, top, z - (fz / fl) * 5, rot + Math.PI / 2);
      k.collideBox(x, z, 4.7, 5, -(rot + Math.PI / 2), y0, top);
    }
    // broken chunks downstream
    for (let i = 0; i < 6; i++) k.add(box(k.r(4, 8), k.r(3, 6), k.r(4, 8)), CONCRETE[i % 5], (fx / fl) * k.r(15, 40) + px * k.r(-12, 12), k.r(-3, 0), (fz / fl) * k.r(15, 40) + pz * k.r(-12, 12), k.r(0, 0.6), k.r(0, 3), k.r(0, 0.6));
  },

  lighthouse(k) {
    const y = k.g(0, 0);
    for (let i = 0; i < 6; i++) k.add(cyl(3.4 - i * 0.3, 3.7 - i * 0.3, 4.4, 12), i % 2 ? 0xc84a3a : 0xf0ece4, 0, y + 2.2 + i * 4.4, 0, 0, 0, 0, 1, 1, 1, { shade: 0.04 });
    k.add(cyl(2.6, 2.6, 0.5, 12), 0x3a3a3a, 0, y + 26.6, 0).add(cyl(1.5, 1.5, 3, 10), 0xd8f0f0, 0, y + 28.3, 0, 0, 0, 0, 1, 1, 1, { glow: 1 }).add(cone(1.9, 1.8, 10), 0x3a3a3a, 0, y + 30.7, 0);
    k.add(box(7, 3.6, 6), 0xf0ece4, 8, y + 1.8, 2).add(cyl(1, 1, 1, 3), 0x5a6f8a, 8, y + 4.3, 2, 0, 0, Math.PI / 2, 1.6, 7.4, 4.2);
    k.vines(-3.3, y, y + 12, 0, Math.PI / 2);
    k.collideCircle(0, 0, 3.8, y, y + 30);
    k.collideBox(8, 2, 3.5, 3, 0, y, y + 4);
    // Rotating beam (visible at dusk/night).
    const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 70, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.geometry.translate(0, -35, 0); beam.geometry.rotateX(Math.PI / 2);
    const pivot = new THREE.Group(); pivot.position.set(k.ox, y + 28.3, k.oz); pivot.add(beam);
    k.animated.push((dt, env) => { pivot.rotation.y += dt * 0.5; beam.material.opacity = 0.16 * (1 - env.daylight); beam.visible = env.daylight < 0.7; });
    return [pivot];
  },

  park(k) {
    const y = k.g(0, 0);
    // Ferris wheel: frame on two A-legs, rim + spokes + cabins as one rotating mesh.
    const R = 22, cy = y + R + 4;
    for (const s of [-1, 1]) {
      k.add(box(0.8, R + 6, 0.8), 0xd8d0c0, -6, y + (R + 4) / 2, s * 3, 0, 0, -0.25).add(box(0.8, R + 6, 0.8), 0xd8d0c0, 6, y + (R + 4) / 2, s * 3, 0, 0, 0.25);
      k.collideCircle(-9, s * 3, 1, y, cy); k.collideCircle(9, s * 3, 1, y, cy);
    }
    k.vines(-7, y, y + 18, 3.5, 0);
    const wb = new Builder();
    const rim = new THREE.TorusGeometry(R, 0.35, 4, 32);
    wb.add(rim, 0xe8e0d0, 0, 0, 2.2).add(rim, 0xe8e0d0, 0, 0, -2.2);
    const cab = [0xc85a3a, 0x3a8aa8, 0xe8c84a, 0x6aa84a];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const sp = new THREE.BoxGeometry(0.25, R, 0.25); sp.translate(0, R / 2, 0); sp.rotateZ(a);
      wb.add(sp, 0xd8d0c0, 0, 0, 2.2).add(sp, 0xd8d0c0, 0, 0, -2.2);
      wb.add(box(2.4, 2.4, 3.6), cab[i % 4], Math.cos(a) * R, Math.sin(a) * R - 1.8, 0, 0, 0, 0, 1, 1, 1, { shade: 0.1 });
      if (i % 3 === 0) wb.add(ico(1.3), MOSS[i % 3], Math.cos(a) * R, Math.sin(a) * R - 0.3, 0, 0, 0, 0, 1, 0.6, 1, { jitter: 0.4 });
    }
    wb.add(cyl(1, 1, 6, 8), 0x9a9a92, 0, 0, 0, Math.PI / 2, 0, 0);
    const wheel = new THREE.Mesh(wb.build(), MATS);
    wheel.position.set(k.ox, cy, k.oz);
    wheel.castShadow = true;
    k.animated.push((dt) => { wheel.rotation.z += dt * 0.03; });
    // Carousel.
    const cx = 34, cz = 18, yy = k.g(cx, cz);
    k.add(cyl(9, 9, 0.6, 16), 0xd8d0c0, cx, yy + 0.3, cz).add(cone(10, 4, 16), 0xc85a3a, cx, yy + 7, cz).add(cyl(0.6, 0.6, 6, 8), 0xe8c84a, cx, yy + 3.3, cz);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.add(cyl(0.08, 0.08, 4.4, 4), 0xe8c84a, cx + Math.cos(a) * 6.5, yy + 2.8, cz + Math.sin(a) * 6.5);
      k.add(box(0.6, 1, 1.8), [0xf0ece4, 0x8a6a4a][i % 2], cx + Math.cos(a) * 6.5, yy + 1.8 + (i % 2) * 0.6, cz + Math.sin(a) * 6.5, 0, -a, 0);
    }
    k.tree(cx + 3, yy + 9, cz - 2, 1.2);
    k.collideCircle(cx, cz, 9.5, yy, yy + 9);
    // ticket booth
    const ty = k.g(-25, 20);
    k.add(box(4, 3.5, 3), 0xe8e0d0, -25, ty + 1.75, 20).add(box(4.6, 0.4, 3.6), 0xc85a3a, -25, ty + 3.7, 20);
    k.collideBox(-25, 20, 2, 1.5, 0, ty, ty + 4);
    const sg = sign('LANTERN FAIR', 12, 2.2, '#c85a3a', '#fff0d0', 'bold 70px serif');
    sg.position.set(k.ox - 40, ty + 6, k.oz + 30); sg.rotation.y = 0.6;
    k.add(box(0.5, 6, 0.5), 0xd8d0c0, -45, k.g(-45, 26) + 3, 26).add(box(0.5, 6, 0.5), 0xd8d0c0, -35, k.g(-35, 34) + 3, 34);
    return [wheel, sg];
  },

  relay(k) {
    const y = k.g(0, 0);
    const H = 62;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const base = 5, topw = 0.6;
      const lean = Math.atan2(base - topw, H);
      k.add(box(0.45, H + 1, 0.45), 0xc84a3a, sx * (base + topw) / 2, y + H / 2, sz * (base + topw) / 2, -sz * lean, 0, sx * lean);
    }
    for (let i = 0; i < 12; i++) {
      const t = i / 12, w = 5 - 4.4 * t, h = y + t * H + 2;
      const col = i % 2 ? 0xc84a3a : 0xf0ece4;
      k.add(box(w * 2, 0.25, 0.25), col, 0, h, w).add(box(w * 2, 0.25, 0.25), col, 0, h, -w).add(box(0.25, 0.25, w * 2), col, w, h, 0).add(box(0.25, 0.25, w * 2), col, -w, h, 0);
    }
    k.add(new THREE.OctahedronGeometry(0.8), 0xff5040, 0, y + H + 1.5, 0, 0, 0, 0, 1, 1, 1, { glow: 1 });
    k.add(box(6, 3.2, 5), 0xd0c8b8, 10, y + 1.6, 4).add(box(6.4, 0.3, 5.4), 0x7a7a72, 10, y + 3.3, 4);
    for (let i = 0; i < 3; i++) k.add(cyl(1.2, 1.4, 0.3, 10), 0xe8e4dc, 0, y + 30 + i * 9, 1.6, Math.PI / 2, i, 0);
    k.collideBox(0, 0, 5, 5, 0, y, y + H);
    k.collideBox(10, 4, 3, 2.5, 0, y, y + 3.5);
  },
};

// --- Hidden valleys: centrepieces + gates ---------------------------------------------------------
function valleyPieces(k, v, scene, out) {
  const ga = v.angle, gx = Math.cos(ga), gz = Math.sin(ga);
  const gateD = v.r * 1.15;
  const gpx = gx * gateD, gpz = gz * gateD; // gate position relative to valley centre
  const grot = Math.atan2(gx, gz);
  if (v.gate === 'tunnel') {
    const gy = k.g(gpx, gpz);
    // Half-cylinders: axis turned to +x, arc on top, then yawed along the corridor.
    const arch = new THREE.CylinderGeometry(11, 11, 36, 10, 1, true, 0, Math.PI); arch.rotateZ(Math.PI / 2);
    const archMoss = new THREE.CylinderGeometry(12.5, 12.5, 30, 10, 1, true, 0, Math.PI); archMoss.rotateZ(Math.PI / 2);
    const ay = Math.atan2(-gz, gx);
    k.add(arch, 0x7a7466, gpx, gy - 1, gpz, 0, ay, 0, 1, 1, 1, { jitter: 1.4, shade: 0.15, seed: 3 });
    k.add(archMoss, MOSS[0], gpx, gy, gpz, 0, ay, 0, 1, 1, 1, { jitter: 2, shade: 0.2, seed: 4 });
    for (let i = 0; i < 10; i++) {
      const t = k.r(-15, 15), side = k.r(-6, 6);
      k.add(box(0.3, k.r(2, 5), 0.3), MOSS[i % 3], gpx + gx * t + gz * side, gy + 8, gpz + gz * t - gx * side);
    }
    // a few glowing guide crystals inside the tunnel
    for (let i = -1; i <= 1; i++) k.add(new THREE.OctahedronGeometry(0.4), 0x9fe8ff, gpx + gx * i * 10 + gz * 8, gy + 1.2, gpz + gz * i * 10 - gx * 8, 0, 0, 0, 1, 2, 1, { glow: 1 });
  } else if (v.gate === 'waterfall') {
    const gy = k.g(gpx, gpz);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(22, 40, 1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          float col = floor(vUv.x * 40.0);
          float s = fract(vUv.y * 3.0 + uTime * (0.9 + h(vec2(col, 1.0)) * 0.6) + h(vec2(col, 2.0)));
          float streak = smoothstep(0.0, 0.5, s) * (0.55 + 0.45 * h(vec2(col, 3.0)));
          float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          vec3 c = mix(vec3(0.55, 0.78, 0.85), vec3(0.95, 1.0, 1.0), streak);
          gl_FragColor = vec4(c, (0.55 + 0.35 * streak) * edge);
        }`,
    }));
    fall.position.set(k.ox + gpx, gy + 20, k.oz + gpz);
    fall.rotation.y = grot;
    fall.renderOrder = 3;
    k.animated.push((dt) => { fall.material.uniforms.uTime.value += dt; });
    // lintel of rock across the top so it reads as a cliff
    k.add(box(30, 14, 12), 0x5f6b52, gpx, gy + 45, gpz, 0, grot, 0, 1, 1, 1, { jitter: 2, shade: 0.15 });
    k.add(box(30, 3, 14), MOSS[0], gpx, gy + 52, gpz, 0, grot, 0, 1, 1, 1, { jitter: 1.5, shade: 0.2 });
    k.add(new THREE.CircleGeometry(14, 14), 0x5fa8b0, gpx + gx * 8, gy + 0.3, gpz + gz * 8, -Math.PI / 2, 0, 0, 1, 1, 1, { glow: 1 });
    out.push(fall);
  }

  const y = k.g(0, 0);
  if (v.id === 'lantern') {
    // The Mother Tree.
    k.add(cyl(2.2, 3.6, 22, 8), 0x3a3550, 0, y + 11, 0, 0, 0, 0, 1, 1, 1, { shade: 0.15 });
    for (let i = 0; i < 6; i++) { const a = i * 1.05; k.add(cyl(0.5, 1.2, 9, 5), 0x3a3550, Math.cos(a) * 4, y + 1, Math.sin(a) * 4, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); }
    k.add(ico(12, 1), 0x46e6c8, 0, y + 26, 0, 0, 0, 0, 1, 0.55, 1, { jitter: 3, glow: 1, shade: 0.3, seed: 21 });
    k.add(ico(7, 0), 0x9a8cff, 8, y + 22, 4, 0, 0, 0, 1, 0.6, 1, { jitter: 2, glow: 1, shade: 0.3, seed: 22 });
    k.add(ico(6, 0), 0x6ff5dc, -7, y + 23, -5, 0, 0, 0, 1, 0.6, 1, { jitter: 2, glow: 1, shade: 0.3, seed: 23 });
    k.collideCircle(0, 0, 4, y, y + 22);
  } else if (v.id === 'starfield') {
    const ox = -20, oz = 10, oy = k.g(ox, oz);
    k.add(cyl(9, 9, 9, 16), 0xe8e4dc, ox, oy + 4.5, oz, 0, 0, 0, 1, 1, 1, { shade: 0.04 });
    k.add(new THREE.SphereGeometry(9.4, 16, 8, 0.4, Math.PI * 2 - 0.8, 0, Math.PI / 2), 0xd8dce4, ox, oy + 9, oz, 0, 0.6, 0, 1, 1, 1, { shade: 0.05 });
    k.add(cyl(1.3, 1.8, 14, 10), 0x6a7a8a, ox + 3, oy + 15, oz + 2, 0.6, 0.6, 0);
    k.add(box(2.2, 2.8, 0.1), DARKWIN, ox, oy + 2, oz + 9.01);
    k.vines(ox - 9, oy, oy + 9, oz, Math.PI / 2);
    k.collideCircle(ox, oz, 9.4, oy, oy + 18);
    // a bench facing the valley, for sitting
    const by = k.g(12, -18);
    k.add(box(3, 0.2, 0.8), 0x8a6a4a, 12, by + 0.7, -18).add(box(3, 0.8, 0.15), 0x8a6a4a, 12, by + 1.2, -18.4).add(box(0.15, 0.7, 0.7), 0x3a3a3a, 10.8, by + 0.35, -18).add(box(0.15, 0.7, 0.7), 0x3a3a3a, 13.2, by + 0.35, -18);
  } else if (v.id === 'crystal') {
    const cols = [0xbfa8ff, 0x9fe8ff, 0xe8d0ff, 0x8fd8ff];
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7, r = i ? k.r(3, 9) : 0, s = i ? k.r(2, 4) : 5;
      k.add(new THREE.OctahedronGeometry(1.4), cols[i % 4], Math.cos(a) * r, y + s * 1.6, Math.sin(a) * r, k.r(-0.4, 0.4) * (i ? 1 : 0), 0, k.r(-0.4, 0.4) * (i ? 1 : 0), s * 0.6, s * 2.2, s * 0.6, { glow: 1, shade: 0.3, seed: i });
    }
    k.collideCircle(0, 0, 6, y, y + 16);
    // mine cart and track
    for (let t = -30; t < 30; t += 3) k.add(box(1.8, 0.15, 0.4), 0x5a4a3a, 25 + t * 0.2, k.g(25 + t * 0.2, t) + 0.1, t);
    k.add(box(1.8, 1.2, 2.6), 0x6a5a4a, 26, k.g(26, 5) + 0.9, 5, 0, 0.2, 0.15).add(new THREE.OctahedronGeometry(0.5), 0x9fe8ff, 26, k.g(26, 5) + 1.7, 5, 0, 0, 0, 1, 1.4, 1, { glow: 1 });
  } else if (v.id === 'glass') {
    const dome = new THREE.IcosahedronGeometry(18, 1);
    // keep only the upper half
    const pos = dome.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, 0);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(dome), new THREE.LineBasicMaterial({ color: 0xd8e0d8 }));
    frame.position.set(k.ox, y + 0.2, k.oz);
    const glass = new THREE.Mesh(dome, new THREE.MeshStandardMaterial({ color: 0xbfe8e0, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
    glass.position.copy(frame.position);
    out.push(frame, glass);
    // a great tree bursting through the top
    k.add(cyl(1.4, 2.4, 26, 7), 0x6b4a32, 0, y + 13, 0);
    k.add(ico(10, 1), 0x4c9238, 0, y + 28, 0, 0, 0, 0, 1, 0.6, 1, { jitter: 2.5, shade: 0.15, seed: 31 });
    k.add(ico(6, 0), 0x6aa84a, 7, y + 25, 3, 0, 0, 0, 1, 0.6, 1, { jitter: 1.5, shade: 0.15, seed: 32 });
    for (let i = 0; i < 14; i++) { const a = k.r(0, 6.3), r = k.r(4, 15); k.add(ico(k.r(0.6, 1.4)), k.pick([0xf29bb8, 0xf5e36a, 0xb79cf5, 0xf5a25d]), Math.cos(a) * r, y + 0.6, Math.sin(a) * r, 0, 0, 0, 1, 0.7, 1, { jitter: 0.2 }); }
    k.collideCircle(0, 0, 2.6, y, y + 26);
  }
}

export function buildRuins(scene, world) {
  const animated = [];
  const meshes = [];
  LANDMARKS.forEach((L, i) => {
    const k = new Kit(world, L.x, L.z, 100 + i);
    const extra = BUILDERS[L.kind](k) || [];
    meshes.push(k.build(scene, L.id));
    for (const e of extra) scene.add(e);
    animated.push(...k.animated);
  });
  VALLEY_DATA.forEach((v, i) => {
    const k = new Kit(world, v.x, v.z, 500 + i);
    const out = [];
    valleyPieces(k, v, scene, out);
    meshes.push(k.build(scene, v.id));
    for (const e of out) scene.add(e);
    animated.push(...k.animated);
  });
  return { animated, meshes };
}

export { WATER_LEVEL };

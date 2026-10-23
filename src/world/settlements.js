// Villages of the people who came back: cottages, log cabins, adobe homes, stilt houses, treehouses and
// waterfall hamlets. Houses go up in stages (plot, foundation, frame, walls, roof), so villages visibly grow.
import * as THREE from 'three';
import { Kit } from './ruins.js';
import { MAT, vegGeometry, shared } from './models.js';
import { ruinMaterial } from './surfaces.js';
import { mulberry32, hash2 } from '../core/rng.js';

const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s, 1);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const prism = () => new THREE.CylinderGeometry(1, 1, 1, 3, 1); // triangular prism for roofs

// Windows glow warmly at night: one shared unlit material whose brightness follows the daylight.
export const windowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
windowMat.userData.shared = true;
export function updateWindows(daylight) {
  const n = 1 - Math.min(1, Math.max(0, (daylight - 0.15) / 0.5));
  windowMat.color.setScalar(0.25 + 0.95 * n);
}

// Slot 0 walls (plaster / adobe / stone), 1 windows + lamps, 2 leaves, 3 wood, 4 roof.
const STYLE_MATS = {};
export function mats(style) {
  if (STYLE_MATS[style]) return STYLE_MATS[style];
  const roofKind = style === 'stilt' || style === 'tree' || style === 'adobe' ? 'thatch' : 'roof';
  STYLE_MATS[style] = [
    ruinMaterial('concrete', { moss: 0.15, grime: 0.25 }), windowMat, MAT.leaf(), ruinMaterial(style === 'cabin' ? 'wood' : 'planks', { moss: 0.1, grime: 0.3, scale: 0.4 }),
    ruinMaterial(roofKind, { moss: 0.25, grime: 0.2, scale: 0.3 }),
  ];
  return STYLE_MATS[style];
}

const WALL = { cottage: [0xf2ece0, 0xe8dcc8, 0xf0e4d4, 0xdfe4dc], adobe: [0xe0b48a, 0xd8a678, 0xe8c49a, 0xcf9a70], stilt: [0xd8c8a8], tree: [0xd8c8a8], cabin: [0xffffff], falls: [0xf2ece0, 0xe4e8e0, 0xefe2cc] };
const WOOD = [0xc89a6a, 0xb88a5a, 0xd4a878, 0xa87a50];
const ROOF = [0xd88a6a, 0xc07a5a, 0x9a8a80, 0xb86a50, 0x8a9aa8];
const WIN = 0xffc878;

// One house in local coords (x, z), facing rot, built up to stage in [0, 1].
export function house(k, x, z, rot, style, seed, stage = 1) {
  const rnd = mulberry32(seed);
  const R = (a, b) => a + (b - a) * rnd();
  const y = k.g(x, z) - 0.1;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  const add = (g, col, lx, ly, lz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, o) => { const p = P(lx, ly, lz); k.add(g, col, p[0], p[1], p[2], rx, rot + ry, rz, sx, sy, sz, o); };
  const stilt = style === 'stilt' ? 1.8 : 0;
  const w = style === 'adobe' ? R(6, 8) : R(6, 7.5), d = style === 'cabin' ? R(7, 8.5) : R(7, 9), h = style === 'adobe' ? 3.2 : 3.0;
  const wall = WALL[style][Math.floor(rnd() * WALL[style].length)], wood = WOOD[Math.floor(rnd() * WOOD.length)], roofC = ROOF[Math.floor(rnd() * ROOF.length)];
  const y0 = stilt;

  // Foundation (stone base or stilts + deck).
  if (stage > 0) {
    if (stilt) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) add(cyl(0.16, 0.2, stilt + 0.6, 6), 0x8a6a4a, sx * (w / 2 - 0.3), stilt / 2 - 0.3, sz * (d / 2 - 0.3), 0, 0, 0, 1, 1, 1, { mat: 3 });
      add(box(w + 2, 0.25, d + 2.5), wood, 0, stilt, 0.6, 0, 0, 0, 1, 1, 1, { mat: 3 });
    } else add(box(w + 0.6, 0.5, d + 0.6), 0xa8a49a, 0, 0.15, 0);
  }
  // Frame: corner posts and a top beam.
  if (stage > 0.25) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(box(0.28, h, 0.28), 0x7a5a3a, sx * w / 2, y0 + h / 2 + 0.3, sz * d / 2, 0, 0, 0, 1, 1, 1, { mat: 3 });
    if (stage < 1) for (const sz of [-1, 1]) add(box(w, 0.22, 0.22), 0x7a5a3a, 0, y0 + h + 0.3, sz * d / 2, 0, 0, 0, 1, 1, 1, { mat: 3 });
  }
  // Walls (rise with the stage).
  if (stage > 0.5) {
    const wh = h * Math.min(1, (stage - 0.5) / 0.3);
    if (style === 'cabin') {
      const logs = Math.max(1, Math.round(wh / 0.42));
      for (let i = 0; i < logs; i++) {
        const ly = y0 + 0.5 + i * 0.42;
        add(cyl(0.22, 0.22, w + 0.6, 7), wood, 0, ly, d / 2, 0, 0, Math.PI / 2, 1, 1, 1, { mat: 3 });
        add(cyl(0.22, 0.22, w + 0.6, 7), wood, 0, ly, -d / 2, 0, 0, Math.PI / 2, 1, 1, 1, { mat: 3 });
        add(cyl(0.22, 0.22, d + 0.6, 7), wood, w / 2, ly + 0.21, 0, Math.PI / 2, 0, 0, 1, 1, 1, { mat: 3 });
        add(cyl(0.22, 0.22, d + 0.6, 7), wood, -w / 2, ly + 0.21, 0, Math.PI / 2, 0, 0, 1, 1, 1, { mat: 3 });
      }
    } else {
      const m = style === 'stilt' || style === 'tree' ? 3 : 0;
      add(box(w, wh, d), m === 3 ? wood : wall, 0, y0 + 0.3 + wh / 2, 0, 0, 0, 0, 1, 1, 1, { mat: m, shade: 0.04 });
      if (style === 'cottage' || style === 'falls') { // timber framing
        for (const sx of [-1, 1]) add(box(0.22, wh, 0.12), 0x6a4a30, sx * w / 2, y0 + 0.3 + wh / 2, d / 2 + 0.04, 0, 0, 0, 1, 1, 1, { mat: 3 });
        add(box(w, 0.2, 0.12), 0x6a4a30, 0, y0 + 0.3 + wh, d / 2 + 0.05, 0, 0, 0, 1, 1, 1, { mat: 3 });
      }
    }
    if (stage >= 0.8) {
      // door, windows (glow at night), window boxes with flowers
      add(box(1.1, 2.1, 0.12), 0x5a3a28, 0, y0 + 1.35, d / 2 + 0.08, 0, 0, 0, 1, 1, 1, { mat: 3 });
      for (const sx of [-1.9, 1.9]) {
        add(box(1.1, 1.0, 0.1), WIN, sx, y0 + 1.9, d / 2 + 0.08, 0, 0, 0, 1, 1, 1, { glow: 1 });
        add(box(1.3, 0.12, 0.14), 0x6a4a30, sx, y0 + 1.35, d / 2 + 0.12, 0, 0, 0, 1, 1, 1, { mat: 3 });
        if (rnd() < 0.6) add(ico(0.32), [0xe86a8a, 0xf2c050, 0xb08ae8, 0xf08a50][Math.floor(rnd() * 4)], sx + R(-0.3, 0.3), y0 + 1.5, d / 2 + 0.3, 0, 0, 0, 1.4, 0.6, 0.6, { jitter: 0.1 });
      }
      add(box(0.1, 1.0, 1.1), WIN, w / 2 + 0.06, y0 + 1.9, R(-1.5, 1.5), 0, 0, 0, 1, 1, 1, { glow: 1 });
    }
  }
  // Roof.
  if (stage >= 0.8) {
    const roofT = Math.min(1, (stage - 0.8) / 0.15);
    const top = y0 + 0.3 + h;
    if (style === 'adobe') {
      add(box(w + 0.3, 0.35, d + 0.3), wall, 0, top + 0.15, 0, 0, 0, 0, 1, 1, 1, { shade: 0.04 });
      for (let i = -2; i <= 2; i++) add(cyl(0.1, 0.1, 0.9, 5), 0x6a4a30, i * w / 5, top - 0.3, d / 2 + 0.3, Math.PI / 2, 0, 0, 1, 1, 1, { mat: 3 });
      if (rnd() < 0.4) add(new THREE.SphereGeometry(w * 0.32, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), wall, 0, top + 0.3, 0, 0, 0, 0, 1, 0.8, 1);
      // a little thatch shade over the door
      add(box(2.4, 0.15, 1.4), 0xd8c090, 0, top - 0.7, d / 2 + 0.7, 0.25, 0, 0, 1, 1, 1, { mat: 4 });
    } else {
      const rh = style === 'stilt' || style === 'tree' ? 2.8 : 2.2;
      add(prism(), roofC, 0, top + rh * 0.48 * roofT, 0, 0, 0, Math.PI / 2, rh, d + 1.0, w * 0.68, { mat: 4 });
      if (style !== 'stilt' && style !== 'tree') add(box(0.7, 2.0, 0.7), 0x9a7a66, w / 3.2, top + 1.3, -d / 4);
    }
  }
  // Scaffolding and a timber pile while under construction.
  if (stage > 0 && stage < 1) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.12, h + 2, 0.12), 0xb89a70, sx * (w / 2 + 1), y0 + (h + 2) / 2, sz * (d / 2 + 1), 0, 0, 0, 1, 1, 1, { mat: 3 });
    for (let i = 0; i < 3; i++) add(box(w + 2.2, 0.08, 0.6), 0xb89a70, 0, y0 + 1.2 + i * 1.3, d / 2 + 1, 0, 0, 0, 1, 1, 1, { mat: 3 });
    for (let i = 0; i < 5; i++) add(box(0.25, 0.25, 4), 0xc8a070, w / 2 + 3, 0.15 + (i % 2) * 0.25, -1 + (i >> 1) * 0.3, 0, 0.05 * i, 0, 1, 1, 1, { mat: 3 });
  }
  if (stage > 0.5) k.collideBox(x, z, w / 2 + 0.4, d / 2 + 0.4, -rot, y, y + y0 + h + 3);
  if (stilt && stage > 0) k.deck(x + s * 0.6, z + c * 0.6, w / 2 + 1, d / 2 + 1.25, rot, y + stilt + 0.12);
  return { x: x + s * (d / 2 + 2.5), z: z + c * (d / 2 + 2.5) }; // the doorstep
}

// Waterfall pieces: the falling sheet, a stream on the shelf, foam and a water wheel.
export const fallMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uTime: shared.time },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float uTime; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      float col = floor(vUv.x * 36.0);
      float s = fract(vUv.y * 2.5 + uTime * (0.9 + h(vec2(col, 1.0)) * 0.6) + h(vec2(col, 2.0)));
      float streak = smoothstep(0.0, 0.5, s) * (0.55 + 0.45 * h(vec2(col, 3.0)));
      float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
      vec3 c = mix(vec3(0.55, 0.78, 0.85), vec3(0.95, 1.0, 1.0), streak);
      gl_FragColor = vec4(c, (0.55 + 0.35 * streak) * edge);
    }`,
});

function waterfall(k, site, out, animated) {
  const pad = site.pad;
  const dx = site.dx, dz = site.dz; // flow direction (+u)
  const at = (u, v) => [dx * u - dz * v, dz * u + dx * v];
  const yaw = Math.atan2(dx, dz);
  // the sheet hangs at the cliff lip, a little proud of the rock face
  const [fx, fz] = at(-15.5, 0);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(9, 23.5), fallMat());
  sheet.position.set(k.ox + fx, pad + 10.8, k.oz + fz);
  sheet.rotation.y = yaw;
  sheet.renderOrder = 3;
  out.push(sheet);
  // stream along the shelf
  const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 110), new THREE.MeshStandardMaterial({ color: 0x2a6878, roughness: 0.08, transparent: true, opacity: 0.85, envMapIntensity: 1.2 }));
  const [rx, rz] = at(-70, 0);
  ribbon.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ'); // faces up, long axis along the flow
  ribbon.position.set(k.ox + rx, pad + 21.7, k.oz + rz);
  out.push(ribbon);
  // foam where the sheet lands, and a rock lip
  const [px, pz] = at(-12, 0);
  const foam = new THREE.Mesh(new THREE.CircleGeometry(6, 20), new THREE.MeshBasicMaterial({ color: 0xeaf6f8, transparent: true, opacity: 0.55, depthWrite: false }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(k.ox + px, 0.08, k.oz + pz);
  out.push(foam);
  animated.push(() => { foam.material.opacity = 0.45 + 0.12 * Math.sin(shared.time.value * 3.1); foam.scale.setScalar(1 + 0.04 * Math.sin(shared.time.value * 2.3)); });
  const [lx, lz] = at(-16.5, 0);
  k.add(box(12, 1.6, 3), 0x7a7a70, lx, pad + 22.2, lz, 0, yaw, 0, 1, 1, 1, { jitter: 0.6, seed: 5 });
  for (let i = 0; i < 6; i++) { const [bx, bz] = at(-11 + (i % 3) * 3, (i < 3 ? -1 : 1) * (7 + i)); k.add(ico(1.2 + (i % 3) * 0.4, 1), 0x8a8a80, bx, k.g(bx, bz) + 0.3, bz, 0, i, 0, 1, 0.7, 1, { jitter: 0.5, seed: 60 + i, smooth: true }); }

  // Water wheel on a mill house beside the pool.
  const [mx, mz] = at(-6, 17);
  house(k, mx, mz + 0, yaw + Math.PI / 2, 'falls', site.seed + 7, 1);
  const wheel = new THREE.Group();
  const wb = new Kit(k.world, 0, 0, site.seed + 9, k.mats);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    wb.add(box(0.2, 0.9, 1.4), 0x8a6a4a, Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0, 0, 0, a, 1, 1, 1, { mat: 3 });
    wb.add(box(0.12, 2.6, 0.15), 0x6a4a30, Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0.6, 0, 0, a + Math.PI / 2, 1, 1, 1, { mat: 3 });
  }
  wb.add(new THREE.TorusGeometry(2.6, 0.12, 5, 20), 0x6a4a30, 0, 0, 0.7, 0, 0, 0, 1, 1, 1, { mat: 3 });
  wb.add(cyl(0.25, 0.25, 2.2, 8), 0x4a4a4a, 0, 0, 0.3, Math.PI / 2, 0, 0);
  const wm = new THREE.Mesh(wb.b.build(), k.mats);
  wm.castShadow = true;
  wheel.add(wm);
  const [wx, wz] = at(-6, 12);
  wheel.position.set(k.ox + wx, 2.2, k.oz + wz);
  wheel.rotation.y = yaw + Math.PI / 2;
  out.push(wheel);
  animated.push((dt) => { wm.rotation.z -= dt * 0.6; });

  // Footbridge over the stream below the pool.
  const [bx, bz] = at(24, 0);
  const by = pad + 0.55;
  k.add(box(4, 0.3, 18), 0xa88a62, bx, by, bz, 0, yaw + Math.PI / 2, 0, 1, 1, 1, { mat: 3 });
  for (const sv of [-1.9, 1.9]) {
    const [ex, ez] = at(24 + sv, 0);
    k.add(box(0.12, 1.0, 18), 0x6a4a30, ex, by + 0.6, ez, 0, yaw + Math.PI / 2, 0, 1, 1, 1, { mat: 3 });
  }
  k.deck(bx, bz, 2, 9, -(yaw + Math.PI / 2), by + 0.15);
}

const NAMES_PLAZA = ['well', 'fire', 'tree', 'market'];

// The whole village for a site; returns everything the NPCs need to live there.
export function buildVillage(world, site, built, construction, scene) {
  const style = site.style;
  const k = new Kit(world, site.x, site.z, site.seed, mats(style));
  const rnd = mulberry32(site.seed);
  const R = (a, b) => a + (b - a) * rnd();
  const out = [], animated = [];
  const plots = villagePlots(site);
  const homes = [], work = [];

  // Plaza.
  const plaza = site.kind === 'waterfall' ? { x: site.dz * 26, z: -site.dx * 26 } : { x: 0, z: 0 };
  const kind = NAMES_PLAZA[site.seed % 4];
  const py = k.g(plaza.x, plaza.z);
  if (kind === 'well') {
    k.add(cyl(1.3, 1.4, 1.0, 12), 0xb0aaa0, plaza.x, py + 0.5, plaza.z, 0, 0, 0, 1, 1, 1, { jitter: 0.05 });
    k.add(cyl(1.0, 1.0, 0.05, 12), 0x3a6a7a, plaza.x, py + 0.9, plaza.z, 0, 0, 0, 1, 1, 1);
    for (const sx of [-1.2, 1.2]) k.add(box(0.15, 2.4, 0.15), 0x6a4a30, plaza.x + sx, py + 1.2, plaza.z, 0, 0, 0, 1, 1, 1, { mat: 3 });
    k.add(prism(), 0xb86a50, plaza.x, py + 2.6, plaza.z, 0, 0, Math.PI / 2, 0.6, 1.6, 1.8, { mat: 4 });
  } else if (kind === 'fire') {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; k.add(ico(0.35), 0x8a8478, plaza.x + Math.cos(a) * 1.1, py + 0.15, plaza.z + Math.sin(a) * 1.1); }
    k.add(new THREE.ConeGeometry(0.6, 1.3, 6), 0xffa040, plaza.x, py + 0.65, plaza.z, 0, 0, 0, 1, 1, 1, { glow: 1 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28 + 0.4; k.add(box(2.2, 0.35, 0.5), 0x8a6a4a, plaza.x + Math.cos(a) * 3.6, py + 0.3, plaza.z + Math.sin(a) * 3.6, 0, -a + Math.PI / 2, 0, 1, 1, 1, { mat: 3 }); }
  } else if (kind === 'tree') {
    const g = vegGeometry(style === 'adobe' ? 'acacia' : style === 'tree' ? 'jungle' : 'oak', 0);
    k.b.addBuilt(g, new THREE.Matrix4().compose(new THREE.Vector3(plaza.x, py - 0.2, plaza.z), new THREE.Quaternion(), new THREE.Vector3(1.5, 1.5, 1.5)));
    k.collideCircle(plaza.x, plaza.z, 1.0, py, py + 8);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; k.add(box(1.6, 0.4, 0.5), 0x8a6a4a, plaza.x + Math.cos(a) * 4, py + 0.3, plaza.z + Math.sin(a) * 4, 0, -a + Math.PI / 2, 0, 1, 1, 1, { mat: 3 }); }
  } else {
    for (let i = 0; i < 3; i++) {
      const sx = plaza.x + (i - 1) * 4.5, sz = plaza.z;
      k.add(box(3, 0.9, 1.6), 0x9a7a56, sx, py + 0.45, sz, 0, 0, 0, 1, 1, 1, { mat: 3 });
      for (const ox of [-1.4, 1.4]) k.add(box(0.12, 2.6, 0.12), 0x6a4a30, sx + ox, py + 1.3, sz - 0.7, 0, 0, 0, 1, 1, 1, { mat: 3 });
      k.add(box(3.4, 0.08, 2.0), [0xd85a4a, 0x4a8ad8, 0xe8c050][i], sx, py + 2.6, sz - 0.2, 0.15, 0, 0, 1, 1, 1);
      for (let j = 0; j < 4; j++) k.add(ico(0.22), [0xe86a3a, 0x8ac84a, 0xf2d050, 0xc84a8a][(i + j) % 4], sx - 1 + j * 0.65, py + 1.05, sz, 0, 0, 0);
    }
    work.push({ x: plaza.x, z: plaza.z + 2, act: 'talk' });
  }
  work.push({ x: plaza.x + 3, z: plaza.z + 3, act: 'idle' }, { x: plaza.x - 3, z: plaza.z - 2, act: 'sit' });

  // Lamp posts around the plaza (glow at night).
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28 + 0.8, lx = plaza.x + Math.cos(a) * 9, lz = plaza.z + Math.sin(a) * 9, ly = k.g(lx, lz);
    k.add(cyl(0.08, 0.1, 3.2, 6), 0x3a3a3a, lx, ly + 1.6, lz).add(box(0.4, 0.5, 0.4), WIN, lx, ly + 3.3, lz, 0, 0, 0, 1, 1, 1, { glow: 1 });
  }

  // Houses on their plots.
  for (let i = 0; i < built && i < plots.length; i++) {
    const p = plots[i];
    if (style === 'tree' && i % 2 === 1) homes.push(treehouse(k, p.x, p.z, p.rot, site.seed + i));
    else homes.push(house(k, p.x, p.z, p.rot, style, site.seed + i * 17, 1));
    // a vegetable garden beside some houses
    if (hash2(i, site.seed, 3) < 0.5) garden(k, p.x + Math.cos(p.rot) * 7, p.z - Math.sin(p.rot) * 7, p.rot, site.seed + i);
  }
  if (site.kind === 'waterfall') waterfall(k, site, out, animated);
  const mesh = k.build(scene, site.id);
  if (mesh) { scene.remove(mesh); out.push(mesh); }

  // Construction site: rebuilt separately as its stage advances.
  let build = null;
  if (construction && built < plots.length) {
    const p = plots[built];
    build = { x: p.x, z: p.z, rot: p.rot, seed: site.seed + built * 17, spots: [] };
    const off = [[3.5, 6], [-4.5, 2], [4.5, -3]];
    for (const [ox, oz] of off) build.spots.push({ x: p.x + Math.cos(p.rot) * ox + Math.sin(p.rot) * oz, z: p.z - Math.sin(p.rot) * ox + Math.cos(p.rot) * oz });
  }
  return { meshes: out, animated, homes, work, plaza, build, kit: k };
}

// Build (or rebuild) the house under construction at the given stage.
export function buildConstruction(world, site, b, stage, scene) {
  const k = new Kit(world, site.x, site.z, b.seed, mats(site.style));
  house(k, b.x, b.z, b.rot, site.style, b.seed, stage);
  return k.build(scene, site.id + ':build');
}

// Deterministic plots in a loose ring, facing the plaza.
export function villagePlots(site) {
  const rnd = mulberry32(site.seed + 1);
  const n = 7 + Math.floor(rnd() * 6);
  const plots = [];
  const cx = site.kind === 'waterfall' ? site.dz * 26 : 0, cz = site.kind === 'waterfall' ? -site.dx * 26 : 0;
  for (let i = 0; i < n * 3 && plots.length < n; i++) {
    const a = rnd() * Math.PI * 2, r = 20 + rnd() * 30;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    // waterfall villages keep clear of the pool, the stream and the cliff
    if (site.kind === 'waterfall') { const u = x * site.dx + z * site.dz, v = -x * site.dz + z * site.dx; if (u < -10 || (Math.abs(v) < 16 && u < 40)) continue; }
    if (plots.some((p) => Math.hypot(p.x - x, p.z - z) < 14)) continue;
    plots.push({ x, z, rot: Math.atan2(cx - x, cz - z) + (rnd() - 0.5) * 0.4 });
  }
  return plots;
}

function garden(k, x, z, rot, seed) {
  const y = k.g(x, z);
  const rnd = mulberry32(seed);
  k.add(box(4.5, 0.25, 3.5), 0x5a4030, x, y + 0.05, z, 0, rot, 0);
  for (let i = 0; i < 12; i++) {
    const lx = (i % 4 - 1.5) * 1.0, lz = (Math.floor(i / 4) - 1) * 1.0;
    const c = Math.cos(rot), s = Math.sin(rot);
    k.add(ico(0.28), [0x5a9a3a, 0x7ab84a, 0xd86a3a, 0xe8c050][Math.floor(rnd() * 4)], x + lx * c + lz * s, y + 0.35, z - lx * s + lz * c, 0, 0, 0, 1, 0.8, 1, { jitter: 0.08 });
  }
  for (let i = -3; i <= 3; i++) {
    const c = Math.cos(rot), s = Math.sin(rot);
    k.add(box(0.1, 0.8, 0.1), 0xe8e0d0, x + i * 0.75 * c + 2.2 * s, y + 0.4, z - i * 0.75 * s + 2.2 * c, 0, rot, 0);
  }
}

// A treehouse: a great tree with a hut on a platform and a ladder.
function treehouse(k, x, z, rot, seed) {
  const y = k.g(x, z);
  k.b.addBuilt(vegGeometry('jungle', 0), new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1.1, 1.1, 1.1)));
  const py = y + 7;
  k.add(cyl(4.2, 4.2, 0.3, 10), 0xa88a62, x, py, z, 0, 0, 0, 1, 1, 1, { mat: 3 });
  for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28; k.add(box(0.1, 1, 0.1), 0x6a4a30, x + Math.cos(a) * 4, py + 0.5, z + Math.sin(a) * 4, 0, 0, 0, 1, 1, 1, { mat: 3 }); }
  k.add(box(4, 2.6, 3.6), 0xc8a878, x + 0.8, py + 1.45, z, 0, rot, 0, 1, 1, 1, { mat: 3 });
  k.add(prism(), 0xd8c090, x + 0.8, py + 3.6, z, 0, rot, Math.PI / 2, 2, 4.4, 2.8, { mat: 4 });
  k.add(box(0.8, 0.7, 0.08), WIN, x + 0.8 + Math.sin(rot) * 1.85, py + 1.7, z + Math.cos(rot) * 1.85, 0, rot, 0, 1, 1, 1, { glow: 1 });
  // ladder
  const lx = x + Math.sin(rot + 1.2) * 4.3, lz = z + Math.cos(rot + 1.2) * 4.3;
  for (const o of [-0.3, 0.3]) k.add(box(0.08, 7, 0.08), 0x6a4a30, lx + o * Math.cos(rot), y + 3.5, lz - o * Math.sin(rot), 0, rot, 0, 1, 1, 1, { mat: 3 });
  for (let i = 0; i < 12; i++) k.add(box(0.7, 0.06, 0.06), 0x8a6a4a, lx, y + 0.4 + i * 0.55, lz, 0, rot, 0, 1, 1, 1, { mat: 3 });
  k.collideCircle(x, z, 1.4, y, py + 4);
  return { x: lx + Math.sin(rot + 1.2) * 1.5, z: lz + Math.cos(rot + 1.2) * 1.5 };
}

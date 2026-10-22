// Geometry kit + materials: a multi-material builder, leaf-card foliage, bark, and vegetation models.
// Material slots in every built geometry: 0 = solid, 1 = glow (unlit), 2 = foliage (leaf atlas), 3 = bark, 4 = alt
// (bark2 for plants, rusted metal for ruins).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../core/rng.js';
import { detailTexture, foliageAtlas, CELL, cellUV } from './textures.js';
import { barkMaterial, ruinMaterial } from './surfaces.js';

export const shared = { time: { value: 0 }, wind: { value: 1 }, sunView: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color(1, 1, 1) } };

// A texel of the atlas that is always opaque (centre of the broadleaf cell): non-leaf parts sample it so the
// shared alpha-tested shadow material never cuts holes in trunks or rocks.
const OPAQUE_UV = [0.125, 1 - 0.5 / 3];
export const SLOTS = 5;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class Builder {
  constructor() { this.parts = Array.from({ length: SLOTS }, () => []); }

  get lit() { return this.parts[0]; }

  add(geom, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, opts = {}) {
    const mat = opts.glow ? 1 : opts.mat ?? 0;
    let g = geom.clone();
    if (opts.jitter) {
      g.deleteAttribute('normal'); g.deleteAttribute('uv');
      g = mergeVertices(g);
      jitter(g, opts.jitter, opts.seed || 0);
      if (opts.smooth) g.computeVertexNormals();
      g = g.toNonIndexed();
      if (!opts.smooth) g.computeVertexNormals();
    } else if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count;
    // uv1 carries real texture coordinates for bark; uv points at an opaque atlas texel.
    const uv1 = new Float32Array(n * 2);
    if (opts.uvScale && g.attributes.uv) for (let i = 0; i < n; i++) { uv1[i * 2] = g.attributes.uv.getX(i) * opts.uvScale[0]; uv1[i * 2 + 1] = g.attributes.uv.getY(i) * opts.uvScale[1]; }
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { uv[i * 2] = OPAQUE_UV[0]; uv[i * 2 + 1] = OPAQUE_UV[1]; }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    const c = new THREE.Color(color);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = opts.shade ? 1 + (hash2(Math.floor(i / 3), n, opts.seed || 1) - 0.5) * opts.shade : 1;
      arr[i * 3] = c.r * v; arr[i * 3 + 1] = c.g * v; arr[i * 3 + 2] = c.b * v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts[mat].push(g);
    return this;
  }

  addGeo(g, matrix, mat = 0) {
    const c = g.clone(); c.applyMatrix4(matrix);
    c.clearGroups();
    this.parts[mat].push(c);
    return this;
  }

  // Add an already-built multi-material geometry, keeping each group in its own slot.
  addBuilt(g, matrix) {
    for (const gr of g.groups) {
      const sub = new THREE.BufferGeometry();
      for (const [k, attr] of Object.entries(g.attributes)) {
        const n = attr.itemSize, end = Math.min(gr.start + gr.count, attr.count);
        sub.setAttribute(k, new THREE.BufferAttribute(attr.array.slice(gr.start * n, end * n), n));
      }
      sub.applyMatrix4(matrix);
      this.parts[gr.materialIndex].push(sub);
    }
    return this;
  }

  addRaw(pos, nor, uv, col, mat = 2) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(uv.length), 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.parts[mat].push(g);
    return this;
  }

  build() {
    const all = [], groups = [];
    let start = 0;
    this.parts.forEach((list, mat) => {
      let count = 0;
      for (const g of list) { all.push(g); count += g.attributes.position.count; }
      if (count) groups.push([start, count, mat]);
      start += count;
    });
    if (!all.length) return null;
    const g = mergeGeometries(all, false);
    g.clearGroups();
    for (const [s, c, m] of groups) g.addGroup(s, c, m);
    g.computeBoundingSphere();
    return g;
  }
}

export function jitter(g, amt, seed) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = Math.round(x * 100) * 7 + Math.round(y * 100) * 13 + Math.round(z * 100) * 29;
    p.setXYZ(i, x + (hash2(k, 1, seed) - 0.5) * amt, y + (hash2(k, 2, seed) - 0.5) * amt, z + (hash2(k, 3, seed) - 0.5) * amt);
  }
}

// --- Leaf cards -------------------------------------------------------------------------------
const _a = new THREE.Vector3();
const newOut = () => ({ pos: [], nor: [], uv: [], col: [] });

function pushQuad(out, corners, normals, cell, color) {
  const { u0, u1, v0, v1 } = cellUV(cell);
  const uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  for (const i of [0, 1, 2, 0, 2, 3]) {
    out.pos.push(corners[i].x, corners[i].y, corners[i].z);
    out.nor.push(normals[i].x, normals[i].y, normals[i].z);
    out.uv.push(uv[i][0], uv[i][1]);
    out.col.push(color[0], color[1], color[2]);
  }
}

// Cluster of randomly oriented leaf cards in an ellipsoid. Normals point away from the *crown* centre (o.nc)
// so every cluster shades as part of one soft volume.
export function canopy(b, o) {
  const rnd = mulberry32(o.seed || 1);
  const out = newOut();
  const c = new THREE.Color(o.color ?? 0xffffff);
  const nc = o.nc || o;
  for (let i = 0; i < o.count; i++) {
    let x, y, z;
    do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; } while (x * x + y * y + z * z > 1);
    const rr = Math.sqrt(x * x + y * y + z * z);
    const center = new THREE.Vector3(o.x + x * o.rx, o.y + y * o.ry, o.z + z * o.rz);
    const s = (o.size[0] + (o.size[1] - o.size[0]) * rnd()) * 0.5;
    _q.setFromEuler(_e.set((rnd() - 0.5) * 2.4, rnd() * 6.28, (rnd() - 0.5) * 2.4));
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => new THREE.Vector3(u * s, v * s, 0).applyQuaternion(_q).add(center));
    const normals = corners.map((p) => new THREE.Vector3((p.x - nc.x) / nc.rx, (p.y - nc.y) / nc.ry + 0.3, (p.z - nc.z) / nc.rz).normalize());
    const ao = (0.45 + 0.55 * rr) * (0.82 + 0.3 * (y * 0.5 + 0.5)) * (0.9 + rnd() * 0.2);
    pushQuad(out, corners, normals, o.cell, [c.r * ao, c.g * ao, c.b * ao]);
  }
  b.addRaw(out.pos, out.nor, out.uv, out.col, 2);
}

// Upright crossed cards (grass, flowers, reeds). Normals face up so they shade like the ground.
export function tuft(b, o) {
  const rnd = mulberry32(o.seed || 1);
  const out = newOut();
  const c = new THREE.Color(o.color ?? 0xffffff);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < o.count; i++) {
    const a = (i / o.count) * Math.PI + rnd() * 0.4;
    const w = o.w * (0.85 + rnd() * 0.3), h = o.h * (0.8 + rnd() * 0.4);
    const ox = (rnd() - 0.5) * (o.spread || 0), oz = (rnd() - 0.5) * (o.spread || 0);
    const dx = Math.cos(a) * w * 0.5, dz = Math.sin(a) * w * 0.5;
    const lean = o.lean || 0;
    const lx = Math.cos(a + 1.57) * lean * h, lz = Math.sin(a + 1.57) * lean * h;
    const corners = [
      new THREE.Vector3(ox - dx, 0, oz - dz), new THREE.Vector3(ox + dx, 0, oz + dz),
      new THREE.Vector3(ox + dx + lx, h, oz + dz + lz), new THREE.Vector3(ox - dx + lx, h, oz - dz + lz),
    ];
    const nb = new THREE.Vector3(Math.cos(a + 1.57) * 0.3, 1, Math.sin(a + 1.57) * 0.3).normalize();
    pushQuad(out, corners, [up, up, nb, nb], o.cell, [c.r, c.g, c.b]);
  }
  b.addRaw(out.pos, out.nor, out.uv, out.col, 2);
}

// A bending card from p0 along dir (length len, width w), drooping. `nrm` overrides the shading normal.
function frond(out, p0, dir, side, len, w, droop, cell, color, segs = 2, nrm = null, taper = 0) {
  let prevL = null, prevR = null;
  const { u0, u1, v0, v1 } = cellUV(cell);
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const p = _a.copy(p0).addScaledVector(dir, len * t);
    p.y -= droop * t * t * len;
    const ww = w * (1 - taper * t) / 2;
    const L = p.clone().addScaledVector(side, -ww), R = p.clone().addScaledVector(side, ww);
    let n = nrm;
    if (!n) { n = new THREE.Vector3().crossVectors(side, dir).normalize(); if (n.y < 0) n.negate(); n.y += 0.6; n.normalize(); }
    if (prevL) {
      const ua = u0 + (u1 - u0) * ((s - 1) / segs), ub = u0 + (u1 - u0) * t;
      const quad = [[prevL, ua, v0], [L, ub, v0], [R, ub, v1], [prevR, ua, v1]];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const [pp, uu, vv] = quad[i];
        out.pos.push(pp.x, pp.y, pp.z); out.nor.push(n.x, n.y, n.z); out.uv.push(uu, vv); out.col.push(color[0], color[1], color[2]);
      }
    }
    prevL = L; prevR = R;
  }
}

// --- Materials ----------------------------------------------------------------------------------
function windChunk(amount) {
  return `
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(modelMatrix[3][0], 0.0, modelMatrix[3][2]);
      #endif
      float ph = ip.x * 0.07 + ip.z * 0.05;
      float sway = (sin(uTime * 1.3 + ph) * 0.7 + sin(uTime * 2.7 + ph * 1.7) * 0.3) * uWind;
      float hgt = max(position.y, 0.0);
      float flutter = sin(uTime * 6.0 + position.x * 3.0 + position.z * 2.0 + ph) * 0.015 * hgt * uWind;
      transformed.x += sway * ${amount.toFixed(4)} * hgt * hgt + flutter;
      transformed.z += sway * ${(amount * 0.6).toFixed(4)} * hgt * hgt * cos(ph) + flutter * 0.5;`;
}

// Shader patching: optional wind, optional world-space detail, optional fluffy normals + leaf translucency.
export function patch(mat, { wind = 0, detail = 0, fluffy = false, key }) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r);
    sh.uniforms.uTime = shared.time;
    sh.uniforms.uWind = shared.wind;
    sh.uniforms.uDetail = { value: detailTexture() };
    sh.uniforms.uSunView = shared.sunView;
    sh.uniforms.uSunColor = shared.sunColor;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\nvarying vec3 vDPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      ${wind ? windChunk(wind) : ''}
      {
        vec4 dwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          dwp = instanceMatrix * dwp;
        #endif
        vDPos = (modelMatrix * dwp).xyz;
      }`);
    let fs = 'uniform sampler2D uDetail; uniform vec3 uSunView; uniform vec3 uSunColor;\nvarying vec3 vDPos;\n' + sh.fragmentShader;
    if (detail) {
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        float dd = texture2D(uDetail, vDPos.xz * 0.05 + vDPos.y * 0.02).r * 0.5 + texture2D(uDetail, vDPos.xz * 0.4 + vDPos.y * 0.3).r * 0.5;
        diffuseColor.rgb *= mix(1.0, 0.6 + 0.8 * dd, ${detail.toFixed(2)});`);
    }
    if (fluffy) {
      fs = fs.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
      // Leaves right in front of the camera dissolve instead of filling the screen.
      fs = fs.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        float camD = length(vViewPosition);
        if (camD < 3.5 && fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > (camD - 1.0) / 2.5) discard;`);
      // Light through leaves: glow when the sun is behind them.
      fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float backL = pow(max(dot(normalize(-vViewPosition), uSunView), 0.0), 3.0);
        reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * vec3(0.9, 1.1, 0.55) * backL * 0.9;`);
    }
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

function depthWind(mat, wind) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time; sh.uniforms.uWind = shared.wind;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${wind ? windChunk(wind) : ''}`);
  };
  mat.customProgramCacheKey = () => 'depthwind' + wind;
  return mat;
}

const cache = new Map();
const cached = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

export const MAT = {
  solid: (wind = 0, detail = 0.8) => cached('solid' + wind + detail, () => patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }), { wind, detail, key: 'solid' + wind + detail })),
  glow: (wind = 0) => cached('glow' + wind, () => {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true });
    if (wind) depthWind(m, wind);
    return m;
  }),
  leaf: (wind = 0) => cached('leaf' + wind, () => patch(new THREE.MeshStandardMaterial({ vertexColors: true, map: foliageAtlas(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.72, metalness: 0 }), { wind, fluffy: true, key: 'leaf' + wind })),
  bark: (wind = 0, which = 'bark') => cached('bark' + which + wind, () => barkMaterial(wind, which, (m, w, k) => patch(m, { wind: w, key: k }))),
  depth: (wind = 0) => cached('depth' + wind, () => depthWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: foliageAtlas(), alphaTest: 0.4 }), wind)),
  rock: () => ruinMaterial('rock'),
  // Self-lit leaf cards (bioluminescent trees).
  glowLeaf: () => cached('glowLeaf', () => new THREE.MeshBasicMaterial({ vertexColors: true, map: foliageAtlas(), alphaTest: 0.4, side: THREE.DoubleSide })),
};

// Materials for static (non-instanced) builds such as ruins: concrete, glow, leaves, bark, rusted metal.
export const staticMats = () => [ruinMaterial('concrete'), MAT.glow(), MAT.leaf(), MAT.bark(), ruinMaterial('rust')];

// --- Vegetation models ----------------------------------------------------------------------------
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s, 1);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const oct = (r) => new THREE.OctahedronGeometry(r, 0);

// Bark tints multiply the photo texture, so they stay light.
const BARK = 0xd8cfc4, BIRCH = 0xfffcf4, JBARK = 0xc8c8b0;
const barkUV = (r, len) => [Math.max(1, Math.round((2 * Math.PI * r) / 0.9)), Math.max(0.5, len / 1.6)];

// A tapered trunk of bent segments; returns the top point.
export function trunk(b, h, r0, r1, bend = 0.2, segs = 3, col = BARK, seed = 1, mat = 3) {
  const rnd = mulberry32(seed);
  let x = 0, z = 0, y = 0;
  const sh = h / segs;
  for (let i = 0; i < segs; i++) {
    const ra = r0 + (r1 - r0) * (i / segs), rb = r0 + (r1 - r0) * ((i + 1) / segs);
    const tx = (rnd() - 0.5) * bend, tz = (rnd() - 0.5) * bend;
    b.add(cyl(rb, ra, sh * 1.04, 9), col, x + tx * sh * 0.5, y + sh / 2, z + tz * sh * 0.5, tz, 0, -tx, 1, 1, 1, { mat, uvScale: barkUV(ra, sh) });
    x += tx * sh; z += tz * sh; y += sh;
  }
  // root flare
  b.add(cyl(r0, r0 * 1.7, Math.min(1, h * 0.12), 9), col, 0, Math.min(1, h * 0.12) / 2, 0, 0, 0, 0, 1, 1, 1, { mat, uvScale: barkUV(r0 * 1.4, 1) });
  return [x, y, z];
}

export function branch(b, x, y, z, len, r, yaw, pitch, col = BARK, mat = 3) {
  const dx = Math.sin(yaw) * Math.sin(pitch), dy = Math.cos(pitch), dz = Math.cos(yaw) * Math.sin(pitch);
  const g = cyl(r * 0.45, r, len, 6); g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz));
  const e = new THREE.Euler().setFromQuaternion(q);
  b.add(g, col, x, y, z, e.x, e.y, e.z, 1, 1, 1, { mat, uvScale: barkUV(r, len) });
  return [x + dx * len, y + dy * len, z + dz * len];
}

// Broadleaf tree: trunk forking into limbs, leaf clusters at the limb tips forming one crown.
function broadleaf(lod, { h = 5, r = 0.42, limbs = 6, spread = 3.2, cell = CELL.broad, seed = 3, barkCol = BARK, cluster = 2.0, cards = 24, crownY = 2.4 }) {
  const b = new Builder();
  const rnd = mulberry32(seed);
  const [tx, ty, tz] = trunk(b, h, r, r * 0.5, 0.2, 3, barkCol, seed);
  const crown = { x: tx, y: ty + crownY, z: tz, rx: spread + 1.2, ry: crownY + 1.4, rz: spread + 1.2 };
  const tips = [[tx, ty + crownY * 0.9, tz]];
  for (let i = 0; i < limbs; i++) {
    const yaw = (i / limbs) * Math.PI * 2 + rnd() * 0.6;
    const y0 = ty - h * 0.25 + rnd() * h * 0.25;
    const len = spread * (0.75 + rnd() * 0.4);
    const end = branch(b, tx * 0.8, y0, tz * 0.8, len, r * 0.45, yaw, 0.75 + rnd() * 0.35, barkCol);
    tips.push(end);
    if (lod === 0) {
      const mid = [tx * 0.8 + (end[0] - tx * 0.8) * 0.55, y0 + (end[1] - y0) * 0.55, tz * 0.8 + (end[2] - tz * 0.8) * 0.55];
      tips.push(branch(b, mid[0], mid[1], mid[2], len * 0.55, r * 0.25, yaw + (rnd() - 0.5) * 1.6, 0.5 + rnd() * 0.4, barkCol));
    }
  }
  // Inner fill cards so the crown never looks see-through.
  if (lod === 0) canopy(b, { x: crown.x, y: crown.y - 0.3, z: crown.z, rx: crown.rx * 0.6, ry: crown.ry * 0.55, rz: crown.rz * 0.6, count: 40, size: [1.8, 2.6], cell, seed: seed + 900, nc: crown, color: 0xb8c0b0 });
  tips.forEach(([x, y, z], i) => canopy(b, {
    x, y: y + 0.4, z, rx: cluster * (0.85 + rnd() * 0.3), ry: cluster * 0.75, rz: cluster * (0.85 + rnd() * 0.3),
    count: lod ? Math.round(cards * 0.7) : cards, size: lod ? [2.2, 3.0] : [1.3, 2.0], cell, seed: seed * 31 + i, nc: crown,
  }));
  return b;
}

const MODELS = {
  oak: (lod) => broadleaf(lod, { h: 5, r: 0.42, limbs: lod ? 4 : 6, spread: 3.0, seed: 3, cluster: 2.0, cards: 26 }),
  maple: (lod) => broadleaf(lod, { h: 6, r: 0.36, limbs: lod ? 4 : 5, spread: 2.6, cell: CELL.autumn, seed: 21, cluster: 1.9, cards: 26, crownY: 2.8 }),
  birch: (lod) => {
    const b = new Builder();
    const rnd = mulberry32(41);
    const [tx, ty, tz] = trunk(b, 10, 0.2, 0.07, 0.12, 3, BIRCH, 41, 4);
    const crown = { x: tx, y: ty - 2.5, z: tz, rx: 2.4, ry: 4, rz: 2.4 };
    const n = lod ? 4 : 8;
    for (let i = 0; i < n; i++) {
      const y = 4.5 + (i / n) * 5.2, yaw = i * 2.4;
      const end = branch(b, tx * (y / 10), y, tz * (y / 10), 1.3 + (1 - i / n) * 1.2, 0.07, yaw, 1.1, BIRCH, 4);
      canopy(b, { x: end[0], y: end[1] - 0.3, z: end[2], rx: 1.3, ry: 1.0, rz: 1.3, count: lod ? 14 : 22, size: lod ? [1.6, 2.2] : [1.0, 1.5], cell: CELL.birch, seed: 50 + i, nc: crown });
    }
    void rnd;
    return b;
  },
  pine: (lod) => {
    const b = new Builder();
    trunk(b, 13, 0.38, 0.05, 0.04, 3, BARK, 5);
    const out = newOut();
    const rnd = mulberry32(9);
    const whorls = lod ? 7 : 13;
    for (let k = 0; k < whorls; k++) {
      const t = k / (whorls - 1);
      const y = 2.0 + t * 11.2, R = 3.3 * Math.pow(1 - t, 0.95) + 0.35;
      const n = lod ? Math.max(4, Math.round(6 * (1 - t) + 3)) : Math.max(5, Math.round(10 * (1 - t) + 5));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.6 + k * 0.7;
        const dir = new THREE.Vector3(Math.cos(a), -0.08, Math.sin(a)).normalize();
        const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        const up = new THREE.Vector3(0, 1, 0);
        const nrm = new THREE.Vector3(Math.cos(a), 0.9, Math.sin(a)).normalize();
        const shade = (0.62 + 0.38 * t) * (0.9 + rnd() * 0.2);
        const w = R * 0.65 + 0.6;
        frond(out, new THREE.Vector3(0, y, 0), dir, side, R * 1.08, w, 0.22, CELL.pine, [shade, shade, shade], 3, nrm, 0.35);
        // crossed card, rolled ~60° around the branch, gives the spray thickness
        const side2 = side.clone().multiplyScalar(0.5).addScaledVector(up, 0.866).normalize();
        frond(out, new THREE.Vector3(0, y + 0.1, 0), dir, side2, R * 1.0, w * 0.85, 0.22, CELL.pine, [shade * 0.9, shade * 0.9, shade * 0.9], 2, nrm, 0.35);
      }
    }
    // inner fill: short sprays packed around the trunk so the cone reads solid
    for (let i = 0; i < (lod ? 16 : 40); i++) {
      const t = rnd(), y = 2.4 + t * 10, R = (3.3 * Math.pow(1 - t, 0.95) + 0.35) * 0.55;
      const a = rnd() * 6.28;
      const dir = new THREE.Vector3(Math.cos(a), -0.2, Math.sin(a)).normalize();
      const nrm = new THREE.Vector3(Math.cos(a), 0.8, Math.sin(a)).normalize();
      const sh = 0.5 + 0.25 * t;
      frond(out, new THREE.Vector3(0, y, 0), dir, new THREE.Vector3(-Math.sin(a), 0.5, Math.cos(a)).normalize(), R + 0.6, R * 0.9 + 0.6, 0.15, CELL.pine, [sh, sh, sh], 1, nrm);
    }
    // leader at the top
    for (const a of [0, Math.PI / 2]) {
      const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      frond(out, new THREE.Vector3(0, 12.6, 0), new THREE.Vector3(0, 1, 0), side, 1.6, 0.9, 0, CELL.pine, [1, 1, 1], 1, new THREE.Vector3(0, 1, 0), 0.6);
    }
    b.addRaw(out.pos, out.nor, out.uv, out.col, 2);
    return b;
  },
  jungle: (lod) => {
    const b = new Builder();
    const [tx, ty, tz] = trunk(b, 16, 0.75, 0.4, 0.1, 4, JBARK, 7, 4);
    b.add(cyl(0.75, 2.1, 2.6, 10), JBARK, 0, 1.3, 0, 0, 0, 0, 1, 1, 1, { mat: 4, uvScale: barkUV(1.4, 2.6), jitter: 0.25, smooth: true, seed: 7 });
    for (let i = 0; i < (lod ? 0 : 4); i++) b.add(cyl(0.035, 0.035, 8 + i, 3), 0x3d5e2a, Math.cos(i * 1.7) * 0.8, 8 - i * 0.5, Math.sin(i * 1.7) * 0.8, 0.04 * i, 0, 0.03);
    const crown = { x: tx, y: ty, z: tz, rx: 6.5, ry: 3, rz: 6.5 };
    const tiers = [[0, ty + 0.8, 0, 5.5, 1.5], [3.5, ty - 2.6, 2, 3.2, 1.2], [-3, ty - 3.6, -1.5, 3, 1.1]];
    tiers.forEach(([ox, y, oz, rx, ry], i) => {
      if (i) branch(b, tx, y - 1, tz, Math.hypot(ox, oz), 0.25, Math.atan2(ox, oz), 1.25, JBARK, 4);
      canopy(b, { x: tx + ox, y, z: tz + oz, rx, ry, rz: rx, count: lod ? 30 : (i ? 40 : 90), size: lod ? [3, 4] : [2.2, 3.4], cell: CELL.jungle, seed: 8 + i, nc: crown });
    });
    return b;
  },
  palm: (lod) => {
    const b = new Builder();
    let x = 0, y = 0;
    for (let i = 0; i < 6; i++) { b.add(cyl(0.2 - i * 0.012, 0.24 - i * 0.012, 1.5, 9), JBARK, x, y + 0.75, 0, 0, 0, -0.07 * i, 1, 1, 1, { mat: 4, uvScale: [2, 1] }); x += 0.1 * i; y += 1.47; }
    b.add(ico(0.45, 1), 0x8a7a5a, x, y, 0, 0, 0, 0, 1, 1, 1, { mat: 4, uvScale: [1, 1] });
    const out = newOut();
    const n = lod ? 8 : 14;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (k % 2) * 0.2;
      const dir = new THREE.Vector3(Math.cos(a), 0.6 - (k % 3) * 0.3, Math.sin(a)).normalize();
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      frond(out, new THREE.Vector3(x, y, 0), dir, side, 4.8, 2.1, 0.42, CELL.palm, [1, 1, 1], lod ? 2 : 4);
    }
    b.addRaw(out.pos, out.nor, out.uv, out.col, 2);
    return b;
  },
  bush: (lod) => {
    const b = new Builder();
    const crown = { x: 0, y: 0.6, z: 0, rx: 1.8, ry: 1.2, rz: 1.8 };
    for (let i = 0; i < (lod ? 2 : 3); i++) canopy(b, { x: Math.cos(i * 2.1) * 0.6, y: 0.8 + i * 0.15, z: Math.sin(i * 2.1) * 0.6, rx: 1.1, ry: 0.8, rz: 1.1, count: lod ? 12 : 18, size: [0.9, 1.4], cell: CELL.broad, seed: 12 + i, color: 0xd8e4c8, nc: crown });
    return b;
  },
  shrub: (lod) => {
    const b = new Builder();
    const crown = { x: 0, y: 1, z: 0, rx: 2.4, ry: 1.6, rz: 2.4 };
    for (let i = 0; i < (lod ? 2 : 4); i++) canopy(b, { x: Math.cos(i * 1.7) * 1.0, y: 1.0 + (i % 2) * 0.4, z: Math.sin(i * 1.7) * 1.0, rx: 1.4, ry: 1.0, rz: 1.4, count: lod ? 12 : 20, size: [1.2, 1.8], cell: i % 2 ? CELL.ivy : CELL.broad, seed: 70 + i, color: 0xc8d8b8, nc: crown });
    return b;
  },
  fern: () => {
    const b = new Builder();
    const out = newOut();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0.9, Math.sin(a)).normalize();
      frond(out, new THREE.Vector3(0, 0.05, 0), dir, new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), 1.6, 0.9, 0.55, CELL.fern, [1, 1, 1], 3);
    }
    b.addRaw(out.pos, out.nor, out.uv, out.col, 2);
    return b;
  },
  cactus: () => {
    const C = 0x9ab890, o = (r, h) => ({ mat: 4, uvScale: barkUV(r, h) });
    return new Builder()
      .add(cyl(0.38, 0.42, 4.2, 14), C, 0, 2.1, 0, 0, 0, 0, 1, 1, 1, o(0.4, 4.2))
      .add(new THREE.SphereGeometry(0.38, 14, 4, 0, Math.PI * 2, 0, Math.PI / 2), C, 0, 4.2, 0, 0, 0, 0, 1, 1, 1, o(0.4, 0.4))
      .add(cyl(0.24, 0.24, 1.0, 12), C, 0.75, 2.0, 0, 0, 0, Math.PI / 2, 1, 1, 1, o(0.24, 1))
      .add(cyl(0.24, 0.24, 1.5, 12), C, 1.15, 2.7, 0, 0, 0, 0, 1, 1, 1, o(0.24, 1.5))
      .add(new THREE.SphereGeometry(0.24, 12, 3, 0, Math.PI * 2, 0, Math.PI / 2), C, 1.15, 3.45, 0, 0, 0, 0, 1, 1, 1, o(0.24, 0.3))
      .add(cyl(0.22, 0.22, 0.8, 12), C, -0.6, 2.6, 0, 0, 0, Math.PI / 2, 1, 1, 1, o(0.22, 0.8))
      .add(cyl(0.22, 0.22, 1.1, 12), C, -0.92, 3.1, 0, 0, 0, 0, 1, 1, 1, o(0.22, 1.1))
      .add(new THREE.SphereGeometry(0.22, 12, 3, 0, Math.PI * 2, 0, Math.PI / 2), C, -0.92, 3.65, 0, 0, 0, 0, 1, 1, 1, o(0.22, 0.3));
  },
  deadtree: () => {
    const b = new Builder();
    const [x, y, z] = trunk(b, 5, 0.32, 0.1, 0.35, 3, 0xbdb4ac, 13);
    branch(b, x * 0.6, y * 0.7, z * 0.6, 2.6, 0.12, 0.3, 1.0, 0xbdb4ac);
    branch(b, x * 0.5, y * 0.55, z * 0.5, 2.2, 0.1, 2.8, 0.9, 0xbdb4ac);
    branch(b, x, y, z, 1.8, 0.07, 4.5, 0.5, 0xbdb4ac);
    return b;
  },
  rock: () => new Builder().add(ico(0.9, 2), 0xb8b2a6, 0, 0.25, 0, 0, 0, 0, 1.3, 0.7, 1, { jitter: 0.32, seed: 9, smooth: true }),
  boulder: () => new Builder().add(ico(2, 3), 0xb8b2a6, 0, 0.6, 0, 0, 0, 0, 1.25, 0.75, 1, { jitter: 0.7, seed: 10, smooth: true }),
  reed: () => { const b = new Builder(); tuft(b, { count: 3, w: 1.2, h: 1.9, cell: CELL.reed, seed: 3 }); return b; },
  lily: () => new Builder()
    .add(new THREE.CylinderGeometry(0.6, 0.6, 0.04, 14, 1, false, 0.4, Math.PI * 2 - 0.8), 0x5a8a44, 0, 0, 0)
    .add(oct(0.13), 0xf2b8d0, 0.15, 0.08, 0.1),
  grass: () => { const b = new Builder(); tuft(b, { count: 3, w: 1.3, h: 0.85, cell: CELL.grass, seed: 5, spread: 0.3, lean: 0.1 }); return b; },
  tallgrass: () => { const b = new Builder(); tuft(b, { count: 4, w: 1.6, h: 1.3, cell: CELL.tallgrass, seed: 15, spread: 0.6, lean: 0.12 }); return b; },
  flower: () => { const b = new Builder(); tuft(b, { count: 3, w: 1.1, h: 0.75, cell: CELL.flowers, seed: 6, spread: 0.3 }); return b; },
  mushroom: () => new Builder()
    .add(cyl(0.06, 0.09, 0.5, 6), 0xd8e8e0, 0, 0.25, 0, 0, 0, 0, 1, 1, 1, { glow: 1 })
    .add(new THREE.SphereGeometry(0.28, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x5ff0d8, 0, 0.45, 0, 0, 0, 0, 1, 0.7, 1, { glow: 1 })
    .add(cyl(0.04, 0.06, 0.3, 6), 0xd8e8e0, 0.25, 0.15, 0.1, 0, 0, 0, 1, 1, 1, { glow: 1 })
    .add(new THREE.SphereGeometry(0.16, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0x9a8cff, 0.25, 0.28, 0.1, 0, 0, 0, 1, 0.7, 1, { glow: 1 }),
  glowtree: () => {
    const b = new Builder();
    const [x, y, z] = trunk(b, 6.5, 0.5, 0.22, 0.3, 3, 0x8a8098, 17);
    branch(b, x, y - 1, z, 2.4, 0.14, 1.2, 1.0, 0x8a8098);
    const crown = { x, y: y + 0.8, z, rx: 3, ry: 2.2, rz: 3 };
    canopy(b, { x, y: y + 1, z, rx: 2.6, ry: 1.8, rz: 2.6, count: 70, size: [1.2, 1.8], cell: CELL.birch, seed: 11, color: 0xa8fff0, nc: crown });
    canopy(b, { x: x + 1.9, y: y + 0.2, z: z + 0.3, rx: 1.5, ry: 1.2, rz: 1.5, count: 30, size: [1.0, 1.5], cell: CELL.birch, seed: 12, color: 0xd8c8ff, nc: crown });
    return b;
  },
  crystal: () => {
    const b = new Builder();
    const cols = [0xbfa8ff, 0x9fe8ff, 0xe8d0ff];
    for (let k = 0; k < 5; k++) {
      const a = k * 1.9, r = k ? 0.5 : 0;
      b.add(oct(0.35), cols[k % 3], Math.cos(a) * r, 0.7, Math.sin(a) * r, Math.cos(a) * 0.4 * (k ? 1 : 0), 0, Math.sin(a) * 0.4 * (k ? 1 : 0), 1, k ? 2.6 : 4, 1, { glow: 1, shade: 0.3, seed: k });
    }
    return b;
  },
};

// Per-type rendering: wind amount, shadow casting, colour variation, ground tint, whether a far LOD exists.
export const VEG_RENDER = {
  oak: { wind: 0.0025, shadow: 1, vary: 0.12, lod: 1 },
  maple: { wind: 0.0025, shadow: 1, vary: 0.12, lod: 1 },
  birch: { wind: 0.004, shadow: 1, vary: 0.1, lod: 1 },
  pine: { wind: 0.0013, shadow: 1, vary: 0.08, lod: 1 },
  jungle: { wind: 0.0008, shadow: 1, vary: 0.1, lod: 1 },
  palm: { wind: 0.004, shadow: 1, vary: 0.1, lod: 1 },
  bush: { wind: 0.03, vary: 0.15, lod: 1 },
  shrub: { wind: 0.02, vary: 0.15, lod: 1 },
  fern: { wind: 0.12, near: 1, vary: 0.15 },
  cactus: { vary: 0.08 },
  deadtree: { vary: 0.1, shadow: 1 },
  rock: { vary: 0.15 },
  boulder: { vary: 0.1, shadow: 1 },
  reed: { wind: 0.06, near: 1, vary: 0.1 },
  lily: { near: 1, vary: 0.1 },
  grass: { wind: 0.25, near: 1, ground: 1 },
  tallgrass: { wind: 0.2, near: 1, ground: 1 },
  flower: { wind: 0.25, near: 1, vary: 0.1 },
  mushroom: { near: 1, vary: 0.2 },
  glowtree: { wind: 0.003, vary: 0.2 },
  crystal: { vary: 0.2 },
};

const geoCache = new Map();
export function vegGeometry(name, lod = 0) {
  const k = name + (VEG_RENDER[name].lod ? lod : 0);
  if (!geoCache.has(k)) geoCache.set(k, MODELS[name](lod).build());
  return geoCache.get(k);
}

export function vegMaterials(name) {
  const w = VEG_RENDER[name].wind || 0;
  return [MAT.rock(), MAT.glow(w), name === 'glowtree' ? MAT.glowLeaf() : MAT.leaf(w), MAT.bark(w, 'bark'), MAT.bark(w, 'bark2')];
}

export function vegDepth(name) { return MAT.depth(VEG_RENDER[name].wind || 0); }

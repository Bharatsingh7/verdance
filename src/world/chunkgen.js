// Pure data generation for terrain chunks, vegetation placement and the overview map.
// Runs inside workers (chunk.worker.js) so the main thread never stalls.
import { heightAt, sampleHeight, sampleColor, lastWeights, roadMask, lastValley, dominantBiome } from './terrain.js';
import { hash2, smoothstep } from '../core/rng.js';
import { makeNoise2D } from '../core/noise.js';
import { LANDMARKS, TRACK } from './features.js';
import { BIOMES, BIOME_COUNT } from './biomes.js';

export const CHUNK = 128;

// --- Terrain ---------------------------------------------------------------
// Smooth, indexed grid with analytic normals; steep slopes blend to rock per vertex. Skirts hide LOD cracks.
export function buildTerrain(cx, cz, segs) {
  const step = CHUNK / segs;
  const n = segs + 1, m = n + 2;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const HB = new Float32Array(m * m);
  const col = [0, 0, 0], rock = [0, 0, 0];
  const nv = n * n + 4 * n;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), clr = new Float32Array(nv * 3);
  const spl = new Float32Array(nv * 4), spl2 = new Float32Array(nv * 2);
  const C = new Float32Array(n * n * 6);
  const sp = new Float32Array(6);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const x = x0 + (i - 1) * step, z = z0 + (j - 1) * step;
    const inner = i >= 1 && j >= 1 && i <= n && j <= n;
    if (inner) {
      const k = (j - 1) * n + (i - 1);
      HB[j * m + i] = sampleColor(x, z, col, rock, sp);
      spl.set(sp.subarray(0, 4), k * 4); spl2[k * 2] = sp[4]; spl2[k * 2 + 1] = sp[5];
      C[k * 6] = col[0]; C[k * 6 + 1] = col[1]; C[k * 6 + 2] = col[2]; C[k * 6 + 3] = rock[0]; C[k * 6 + 4] = rock[1]; C[k * 6 + 5] = rock[2];
    } else HB[j * m + i] = heightAt(x, z);
  }
  let minY = Infinity, maxY = -Infinity;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, b = (j + 1) * m + (i + 1);
    const h = HB[b];
    if (h < minY) minY = h; if (h > maxY) maxY = h;
    let nx = HB[b - 1] - HB[b + 1], ny = 2 * step, nz = HB[b - m] - HB[b + m];
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    pos[k * 3] = i * step; pos[k * 3 + 1] = h; pos[k * 3 + 2] = j * step;
    nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
    const steep = smoothstep(0.86, 0.66, ny);
    // Steep ground shows rock regardless of biome (snow slides off too).
    for (let c = 0; c < 4; c++) spl[k * 4 + c] *= 1 - steep;
    spl[k * 4 + 2] += steep * (1 - spl2[k * 2] * 0.4);
    spl2[k * 2] *= 1 - steep * 0.6;
    for (let c = 0; c < 3; c++) {
      const v = C[k * 6 + c] + (C[k * 6 + 3 + c] - C[k * 6 + c]) * steep;
      clr[k * 3 + c] = Math.pow(Math.max(v, 0), 2.2); // sRGB -> linear
    }
  }
  const quads = segs * segs + 4 * segs;
  const idx = new Uint16Array(quads * 6);
  let t = 0;
  for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if ((i + j) & 1) { idx.set([a, c, b, b, c, d], t); } else { idx.set([a, c, d, a, d, b], t); }
    t += 6;
  }
  // Skirts: a dropped copy of each edge ring.
  const drop = step * 1.5 + 2;
  const edges = [[], [], [], []];
  for (let i = 0; i < n; i++) { edges[0].push(i); edges[1].push(segs * n + i); edges[2].push(i * n); edges[3].push(i * n + segs); }
  let v = n * n;
  for (const e of edges) {
    const base = v;
    for (const k of e) {
      pos[v * 3] = pos[k * 3]; pos[v * 3 + 1] = pos[k * 3 + 1] - drop; pos[v * 3 + 2] = pos[k * 3 + 2];
      nor[v * 3] = nor[k * 3]; nor[v * 3 + 1] = nor[k * 3 + 1]; nor[v * 3 + 2] = nor[k * 3 + 2];
      clr[v * 3] = clr[k * 3] * 0.8; clr[v * 3 + 1] = clr[k * 3 + 1] * 0.8; clr[v * 3 + 2] = clr[k * 3 + 2] * 0.8;
      for (let c = 0; c < 4; c++) spl[v * 4 + c] = spl[k * 4 + c];
      spl2[v * 2] = spl2[k * 2]; spl2[v * 2 + 1] = spl2[k * 2 + 1];
      v++;
    }
    for (let i = 0; i < segs; i++) { idx.set([e[i], e[i + 1], base + i, e[i + 1], base + i + 1, base + i], t); t += 6; }
  }
  return { pos, nor, clr, spl, spl2, idx, minY: minY - drop, maxY };
}

// --- Vegetation ------------------------------------------------------------
// density per biome: [meadow, forest, rainforest, desert, canyon, mountain, wetland]
export const VEG = {
  oak:       { spacing: 9,  dens: [0.12, 0.3, 0, 0, 0, 0.04, 0.08], clump: 0.6, scale: [0.8, 1.3], big: 1 },
  maple:     { spacing: 12, dens: [0.04, 0.18, 0, 0, 0, 0, 0.03], clump: 0.7, scale: [0.8, 1.2], big: 1 },
  birch:     { spacing: 8,  dens: [0.05, 0.22, 0, 0, 0, 0.06, 0.05], clump: 0.8, scale: [0.8, 1.2], big: 1 },
  pine:      { spacing: 6,  dens: [0.02, 0.75, 0, 0, 0.02, 0.5, 0], clump: 0.5, scale: [0.75, 1.5], big: 1, maxH: 175 },
  jungle:    { spacing: 8,  dens: [0, 0, 0.7, 0, 0, 0, 0], clump: 0.2, scale: [0.8, 1.4], big: 1 },
  palm:      { spacing: 9,  dens: [0, 0, 0.3, 0.02, 0, 0, 0.05], clump: 0.4, scale: [0.8, 1.3], big: 1 },
  bush:      { spacing: 5,  dens: [0.12, 0.3, 0.4, 0, 0, 0.1, 0.18], clump: 0.6, scale: [0.6, 1.3] },
  shrub:     { spacing: 7,  dens: [0.03, 0.25, 0.45, 0, 0, 0.05, 0.1], clump: 0.6, scale: [0.7, 1.3] },
  fern:      { spacing: 3.5, dens: [0, 0.3, 0.75, 0, 0, 0, 0.15], clump: 0.5, scale: [0.7, 1.4], small: 1 },
  cactus:    { spacing: 14, dens: [0, 0, 0, 0.18, 0.1, 0, 0], clump: 0.3, scale: [0.7, 1.4] },
  deadtree:  { spacing: 22, dens: [0.01, 0, 0, 0.08, 0.08, 0.02, 0.06], clump: 0, scale: [0.7, 1.3] },
  rock:      { spacing: 10, dens: [0.04, 0.1, 0.05, 0.08, 0.2, 0.22, 0.04], clump: 0.5, scale: [0.4, 1.6], slopeOK: 1 },
  boulder:   { spacing: 28, dens: [0.015, 0.04, 0.01, 0.03, 0.12, 0.15, 0], clump: 0.3, scale: [1, 2.6], slopeOK: 1 },
  reed:      { spacing: 2.2, dens: [0.3, 0.3, 0.3, 0.1, 0.1, 0, 0.85], clump: 0.5, scale: [0.7, 1.3], small: 1, shore: 1 },
  lily:      { spacing: 3,  dens: [0, 0, 0.1, 0, 0, 0, 0.5], clump: 0.6, scale: [0.6, 1.3], small: 1, water: 1 },
  grass:     { spacing: 2.2, dens: [0.7, 0.3, 0.4, 0, 0.02, 0.3, 0.55], clump: 0.4, scale: [0.7, 1.3], small: 1 },
  tallgrass: { spacing: 3.8, dens: [0.35, 0.08, 0.1, 0, 0, 0.1, 0.3], clump: 0.85, scale: [0.7, 1.2], small: 1 },
  flower:    { spacing: 3.2, dens: [0.3, 0.05, 0.05, 0, 0, 0.08, 0.06], clump: 0.8, scale: [0.6, 1.2], small: 1 },
  mushroom:  { spacing: 4,  dens: [0, 0, 0, 0, 0, 0, 0], clump: 0.3, scale: [0.6, 1.6], small: 1 },
  glowtree:  { spacing: 10, dens: [0, 0, 0, 0, 0, 0, 0], clump: 0.2, scale: [0.9, 1.4], big: 1 },
  crystal:   { spacing: 6,  dens: [0, 0, 0, 0, 0, 0, 0], clump: 0.4, scale: [0.6, 2.0] },
};

// Inside hidden valleys the regular biome mix is replaced.
const VALLEY_VEG = {
  lantern: { glowtree: 0.5, mushroom: 0.55, fern: 0.6, grass: 0.3, flower: 0.15 },
  starfield: { flower: 0.9, grass: 0.7, oak: 0.05, bush: 0.1 },
  crystal: { crystal: 0.45, rock: 0.25, boulder: 0.1, mushroom: 0.1 },
  glass: { jungle: 0.35, palm: 0.2, fern: 0.6, flower: 0.5, grass: 0.4 },
};

const clumpNoise = makeNoise2D(2024);
const CLEAR = LANDMARKS.map((l) => ({ x: l.x, z: l.z, r2: ((l.kind === 'city' ? 1.0 : 0.6) * (l.flat || 30)) ** 2 }));

function trackDist(x, z) {
  let d = 1e9;
  for (let i = 0; i < TRACK.length - 1; i++) {
    const [ax, az] = TRACK[i], [bx, bz] = TRACK[i + 1];
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return d;
}

export const VEG_STRIDE = 8;
const gcol = [0, 0, 0], grock = [0, 0, 0];

export function buildVegetation(cx, cz, density) {
  const out = {};
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  let typeIdx = 0;
  for (const [name, V] of Object.entries(VEG)) {
    typeIdx++;
    const sp = V.spacing / Math.sqrt(V.small ? Math.min(1, density) : density);
    const cells = Math.floor(CHUNK / sp);
    const list = [];
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
      const gx = cx * cells + i, gz = cz * cells + j;
      const x = x0 + (i + hash2(gx, gz, typeIdx)) * sp;
      const z = z0 + (j + hash2(gx, gz, typeIdx + 50)) * sp;
      const roll = hash2(gx, gz, typeIdx + 100);
      const h = sampleHeight(x, z);
      let d = 0;
      const valley = lastValley();
      if (valley) d = VALLEY_VEG[valley.id][name] || 0;
      else for (let b = 0; b < BIOME_COUNT; b++) d += lastWeights[b] * V.dens[b];
      if (d <= 0) continue;
      const cl = clumpNoise(x / 70 + typeIdx * 13.1, z / 70);
      d *= 1 - V.clump + V.clump * smoothstep(-0.5, 0.6, cl) * 1.6;
      if (roll > d) continue;

      if (V.water) { if (h > -0.4 || h < -3.5) continue; }
      else if (V.shore) { if (h < -0.5 || h > 1.6) continue; }
      else if (h < 0.7) continue;
      if (V.maxH && h > V.maxH + 15 * clumpNoise(x / 40, z / 40)) continue;

      if (!V.water) {
        const sx = heightAt(x + 1.5, z) - h, sz = heightAt(x, z + 1.5) - h;
        const slope = Math.hypot(sx, sz) / 1.5;
        if (slope > (V.slopeOK ? 1.4 : 0.65)) continue;
        const rm = roadMask(x, z);
        if (rm > (V.small ? 0.5 : 0.15)) continue;
        if (trackDist(x, z) < 5) continue;
        let blocked = false;
        for (const c of CLEAR) { const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < c.r2 && !V.small) { blocked = true; break; } }
        if (blocked) continue;
      }
      const s = V.scale[0] + (V.scale[1] - V.scale[0]) * hash2(gx, gz, typeIdx + 200);
      let r = -1, g = -1, bl = -1;
      if (name === 'grass' || name === 'tallgrass') { sampleColor(x, z, gcol, grock); r = Math.pow(gcol[0], 2.2); g = Math.pow(gcol[1], 2.2); bl = Math.pow(gcol[2], 2.2); }
      list.push(x, V.water ? 0.04 : h - (V.big ? 0.3 : 0.05), z, hash2(gx, gz, typeIdx + 300) * Math.PI * 2, s, r, g, bl);
    }
    if (list.length) out[name] = new Float32Array(list);
  }
  return out;
}

// --- Overview map ------------------------------------------------------------
export function buildMap(size, half) {
  const img = new Uint8ClampedArray(size * size * 4);
  const col = [0, 0, 0], rock = [0, 0, 0];
  const step = (half * 2) / size;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = -half + (i + 0.5) * step, z = -half + (j + 0.5) * step;
    const h = sampleColor(x, z, col, rock);
    const k = (j * size + i) * 4;
    if (h < 0) {
      const d = Math.min(1, -h / 20);
      img[k] = 120 - 70 * d; img[k + 1] = 170 - 60 * d; img[k + 2] = 185 - 30 * d;
    } else {
      const hx = heightAt(x + step, z) - h;
      const shade = Math.max(0.65, Math.min(1.25, 1 - hx * 0.06));
      const lines = Math.abs((h / 25) % 1) < 0.06 * (step / 8) * 4 ? 0.88 : 1;
      img[k] = col[0] * 255 * shade * lines; img[k + 1] = col[1] * 255 * shade * lines; img[k + 2] = col[2] * 255 * shade * lines;
    }
    img[k + 3] = 255;
  }
  return img;
}

export function biomeOf(x, z) { return dominantBiome(x, z); }
export { BIOMES };

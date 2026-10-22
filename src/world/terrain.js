// The world's shape: a pure function of (x, z). Used by chunk meshes, physics, vegetation and the map,
// so everything agrees without storing a heightmap.
import { makeNoise2D, fbm, ridged } from '../core/noise.js';
import { clamp, lerp, smoothstep } from '../core/rng.js';
import { BIOMES, BIOME_COUNT, MEADOW, FOREST, RAINFOREST, DESERT, CANYON, MOUNTAIN, WETLAND, SAND, SNOW, ROAD, MUD } from './biomes.js';
import { BIOME_SEEDS, GORGE, LAKES, LANDMARKS, VALLEYS, ROADS } from './features.js';

export const WATER_LEVEL = 0;

const n1 = makeNoise2D(1337), n2 = makeNoise2D(4242), n3 = makeNoise2D(9001), n4 = makeNoise2D(77);

const BLEND = 230;
const W = new Float32Array(BIOME_COUNT);
const dist = new Float32Array(BIOME_COUNT);

// Biome weights at a point (domain-warped nearest-seed regions with soft borders). Fills W.
function biomeWeights(x, z) {
  const wx = x + 260 * n2(x / 900, z / 900) + 60 * n3(x / 200, z / 200);
  const wz = z + 260 * n2(x / 900 + 31.7, z / 900 - 12.3) + 60 * n3(x / 200 - 9, z / 200 + 4);
  dist.fill(1e9);
  for (let i = 0; i < BIOME_SEEDS.length; i++) {
    const s = BIOME_SEEDS[i];
    const dx = wx - s[1], dz = wz - s[2];
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < dist[s[0]]) dist[s[0]] = d;
  }
  let dmin = 1e9;
  for (let b = 0; b < BIOME_COUNT; b++) if (dist[b] < dmin) dmin = dist[b];
  let sum = 0;
  for (let b = 0; b < BIOME_COUNT; b++) {
    const t = 1 - (dist[b] - dmin) / BLEND;
    const w = t > 0 ? t * t * (3 - 2 * t) : 0;
    W[b] = w; sum += w;
  }
  for (let b = 0; b < BIOME_COUNT; b++) W[b] /= sum;
}

const terrace = (t, steps) => {
  const s = t * steps, f = Math.floor(s);
  return (f + smoothstep(0.55, 1, s - f)) / steps;
};

function biomeHeight(b, x, z) {
  switch (b) {
    case MEADOW: return 7 + 11 * fbm(n1, x / 380, z / 380, 3) + 2.5 * n2(x / 90, z / 90);
    case FOREST: return 13 + 22 * fbm(n1, x / 420, z / 420, 4) + 4 * n3(x / 85, z / 85);
    case RAINFOREST: {
      const f = fbm(n1, x / 300, z / 300, 4) * 0.5 + 0.5;
      return 6 + 38 * f * f + 5 * n3(x / 60, z / 60);
    }
    case DESERT: {
      const u = (x * 0.8 + z * 0.35) / 38 + 3.2 * n2(x / 260, z / 260);
      const dune = Math.pow(1 - Math.abs(Math.sin(u)), 1.6);
      return 9 + 7 * fbm(n1, x / 520, z / 520, 3) + 5.5 * dune * (0.6 + 0.4 * n3(x / 300, z / 300));
    }
    case CANYON: {
      const plateau = 58 + 14 * fbm(n1, x / 420, z / 420, 3);
      const cx = x + 90 * n3(x / 300, z / 300);
      const c = Math.abs(fbm(n4, cx / 520, z / 520, 3));
      const m = smoothstep(0.035, 0.17, c);
      return lerp(7, plateau, terrace(m, 4));
    }
    case MOUNTAIN: {
      const r = ridged(n4, x / 720, z / 720, 5);
      return 35 + 300 * Math.pow(r, 1.6) + 18 * fbm(n2, x / 200, z / 200, 3);
    }
    case WETLAND: return 1.0 + 3.6 * fbm(n1, x / 160, z / 160, 4) + 1.2 * n3(x / 40, z / 40);
  }
  return 0;
}

function segDist(px, pz, ax, az, bx, bz, out) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
  const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
  if (out) out.t = t;
  return Math.sqrt(dx * dx + dz * dz);
}

function polyDist(px, pz, pts) {
  let d = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    d = Math.min(d, segDist(px, pz, a[0], a[1], b[0], b[1]));
  }
  return d;
}

// Stage 1: biomes + gorge + lakes + coastline. Leaves weights in W.
function baseHeight(x, z) {
  biomeWeights(x, z);
  let h = 0;
  for (let b = 0; b < BIOME_COUNT; b++) if (W[b] > 0.001) h += W[b] * biomeHeight(b, x, z);

  const gd = polyDist(x, z, GORGE);
  if (gd < 140) {
    const m = smoothstep(24, 110, gd);
    h = Math.min(h, lerp(-4, Math.max(h, 30), terrace(m, 3)));
  }

  for (const L of LAKES) {
    const dx = x - L.x, dz = z - L.z;
    const d = Math.sqrt(dx * dx + dz * dz) * (1 + 0.18 * n3(x / 60, z / 60));
    if (d < L.r * 1.6) h = Math.min(h, lerp(-L.depth, h, smoothstep(L.r * 0.55, L.r * 1.5, d)));
  }

  const r = Math.sqrt(x * x + z * z) * 0.55 + Math.max(Math.abs(x), Math.abs(z)) * 0.45 + 130 * n2(x / 600, z / 600) + 40 * n3(x / 150, z / 150);
  const coast = smoothstep(1580, 1930, r);
  if (coast > 0) h = lerp(h, -24, coast);
  return h;
}

// Stage 2 data: flattened pads and valley floors, derived from stage 1 once.
const PADS = LANDMARKS.filter((l) => l.flat > 0).map((l) => ({ x: l.x, z: l.z, r: l.flat, h: Math.max(baseHeight(l.x, l.z), l.pad ?? 2) }));
const VAL = VALLEYS.map((v) => {
  const dx = Math.cos(v.angle), dz = Math.sin(v.angle);
  const mx = v.x + dx * v.r * 2.1, mz = v.z + dz * v.r * 2.1;
  const floor = Math.max(baseHeight(mx, mz) - 1, 5);
  return { ...v, dx, dz, ax: v.x + dx * v.r * 0.6, az: v.z + dz * v.r * 0.6, bx: mx, bz: mz, floor, width: 16 };
});
export const VALLEY_DATA = VAL;
const seg = { t: 0 };

let valleyMask = 0, valleyIndex = -1;

// Final terrain height.
export function heightAt(x, z) {
  let h = baseHeight(x, z);

  for (const p of PADS) {
    const dx = x - p.x, dz = z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < p.r * p.r * 2.6) h = lerp(p.h, h, smoothstep(p.r * 0.75, p.r * 1.6, Math.sqrt(d2)));
  }

  valleyMask = 0; valleyIndex = -1;
  for (let i = 0; i < VAL.length; i++) {
    const v = VAL[i];
    const dx = x - v.x, dz = z - v.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > v.r * 2.4) continue;
    const ring = smoothstep(v.r * 0.85, v.r * 1.08, d) * (1 - smoothstep(v.r * 1.35, v.r * 2.0, d));
    const rough = n3(x / 23, z / 23);
    const wallH = v.floor + v.wall * ring * (0.85 + 0.25 * rough);
    const basin = 1 - smoothstep(v.r * 0.8, v.r * 1.0, d);
    const floorH = v.floor + 1.6 * n2(x / 40, z / 40) + 2.5 * smoothstep(v.r * 0.5, v.r * 0.95, d);
    h = lerp(Math.max(h, wallH), floorH, basin);
    const dc = segDist(x, z, v.ax, v.az, v.bx, v.bz, seg);
    const cm = 1 - smoothstep(v.width * 0.5, v.width * (1.1 + 0.3 * rough), dc);
    if (cm > 0) h = lerp(h, lerp(v.floor, baseHeight(x, z), smoothstep(0.75, 1, seg.t)), cm);
    if (basin > valleyMask) { valleyMask = basin; valleyIndex = i; }
  }
  return h;
}

// Same as heightAt but leaves biome weights in W (heightAt's last baseHeight call may be a corridor sample).
export function sampleHeight(x, z) {
  const h = heightAt(x, z);
  biomeWeights(x, z);
  return h;
}

export function weightsAt(x, z, out) {
  biomeWeights(x, z);
  out.set(W);
  return out;
}

export function dominantBiome(x, z) {
  biomeWeights(x, z);
  let best = 0;
  for (let b = 1; b < BIOME_COUNT; b++) if (W[b] > W[best]) best = b;
  return best;
}

export function lastValley() { return valleyMask > 0.5 ? VAL[valleyIndex] : null; }

export function valleyAt(x, z) {
  heightAt(x, z);
  return valleyMask > 0.5 ? VAL[valleyIndex] : null;
}

export function normalAt(x, z, out, e = 1.5) {
  const hl = heightAt(x - e, z), hr = heightAt(x + e, z);
  const hd = heightAt(x, z - e), hu = heightAt(x, z + e);
  out.set(hl - hr, 2 * e, hd - hu).normalize();
  return out;
}

// --- Colour ---------------------------------------------------------------
const ROAD_SEGS = [];
for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
  const [ax, az] = r[i], [bx, bz] = r[i + 1];
  ROAD_SEGS.push({ ax, az, bx, bz, minx: Math.min(ax, bx) - 12, maxx: Math.max(ax, bx) + 12, minz: Math.min(az, bz) - 12, maxz: Math.max(az, bz) + 12 });
}

export function roadMask(x, z) {
  let d = 1e9;
  for (const s of ROAD_SEGS) {
    if (x < s.minx || x > s.maxx || z < s.minz || z > s.maxz) continue;
    d = Math.min(d, segDist(x, z, s.ax, s.az, s.bx, s.bz));
  }
  if (d > 6) return 0;
  // Broken asphalt: holes where moss has won.
  const crack = n3(x / 9, z / 9);
  return (1 - smoothstep(3.2, 5.5, d)) * smoothstep(-0.55, -0.2, crack);
}

const VALLEY_TINT = {
  lantern: [0.16, 0.42, 0.38], starfield: [0.55, 0.62, 0.36], crystal: [0.72, 0.7, 0.78], glass: [0.3, 0.6, 0.28],
};

const STRATA = [[0.78, 0.45, 0.3], [0.86, 0.6, 0.4], [0.68, 0.36, 0.26], [0.9, 0.72, 0.52], [0.74, 0.42, 0.32]];

function mix3(out, a, b, t) { out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t); }

const tmp = [0, 0, 0];

// Ground + rock colours for a vertex. Returns height; writes col/rock (arrays of 3) and, if given,
// texture-layer weights into splat: [grass, dirt, rock, sand, snow, road] (slope is applied by the caller).
export function sampleColor(x, z, col, rock, splat) {
  const h = heightAt(x, z);
  const vmask = valleyMask, vidx = valleyIndex;
  biomeWeights(x, z);
  const patch = 0.5 + 0.5 * n1(x / 55, z / 55);
  col[0] = col[1] = col[2] = 0; rock[0] = rock[1] = rock[2] = 0;
  for (let b = 0; b < BIOME_COUNT; b++) {
    const w = W[b];
    if (w < 0.001) continue;
    const B = BIOMES[b];
    mix3(tmp, B.ground, B.ground2, patch);
    if (b === CANYON || (b === DESERT && h > 20)) {
      const band = STRATA[((Math.floor(h / 6 + n2(x / 300, z / 300) * 0.8) % 5) + 5) % 5];
      mix3(tmp, tmp, band, b === CANYON ? smoothstep(10, 22, h) * 0.85 : 0.4);
    }
    if (b === MOUNTAIN) {
      mix3(tmp, tmp, B.rock, smoothstep(70, 120, h) * 0.8);
      mix3(tmp, tmp, SNOW, smoothstep(150, 175, h + 18 * n3(x / 70, z / 70)));
    }
    if (b === DESERT) mix3(tmp, tmp, SAND, 0.25 * (0.5 + 0.5 * n3(x / 20, z / 20)));
    col[0] += tmp[0] * w; col[1] += tmp[1] * w; col[2] += tmp[2] * w;
    const rk = b === MOUNTAIN && h > 160 ? SNOW : b === CANYON ? STRATA[((Math.floor(h / 6) % 5) + 5) % 5] : B.rock;
    rock[0] += rk[0] * w; rock[1] += rk[1] * w; rock[2] += rk[2] * w;
  }

  if (h < 2.2) {
    const shore = smoothstep(2.2, 0.6, h);
    mix3(col, col, W[WETLAND] + W[RAINFOREST] > 0.5 ? MUD : SAND, shore);
    if (h < -0.8) { col[0] *= 0.82; col[1] *= 0.86; col[2] *= 0.8; }
  }

  if (vmask > 0.05) mix3(col, col, VALLEY_TINT[VAL[vidx].id], vmask * 0.65);

  const rm = h > 0.3 ? roadMask(x, z) : 0;
  if (rm > 0) mix3(col, col, ROAD, rm * 0.85);

  const v = 1 + 0.07 * n4(x / 6, z / 6);
  col[0] *= v; col[1] *= v; col[2] *= v;

  if (splat) {
    const patchy = smoothstep(-0.2, 0.5, n2(x / 45, z / 45));
    const snow = W[MOUNTAIN] * smoothstep(145, 175, h + 18 * n3(x / 70, z / 70));
    let grass = W[MEADOW] * (1 - 0.35 * patchy) + W[FOREST] * 0.45 + W[RAINFOREST] * 0.7 + W[WETLAND] * 0.55 + W[MOUNTAIN] * (1 - smoothstep(60, 110, h));
    let dirt = W[MEADOW] * 0.35 * patchy + W[FOREST] * 0.55 + W[RAINFOREST] * 0.3 + W[WETLAND] * 0.45;
    let rk = W[CANYON] * smoothstep(10, 22, h) + W[MOUNTAIN] * smoothstep(60, 110, h) + W[DESERT] * smoothstep(20, 40, h) * 0.5;
    let sand = W[DESERT] + W[CANYON] * (1 - smoothstep(10, 22, h));
    if (vmask > 0.05) {
      const id = VAL[vidx].id;
      const k = vmask;
      grass *= 1 - k; dirt *= 1 - k; rk *= 1 - k; sand *= 1 - k;
      if (id === 'lantern') dirt += k; else if (id === 'crystal') rk += k; else grass += k;
    }
    if (h < 2.2) {
      const shore = smoothstep(2.2, 0.6, h);
      const muddy = W[WETLAND] + W[RAINFOREST] > 0.5;
      grass *= 1 - shore; dirt *= 1 - shore; rk *= 1 - shore; sand *= 1 - shore;
      if (muddy) dirt += shore; else sand += shore;
    }
    const sum = grass + dirt + rk + sand || 1;
    splat[0] = grass / sum * (1 - snow); splat[1] = dirt / sum * (1 - snow); splat[2] = rk / sum * (1 - snow); splat[3] = sand / sum * (1 - snow);
    splat[4] = snow; splat[5] = rm;
  }
  return h;
}

export function biomeName(b) { return BIOMES[b].name; }
export { W as lastWeights };

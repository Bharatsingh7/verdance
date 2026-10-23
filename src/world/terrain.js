// The world's shape: a pure function of (x, z). Used by chunk meshes, physics, vegetation and the map,
// so everything agrees without storing a heightmap. The hand-made Origin Isle sits at the centre; the
// endless wilds (wilds.js) surround it, with procedural sites placed on a grid.
import { makeNoise2D, fbm, ridged } from '../core/noise.js';
import { clamp, lerp, smoothstep, hash2 } from '../core/rng.js';
import {
  BIOMES, BIOME_COUNT, MEADOW, FOREST, RAINFOREST, DESERT, CANYON, MOUNTAIN, WETLAND, AUTUMN, TAIGA, SAVANNA, REDWOOD, BLOSSOM,
  SAND, SNOW, ROAD, MUD, SALT, SEABED,
} from './biomes.js';
import { BIOME_SEEDS, GORGE, LAKES, LANDMARKS, VALLEYS, ROADS } from './features.js';
import { SEED_CELL, seedCell, wildShape, causewayDist, CAUSEWAYS, placeName } from './wilds.js';

export const WATER_LEVEL = 0;

const n1 = makeNoise2D(1337), n2 = makeNoise2D(4242), n3 = makeNoise2D(9001), n4 = makeNoise2D(77);

const BLEND = 230;
const W = new Float32Array(BIOME_COUNT);
const dist = new Float32Array(BIOME_COUNT);

// Radial distance from the isle with the coastline's wobble (the isle and its sea ring are inside ~2300).
export function radial(x, z) {
  return Math.sqrt(x * x + z * z) * 0.55 + Math.max(Math.abs(x), Math.abs(z)) * 0.45 + 130 * n2(x / 600, z / 600) + 40 * n3(x / 150, z / 150);
}

// Biome weights at a point (domain-warped nearest-seed regions with soft borders). Fills W.
function biomeWeights(x, z) {
  const wx = x + 260 * n2(x / 900, z / 900) + 60 * n3(x / 200, z / 200);
  const wz = z + 260 * n2(x / 900 + 31.7, z / 900 - 12.3) + 60 * n3(x / 200 - 9, z / 200 + 4);
  dist.fill(1e9);
  if (wx * wx + wz * wz < 3600 * 3600) {
    for (let i = 0; i < BIOME_SEEDS.length; i++) {
      const s = BIOME_SEEDS[i];
      const dx = wx - s[1], dz = wz - s[2];
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < dist[s[0]]) dist[s[0]] = d;
    }
  }
  // Procedural seeds (3x3 cells is enough: jitter <= 0.4 keeps far seeds beyond the blend width).
  const ci = Math.floor(wx / SEED_CELL), cj = Math.floor(wz / SEED_CELL);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const s = seedCell(i, j);
    if (!s.far) continue;
    const dx = wx - s.x, dz = wz - s.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < dist[s.b]) dist[s.b] = d;
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
    case AUTUMN: return 14 + 26 * fbm(n1, x / 450, z / 450, 4) + 5 * n3(x / 90, z / 90);
    case TAIGA: return 30 + 44 * fbm(n1, x / 520, z / 520, 4) + 26 * ridged(n4, x / 420, z / 420, 3);
    case SAVANNA: {
      const k = Math.max(0, n3(x / 140, z / 140));
      return 7 + 7 * fbm(n1, x / 700, z / 700, 3) + 16 * k * k * k * k;
    }
    case REDWOOD: return 20 + 34 * fbm(n1, x / 520, z / 520, 4) + 6 * n3(x / 110, z / 110);
    case BLOSSOM: {
      const q = fbm(n1, x / 280, z / 280, 3) * 0.5 + 0.5;
      return 10 + 32 * q * q + 3 * n2(x / 70, z / 70);
    }
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

let lastR = 0;

// Stage 1: biomes + gorge + lakes + coastline (isle) or continents (wilds). Leaves weights in W.
function baseHeight(x, z) {
  biomeWeights(x, z);
  let h = 0;
  for (let b = 0; b < BIOME_COUNT; b++) if (W[b] > 0.001) h += W[b] * biomeHeight(b, x, z);
  const r = radial(x, z);
  lastR = r;

  if (r < 2300) {
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
  }

  const wild = smoothstep(2350, 2950, r);
  const coast = smoothstep(1580, 1930, r);
  const hIsle = coast > 0 ? lerp(h, -24, coast) : h;
  h = wild > 0 ? lerp(hIsle, wildShape(x, z, h, r), wild) : hIsle;

  // Drowned causeways: shallow enough to drive across on wheels.
  if (r > 1450) {
    const cd = causewayDist(x, z);
    if (cd < 26) h = Math.max(h, lerp(-0.35 + 0.1 * n3(x / 25, z / 25), h, smoothstep(9, 26, cd)));
  }
  return h;
}

// --- Valleys (isle + procedural) ---------------------------------------------------------------------
function makeValley(v) {
  const dx = Math.cos(v.angle), dz = Math.sin(v.angle);
  const mx = v.x + dx * v.r * 2.1, mz = v.z + dz * v.r * 2.1;
  const floor = Math.max(baseHeight(mx, mz) - 1, 5);
  return { theme: v.id, ...v, dx, dz, ax: v.x + dx * v.r * 0.6, az: v.z + dz * v.r * 0.6, bx: mx, bz: mz, floor, width: 16 };
}

// Stage 2 data: flattened pads and valley floors, derived from stage 1 once.
const PADS = LANDMARKS.filter((l) => l.flat > 0).map((l) => ({ x: l.x, z: l.z, r: l.flat, h: Math.max(baseHeight(l.x, l.z), l.pad ?? 2) }));
const VAL = VALLEYS.map(makeValley);
export const VALLEY_DATA = VAL;
const seg = { t: 0 };

let valleyMask = 0, valleyObj = null;

function applyValley(h, x, z, v) {
  const dx = x - v.x, dz = z - v.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > v.r * 2.4) return h;
  const ring = smoothstep(v.r * 0.85, v.r * 1.08, d) * (1 - smoothstep(v.r * 1.35, v.r * 2.0, d));
  const rough = n3(x / 23, z / 23);
  const wallH = v.floor + v.wall * ring * (0.85 + 0.25 * rough);
  const basin = 1 - smoothstep(v.r * 0.8, v.r * 1.0, d);
  const floorH = v.floor + 1.6 * n2(x / 40, z / 40) + 2.5 * smoothstep(v.r * 0.5, v.r * 0.95, d) - (v.lake ? 9 * (1 - smoothstep(v.r * 0.15, v.r * 0.45, Math.hypot(dx + v.r * 0.25, dz))) : 0);
  // Fade out completely before the edge of influence (no seams), even when the floor sits above the land.
  const fade = 1 - smoothstep(v.r * 1.9, v.r * 2.35, d);
  h = lerp(h, lerp(Math.max(h, wallH), floorH, basin), fade);
  const dc = segDist(x, z, v.ax, v.az, v.bx, v.bz, seg);
  const cm = 1 - smoothstep(v.width * 0.5, v.width * (1.1 + 0.3 * rough), dc);
  if (cm > 0) h = lerp(h, lerp(v.floor, baseHeight(x, z), smoothstep(0.75, 1, seg.t)), cm);
  if (basin > valleyMask) { valleyMask = basin; valleyObj = v; }
  return h;
}

// --- Procedural sites --------------------------------------------------------------------------------
export const SITE_CELL = 640, WONDER_CELL = 2900;
const siteCache = new Map(), wonderCache = new Map();
const VILLAGE_STYLE = { [MEADOW]: 'cottage', [BLOSSOM]: 'cottage', [FOREST]: 'cabin', [AUTUMN]: 'cabin', [REDWOOD]: 'cabin', [TAIGA]: 'cabin', [MOUNTAIN]: 'cabin', [DESERT]: 'adobe', [CANYON]: 'adobe', [SAVANNA]: 'adobe', [WETLAND]: 'stilt', [RAINFOREST]: 'tree' };
const RUINS = [['turbines', 0], ['fuel', 45], ['dishes', 90], ['giant', 40], ['plane', 75], ['park', 70], ['relay', 22], ['overpass', 0], ['stadium', 120], ['city', 175], ['village', 80]];
const THEMES = { [MEADOW]: 'starfield', [BLOSSOM]: 'blossom', [FOREST]: 'glass', [AUTUMN]: 'starfield', [REDWOOD]: 'lantern', [RAINFOREST]: 'lantern', [WETLAND]: 'lantern', [DESERT]: 'crystal', [CANYON]: 'crystal', [SAVANNA]: 'starfield', [TAIGA]: 'crystal', [MOUNTAIN]: 'crystal' };
const VALLEY_TEXT = {
  starfield: 'A walled meadow where the sky feels closer. Someone left a telescope pointing up.',
  blossom: 'Petals fall here all year. The wind cannot find the way in.',
  glass: 'A greenhouse that broke open and became a forest of its own.',
  lantern: 'Moss that glows, trees that hum. The valley keeps its own night.',
  crystal: 'Quartz grew through the old mine until the mine became the quartz.',
  cavern: 'A hollow inside the mountain. Light falls through one round window in the rock.',
};

function dominantW() { let best = 0; for (let b = 1; b < BIOME_COUNT; b++) if (W[b] > W[best]) best = b; return best; }

function wonderCell(ci, cj) {
  const k = ci * 100003 + cj;
  if (wonderCache.has(k)) return wonderCache.get(k);
  let w = null;
  const x = (ci + 0.3 + 0.4 * hash2(ci, cj, 61)) * WONDER_CELL, z = (cj + 0.3 + 0.4 * hash2(ci, cj, 62)) * WONDER_CELL;
  if (hash2(ci, cj, 63) < 0.55 && radial(x, z) > 3700 && causewayDist(x, z) > 400) {
    const hb = baseHeight(x, z), b = dominantW(), roll = hash2(ci, cj, 64);
    const seed = (hash2(ci, cj, 65) * 1e9) | 0;
    let kind;
    if (hb < -12) kind = 'sunkencity';
    else if (hb < 1) kind = null;
    else if ((b === DESERT || b === SAVANNA || b === CANYON) && roll < 0.5) kind = 'saltflat';
    else kind = ['colossus', 'starship', 'mushroom', 'petrified', 'floatrocks', 'colossus', 'starship'][Math.floor(roll * 7)];
    const R = { sunkencity: 130, saltflat: 330, colossus: 70, starship: 95, mushroom: 260, petrified: 240, floatrocks: 150 };
    const F = { colossus: 55, starship: 75, saltflat: 330 };
    const NAMES = { sunkencity: ' Deep', saltflat: ' Salt Mirror', colossus: ' Elder Tree', starship: ' Wreck', mushroom: ' Glowwood', petrified: ' Stone Forest', floatrocks: ' Drift Isles' };
    if (kind) w = {
      id: 'w:' + ci + ':' + cj, kind: 'wonder', type: kind, x, z, r: R[kind], flat: F[kind] || 0, seed, biome: b,
      pad: kind === 'saltflat' ? Math.max(3, hb * 0.6) : Math.max(hb, 2), name: placeName(seed, 'none') + NAMES[kind],
    };
  }
  wonderCache.set(k, w);
  return w;
}

function nearWonder(x, z, pad) {
  const ci = Math.floor(x / WONDER_CELL), cj = Math.floor(z / WONDER_CELL);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const w = wonderCell(i, j);
    if (w && Math.hypot(x - w.x, z - w.z) < w.r + pad) return w;
  }
  return null;
}

// The site in grid cell (ci, cj), or null. Cached; deterministic.
export function siteCell(ci, cj) {
  const k = ci * 100003 + cj;
  if (siteCache.has(k)) return siteCache.get(k);
  siteCache.set(k, null); // guard against re-entry while computing
  let s = null;
  const x = (ci + 0.25 + 0.5 * hash2(ci, cj, 32)) * SITE_CELL, z = (cj + 0.25 + 0.5 * hash2(ci, cj, 33)) * SITE_CELL;
  if (hash2(ci, cj, 31) < 0.62 && radial(x, z) > 3000 && causewayDist(x, z) > 160 && !nearWonder(x, z, 140)) {
    const hb = baseHeight(x, z), b = dominantW();
    const roll = hash2(ci, cj, 34), seed = (hash2(ci, cj, 35) * 1e9) | 0;
    const angle = hash2(ci, cj, 36) * Math.PI * 2;
    const base = { id: 's:' + ci + ':' + cj, x, z, seed, biome: b, angle, base: hb };
    const pick = (table) => { let acc = 0; for (const [kind, p] of table) { acc += p; if (roll < acc) return kind; } return null; };
    let kind;
    if (hb < -9) kind = pick([['wreck', 0.45], ['sunken', 0.3], ['lab', 0.25]]);
    else if (hb < 1.5) kind = pick([['village', 0.5], ['ruin', 0.3]]);
    else if ((b === MOUNTAIN || b === TAIGA) && hb > 60) kind = pick([['hollow', 0.32], ['lab', 0.22], ['ruin', 0.18], ['valley', 0.12], ['village', 0.16]]);
    else if (b === MOUNTAIN || b === TAIGA) kind = pick([['village', 0.4], ['ruin', 0.35], ['valley', 0.15], ['lab', 0.1]]);
    else if (b === DESERT || b === CANYON || b === SAVANNA) kind = pick([['village', 0.34], ['lab', 0.14], ['ruin', 0.36], ['valley', 0.16]]);
    else if (b === WETLAND) kind = pick([['village', 0.5], ['ruin', 0.4], ['valley', 0.1]]);
    else kind = pick([['village', 0.34], ['waterfall', hb < 45 ? 0.22 : 0], ['ruin', 0.28], ['valley', 0.11], ['lab', 0.05]]);
    if (kind === 'village') s = { ...base, kind, style: hb < 1.5 ? 'stilt' : VILLAGE_STYLE[b], r: 75, flat: 75, pad: Math.max(hb, hb < 1.5 ? 1.4 : 2), name: placeName(seed, 'village') };
    else if (kind === 'waterfall') s = { ...base, kind, style: 'falls', r: 95, flat: 0, pad: 1.3, dx: Math.cos(angle), dz: Math.sin(angle), name: placeName(seed, 'waterfall') };
    else if (kind === 'lab') {
      const variant = hb < -9 ? 'dome' : b === MOUNTAIN || b === TAIGA ? 'bunker' : 'array';
      s = { ...base, kind, variant, r: 44, flat: variant === 'dome' ? 50 : 44, pad: variant === 'dome' ? hb : Math.max(hb, 2), name: placeName(seed, 'lab') };
    } else if (kind === 'ruin') {
      const [builder, flat] = RUINS[Math.floor(hash2(ci, cj, 37) * RUINS.length)];
      s = { ...base, kind, builder, r: Math.max(flat, 60), flat, pad: Math.max(hb, 2), name: placeName(seed, 'none') + ' Ruins' };
    } else if (kind === 'valley' || kind === 'hollow') {
      const hollow = kind === 'hollow';
      const r = hollow ? 80 + 15 * hash2(ci, cj, 38) : 85 + 30 * hash2(ci, cj, 38);
      let a = angle;
      if (hollow) { // open toward the lowest side of the massif
        let best = 1e9;
        for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2, h = baseHeight(x + Math.cos(t) * r * 2.1, z + Math.sin(t) * r * 2.1); if (h < best) { best = h; a = t; } }
      }
      const theme = hollow ? 'cavern' : THEMES[b];
      const gate = hollow ? 'tunnel' : ['waterfall', 'gap', 'tunnel'][Math.floor(hash2(ci, cj, 39) * 3)];
      const v = makeValley({ id: base.id, x, z, r, wall: hollow ? 70 : 50 + 12 * hash2(ci, cj, 40), angle: a, gate, lake: hollow });
      if (v.floor > hb + 12 || hb < 6) { siteCache.set(k, null); return null; }
      s = { ...base, ...v, kind, theme, dome: hollow, name: placeName(seed, 'none') + (hollow ? ' Hollow' : ' Vale'), text: VALLEY_TEXT[theme] };
    } else if (kind === 'wreck') s = { ...base, kind, r: 30, flat: 0, name: 'The ' + placeName(seed, 'none') };
    else if (kind === 'sunken') s = { ...base, kind, r: 70, flat: 0, name: 'Sunken ' + placeName(seed, 'none') };
  }
  siteCache.set(k, s);
  return s;
}

// Sites (and wonders) whose centres lie within R of (x, z).
export function sitesNear(x, z, R, out = []) {
  out.length = 0;
  for (const [C, fn] of [[SITE_CELL, siteCell], [WONDER_CELL, wonderCell]]) {
    const n = Math.ceil(R / C);
    const ci = Math.floor(x / C), cj = Math.floor(z / C);
    for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
      const s = fn(i, j);
      if (s && Math.hypot(s.x - x, s.z - z) < R) out.push(s);
    }
  }
  return out;
}

function waterfallShape(h, x, z, s) {
  const lx = x - s.x, lz = z - s.z, d = Math.hypot(lx, lz);
  if (d > s.r * 2.3) return h;
  const u = lx * s.dx + lz * s.dz, v = -lx * s.dz + lz * s.dx;
  const raw = h;
  let out = lerp(s.pad, h, smoothstep(s.r * 0.8, s.r * 1.6, d));
  // A shelf behind the falls: the river drops 22 m over its lip into a plunge pool.
  const across = 1 - smoothstep(50, 85, Math.abs(v));
  const behind = smoothstep(-13, -22, u) * (1 - smoothstep(120, 190, -u));
  // (a stream bed runs along the shelf to the lip; the shelf is flat beside it so the water ribbon sits right)
  const bed = 1 - smoothstep(3, 6, Math.abs(v));
  out = Math.max(out, lerp(out, s.pad + 22 + 2.5 * n3(x / 30, z / 30) * smoothstep(6, 22, Math.abs(v)) - 1.1 * bed, behind * across));
  const pool = 1 - smoothstep(10, 18, Math.hypot(u + 3, v * 0.9));
  out = lerp(out, -3, pool);
  const stream = (1 - smoothstep(3.5, 6.5, Math.abs(v - 6 * Math.sin(u / 14)))) * smoothstep(-4, 6, u) * (1 - smoothstep(8, 16, raw));
  if (stream > 0) out = Math.min(out, lerp(out, -1.6, stream));
  return out;
}

const near = [];
function siteShape(h, x, z) {
  const ci = Math.floor(x / SITE_CELL), cj = Math.floor(z / SITE_CELL);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const s = siteCell(i, j);
    if (!s) continue;
    if (s.kind === 'waterfall') h = waterfallShape(h, x, z, s);
    else if (s.kind === 'valley' || s.kind === 'hollow') near.push(s);
    else if (s.flat > 0) h = pad(h, x, z, s.x, s.z, s.flat, s.pad);
  }
  const wi = Math.floor(x / WONDER_CELL), wj = Math.floor(z / WONDER_CELL);
  for (let j = wj - 1; j <= wj + 1; j++) for (let i = wi - 1; i <= wi + 1; i++) {
    const w = wonderCell(i, j);
    if (w && w.flat > 0) h = pad(h, x, z, w.x, w.z, w.flat, w.pad);
  }
  return h;
}

function pad(h, x, z, px, pz, r, ph) {
  const dx = x - px, dz = z - pz;
  const d2 = dx * dx + dz * dz;
  if (d2 < r * r * 2.6) h = lerp(ph, h, smoothstep(r * 0.75, r * 1.6, Math.sqrt(d2)));
  return h;
}

// Final terrain height.
export function heightAt(x, z) {
  let h = baseHeight(x, z);
  const r = lastR;
  valleyMask = 0; valleyObj = null;
  if (r < 2300) {
    for (const p of PADS) h = pad(h, x, z, p.x, p.z, p.r, p.h);
    for (let i = 0; i < VAL.length; i++) h = applyValley(h, x, z, VAL[i]);
  } else if (r > 2550) {
    near.length = 0;
    h = siteShape(h, x, z);
    for (let i = 0; i < near.length; i++) h = applyValley(h, x, z, near[i]);
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
  return dominantW();
}

export function lastValley() { return valleyMask > 0.5 ? valleyObj : null; }

export function valleyAt(x, z) {
  heightAt(x, z);
  return valleyMask > 0.5 ? valleyObj : null;
}

// The wonder whose area covers (x, z), if any (vegetation and ground colour use it).
export function wonderAt(x, z) {
  const ci = Math.floor(x / WONDER_CELL), cj = Math.floor(z / WONDER_CELL);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const w = wonderCell(i, j);
    if (w && Math.hypot(x - w.x, z - w.z) < w.r) return w;
  }
  return null;
}

// Built-up area of a site (no big plants inside), or null.
export function siteClearAt(x, z) {
  const ci = Math.floor(x / SITE_CELL), cj = Math.floor(z / SITE_CELL);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const s = siteCell(i, j);
    if (!s || s.kind === 'valley' || s.kind === 'hollow' || s.kind === 'wreck') continue;
    const rr = s.kind === 'waterfall' ? s.r * 0.75 : s.kind === 'ruin' ? s.r * 0.55 : s.r * 0.85;
    if (Math.hypot(x - s.x, z - s.z) < rr) return s;
  }
  const w = wonderAt(x, z);
  if (w && (w.type === 'colossus' || w.type === 'starship' || w.type === 'saltflat')) return Math.hypot(x - w.x, z - w.z) < w.flat * 0.9 || w.type === 'saltflat' ? w : null;
  return null;
}

export function normalAt(x, z, out, e = 1.5) {
  const hl = heightAt(x - e, z), hr = heightAt(x + e, z);
  const hd = heightAt(x, z - e), hu = heightAt(x, z + e);
  out.set(hl - hr, 2 * e, hd - hu).normalize();
  return out;
}

// --- Roads and trails ----------------------------------------------------------------------------------
const ROAD_SEGS = [];
for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
  const [ax, az] = r[i], [bx, bz] = r[i + 1];
  ROAD_SEGS.push({ ax, az, bx, bz, minx: Math.min(ax, bx) - 12, maxx: Math.max(ax, bx) + 12, minz: Math.min(az, bz) - 12, maxz: Math.max(az, bz) + 12 });
}
for (const c of CAUSEWAYS) ROAD_SEGS.push({ ...c, minx: Math.min(c.ax, c.bx) - 12, maxx: Math.max(c.ax, c.bx) + 12, minz: Math.min(c.az, c.bz) - 12, maxz: Math.max(c.az, c.bz) + 12 });

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

// Dirt trails linking neighbouring villages, falls and ruins (hidden places stay off the paths).
const LINKED = { village: 1, waterfall: 1, ruin: 1 };
function trailTo(x, z, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz;
  const t = clamp(((x - a.x) * vx + (z - a.z) * vz) / L2, 0, 1);
  const L = Math.sqrt(L2);
  const perp = ((x - a.x) * vz - (z - a.z) * vx) / L;
  const wob = Math.sin(t * Math.PI) * (28 * Math.sin(a.seed) + 12 * Math.sin(t * 9 + b.seed));
  const along = t <= 0 || t >= 1 ? Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t)) : Math.abs(perp - wob);
  return along;
}
export function trailMask(x, z) {
  if (radial(x, z) < 2700) return 0;
  const ci = Math.floor(x / SITE_CELL), cj = Math.floor(z / SITE_CELL);
  let d = 1e9;
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const a = siteCell(i, j);
    if (!a || !LINKED[a.kind]) continue;
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      const b = siteCell(i + di, j + dj);
      if (b && LINKED[b.kind]) d = Math.min(d, trailTo(x, z, a, b));
    }
  }
  if (d > 5) return 0;
  return (1 - smoothstep(1.6, 3.4, d)) * (0.75 + 0.25 * n3(x / 5, z / 5));
}

// --- Colour ---------------------------------------------------------------------------------------------
const VALLEY_TINT = {
  lantern: [0.16, 0.42, 0.38], starfield: [0.55, 0.62, 0.36], crystal: [0.72, 0.7, 0.78], glass: [0.3, 0.6, 0.28],
  blossom: [0.62, 0.66, 0.4], cavern: [0.34, 0.4, 0.4],
};
const WONDER_TINT = { mushroom: [0.42, 0.36, 0.5], petrified: [0.6, 0.6, 0.58], saltflat: SALT };

const STRATA = [[0.78, 0.45, 0.3], [0.86, 0.6, 0.4], [0.68, 0.36, 0.26], [0.9, 0.72, 0.52], [0.74, 0.42, 0.32]];

function mix3(out, a, b, t) { out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t); }

const tmp = [0, 0, 0];

// Ground + rock colours for a vertex. Returns height; writes col/rock (arrays of 3) and, if given,
// texture-layer weights into splat: [grass, dirt, rock, sand, snow, road] (slope is applied by the caller).
export function sampleColor(x, z, col, rock, splat) {
  const h = heightAt(x, z);
  const vmask = valleyMask, vobj = valleyObj;
  const far = lastR > 2700;
  const wonder = far ? wonderAt(x, z) : null;
  const wtint = wonder && WONDER_TINT[wonder.type];
  const wmask = wtint ? 1 - smoothstep(wonder.r * 0.6, wonder.r, Math.hypot(x - wonder.x, z - wonder.z)) : 0;
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
    if (h < -6) mix3(col, col, SEABED, 0.5);
  }

  if (vmask > 0.05) mix3(col, col, VALLEY_TINT[vobj.theme], vmask * 0.65);
  if (wmask > 0) mix3(col, col, wtint, wmask * 0.7);

  const rm = h > -0.6 ? roadMask(x, z) : 0;
  if (rm > 0) mix3(col, col, ROAD, rm * 0.85);
  const tm = far && h > 0.3 ? trailMask(x, z) : 0;
  if (tm > 0) mix3(col, col, MUD, tm * 0.5);

  const v = 1 + 0.07 * n4(x / 6, z / 6);
  col[0] *= v; col[1] *= v; col[2] *= v;

  if (splat) {
    const patchy = smoothstep(-0.2, 0.5, n2(x / 45, z / 45));
    let snow = W[MOUNTAIN] * smoothstep(145, 175, h + 18 * n3(x / 70, z / 70));
    snow += W[TAIGA] * Math.max(smoothstep(-0.35, 0.35, n3(x / 40, z / 40)) * 0.8, smoothstep(80, 110, h));
    let grass = W[MEADOW] * (1 - 0.35 * patchy) + W[FOREST] * 0.45 + W[RAINFOREST] * 0.7 + W[WETLAND] * 0.55 + W[MOUNTAIN] * (1 - smoothstep(60, 110, h))
      + W[AUTUMN] * 0.4 + W[TAIGA] * 0.4 + W[SAVANNA] * (0.8 - 0.3 * patchy) + W[REDWOOD] * 0.3 + W[BLOSSOM] * 0.95;
    let dirt = W[MEADOW] * 0.35 * patchy + W[FOREST] * 0.55 + W[RAINFOREST] * 0.3 + W[WETLAND] * 0.45 + W[AUTUMN] * 0.6 + W[TAIGA] * 0.3 + W[REDWOOD] * 0.75 + W[SAVANNA] * 0.1;
    let rk = W[CANYON] * smoothstep(10, 22, h) + W[MOUNTAIN] * smoothstep(60, 110, h) + W[DESERT] * smoothstep(20, 40, h) * 0.5 + W[TAIGA] * smoothstep(60, 120, h) * 0.5;
    let sand = W[DESERT] + W[CANYON] * (1 - smoothstep(10, 22, h)) + W[SAVANNA] * 0.25 * patchy;
    if (vmask > 0.05) {
      const id = vobj.theme;
      const k = vmask;
      grass *= 1 - k; dirt *= 1 - k; rk *= 1 - k; sand *= 1 - k;
      if (id === 'lantern' || id === 'cavern') dirt += k; else if (id === 'crystal') rk += k; else grass += k;
    }
    if (wmask > 0) {
      grass *= 1 - wmask; dirt *= 1 - wmask; rk *= 1 - wmask; sand *= 1 - wmask; snow *= 1 - wmask;
      if (wonder.type === 'saltflat') sand += wmask; else if (wonder.type === 'petrified') { rk += wmask * 0.4; dirt += wmask * 0.6; } else dirt += wmask;
    }
    if (h < 2.2) {
      const shore = smoothstep(2.2, 0.6, h);
      const muddy = W[WETLAND] + W[RAINFOREST] > 0.5;
      grass *= 1 - shore; dirt *= 1 - shore; rk *= 1 - shore; sand *= 1 - shore; snow *= 1 - shore;
      if (muddy && h > -3) dirt += shore;
      else if (h < -6) { const rp = smoothstep(0.25, 0.6, n2(x / 30, z / 30)); sand += shore * (1 - rp); rk += shore * rp; }
      else sand += shore;
    }
    if (tm > 0) { grass *= 1 - tm; dirt += tm; }
    snow = clamp(snow, 0, 1);
    const sum = grass + dirt + rk + sand || 1;
    splat[0] = grass / sum * (1 - snow); splat[1] = dirt / sum * (1 - snow); splat[2] = rk / sum * (1 - snow); splat[3] = sand / sum * (1 - snow);
    splat[4] = snow; splat[5] = rm;
  }
  return h;
}

export function biomeName(b) { return BIOMES[b].name; }
export { W as lastWeights };

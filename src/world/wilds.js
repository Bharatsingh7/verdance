// The endless wilds beyond the Origin Isle: climate-driven biome seeds, continents and seas, slow
// terrain "moods" (mesas, lake districts, karst), rivers, the drowned causeways out of the isle, and
// a name generator. Everything is a pure function of (x, z) so workers and the main thread agree.
import { makeNoise2D, fbm, ridged } from '../core/noise.js';
import { hash2, clamp, lerp, smoothstep, mulberry32 } from '../core/rng.js';
import { MEADOW, FOREST, RAINFOREST, DESERT, CANYON, MOUNTAIN, WETLAND, AUTUMN, TAIGA, SAVANNA, REDWOOD, BLOSSOM } from './biomes.js';

export const SEED_CELL = 900;
const nT = makeNoise2D(501), nM = makeNoise2D(502), nC = makeNoise2D(503), nC2 = makeNoise2D(504);
const nS = makeNoise2D(505), nR = makeNoise2D(506), nK = makeNoise2D(507), nP = makeNoise2D(508);

// --- Biome seeds ----------------------------------------------------------------------------
// Temperature and moisture vary slowly, so neighbouring biomes make sense (no snow beside jungle).
function climateBiome(x, z, r) {
  const t = nT(x / 7000, z / 7000) + 0.3 * nT(x / 2200 + 9, z / 2200);
  const m = nM(x / 6000, z / 6000) + 0.3 * nM(x / 1900 - 3, z / 1900);
  if (r < 0.1) return MOUNTAIN;
  if (t < -0.38) return r < 0.55 ? TAIGA : r < 0.8 ? MOUNTAIN : AUTUMN;
  if (t < -0.05) return m > 0.1 ? (r < 0.4 ? AUTUMN : r < 0.7 ? FOREST : REDWOOD) : (r < 0.5 ? MEADOW : r < 0.78 ? AUTUMN : CANYON);
  if (t < 0.3) {
    if (m > 0.25) return r < 0.38 ? REDWOOD : r < 0.62 ? WETLAND : BLOSSOM;
    if (m > -0.15) return r < 0.42 ? MEADOW : r < 0.72 ? BLOSSOM : FOREST;
    return r < 0.55 ? SAVANNA : CANYON;
  }
  if (m > 0.15) return r < 0.65 ? RAINFOREST : WETLAND;
  if (m > -0.2) return r < 0.62 ? SAVANNA : DESERT;
  return r < 0.6 ? DESERT : CANYON;
}

const seedCache = new Map();
// The biome seed of grid cell (ci, cj): { x, z, b }.
export function seedCell(ci, cj) {
  const k = ci * 100003 + cj;
  let s = seedCache.get(k);
  if (!s) {
    const x = (ci + 0.3 + 0.4 * hash2(ci, cj, 11)) * SEED_CELL, z = (cj + 0.3 + 0.4 * hash2(ci, cj, 12)) * SEED_CELL;
    s = { x, z, b: climateBiome(x, z, hash2(ci, cj, 13)), far: Math.hypot(x, z) > 2350 };
    seedCache.set(k, s);
  }
  return s;
}

// --- Drowned causeways: old highways leading off the isle across the strait ------------------------
export const CAUSEWAYS = [0.35, 1.95, 3.4, 4.9].map((a) => {
  const ax = Math.cos(a) * 1500, az = Math.sin(a) * 1500, bx = Math.cos(a) * 4100, bz = Math.sin(a) * 4100;
  return { ax, az, bx, bz };
});

function segT(px, pz, s) {
  const vx = s.bx - s.ax, vz = s.bz - s.az;
  const t = clamp(((px - s.ax) * vx + (pz - s.az) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - (s.ax + vx * t), pz - (s.az + vz * t));
}
export function causewayDist(x, z) {
  let d = 1e9;
  for (const s of CAUSEWAYS) d = Math.min(d, segT(x, z, s));
  return d;
}

// --- Continents -------------------------------------------------------------------------------------
// > 0 land, < 0 sea. A ring of sea always surrounds the isle; land rises again a few km out.
export function continent(x, z, r) {
  let c = fbm(nC, x / 5200, z / 5200, 4) * 0.95 + 0.32 * nC2(x / 1500, z / 1500) + 0.16;
  c -= 1.1 * (1 - smoothstep(2600, 3900, r));
  for (const s of CAUSEWAYS) { const dx = x - s.bx, dz = z - s.bz; c += 0.7 * Math.exp(-(dx * dx + dz * dz) / (700 * 700)); }
  return c;
}

const terr = (t, steps) => { const s = t * steps, f = Math.floor(s); return (f + smoothstep(0.55, 1, s - f)) / steps; };

// Shape the blended biome height hb into the wilds: moods, rivers, coasts and seabed. Returns height.
export function wildShape(x, z, hb, r) {
  const c = continent(x, z, r);
  let h = hb;

  // Mesa country: everything steps into terraces.
  const mesa = smoothstep(0.28, 0.55, nS(x / 3100 + 7, z / 3100 - 2));
  if (mesa > 0) h = lerp(h, terr(Math.max(h, 0) / 90, 5) * 90 + 4, mesa);
  // Karst: tall rounded pillars poking out of the forest.
  const karst = smoothstep(0.38, 0.62, nT(x / 2900 + 3, z / 2900 + 8));
  if (karst > 0) { const p = Math.max(0, nP(x / 75, z / 75)); h += karst * 95 * p * p * p * p; }
  // Lake districts: many small basins that fill with water.
  const lakes = smoothstep(0.3, 0.58, nS(x / 2700 - 11, z / 2700 + 5));
  if (lakes > 0) { const l = smoothstep(0.28, 0.62, nK(x / 260, z / 260)); if (l > 0) h = lerp(h, Math.min(h, -4), lakes * l); }
  // Rivers wander through the lowlands.
  const wx = x + 320 * nM(x / 1100, z / 1100), wz = z + 320 * nM(x / 1100 + 5, z / 1100 - 5);
  const rv = Math.abs(nR(wx / 2600, wz / 2600));
  const ch = 1 - smoothstep(0.01, 0.042, rv);
  if (ch > 0) { const low = 1 - smoothstep(25, 75, h); h = lerp(h, Math.min(h, -3), ch * low); }

  // Coast and sea floor (with trenches for the submarine).
  const shore = smoothstep(-0.05, 0.09, c);
  if (shore < 1) {
    const deep = smoothstep(0, 0.45, -c);
    const trench = ridged(nK, x / 1700, z / 1700, 3);
    const sea = -5 - 42 * deep - 26 * deep * smoothstep(0.55, 0.92, trench) + 2.5 * nS(x / 90, z / 90) + 4 * nP(x / 300, z / 300);
    h = lerp(sea, Math.max(h, 0.6), shore);
  }
  return h;
}

// --- Names --------------------------------------------------------------------------------------------
const A = ['Wil', 'Ash', 'Bram', 'Cor', 'Del', 'Elm', 'Fen', 'Glen', 'Hal', 'Ivy', 'Jun', 'Kes', 'Lark', 'Mos', 'Nor', 'Oak', 'Pell', 'Quill', 'Ros', 'Sel', 'Thorn', 'Umber', 'Vale', 'Wren', 'Yar', 'Zeph', 'Brook', 'Cinder', 'Dawn', 'Ever', 'Fern', 'Gold', 'Hollow', 'Lumen', 'Mist', 'Sun', 'Tide', 'Still', 'Amber', 'Briar'];
const B = ['low', 'mere', 'wick', 'ford', 'wood', 'fall', 'reach', 'haven', 'stead', 'brook', 'moor', 'dale', 'crest', 'hollow', 'field', 'march', 'water', 'rest', 'glade', 'shire', 'combe', 'well', 'gate', 'light'];
const NOUN = { village: ['', '', '', ' Village', ' Hamlet', ' Commons'], waterfall: [' Falls', ' Cascade', ' Spray'], lab: [' Station', ' Lab', ' Institute', ' Works'], region: [' Reach', ' Wilds', ' Expanse', ' Country', ' Lands', ' March'] };
export function placeName(seed, kind = 'village') {
  const r = mulberry32(seed | 0);
  const pick = (a) => a[Math.floor(r() * a.length)];
  let n = pick(A) + pick(B);
  const nouns = NOUN[kind];
  if (nouns) n += pick(nouns);
  return n;
}

// Large named regions (for the "you are entering" banner).
export const REGION_CELL = 2400;
export function regionAt(x, z) {
  const ci = Math.floor(x / REGION_CELL), cj = Math.floor(z / REGION_CELL);
  return { id: ci + ':' + cj, name: placeName(hash2(ci, cj, 77) * 1e9, 'region') };
}

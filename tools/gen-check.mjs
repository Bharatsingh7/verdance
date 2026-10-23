// Chunk generation timings + vegetation counts on the isle and out in the wilds.
import { buildTerrain, buildVegetation, CHUNK, VEG_STRIDE } from '../src/world/chunkgen.js';
import { sitesNear, dominantBiome } from '../src/world/terrain.js';
const spots = [[0, 0], [-6, -3], [9, 3], [-8, 5], [1, 9], [-2, -11], [12, 8]];
// out in the wilds: a few sites of different kinds, and a deep ocean spot
const seen = new Set();
for (const s of sitesNear(0, 0, 14000)) { const k = s.kind + (s.type || ''); if (seen.has(k)) continue; seen.add(k); spots.push([Math.floor(s.x / CHUNK), Math.floor(s.z / CHUNK), k]); }
for (const [cx, cz, label] of spots) {
  let t = performance.now(); const r = buildTerrain(cx, cz, 64); const tt = performance.now() - t;
  t = performance.now(); const v = buildVegetation(cx, cz, 1); const tv = performance.now() - t;
  console.log(String(label || '').padEnd(16), cx, cz, 'b' + dominantBiome((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK), 'terrain', tt.toFixed(0) + 'ms', 'y', r.minY.toFixed(0), r.maxY.toFixed(0), 'veg', tv.toFixed(0) + 'ms', Object.entries(v).map(([k, a]) => k + ':' + a.length / VEG_STRIDE).join(' '));
}

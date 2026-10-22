import { buildTerrain, buildVegetation } from '../src/world/chunkgen.js';
for (const [cx, cz] of [[0, 0], [-6, -3], [9, 3], [-8, 5], [1, 9], [-2, -11], [12, 8]]) {
  let t = performance.now(); const r = buildTerrain(cx, cz, 64); const tt = performance.now() - t;
  t = performance.now(); const v = buildVegetation(cx, cz, 1); const tv = performance.now() - t;
  console.log(cx, cz, 'terrain', tt.toFixed(0) + 'ms', 'y', r.minY.toFixed(0), r.maxY.toFixed(0), 'veg', tv.toFixed(0) + 'ms', Object.entries(v).map(([k, a]) => k + ':' + a.length / 5).join(' '));
}

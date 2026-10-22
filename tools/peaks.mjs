import { heightAt, dominantBiome } from '../src/world/terrain.js';
const regions = [[-900, -1500], [200, -1500], [1000, -1450], [0, 1300], [1300, 800], [-1400, -400], [700, -800], [-600, 700]];
for (const [cx, cz] of regions) {
  let best = [-1e9];
  for (let z = cz - 250; z <= cz + 250; z += 10) for (let x = cx - 250; x <= cx + 250; x += 10) { const h = heightAt(x, z); if (h > best[0]) best = [h, x, z]; }
  console.log(cx, cz, '->', best.map(v => Math.round(v)).join(' '), 'biome', dominantBiome(best[1], best[2]));
}

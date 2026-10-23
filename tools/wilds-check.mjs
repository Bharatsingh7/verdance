// ASCII overview of the endless world + seam continuity + timing.
import { heightAt, dominantBiome, valleyAt, sitesNear, radial } from '../src/world/terrain.js';
const chars = 'MFRDCAWETSXB'; // meadow forest rain desert canyon mountain wetland ember taiga savanna redwood(X) blossom
const SPAN = +(process.argv[2] || 12000), STEP = SPAN / 60;
const t0 = performance.now();
const rows = [];
const sites = new Map();
for (let z = -SPAN; z <= SPAN; z += STEP * 2) {
  let row = '';
  for (let x = -SPAN; x <= SPAN; x += STEP) {
    const h = heightAt(x, z);
    row += h < 0 ? (h < -10 ? '~' : '.') : valleyAt(x, z) ? '*' : chars[dominantBiome(x, z)];
  }
  rows.push(row);
}
console.log(rows.join('\n'));
console.log('map ms', (performance.now() - t0).toFixed(0));
for (const s of sitesNear(0, 0, SPAN)) sites.set(s.kind + (s.type ? ':' + s.type : s.variant ? ':' + s.variant : s.style ? ':' + s.style : ''), (sites.get(s.kind + (s.type ? ':' + s.type : s.variant ? ':' + s.variant : s.style ? ':' + s.style : '')) || 0) + 1);
console.log('sites', Object.fromEntries([...sites].sort()));
// seam continuity along rays
let worst = 0, wx = 0, wz = 0;
for (let a = 0; a < Math.PI * 2; a += 0.05) for (let r = 1500; r < 6000; r += 2) {
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const d = Math.abs(heightAt(x, z) - heightAt(x + Math.cos(a) * 2, z + Math.sin(a) * 2));
  if (d > worst) { worst = d; wx = x; wz = z; }
}
console.log('worst step per 2 m along rays 1.5-6 km:', worst.toFixed(2), 'at', wx.toFixed(0), wz.toFixed(0), 'h', heightAt(wx, wz).toFixed(1));
for (const [x, z] of [[0, 0], [5000, 5000], [40000, -30000]]) {
  const t = performance.now(); let n = 0;
  for (let j = 0; j < 67; j++) for (let i = 0; i < 67; i++) { heightAt(x + i * 2, z + j * 2); n++; }
  console.log(`chunk 64-seg heights at ${x},${z}: ${(performance.now() - t).toFixed(1)} ms`);
}

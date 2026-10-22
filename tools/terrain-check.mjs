import { heightAt, dominantBiome, valleyAt, VALLEY_DATA } from '../src/world/terrain.js';
const t0 = performance.now(); let n = 0, mn = 1e9, mx = -1e9;
const chars = 'MFRDCAW'; // meadow forest rain desert canyon mountain(A) wetland
let rows = [];
for (let z = -2000; z <= 2000; z += 80) {
  let row = '';
  for (let x = -2000; x <= 2000; x += 40) {
    const h = heightAt(x, z); n++; mn = Math.min(mn, h); mx = Math.max(mx, h);
    row += h < 0 ? (h < -10 ? '~' : '.') : valleyAt(x, z) ? '*' : chars[dominantBiome(x, z)];
  }
  rows.push(row);
}
console.log(rows.join('\n'));
console.log('samples', n, 'ms', (performance.now() - t0).toFixed(0), 'min', mn.toFixed(1), 'max', mx.toFixed(1));
const t1 = performance.now(); for (let i = 0; i < 4225; i++) heightAt(i * 1.3 - 2000, 300); console.log('4225 samples ms', (performance.now() - t1).toFixed(1));
for (const v of VALLEY_DATA) console.log(v.id, 'floor', v.floor.toFixed(1), 'center h', heightAt(v.x, v.z).toFixed(1), 'wall h', heightAt(v.x + v.r * 1.2, v.z).toFixed(1), 'mouth', heightAt(v.bx, v.bz).toFixed(1));

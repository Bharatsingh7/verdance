// Headless rover physics checks: settle, drive, cliff (must not climb), drop (no penetration).
import { Vehicle } from '../src/vehicle/physics.js';
import { heightAt } from '../src/world/terrain.js';
import { SPAWN } from '../src/world/features.js';

const DT = 1 / 60;
const run = (v, secs, inp, log) => {
  let minClear = Infinity;
  for (let t = 0; t < secs; t += DT) {
    v.update(DT, { throttle: 0, steer: 0, boost: false, ...inp }, null);
    minClear = Math.min(minClear, v.pos.y - heightAt(v.pos.x, v.pos.z));
    if (log && Math.abs((t / log) % 1) < DT / log) console.log(`  t=${t.toFixed(1)} pos=(${v.pos.x.toFixed(1)}, ${v.pos.y.toFixed(2)}, ${v.pos.z.toFixed(1)}) clear=${(v.pos.y - heightAt(v.pos.x, v.pos.z)).toFixed(2)} speed=${v.speed.toFixed(1)} pitch=${v.pitch.toFixed(2)} roll=${v.roll.toFixed(2)} g=${v.grounded}`);
  }
  return minClear;
};

// 1. Settle at spawn.
let v = new Vehicle(SPAWN.x, SPAWN.z, SPAWN.heading);
console.log('settle');
run(v, 3, {}, 1);
const settled = v.pos.y - heightAt(v.pos.x, v.pos.z);
console.log('settled clearance', settled.toFixed(3), 'rest offsets', [...v.wheelOff].map((o) => o.toFixed(2)).join(' '));

// 2. Drive forward and turn.
console.log('drive');
const c = run(v, 8, { throttle: 1 }, 2);
console.log('top speed', v.speed.toFixed(1), 'min clearance', c.toFixed(2));
run(v, 4, { throttle: 1, steer: 1 }, 2);
console.log('heading after turn', v.heading.toFixed(2));

// 3. Cliff: find the steepest spot in the canyon/mountains and drive up it from below.
let best = null;
for (let x = -1800; x < 1800; x += 12) for (let z = -1800; z < 1800; z += 12) {
  const h = heightAt(x, z); if (h < 2) continue;
  const gx = (heightAt(x + 2, z) - heightAt(x - 2, z)) / 4, gz = (heightAt(x, z + 2) - heightAt(x, z - 2)) / 4;
  const s = Math.hypot(gx, gz);
  // want a sustained steep face: check 10 m uphill too
  const ux = gx / s, uz = gz / s;
  const rise = heightAt(x + ux * 10, z + uz * 10) - heightAt(x - ux * 10, z - uz * 10);
  if (s > 1.2 && rise > 18 && (!best || rise > best.rise)) best = { x, z, ux, uz, rise, s };
}
console.log('cliff', best && { x: best.x, z: best.z, rise: best.rise.toFixed(1), slope: (Math.atan(best.s) * 57.3).toFixed(0) + '°' });
if (best) {
  const sx = best.x - best.ux * 30, sz = best.z - best.uz * 30;
  v = new Vehicle(sx, sz, Math.atan2(best.ux, best.uz));
  run(v, 2, {});
  const y0 = v.pos.y;
  const cc = run(v, 10, { throttle: 1, boost: true }, 2);
  console.log(`cliff height gain ${(v.pos.y - y0).toFixed(2)} m (start ${y0.toFixed(1)}), min clearance ${cc.toFixed(2)} ->`, v.pos.y - y0 < 3 + best.rise * 0 ? 'OK' : 'CLIMBED');
}

// 4. Drop from 20 m.
v = new Vehicle(SPAWN.x + 40, SPAWN.z, 0.3);
v.pos.y += 20;
v.pitch = 0.4; v.roll = 0.3; v.syncQuat();
const dc = run(v, 5, {}, 1);
console.log('drop min clearance', dc.toFixed(2), dc > -0.3 ? 'OK' : 'PENETRATED');

// 5. Timing.
v = new Vehicle(SPAWN.x, SPAWN.z, SPAWN.heading);
const t0 = performance.now();
run(v, 10, { throttle: 1, steer: 0.3 });
console.log('ms per frame', ((performance.now() - t0) / 600).toFixed(3));

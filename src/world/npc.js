// People: procedural skinned humans (13-bone rig, rigid parts) animated by code (walk, hammer, sit,
// wave, talk), living small routines around their village. A handful of shared body variants keeps it light.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt } from './terrain.js';
import { mulberry32 } from '../core/rng.js';

// Bone layout: [parent, x, y, z] in bind pose (relative to parent).
const BONES = [
  [-1, 0, 0.98, 0], // 0 hips
  [0, 0, 0.12, 0], // 1 spine
  [1, 0, 0.25, 0], // 2 chest
  [2, 0, 0.22, 0], // 3 neck
  [3, 0, 0.08, 0], // 4 head
  [2, 0.2, 0.16, 0], // 5 upper arm L
  [5, 0, -0.29, 0], // 6 forearm L
  [2, -0.2, 0.16, 0], // 7 upper arm R
  [7, 0, -0.29, 0], // 8 forearm R
  [0, 0.1, -0.04, 0], // 9 thigh L
  [9, 0, -0.45, 0], // 10 shin L
  [0, -0.1, -0.04, 0], // 11 thigh R
  [11, 0, -0.45, 0], // 12 shin R
];
const SKIN = [0xf1c8a8, 0xd8a47e, 0xb07850, 0x8a5a3a, 0x6a4430, 0xe8b894];
const HAIR = [0x2a1e16, 0x4a3020, 0x8a6a3a, 0xc8a060, 0x9a3a22, 0xd8d0c8, 0x161210];
const SHIRT = [0x5a7a9a, 0xb8604a, 0x7a9a5a, 0xd8b060, 0x8a6aa8, 0xe8e0d0, 0x4a8a8a, 0xc87a8a];
const PANTS = [0x3a4a5a, 0x5a4a3a, 0x6a6a5a, 0x2e3440, 0x7a6a4a];
const COAT = 0xf2f4f6;

let bindPositions = null;
function bindWorld() {
  if (bindPositions) return bindPositions;
  bindPositions = [];
  for (const [p, x, y, z] of BONES) {
    const b = p < 0 ? [0, 0, 0] : bindPositions[p];
    bindPositions.push([b[0] + x, b[1] + y, b[2] + z]);
  }
  return bindPositions;
}

function part(geo, color, bone, x, y, z, rx = 0, sx = 1, sy = 1, sz = 1) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone());
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz)));
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; si[i * 4] = bone; sw[i * 4] = 1; }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

const cyl = (a, b, h, s = 7) => new THREE.CylinderGeometry(a, b, h, s, 1);
const sph = (r, w = 8, h = 6, t0 = 0, tl = Math.PI) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, t0, tl);

// A body variant: proportions + outfit baked into vertex colours.
const variants = new Map();
function bodyGeometry(v) {
  if (variants.has(v.key)) return variants.get(v.key);
  const B = bindWorld();
  const P = [];
  const sw = v.build; // 0 slim .. 1 broad
  const sh = 1 + sw * 0.18;
  P.push(part(cyl(0.15 * sh, 0.16, 0.22), v.pants, 0, 0, B[0][1] - 0.02, 0));
  P.push(part(cyl(0.17 * sh, 0.15, 0.27), v.shirt, 1, 0, B[1][1] + 0.1, 0));
  P.push(part(cyl(0.19 * sh, 0.17 * sh, 0.24), v.shirt, 2, 0, B[2][1] + 0.08, 0, 0, 1, 1, 0.78));
  P.push(part(cyl(0.05, 0.055, 0.1), v.skin, 3, 0, B[3][1] + 0.03, 0));
  P.push(part(sph(0.115), v.skin, 4, 0, B[4][1] + 0.1, 0.005, 0, 1, 1.08, 1));
  P.push(part(sph(0.03, 5, 4), v.skin, 4, 0, B[4][1] + 0.09, 0.115)); // nose
  if (v.hat) {
    P.push(part(cyl(0.2, 0.2, 0.02, 12), v.hat, 4, 0, B[4][1] + 0.19, 0));
    P.push(part(cyl(0.1, 0.12, 0.12, 10), v.hat, 4, 0, B[4][1] + 0.25, 0));
  } else {
    P.push(part(sph(0.125, 9, 6, 0, Math.PI * 0.55), v.hair, 4, 0, B[4][1] + 0.11, -0.01));
    if (v.long) P.push(part(cyl(0.11, 0.13, 0.26, 8), v.hair, 4, 0, B[4][1] - 0.02, -0.05, 0, 1, 1, 0.7));
  }
  for (const [ua, fa, side] of [[5, 6, 1], [7, 8, -1]]) {
    const x = B[ua][0] + side * 0.04 * sh;
    P.push(part(cyl(0.06, 0.05, 0.29), v.coat || v.shirt, ua, x, B[ua][1] - 0.14, 0));
    P.push(part(cyl(0.048, 0.04, 0.26), v.coat ? v.coat : v.sleeves ? v.shirt : v.skin, fa, x, B[fa][1] - 0.13, 0));
    P.push(part(sph(0.048, 6, 4), v.skin, fa, x, B[fa][1] - 0.29, 0.01));
  }
  for (const [th, sn] of [[9, 10], [11, 12]]) {
    const x = B[th][0];
    P.push(part(cyl(0.08, 0.065, 0.45), v.pants, th, x, B[th][1] - 0.22, 0));
    P.push(part(cyl(0.06, 0.05, 0.42), v.pants, sn, x, B[sn][1] - 0.22, 0));
    P.push(part(new THREE.BoxGeometry(0.1, 0.07, 0.24), v.shoes, sn, x, B[sn][1] - 0.46, 0.04));
  }
  if (v.coat) P.push(part(cyl(0.2 * sh, 0.24, 0.55, 9), v.coat, 1, 0, B[1][1] - 0.05, 0, 0, 1, 1, 0.82));
  const g = mergeGeometries(P, false);
  g.computeBoundingSphere();
  g.boundingSphere.radius = 1.2;
  variants.set(v.key, g);
  return g;
}

const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

function makeVariant(seed, scientist) {
  const r = mulberry32(seed);
  // a limited number of distinct variants (keyed) so geometry is shared
  const key = scientist ? 'sci' + Math.floor(r() * 4) : 'v' + Math.floor(r() * 14);
  const r2 = mulberry32(key.length * 9973 + key.charCodeAt(key.length - 1) * 131 + (scientist ? 7 : 0));
  const p2 = (a) => a[Math.floor(r2() * a.length)];
  return {
    key, build: r2(), skin: p2(SKIN), hair: p2(HAIR), shirt: scientist ? 0x8ab8d8 : p2(SHIRT), pants: scientist ? 0x3a4450 : p2(PANTS), shoes: 0x2a2420,
    hat: !scientist && r2() < 0.25 ? p2([0xc8a868, 0x6a4a30, 0x3a5a7a]) : 0, long: r2() < 0.45, sleeves: r2() < 0.5, coat: scientist ? COAT : 0,
    scale: 0.9 + r() * 0.16,
  };
}

function makeRig(geo) {
  const bones = BONES.map(([, x, y, z]) => { const b = new THREE.Bone(); b.position.set(x, y, z); return b; });
  BONES.forEach(([p], i) => { if (p >= 0) bones[p].add(bones[i]); });
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.frustumCulled = true;
  return { mesh, bones };
}

const FIRST = ['Ada', 'Bram', 'Cora', 'Dov', 'Esme', 'Finn', 'Gale', 'Hana', 'Ilo', 'Juno', 'Kai', 'Lio', 'Mara', 'Nico', 'Oona', 'Pip', 'Quin', 'Rhea', 'Sol', 'Tam', 'Uma', 'Vito', 'Wren', 'Yuki', 'Zara', 'Arlo', 'Bea', 'Cass', 'Odile', 'Teo', 'Noor', 'Ravi', 'Mei', 'Ines'];

// --- Dialogue ------------------------------------------------------------------------------------
const LINES = {
  village: [
    'We came back when the rivers ran clear again. Took a while to remember how to build.',
    'Mind the tomatoes. They are the only thing here that is in a hurry.',
    'My grandmother said the old cities were loud. I can\'t imagine it.',
    'Every season someone new walks in from the wilds. We always find them a plot.',
    'We trade seeds with the next village over. Follow the dirt path, you can\'t miss it.',
    'You drive that thing very gently. The deer have noticed.',
    'Sit by the fire tonight if you like. Somebody always brings a song.',
    'The roof took three of us and most of a summer. It\'s a good roof.',
  ],
  builder: [
    'One more beam and the walls go up. Want to hold the end? No? Fair.',
    'We use timber from the storm-fallen trees. The forest gives what it can spare.',
    'This one is for the family who arrived last spring. They brought goats.',
  ],
  scientist: [
    'Careful, the field rings are still tuning. We\'re teaching seeds to listen to the sun.',
    'Officially this lab does not exist. Unofficially, would you like some tea?',
    'The machines we build now are quiet. Quiet was the hardest part to engineer.',
    'We\'ve been mapping the root networks. The forests talk more than we ever did.',
    'The tech that broke the world can help heal it. We just had to slow down first.',
    'Those glowing markers under the sea? Ours. They guide the cleaning drones home.',
  ],
  hint: [
    'Have you seen the %K to the %D? %N, people call it. Worth the drive.',
    'Travellers talk about %N, off to the %D. Look for it when the light is low.',
    'If you go %D you might find %N. My cousin swears it\'s real.',
  ],
};
const KIND_WORD = { lab: 'strange lab', hollow: 'hollow mountain', valley: 'hidden valley', wonder: 'old wonder', wreck: 'shipwreck', sunken: 'drowned town', waterfall: 'falls' };

function dirWord(dx, dz) {
  const a = Math.atan2(dx, -dz); // 0 = north (-z)
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

// --- Agents ---------------------------------------------------------------------------------------
// One hidden person so the skinned shader is compiled with everything else at startup.
export function warmPerson() { const { mesh } = makeRig(bodyGeometry(makeVariant(1, false))); return mesh; }

export class People {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.agents = [];
    this.cap = 20;
    this.frame = 0;
  }

  // Spawn residents for a site: homes (doorsteps), work spots, an optional construction site.
  spawn(site, info, scientist = false) {
    const free = this.cap - this.agents.length;
    if (free <= 0) return;
    const rnd = mulberry32(site.seed + 99);
    const n = Math.min(free, scientist ? 3 : Math.min(6, info.homes.length + 2));
    const spots = [...info.homes, ...info.work];
    for (let i = 0; i < n; i++) {
      const v = makeVariant(site.seed + i * 31, scientist);
      const { mesh, bones } = makeRig(bodyGeometry(v));
      mesh.scale.setScalar(v.scale);
      const home = info.homes[i % Math.max(1, info.homes.length)] || info.plaza;
      const start = spots[Math.floor(rnd() * spots.length)] || { x: 0, z: 0 };
      const a = {
        site, mesh, bones, name: FIRST[Math.floor(rnd() * FIRST.length)], home, spots, info, scientist,
        role: !scientist && info.build && i < 2 ? 'builder' : scientist ? 'scientist' : 'villager',
        x: site.x + start.x + rnd() * 2, z: site.z + start.z + rnd() * 2, y: 0, yaw: rnd() * 6.28,
        state: 'idle', timer: rnd() * 4, target: null, phase: rnd() * 6, act: 'idle', waved: false, met: false, seed: site.seed + i,
      };
      this.group.add(mesh);
      this.agents.push(a);
    }
  }

  despawn(siteId) {
    this.agents = this.agents.filter((a) => {
      if (a.site.id !== siteId) return true;
      this.group.remove(a.mesh);
      a.mesh.skeleton.dispose();
      return false;
    });
  }

  // The nearest person within reach of the rover, if it's stopped.
  nearest(pos, maxD = 10) {
    let best = null, bd = maxD;
    for (const a of this.agents) {
      if (!a.mesh.visible) continue;
      const d = Math.hypot(a.x - pos.x, a.z - pos.z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  // A line of dialogue (and maybe a hint pointing at a hidden site).
  talk(a, pos, hintFor) {
    a.state = 'talk'; a.timer = 6; a.met = true;
    a.yaw = Math.atan2(pos.x - a.x, pos.z - a.z);
    const r = mulberry32(a.seed + Math.floor(performance.now() / 5000));
    const hint = hintFor ? hintFor(a.x, a.z) : null;
    if (hint && r() < 0.55) {
      const t = LINES.hint[Math.floor(r() * LINES.hint.length)];
      return { name: a.name, text: t.replace('%K', KIND_WORD[hint.kind] || 'place').replace('%D', dirWord(hint.x - a.x, hint.z - a.z)).replace('%N', hint.name), hint };
    }
    const pool = LINES[a.role === 'builder' ? 'builder' : a.role === 'scientist' ? 'scientist' : 'village'];
    return { name: a.name, text: pool[Math.floor(r() * pool.length)] };
  }

  update(dt, t, vehicle, env, camera) {
    this.frame++;
    const night = env.daylight < 0.18;
    const vx = vehicle.pos.x, vz = vehicle.pos.z, vs = Math.abs(vehicle.speed);
    const events = [];
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      const dCam = Math.hypot(a.x - camera.position.x, a.z - camera.position.z);
      // Far away: hide, and think only occasionally.
      a.mesh.visible = dCam < 260 && !(night && a.state === 'home');
      const far = dCam > 120;
      if (far && (this.frame + i) % 6) continue;
      const step = far ? dt * 6 : dt;

      const dRover = Math.hypot(a.x - vx, a.z - vz);
      // Behaviour.
      a.timer -= step;
      if (a.state === 'talk' || a.state === 'wave') { if (a.timer <= 0) { a.state = 'idle'; a.timer = 2; } }
      else if (dRover < 16 && !a.waved && vs < 12) { a.state = 'wave'; a.timer = 2.6; a.waved = true; a.yaw = Math.atan2(vx - a.x, vz - a.z); events.push({ type: 'wave', a }); }
      else if (a.state === 'walk') {
        const tx = a.site.x + a.target.x, tz = a.site.z + a.target.z;
        let dx = tx - a.x, dz = tz - a.z;
        const d = Math.hypot(dx, dz);
        // step aside for the rover
        if (dRover < 6 && vs > 1) { dx += (a.x - vx) * 3; dz += (a.z - vz) * 3; }
        if (d < 0.8) { a.state = a.target.act || 'idle'; a.timer = 6 + Math.random() * 10; if (a.target === a.home && night) a.state = 'home'; }
        else {
          const want = Math.atan2(dx, dz);
          let dy = want - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          a.yaw += dy * Math.min(1, step * 5);
          a.x += Math.sin(a.yaw) * 1.3 * step; a.z += Math.cos(a.yaw) * 1.3 * step;
          a.phase += step * 7.5;
        }
      } else if (a.timer <= 0) {
        // Choose what to do next.
        if (night) a.target = a.home;
        else if (a.role === 'builder' && a.info.build) { const s = a.info.build.spots[i % a.info.build.spots.length]; a.target = { x: s.x, z: s.z, act: 'hammer' }; }
        else a.target = a.spots[Math.floor(Math.random() * a.spots.length)] || a.home;
        a.state = 'walk';
        a.timer = 40;
      }
      if (dRover > 40) a.waved = false;

      if (!far || (this.frame + i) % 6 === 0) a.y = heightAt(a.x, a.z);
      a.mesh.position.set(a.x, a.y, a.z);
      a.mesh.rotation.y = a.yaw;
      if (a.mesh.visible) pose(a, t);
    }
    return events;
  }

  clear() { for (const a of [...this.agents]) this.despawn(a.site.id); }
}

// Procedural poses. Bones' rest rotation is zero; the character faces +z.
function pose(a, t) {
  const B = a.bones;
  for (const b of B) b.rotation.set(0, 0, 0);
  B[0].position.y = BONES[0][2];
  const s = a.state, ph = a.phase;
  const breathe = Math.sin(t * 1.6 + a.seed) * 0.02;
  B[2].rotation.x = breathe;
  if (s === 'walk') {
    const sw = Math.sin(ph);
    B[9].rotation.x = -sw * 0.55; B[11].rotation.x = sw * 0.55;
    B[10].rotation.x = Math.max(0, Math.sin(ph + 1.2)) * 0.9; B[12].rotation.x = Math.max(0, Math.sin(ph + 1.2 + Math.PI)) * 0.9;
    B[5].rotation.x = sw * 0.45; B[7].rotation.x = -sw * 0.45;
    B[6].rotation.x = -0.3; B[8].rotation.x = -0.3;
    B[0].position.y = BONES[0][2] + Math.abs(Math.cos(ph)) * 0.035;
    B[0].rotation.y = sw * 0.08;
  } else if (s === 'hammer') {
    const k = Math.max(0, Math.sin(t * 6 + a.seed));
    B[7].rotation.x = -1.3 - k * 0.9; B[8].rotation.x = -0.5 - k * 0.4;
    B[5].rotation.x = -0.6; B[6].rotation.x = -0.6;
    B[2].rotation.x = 0.18; B[4].rotation.x = 0.25;
  } else if (s === 'sit' || s === 'fish') {
    B[0].position.y = BONES[0][2] - 0.47;
    B[9].rotation.x = -1.5; B[11].rotation.x = -1.5; B[10].rotation.x = 1.5; B[12].rotation.x = 1.5;
    B[5].rotation.x = -0.5; B[7].rotation.x = -0.5; B[6].rotation.x = -0.7; B[8].rotation.x = -0.7;
  } else if (s === 'wave') {
    B[7].rotation.z = -2.5; B[8].rotation.z = -0.4 + Math.sin(t * 9) * 0.45;
    B[4].rotation.x = -0.1;
  } else if (s === 'talk') {
    B[5].rotation.x = -0.4 + Math.sin(t * 2.1) * 0.25; B[6].rotation.x = -0.8;
    B[7].rotation.x = -0.3 + Math.sin(t * 1.7 + 1) * 0.3; B[8].rotation.x = -0.9;
    B[4].rotation.y = Math.sin(t * 0.8) * 0.2; B[4].rotation.x = Math.sin(t * 3) * 0.05;
  } else {
    B[4].rotation.y = Math.sin(t * 0.3 + a.seed) * 0.5;
    B[5].rotation.z = 0.06; B[7].rotation.z = -0.06;
  }
}

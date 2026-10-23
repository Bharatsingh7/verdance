// Hidden labs where people from a gentler future build quiet machines: a hangar inside a mountain, a
// desert array of field rings and tesla coils, and a glass dome on the sea floor. Robots (CC0 model) help.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Kit } from './ruins.js';
import { MAT, shared, vegGeometry } from './models.js';
import { ruinMaterial } from './surfaces.js';
import { mulberry32 } from '../core/rng.js';

const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s, 1);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);

let MATS = null;
export const labMats = () => MATS ??= [ruinMaterial('panel', { moss: 0.05, grime: 0.15, scale: 0.25 }), MAT.glow(), MAT.leaf(), ruinMaterial('concrete', { moss: 0.6 }), ruinMaterial('rust')];
const glass = () => new THREE.MeshStandardMaterial({ color: 0xbfe6f0, transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
const PANEL = 0xe4e8ec, DARK = 0x3a4048, CYAN = 0x6ff5dc, AMBER = 0xffc878, VIOLET = 0xb09aff;

// Additive glowing ring that turns slowly on two axes.
function energyRing(x, y, z, r, color, out, animated, speed = 0.4) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.04, 6, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(x, y, z);
  out.push(m);
  const ph = Math.random() * 6;
  animated.push((dt) => { m.rotation.x += dt * speed; m.rotation.y += dt * speed * 0.6; m.material.opacity = 0.6 + 0.3 * Math.sin(shared.time.value * 2 + ph); });
  return m;
}

// Hologram: a slowly turning wireframe globe over a projector.
function hologram(x, y, z, r, out, animated) {
  const g = new THREE.Group();
  g.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(r, 1)), new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })));
  g.position.set(x, y, z);
  out.push(g);
  animated.push(() => { g.rotation.y = shared.time.value * 0.5; g.position.y = y + Math.sin(shared.time.value * 1.3) * 0.15; });
}

// Tesla arc: a jagged line between two points, re-rolled a dozen times a second.
function arc(a, b, out, animated) {
  const N = 12, pos = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xc8e8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
  line.frustumCulled = false;
  out.push(line);
  let t = 0;
  animated.push((dt) => {
    t -= dt; if (t > 0) return; t = 0.08;
    const on = Math.random() < 0.7;
    line.visible = on;
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1), j = i === 0 || i === N - 1 ? 0 : 0.9;
      pos[i * 3] = a.x + (b.x - a.x) * k + (Math.random() - 0.5) * j;
      pos[i * 3 + 1] = a.y + (b.y - a.y) * k + (Math.random() - 0.5) * j;
      pos[i * 3 + 2] = a.z + (b.z - a.z) * k + (Math.random() - 0.5) * j;
    }
    geo.attributes.position.needsUpdate = true;
  });
}

// --- Robots --------------------------------------------------------------------------------------
let robotLoading = null;
function loadRobot() {
  if (robotLoading) return robotLoading;
  robotLoading = new GLTFLoader().loadAsync('./models/RobotExpressive.glb').then((g) => {
    // clones share these with the original: never dispose them with a site
    g.scene.traverse((o) => { if (o.geometry) o.geometry.userData.shared = true; if (o.material) o.material.userData.shared = true; });
    return g;
  }).catch(() => null);
  return robotLoading;
}

// A robot walking a loop (or dancing / waving) around (cx, cz).
function robot(group, cx, cy, cz, radius, seed, animated, getY) {
  loadRobot().then((g) => {
    if (!g || !group.parent) return;
    const r = cloneSkinned(g.scene);
    r.scale.setScalar(0.55);
    r.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    group.add(r);
    const mixer = new THREE.AnimationMixer(r);
    const clip = (n) => g.animations.find((a) => a.name === n);
    const rnd = mulberry32(seed);
    const walk = mixer.clipAction(clip('Walking')), idle = mixer.clipAction(clip(rnd() < 0.5 ? 'Idle' : 'Dance')), wave = mixer.clipAction(clip('Wave'));
    walk.play();
    let ang = rnd() * 6.28, mode = 'walk', timer = 6 + rnd() * 8;
    animated.push((dt) => {
      timer -= dt;
      if (timer <= 0) {
        const next = mode === 'walk' ? (rnd() < 0.3 ? 'wave' : 'idle') : 'walk';
        const from = mode === 'walk' ? walk : mode === 'wave' ? wave : idle, to = next === 'walk' ? walk : next === 'wave' ? wave : idle;
        to.reset().play(); from.crossFadeTo(to, 0.4, false);
        mode = next; timer = next === 'walk' ? 8 + rnd() * 10 : 3 + rnd() * 4;
      }
      if (mode === 'walk') ang += dt * 0.9 / radius;
      const x = cx + Math.cos(ang) * radius, z = cz + Math.sin(ang) * radius;
      r.position.set(x, getY ? getY(x, z) : cy, z);
      r.rotation.y = -ang + (mode === 'walk' ? 0 : Math.PI / 2);
      mixer.update(dt);
    });
  });
}

// --- Builders ----------------------------------------------------------------------------------------
export function buildLab(world, site, scene) {
  const k = new Kit(world, site.x, site.z, site.seed, labMats());
  const out = [], animated = [];
  const group = new THREE.Group();
  out.push(group);
  const rnd = mulberry32(site.seed);
  const y = k.g(0, 0);
  const rot = site.angle;
  const c = Math.cos(rot), s = Math.sin(rot);
  const L = (lx, lz) => [lx * c + lz * s, -lx * s + lz * c]; // local frame turned by the site angle
  const work = [], homes = [];
  const W = (lx, ly, lz) => { const [x, z] = L(lx, lz); return new THREE.Vector3(site.x + x, y + ly, site.z + z); };

  if (site.variant === 'bunker') {
    // A rock mass with a hangar cut into it, the blast door half open.
    for (let i = 0; i < 14; i++) {
      const [x, z] = L((rnd() - 0.5) * 60, -18 - rnd() * 26);
      k.add(ico(9 + rnd() * 7, 1), 0x8c8d8a, x, y + 4 + rnd() * 8, z, rnd(), rnd() * 3, rnd(), 1.3, 0.9 + rnd() * 0.5, 1.2, { mat: 3, jitter: 3, seed: i, smooth: true });
      k.collideCircle(x, z, 10, y, y + 20);
    }
    let [x, z] = L(0, -9);
    k.add(box(30, 15, 3), PANEL, x, y + 7.5, z, 0, rot, 0, 1, 1, 1, { shade: 0.04 });
    // hangar: floor, walls, ceiling, light strips
    [x, z] = L(0, -21); k.add(box(16, 0.3, 22), 0x50565e, x, y + 0.1, z, 0, rot, 0);
    for (const sx of [-8.2, 8.2]) { [x, z] = L(sx, -21); k.add(box(0.5, 10, 22), DARK, x, y + 5, z, 0, rot, 0); k.collideBox(x, z, 0.4, 11, -rot, y, y + 10); }
    [x, z] = L(0, -21); k.add(box(17, 0.5, 22), DARK, x, y + 10, z, 0, rot, 0);
    [x, z] = L(0, -31.8); k.add(box(16, 10, 0.5), DARK, x, y + 5, z, 0, rot, 0); k.collideBox(x, z, 8, 0.4, -rot, y, y + 10);
    for (let i = 0; i < 4; i++) { [x, z] = L(0, -13 - i * 5); k.add(box(12, 0.12, 0.4), 0xe8f8ff, x, y + 9.7, z, 0, rot, 0, 1, 1, 1, { glow: 1 }); }
    // door halves slid aside, with glowing seams
    for (const sx of [-1, 1]) {
      [x, z] = L(sx * 11.5, -7.2); k.add(box(7, 9.5, 1), 0xa8b0b8, x, y + 4.75, z, 0, rot, 0);
      [x, z] = L(sx * 8.1, -6.6); k.add(box(0.15, 9.5, 0.2), AMBER, x, y + 4.75, z, 0, rot, 0, 1, 1, 1, { glow: 1 });
    }
    for (const sx of [-1, 1]) { [x, z] = L(sx * 12, -9); k.collideBox(x, z, 4, 1.6, -rot, y, y + 15); }
    [x, z] = L(0, -7); k.add(box(16, 0.4, 0.4), CYAN, x, y + 10.2, z, 0, rot, 0, 1, 1, 1, { glow: 1 });
    // inside: holo table, prototype hover sled, work benches
    [x, z] = L(-4, -22); k.add(cyl(1.3, 1.5, 1.0, 16), DARK, x, y + 0.6, z); hologram(site.x + x, y + 2.6, site.z + z, 1.0, out, animated);
    work.push({ x, z: z, act: 'talk' });
    [x, z] = L(4, -24); k.add(cyl(2.2, 2.6, 0.5, 20), 0xdfe4ea, x, y + 1.4, z).add(new THREE.TorusGeometry(2.4, 0.08, 6, 32), CYAN, x, y + 1.15, z, Math.PI / 2, 0, 0, 1, 1, 1, { glow: 1 });
    for (let i = 0; i < 3; i++) { const [bx, bz] = L(-7, -14 - i * 5); k.add(box(1.4, 1, 3), 0x8a9098, bx, y + 0.5, bz, 0, rot, 0); work.push({ x: L(-5.6, -14 - i * 5)[0], z: L(-5.6, -14 - i * 5)[1], act: 'hammer' }); }
    // outside: landing pad, antenna mast, solar panels
    [x, z] = L(0, 12); k.add(cyl(7, 7, 0.2, 32), 0x50565e, x, y + 0.1, z).add(new THREE.TorusGeometry(6.6, 0.12, 6, 48), CYAN, x, y + 0.25, z, Math.PI / 2, 0, 0, 1, 1, 1, { glow: 1 });
    [x, z] = L(13, -6); k.add(cyl(0.3, 0.5, 22, 8), 0xc8ccd0, x, y + 11, z).add(ico(0.6), 0xff5040, x, y + 22.5, z, 0, 0, 0, 1, 1, 1, { glow: 1 });
    k.collideCircle(x, z, 0.8, y, y + 22);
    for (let i = 0; i < 4; i++) { const [px, pz] = L(-16 + i * 4.5, 6); k.add(box(4, 0.12, 2.6), 0x2a3a5a, px, y + 1.6, pz, -0.5, rot, 0).add(box(0.15, 1.6, 0.15), 0x8a9098, px, y + 0.8, pz); }
    homes.push({ x: L(0, -14)[0], z: L(0, -14)[1] }, { x: L(-3, 8)[0], z: L(-3, 8)[1] });
    robot(group, site.x + L(2, -18)[0], y + 0.25, site.z + L(2, -18)[1], 3.5, site.seed, animated);
  } else if (site.variant === 'array') {
    // Glass dome over a garden, field-ring experiment, tesla coils, modules.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass());
    dome.position.set(site.x, y, site.z); dome.renderOrder = 2; out.push(dome);
    const ribs = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(11.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 1), new THREE.LineBasicMaterial({ color: 0xd8e0e8 }));
    ribs.position.copy(dome.position); out.push(ribs);
    k.collideCircle(0, 0, 11, y, y + 11);
    k.add(cyl(11, 11.3, 0.6, 32), PANEL, 0, y + 0.3, 0);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05, r = 3 + (i % 3) * 2.2;
      const g = vegGeometry(['blossom', 'palm', 'oak', 'birch', 'acacia', 'blossom'][i], 0);
      k.b.addBuilt(g, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, y + 0.5, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(0.55, 0.55, 0.55)));
    }
    // modules around
    for (let i = 0; i < 3; i++) {
      const a = rot + i * 2.1 + 0.5, mx = Math.cos(a) * 22, mz = Math.sin(a) * 22, my = k.g(mx, mz);
      k.add(box(9, 4, 6), PANEL, mx, my + 2, mz, 0, -a, 0, 1, 1, 1, { shade: 0.03 });
      k.add(box(9.2, 0.6, 6.2), DARK, mx, my + 4.2, mz, 0, -a, 0);
      k.add(box(6, 1.1, 0.1), AMBER, mx + Math.cos(a) * 3.05, my + 2.4, mz + Math.sin(a) * 3.05, 0, -a + Math.PI / 2, 0, 1, 1, 1, { glow: 1 });
      k.collideBox(mx, mz, 4.6, 3.1, a, my, my + 4.5);
      homes.push({ x: mx - Math.cos(a) * 5, z: mz - Math.sin(a) * 5 });
    }
    // field-ring experiment on three pylons
    const [ex, ez] = L(0, 30);
    const ey = k.g(ex, ez);
    for (let i = 0; i < 3; i++) { const a = i * 2.09; k.add(cyl(0.35, 0.6, 9, 8), 0xc8ccd0, ex + Math.cos(a) * 8, ey + 4.5, ez + Math.sin(a) * 8).add(ico(0.5), CYAN, ex + Math.cos(a) * 8, ey + 9.2, ez + Math.sin(a) * 8, 0, 0, 0, 1, 1, 1, { glow: 1 }); k.collideCircle(ex + Math.cos(a) * 8, ez + Math.sin(a) * 8, 0.8, ey, ey + 9); }
    energyRing(site.x + ex, ey + 7, site.z + ez, 6, CYAN, out, animated, 0.5);
    energyRing(site.x + ex, ey + 7, site.z + ez, 4.2, VIOLET, out, animated, -0.7);
    k.add(ico(1.1, 2), 0xdffcff, ex, ey + 7, ez, 0, 0, 0, 1, 1, 1, { glow: 1 });
    work.push({ x: ex + 10, z: ez, act: 'talk' }, { x: ex - 9, z: ez + 3, act: 'idle' });
    // tesla coils with arcs between them
    const [t1x, t1z] = L(-26, 6), [t2x, t2z] = L(-26, 18);
    for (const [tx, tz] of [[t1x, t1z], [t2x, t2z]]) { const ty = k.g(tx, tz); k.add(cyl(0.5, 0.9, 6, 10), 0x9a7a50, tx, ty + 3, tz, 0, 0, 0, 1, 1, 1, { mat: 4 }).add(new THREE.TorusGeometry(1.2, 0.45, 8, 20), 0xd8dce0, tx, ty + 6.3, tz, Math.PI / 2, 0, 0); k.collideCircle(tx, tz, 1.2, ty, ty + 7); }
    arc(new THREE.Vector3(site.x + t1x, k.g(t1x, t1z) + 6.5, site.z + t1z), new THREE.Vector3(site.x + t2x, k.g(t2x, t2z) + 6.5, site.z + t2z), out, animated);
    // solar field
    for (let i = 0; i < 8; i++) { const [px, pz] = L(18 + (i % 4) * 5, -12 - Math.floor(i / 4) * 5); const py = k.g(px, pz); k.add(box(4, 0.12, 2.8), 0x2a3a5a, px, py + 1.5, pz, -0.6, rot, 0).add(box(0.15, 1.5, 0.15), 0x8a9098, px, py + 0.75, pz); }
    // a prototype hovering over a pad
    const proto = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 0.6, 24), new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 0.6, roughness: 0.25 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.08, 6, 32), new THREE.MeshBasicMaterial({ color: CYAN }));
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.3; proto.add(ring);
    const [hx, hz] = L(-12, -20);
    const hy = k.g(hx, hz);
    proto.position.set(site.x + hx, hy + 2, site.z + hz); out.push(proto);
    k.add(cyl(3, 3, 0.15, 24), 0x50565e, hx, hy + 0.08, hz);
    animated.push(() => { proto.position.y = hy + 2 + Math.sin(shared.time.value * 1.4) * 0.4; proto.rotation.y = shared.time.value * 0.3; });
    robot(group, site.x + L(6, 10)[0], 0, site.z + L(6, 10)[1], 6, site.seed, animated, (x, z) => k.g(x - site.x, z - site.z));
    robot(group, site.x + ex, 0, site.z + ez, 11, site.seed + 1, animated, (x, z) => k.g(x - site.x, z - site.z));
  } else {
    // Seabed dome: lit glass bubble, modules, docking ring, guide lights.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass());
    dome.position.set(site.x, y, site.z); dome.renderOrder = 2; out.push(dome);
    k.add(cyl(15, 15.5, 1, 32), PANEL, 0, y + 0.5, 0);
    k.add(new THREE.TorusGeometry(15.2, 0.25, 6, 64), CYAN, 0, y + 1, 0, Math.PI / 2, 0, 0, 1, 1, 1, { glow: 1 });
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; k.add(box(4, 3, 4), PANEL, Math.cos(a) * 7, y + 2.5, Math.sin(a) * 7, 0, -a, 0).add(box(3, 0.5, 0.1), AMBER, Math.cos(a) * 4.95, y + 3, Math.sin(a) * 4.95, 0, -a + Math.PI / 2, 0, 1, 1, 1, { glow: 1 }); }
    hologram(site.x, y + 5, site.z, 1.6, out, animated);
    k.add(cyl(1.4, 1.6, 1.4, 16), DARK, 0, y + 1.7, 0);
    k.collideCircle(0, 0, 15, y, y + 15);
    // docking tube + ring
    const [dx, dz] = L(0, 24);
    k.add(cyl(2.2, 2.2, 10, 14), PANEL, dx * 0.62, y + 3, dz * 0.62, Math.PI / 2, rot, 0);
    k.add(new THREE.TorusGeometry(3.4, 0.3, 8, 32), CYAN, dx, y + 4, dz, 0, rot, 0, 1, 1, 1, { glow: 1 });
    // kelp garden and guide lights
    for (let i = 0; i < 10; i++) { const a = i * 0.63, r = 20 + (i % 3) * 3; k.b.addBuilt(vegGeometry('kelp', 0), new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, k.g(Math.cos(a) * r, Math.sin(a) * r), Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1))); }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.28, r = 26; k.add(ico(0.45), i % 2 ? CYAN : VIOLET, Math.cos(a) * r, k.g(Math.cos(a) * r, Math.sin(a) * r) + 0.6, Math.sin(a) * r, 0, 0, 0, 1, 1, 1, { glow: 1 }); }
    homes.push({ x: 4, z: 4 }, { x: -5, z: 2 });
    work.push({ x: 0, z: -3, act: 'talk' }, { x: 3, z: -6, act: 'idle' });
  }
  const mesh = k.build(scene, site.id);
  if (mesh) { scene.remove(mesh); out.push(mesh); }
  return { meshes: out, animated, homes, work, plaza: { x: 0, z: 0 }, build: null, kit: k, group };
}

// Streams procedural sites of the wilds in and out around the player: villages (which grow over time),
// waterfall hamlets, future labs, ruins, hidden valleys and hollows, wrecks, drowned towns and wonders.
// Each site registers its colliders, echoes and discovery area, and its people.
import * as THREE from 'three';
import { sitesNear, heightAt, siteCell, SITE_CELL, WATER_LEVEL } from './terrain.js';
import { Kit, BUILDERS, valleyPieces, CONCRETE, MOSS, RUST, DARKWIN } from './ruins.js';
import { buildVillage, buildConstruction, villagePlots, updateWindows, mats as villageMats, fallMat } from './settlements.js';
import { buildLab, labMats } from './labs.js';
import { warmPerson } from './npc.js';
import { MAT, vegGeometry, shared } from './models.js';
import { ruinMaterial } from './surfaces.js';
import { mulberry32, hash2 } from '../core/rng.js';

const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (a, b, h, s = 10) => new THREE.CylinderGeometry(a, b, h, s, 1);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const GROW_SECONDS = 480; // a new house every 8 minutes of play (while you are anywhere)

const PLACE_KIND = { village: 'village', waterfall: 'village', lab: 'lab', ruin: 'landmark', valley: 'valley', hollow: 'valley', wreck: 'wreck', sunken: 'wreck', wonder: 'wonder' };
const PLACE_TEXT = {
  village: ['Smoke from the chimneys, washing on the lines. People live here now.', 'A village of returners, built from what the forest could spare.', 'Gardens first, houses second. You can tell what they value.'],
  waterfall: ['A hamlet built around falling water. The wheel never stops turning.', 'They chose the loudest, happiest spot in the valley to live.'],
  lab: ['Quiet machines and kind people. They are building a gentler future here.', 'A lab hidden from the old maps. The tech hums like bees.'],
  ruin: ['Ruins of the old world, slowly turning back into hill and forest.', 'The old world built big. The new one is in no hurry to replace it.'],
  hollow: ['A hollow inside the mountain. Light falls through one round window in the rock.'],
  wreck: ['A ship that sailed its last on the old seas. Fish keep the cabins now.', 'Rusted plates and coral gardens. The sea is a patient decorator.'],
  sunken: ['A town the sea took gently. Streetlights glow with drowned moss.'],
  wonder: {
    colossus: 'The oldest living thing for a hundred kilometres. Its roots hold up the hill.',
    starship: 'It fell long ago, from somewhere far. Moss has made it feel at home.',
    floatrocks: 'Stones that forgot how to fall. Nobody knows why; nobody minds.',
    sunkencity: 'Whole towers asleep under the waves, lit by things that glow.',
    mushroom: 'A forest of mushrooms taller than houses, glowing softly at dusk.',
    petrified: 'Trees turned to stone, still standing, still patient.',
    saltflat: 'A white mirror of salt. At noon you can\'t tell earth from sky.',
  },
};
const ECHO_TEXT = {
  village: [['Recipe Card', 'Bread, honey and "whatever the neighbours brought". The best kind of recipe.'], ['Seed Packet', 'Hand-labelled: "Sunflowers. For no reason at all."'], ['Child\'s Kite', 'Tangled in a fence. Someone will come back for it, laughing.']],
  waterfall: [['Mill Ledger', 'Flour ground: plenty. Arguments settled by the water wheel: several.']],
  lab: [['Future Log', '"Day 412: the seeds respond to light patterns. Day 413: they seem to enjoy music."'], ['Prototype Note', '"Engine runs on sunlight and patience. Mostly patience."'], ['Lab Memo', '"Reminder: the robots are not allowed to adopt more birds."']],
  ruin: [['Faded Ticket', 'Admit one. The show is long over; the view is still running.'], ['Office Mug', '"World\'s Okayest Boss." Ferns grow in it now. Promotion.'], ['Old Map', 'The roads are wrong now. The rivers are right. The rivers were always right.']],
  valley: [['Pressed Flower', 'Kept between two pages: "Found it. Told no one."'], ['Carved Stone', 'An arrow, a heart, and the word HERE.']],
  hollow: [['Cave Painting', 'New, not old. Someone painted the rover. Or something very like it.'], ['Lantern', 'Still lit. Who keeps it lit?']],
  wreck: [['Captain\'s Log', '"Calm seas. Calmer crew. I think we will stay a while."'], ['Message in a Bottle', '"To whoever finds this: the sea is kinder than it looks."']],
  sunken: [['Street Sign', 'MAIN ST, ten metres down. Still technically correct.']],
  wonder: [['Field Sketch', 'A drawing of this very place, signed with a smiley face.'], ['Wish Ribbon', 'Tied on long ago. The wish, it says, came true.']],
};

const OCEAN = { wreck: 1, sunken: 1, sunkencity: 1 };

// The discoverable place for a site (journal text, discovery radius).
export function placeFor(site) {
  const r = mulberry32(site.seed + 5);
  const list = site.kind === 'wonder' ? null : PLACE_TEXT[site.kind];
  return {
    id: site.id, name: site.name, kind: PLACE_KIND[site.kind], x: site.x, z: site.z, wild: true, site: site.id,
    r: site.kind === 'valley' || site.kind === 'hollow' ? site.r * 0.7 : Math.max(45, site.r * 0.8),
    text: site.text || (list ? list[Math.floor(r() * list.length)] : PLACE_TEXT.wonder[site.type]),
  };
}

// The nearest hidden place (lab, hollow, valley, wonder, wreck) a villager might tell you about.
const HIDDEN = { lab: 1, hollow: 1, valley: 1, wonder: 1, wreck: 1, sunken: 1, waterfall: 1 };
export function hiddenNear(x, z, discovered, R = 2600) {
  let best = null, bd = Infinity;
  for (const s of sitesNear(x, z, R)) {
    if (!HIDDEN[s.kind] || discovered.has(s.id)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d > 120 && d < bd) { bd = d; best = s; }
  }
  return best;
}

export class SiteManager {
  constructor(scene, world, people, secrets, save) {
    this.scene = scene; this.world = world; this.people = people; this.secrets = secrets;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.built = new Map();
    this.radius = 800;
    this.villages = save?.villages || {};
    this.timer = 0;
    this.queue = [];
    this.near = [];
  }

  update(dt, focus, env, playTime) {
    this.playTime = playTime;
    updateWindows(env.daylight);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.6;
      const list = sitesNear(focus.x, focus.z, this.radius, this.near);
      this.queue = list.filter((s) => !this.built.has(s.id)).sort((a, b) => Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z));
      for (const [id, b] of this.built) if (Math.hypot(b.site.x - focus.x, b.site.z - focus.z) > this.radius + 300) this.drop(id);
      for (const b of this.built.values()) if (b.village) this.grow(b);
    }
    // Build at most one site per frame.
    const s = this.queue.shift();
    if (s && !this.built.has(s.id)) this.build(s);
    for (const b of this.built.values()) for (const f of b.animated) f(dt, env);
  }

  build(site) {
    const out = { site, group: new THREE.Group(), animated: [], echoes: [] };
    let info = null;
    try {
      if (site.kind === 'village' || site.kind === 'waterfall') info = this.buildVillage(site, out);
      else if (site.kind === 'lab') { info = buildLab(this.world, site, this.scene); this.people.spawn(site, info, true); }
      else if (site.kind === 'ruin') info = this.buildRuin(site);
      else if (site.kind === 'valley' || site.kind === 'hollow') info = this.buildValley(site);
      else if (site.kind === 'wreck') info = this.buildWreck(site);
      else if (site.kind === 'sunken') info = this.buildSunken(site, 1);
      else if (site.kind === 'wonder') info = this.buildWonder(site);
    } catch (e) { console.warn('site build failed', site.id, e); info = null; }
    if (info) {
      for (const m of info.meshes) out.group.add(m);
      out.animated.push(...info.animated);
    }
    this.root.add(out.group);
    this.built.set(site.id, out);
    // Discovery area + echoes.
    this.secrets.addPlace(placeFor(site));
    const r = mulberry32(site.seed + 6);
    const et = ECHO_TEXT[site.kind] || ECHO_TEXT.wonder;
    const n = site.kind === 'village' ? 1 : site.kind === 'lab' ? 3 : 2;
    const under = OCEAN[site.kind] || OCEAN[site.type] || (site.kind === 'lab' && site.variant === 'dome');
    for (let i = 0; i < n; i++) {
      const [title, text] = et[(Math.floor(r() * et.length) + i) % et.length];
      const a = r() * Math.PI * 2, d = (site.kind === 'valley' || site.kind === 'hollow' ? 0.4 : 0.35) * site.r * (0.4 + r() * 0.6);
      const ex = site.x + Math.cos(a) * d, ez = site.z + Math.sin(a) * d;
      this.secrets.addEcho({ id: site.id + ':e' + i, site: site.id, x: ex, z: ez, title, text, under, lift: under ? 1.4 : 1.8 });
    }
  }

  drop(id) {
    const b = this.built.get(id);
    if (!b) return;
    this.root.remove(b.group);
    b.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && !Array.isArray(o.material) && !o.material.userData.shared) o.material.dispose();
    });
    if (b.buildMesh) { this.scene.remove(b.buildMesh); b.buildMesh.geometry.dispose(); }
    this.world.removeStatics(id);
    this.world.removeStatics(id + ':build');
    this.people.despawn(id);
    this.secrets.removeSite(id);
    this.built.delete(id);
  }

  // --- Villages and their growth ---------------------------------------------------------
  villageState(site) {
    let v = this.villages[site.id];
    if (!v) v = this.villages[site.id] = { first: (this.playTime || 0) - hash2(site.seed, 1, 2) * GROW_SECONDS * 6 };
    const plots = villagePlots(site).length;
    const base = Math.min(plots - 1, 3 + Math.floor(hash2(site.seed, 3, 4) * 4));
    const age = Math.max(0, (this.playTime || 0) - v.first) / GROW_SECONDS;
    const built = Math.min(plots, base + Math.floor(age));
    return { built, plots, stage: built < plots ? age % 1 : 1 };
  }

  buildVillage(site, out) {
    const st = this.villageState(site);
    const info = buildVillage(this.world, site, st.built, st.built < st.plots, this.scene);
    out.village = { built: st.built, info };
    if (info.build) this.placeConstruction(out, site, info.build, st.stage);
    this.people.spawn(site, info);
    return info;
  }

  placeConstruction(out, site, b, stage) {
    const bucket = Math.min(4, Math.floor(stage * 5));
    if (out.buildBucket === bucket && out.buildMesh) return;
    if (out.buildMesh) { this.scene.remove(out.buildMesh); out.buildMesh.geometry.dispose(); this.world.removeStatics(site.id + ':build'); }
    out.buildBucket = bucket;
    out.buildMesh = buildConstruction(this.world, site, b, (bucket + 0.5) / 5, this.scene);
  }

  grow(b) {
    const st = this.villageState(b.site);
    if (st.built !== b.village.built) { // a house was finished: rebuild the village
      const id = b.site.id;
      this.drop(id);
      this.build(b.site);
      return;
    }
    if (b.village.info.build) this.placeConstruction(b, b.site, b.village.info.build, st.stage);
  }

  // --- Ruins, valleys, the sea ------------------------------------------------------------------
  buildRuin(site) {
    const k = new Kit(this.world, site.x, site.z, site.seed);
    const extra = (BUILDERS[site.builder] || BUILDERS.fuel)(k) || [];
    const mesh = k.build(this.scene, site.id);
    const meshes = [...extra];
    if (mesh) { this.scene.remove(mesh); meshes.push(mesh); }
    return { meshes, animated: k.animated };
  }

  buildValley(site) {
    const k = new Kit(this.world, site.x, site.z, site.seed);
    const out = [];
    valleyPieces(k, site, this.scene, out);
    if (site.dome) out.push(...hollowDome(site, k.animated));
    const mesh = k.build(this.scene, site.id);
    if (mesh) { this.scene.remove(mesh); out.push(mesh); }
    return { meshes: out, animated: k.animated };
  }

  buildWreck(site) {
    const k = new Kit(this.world, site.x, site.z, site.seed);
    const rnd = mulberry32(site.seed);
    const y = k.g(0, 0), rot = site.angle, list = 0x6a5a4a;
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (lx, ly, lz) => [lx * c + lz * s, y + ly, -lx * s + lz * c];
    const add = (g, col, lx, ly, lz, rx = 0, rz = 0, o = { mat: 4 }) => { const p = P(lx, ly, lz); k.add(g, col, p[0], p[1], p[2], rx, rot, rz, 1, 1, 1, o); };
    const tilt = 0.25 + rnd() * 0.2;
    add(box(8, 6, 36), RUST[0], 0, 2, 0, 0, tilt);
    add(new THREE.ConeGeometry(4.6, 8, 4), RUST[1], 0, 2, 21, Math.PI / 2, tilt + Math.PI / 4);
    add(box(6, 5, 9), 0xd8d0c0, 0, 6.5, -9, 0, tilt, { mat: 0 });
    add(box(6.2, 1.2, 9.2), DARKWIN, 0, 7.5, -9, 0, tilt, {});
    add(cyl(0.3, 0.4, 16, 6), list, 3, 4, 4, 1.2, tilt);
    add(cyl(1.4, 1.6, 4, 10), RUST[4], 0, 10, -13, 0, tilt);
    for (let i = 0; i < 8; i++) add(ico(1 + rnd()), MOSS[i % 3], (rnd() - 0.5) * 7, 5 + rnd(), (rnd() - 0.5) * 30, 0, 0, { jitter: 0.4 });
    k.collideBox(0, 0, 4, 18, -rot, y - 2, y + 8);
    const mesh = k.build(this.scene, site.id);
    const meshes = [];
    if (mesh) { this.scene.remove(mesh); meshes.push(mesh); }
    meshes.push(guideLights(site));
    return { meshes, animated: [] };
  }

  buildSunken(site, scale) {
    const k = new Kit(this.world, site.x, site.z, site.seed);
    const rnd = mulberry32(site.seed);
    const n = Math.round(5 * scale);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, r = 8 + rnd() * site.r * 0.55;
      k.tower(Math.cos(a) * r, Math.sin(a) * r, 10 + rnd() * 8, 10 + rnd() * 8, 2 + Math.floor(rnd() * 5 * scale), rnd() * 3, { lean: (rnd() - 0.5) * 0.3 });
    }
    for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, r = rnd() * site.r * 0.5; k.car(Math.cos(a) * r, Math.sin(a) * r, rnd() * 6, 0.4); }
    // streetlights overgrown with glowing moss
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 6.28, r = site.r * 0.3, x = Math.cos(a) * r, z = Math.sin(a) * r, gy = k.g(x, z);
      k.add(cyl(0.12, 0.15, 6, 6), 0x4a4a4a, x, gy + 3, z, 0.1 * Math.sin(i), 0, 0, 1, 1, 1, { mat: 4 }).add(ico(0.5), 0x7affe0, x, gy + 6.2, z, 0, 0, 0, 1, 1, 1, { glow: 1 });
    }
    const mesh = k.build(this.scene, site.id);
    const meshes = [];
    if (mesh) { this.scene.remove(mesh); meshes.push(mesh); }
    meshes.push(guideLights(site));
    return { meshes, animated: [] };
  }

  buildWonder(site) {
    const t = site.type;
    if (t === 'sunkencity') return this.buildSunken(site, 2.2);
    const k = new Kit(this.world, site.x, site.z, site.seed);
    const out = [], animated = [];
    const rnd = mulberry32(site.seed);
    const y = k.g(0, 0);
    if (t === 'colossus') {
      // An enormous broadleaf with roots like walls.
      k.b.addBuilt(vegGeometry('oak', 0), new THREE.Matrix4().compose(new THREE.Vector3(0, y - 1.5, 0), new THREE.Quaternion(), new THREE.Vector3(7, 7, 7)));
      for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28; k.add(cyl(0.9, 2.6, 18, 7), 0x7a6a58, Math.cos(a) * 6, y + 1, Math.sin(a) * 6, Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2, 1, 1, 1, { mat: 3, uvScale: [6, 8] }); }
      k.collideCircle(0, 0, 5, y, y + 40);
      for (let i = 0; i < 24; i++) { const a = rnd() * 6.28, r = 10 + rnd() * 20; k.add(ico(0.12), 0xd8ff7a, Math.cos(a) * r, y + 4 + rnd() * 20, Math.sin(a) * r, 0, 0, 0, 1, 1, 1, { glow: 1 }); }
    } else if (t === 'starship') {
      // A long crashed hull ploughed into the ground, engines still faintly lit.
      const rot = site.angle, c = Math.cos(rot), s = Math.sin(rot);
      const P = (lz, ly, lx = 0) => [lx * c + lz * s, y + ly, -lx * s + lz * c];
      let p;
      for (let i = 0; i < 6; i++) { p = P(-30 + i * 11, 4 + i * 0.6); k.add(cyl(6 - i * 0.4, 6.4 - i * 0.4, 11.5, 14), 0xc8ccd0, p[0], p[1], p[2], Math.PI / 2 - 0.08, rot, 0, 1, 1, 1, { mat: 4, jitter: 0.3, seed: i }); }
      p = P(36, 6.5); k.add(new THREE.ConeGeometry(4, 12, 14), 0xc8ccd0, p[0], p[1], p[2], Math.PI / 2 - 0.08, rot, 0, 1, 1, 1, { mat: 4 });
      for (const lx of [-9, 9]) { p = P(-14, 5, lx); k.add(box(12, 1, 18), 0xb8bcc0, p[0], p[1], p[2], 0, rot, lx > 0 ? -0.35 : 0.3, 1, 1, 1, { mat: 4 }); }
      for (const lx of [-3.5, 3.5]) { p = P(-36, 4, lx); k.add(cyl(2.2, 2.6, 3, 12), 0x4a4e56, p[0], p[1], p[2], Math.PI / 2, rot, 0, 1, 1, 1, { mat: 4 }); p = P(-37.6, 4, lx); k.add(new THREE.CircleGeometry(1.9, 16), 0x6ff5dc, p[0], p[1], p[2], 0, rot + Math.PI, 0, 1, 1, 1, { glow: 1 }); }
      for (let i = 0; i < 14; i++) { p = P(-30 + rnd() * 60, 8 + rnd() * 3, (rnd() - 0.5) * 8); k.add(ico(1.2 + rnd() * 1.5, 1), MOSS[i % 3], p[0], p[1], p[2], 0, 0, 0, 1, 0.5, 1, { jitter: 0.5 }); }
      for (let i = 0; i < 6; i++) { p = P(-30 + i * 12, 0); k.tree(p[0] + (rnd() - 0.5) * 10, k.g(p[0], p[2]) + 9, p[2], 1.2 + rnd()); }
      for (let i = -3; i <= 3; i++) { p = P(i * 10, 0); k.collideCircle(p[0], p[2], 6.5, y, y + 11); }
    } else if (t === 'floatrocks') {
      // Islands of rock hovering in the air, trees on top, bobbing very slowly.
      for (let i = 0; i < 7; i++) {
        const isl = new Kit(this.world, 0, 0, site.seed + i, k.mats);
        const r = 5 + rnd() * 9;
        isl.add(new THREE.ConeGeometry(r, r * 1.8, 8), 0x8a8478, 0, -r * 0.9, 0, Math.PI, 0, 0, 1, 1, 1, { jitter: r * 0.25, seed: i, mat: 0 });
        isl.add(cyl(r, r * 0.95, 1.2, 10), MOSS[i % 3], 0, 0.4, 0, 0, 0, 0, 1, 1, 1, { jitter: 0.6, seed: i + 9 });
        for (let j = 0; j < 3; j++) isl.b.addBuilt(vegGeometry(['oak', 'pine', 'birch', 'blossom'][(i + j) % 4], 1), new THREE.Matrix4().compose(new THREE.Vector3((rnd() - 0.5) * r, 0.8, (rnd() - 0.5) * r), new THREE.Quaternion(), new THREE.Vector3(0.8, 0.8, 0.8)));
        const g = isl.b.build();
        const m = new THREE.Mesh(g, ruinRockMats());
        m.castShadow = true;
        const a = rnd() * 6.28, d = 15 + rnd() * site.r * 0.55, hy = y + 25 + rnd() * 40;
        m.position.set(site.x + Math.cos(a) * d, hy, site.z + Math.sin(a) * d);
        const ph = rnd() * 6;
        animated.push(() => { m.position.y = hy + Math.sin(shared.time.value * 0.25 + ph) * 2.5; m.rotation.y = Math.sin(shared.time.value * 0.05 + ph) * 0.2; });
        out.push(m);
      }
    } else if (t === 'mushroom') {
      for (let i = 0; i < 12; i++) {
        const a = rnd() * 6.28, r = rnd() * site.r * 0.6, x = Math.cos(a) * r, z = Math.sin(a) * r, gy = k.g(x, z), h = 6 + rnd() * 12;
        k.add(cyl(0.5 + h * 0.04, 0.9 + h * 0.05, h, 8), 0xe8e0d0, x, gy + h / 2, z, (rnd() - 0.5) * 0.2, 0, (rnd() - 0.5) * 0.2, 1, 1, 1, { mat: 3, uvScale: [2, 3] });
        k.add(new THREE.SphereGeometry(h * 0.45, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0x5ff0d8, 0x9a8cff, 0xf0a0d8][i % 3], x, gy + h - 0.2, z, 0, 0, 0, 1, 0.45, 1, { glow: 1, jitter: 0.3 });
        k.collideCircle(x, z, 0.9 + h * 0.05, gy, gy + h);
      }
    } else if (t === 'petrified') {
      for (let i = 0; i < 9; i++) {
        const a = rnd() * 6.28, r = rnd() * site.r * 0.6, x = Math.cos(a) * r, z = Math.sin(a) * r, gy = k.g(x, z), h = 8 + rnd() * 16;
        k.add(cyl(1.6 + rnd(), 2.6 + rnd(), h, 9), 0xa8a49c, x, gy + h / 2 - 0.5, z, (rnd() - 0.5) * 0.15, 0, (rnd() - 0.5) * 0.15, 1, 1, 1, { jitter: 0.5, seed: i, smooth: true });
        k.collideCircle(x, z, 2.6, gy, gy + h);
      }
    } else if (t === 'saltflat') {
      // Old things standing alone on the white: a stone arch, a car, a signpost to nowhere.
      k.add(box(3, 14, 3), CONCRETE[2], -8, y + 7, 0).add(box(3, 14, 3), CONCRETE[2], 8, y + 7, 0).add(box(19, 3, 3), CONCRETE[1], 0, y + 15.5, 0);
      k.collideBox(-8, 0, 1.6, 1.6, 0, y, y + 14); k.collideBox(8, 0, 1.6, 1.6, 0, y, y + 14);
      k.car(20, 12, 0.7, 0.1);
      k.add(cyl(0.1, 0.1, 3, 6), 0x6a5a4a, -20, y + 1.5, -15, 0, 0, 0, 1, 1, 1, { mat: 3 }).add(box(2.2, 0.5, 0.1), 0xd8c8a8, -20, y + 2.6, -15, 0, 0.4, 0, 1, 1, 1, { mat: 3 });
    }
    const mesh = k.build(this.scene, site.id);
    if (mesh) { this.scene.remove(mesh); out.push(mesh); }
    return { meshes: out, animated: [...animated, ...k.animated] };
  }
}

// Tiny far-away meshes using every material a site might need, so their shaders compile before Begin
// (otherwise the first village or lab you meet would hitch while compiling).
export function warmupGroup() {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  geo.clearGroups(); for (let i = 0; i < 5; i++) geo.addGroup(0, geo.index.count, i);
  const sets = [villageMats('cottage'), villageMats('cabin'), villageMats('stilt'), labMats(), ruinRockMats()];
  for (const m of sets) g.add(new THREE.Mesh(geo, m));
  for (const m of [ruinMaterial('rock', { moss: 0.8 }), ruinMaterial('rock', { moss: 0.2, grime: 1 }), fallMat(), lightMat]) g.add(new THREE.Mesh(geo, m));
  g.add(warmPerson());
  g.traverse((o) => { o.frustumCulled = false; });
  g.position.set(0, -5000, 0);
  return g;
}

let rockMats = null;
function ruinRockMats() { return rockMats ??= [ruinMaterial('rock', { moss: 0.6 }), MAT.glow(), MAT.leaf(), MAT.bark(), ruinMaterial('rust')]; }

// The rock shell over a hollow, with a skylight hole and a shaft of light falling through it.
function hollowDome(site, animated) {
  const out = [];
  const r = site.r * 1.12, top = site.wall + 16;
  const g = new THREE.SphereGeometry(r, 28, 12, 0, Math.PI * 2, 0.16, Math.PI / 2 - 0.16);
  // rough it up, and squash it to the wall height
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 1 + (hash2(Math.round(x * 3), Math.round(z * 3), Math.round(y * 3)) - 0.5) * 0.12;
    pos.setXYZ(i, x * n, y * n, z * n);
  }
  g.computeVertexNormals();
  const col = new Float32Array(pos.count * 3).fill(0.62);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dome = new THREE.Mesh(g, ruinMaterial('rock', { moss: 0.8 }));
  const innerMat = ruinMaterial('rock', { moss: 0.2, grime: 1 }); // only hollows use this variant
  innerMat.side = THREE.BackSide;
  const inner = new THREE.Mesh(g, innerMat);
  for (const m of [dome, inner]) {
    m.position.set(site.x, site.floor + site.wall * 0.55, site.z);
    m.scale.set(1, top / r, 1);
    m.castShadow = true; m.receiveShadow = true;
    out.push(m);
  }
  // light shaft through the skylight
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.15, r * 0.3, top + site.wall * 0.55, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  shaft.position.set(site.x, site.floor + (top + site.wall * 0.55) / 2, site.z);
  out.push(shaft);
  animated.push(() => { shaft.material.opacity = 0.06 + 0.03 * Math.sin(shared.time.value * 0.4); });
  return out;
}

// Bioluminescent markers along the sea floor from this ocean site toward its neighbours: the pathways.
const lightGeo = new THREE.IcosahedronGeometry(0.4, 0);
lightGeo.userData.shared = true;
const lightMat = new THREE.MeshBasicMaterial({ color: 0x7affe0 });
lightMat.userData.shared = true;
function guideLights(site) {
  const pts = [];
  const ci = Math.floor(site.x / SITE_CELL), cj = Math.floor(site.z / SITE_CELL);
  for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const o = siteCell(ci + di, cj + dj);
    if (!o || !(o.kind === 'wreck' || o.kind === 'sunken' || (o.kind === 'lab' && o.variant === 'dome'))) continue;
    const L = Math.hypot(o.x - site.x, o.z - site.z), n = Math.floor(L / 2 / 14);
    for (let i = 1; i <= n; i++) {
      const t = (i * 14) / L, x = site.x + (o.x - site.x) * t + Math.sin(i * 0.7 + site.seed) * 6, z = site.z + (o.z - site.z) * t + Math.cos(i * 0.5) * 6;
      const h = heightAt(x, z);
      if (h < WATER_LEVEL - 3) pts.push(x, h + 0.5, z);
    }
  }
  const m = new THREE.InstancedMesh(lightGeo, lightMat, Math.max(1, pts.length / 3));
  m.count = pts.length / 3;
  const M = new THREE.Matrix4();
  for (let i = 0; i < m.count; i++) m.setMatrixAt(i, M.makeTranslation(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]));
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

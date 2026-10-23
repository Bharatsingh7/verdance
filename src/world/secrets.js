// Echoes (collectible memory fragments), discoveries (landmarks, valleys, viewpoints) and the scanner.
import * as THREE from 'three';
import { heightAt, VALLEY_DATA, valleyAt, WATER_LEVEL } from './terrain.js';
import { LANDMARKS } from './features.js';

export const VIEWPOINTS = [
  { id: 'cloudrest', name: 'Cloudrest Summit', x: -680, z: -1490, r: 45, text: 'From up here the whole world fits in one breath.' },
  { id: 'northwind', name: 'Northwind Crest', x: 250, z: -1710, r: 45, text: 'The sea on one side, the forests on the other. Both are quiet.' },
  { id: 'eagle', name: "Eagle's Chair", x: 780, z: -1600, r: 45, text: 'Someone carved a little seat into the rock here. Good choice.' },
  { id: 'mesa', name: 'Ochre Mesa', x: -90, z: 1450, r: 40, text: 'The canyons glow like embers at sunset. Stay a while.' },
  { id: 'canopy', name: 'Canopy Rise', x: 1540, z: 940, r: 40, text: 'Above the jungle, mist rolls like a slow tide.' },
];

const at = (id) => LANDMARKS.find((l) => l.id === id) || VALLEY_DATA.find((v) => v.id === id) || VIEWPOINTS.find((v) => v.id === id);

// Lore: short, calm fragments of the world before.
const E = (id, near, dx, dz, title, text) => ({ id, near, dx, dz, title, text });
export const ECHOES = [
  E('e1', 'city', 30, 60, 'A Bus Ticket', 'Single journey, valid until 18:40. Whoever held it was never late again — there was nowhere to hurry to.'),
  E('e2', 'city', -69, -69, 'Rooftop Garden Note', '"Water the tomatoes Tuesday." The tomatoes took care of themselves. They are everywhere now.'),
  E('e3', 'city', 69, -69, 'Elevator Music', 'A looping melody, still faintly stored in a chip. The ferns seem to sway to it.'),
  E('e4', 'overpass', -60, 50, 'Traffic Report', '"Heavy congestion on the eastbound." The congestion is now a family of rabbits.'),
  E('e5', 'overpass', 90, -30, 'Graffiti', 'Under the bridge, in blue paint: SLOW DOWN. Someone finally listened.'),
  E('e6', 'village', 10, -20, 'Postcard', '"Wish you were here." Everyone is, in a way. The flowers are, certainly.'),
  E('e7', 'village', -50, 40, 'Child\'s Drawing', 'A house, a sun with a face, a tree taller than the house. Prophetic.'),
  E('e8', 'turbines', 30, 60, 'Maintenance Log', 'Turbine 1: bearing replaced. It has not needed another since. Some things just keep going.'),
  E('e9', 'fuel', 25, 20, 'Receipt', 'Coffee, gum, a map. The map is wrong now. The coffee would have been cold anyway.'),
  E('e10', 'fuel', -40, -40, 'Radio Dedication', '"This one goes out to everyone driving through the night." Still driving. Still listening.'),
  E('e11', 'dishes', 10, 25, 'Signal Fragment', 'A pattern from deep space, never decoded. Maybe it was just someone saying hello.'),
  E('e12', 'giant', -25, -20, 'Plaque', 'The name has worn away. What remains: "...who dreamed of a gentler world."'),
  E('e13', 'train', 30, 25, 'Timetable', 'Departures every 12 minutes. The lizards keep their own schedule, mostly sun-based.'),
  E('e14', 'train', -260, -100, 'Conductor\'s Whistle', 'Brass, dented, still sings if you blow gently. The birds answer.'),
  E('e15', 'stadium', 0, 0, 'Final Score', 'Home 2, Away 1. The last game ever played. Everyone went home happy.'),
  E('e16', 'stadium', 90, -50, 'Season Pass', 'Row K, seat 14. A sapling holds that seat now, rooting for the sun.'),
  E('e17', 'plane', 25, -30, 'In-flight Magazine', '"Top 10 Places To See Before You Die." This place was not on it. It should have been.'),
  E('e18', 'plane', -40, 30, 'Boarding Pass', 'Window seat. The view now: reeds, herons, and an endless pale sky.'),
  E('e19', 'dam', 60, 40, 'Engineer\'s Sketch', 'Load calculations, coffee stains, and in the margin, a tiny drawing of a fish.'),
  E('e20', 'lighthouse', -25, 15, 'Keeper\'s Journal', '"Fog again. Lit the lamp anyway. You never know who is out there."'),
  E('e21', 'park', 15, -30, 'Prize Ticket', 'Worth one (1) giant teddy bear. The booth is closed, but the joy was the point.'),
  E('e22', 'relay', -20, 25, 'Last Broadcast', '"...and that\'s the weather. Tomorrow: clear skies, everywhere, for a long time."'),
  E('e23', 'lantern', 30, -30, 'Bioluminescence Study', 'Notes in neat handwriting: "They glow brighter when someone is near. As if glad."'),
  E('e24', 'starfield', 40, 30, 'Star Chart', 'Every constellation labelled, plus one hand-drawn: "Us, someday."'),
  E('e25', 'crystal', -25, 20, 'Miner\'s Lamp', 'Still faintly warm somehow. The crystals give back the light it lent them.'),
  E('e26', 'glass', 20, 25, 'Seed Catalogue', 'Every page marked "planted". Every one of them took.'),
  E('e27', 'cloudrest', 10, 10, 'Summit Register', 'Hundreds of names. The last entry: "Made it. Worth it."'),
  E('e28', 'mesa', 12, -8, 'Sun-faded Photo', 'A family laughing at a picnic, right here. The view has not changed one bit.'),
  E('e29', 'canopy', 0, 15, 'Field Recorder', 'Forty hours of rainfall, recorded for no reason except that it was beautiful.'),
  E('e30', 'eagle', -10, 8, 'Letter Never Sent', '"I hope wherever you are, it is quiet and green." It is. It really is.'),
];

export class Secrets {
  constructor(scene, save) {
    this.scene = scene;
    this.collected = new Set(save?.echoes || []);
    this.discovered = new Set(save?.discovered || []);
    // Wild finds keep their own text (the sites that made them may be far away and unloaded).
    this.wild = { places: save?.wild?.places || {}, echoes: save?.wild?.echoes || {} };
    this.hinted = new Set(save?.hinted || []);
    this.items = [];
    this.itemIds = new Set();
    this.scanTime = -1;
    this.scanCooldown = 0;

    this.shardGeo = new THREE.OctahedronGeometry(0.7, 0);
    this.ringGeo = new THREE.TorusGeometry(1.3, 0.05, 4, 24);
    this.beamGeo = new THREE.CylinderGeometry(0.6, 0.6, 140, 8, 1, true); this.beamGeo.translate(0, 70, 0);
    this.shardMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8 });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.6 });
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const e of ECHOES) {
      const a = at(e.near);
      this.addEcho({ ...e, x: a.x + e.dx, z: a.z + e.dz });
    }

    this.places = [
      ...LANDMARKS.map((l) => ({ id: l.id, name: l.name, text: l.text, x: l.x, z: l.z, r: Math.max(55, (l.flat || 40) * 0.9), kind: 'landmark' })),
      ...VALLEY_DATA.map((v) => ({ id: v.id, name: v.name, text: v.text, x: v.x, z: v.z, r: v.r * 0.7, kind: 'valley' })),
      ...VIEWPOINTS.map((v) => ({ ...v, kind: 'viewpoint' })),
    ];
    this.islandPlaces = this.places.length;
    // Wild places found before (kept on the map and in the journal).
    for (const [id, p] of Object.entries(this.wild.places)) this.places.push({ ...p, id, wild: true });

    // Scanner shockwave.
    this.wave = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0x6ff5dc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, wireframe: true }));
    this.wave.visible = false;
    scene.add(this.wave);
  }

  // An echo item: { id, x, z, title, text, under? (sits on the sea floor), site? (owner, for unloading) }.
  addEcho(e) {
    if (this.itemIds.has(e.id)) return;
    const ground = heightAt(e.x, e.z);
    const y = (e.under ? ground : Math.max(ground, WATER_LEVEL)) + (e.lift ?? 1.8);
    const g = new THREE.Group();
    g.position.set(e.x, y, e.z);
    const shard = new THREE.Mesh(this.shardGeo, this.shardMat); shard.scale.set(1, 1.6, 1);
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat); ring.rotation.x = Math.PI / 2;
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat.clone()); beam.visible = false;
    g.add(shard, ring, beam);
    g.visible = !this.collected.has(e.id);
    this.scene.add(g);
    this.items.push({ ...e, y, g, shard, ring, beam, scanned: 0 });
    this.itemIds.add(e.id);
  }

  removeSite(siteId) {
    this.items = this.items.filter((it) => {
      if (it.site !== siteId) return true;
      this.scene.remove(it.g); it.beam.material.dispose(); this.itemIds.delete(it.id);
      return false;
    });
    this.places = this.places.filter((p) => p.site !== siteId || this.discovered.has(p.id));
  }

  addPlace(p) { if (!this.places.some((q) => q.id === p.id)) this.places.push(p); }

  // A villager pointed the way: show it on the compass until found.
  hint(p) { this.addPlace(p); this.hinted.add(p.id); }

  get total() { return ECHOES.length; }
  get placeTotal() { return this.islandPlaces; }
  get wildEchoes() { return Object.keys(this.wild.echoes).length; }
  get wildPlaces() { return Object.keys(this.wild.places).length; }

  scan(pos) {
    if (this.scanCooldown > 0) return false;
    this.scanCooldown = 4;
    this.scanTime = 0;
    this.wave.position.copy(pos);
    this.wave.visible = true;
    return true;
  }

  // Returns events: [{type:'echo'|'place', ...}]
  update(dt, t, pos) {
    const events = [];
    this.scanCooldown = Math.max(0, this.scanCooldown - dt);
    if (this.scanTime >= 0) {
      this.scanTime += dt;
      const r = this.scanTime * 220;
      this.wave.scale.setScalar(r);
      this.wave.material.opacity = Math.max(0, 0.5 * (1 - this.scanTime / 2.6));
      for (const it of this.items) {
        if (this.collected.has(it.id) || it.scanned > 0) continue;
        if (Math.hypot(it.x - pos.x, it.z - pos.z) < r && r < 560) { it.scanned = 75; events.push({ type: 'ping', item: it }); }
      }
      if (this.scanTime > 2.6) { this.scanTime = -1; this.wave.visible = false; }
    }

    for (const it of this.items) {
      if (this.collected.has(it.id)) continue;
      it.shard.rotation.y = t * 1.2;
      it.shard.position.y = Math.sin(t * 1.6 + it.x) * 0.3;
      it.ring.rotation.z = -t * 0.6;
      it.ring.scale.setScalar(1 + Math.sin(t * 2 + it.z) * 0.1);
      if (it.scanned > 0) {
        it.scanned -= dt;
        it.beam.visible = true;
        it.beam.material.opacity = 0.35 * Math.min(1, it.scanned / 5);
      } else it.beam.visible = false;
      const d = Math.hypot(it.x - pos.x, it.z - pos.z);
      if (d < 5.5 && Math.abs(it.y - pos.y) < 8) {
        this.collected.add(it.id);
        if (it.site) this.wild.echoes[it.id] = { title: it.title, text: it.text };
        it.g.visible = false;
        events.push({ type: 'echo', item: it });
      }
    }

    for (const p of this.places) {
      if (this.discovered.has(p.id)) continue;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d > p.r) continue;
      if (p.kind === 'valley' && !valleyAt(pos.x, pos.z)) continue;
      this.discovered.add(p.id);
      this.hinted.delete(p.id);
      if (p.wild) this.wild.places[p.id] = { name: p.name, text: p.text, kind: p.kind, x: p.x, z: p.z };
      events.push({ type: 'place', place: p });
    }
    return events;
  }

  // Markers for the compass: scanned echoes (and nearby undiscovered places once scanned).
  markers() {
    const m = [];
    for (const it of this.items) if (it.scanned > 0 && !this.collected.has(it.id)) m.push({ x: it.x, z: it.z, kind: 'echo' });
    for (const p of this.places) if (this.hinted.has(p.id) && !this.discovered.has(p.id)) m.push({ x: p.x, z: p.z, kind: 'hint' });
    return m;
  }

  nearestUnfound(pos) {
    let best = null, bd = Infinity;
    for (const it of this.items) {
      if (this.collected.has(it.id)) continue;
      const d = Math.hypot(it.x - pos.x, it.z - pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best ? { item: best, d: bd } : null;
  }
}

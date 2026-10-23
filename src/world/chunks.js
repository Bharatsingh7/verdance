// Streams terrain chunks (with LOD) and their vegetation around a focus point using a worker pool.
import * as THREE from 'three';
import { CHUNK, VEG_STRIDE } from './chunkgen.js';
import { terrainMaterial } from './surfaces.js';
import { vegGeometry, vegMaterials, vegDepth, VEG_RENDER, MAT } from './models.js';
import { hash2 } from '../core/rng.js';

const LOD_DIST = 170;
const LODS = [[260, 64], [560, 32], [1050, 16], [Infinity, 8]];
const TRUNK = { oak: 0.5, maple: 0.45, birch: 0.25, pine: 0.4, jungle: 0.9, palm: 0.35, cactus: 0.5, deadtree: 0.3, boulder: 2.0, glowtree: 0.5 };

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.chunks = new Map();
    this.material = terrainMaterial();
    this.viewRadius = 1500;
    this.vegRadius = 480;
    this.nearRadius = 140;
    this.density = 1;
    this.shadows = true;
    this.statics = new Map(); // chunk key -> static colliders (ruins)
    this.pending = new Map();
    this.nextId = 1;
    this.queue = [];
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    this.workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./chunk.worker.js', import.meta.url), { type: 'module' });
      w.busy = 0;
      w.onmessage = (e) => this.onMessage(w, e.data);
      this.workers.push(w);
    }
    this._color = new THREE.Color();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  setTerrainMaterial(m) {
    if (this.material === m) return;
    this.material = m;
    for (const c of this.chunks.values()) if (c.mesh) c.mesh.material = m;
  }

  key(cx, cz) { return cx + ',' + cz; }

  send(msg) {
    return new Promise((resolve) => {
      msg.id = this.nextId++;
      this.pending.set(msg.id, resolve);
      let best = this.workers[0];
      for (const w of this.workers) if (w.busy < best.busy) best = w;
      best.busy++;
      best.postMessage(msg);
    });
  }

  onMessage(w, data) {
    w.busy--;
    const r = this.pending.get(data.id);
    this.pending.delete(data.id);
    if (r) r(data);
  }

  inFlight() { let n = 0; for (const w of this.workers) n += w.busy; return n; }

  // One map tile (world-aligned square `tile` metres across), rendered by a worker.
  requestMapTile(tx, tz, tile, size) { return this.send({ type: 'map', size, half: tile / 2, ox: (tx + 0.5) * tile, oz: (tz + 0.5) * tile }).then((d) => d.img); }

  // How many chunks are still missing near the focus (for the loading screen).
  missingNear(fx, fz, radius, withVeg = false) {
    let missing = 0;
    const r = Math.ceil(radius / CHUNK);
    const ccx = Math.floor(fx / CHUNK), ccz = Math.floor(fz / CHUNK);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      // Same distance measure the streamer uses (to the chunk's near edge), so we never wait on chunks it won't load.
      const d = Math.max(0, Math.hypot((cx + 0.5) * CHUNK - fx, (cz + 0.5) * CHUNK - fz) - CHUNK * 0.5);
      if (d > radius) continue;
      const c = this.chunks.get(this.key(cx, cz));
      if (!c || !c.mesh || (withVeg && d < this.vegRadius && c.vegState !== 2)) missing++;
    }
    return missing;
  }

  update(focus) {
    const fx = focus.x, fz = focus.z;
    const R = this.viewRadius;
    const rc = Math.ceil(R / CHUNK);
    const ccx = Math.floor(fx / CHUNK), ccz = Math.floor(fz / CHUNK);
    const wanted = [];
    for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      const mx = (cx + 0.5) * CHUNK, mz = (cz + 0.5) * CHUNK;
      const d = Math.max(0, Math.hypot(mx - fx, mz - fz) - CHUNK * 0.5);
      if (d > R) continue;
      let segs = 8;
      for (const [lim, s] of LODS) if (d < lim) { segs = s; break; }
      const k = this.key(cx, cz);
      let c = this.chunks.get(k);
      if (!c) { c = { cx, cz, key: k, segs: 0, want: segs, mesh: null, veg: null, vegState: 0, colliders: [] }; this.chunks.set(k, c); }
      c.want = segs; c.dist = d; c.seen = true;
      if (c.segs !== segs && c.loading !== segs) wanted.push(c);
    }

    // Drop far chunks.
    for (const [k, c] of this.chunks) {
      if (!c.seen && c.dist > R + 250) this.dropChunk(k, c);
      else if (!c.seen) c.dist = Math.hypot((c.cx + 0.5) * CHUNK - fx, (c.cz + 0.5) * CHUNK - fz);
      c.seen = false;
    }

    // One priority queue for terrain + vegetation: nearby plants come before far terrain.
    const jobs = wanted.filter((c) => !c.loading).map((c) => ({ c, p: c.dist, veg: false }));
    for (const c of this.chunks.values()) if (c.dist < this.vegRadius && c.vegState === 0 && c.mesh) jobs.push({ c, p: c.dist * 0.5, veg: true });
    jobs.sort((a, b) => a.p - b.p);
    const cap = this.workers.length * 2;
    for (const j of jobs) {
      if (this.inFlight() >= cap) break;
      const c = j.c;
      if (j.veg) {
        c.vegState = 1;
        this.send({ type: 'veg', cx: c.cx, cz: c.cz, density: this.density }).then((m) => this.applyVeg(c, m.veg));
      } else {
        const segs = c.want;
        c.loading = segs;
        this.send({ type: 'terrain', cx: c.cx, cz: c.cz, segs }).then((d) => this.applyTerrain(c, segs, d));
      }
    }

    for (const c of this.chunks.values()) {
      const d = c.dist;
      if (c.veg) {
        // Swap trees to their lighter far version (instance data is unchanged).
        const lod = d > LOD_DIST + (c.vegLod ? -20 : 20) ? 1 : 0;
        if (lod !== c.vegLod) { c.vegLod = lod; for (const m of c.veg.children) if (VEG_RENDER[m.userData.veg].lod) m.geometry = vegGeometry(m.userData.veg, lod); }
        c.veg.visible = d < this.vegRadius + 60;
        for (const m of c.vegNear) m.visible = d < this.nearRadius;
      }
    }
  }

  applyTerrain(c, segs, d) {
    if (c.loading === segs) c.loading = 0;
    if (!this.chunks.has(c.key)) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(d.clr, 3));
    g.setIndex(new THREE.BufferAttribute(d.idx, 1));
    g.setAttribute('splat', new THREE.BufferAttribute(d.spl, 4));
    g.setAttribute('splat2', new THREE.BufferAttribute(d.spl2, 2));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, d.minY, 0), new THREE.Vector3(CHUNK, d.maxY, CHUNK));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    if (c.mesh) { c.mesh.geometry.dispose(); c.mesh.geometry = g; }
    else {
      c.mesh = new THREE.Mesh(g, this.material);
      c.mesh.position.set(c.cx * CHUNK, 0, c.cz * CHUNK);
      c.mesh.matrixAutoUpdate = false;
      c.mesh.updateMatrix();
      c.mesh.receiveShadow = true;
      this.group.add(c.mesh);
    }
    c.segs = segs;
  }

  applyVeg(c, veg) {
    if (!this.chunks.has(c.key)) return;
    const group = new THREE.Group();
    c.vegNear = [];
    const { _m: m, _q: q, _v: v, _s: s, _color: col, _up: up } = this;
    for (const [name, arr] of Object.entries(veg)) {
      const R = VEG_RENDER[name];
      const count = arr.length / VEG_STRIDE;
      const mesh = new THREE.InstancedMesh(vegGeometry(name, c.dist > LOD_DIST ? 1 : 0), vegMaterials(name), count);
      mesh.userData.veg = name;
      for (let i = 0; i < count; i++) {
        const o = i * VEG_STRIDE;
        const x = arr[o], y = arr[o + 1], z = arr[o + 2], rot = arr[o + 3], sc = arr[o + 4];
        q.setFromAxisAngle(up, rot);
        m.compose(v.set(x, y, z), q, s.set(sc, sc, sc));
        mesh.setMatrixAt(i, m);
        const hv = hash2(i, c.cx * 97 + c.cz, name.length);
        if (R.ground && arr[o + 5] >= 0) col.setRGB(arr[o + 5] * 1.9, arr[o + 6] * 1.9, arr[o + 7] * 1.9);
        else { const k = 1 + (hv - 0.5) * 2 * (R.vary || 0); col.setRGB(k, k * (1 + (hash2(i, 3, c.cz) - 0.5) * (R.vary || 0)), k); }
        mesh.setColorAt(i, col);
        const tr = TRUNK[name];
        if (tr) c.colliders.push(x, z, tr * sc);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = !!R.shadow && this.shadows;
      mesh.customDepthMaterial = vegDepth(name);
      mesh.receiveShadow = false;
      group.add(mesh);
      if (R.near) c.vegNear.push(mesh);
    }
    c.veg = group;
    c.vegLod = c.dist > LOD_DIST ? 1 : 0;
    c.vegState = 2;
    this.group.add(group);
  }

  dropChunk(k, c) {
    if (c.mesh) { c.mesh.geometry.dispose(); this.group.remove(c.mesh); }
    if (c.veg) { for (const m of c.veg.children) m.dispose(); this.group.remove(c.veg); }
    this.chunks.delete(k);
  }

  // Regenerate vegetation (after a quality change).
  resetVegetation() {
    for (const c of this.chunks.values()) {
      if (c.veg) { for (const m of c.veg.children) m.dispose(); this.group.remove(c.veg); }
      c.veg = null; c.vegState = 0; c.colliders = []; c.vegNear = [];
    }
  }

  addStatic(x, z, collider) {
    const k = this.key(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
    if (!this.statics.has(k)) this.statics.set(k, []);
    this.statics.get(k).push(collider);
  }

  // Remove every static collider tagged with this owner (a streamed-out site).
  removeStatics(owner) {
    for (const [k, list] of this.statics) {
      const keep = list.filter((c) => c.owner !== owner);
      if (keep.length) this.statics.set(k, keep); else this.statics.delete(k);
    }
  }

  // Colliders around a point: trunks as [x,z,r] triples + static shapes.
  collidersNear(x, z, out) {
    out.circles.length = 0; out.shapes.length = 0;
    const ccx = Math.floor(x / CHUNK), ccz = Math.floor(z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const k = this.key(ccx + dx, ccz + dz);
      const c = this.chunks.get(k);
      if (c) for (let i = 0; i < c.colliders.length; i += 3) {
        const ex = c.colliders[i] - x, ez = c.colliders[i + 1] - z;
        if (ex * ex + ez * ez < 400) out.circles.push(c.colliders[i], c.colliders[i + 1], c.colliders[i + 2]);
      }
      const s = this.statics.get(k);
      if (s) for (const sh of s) out.shapes.push(sh);
    }
    return out;
  }
}

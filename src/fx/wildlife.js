// Gentle wildlife: bird flocks, deer herds that graze and flee, a breaching whale, and a spirit stag at night.
import * as THREE from 'three';
import { Builder, shared, MAT } from '../world/models.js';
import { heightAt, VALLEY_DATA, WATER_LEVEL } from '../world/terrain.js';
import { mulberry32, lerp } from '../core/rng.js';

const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);

function deerGeometry(antlers) {
  const b = new Builder();
  const C = 0x9a6a44, L = 0xd8c0a0;
  b.add(box(0.7, 0.7, 1.5), C, 0, 1.25, 0)
    .add(box(0.5, 0.4, 0.6), L, 0, 1.0, 0.1)
    .add(box(0.3, 0.75, 0.3), C, 0, 1.75, 0.75, -0.5, 0, 0)
    .add(box(0.32, 0.32, 0.6), C, 0, 2.1, 1.05)
    .add(box(0.1, 0.25, 0.08), C, 0.15, 2.35, 0.9).add(box(0.1, 0.25, 0.08), C, -0.15, 2.35, 0.9)
    .add(box(0.15, 0.15, 0.1), 0xf0e8e0, 0, 1.4, -0.78);
  for (const [x, z] of [[0.22, 0.55], [-0.22, 0.55], [0.22, -0.55], [-0.22, -0.55]]) b.add(box(0.13, 1.0, 0.13), C, x, 0.5, z);
  if (antlers) {
    for (const s of [-1, 1]) {
      b.add(box(0.06, 0.7, 0.06), 0xe8dcc8, s * 0.2, 2.6, 0.9, 0, 0, s * -0.4);
      b.add(box(0.05, 0.4, 0.05), 0xe8dcc8, s * 0.38, 2.75, 1.0, 0.5, 0, s * -0.2);
    }
  }
  return b.build();
}

export class Wildlife {
  constructor(scene) {
    this.scene = scene;
    const rnd = (this.rnd = mulberry32(777));

    // Birds: instanced V shapes, wings flap in the vertex shader.
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.4, -1, 0.1, -0.2, 0, 0, -0.3, 0, 0, 0.4, 0, 0, -0.3, 1, 0.1, -0.2], 3));
    bg.computeVertexNormals();
    const bm = new THREE.MeshBasicMaterial({ color: 0x2a2a32, side: THREE.DoubleSide });
    bm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = shared.time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y += abs(position.x) * sin(uTime * 9.0 + float(gl_InstanceID) * 1.7) * 0.7;`);
    };
    this.flocks = [];
    const FN = 5, BN = 9;
    this.birds = new THREE.InstancedMesh(bg, bm, FN * BN);
    this.birds.frustumCulled = false;
    scene.add(this.birds);
    for (let f = 0; f < FN; f++) {
      this.flocks.push({ cx: 0, cz: 0, r: 40 + rnd() * 50, h: 35 + rnd() * 30, speed: 0.15 + rnd() * 0.1, phase: rnd() * 6, scare: 0, off: [(rnd() - 0.5) * 500, (rnd() - 0.5) * 500],
        birds: Array.from({ length: BN }, () => ({ a: rnd() * 0.6, r: (rnd() - 0.5) * 14, y: (rnd() - 0.5) * 6 })) });
    }

    // Deer herds at fixed homes in meadows and forests.
    this.deerGeo = [deerGeometry(false), deerGeometry(true)];
    this.deerMat = MAT.solid(0, 0.3);
    this.herds = [];
    const homes = [[180, 120], [-250, 380], [420, -230], [-900, -600], [-420, -760], [-1450, -250], [600, 380], [-60, -420], [250, -880]];
    for (const [x, z] of homes) this.herds.push({ x, z, deer: null });

    // Whale (east and south seas).
    const wb = new Builder();
    wb.add(new THREE.IcosahedronGeometry(1, 1), 0x3a4a5e, 0, 0, 0, 0, 0, 0, 3, 2.4, 9, { jitter: 0.1 })
      .add(new THREE.IcosahedronGeometry(1, 1), 0xd8dce0, 0, -1.2, 1, 0, 0, 0, 2.4, 1.2, 7)
      .add(box(7, 0.4, 2.2), 0x3a4a5e, 0, 0, -11, 0, 0, 0)
      .add(box(5, 0.3, 1.6), 0x3a4a5e, 3.2, -1, 3, 0, 0.4, -0.5).add(box(5, 0.3, 1.6), 0x3a4a5e, -3.2, -1, 3, 0, -0.4, 0.5);
    this.whale = new THREE.Mesh(wb.build(), this.deerMat);
    this.whale.visible = false;
    scene.add(this.whale);
    this.whaleSpots = [[1960, 200], [1700, 1500], [500, 2000], [-1300, 1700], [2000, -700]];
    this.whaleT = -1; this.whaleCool = 8; this.whaleSpot = null;
    this.splash = new THREE.Mesh(new THREE.RingGeometry(3, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.splash.rotation.x = -Math.PI / 2;
    scene.add(this.splash);

    // Spirit stag in Starfield Valley, only at night.
    const sv = VALLEY_DATA.find((v) => v.id === 'starfield');
    this.stag = new THREE.Mesh(this.deerGeo[1], new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.stag.position.set(sv.x + 25, heightAt(sv.x + 25, sv.z - 30), sv.z - 30);
    this.stag.scale.setScalar(1.4);
    scene.add(this.stag);
    this.seen = new Set();
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._e = new THREE.Euler();
  }

  startle(pos) {
    for (const f of this.flocks) if (Math.hypot(f.cx - pos.x, f.cz - pos.z) < 200) f.scare = 6;
    for (const h of this.herds) if (h.deer) for (const d of h.deer) if (d.mesh.position.distanceTo(pos) < 60) d.flee = 5;
  }

  spawnHerd(h) {
    const n = 3 + Math.floor(this.rnd() * 4);
    h.deer = [];
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.deerGeo[i === 0 ? 1 : 0], this.deerMat);
      mesh.castShadow = true;
      const x = h.x + (this.rnd() - 0.5) * 30, z = h.z + (this.rnd() - 0.5) * 30;
      mesh.position.set(x, heightAt(x, z), z);
      mesh.rotation.y = this.rnd() * 6.28;
      if (i > 2) mesh.scale.setScalar(0.7);
      this.scene.add(mesh);
      h.deer.push({ mesh, tx: x, tz: z, wait: this.rnd() * 5, flee: 0, graze: 0, heading: mesh.rotation.y, step: this.rnd() * 6 });
    }
  }

  update(dt, t, truck, env) {
    const events = [];
    const P = truck.pos;
    // Birds circle near the player, drifting their centres slowly.
    let k = 0;
    const m = this._m, q = this._q, v = this._v;
    for (const f of this.flocks) {
      const tx = P.x + f.off[0], tz = P.z + f.off[1];
      if (Math.hypot(f.cx - tx, f.cz - tz) > 800) { f.cx = tx; f.cz = tz; }
      f.cx = lerp(f.cx, tx, dt * 0.02); f.cz = lerp(f.cz, tz, dt * 0.02);
      f.scare = Math.max(0, f.scare - dt);
      const sp = f.speed * (1 + f.scare * 0.6);
      f.phase += sp * dt;
      const ground = Math.max(heightAt(f.cx, f.cz), WATER_LEVEL);
      const show = env.daylight > 0.15;
      for (const b of f.birds) {
        const a = f.phase + b.a;
        const r = f.r + b.r + f.scare * 10;
        v.set(f.cx + Math.cos(a) * r, ground + f.h + b.y + f.scare * 8 + Math.sin(t * 0.5 + b.a * 9) * 2, f.cz + Math.sin(a) * r);
        q.setFromEuler(this._e.set(0, -a, 0.3));
        m.compose(v, q, this._s.setScalar(show ? 1.1 : 0));
        this.birds.setMatrixAt(k++, m);
      }
    }
    this.birds.instanceMatrix.needsUpdate = true;

    // Deer herds: spawn when near, wander, graze, flee from a fast rover.
    for (const h of this.herds) {
      const d = Math.hypot(h.x - P.x, h.z - P.z);
      if (d < 380 && !h.deer) this.spawnHerd(h);
      else if (d > 520 && h.deer) { for (const dr of h.deer) this.scene.remove(dr.mesh); h.deer = null; }
      if (!h.deer) continue;
      if (d < 45 && !this.seen.has('deer')) { this.seen.add('deer'); events.push({ id: 'deer', name: 'A Gentle Herd', text: 'Deer graze among the ruins, unhurried. They have never seen a car move before.' }); }
      for (const dr of h.deer) {
        const mp = dr.mesh.position;
        const dd = Math.hypot(mp.x - P.x, mp.z - P.z);
        if (dd < 22 && Math.abs(truck.speed) > 6) dr.flee = 4;
        let speed = 0;
        if (dr.flee > 0) {
          dr.flee -= dt;
          const ax = mp.x - P.x, az = mp.z - P.z;
          dr.heading = Math.atan2(ax, az);
          speed = 9;
          dr.tx = mp.x; dr.tz = mp.z;
        } else {
          dr.wait -= dt;
          const tx = dr.tx - mp.x, tz = dr.tz - mp.z;
          if (Math.hypot(tx, tz) > 1) { dr.heading = Math.atan2(tx, tz); speed = 1.4; }
          else if (dr.wait < 0) {
            dr.wait = 4 + this.rnd() * 8;
            dr.tx = h.x + (this.rnd() - 0.5) * 50; dr.tz = h.z + (this.rnd() - 0.5) * 50;
          }
        }
        let dh = dr.heading - dr.mesh.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        dr.mesh.rotation.y += dh * Math.min(1, dt * 4);
        mp.x += Math.sin(dr.mesh.rotation.y) * speed * dt;
        mp.z += Math.cos(dr.mesh.rotation.y) * speed * dt;
        dr.step += dt * speed * 2.2;
        mp.y = heightAt(mp.x, mp.z) + (speed > 0 ? Math.abs(Math.sin(dr.step)) * (speed > 3 ? 0.35 : 0.06) : 0);
        dr.mesh.rotation.x = speed === 0 ? lerp(dr.mesh.rotation.x, 0.25 + Math.sin(t + dr.step) * 0.05, dt * 2) : lerp(dr.mesh.rotation.x, 0, dt * 4);
      }
    }

    // Whale breaches every so often when you are near a sea spot.
    if (this.whaleT < 0) {
      this.whaleCool -= dt;
      if (this.whaleCool < 0) {
        let best = null, bd = 900;
        for (const s of this.whaleSpots) { const d = Math.hypot(s[0] - P.x, s[1] - P.z); if (d < bd) { bd = d; best = s; } }
        if (best && heightAt(best[0], best[1]) < -8) { this.whaleT = 0; this.whaleSpot = best; this.whale.visible = true; this.whaleDir = this.rnd() * 6.28; }
        this.whaleCool = 20 + this.rnd() * 20;
      }
    } else {
      this.whaleT += dt;
      const T = this.whaleT / 5;
      const [sx, sz] = this.whaleSpot;
      const along = (T - 0.5) * 30;
      this.whale.position.set(sx + Math.sin(this.whaleDir) * along, WATER_LEVEL - 6 + Math.sin(Math.min(1, T) * Math.PI) * 16, sz + Math.cos(this.whaleDir) * along);
      this.whale.rotation.set(-Math.cos(Math.min(1, T) * Math.PI) * 0.9, this.whaleDir, Math.sin(T * 3) * 0.3);
      if (T > 0.8) {
        this.splash.position.set(this.whale.position.x, 0.3, this.whale.position.z);
        const st = (T - 0.8) / 0.4;
        this.splash.scale.setScalar(1 + st * 4);
        this.splash.material.opacity = Math.max(0, 0.8 * (1 - st));
      }
      if (Math.hypot(sx - P.x, sz - P.z) < 450 && !this.seen.has('whale') && T > 0.3 && T < 0.7) {
        this.seen.add('whale'); events.push({ id: 'whale', name: 'The Old Whale', text: 'Out past the shore, something enormous rose to say hello, then slipped back home.' });
      }
      if (T > 1.3) { this.whaleT = -1; this.whale.visible = false; this.splash.material.opacity = 0; }
    }

    // Spirit stag.
    const night = 1 - Math.min(1, env.daylight * 3);
    this.stag.material.opacity = night * (0.55 + 0.15 * Math.sin(t * 1.5));
    this.stag.visible = night > 0.05;
    this.stag.rotation.y = Math.sin(t * 0.1) * 0.6 + 2.4;
    if (night > 0.5 && this.stag.position.distanceTo(P) < 45 && !this.seen.has('stag')) {
      this.seen.add('stag'); events.push({ id: 'stag', name: 'The Starlit Stag', text: 'Made of light, or memory, or both. It watched you for a long moment, then nodded.' });
    }
    return events;
  }
}


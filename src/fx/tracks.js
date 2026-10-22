// Tyre tracks pressed into the ground and dust kicked up behind the wheels.
import * as THREE from 'three';
import { heightAt, normalAt, weightsAt } from '../world/terrain.js';
import { DESERT, CANYON, MEADOW, FOREST, MOUNTAIN, BIOME_COUNT } from '../world/biomes.js';

const TRACKS = 600, DUST = 260;
const REAR = [[-1.55, -2.1], [1.55, -2.1]];

export class Tracks {
  constructor(scene) {
    // Track marks: a ring buffer of instanced quads lying on the terrain.
    const g = new THREE.PlaneGeometry(0.6, 1.3);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: 0x1a140e, transparent: true, opacity: 0.32, depthWrite: false });
    this.marks = new THREE.InstancedMesh(g, m, TRACKS);
    this.marks.count = 0;
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 1;
    scene.add(this.marks);
    this.next = 0;
    this.lastPos = null;

    // Dust: pooled points with simple ballistic motion.
    this.dpos = new Float32Array(DUST * 3);
    this.dvel = new Float32Array(DUST * 3);
    this.dlife = new Float32Array(DUST);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dpos, 3));
    dg.setAttribute('life', new THREE.BufferAttribute(this.dlife, 1));
    this.dustMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0xc8a878) }, uPixel: { value: Math.min(devicePixelRatio, 1.5) } },
      vertexShader: `attribute float life; varying float vLife; uniform float uPixel;
        void main(){ vLife = life; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.0 - life) * 260.0 * uPixel / max(1.0, -mv.z) * step(0.001, life); }`,
      fragmentShader: `uniform vec3 uColor; varying float vLife;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vLife * 0.35; if (a < 0.01) discard; gl_FragColor = vec4(uColor, a); }`,
    });
    this.dust = new THREE.Points(dg, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);
    this.di = 0;
    this.emit = 0;
    this.W = new Float32Array(BIOME_COUNT);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._n = new THREE.Vector3(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._qy = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0);
  }

  update(dt, v) {
    const onLand = v.grounded && !v.floating && !v.hover;
    const f = v.forward, r = v.right;

    // Lay a pair of marks every ~1.1 m travelled.
    if (onLand) {
      if (!this.lastPos) this.lastPos = v.pos.clone();
      if (this.lastPos.distanceTo(v.pos) > 1.1) {
        this.lastPos.copy(v.pos);
        for (const [lx, lz] of REAR) {
          const x = v.pos.x + r.x * lx + f.x * lz, z = v.pos.z + r.z * lx + f.z * lz;
          const y = heightAt(x, z) + 0.07;
          normalAt(x, z, this._n, 1);
          this._qy.setFromAxisAngle(this._up, v.heading);
          this._q.setFromUnitVectors(this._up, this._n).multiply(this._qy);
          this._m.compose(this._v.set(x, y, z), this._q, this._s);
          this.marks.setMatrixAt(this.next, this._m);
          this.next = (this.next + 1) % TRACKS;
          this.marks.count = Math.min(TRACKS, this.marks.count + 1);
        }
        this.marks.instanceMatrix.needsUpdate = true;
      }
    } else this.lastPos = null;

    // Dust on dry ground (or spray on water), more with speed.
    const sp = Math.abs(v.speed);
    weightsAt(v.pos.x, v.pos.z, this.W);
    const dry = this.W[DESERT] + this.W[CANYON] + (this.W[MEADOW] + this.W[FOREST] + this.W[MOUNTAIN]) * 0.35;
    const water = v.floating || (v.hover && heightAt(v.pos.x, v.pos.z) < 0);
    const rate = sp > 3 && (onLand || water) ? (water ? 30 : 40 * dry) * Math.min(1, sp / 15) : 0;
    this.dustMat.uniforms.uColor.value.setHex(water ? 0xe8f4f8 : this.W[DESERT] + this.W[CANYON] > 0.5 ? 0xd8b888 : 0x9a8a6a);
    this.emit += rate * dt;
    while (this.emit > 1) {
      this.emit--;
      const [lx, lz] = REAR[this.di % 2];
      const i = this.di; this.di = (this.di + 1) % DUST;
      const x = v.pos.x + r.x * lx + f.x * lz, z = v.pos.z + r.z * lx + f.z * lz;
      this.dpos[i * 3] = x; this.dpos[i * 3 + 1] = (water ? 0 : heightAt(x, z)) + 0.3; this.dpos[i * 3 + 2] = z;
      this.dvel[i * 3] = -f.x * sp * 0.15 + (Math.random() - 0.5) * 2; this.dvel[i * 3 + 1] = 1 + Math.random() * 1.5; this.dvel[i * 3 + 2] = -f.z * sp * 0.15 + (Math.random() - 0.5) * 2;
      this.dlife[i] = 1;
    }
    for (let i = 0; i < DUST; i++) {
      if (this.dlife[i] <= 0) continue;
      this.dlife[i] = Math.max(0, this.dlife[i] - dt * 0.7);
      this.dpos[i * 3] += this.dvel[i * 3] * dt; this.dpos[i * 3 + 1] += this.dvel[i * 3 + 1] * dt; this.dpos[i * 3 + 2] += this.dvel[i * 3 + 2] * dt;
      this.dvel[i * 3] *= 0.97; this.dvel[i * 3 + 1] *= 0.95; this.dvel[i * 3 + 2] *= 0.97;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.dust.geometry.attributes.life.needsUpdate = true;
  }
}

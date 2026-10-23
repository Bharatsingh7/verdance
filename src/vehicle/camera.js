// Chase camera with orbit + zoom, and a detachable drone camera for looking around / photos.
import * as THREE from 'three';
import { heightAt, WATER_LEVEL } from '../world/terrain.js';
import { clamp, lerp } from '../core/rng.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.orbitYaw = 0; this.orbitPitch = 0.22; this.dist = 13;
    this.yawSmooth = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.drone = { pos: new THREE.Vector3(), yaw: 0, pitch: -0.2 };
    this.shake = 0;
    this._v = new THREE.Vector3();
    this.init = false;
    this.col = { circles: [], shapes: [] };
  }

  toggleDrone(vehicle) {
    if (this.mode === 'chase') {
      this.mode = 'drone';
      this.drone.pos.copy(this.camera.position);
      const d = this._v.subVectors(vehicle.pos, this.camera.position);
      this.drone.yaw = Math.atan2(d.x, d.z);
      this.drone.pitch = -0.25;
    } else this.mode = 'chase';
    return this.mode;
  }

  update(dt, v, input, world) {
    const look = input.look;
    const cam = this.camera;
    if (this.mode === 'drone') {
      const D = this.drone;
      D.yaw -= look.dx * 0.004; D.pitch = clamp(D.pitch - look.dy * 0.004, -1.4, 1.2);
      const fwd = this._v.set(Math.sin(D.yaw), 0, Math.cos(D.yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const sp = input.down('ShiftLeft', 'ShiftRight') ? 40 : 16;
      D.pos.addScaledVector(fwd, input.throttle() * sp * dt);
      D.pos.addScaledVector(right, input.steer() * sp * dt);
      if (input.down('KeyE', 'Space')) D.pos.y += sp * 0.7 * dt;
      if (input.down('KeyQ', 'ControlLeft')) D.pos.y -= sp * 0.7 * dt;
      // Tethered to the rover.
      const off = D.pos.clone().sub(v.pos);
      if (off.length() > 350) D.pos.copy(v.pos).addScaledVector(off.normalize(), 350);
      D.pos.y = Math.max(D.pos.y, Math.max(heightAt(D.pos.x, D.pos.z), WATER_LEVEL) + 1.2);
      cam.position.copy(D.pos);
      cam.lookAt(D.pos.x + Math.sin(D.yaw) * Math.cos(D.pitch), D.pos.y + Math.sin(D.pitch), D.pos.z + Math.cos(D.yaw) * Math.cos(D.pitch));
      return;
    }

    this.orbitYaw -= look.dx * 0.005;
    this.orbitPitch = clamp(this.orbitPitch + look.dy * 0.004, -0.05, 1.2);
    this.dist = clamp(this.dist * (1 + look.zoom * 0.1), 7, 40);
    // Ease back behind the rover once you stop steering the camera and start driving.
    const idle = performance.now() - input.lastLookTime > 2500 && !input.dragging;
    if (idle && Math.abs(v.speed) > 3) {
      this.orbitYaw = lerp(this.orbitYaw, 0, 1 - Math.exp(-1.2 * dt));
      this.orbitPitch = lerp(this.orbitPitch, 0.22, 1 - Math.exp(-0.8 * dt));
    }

    // Smoothed heading so the camera does not snap on quick turns.
    let dh = v.heading - this.yawSmooth;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.yawSmooth += dh * (1 - Math.exp(-3.5 * dt));
    if (!this.init) { this.yawSmooth = v.heading; }

    const yaw = this.yawSmooth + this.orbitYaw + Math.PI;
    const dist = (this.dist + Math.max(0, v.speed) * 0.12) * (v.sub ? 0.85 : 1);
    const p = this.orbitPitch;
    const target = this._v.set(v.pos.x + Math.sin(yaw) * Math.cos(p) * dist, v.pos.y + 2.2 + Math.sin(p) * dist, v.pos.z + Math.cos(yaw) * Math.cos(p) * dist);
    // Under water with the sub: stay below the surface (never straddle it); otherwise stay above it.
    const below = v.sub && v.depth > 2.2;
    const ground = below ? heightAt(target.x, target.z) + 1.2 : Math.max(heightAt(target.x, target.z), WATER_LEVEL) + 1.6;
    if (target.y < ground) target.y = ground;
    if (below && target.y > WATER_LEVEL - 0.8) target.y = WATER_LEVEL - 0.8;

    if (!this.init) { this.pos.copy(target); this.look.copy(v.pos); this.init = true; }
    this.pos.lerp(target, 1 - Math.exp(-6 * dt));
    this.pos.y = Math.max(this.pos.y, below ? heightAt(this.pos.x, this.pos.z) + 1.0 : Math.max(heightAt(this.pos.x, this.pos.z), WATER_LEVEL) + 1.2);
    if (below) this.pos.y = Math.min(this.pos.y, WATER_LEVEL - 0.8);
    else if (this.pos.y < WATER_LEVEL + 0.8) this.pos.y = WATER_LEVEL + 0.8;
    // Never sit inside a tree trunk: slide out of nearby trunk colliders.
    if (world) {
      const c = world.collidersNear(this.pos.x, this.pos.z, this.col);
      for (let i = 0; i < c.circles.length; i += 3) {
        const dx = this.pos.x - c.circles[i], dz = this.pos.z - c.circles[i + 1], r = c.circles[i + 2] + 1.2;
        const d = Math.hypot(dx, dz);
        if (d < r && d > 1e-4) { this.pos.x += (dx / d) * (r - d); this.pos.z += (dz / d) * (r - d); }
      }
      // ...and out of round solid things (crystals, great trunks, towers) at camera height.
      for (const sh of c.shapes) {
        if (!sh.r || this.pos.y < sh.y0 || this.pos.y > sh.top) continue;
        const dx = this.pos.x - sh.x, dz = this.pos.z - sh.z, r = sh.r + 1.2, d = Math.hypot(dx, dz);
        if (d < r && d > 1e-4) { this.pos.x += (dx / d) * (r - d); this.pos.z += (dz / d) * (r - d); }
      }
    }
    this.look.lerp(this._v.set(v.pos.x, v.pos.y + 2.0, v.pos.z), 1 - Math.exp(-12 * dt));

    this.shake = Math.max(this.shake, v.bump); v.bump = 0;
    this.shake *= Math.exp(-6 * dt);
    cam.position.copy(this.pos);
    if (this.shake > 0.01) cam.position.y += Math.sin(performance.now() * 0.05) * this.shake * 0.3;
    cam.lookAt(this.look);
  }
}

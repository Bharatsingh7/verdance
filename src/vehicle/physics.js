// Forgiving arcade vehicle physics on the analytic terrain. Tuned to be floaty and impossible to get stuck.
import * as THREE from 'three';
import { heightAt, WATER_LEVEL } from '../world/terrain.js';
import { clamp, lerp } from '../core/rng.js';

const GRAVITY = 24;
const HALF_L = 2.6, HALF_W = 1.5;
const RADIUS = 2.3;

export class Vehicle {
  constructor(x, z, heading) {
    this.pos = new THREE.Vector3(x, heightAt(x, z) + 1, z);
    this.vel = new THREE.Vector3();
    this.heading = heading;
    this.yawRate = 0;
    this.pitch = 0; this.roll = 0;
    this.hover = false;
    this.hoverT = 0; // 0 wheels, 1 hovering (animated)
    this.grounded = true;
    this.floating = false;
    this.speed = 0; // signed forward speed m/s
    this.boost = false;
    this.quat = new THREE.Quaternion();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.wheelGround = new Float32Array(6);
    this.col = { circles: [], shapes: [] };
    this.bump = 0; // collision impulse for camera shake / sound
    this.distance = 0;
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  surface(x, z) {
    const h = heightAt(x, z);
    if (this.hover) return Math.max(h, WATER_LEVEL) + 1.5;
    return Math.max(h, WATER_LEVEL - 0.85);
  }

  reset() {
    this.pos.y = this.surface(this.pos.x, this.pos.z) + 1.5;
    this.vel.set(0, 0, 0);
    this.pitch = this.roll = 0;
    this.yawRate = 0;
  }

  update(dt, input, world) {
    const throttle = input.throttle, steer = input.steer;
    this.boost = input.boost && throttle > 0;
    this.hoverT = clamp(this.hoverT + (this.hover ? dt : -dt) * 1.5, 0, 1);

    const f = this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const r = this.right.set(f.z, 0, -f.x);

    // Corner samples for tilt and ground height.
    const px = this.pos.x, pz = this.pos.z;
    const s = (lx, lz) => this.surface(px + r.x * lx + f.x * lz, pz + r.z * lx + f.z * lz);
    const hFL = s(-HALF_W, HALF_L), hFR = s(HALF_W, HALF_L), hBL = s(-HALF_W, -HALF_L), hBR = s(HALF_W, -HALF_L);
    const ground = (hFL + hFR + hBL + hBR) * 0.25;
    const terrainH = heightAt(px, pz);
    this.floating = !this.hover && terrainH < WATER_LEVEL - 0.85;

    // Longitudinal / lateral split.
    let fs = this.vel.x * f.x + this.vel.z * f.z;
    let ls = this.vel.x * r.x + this.vel.z * r.z;

    const maxF = (this.floating ? 9 : this.hover ? 30 : 23) * (this.boost ? 1.55 : 1);
    const accel = this.hover ? 11 : 10;
    if (this.grounded || this.hover || this.floating) {
      if (throttle > 0) fs += (fs < 0 ? 18 : accel * (this.boost ? 1.6 : 1)) * throttle * dt;
      else if (throttle < 0) fs += (fs > 0 ? 18 : 7) * throttle * dt;
      fs = clamp(fs, -9, maxF + Math.max(0, fs - maxF) * 0.9); // let boost decay smoothly
      if (fs > maxF) fs = lerp(fs, maxF, dt * 1.5);
      fs -= fs * (throttle === 0 ? 0.6 : 0.08) * dt;
      // Slope pulls, softened so steep hills slow you down but never trap you.
      if (!this.hover && this.grounded) {
        const along = ((hFL + hFR) - (hBL + hBR)) * 0.5 / (HALF_L * 2);
        fs -= clamp(along, -0.6, 0.9) * 9.8 * 0.45 * dt;
      }
      ls *= Math.exp(-(this.hover ? 1.4 : this.floating ? 2.5 : 7) * dt);
    }
    this.speed = fs;

    // Steering: responsive at low speed, gentler when fast.
    const sp = Math.abs(fs);
    const steerAmt = steer * 1.15 * clamp(sp / 5, 0, 1) * (1 - 0.45 * clamp(sp / 32, 0, 1)) * Math.sign(fs || 1);
    this.yawRate = lerp(this.yawRate, steerAmt, 1 - Math.exp(-6 * dt));
    this.heading -= this.yawRate * dt;

    this.vel.x = f.x * fs + r.x * ls;
    this.vel.z = f.z * fs + r.z * ls;

    // Vertical: follow ground, go airborne when it drops away faster than gravity.
    const prevY = this.pos.y;
    this.vel.y -= GRAVITY * dt;
    let ny = prevY + this.vel.y * dt;
    if (ny <= ground) {
      if (!this.grounded && this.vel.y < -8) this.bump = Math.min(1, -this.vel.y / 25);
      ny = ground;
      this.vel.y = clamp((ground - prevY) / Math.max(dt, 1e-3), -30, 9);
      this.grounded = true;
    } else this.grounded = ny - ground < 0.15;
    if (this.hover || this.floating) {
      const bob = Math.sin(performance.now() * 0.002) * (this.hover ? 0.12 : 0.08);
      ny = Math.max(ny, ground + bob);
      this.grounded = true;
    }
    this.pos.y = ny;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.distance += Math.abs(fs) * dt;

    this.collide(world);

    // Soft edge of the world: the sea gently pushes you home.
    const rr = Math.hypot(this.pos.x, this.pos.z);
    if (rr > 1950) {
      const k = (rr - 1950) * 0.8 * dt;
      this.vel.x -= (this.pos.x / rr) * k * 10; this.vel.z -= (this.pos.z / rr) * k * 10;
      if (rr > 2150) { this.pos.x *= 2150 / rr; this.pos.z *= 2150 / rr; }
    }

    // Tilt toward the terrain plane (level out in the air / on water).
    const tp = this.grounded && !this.floating ? Math.atan2((hFL + hFR) - (hBL + hBR), HALF_L * 4) : 0;
    const tr = this.grounded && !this.floating ? Math.atan2((hFR + hBR) - (hFL + hBL), HALF_W * 4) : 0;
    const k = 1 - Math.exp(-(this.grounded ? 10 : 2) * dt);
    this.pitch = lerp(this.pitch, -tp, k);
    this.roll = lerp(this.roll, tr + (this.hover ? -this.yawRate * 0.15 : 0), k);
    this.quat.setFromEuler(this._e.set(this.pitch, this.heading, this.roll));

    // Wheel contact heights (for suspension visuals).
    const W = [[-1.55, 2.1], [1.55, 2.1], [-1.55, 0], [1.55, 0], [-1.55, -2.1], [1.55, -2.1]];
    for (let i = 0; i < 6; i++) this.wheelGround[i] = heightAt(px + r.x * W[i][0] + f.x * W[i][1], pz + r.z * W[i][0] + f.z * W[i][1]);
  }

  collide(world) {
    if (!world) return;
    const c = world.collidersNear(this.pos.x, this.pos.z, this.col);
    const R = RADIUS;
    for (let i = 0; i < c.circles.length; i += 3) {
      const dx = this.pos.x - c.circles[i], dz = this.pos.z - c.circles[i + 1];
      const min = R + c.circles[i + 2];
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) this.pushOut(dx, dz, Math.sqrt(d2), min);
    }
    for (const sh of c.shapes) {
      if (this.pos.y > sh.top - 0.3 || this.pos.y + 3 < sh.y0) continue;
      if (sh.r) {
        const dx = this.pos.x - sh.x, dz = this.pos.z - sh.z;
        const d = Math.hypot(dx, dz);
        if (d < R + sh.r && d > 1e-6) this.pushOut(dx, dz, d, R + sh.r);
        continue;
      }
      // Oriented box: closest point in box local space.
      const cs = Math.cos(sh.rot), sn = Math.sin(sh.rot);
      const lx0 = this.pos.x - sh.x, lz0 = this.pos.z - sh.z;
      const lx = lx0 * cs - lz0 * sn, lz = lx0 * sn + lz0 * cs;
      const qx = clamp(lx, -sh.hw, sh.hw), qz = clamp(lz, -sh.hd, sh.hd);
      let ex = lx - qx, ez = lz - qz;
      let d = Math.hypot(ex, ez);
      if (d >= R) continue;
      if (d < 1e-4) { // centre inside: push along the shallowest axis
        const px = sh.hw - Math.abs(lx), pz = sh.hd - Math.abs(lz);
        if (px < pz) { ex = Math.sign(lx) || 1; ez = 0; } else { ex = 0; ez = Math.sign(lz) || 1; }
        d = -Math.min(px, pz);
      }
      // back to world space
      const wx = ex * cs + ez * sn, wz = -ex * sn + ez * cs;
      const len = Math.hypot(wx, wz) || 1;
      this.pushOut(wx / len, wz / len, 1, 1 + (R - d));
    }
  }

  pushOut(dx, dz, d, min) {
    const nx = dx / d, nz = dz / d;
    const pen = min - d;
    this.pos.x += nx * pen; this.pos.z += nz * pen;
    const vn = this.vel.x * nx + this.vel.z * nz;
    if (vn < 0) {
      this.vel.x -= nx * vn * 1.25; this.vel.z -= nz * vn * 1.25;
      this.bump = Math.max(this.bump, Math.min(1, -vn / 15));
    }
  }
}

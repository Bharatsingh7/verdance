// Rover physics. On wheels it is a light rigid body (fixed 120 Hz substeps): six spring-damper wheels,
// tyre forces limited by grip x load (so cliffs can't be climbed) and hull contact points (so it never
// sinks into slopes). Hover, floating and submarine keep a simpler, forgiving arcade model.
import * as THREE from 'three';
import { heightAt, weightsAt, roadMask, WATER_LEVEL } from '../world/terrain.js';
import { DESERT, CANYON, WETLAND, MOUNTAIN, BIOME_COUNT } from '../world/biomes.js';
import { clamp, lerp } from '../core/rng.js';

const GRAVITY = 20;
const HALF_L = 2.6, HALF_W = 1.5;
const RADIUS = 2.3;
const STEP = 1 / 120;

// Wheel layout (local x, z), suspension geometry (local y) and spring.
export const WHEEL_POS = [[-1.55, 2.1], [1.55, 2.1], [-1.55, 0], [1.55, 0], [-1.55, -2.1], [1.55, -2.1]];
const WR = 0.72, MOUNT_Y = 1.25, L_REST = MOUNT_Y - WR, L_MIN = 0.22, L_MAX = 0.98;
const K = 18, L_FREE = L_REST + GRAVITY / (6 * K), DAMP = 2.4;
const COM = new THREE.Vector3(0, 0.75, 0); // low centre of mass: hard to tip over
const I_INV = new THREE.Vector3(1 / 3.2, 1 / 3.6, 1 / 2.6); // pitch, yaw, roll (body axes x, y, z)
// Hull points that must stay above ground: bottom corners, bumpers, roof corners (for roll-overs).
const HULL = [
  [-1.45, 0.85, 2.9], [1.45, 0.85, 2.9], [-1.45, 0.85, -2.9], [1.45, 0.85, -2.9],
  [0, 1.2, 3.1], [0, 1.2, -3.1], [-1.5, 1.6, 0], [1.5, 1.6, 0],
  [-1.4, 3.6, 1.8], [1.4, 3.6, 1.8], [-1.4, 3.6, -2.5], [1.4, 3.6, -2.5],
];

const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _W = new Float32Array(BIOME_COUNT);
const _F = new THREE.Vector3(), _T = new THREE.Vector3(), _M = new THREE.Vector3(), _P = new THREE.Vector3(), _rr = new THREE.Vector3();
const _fw = new THREE.Vector3(), _side = new THREE.Vector3(), _f = new THREE.Vector3(), _k = new THREE.Vector3(), _c = new THREE.Vector3();

export class Vehicle {
  constructor(x, z, heading) {
    this.pos = new THREE.Vector3(x, heightAt(x, z) + 1, z);
    this.vel = new THREE.Vector3();
    this.ang = new THREE.Vector3(); // angular velocity (world)
    this.heading = heading;
    this.yawRate = 0;
    this.pitch = 0; this.roll = 0;
    this.hover = false;
    this.hoverT = 0; // 0 wheels, 1 hovering (animated)
    this.sub = false;
    this.subT = 0; // 0 surface craft, 1 sealed submarine (animated)
    this.depth = 0;
    this.grounded = true;
    this.floating = false;
    this.speed = 0; // signed forward speed m/s
    this.boost = false;
    this.quat = new THREE.Quaternion();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.wheelGround = new Float32Array(6);
    this.wheelOff = new Float32Array(6); // wheel centre offset from its rest height (suspension visuals)
    this.wheelContact = new Uint8Array(6);
    this.prevLen = new Float32Array(6).fill(L_REST);
    this.col = { circles: [], shapes: [] };
    this.decks = [];
    this.grip = 0.85;
    this.sand = 0;
    this.bump = 0; // collision impulse for camera shake / sound
    this.distance = 0;
    this.acc = 0;
    this.tipped = 0;
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.syncQuat();
  }

  syncQuat() { this.quat.setFromEuler(this._e.set(this.pitch, this.heading, this.roll)); }

  // Ground height including driveable decks (bridges, docks) the rover is on or just above.
  ground(x, z, refY) {
    let h = heightAt(x, z);
    for (const d of this.decks) {
      if (d.top <= h || d.top > refY + 1.2) continue;
      const cs = Math.cos(d.rot), sn = Math.sin(d.rot), lx = x - d.x, lz = z - d.z;
      if (Math.abs(lx * cs - lz * sn) < d.hw && Math.abs(lx * sn + lz * cs) < d.hd) h = d.top;
    }
    return h;
  }

  groundNormal(x, z, refY, h, out) {
    const e = 0.75;
    out.set(h - this.ground(x + e, z, refY), e, h - this.ground(x, z + e, refY));
    return out.normalize();
  }

  surface(x, z) {
    const h = this.ground(x, z, this.pos.y);
    if (this.hover) return Math.max(h, WATER_LEVEL) + 1.5;
    return Math.max(h, WATER_LEVEL - 0.85);
  }

  reset() {
    this.pos.y = Math.max(heightAt(this.pos.x, this.pos.z), WATER_LEVEL - 0.85) + 1.5;
    this.vel.set(0, 0, 0);
    this.ang.set(0, 0, 0);
    this.pitch = this.roll = 0;
    this.yawRate = 0;
    this.tipped = 0;
    this.syncQuat();
  }

  update(dt, input, world) {
    this.boost = input.boost && input.throttle > 0;
    this.hoverT = clamp(this.hoverT + (this.hover ? dt : -dt) * 1.5, 0, 1);
    this.subT = clamp(this.subT + (this.sub ? dt : -dt) * 0.9, 0, 1);
    if (world) {
      world.collidersNear(this.pos.x, this.pos.z, this.col);
      this.decks.length = 0;
      for (const s of this.col.shapes) if (s.deck) this.decks.push(s);
    }
    this.surfaceGrip();

    const terrainH = heightAt(this.pos.x, this.pos.z);
    this.floating = !this.hover && !this.sub && terrainH < WATER_LEVEL - 0.85;
    if (this.sub) {
      this.ang.set(0, 0, 0);
      this.submarine(dt, input);
    } else if (this.hover || this.floating) {
      this.ang.set(0, 0, 0);
      this.arcade(dt, input, world);
    } else {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 8) { this.rigid(STEP, input); this.collide(); this.acc -= STEP; n++; }
      if (n === 8) this.acc = 0;
      this.readPose();
    }
    this.distance += Math.abs(this.speed) * dt;

    // Wheel contact heights (tracks, dust).
    const f = this.forward, r = this.right;
    for (let i = 0; i < 6; i++) {
      const [lx, lz] = WHEEL_POS[i];
      this.wheelGround[i] = this.ground(this.pos.x + r.x * lx + f.x * lz, this.pos.z + r.z * lx + f.z * lz, this.pos.y);
    }
  }

  // Grip and softness of the ground under the rover (once per frame).
  surfaceGrip() {
    const x = this.pos.x, z = this.pos.z;
    weightsAt(x, z, _W);
    const h = heightAt(x, z);
    const sand = _W[DESERT] + _W[CANYON] * (h < 20 ? 0.8 : 0.2);
    const snow = _W[MOUNTAIN] * clamp((h - 140) / 30, 0, 1);
    const mud = _W[WETLAND] * 0.8 + (h < 1.5 ? 0.5 : 0);
    let g = 0.88 - 0.3 * sand - 0.38 * snow - 0.35 * Math.min(1, mud);
    const road = roadMask(x, z);
    g = lerp(g, 1.0, road);
    this.grip = clamp(g, 0.45, 1.0);
    this.sand = clamp(sand * (1 - road), 0, 1);
  }

  readPose() {
    const e = this._e.setFromQuaternion(this.quat, 'YXZ');
    this.pitch = e.x; this.heading = e.y; this.roll = e.z;
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    const f = this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.right.set(f.z, 0, -f.x);
    this.speed = this.vel.x * f.x + this.vel.z * f.z;
    this.yawRate = -this.ang.y;
  }

  // --- Rigid body on wheels ----------------------------------------------------------------
  rigid(dt, input) {
    const q = this.quat;
    const up = _a.set(0, 1, 0).applyQuaternion(q);
    const fwd = _b.set(0, 0, 1).applyQuaternion(q);
    const com = _t.copy(COM).applyQuaternion(q).add(this.pos);
    const F = _F.set(0, -GRAVITY, 0), T = _T.set(0, 0, 0);
    const throttle = input.throttle;
    const fHoriz = Math.hypot(fwd.x, fwd.z) > 1e-3 ? _v.set(fwd.x, 0, fwd.z).normalize() : _v.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const vlong = this.vel.dot(fHoriz);

    // Engine: strongest at low speed, fading to zero at top speed.
    const maxF = 23 * (this.boost ? 1.55 : 1) * (1 - 0.35 * this.sand);
    let drive = 0;
    if (throttle > 0) drive = vlong < -0.5 ? 18 : 13 * (this.boost ? 1.6 : 1) * throttle * clamp(1 - vlong / maxF, -1, 1);
    else if (throttle < 0) drive = vlong > 0.5 ? -18 : 8 * throttle * clamp(1 + vlong / 9, 0, 1);
    const coast = throttle === 0;

    let contacts = 0;
    const M = _M, P = _P, r = _rr, n = _n;
    for (let i = 0; i < 6; i++) {
      const [lx, lz] = WHEEL_POS[i];
      M.set(lx, MOUNT_Y, lz).applyQuaternion(q).add(this.pos);
      const h = this.ground(M.x, M.z, M.y);
      this.groundNormal(M.x, M.z, M.y, h, n);
      const nu = n.dot(up);
      let L = L_MAX + 1;
      if (nu > 0.35) L = (n.y * (M.y - h)) / nu - WR / nu;
      if (L >= L_MAX) { this.wheelContact[i] = 0; this.prevLen[i] = L_MAX; this.wheelOff[i] = L_REST - L_MAX; continue; }
      contacts++;
      this.wheelContact[i] = 1;
      const Lc = Math.max(L, L_MIN);
      const dL = (Lc - this.prevLen[i]) / dt;
      this.prevLen[i] = Lc;
      this.wheelOff[i] = L_REST - Lc;
      const Fs = Math.max(0, K * (L_FREE - Lc) - DAMP * dL);
      // The ground only pushes along its own normal; everything tangential has to come from tyre grip.
      const N = Fs * nu;
      P.copy(up).multiplyScalar(-(Lc + WR)).add(M);
      r.subVectors(P, com);
      F.addScaledVector(n, N);
      T.add(_r.crossVectors(r, _f.copy(n).multiplyScalar(N)));

      // Tyre frame on the ground plane.
      const fw = _fw.copy(fwd).addScaledVector(n, -fwd.dot(n)).normalize();
      const side = _side.crossVectors(n, fw);
      const pv = _r.crossVectors(this.ang, r).add(this.vel);
      const vl = pv.dot(fw), vs = pv.dot(side);
      const share = 1 / 6;
      let fl = -vs * share / dt * 0.5; // lateral: kill sideways slip
      let fd;
      // Coasting: hold position when slow (parks on hills), gentle engine braking when moving.
      if (coast) fd = -vl * share * lerp(0.3 / dt, 0.6, clamp((Math.abs(vl) - 2) / 3, 0, 1));
      else fd = drive * share;
      fd -= vl * this.sand * 0.5 * share;
      // Drive can't push a wheel up a face steeper than ~40 degrees.
      if (!coast && fd * vl >= 0) fd *= clamp((n.y - 0.6) / 0.17, 0, 1);
      const lim = this.grip * 1.05 * N;
      const tot = Math.hypot(fl, fd);
      if (tot > lim) { fl *= lim / tot; fd *= lim / tot; }
      const fx = fw.x * fd + side.x * fl, fy = fw.y * fd + side.y * fl, fz = fw.z * fd + side.z * fl;
      F.x += fx; F.y += fy; F.z += fz;
      T.add(_r.crossVectors(r, _f.set(fx, fy, fz)));
    }
    this.grounded = contacts >= 2;

    // Integrate.
    this.vel.addScaledVector(F, dt);
    this.vel.multiplyScalar(Math.exp(-0.02 * dt));
    if (this.pos.y < WATER_LEVEL) this.vel.multiplyScalar(Math.exp(-0.9 * dt * clamp(-this.pos.y, 0, 1)));
    this.applyTorque(T, dt);

    // Steering: blend yaw rate about the body's up toward the driver's wish (keeps the old arcade feel).
    const sp = Math.abs(vlong);
    const want = -steerRate(input.steer, vlong, sp);
    if (contacts) {
      const wy = this.ang.dot(up);
      this.ang.addScaledVector(up, (want - wy) * Math.min(1, 9 * dt) * (contacts / 6));
    }
    this.ang.multiplyScalar(Math.exp(-(contacts ? 1.2 : 0.4) * dt));

    // Self-righting when tipped over for a while.
    if (up.y < 0.35) this.tipped += dt; else this.tipped = Math.max(0, this.tipped - dt);
    if (this.tipped > 1.5) {
      const axis = _k.set(-up.z, 0, up.x); // up x worldUp
      this.ang.addScaledVector(axis.normalize(), 8 * dt);
      this.vel.y += 6 * dt;
      if (this.tipped > 6) this.reset();
    }

    const comW = com;
    comW.addScaledVector(this.vel, dt);
    const w = this.ang;
    _q.set(w.x * dt * 0.5, w.y * dt * 0.5, w.z * dt * 0.5, 0).multiply(q);
    q.set(q.x + _q.x, q.y + _q.y, q.z + _q.z, q.w + _q.w).normalize();
    this.pos.copy(COM).applyQuaternion(q).negate().add(comW);

    this.contacts(dt);
  }

  applyTorque(T, dt) {
    _qi.copy(this.quat).invert();
    const tb = T.applyQuaternion(_qi);
    tb.set(tb.x * I_INV.x, tb.y * I_INV.y, tb.z * I_INV.z).applyQuaternion(this.quat);
    this.ang.addScaledVector(tb, dt);
  }

  // Inverse inertia (world) applied to v, in place.
  invI(v) {
    _qi.copy(this.quat).invert();
    v.applyQuaternion(_qi);
    v.set(v.x * I_INV.x, v.y * I_INV.y, v.z * I_INV.z);
    return v.applyQuaternion(this.quat);
  }

  // Hull points and wheel bottoms pushed out of the terrain, with an impulse that removes inward motion.
  contacts(dt) {
    const q = this.quat;
    const com = _c.copy(COM).applyQuaternion(q).add(this.pos);
    const P = _P, r = _rr, n = _n, pv = _fw, k = _k;
    const pts = HULL.length + 6;
    for (let i = 0; i < pts; i++) {
      let rad = 0;
      if (i < HULL.length) P.set(HULL[i][0], HULL[i][1], HULL[i][2]);
      else { const w = WHEEL_POS[i - HULL.length]; P.set(w[0], MOUNT_Y - L_MIN, w[1]); rad = WR * 0.95; }
      P.applyQuaternion(q).add(this.pos);
      const h = this.ground(P.x, P.z, P.y);
      if (P.y - h > rad * 3) continue;
      this.groundNormal(P.x, P.z, P.y, h, n);
      const pen = (h - P.y) * n.y + rad;
      if (pen <= 0) continue;
      // Positional fix (most of the penetration) along the ground normal.
      this.pos.addScaledVector(n, pen * 0.8);
      com.addScaledVector(n, pen * 0.8);
      r.subVectors(P, com);
      pv.crossVectors(this.ang, r).add(this.vel);
      const vn = pv.dot(n);
      if (vn >= 0) continue;
      const rn = k.crossVectors(r, n);
      const eff = 1 + this.invI(rn).cross(r).dot(n);
      const j = -1.15 * vn / eff;
      if (vn < -8 && rad === 0) this.bump = Math.max(this.bump, Math.min(1, -vn / 20));
      // Friction against the tangential slide (hull scraping), limited by the normal impulse.
      const vt = pv.addScaledVector(n, -vn);
      const vtl = vt.length();
      const J = n.multiplyScalar(j);
      if (vtl > 1e-3) J.addScaledVector(vt, -Math.min(0.5 * j, vtl / eff) / vtl);
      this.vel.add(J);
      this.ang.add(this.invI(k.crossVectors(r, J)));
    }
  }

  // Can the rover seal up and dive here?
  canDive() { return !this.sub && heightAt(this.pos.x, this.pos.z) < WATER_LEVEL - 3.5 && this.pos.y < WATER_LEVEL + 2.5; }

  // --- Submarine: neutral buoyancy, gentle 3D handling, follows the sea floor, surfaces in the shallows ----
  submarine(dt, input) {
    const f = this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const r = this.right.set(f.z, 0, -f.x);
    let fs = this.vel.x * f.x + this.vel.z * f.z, ls = this.vel.x * r.x + this.vel.z * r.z;
    const maxF = 14 * (this.boost ? 1.4 : 1);
    if (input.throttle > 0) fs += 6 * input.throttle * (this.boost ? 1.4 : 1) * dt;
    else if (input.throttle < 0) fs += (fs > 0 ? 10 : 4) * input.throttle * dt;
    fs = clamp(fs, -5, maxF);
    fs -= fs * (input.throttle === 0 ? 0.5 : 0.12) * dt;
    ls *= Math.exp(-2.2 * dt);
    this.speed = fs;
    this.yawRate = lerp(this.yawRate, input.steer * 0.9 * (0.35 + 0.65 * clamp(Math.abs(fs) / 4, 0, 1)), 1 - Math.exp(-4 * dt));
    this.heading -= this.yawRate * dt;
    this.vel.x = f.x * fs + r.x * ls; this.vel.z = f.z * fs + r.z * ls;
    // Rise / dive (with a little auto-trim back to neutral).
    this.vel.y = lerp(this.vel.y, (input.dive || 0) * 4.5, 1 - Math.exp(-2.5 * dt));
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const floorAhead = heightAt(nx, nz) + 1.7;
    const ceil = WATER_LEVEL - 0.9;
    // A wall of rock or a shore too high to pass under the surface: slide along instead of through.
    if (floorAhead > ceil) { nx = this.pos.x; nz = this.pos.z; this.vel.x *= -0.2; this.vel.z *= -0.2; this.bump = Math.max(this.bump, 0.3); }
    this.pos.x = nx; this.pos.z = nz;
    const floor = heightAt(this.pos.x, this.pos.z) + 1.7;
    let ny = this.pos.y + this.vel.y * dt;
    if (ny < floor) { ny = lerp(ny, floor, 1 - Math.exp(-12 * dt)); this.vel.y = Math.max(this.vel.y, 0); }
    if (ny > ceil) { ny = ceil + Math.sin(performance.now() * 0.002) * 0.06; this.vel.y = Math.min(this.vel.y, 0); }
    this.pos.y = ny;
    this.depth = Math.max(0, WATER_LEVEL - this.pos.y);
    this.collide();
    // Ran aground in the shallows: back to wheels/floating.
    if (floor > ceil - 0.3 && this.pos.y >= ceil - 0.2) this.sub = false;
    this.grounded = true;
    this.pitch = lerp(this.pitch, -clamp(this.vel.y * 0.08, -0.35, 0.35), 1 - Math.exp(-3 * dt));
    this.roll = lerp(this.roll, -this.yawRate * 0.25, 1 - Math.exp(-3 * dt));
    this.syncQuat();
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    for (let i = 0; i < 6; i++) { this.wheelOff[i] = -0.25; this.wheelContact[i] = 0; }
  }

  // --- Hover / floating: forgiving arcade model ---------------------------------------------
  arcade(dt, input, world) {
    const throttle = input.throttle, steer = input.steer;
    const f = this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const r = this.right.set(f.z, 0, -f.x);
    const px = this.pos.x, pz = this.pos.z;
    const s = (lx, lz) => this.surface(px + r.x * lx + f.x * lz, pz + r.z * lx + f.z * lz);
    const hFL = s(-HALF_W, HALF_L), hFR = s(HALF_W, HALF_L), hBL = s(-HALF_W, -HALF_L), hBR = s(HALF_W, -HALF_L);
    const ground = (hFL + hFR + hBL + hBR) * 0.25;

    let fs = this.vel.x * f.x + this.vel.z * f.z;
    let ls = this.vel.x * r.x + this.vel.z * r.z;
    const maxF = (this.floating ? 9 : 30) * (this.boost ? 1.55 : 1);
    const accel = this.hover ? 11 : 10;
    if (throttle > 0) fs += (fs < 0 ? 18 : accel * (this.boost ? 1.6 : 1)) * throttle * dt;
    else if (throttle < 0) fs += (fs > 0 ? 18 : 7) * throttle * dt;
    fs = clamp(fs, -9, maxF + Math.max(0, fs - maxF) * 0.9);
    if (fs > maxF) fs = lerp(fs, maxF, dt * 1.5);
    fs -= fs * (throttle === 0 ? 0.6 : 0.08) * dt;
    ls *= Math.exp(-(this.hover ? 1.4 : 2.5) * dt);
    this.speed = fs;

    const sp = Math.abs(fs);
    this.yawRate = lerp(this.yawRate, steerRate(steer, fs, sp), 1 - Math.exp(-6 * dt));
    this.heading -= this.yawRate * dt;
    this.vel.x = f.x * fs + r.x * ls;
    this.vel.z = f.z * fs + r.z * ls;

    const prevY = this.pos.y;
    this.vel.y -= GRAVITY * dt;
    let ny = prevY + this.vel.y * dt;
    if (ny <= ground) { ny = ground; this.vel.y = clamp((ground - prevY) / Math.max(dt, 1e-3), -30, 9); }
    const bob = Math.sin(performance.now() * 0.002) * (this.hover ? 0.12 : 0.08);
    ny = Math.max(ny, ground + bob);
    this.grounded = true;
    this.pos.y = ny;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.collide();

    const tp = this.floating ? 0 : Math.atan2((hFL + hFR) - (hBL + hBR), HALF_L * 4);
    const tr = this.floating ? 0 : Math.atan2((hFR + hBR) - (hFL + hBL), HALF_W * 4);
    const k = 1 - Math.exp(-10 * dt);
    this.pitch = lerp(this.pitch, -tp, k);
    this.roll = lerp(this.roll, tr + (this.hover ? -this.yawRate * 0.15 : 0), k);
    this.syncQuat();
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    for (let i = 0; i < 6; i++) { this.wheelOff[i] = -0.25; this.wheelContact[i] = 0; }
  }

  // Trees (circles) and ruins (circles / oriented boxes), using the colliders gathered this frame.
  collide() {
    const c = this.col;
    const R = RADIUS;
    for (let i = 0; i < c.circles.length; i += 3) {
      const dx = this.pos.x - c.circles[i], dz = this.pos.z - c.circles[i + 1];
      const min = R + c.circles[i + 2];
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) this.pushOut(dx, dz, Math.sqrt(d2), min);
    }
    for (const sh of c.shapes) {
      if (sh.deck) continue;
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
      this.ang.multiplyScalar(0.7);
    }
  }
}

// Responsive at low speed, gentler when fast.
function steerRate(steer, fs, sp) {
  return steer * 1.15 * clamp(sp / 5, 0, 1) * (1 - 0.45 * clamp(sp / 32, 0, 1)) * Math.sign(fs || 1);
}

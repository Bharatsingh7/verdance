// The explorer rover: model, wheel suspension/steering/hover-fold animation, headlights and glow accents.
import * as THREE from 'three';
import { Builder } from '../world/models.js';
import { clamp, lerp } from '../core/rng.js';

const WHEELS = [[-1.55, 2.1], [1.55, 2.1], [-1.55, 0], [1.55, 0], [-1.55, -2.1], [1.55, -2.1]];
const WR = 0.72;

const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s, 1);

const WHITE = 0xe9e4d8, CREAM = 0xd6cfbf, DARK = 0x353a40, ORANGE = 0xe57f3a, GLASS = 0x22394a;

export class Truck {
  constructor(scene) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);

    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.litMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.25 });
    const mats = [this.litMat, this.glowMat];

    const b = new Builder();
    b.add(box(2.7, 0.5, 5.9), DARK, 0, 1.1, 0)
      .add(box(3.0, 0.95, 5.5), WHITE, 0, 1.75, 0)
      .add(box(3.08, 0.2, 5.56), ORANGE, 0, 2.05, 0)
      .add(box(2.8, 1.05, 1.7), WHITE, 0, 2.75, 1.25)
      .add(box(2.62, 0.9, 0.12), GLASS, 0, 2.7, 2.2, -0.55, 0, 0)
      .add(box(0.08, 0.7, 1.2), GLASS, 1.41, 2.78, 1.25)
      .add(box(0.08, 0.7, 1.2), GLASS, -1.41, 2.78, 1.25)
      .add(box(2.9, 1.35, 3.1), CREAM, 0, 2.88, -1.15)
      .add(box(2.95, 0.14, 3.15), ORANGE, 0, 3.0, -1.15)
      .add(box(2.4, 0.08, 2.5), 0x2b3f68, 0, 3.6, -1.2, 0.06, 0, 0)
      .add(box(2.5, 0.1, 0.05), 0x99a8c0, 0, 3.6, -1.2)
      .add(box(3.15, 0.38, 0.45), DARK, 0, 1.3, 2.85)
      .add(box(3.1, 0.38, 0.4), DARK, 0, 1.3, -2.85)
      .add(box(0.3, 0.6, 0.6), DARK, 1.1, 2.0, -3.0)
      .add(cyl(0.5, 0.12, 0.35, 10), 0xcfd5db, 0.7, 3.85, -2.2, 0.5, 0, 0)
      .add(cyl(0.05, 0.05, 0.5, 4), DARK, 0.7, 3.75, -2.2)
      .add(box(0.6, 0.5, 1.2), DARK, -1.6, 2.1, -1.4)
      .add(box(0.1, 1.3, 0.1), DARK, 1.0, 3.4, 1.9)
      .add(box(0.1, 1.3, 0.1), DARK, -1.0, 3.4, 1.9);
    for (const [x, z] of WHEELS) b.add(box(0.75, 0.25, 1.6), DARK, x * 1.02, 1.62, z);
    // Glow parts: headlights, light bar, side strips, tail lights.
    b.add(box(0.55, 0.22, 0.08), 0xfff2d0, 1.05, 1.85, 2.77, 0, 0, 0, 1, 1, 1, { glow: 1 })
      .add(box(0.55, 0.22, 0.08), 0xfff2d0, -1.05, 1.85, 2.77, 0, 0, 0, 1, 1, 1, { glow: 1 })
      .add(box(2.1, 0.16, 0.22), 0xffd88a, 0, 4.05, 1.9, 0, 0, 0, 1, 1, 1, { glow: 1 })
      .add(box(0.05, 0.1, 4.8), 0x6ff5dc, 1.52, 1.5, 0, 0, 0, 0, 1, 1, 1, { glow: 1 })
      .add(box(0.05, 0.1, 4.8), 0x6ff5dc, -1.52, 1.5, 0, 0, 0, 0, 1, 1, 1, { glow: 1 })
      .add(box(0.5, 0.15, 0.06), 0xff5a4a, 1.1, 1.85, -2.79, 0, 0, 0, 1, 1, 1, { glow: 1 })
      .add(box(0.5, 0.15, 0.06), 0xff5a4a, -1.1, 1.85, -2.79, 0, 0, 0, 1, 1, 1, { glow: 1 });
    this.hull = new THREE.Mesh(b.build(), mats);
    this.hull.castShadow = true;
    this.body.add(this.hull);

    // Antenna with a soft wobble.
    this.antenna = new THREE.Group();
    this.antenna.position.set(-1.1, 3.55, -2.3);
    const ab = new Builder().add(cyl(0.03, 0.05, 2.2, 4), DARK, 0, 1.1, 0).add(new THREE.OctahedronGeometry(0.12), 0x6ff5dc, 0, 2.25, 0, 0, 0, 0, 1, 1, 1, { glow: 1 });
    this.antenna.add(new THREE.Mesh(ab.build(), mats));
    this.body.add(this.antenna);
    this.antWob = new THREE.Vector2(); this.antVel = new THREE.Vector2();

    // Wheels: pivot (steer/fold) > spinner.
    // Chunky treaded tyre with a five-spoke rim, so rolling is clearly visible.
    const wb = new Builder()
      .add(cyl(WR - 0.06, WR - 0.06, 0.6, 20), 0x2a2a2c, 0, 0, 0, 0, 0, Math.PI / 2)
      .add(cyl(0.46, 0.46, 0.64, 16), 0x1c1c1e, 0, 0, 0, 0, 0, Math.PI / 2)
      .add(cyl(0.4, 0.4, 0.66, 16), 0x9aa2aa, 0, 0, 0, 0, 0, Math.PI / 2)
      .add(cyl(0.12, 0.12, 0.7, 8), 0x4a4f55, 0, 0, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      // alternating chevron lugs
      wb.add(box(0.26, 0.1, 0.2), 0x232325, (i % 2 ? 0.14 : -0.14), Math.cos(a) * (WR - 0.03), Math.sin(a) * (WR - 0.03), a, 0, 0);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      for (const sx of [-0.34, 0.34]) wb.add(box(0.04, 0.3, 0.08), 0x5a6068, sx, Math.cos(a) * 0.22, Math.sin(a) * 0.22, a, 0, 0);
    }
    for (const sx of [-0.335, 0.335]) wb.add(new THREE.TorusGeometry(0.43, 0.02, 4, 24), 0x6ff5dc, sx, 0, 0, 0, Math.PI / 2, 0, 1, 1, 1, { glow: 1 });
    const wg = wb.build();
    const armGeo = new THREE.BoxGeometry(1, 0.16, 0.22);
    this.armMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.6 });
    this.wheels = WHEELS.map(([x, z], i) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, WR, z);
      const spin = new THREE.Mesh(wg, mats);
      spin.castShadow = true;
      pivot.add(spin);
      this.root.add(pivot);
      // Suspension arm from the chassis to the hub.
      const arm = new THREE.Mesh(armGeo, this.armMat);
      arm.castShadow = true;
      this.root.add(arm);
      return { pivot, spin, arm, x, z, susp: 0, side: Math.sign(x), front: z > 1, rear: z < -1, idx: i };
    });

    // Hover thrusters glow (visible when wheels fold).
    this.thrust = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), new THREE.MeshBasicMaterial({ color: 0x6ff5dc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.thrust.rotation.x = Math.PI / 2;
    this.thrust.position.y = 0.6;
    this.thrust.scale.set(1.4, 2.6, 1);
    this.root.add(this.thrust);

    // Submarine kit: a glass canopy that closes over the cab, twin props and ballast lights.
    this.canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xbfe8f0, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    this.canopy.position.set(0, 2.2, -0.2);
    this.canopy.visible = false;
    this.body.add(this.canopy);
    this.props = [];
    for (const x of [-1.15, 1.15]) {
      const blades = new THREE.Group();
      for (let i = 0; i < 3; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.04), this.litMat); bl.position.y = 0.32; const h = new THREE.Group(); h.rotation.z = (i / 3) * Math.PI * 2; h.add(bl); blades.add(h); }
      blades.position.set(0, 0, -0.42);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color: 0x6ff5dc }));
      ring.position.set(0, 0, -0.42);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.5, 10).rotateX(Math.PI / 2), this.litMat), blades, ring);
      g.position.set(x, 1.4, -3.0);
      g.scale.setScalar(0.001);
      this.body.add(g);
      this.props.push({ g, blades });
    }
    this.ballast = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0x6ff5dc }));
    this.ballast.position.set(0, 0.95, 0);
    this.ballast.visible = false;
    this.body.add(this.ballast);

    // Headlights.
    this.head = new THREE.SpotLight(0xfff0d0, 0, 90, 0.55, 0.5, 1.2);
    this.head.position.set(0, 2.2, 2.6);
    this.head.target.position.set(0, 0, 30);
    this.root.add(this.head, this.head.target);
    this.headOn = false;
    this.headLevel = 0;
    this.time = 0;
  }

  update(dt, v, night, steer) {
    this.time += dt;
    this.root.position.copy(v.pos);
    this.root.quaternion.copy(v.quat);

    // Body bob from vertical acceleration.
    const target = clamp(-v.vel.y * 0.015, -0.12, 0.12) + Math.sin(this.time * 2) * 0.01 * v.hoverT;
    this.body.position.y = lerp(this.body.position.y, target, 1 - Math.exp(-8 * dt));
    this.body.rotation.z = lerp(this.body.rotation.z, -v.yawRate * Math.abs(v.speed) * 0.004, 1 - Math.exp(-5 * dt));

    // Wheels: suspension, steering, spin, fold when hovering.
    const ht = Math.max(v.hoverT, v.subT), fold = ht * ht * (3 - 2 * ht);
    for (const w of this.wheels) {
      // Each tyre reaches for the ground under it (only droops when really airborne).
      const off = v.floating || v.hover ? -0.25 : v.wheelOff[w.idx];
      w.susp = lerp(w.susp, off, 1 - Math.exp(-(off > w.susp ? 40 : 20) * dt));
      w.pivot.position.y = WR + w.susp * (1 - fold) + fold * 0.6;
      w.pivot.position.x = w.x * (1 - fold * 0.15);
      w.pivot.rotation.y = (w.front ? steer * 0.42 : w.rear ? -steer * 0.18 : 0) * (1 - fold);
      w.pivot.rotation.z = w.side * fold * Math.PI / 2;
      w.spin.rotation.x += (v.speed / WR) * dt * (1 - fold) + dt * 6 * fold;
      // arm: from chassis (x*0.55, 1.25) to the hub
      const ax = w.x * 0.55, ay = 1.25, hx = w.pivot.position.x - w.side * 0.25, hy = w.pivot.position.y;
      const dx = hx - ax, dy = hy - ay;
      w.arm.position.set((ax + hx) / 2, (ay + hy) / 2, w.z);
      w.arm.scale.x = Math.hypot(dx, dy);
      w.arm.rotation.z = Math.atan2(dy, dx);
      w.arm.visible = fold < 0.5;
    }
    this.thrust.material.opacity = v.hoverT * v.hoverT * (3 - 2 * v.hoverT) * (0.35 + 0.1 * Math.sin(this.time * 12));
    // Sub kit slides into place.
    const st = v.subT * v.subT * (3 - 2 * v.subT);
    this.canopy.visible = st > 0.02;
    this.canopy.scale.set(1.75 * st, 1.5 * st, 3.3 * st);
    this.ballast.visible = st > 0.5;
    this.ballast.material.color.setHSL(0.47, 0.8, 0.45 + 0.15 * Math.sin(this.time * 3));
    for (const p of this.props) { p.g.scale.setScalar(Math.max(0.001, st)); p.blades.rotation.z += dt * (2 + Math.abs(v.speed) * 2.2) * st; }

    // Antenna spring.
    const ax = -v.yawRate * 0.4, az = clamp(-(v.speed - (this._lastSpeed ?? v.speed)) / Math.max(dt, 1e-3) * 0.02, -0.5, 0.5);
    this._lastSpeed = v.speed;
    this.antVel.x += (ax - this.antWob.x) * 60 * dt - this.antVel.x * 4 * dt;
    this.antVel.y += (az - this.antWob.y) * 60 * dt - this.antVel.y * 4 * dt;
    this.antWob.addScaledVector(this.antVel, dt);
    this.antenna.rotation.set(this.antWob.y, 0, this.antWob.x);

    // Headlights fade with night (or forced on).
    const want = this.headOn || night || (v.sub && v.depth > 5) ? 1 : 0;
    this.headLevel = lerp(this.headLevel, want, 1 - Math.exp(-3 * dt));
    this.head.intensity = this.headLevel * 900;
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 2.2);
    this.glowMat.color.setScalar(0.75 + 0.25 * pulse * (0.6 + 0.4 * this.headLevel));
  }
}

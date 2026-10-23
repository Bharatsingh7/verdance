// Sky, sun/moon, stars, clouds, lights, fog and image-based lighting, driven by a slow day/night cycle.
import * as THREE from 'three';
import { mulberry32, smoothstep } from '../core/rng.js';
import { cloudTexture } from '../world/textures.js';

// [time, zenith, horizon, sunset glow, sunColor, sunIntensity, glowAmount, hemiSky, hemiGround]
const KEYS = [
  [0.0, 0x050b1e, 0x16233f, 0x1a2440, 0x8fa8ff, 0.0, 0.0, 0x26345a, 0x0e1118],
  [0.2, 0x08112a, 0x1d2b4c, 0x30304a, 0x8fa8ff, 0.0, 0.1, 0x2a3860, 0x10131c],
  [0.245, 0x2b4170, 0xd99a7a, 0xff8a4a, 0xff9a5a, 0.6, 1.0, 0x8a8aa8, 0x4a3c30],
  [0.3, 0x3f78c0, 0xf2cfae, 0xffb070, 0xffd8a8, 2.2, 0.55, 0xa8c4e8, 0x5c5a40],
  [0.4, 0x2f6fc4, 0xc9dff0, 0xffe0b0, 0xfff1dc, 3.0, 0.1, 0xb8d4f0, 0x666448],
  [0.6, 0x2f6fc4, 0xc9dff0, 0xffe0b0, 0xfff1dc, 3.0, 0.1, 0xb8d4f0, 0x666448],
  [0.7, 0x3c6fb8, 0xf0d2b0, 0xffa060, 0xffd0a0, 2.2, 0.6, 0xa8c0e0, 0x5c5040],
  [0.755, 0x283a6a, 0xe08a68, 0xff6a3a, 0xff7a4a, 0.6, 1.0, 0x8a7a98, 0x4a3430],
  [0.8, 0x08112a, 0x1d2b4c, 0x30304a, 0x8fa8ff, 0.0, 0.1, 0x2a3860, 0x10131c],
  [1.0, 0x050b1e, 0x16233f, 0x1a2440, 0x8fa8ff, 0.0, 0.0, 0x26345a, 0x0e1118],
];
const SCALAR = new Set([5, 6]);
const ca = new THREE.Color(), cb = new THREE.Color();
function key(t, idx, out) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const f = smoothstep(0, 1, (t - a[0]) / (b[0] - a[0]));
      if (SCALAR.has(idx)) return a[idx] + (b[idx] - a[idx]) * f;
      return out.copy(ca.setHex(a[idx])).lerp(cb.setHex(b[idx]), f);
    }
  }
  return out;
}
const MOON = new THREE.Color(0x9fb4ff);
const UP = new THREE.Vector3(0, 1, 0);

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FS = `uniform vec3 uZenith, uHorizon, uGlow, uSunColor, uSun; uniform float uNight, uGlowAmt;
  varying vec3 vDir;
  void main(){
    vec3 d = normalize(vDir);
    float h = d.y, hp = max(h, 0.0);
    float s = max(dot(d, uSun), 0.0);
    vec3 col = mix(uHorizon, uZenith, pow(hp, 0.42));
    col = mix(col, uHorizon * 1.06, exp(-hp * 16.0) * 0.6);
    // Sunset glow concentrated toward the sun's side of the sky, low on the horizon.
    float side = pow(max(dot(normalize(d.xz + 1e-4), normalize(uSun.xz + 1e-4)), 0.0), 2.0);
    col = mix(col, uGlow, uGlowAmt * (pow(s, 4.0) * 0.8 + side * 0.45) * exp(-hp * 5.5));
    // Sun disc + halo.
    col += uSunColor * (smoothstep(0.9994, 0.9998, s) * 18.0 + pow(s, 90.0) * 0.6 + pow(s, 8.0) * 0.08) * (1.0 - uNight);
    // Moon (opposite the sun).
    float m = max(dot(d, -uSun), 0.0);
    col += vec3(0.9, 0.93, 1.0) * (smoothstep(0.99955, 0.9997, m) * 2.5 + pow(m, 60.0) * 0.12) * uNight;
    col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.2, h));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 0.3; // 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset
    this.dayLength = 1200;
    this.sunDir = new THREE.Vector3();
    this.horizon = new THREE.Color();
    this.biomeFog = new THREE.Color(0xcfe0d8);
    this.fogDensity = 1;
    this.under = 0; this.underDepth = 0; this.underFar = 80;
    this.daylight = 1;

    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: this.horizon }, uGlow: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() }, uSun: { value: this.sunDir }, uNight: { value: 0 }, uGlowAmt: { value: 0 },
    };
    // Drawn first with no depth test: everything else simply paints over it.
    const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms: this.uniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2800, 48, 24), skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // Environment lighting rendered from a small copy of the sky (no tone mapping there).
    const envMat = skyMat.clone(); envMat.uniforms = this.uniforms;
    envMat.fragmentShader = SKY_FS.replace('#include <tonemapping_fragment>', '').replace('#include <colorspace_fragment>', '');
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envMat));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null; this.envTime = -1; this.envCooldown = 0;

    // Stars
    const rnd = mulberry32(5);
    const sp = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      sp[i * 3] = Math.cos(a) * r * 2600; sp[i * 3 + 1] = Math.abs(u) * 2600; sp[i * 3 + 2] = Math.sin(a) * r * 2600;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    // Lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 900;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.5;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);

    // Clouds: clusters of soft sprites.
    this.cloudMat = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
    this.clouds = [];
    for (let i = 0; i < 55; i++) {
      const g = new THREE.Group();
      const c = { g, x: (rnd() - 0.5) * 5000, z: (rnd() - 0.5) * 5000, y: 420 + rnd() * 200 };
      const n = 3 + Math.floor(rnd() * 3), s = 140 + rnd() * 160;
      for (let k = 0; k < n; k++) {
        const sp2 = new THREE.Sprite(this.cloudMat);
        sp2.position.set((k - n / 2) * s * 0.4 + rnd() * 30, rnd() * 25, rnd() * 60);
        sp2.scale.set(s * (0.8 + rnd() * 0.5), s * 0.55, 1);
        g.add(sp2);
      }
      g.renderOrder = -5;
      scene.add(g);
      this.clouds.push(c);
    }

    scene.fog = new THREE.Fog(0xcfe0d8, 200, 1400);
    this._sunCol = new THREE.Color(); this._hs = new THREE.Color(); this._hg = new THREE.Color(); this._fog = new THREE.Color(); this._v = new THREE.Vector3(); this._lx = new THREE.Vector3(); this._ly = new THREE.Vector3(); this._c = new THREE.Vector3();
  }

  get hours() { return (this.time * 24) % 24; }
  get isNight() { return this.daylight < 0.25; }

  update(dt, camera, focus, viewRadius) {
    this.time = (this.time + dt / this.dayLength) % 1;
    const t = this.time;
    const ang = (t - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(ang) * 0.8, Math.sin(ang), 0.45).normalize();

    const U = this.uniforms;
    key(t, 1, U.uZenith.value); key(t, 2, this.horizon); key(t, 3, U.uGlow.value); key(t, 4, this._sunCol);
    const sunI = key(t, 5); U.uGlowAmt.value = key(t, 6);
    key(t, 7, this._hs); key(t, 8, this._hg);
    U.uSunColor.value.copy(this._sunCol);
    this.daylight = Math.min(1, sunI / 2.2);
    const night = 1 - smoothstep(0.0, 0.3, this.daylight);
    U.uNight.value = night;
    this.stars.material.opacity = night * 0.85;

    const up = this.sunDir.y > -0.03;
    const L = up ? this.sunDir : this._v.copy(this.sunDir).negate();
    this.sun.color.copy(up ? this._sunCol : MOON);
    this.sun.intensity = up ? sunI * 1.25 : 0.35;
    this.hemi.color.copy(this._hs); this.hemi.groundColor.copy(this._hg);
    this.hemi.intensity = 0.3 + 0.3 * night;
    this.scene.environmentIntensity = 0.45 + 0.25 * this.daylight;
    // Snap the shadow frustum to whole shadow-map texels in light space, so shadows don't shimmer as you move.
    const sc = this.sun.shadow.camera;
    const texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
    const lx = this._lx.crossVectors(UP, L).normalize(), ly = this._ly.crossVectors(L, lx);
    const px = focus.dot(lx), py = focus.dot(ly);
    this._c.copy(focus).addScaledVector(lx, Math.round(px / texel) * texel - px).addScaledVector(ly, Math.round(py / texel) * texel - py);
    this.sun.target.position.copy(this._c);
    this.sun.position.copy(this._c).addScaledVector(L, 400);

    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.stars.rotation.y = t * Math.PI * 2;

    // Re-bake the environment when the sky has changed enough (throttled).
    this.envCooldown -= dt;
    const dtEnv = Math.abs(t - this.envTime);
    if ((this.envTime < 0 || Math.min(dtEnv, 1 - dtEnv) > 0.008) && this.envCooldown <= 0) {
      const rt = this.pmrem.fromScene(this.envScene, 0.02, 1, 200);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
      this.envTime = t; this.envCooldown = 2;
    }

    // Fog: horizon colour blended with the current biome's mood.
    this._fog.copy(this.biomeFog).multiplyScalar(0.15 + 0.85 * this.daylight).lerp(this.horizon, 0.55);
    this.scene.fog.color.copy(this._fog);
    const far = viewRadius * (0.75 + 0.25 * this.fogDensity);
    this.scene.fog.far = far;
    this.scene.fog.near = far * (0.05 + 0.2 * this.fogDensity);
    // Under water: a short blue-green fog that darkens with depth; the sky is hidden.
    const uw = this.under > 0;
    if (uw) {
      const k = Math.exp(-this.underDepth / 32) * (0.2 + 0.8 * this.daylight);
      this.scene.fog.color.setRGB(0.035 * k + 0.003, 0.2 * k + 0.008, 0.23 * k + 0.012);
      this.scene.fog.near = 1;
      this.scene.fog.far = this.underFar * (0.55 + 0.45 * Math.exp(-this.underDepth / 40));
      this.scene.environmentIntensity *= 0.5;
    }
    this.sky.visible = this.stars.visible = !uw;
    // (with the sky hidden, anything past the water planes would show the black clear colour)
    this.scene.background = uw ? this.scene.fog.color : null;
    for (const c of this.clouds) c.g.visible = !uw;

    // Clouds drift and wrap around the camera; tinted by the hour.
    this.cloudMat.color.copy(U.uGlow.value).lerp(this._hs.set(0xffffff), 0.35 + 0.6 * (1 - U.uGlowAmt.value)).multiplyScalar(0.12 + 0.95 * this.daylight);
    for (const c of this.clouds) {
      c.x += dt * 4;
      const dx = c.x - camera.position.x; if (dx > 2500) c.x -= 5000; else if (dx < -2500) c.x += 5000;
      const dz = c.z - camera.position.z; if (dz > 2500) c.z -= 5000; else if (dz < -2500) c.z += 5000;
      c.g.position.set(c.x, c.y, c.z);
    }
  }

  setShadowQuality(level) {
    this.sun.castShadow = level > 0;
    const s = level >= 2 ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== s) {
      this.sun.shadow.mapSize.set(s, s);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }
}

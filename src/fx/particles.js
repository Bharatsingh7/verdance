// Ambient particle layers that wrap around the camera. All motion is computed on the GPU.
import * as THREE from 'three';
import { mulberry32, smoothstep } from '../core/rng.js';
import { makeNoise2D } from '../core/noise.js';
import { MEADOW, FOREST, RAINFOREST, DESERT, CANYON, MOUNTAIN, WETLAND } from '../world/biomes.js';

const LAYERS = {
  pollen:    { n: 500, box: [90, 30, 90], size: 3.5, color: 0xfff6d8, fall: -0.15, drift: [0.6, 0.3], turb: 1.2, shape: 0, blink: 0 },
  leaves:    { n: 260, box: [80, 30, 80], size: 7, color: 0xd8a04a, fall: 0.9, drift: [0.8, 0.2], turb: 1.5, shape: 1, blink: 0 },
  rain:      { n: 1600, box: [70, 40, 70], size: 14, color: 0xcfe2ee, fall: 26, drift: [1.5, 0.5], turb: 0, shape: 2, blink: 0 },
  dust:      { n: 500, box: [100, 25, 100], size: 3, color: 0xf0d8b0, fall: 0.05, drift: [5, 1.5], turb: 0.8, shape: 0, blink: 0 },
  snow:      { n: 1000, box: [80, 40, 80], size: 4.5, color: 0xffffff, fall: 2.2, drift: [1, 0.4], turb: 0.8, shape: 0, blink: 0 },
  fireflies: { n: 260, box: [70, 12, 70], size: 6, color: 0xd8ff7a, fall: 0, drift: [0, 0], turb: 2.0, shape: 0, blink: 1 },
};

const vert = `
  attribute float aSeed;
  uniform float uTime, uSize, uFall, uTurb, uPixel;
  uniform vec2 uDrift;
  uniform vec3 uCam, uBox;
  varying float vSeed;
  void main(){
    vSeed = aSeed;
    vec3 p = position;
    p.x += uDrift.x * uTime + sin(uTime * 0.7 + aSeed * 6.28) * uTurb;
    p.z += uDrift.y * uTime + cos(uTime * 0.6 + aSeed * 12.0) * uTurb;
    p.y -= uFall * uTime + sin(uTime * 0.9 + aSeed * 3.0) * uTurb * 0.5;
    p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixel * (60.0 / max(1.0, -mv.z));
  }`;

const frag = `
  uniform vec3 uColor; uniform float uOpacity, uTime, uBlink; uniform int uShape;
  varying float vSeed;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float a;
    if (uShape == 2) a = smoothstep(0.08, 0.0, abs(c.x)) * smoothstep(0.5, 0.2, abs(c.y));
    else if (uShape == 1) { a = smoothstep(0.5, 0.35, length(c * vec2(1.0, 2.2))); }
    else a = smoothstep(0.5, 0.1, length(c));
    float b = mix(1.0, smoothstep(0.2, 1.0, sin(uTime * (1.0 + vSeed * 2.0) + vSeed * 40.0)), uBlink);
    vec3 col = uColor;
    if (uShape == 1) col = mix(uColor, vec3(0.55, 0.7, 0.3), step(0.5, fract(vSeed * 7.0)));
    gl_FragColor = vec4(col, a * uOpacity * b);
    if (gl_FragColor.a < 0.01) discard;
  }`;

export class Particles {
  constructor(scene) {
    this.layers = {};
    const rnd = mulberry32(99);
    this.time = { value: 0 };
    this.cam = { value: new THREE.Vector3() };
    this.pixel = { value: Math.min(devicePixelRatio, 2) };
    for (const [name, L] of Object.entries(LAYERS)) {
      const pos = new Float32Array(L.n * 3), seed = new Float32Array(L.n);
      for (let i = 0; i < L.n; i++) {
        pos[i * 3] = (rnd() - 0.5) * L.box[0]; pos[i * 3 + 1] = (rnd() - 0.5) * L.box[1]; pos[i * 3 + 2] = (rnd() - 0.5) * L.box[2];
        seed[i] = rnd();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const m = new THREE.ShaderMaterial({
        vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
        blending: name === 'fireflies' ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: {
          uTime: this.time, uCam: this.cam, uPixel: this.pixel,
          uSize: { value: L.size }, uFall: { value: L.fall }, uTurb: { value: L.turb }, uDrift: { value: new THREE.Vector2(...L.drift) },
          uBox: { value: new THREE.Vector3(...L.box) }, uColor: { value: new THREE.Color(L.color) },
          uOpacity: { value: 0 }, uBlink: { value: L.blink }, uShape: { value: L.shape },
        },
      });
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      pts.visible = false;
      scene.add(pts);
      this.layers[name] = { pts, m, level: 0 };
    }
    this.rainNoise = makeNoise2D(31);
    this.raining = 0;
  }

  update(dt, camera, W, env) {
    this.time.value += dt;
    this.cam.value.copy(camera.position);
    const t = this.time.value;
    const day = env.daylight, night = 1 - smoothstep(0.1, 0.5, day);
    const alt = camera.position.y;
    // Rain comes and goes in the rainforest (and lightly elsewhere green).
    const rainCycle = smoothstep(0.0, 0.35, this.rainNoise(t / 240, 0.5));
    this.raining = rainCycle * (W[RAINFOREST] + W[WETLAND] * 0.3 + W[FOREST] * 0.15);
    const valley = env.valley;
    const target = {
      pollen: (W[MEADOW] * 0.9 + W[WETLAND] * 0.3 + (valley?.id === 'starfield' || valley?.id === 'glass' ? 1 : 0)) * day,
      leaves: W[FOREST] * 0.9 + W[RAINFOREST] * 0.2,
      rain: this.raining,
      dust: (W[DESERT] + W[CANYON] * 0.8) * (0.4 + 0.6 * day),
      snow: W[MOUNTAIN] * smoothstep(120, 170, alt),
      fireflies: night * (W[MEADOW] + W[FOREST] + W[WETLAND] * 1.5 + W[RAINFOREST]) + (valley?.id === 'lantern' ? 1 : 0),
    };
    for (const [name, L] of Object.entries(this.layers)) {
      L.level += (Math.min(1, target[name] || 0) - L.level) * (1 - Math.exp(-0.8 * dt));
      L.m.uniforms.uOpacity.value = L.level * (name === 'rain' ? 0.45 : name === 'fireflies' ? 1 : 0.8);
      L.pts.visible = L.level > 0.02;
    }
    if (valley?.id === 'lantern') this.layers.fireflies.m.uniforms.uColor.value.setHex(0x7affe0);
    else this.layers.fireflies.m.uniforms.uColor.value.setHex(0xd8ff7a);
  }
}

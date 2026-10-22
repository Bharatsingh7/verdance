// Photo-textured surfaces (CC0 ambientCG sets in public/textures): terrain splatting, ruins (triplanar concrete /
// rusted metal with moss + grime) and bark. Textures load in the background; progress feeds the title screen.
import * as THREE from 'three';
import { detailTexture } from './textures.js';

export const texProgress = { loaded: 0, total: 0, get done() { return this.total > 0 && this.loaded >= this.total; } };
const manager = new THREE.LoadingManager();
manager.onProgress = (_u, l, t) => { texProgress.loaded = l; texProgress.total = t; };
manager.onError = () => { texProgress.loaded++; };
const loader = new THREE.TextureLoader(manager);

const T = {};
// Mean colour (linear) of each albedo, so tinted surfaces can use the texture as detail around 1.0.
const MEAN = {};

export function photo(name, kind = 'albedo', channel = 0) {
  const file = name + '_' + kind, key = file + channel;
  if (T[key]) return T[key];
  const t = loader.load(`./textures/${file}.jpg`, (tex) => {
    if (kind !== 'albedo') return;
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 8;
      const x = cv.getContext('2d'); x.drawImage(tex.image, 0, 0, 8, 8);
      const d = x.getImageData(0, 0, 8, 8).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += (d[i] / 255) ** 2.2; g += (d[i + 1] / 255) ** 2.2; b += (d[i + 2] / 255) ** 2.2; }
      MEAN[name].value.set(r / 64, g / 64, b / 64);
    } catch { /* keep default */ }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.channel = channel;
  if (kind === 'albedo') { t.colorSpace = THREE.SRGBColorSpace; MEAN[name] ??= { value: new THREE.Vector3(0.25, 0.25, 0.25) }; }
  T[key] = t;
  return t;
}

// Start every download up front (so the loading bar knows the total).
export function preloadPhotos() {
  for (const n of ['grass', 'dirt', 'sand', 'rock', 'snow', 'asphalt', 'concrete', 'rust', 'bark', 'bark2']) { photo(n, 'albedo'); photo(n, 'normal'); }
}

const TRIPLANAR = `
  vec3 triW(vec3 n) { vec3 b = pow(abs(n), vec3(4.0)); return b / (b.x + b.y + b.z); }
  vec3 triTex(sampler2D t, vec3 p, vec3 w, float s) {
    return texture2D(t, p.zy * s).rgb * w.x + texture2D(t, p.xz * s).rgb * w.y + texture2D(t, p.xy * s).rgb * w.z;
  }
  // World-space normal perturbation from a triplanar tangent-space normal map.
  vec3 triNrm(sampler2D t, vec3 p, vec3 n, vec3 w, float s, float k) {
    vec3 tx = texture2D(t, p.zy * s).xyz * 2.0 - 1.0;
    vec3 ty = texture2D(t, p.xz * s).xyz * 2.0 - 1.0;
    vec3 tz = texture2D(t, p.xy * s).xyz * 2.0 - 1.0;
    vec3 d = vec3(0.0, tx.y, tx.x) * w.x + vec3(ty.x, 0.0, ty.y) * w.y + vec3(tz.x, tz.y, 0.0) * w.z;
    return normalize(n + d * k);
  }`;

const VARYINGS_VS = `
  varying vec3 vWPos; varying vec3 vWN;`;
const VARYINGS_SET = `
  {
    vec4 wp4 = vec4(transformed, 1.0); vec3 wn3 = objectNormal;
    #ifdef USE_INSTANCING
      wp4 = instanceMatrix * wp4; wn3 = mat3(instanceMatrix) * wn3;
    #endif
    vWPos = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * wn3);
  }`;

// --- Terrain -----------------------------------------------------------------------------------
const terrainCache = {};
export function terrainMaterial(normals = true) {
  const key = normals ? 'n' : 'a';
  if (terrainCache[key]) return terrainCache[key];
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  if (normals) m.defines = { TERRAIN_NORMALS: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tGrass: { value: photo('grass') }, tDirt: { value: photo('dirt') }, tSand: { value: photo('sand') }, tRock: { value: photo('rock') },
      tSnow: { value: photo('snow') }, tAsphalt: { value: photo('asphalt') }, uDetail: { value: detailTexture() },
      nGrass: { value: photo('grass', 'normal') }, nDirt: { value: photo('dirt', 'normal') }, nSand: { value: photo('sand', 'normal') }, nRock: { value: photo('rock', 'normal') },
    });
    sh.vertexShader = 'attribute vec4 splat; attribute vec2 splat2; varying vec4 vSplat; varying vec2 vSplat2;' + VARYINGS_VS + '\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSplat = splat; vSplat2 = splat2;' + VARYINGS_SET);
    sh.fragmentShader = `uniform sampler2D tGrass, tDirt, tSand, tRock, tSnow, tAsphalt, uDetail, nGrass, nDirt, nSand, nRock;
      varying vec4 vSplat; varying vec2 vSplat2;` + VARYINGS_VS + TRIPLANAR + '\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `
        vec2 tp = vWPos.xz;
        vec3 tw = triW(vWN);
        vec3 cG = vSplat.x > 0.003 ? mix(texture2D(tGrass, tp * 0.23).rgb, texture2D(tGrass, tp * 0.047).rgb, 0.45) : vec3(0.3);
        vec3 cD = vSplat.y > 0.003 ? mix(texture2D(tDirt, tp * 0.17).rgb, texture2D(tDirt, tp * 0.039).rgb, 0.4) : vec3(0.3);
        vec3 cS = vSplat.w > 0.003 ? mix(texture2D(tSand, tp * 0.12).rgb, texture2D(tSand, tp * 0.029).rgb, 0.4) : vec3(0.5);
        // Skip the costly lookups for layers that aren't present here.
        vec3 cR = vSplat.z > 0.003 ? triTex(tRock, vWPos, tw, 0.055) : vec3(0.35);
        vec3 cN = vSplat2.x > 0.003 ? texture2D(tSnow, tp * 0.09).rgb : vec3(0.9);
        vec3 cA = vSplat2.y > 0.003 ? texture2D(tAsphalt, tp * 0.16).rgb * 0.42 : vec3(0.2);
        // Height-aware blend: brighter texels of a layer win at borders, so transitions look organic.
        vec4 sw = vSplat * vec4(0.35 + dot(cG, vec3(1.2)), 0.35 + dot(cD, vec3(1.2)), 0.35 + dot(cR, vec3(1.2)), 0.35 + dot(cS, vec3(1.2)));
        sw = pow(sw, vec4(1.6)); sw /= max(sw.x + sw.y + sw.z + sw.w, 1e-4);
        // Biome hue from the vertex colour, normalised to unit brightness.
        vec3 tint = vColor.rgb / max(dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.02);
        vec3 soft = mix(vec3(1.0), tint, 0.32), strong = mix(vec3(1.0), tint, 0.7);
        vec3 alb = (cG * sw.x + cD * sw.y + cS * sw.w) * soft + cR * sw.z * strong;
        alb = mix(alb, cN * 1.1, smoothstep(0.0, 1.0, vSplat2.x));
        alb = mix(alb, cA, vSplat2.y * 0.9);
        float macro = texture2D(uDetail, tp * 0.0033).r * 0.6 + texture2D(uDetail, tp * 0.013).r * 0.4;
        alb *= 0.72 + 0.56 * macro;
        diffuseColor.rgb = alb;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = 0.96 - 0.3 * vSplat2.x - 0.15 * vSplat2.y;`)
      .replace('#include <normal_fragment_maps>', `
        #ifdef TERRAIN_NORMALS
          vec3 ts = (texture2D(nGrass, tp * 0.23).xyz * 2.0 - 1.0) * sw.x + (texture2D(nDirt, tp * 0.17).xyz * 2.0 - 1.0) * sw.y + (texture2D(nSand, tp * 0.12).xyz * 2.0 - 1.0) * sw.w;
          vec3 nW = normalize(vWN + vec3(ts.x, 0.0, ts.y) * 0.8 * (1.0 - vSplat2.x));
          if (sw.z > 0.01) nW = mix(nW, triNrm(nRock, vWPos, vWN, tw, 0.055, 1.1), sw.z);
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        #endif`);
  };
  m.customProgramCacheKey = () => 'terrain' + key;
  terrainCache[key] = m;
  return m;
}

// --- Ruins: concrete or rusted metal, triplanar, with moss on top surfaces and grime streaks ----------
const ruinCache = {};
export function ruinMaterial(kind = 'concrete') {
  if (ruinCache[kind]) return ruinCache[kind];
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === 'rust' ? 0.75 : 0.92, metalness: kind === 'rust' ? 0.35 : 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tAlb: { value: photo(kind) }, tNrm: { value: photo(kind, 'normal') }, uMean: MEAN[kind],
      tMoss: { value: photo('grass') }, uDetail: { value: detailTexture() },
    });
    sh.vertexShader = VARYINGS_VS + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + VARYINGS_SET);
    sh.fragmentShader = 'uniform sampler2D tAlb, tNrm, tMoss, uDetail; uniform vec3 uMean;' + VARYINGS_VS + TRIPLANAR + '\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `
        vec3 tw = triW(vWN);
        vec3 tex = triTex(tAlb, vWPos, tw, ${kind === 'rust' ? '0.35' : '0.18'});
        vec3 alb = vColor.rgb * clamp(tex / max(uMean, vec3(0.02)), 0.0, 2.5);
        // grime streaks running down walls
        float streak = texture2D(uDetail, vec2((vWPos.x + vWPos.z) * 0.35, vWPos.y * 0.02)).r;
        alb *= mix(1.0, 0.55 + 0.6 * streak, (1.0 - tw.y) * 0.8);
        // moss creeps over upward-facing surfaces, in patches
        float patchN = texture2D(uDetail, vWPos.xz * 0.05 + vWPos.y * 0.01).r;
        float moss = smoothstep(0.45, 0.9, vWN.y) * smoothstep(0.35, 0.6, patchN);
        moss = max(moss, smoothstep(0.62, 0.8, patchN) * 0.6 * (1.0 - tw.y));
        alb = mix(alb, texture2D(tMoss, vWPos.xz * 0.3).rgb * vec3(0.85, 1.0, 0.75), moss);
        diffuseColor.rgb = alb;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 nW = triNrm(tNrm, vWPos, normalize(vWN), tw, ${kind === 'rust' ? '0.35' : '0.18'}, 0.9);
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);`);
  };
  m.customProgramCacheKey = () => 'ruin' + kind;
  ruinCache[kind] = m;
  return m;
}

// --- Bark: tree UVs live in uv1 (uv holds an opaque atlas texel for the shared leaf shadow material) ---------
const barkCache = {};
export function barkMaterial(wind = 0, which = 'bark', windPatch) {
  const key = which + wind;
  if (barkCache[key]) return barkCache[key];
  const map = photo(which, 'albedo', 1), nrm = photo(which, 'normal', 1);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap: nrm, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95 });
  if (windPatch) windPatch(m, wind, 'bark' + key);
  barkCache[key] = m;
  return m;
}


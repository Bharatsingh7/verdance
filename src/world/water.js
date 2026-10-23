// Water at sea level: a detailed plane follows the camera (gentle waves + scrolling ripple normals reflecting
// the sky environment), and a flat ring reaches the horizon.
import * as THREE from 'three';
import { shared } from './models.js';
import { WATER_LEVEL } from './terrain.js';
import { waterNormals } from './textures.js';

const TILE = 15; // metres per normal-map tile; the plane snaps by this so ripples stay put in the world

export class Water {
  constructor(scene) {
    const nrm = waterNormals();
    nrm.repeat.set(1800 / TILE, 1800 / TILE);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1f5866, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.0,
      normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35), side: THREE.DoubleSide,
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = shared.time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(position, 1.0);
        transformed.y += sin(wp.x * 0.09 + uTime * 1.1) * 0.12 + cos(wp.z * 0.11 + uTime * 0.8) * 0.1 + sin((wp.x + wp.z) * 0.21 + uTime * 1.7) * 0.05;`);
      // Fresnel: more opaque and reflective at grazing angles.
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
        float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
        diffuseColor.a = mix(diffuseColor.a, 1.0, fres);
        #include <opaque_fragment>`);
    };
    this.mat = mat;
    const g = new THREE.PlaneGeometry(1800, 1800, 120, 120);
    g.rotateX(-Math.PI / 2);
    this.near = new THREE.Mesh(g, mat);
    this.near.renderOrder = 2;
    this.near.frustumCulled = false;
    this.near.receiveShadow = true;
    scene.add(this.near);

    const fg = new THREE.RingGeometry(880, 9000, 64, 1);
    fg.rotateX(-Math.PI / 2);
    this.far = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: 0x1f5866, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.95 }));
    this.far.position.y = WATER_LEVEL - 0.05;
    this.far.renderOrder = 1;
    this.far.frustumCulled = false;
    scene.add(this.far);
  }

  update(camera, daylight, t) {
    this.near.position.set(Math.round(camera.position.x / TILE) * TILE, WATER_LEVEL, Math.round(camera.position.z / TILE) * TILE);
    this.far.position.x = this.near.position.x; this.far.position.z = this.near.position.z;
    // Plane UV v runs opposite to world z after rotation; keep the texture fixed in world space while snapping.
    const n = this.mat.normalMap;
    // (the snapped position is a whole number of tiles, so only the slow drift matters; kept small for precision)
    n.offset.set((t * 0.02) % 1, (t * 0.013) % 1);
    const c = 0.3 + 0.7 * daylight;
    // Seen from below, the surface is a bright, silvery ceiling.
    const under = camera.position.y < WATER_LEVEL;
    if (under) this.mat.color.setRGB(0.12 * c, 0.34 * c, 0.36 * c); else this.mat.color.setRGB(0.015 * c, 0.075 * c, 0.085 * c);
    this.mat.opacity = under ? 0.95 : 0.8;
    this.far.material.color.copy(this.mat.color);
  }
}

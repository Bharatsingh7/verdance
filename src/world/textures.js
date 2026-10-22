// Procedural textures painted at startup (no downloads): foliage atlas, detail noise, water normals, clouds.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

// Tileable value noise (periodic on the texture size).
function tileNoise(size, periods, rnd) {
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0;
  for (const p of periods) {
    const g = new Float32Array(p * p);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * p, fy = (y / size) * p;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[(y0 % p) * p + (x0 % p)], b = g[(y0 % p) * p + ((x0 + 1) % p)];
      const c = g[((y0 + 1) % p) * p + (x0 % p)], d = g[((y0 + 1) % p) * p + ((x0 + 1) % p)];
      out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    norm += amp; amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

let detail = null;
export function detailTexture() {
  if (detail) return detail;
  const S = 256, rnd = mulberry32(42);
  const n = tileNoise(S, [4, 8, 16, 32, 64], rnd);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { const v = Math.max(0, Math.min(255, n[i] * 255)); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  detail = new THREE.DataTexture(data, S, S);
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.magFilter = THREE.LinearFilter; detail.minFilter = THREE.LinearMipmapLinearFilter;
  detail.generateMipmaps = true; detail.anisotropy = 4;
  detail.needsUpdate = true;
  return detail;
}

let waterN = null;
export function waterNormals() {
  if (waterN) return waterN;
  const S = 256, rnd = mulberry32(7);
  const h = tileNoise(S, [8, 16, 32], rnd);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
    const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const nx = -dx * 6, ny = -dy * 6, nz = 1, l = Math.hypot(nx, ny, nz);
    data[i * 4] = (nx / l * 0.5 + 0.5) * 255; data[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255; data[i * 4 + 2] = (nz / l * 0.5 + 0.5) * 255; data[i * 4 + 3] = 255;
  }
  waterN = new THREE.DataTexture(data, S, S);
  waterN.wrapS = waterN.wrapT = THREE.RepeatWrapping;
  waterN.minFilter = THREE.LinearMipmapLinearFilter; waterN.magFilter = THREE.LinearFilter;
  waterN.generateMipmaps = true;
  waterN.needsUpdate = true;
  return waterN;
}

// --- Foliage atlas: 4 x 3 cells of 256px ----------------------------------------------------
export const CELL = { broad: 0, pine: 1, jungle: 2, palm: 3, grass: 4, fern: 5, flowers: 6, reed: 7, autumn: 8, birch: 9, ivy: 10, tallgrass: 11 };
const ROWS = 3, AW = 1024, AH = 256 * ROWS;
export function cellUV(cell) {
  const cx = cell % 4, cy = Math.floor(cell / 4);
  const pu = 2 / AW, pv = 2 / AH;
  return { u0: cx / 4 + pu, u1: (cx + 1) / 4 - pu, v0: 1 - (cy + 1) / ROWS + pv, v1: 1 - cy / ROWS - pv };
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function leaf(x, cx, cy, len, wid, ang, col, rib) {
  x.save(); x.translate(cx, cy); x.rotate(ang);
  x.fillStyle = col;
  x.beginPath(); x.moveTo(0, 0);
  x.quadraticCurveTo(len * 0.5, -wid, len, 0);
  x.quadraticCurveTo(len * 0.5, wid, 0, 0);
  x.fill();
  if (rib) { x.strokeStyle = rib; x.lineWidth = 1; x.beginPath(); x.moveTo(0, 0); x.lineTo(len * 0.95, 0); x.stroke(); }
  x.restore();
}

function paintCell(x, cell, rnd) {
  const R = (a, b) => a + (b - a) * rnd();
  x.save();
  x.beginPath(); x.rect(0, 0, 256, 256); x.clip();
  switch (cell) {
    case CELL.broad: case CELL.autumn: case CELL.birch: case CELL.ivy: {
      const hue = cell === CELL.autumn ? [18, 48] : cell === CELL.birch ? [72, 92] : cell === CELL.ivy ? [105, 125] : [86, 112];
      const sat = cell === CELL.autumn ? [55, 80] : [35, 58];
      const size = cell === CELL.birch ? [9, 13] : cell === CELL.ivy ? [16, 22] : [13, 20];
      const subs = Array.from({ length: 6 }, () => [128 + R(-60, 60), 128 + R(-55, 55), R(40, 70)]);
      for (let i = 0; i < 620; i++) {
        const [sx, sy, sr] = subs[Math.floor(rnd() * subs.length)];
        const a = R(0, Math.PI * 2), r = Math.sqrt(rnd()) * sr;
        const px = sx + Math.cos(a) * r, py = sy + Math.sin(a) * r;
        if (Math.hypot(px - 128, py - 128) > 122) continue;
        // light from the top: upper leaves brighter, inner/lower darker
        const light = 1 - (py / 256) * 0.55 - (1 - r / sr) * 0.25;
        const L = 14 + light * 30 + R(-4, 4);
        const ang = a + R(-0.6, 0.6);
        leaf(x, px, py, R(size[0], size[1]), R(size[0] * 0.35, size[0] * 0.5), ang, hsl(R(hue[0], hue[1]), R(sat[0], sat[1]), L), null);
        if (rnd() < 0.25) leaf(x, px, py, R(size[0] * 0.5, size[0] * 0.8), 1.5, ang, hsl(R(hue[0], hue[1]), 50, Math.min(75, L + 18), 0.6), null);
      }
      // Guaranteed-opaque texel at the cell centre (solid parts sample it; see OPAQUE_UV in models.js).
      if (cell === CELL.broad) { x.fillStyle = hsl(95, 40, 26); x.beginPath(); x.arc(128, 128, 7, 0, Math.PI * 2); x.fill(); }
      break;
    }
    case CELL.pine: {
      // A spruce spray running left (trunk) to right (tip), drooping; card u maps along the branch.
      const twig = (x0, y0, len, sag, w, depth) => {
        const pts = [];
        for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([x0 + t * len, y0 + sag * t * t]); }
        x.strokeStyle = hsl(25, 25, 20); x.lineWidth = depth ? 1.2 : 2.4;
        x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke();
        for (let i = 0; i < len * 1.6; i++) {
          const t = rnd(), [px, py] = pts[Math.floor(t * 20)];
          const nl = w * (1 - t * 0.6) * R(0.6, 1.1);
          const side = rnd() < 0.5 ? -1 : 1;
          const ang = side * R(0.5, 1.1) + 0.25;
          x.strokeStyle = hsl(R(125, 150), R(25, 42), R(12, 26) + (side < 0 ? 6 : 0));
          x.lineWidth = R(1.1, 2);
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(ang) * nl, py + Math.sin(ang) * nl); x.stroke();
        }
        if (!depth) for (let k = 0; k < 6; k++) { const t = 0.2 + k * 0.12, [px, py] = pts[Math.floor(t * 20)]; twig(px, py, len * (0.45 - k * 0.04), sag * 0.5 + R(-8, 14), w * 0.75, 1); }
      };
      twig(6, 118, 240, 34, 30, 0);
      break;
    }
    case CELL.jungle: {
      for (let i = 0; i < 70; i++) {
        const a = R(0, Math.PI * 2), r = Math.sqrt(rnd()) * 95;
        leaf(x, 128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 0.8, R(38, 60), R(13, 20), a + R(-0.5, 0.5), hsl(R(100, 125), R(40, 60), R(18, 36)), hsl(100, 40, 45, 0.5));
      }
      break;
    }
    case CELL.palm: {
      // frond along x: rachis with leaflets
      x.strokeStyle = hsl(60, 35, 35); x.lineWidth = 3;
      x.beginPath(); x.moveTo(4, 128); x.quadraticCurveTo(128, 118, 252, 132); x.stroke();
      for (let i = 0; i < 60; i++) {
        const t = i / 60, px = 8 + t * 240, py = 128 - Math.sin(t * Math.PI) * 6;
        const len = 70 * Math.sin(Math.PI * (0.15 + t * 0.85)) + 8;
        for (const s of [-1, 1]) leaf(x, px, py, len, 3.2, s * R(0.9, 1.25) + 0.25, hsl(R(85, 105), R(40, 55), R(24, 38)), null);
      }
      break;
    }
    case CELL.grass: {
      // Light, nearly neutral blades: the instance colour (sampled from the terrain) supplies the hue.
      for (let i = 0; i < 80; i++) {
        const bx = 128 + R(-80, 80), h = R(110, 245), lean = R(-60, 60);
        x.fillStyle = hsl(R(60, 95), R(12, 30), R(55, 85));
        x.beginPath(); x.moveTo(bx - R(3, 6), 256); x.quadraticCurveTo(bx + lean * 0.3, 256 - h * 0.6, bx + lean, 256 - h); x.lineTo(bx + R(3, 6), 256); x.fill();
      }
      const gr = x.createLinearGradient(0, 130, 0, 256);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(20,30,10,0.55)');
      x.globalCompositeOperation = 'source-atop'; x.fillStyle = gr; x.fillRect(0, 0, 256, 256); x.globalCompositeOperation = 'source-over';
      break;
    }
    case CELL.fern: {
      for (let k = 0; k < 5; k++) {
        const ang = -Math.PI / 2 + (k - 2) * 0.45;
        const len = R(190, 230);
        for (let i = 0; i < 26; i++) {
          const t = i / 26, px = 128 + Math.cos(ang) * len * t, py = 250 + Math.sin(ang) * len * t;
          const pl = 32 * Math.sin(Math.PI * (0.2 + 0.8 * t)) * (1 - t * 0.5);
          for (const s of [-1, 1]) leaf(x, px, py, pl, 3.5, ang + s * 1.2, hsl(R(95, 115), R(40, 55), R(22, 36)), null);
        }
      }
      break;
    }
    case CELL.flowers: {
      for (let i = 0; i < 40; i++) {
        const bx = 128 + R(-80, 80), h = R(80, 170);
        x.fillStyle = hsl(R(80, 100), 40, R(28, 40));
        x.beginPath(); x.moveTo(bx - 3, 256); x.lineTo(bx + R(-15, 15), 256 - h); x.lineTo(bx + 3, 256); x.fill();
      }
      const cols = [[50, 90, 65], [340, 70, 75], [0, 0, 96], [270, 55, 72], [25, 85, 62], [200, 70, 72]];
      for (let i = 0; i < 18; i++) {
        const c = cols[Math.floor(rnd() * cols.length)];
        const fx = 128 + R(-85, 85), fy = R(70, 170), r = R(7, 12);
        for (let p = 0; p < 6; p++) { const a = (p / 6) * Math.PI * 2; x.fillStyle = hsl(c[0], c[1], c[2] + R(-6, 6)); x.beginPath(); x.ellipse(fx + Math.cos(a) * r * 0.6, fy + Math.sin(a) * r * 0.6, r * 0.55, r * 0.3, a, 0, Math.PI * 2); x.fill(); }
        x.fillStyle = hsl(45, 90, 55); x.beginPath(); x.arc(fx, fy, r * 0.28, 0, Math.PI * 2); x.fill();
      }
      break;
    }
    case CELL.tallgrass: {
      for (let i = 0; i < 90; i++) {
        const bx = 128 + R(-100, 100), h = R(150, 250), lean = R(-50, 50);
        x.strokeStyle = hsl(R(55, 85), R(10, 25), R(55, 82)); x.lineWidth = R(2, 4);
        x.beginPath(); x.moveTo(bx, 256); x.quadraticCurveTo(bx + lean * 0.2, 256 - h * 0.6, bx + lean, 256 - h); x.stroke();
        if (rnd() < 0.3) { x.fillStyle = hsl(45, 30, 70); x.beginPath(); x.ellipse(bx + lean, 256 - h, 3, 12, lean * 0.01, 0, Math.PI * 2); x.fill(); }
      }
      const gr = x.createLinearGradient(0, 120, 0, 256);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(20,30,10,0.5)');
      x.globalCompositeOperation = 'source-atop'; x.fillStyle = gr; x.fillRect(0, 0, 256, 256); x.globalCompositeOperation = 'source-over';
      break;
    }
    case CELL.reed: {
      for (let i = 0; i < 26; i++) {
        const bx = 128 + R(-60, 60), h = R(170, 250), lean = R(-20, 20);
        x.fillStyle = hsl(R(65, 85), R(30, 45), R(30, 45));
        x.beginPath(); x.moveTo(bx - 3, 256); x.lineTo(bx + lean, 256 - h); x.lineTo(bx + 3, 256); x.fill();
        if (rnd() < 0.35) { x.fillStyle = hsl(25, 45, 25); x.beginPath(); x.ellipse(bx + lean * 0.85, 256 - h * 0.85, 4, 16, 0, 0, Math.PI * 2); x.fill(); }
      }
      break;
    }
  }
  x.restore();
}

let atlas = null;
export function foliageAtlas() {
  if (atlas) return atlas;
  const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
  const x = cv.getContext('2d');
  const rnd = mulberry32(11);
  for (let c = 0; c < 4 * ROWS; c++) {
    x.save(); x.translate((c % 4) * 256, Math.floor(c / 4) * 256);
    paintCell(x, c, rnd);
    x.restore();
  }
  // Bleed colour into transparent texels so mipmaps don't fringe dark; alpha stays 0 there.
  const img = x.getImageData(0, 0, AW, AH), d = img.data;
  for (let pass = 0; pass < 4; pass++) {
    for (let y = 1; y < AH - 1; y++) for (let xx = 1; xx < AW - 1; xx++) {
      const i = (y * AW + xx) * 4;
      if (d[i + 3] > 0 || (d[i] | d[i + 1] | d[i + 2])) continue;
      for (const o of [-4, 4, -AW * 4, AW * 4]) {
        const j = i + o;
        if (d[j + 3] > 0 || (d[j] | d[j + 1] | d[j + 2])) { d[i] = d[j]; d[i + 1] = d[j + 1]; d[i + 2] = d[j + 2]; break; }
      }
    }
  }
  // Preserve coverage at distance: boost alpha a little (mips average it down).
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 8 ? Math.min(255, d[i] * 1.15) : 0;
  // Upload raw (unpremultiplied) pixels so the bleed survives; flip rows to match canvas-style UVs.
  const raw = new Uint8Array(d.length), row = AW * 4;
  for (let y = 0; y < AH; y++) raw.set(d.subarray(y * row, (y + 1) * row), (AH - 1 - y) * row);
  atlas = new THREE.DataTexture(raw, AW, AH);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.generateMipmaps = true;
  atlas.magFilter = THREE.LinearFilter;
  atlas.needsUpdate = true;
  atlas.anisotropy = 4;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  return atlas;
}

// Soft cloud puff for sprites.
let cloud = null;
export function cloudTexture() {
  if (cloud) return cloud;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  const rnd = mulberry32(3);
  for (let i = 0; i < 26; i++) {
    const px = 128 + (rnd() - 0.5) * 140, py = 140 + (rnd() - 0.5) * 50 - Math.abs(px - 128) * 0.2, r = 30 + rnd() * 45;
    const g = x.createRadialGradient(px, py - r * 0.3, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(240,242,248,0.3)'); g.addColorStop(1, 'rgba(210,215,230,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  // shade the underside
  const sh = x.createLinearGradient(0, 100, 0, 210);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(120,130,150,0.55)');
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = sh; x.fillRect(0, 0, 256, 256);
  cloud = new THREE.CanvasTexture(cv);
  cloud.colorSpace = THREE.SRGBColorSpace;
  return cloud;
}

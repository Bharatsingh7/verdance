// HUD: compass, banner, toasts, status line, counters; plus the map and journal overlays.
import { ECHOES } from '../world/secrets.js';

const $ = (s) => document.querySelector(s);

export class HUD {
  constructor() {
    this.el = $('#hud');
    this.strip = $('#compass-strip');
    this.banner = $('#banner');
    this.toasts = $('#toasts');
    this.clock = $('#clock'); this.speed = $('#speed'); this.mode = $('#mode'); this.radio = $('#radio');
    this.cEcho = $('#c-echo'); this.cPlace = $('#c-place');
    this.promptEl = $('#prompt'); this.promptTimer = 0;
    this.depthEl = $('#depth');
    this.bannerTimer = 0;
    this.queue = [];
    this.active = 0;
    setTimeout(() => $('#hint')?.classList.add('fade'), 25000);
  }

  show() { this.el.hidden = false; }
  setPhoto(on) { this.el.classList.toggle('photo', on); }

  prompt(text, dur = 3) { this.promptEl.textContent = text; this.promptEl.classList.add('show'); this.promptTimer = dur; }

  setDepth(d) {
    this.depthEl.hidden = d == null;
    if (d == null) return;
    this.depthEl.querySelector('b').textContent = `${Math.round(d)} m`;
    this.depthEl.querySelector('i').style.setProperty('--d', `${Math.min(100, d / 60 * 100)}%`);
  }

  showBanner(title, sub = '') {
    this.banner.querySelector('small').textContent = sub;
    this.banner.querySelector('strong').textContent = title;
    this.banner.classList.add('show');
    this.bannerTimer = 4.5;
  }

  toast(kind, label, title, text, dur = 7) {
    this.queue.push({ kind, label, title, text, dur });
    this.pump();
  }

  pump() {
    while (this.active < 2 && this.queue.length) {
      const t = this.queue.shift();
      const el = document.createElement('div');
      el.className = 'toast ' + t.kind;
      el.innerHTML = `<small></small><strong></strong>${t.text ? '<p></p>' : ''}`;
      el.querySelector('small').textContent = t.label;
      el.querySelector('strong').textContent = t.title;
      if (t.text) el.querySelector('p').textContent = t.text;
      this.toasts.appendChild(el);
      this.active++;
      requestAnimationFrame(() => el.classList.add('show'));
      setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.remove(); this.active--; this.pump(); }, 700); }, t.dur * 1000);
    }
  }

  // yaw: camera heading in radians where 0 = looking north (-z)
  update(dt, s) {
    if (this.bannerTimer > 0) { this.bannerTimer -= dt; if (this.bannerTimer <= 0) this.banner.classList.remove('show'); }
    const hrs = s.hours, h = Math.floor(hrs), m = Math.floor((hrs - h) * 60 / 10) * 10;
    this.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    this.speed.textContent = `${Math.round(Math.abs(s.speed) * 3.6)} km/h`;
    this.mode.textContent = s.mode;
    this.radio.textContent = s.radio;
    if (this.promptTimer > 0) { this.promptTimer -= dt; if (this.promptTimer <= 0) this.promptEl.classList.remove('show'); }
    this.cEcho.textContent = `${s.echoes}/${s.echoTotal}` + (s.wildEchoes ? ` +${s.wildEchoes}` : '');
    this.cPlace.textContent = `${s.places}/${s.placeTotal}` + (s.wildPlaces ? ` +${s.wildPlaces}` : '');

    // Compass: 1 degree = W/180 px over a 180° window.
    const W = this.strip.clientWidth || 400;
    const pxPerRad = W / Math.PI;
    let html = '';
    const cards = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = 0; d < 360; d += 15) {
      let rel = (d * Math.PI) / 180 - s.yaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) > Math.PI / 2) continue;
      const x = W / 2 + rel * pxPerRad;
      html += cards[d] ? `<span class="card" style="left:${x}px">${cards[d]}</span>` : `<span class="tick" style="left:${x}px"></span>`;
    }
    for (const mk of s.markers) {
      // bearing from north, clockwise: atan2(dx, -dz)
      let rel = Math.atan2(mk.x - s.px, -(mk.z - s.pz)) - s.yaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) > Math.PI / 2) continue;
      const x = W / 2 + rel * pxPerRad;
      html += `<span class="mk ${mk.kind}" style="left:${x}px">${mk.kind === 'echo' ? '◆' : mk.kind === 'hint' ? '?' : '✦'}</span>`;
    }
    this.strip.innerHTML = html;
  }
}

// --- Map --------------------------------------------------------------------------------
// Endless: 1 km tiles rendered by the workers on demand (LRU cached), centred on the rover, with zoom/pan.
// Explored fog is a 16x16 bitmask (64 m cells) per tile, saved compactly.
const TILE = 1024, TPX = 128, FOGN = 16, ZOOMS = [1536, 3072, 6144, 12288, 24576];
const PLACE_COL = { landmark: '#4f7a2a', valley: '#3a8a5a', viewpoint: '#7a6a2a', village: '#b8642a', lab: '#1f9aa8', wreck: '#2a6aa8', wonder: '#c8962a' };

export class MapView {
  constructor(requestTile) {
    this.requestTile = requestTile;
    this.el = $('#map');
    this.canvas = $('#map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tiles = new Map(); // key -> canvas | 'loading'
    this.loading = 0;
    this.fog = new Map(); // key -> { bits: Uint8Array(256), canvas, dirty }
    this.zoom = 1;
    this.pan = { x: 0, z: 0 };
    let drag = null;
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(this.zoom + Math.sign(e.deltaY)); }, { passive: false });
    this.canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, px: this.pan.x, pz: this.pan.z }; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const m = ZOOMS[this.zoom] / this.canvas.clientWidth;
      this.pan.x = drag.px - (e.clientX - drag.x) * m; this.pan.z = drag.pz - (e.clientY - drag.y) * m;
      this.redraw?.();
    });
    this.canvas.addEventListener('pointerup', () => { drag = null; });
    for (const b of document.querySelectorAll('[data-zoom]')) b.addEventListener('click', () => {
      const z = +b.dataset.zoom;
      if (z === 0) { this.pan.x = this.pan.z = 0; } else this.setZoom(this.zoom - z);
      this.redraw?.();
    });
  }

  setZoom(z) { this.zoom = Math.max(0, Math.min(ZOOMS.length - 1, z)); this.redraw?.(); }

  fogTile(tx, tz, create) {
    const k = tx + ',' + tz;
    let f = this.fog.get(k);
    if (!f && create) { f = { bits: new Uint8Array(FOGN * FOGN), canvas: null, dirty: true }; this.fog.set(k, f); }
    return f;
  }

  loadExplored(data) {
    if (!data) return;
    try {
      if (typeof data === 'string') {
        // v1 saves: a 64x64 grid of 64 m cells over the isle ([-2048, 2048]).
        const bin = atob(data);
        for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) if (bin.charCodeAt(j * 64 + i)) this.mark((i - 32) * 64 + 32, (j - 32) * 64 + 32);
        return;
      }
      for (const [k, b64] of Object.entries(data)) {
        const [tx, tz] = k.split(',').map(Number);
        const bin = atob(b64), f = this.fogTile(tx, tz, true);
        for (let i = 0; i < 32; i++) { const v = bin.charCodeAt(i); for (let b = 0; b < 8; b++) f.bits[i * 8 + b] = (v >> b) & 1; }
      }
    } catch { /* corrupt save: start fresh */ }
  }

  serializeExplored() {
    const out = {};
    for (const [k, f] of this.fog) {
      let s = '';
      for (let i = 0; i < 32; i++) { let v = 0; for (let b = 0; b < 8; b++) v |= f.bits[i * 8 + b] << b; s += String.fromCharCode(v); }
      out[k] = btoa(s);
    }
    return out;
  }

  mark(x, z) {
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
    const f = this.fogTile(tx, tz, true);
    const i = Math.floor((x - tx * TILE) / (TILE / FOGN)), j = Math.floor((z - tz * TILE) / (TILE / FOGN));
    if (!f.bits[j * FOGN + i]) { f.bits[j * FOGN + i] = 1; f.dirty = true; }
  }

  reveal(x, z, r) {
    const c = TILE / FOGN;
    for (let zz = Math.floor((z - r) / c) * c + c / 2; zz < z + r; zz += c) for (let xx = Math.floor((x - r) / c) * c + c / 2; xx < x + r; xx += c) if (Math.hypot(xx - x, zz - z) < r) this.mark(xx, zz);
  }

  get open() { return !this.el.hidden; }
  toggle(force) { this.el.hidden = force !== undefined ? !force : !this.el.hidden; if (this.el.hidden) this.pan.x = this.pan.z = 0; }

  tile(tx, tz) {
    const k = tx + ',' + tz;
    const t = this.tiles.get(k);
    if (t) { this.tiles.delete(k); this.tiles.set(k, t); return t === 'loading' ? null : t; } // LRU touch
    if (this.loading >= 3) return null;
    this.loading++;
    this.tiles.set(k, 'loading');
    this.requestTile(tx, tz, TILE, TPX).then((img) => {
      this.loading--;
      const c = document.createElement('canvas'); c.width = c.height = TPX;
      c.getContext('2d').putImageData(new ImageData(img, TPX, TPX), 0, 0);
      this.tiles.set(k, c);
      while (this.tiles.size > 90) this.tiles.delete(this.tiles.keys().next().value);
      this.redraw?.();
    });
    return null;
  }

  draw(s) {
    this.redraw = () => this.draw(s);
    const c = this.ctx, W = this.canvas.width;
    const span = ZOOMS[this.zoom], mpp = span / W;
    const cx = s.px + this.pan.x, cz = s.pz + this.pan.z;
    const x0 = cx - span / 2, z0 = cz - span / 2;
    const toX = (x) => (x - x0) / mpp, toY = (z) => (z - z0) / mpp;
    c.fillStyle = '#ded4ba'; c.fillRect(0, 0, W, W);
    c.imageSmoothingEnabled = true;
    const t0x = Math.floor(x0 / TILE), t1x = Math.floor((x0 + span) / TILE), t0z = Math.floor(z0 / TILE), t1z = Math.floor((z0 + span) / TILE);
    const tp = TILE / mpp;
    for (let tz = t0z; tz <= t1z; tz++) for (let tx = t0x; tx <= t1x; tx++) {
      const sx = toX(tx * TILE), sy = toY(tz * TILE);
      const f = this.fogTile(tx, tz, false);
      if (f) { const img = this.tile(tx, tz); if (img) c.drawImage(img, sx, sy, tp + 0.5, tp + 0.5); }
      // fog over unexplored cells
      if (!f) { c.fillStyle = '#ded4ba'; c.fillRect(sx, sy, tp + 0.5, tp + 0.5); continue; }
      if (f.dirty || !f.canvas) {
        f.canvas ??= Object.assign(document.createElement('canvas'), { width: FOGN, height: FOGN });
        const fc = f.canvas.getContext('2d'), im = fc.createImageData(FOGN, FOGN);
        for (let i = 0; i < FOGN * FOGN; i++) { im.data[i * 4] = 222; im.data[i * 4 + 1] = 212; im.data[i * 4 + 2] = 186; im.data[i * 4 + 3] = f.bits[i] ? 0 : 240; }
        fc.putImageData(im, 0, 0); f.dirty = false;
      }
      c.drawImage(f.canvas, sx, sy, tp + 0.5, tp + 0.5);
    }

    // Places, hints and echoes.
    const inView = (x, z) => x > x0 - 50 && x < x0 + span + 50 && z > z0 - 50 && z < z0 + span + 50;
    c.font = '600 14px Karla, sans-serif'; c.textAlign = 'center';
    for (const p of s.places) {
      if (!inView(p.x, p.z)) continue;
      const x = toX(p.x), y = toY(p.z);
      const found = s.discovered.has(p.id);
      if (!found && !s.hinted.has(p.id)) continue;
      c.fillStyle = found ? PLACE_COL[p.kind] || '#4f7a2a' : 'rgba(31,154,168,0.6)';
      c.beginPath(); c.arc(x, y, found ? 6 : 8, 0, Math.PI * 2); c.fill();
      const label = found ? p.name : '?';
      if (found && this.zoom > 2 && p.wild && p.kind === 'village') continue; // keep wide views readable
      c.lineWidth = 3; c.strokeStyle = 'rgba(245,240,225,0.9)'; c.strokeText(label, x, y - 11);
      c.fillStyle = '#2a2a22'; c.fillText(label, x, y - 11);
    }
    for (const it of s.items) {
      if (!inView(it.x, it.z)) continue;
      const x = toX(it.x), y = toY(it.z);
      if (s.collected.has(it.id)) { c.fillStyle = '#c8962a'; c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 2); c.fill(); }
      else if (it.scanned > 0) { c.fillStyle = '#2fb8a0'; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); }
    }
    // You
    c.save(); c.translate(toX(s.px), toY(s.pz)); c.rotate(-s.heading + Math.PI);
    c.fillStyle = '#ffffff'; c.strokeStyle = '#1d2a24'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // Scale bar + coordinates
    const bar = [250, 500, 1000, 2000, 5000][this.zoom];
    c.fillStyle = 'rgba(29,42,36,0.85)'; c.fillRect(16, W - 22, bar / mpp, 4);
    c.font = '600 13px Karla, sans-serif'; c.textAlign = 'left';
    c.fillText(bar >= 1000 ? bar / 1000 + ' km' : bar + ' m', 16, W - 28);
    c.textAlign = 'right';
    c.fillText(`${(s.px / 1000).toFixed(1)} km E · ${(-s.pz / 1000).toFixed(1)} km N`, W - 16, W - 16);
  }
}

// --- Journal ------------------------------------------------------------------------------
export class Journal {
  constructor() { this.el = $('#journal'); this.body = $('#journal-body'); }
  get open() { return !this.el.hidden; }
  toggle(force) { this.el.hidden = force !== undefined ? !force : !this.el.hidden; }

  render(s) {
    const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const km = (s.distance / 1000).toFixed(1);
    const mins = Math.floor(s.playTime / 60);
    let h = `<div class="stats"><div><b>${km} km</b>driven</div><div><b>${Math.floor(mins / 60)}h ${mins % 60}m</b>wandering</div><div><b>${s.biomes.size}/12</b>lands visited</div><div><b>${s.collected.size}</b>echoes</div></div>`;
    const group = (title, list) => {
      const found = list.filter((p) => s.discovered.has(p.id)).length;
      h += `<h3>${title}<span>${found}/${list.length}</span></h3><div class="entries">`;
      for (const p of list) h += s.discovered.has(p.id) ? `<div class="entry"><strong>${esc(p.name)}</strong><p>${esc(p.text)}</p></div>` : `<div class="entry locked"><strong>Somewhere unseen…</strong></div>`;
      h += '</div>';
    };
    group('Ruins of the old world', s.places.filter((p) => p.kind === 'landmark' && !p.wild));
    group('Hidden valleys', s.places.filter((p) => p.kind === 'valley' && !p.wild));
    group('Viewpoints', s.places.filter((p) => p.kind === 'viewpoint'));
    const wild = s.places.filter((p) => p.wild && s.discovered.has(p.id));
    if (wild.length) {
      h += `<h3>Out in the wilds<span>${wild.length} found</span></h3><div class="entries">`;
      for (const p of wild) h += `<div class="entry"><strong>${esc(p.name)}</strong><p>${esc(p.text)}</p></div>`;
      h += '</div>';
    }
    if (s.met?.length) {
      h += `<h3>People you have met<span>${s.met.length}</span></h3><div class="entries">`;
      for (const m of s.met) h += `<div class="entry"><strong>${esc(m.name)}</strong><p>of ${esc(m.site)}</p></div>`;
      h += '</div>';
    }
    h += `<h3>Sightings<span>${s.sightings.length}/3</span></h3><div class="entries">`;
    for (const sg of s.sightings) h += `<div class="entry"><strong>${esc(sg.name)}</strong><p>${esc(sg.text)}</p></div>`;
    for (let i = s.sightings.length; i < 3; i++) h += `<div class="entry locked"><strong>Something is out there…</strong></div>`;
    h += `</div><h3>Echoes of the isle<span>${ECHOES.filter((e) => s.collected.has(e.id)).length}/${ECHOES.length}</span></h3><div class="entries">`;
    for (const e of ECHOES) h += s.collected.has(e.id) ? `<div class="entry"><strong>${esc(e.title)}</strong><p>${esc(e.text)}</p></div>` : `<div class="entry locked"><strong>An echo not yet heard</strong></div>`;
    h += '</div>';
    const wildE = Object.values(s.wildEchoes || {});
    if (wildE.length) {
      h += `<h3>Echoes from the wilds<span>${wildE.length}</span></h3><div class="entries">`;
      for (const e of wildE) h += `<div class="entry"><strong>${esc(e.title)}</strong><p>${esc(e.text)}</p></div>`;
      h += '</div>';
    }
    this.body.innerHTML = h;
  }
}

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
    this.bannerTimer = 0;
    this.queue = [];
    this.active = 0;
    setTimeout(() => $('#hint')?.classList.add('fade'), 25000);
  }

  show() { this.el.hidden = false; }
  setPhoto(on) { this.el.classList.toggle('photo', on); }

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
    this.cEcho.textContent = `${s.echoes}/${s.echoTotal}`;
    this.cPlace.textContent = `${s.places}/${s.placeTotal}`;

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
      html += `<span class="mk ${mk.kind}" style="left:${x}px">${mk.kind === 'echo' ? '◆' : '✦'}</span>`;
    }
    this.strip.innerHTML = html;
  }
}

// --- Map --------------------------------------------------------------------------------
export class MapView {
  constructor(half) {
    this.half = half;
    this.el = $('#map');
    this.canvas = $('#map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.base = null;
    this.fogN = 64;
    this.explored = new Uint8Array(this.fogN * this.fogN);
    this.fog = document.createElement('canvas'); this.fog.width = this.fog.height = this.fogN;
    this.fogDirty = true;
  }

  setBase(img, size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').putImageData(new ImageData(img, size, size), 0, 0);
    this.base = c;
  }

  loadExplored(str) {
    if (!str) return;
    try { const bin = atob(str); for (let i = 0; i < bin.length && i < this.explored.length; i++) this.explored[i] = bin.charCodeAt(i); } catch { /* corrupt save */ }
    this.fogDirty = true;
  }

  serializeExplored() { let s = ''; for (const v of this.explored) s += String.fromCharCode(v); return btoa(s); }

  reveal(x, z, r) {
    const n = this.fogN, cell = (this.half * 2) / n;
    const ci = Math.floor((x + this.half) / cell), cj = Math.floor((z + this.half) / cell), rc = Math.ceil(r / cell);
    for (let j = cj - rc; j <= cj + rc; j++) for (let i = ci - rc; i <= ci + rc; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const cx = (i + 0.5) * cell - this.half, cz = (j + 0.5) * cell - this.half;
      if (Math.hypot(cx - x, cz - z) < r && !this.explored[j * n + i]) { this.explored[j * n + i] = 1; this.fogDirty = true; }
    }
  }

  get open() { return !this.el.hidden; }
  toggle(force) { this.el.hidden = force !== undefined ? !force : !this.el.hidden; }

  draw(s) {
    const c = this.ctx, W = this.canvas.width;
    const toPx = (v) => ((v + this.half) / (this.half * 2)) * W;
    c.fillStyle = '#d9cfb4'; c.fillRect(0, 0, W, W);
    if (this.base) { c.imageSmoothingEnabled = true; c.drawImage(this.base, 0, 0, W, W); }
    else { c.fillStyle = '#5a5040'; c.font = '20px Karla, sans-serif'; c.textAlign = 'center'; c.fillText('charting the world…', W / 2, W / 2); }
    if (this.fogDirty) {
      const fc = this.fog.getContext('2d');
      const im = fc.createImageData(this.fogN, this.fogN);
      for (let i = 0; i < this.explored.length; i++) { im.data[i * 4] = 222; im.data[i * 4 + 1] = 212; im.data[i * 4 + 2] = 186; im.data[i * 4 + 3] = this.explored[i] ? 0 : 238; }
      fc.putImageData(im, 0, 0);
      this.fogDirty = false;
    }
    c.imageSmoothingEnabled = true;
    c.drawImage(this.fog, 0, 0, W, W);

    // Places
    c.font = '600 15px Karla, sans-serif'; c.textAlign = 'center';
    for (const p of s.places) {
      if (!s.discovered.has(p.id)) continue;
      const x = toPx(p.x), y = toPx(p.z);
      c.fillStyle = '#4f7a2a'; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill();
      c.lineWidth = 3; c.strokeStyle = 'rgba(245,240,225,0.9)'; c.strokeText(p.name, x, y - 11);
      c.fillStyle = '#2a2a22'; c.fillText(p.name, x, y - 11);
    }
    for (const it of s.items) {
      const x = toPx(it.x), y = toPx(it.z);
      if (s.collected.has(it.id)) { c.fillStyle = '#c8962a'; c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 2); c.fill(); }
      else if (it.scanned > 0) { c.fillStyle = '#2fb8a0'; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); }
    }
    // You
    const px = toPx(s.px), py = toPx(s.pz);
    c.save(); c.translate(px, py); c.rotate(-s.heading + Math.PI);
    c.fillStyle = '#ffffff'; c.strokeStyle = '#1d2a24'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill(); c.stroke();
    c.restore();
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
    let h = `<div class="stats"><div><b>${km} km</b>driven</div><div><b>${Math.floor(mins / 60)}h ${mins % 60}m</b>wandering</div><div><b>${s.biomes.size}/7</b>lands visited</div><div><b>${s.collected.size}/${ECHOES.length}</b>echoes</div></div>`;
    const group = (title, list) => {
      const found = list.filter((p) => s.discovered.has(p.id)).length;
      h += `<h3>${title}<span>${found}/${list.length}</span></h3><div class="entries">`;
      for (const p of list) h += s.discovered.has(p.id) ? `<div class="entry"><strong>${esc(p.name)}</strong><p>${esc(p.text)}</p></div>` : `<div class="entry locked"><strong>Somewhere unseen…</strong></div>`;
      h += '</div>';
    };
    group('Ruins of the old world', s.places.filter((p) => p.kind === 'landmark'));
    group('Hidden valleys', s.places.filter((p) => p.kind === 'valley'));
    group('Viewpoints', s.places.filter((p) => p.kind === 'viewpoint'));
    h += `<h3>Sightings<span>${s.sightings.length}/3</span></h3><div class="entries">`;
    for (const sg of s.sightings) h += `<div class="entry"><strong>${esc(sg.name)}</strong><p>${esc(sg.text)}</p></div>`;
    for (let i = s.sightings.length; i < 3; i++) h += `<div class="entry locked"><strong>Something is out there…</strong></div>`;
    h += `</div><h3>Echoes<span>${s.collected.size}/${ECHOES.length}</span></h3><div class="entries">`;
    for (const e of ECHOES) h += s.collected.has(e.id) ? `<div class="entry"><strong>${esc(e.title)}</strong><p>${esc(e.text)}</p></div>` : `<div class="entry locked"><strong>An echo not yet heard</strong></div>`;
    h += '</div>';
    this.body.innerHTML = h;
  }
}

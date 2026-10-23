// Procedural WebAudio soundscape: wind, rain, waves, engine, birds, crickets, generative radio and soft UI sounds.
const PENTA = [0, 2, 4, 7, 9];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const scaleNote = (root, deg) => root + PENTA[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5);

export const STATIONS = ['Radio off', 'Dawn Pads', 'Drift', 'Music Box'];

export class Audio {
  constructor() {
    this.ctx = null;
    this.station = 1;
    this.muted = false;
    this.nextMusic = 0;
    this.nextBird = 0;
    this.nextCricket = 0;
    this.musicStep = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    // Everything passes a low-pass that closes when the camera goes under water.
    this.under = ctx.createBiquadFilter(); this.under.type = 'lowpass'; this.under.frequency.value = 20000; this.under.Q.value = 0.4;
    this.master.connect(this.under).connect(comp).connect(ctx.destination);

    // Reverb send
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.55;
    this.verb.connect(this.verbGain).connect(this.master);

    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.7; this.sfx.connect(this.master); this.sfx.connect(this.verb);
    this.music = ctx.createGain(); this.music.gain.value = 0.32; this.music.connect(this.master);
    const mv = ctx.createGain(); mv.gain.value = 0.9; this.music.connect(mv).connect(this.verb);
    this.nature = ctx.createGain(); this.nature.gain.value = 0.8; this.nature.connect(this.master);

    // Noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.98 * b0 + 0.02 * w; nd[i] = w * 0.5 + b0 * 3; }
    const loop = (filterType, freq, q) => {
      const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.playbackRate.value = 0.7 + Math.random() * 0.3;
      const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f).connect(g).connect(this.nature); s.start();
      return { f, g };
    };
    this.wind = loop('bandpass', 500, 0.6);
    this.rain = loop('highpass', 2500, 0.3);
    this.waves = loop('lowpass', 420, 0.7);

    // Engine: low saw + sine through a lowpass.
    this.eng = ctx.createGain(); this.eng.gain.value = 0;
    const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 260;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth'; this.o1.frequency.value = 40;
    this.o2 = ctx.createOscillator(); this.o2.type = 'sine'; this.o2.frequency.value = 80;
    this.hov = ctx.createOscillator(); this.hov.type = 'sine'; this.hov.frequency.value = 220;
    this.hovG = ctx.createGain(); this.hovG.gain.value = 0;
    this.o1.connect(ef); this.o2.connect(ef); ef.connect(this.eng).connect(this.master);
    this.hov.connect(this.hovG).connect(this.master);
    this.o1.start(); this.o2.start(); this.hov.start();
  }

  get t() { return this.ctx.currentTime; }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.t, 0.2); }

  nextStation() { this.station = (this.station + 1) % STATIONS.length; this.nextMusic = 0; return STATIONS[this.station]; }

  tone(freq, start, dur, { type = 'sine', vol = 0.2, attack = 0.01, out = this.sfx, pan = 0, glide = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, start);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, start + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    let node = o.connect(g);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(out);
    o.start(start); o.stop(start + dur + 0.05);
  }

  chime() { if (!this.ctx) return; const t = this.t; [0, 2, 4, 7].forEach((d, i) => this.tone(midi(scaleNote(76, d)), t + i * 0.11, 1.6, { vol: 0.13 })); }
  discover() { if (!this.ctx) return; const t = this.t; [0, 4, 7, 11].forEach((s, i) => this.tone(midi(57 + s), t + i * 0.05, 4, { type: 'triangle', vol: 0.06, attack: 0.8 })); }
  scan() { if (!this.ctx) return; this.tone(260, this.t, 1.4, { vol: 0.12, glide: 1300 }); this.tone(520, this.t + 0.05, 1.2, { vol: 0.05, glide: 2600, type: 'triangle' }); }
  ping() { if (!this.ctx) return; this.tone(1568, this.t, 0.6, { vol: 0.05 }); }
  honk() { if (!this.ctx) return; const t = this.t; this.tone(392, t, 0.22, { type: 'square', vol: 0.05 }); this.tone(330, t + 0.24, 0.3, { type: 'square', vol: 0.05 }); }
  click() { if (!this.ctx) return; this.tone(880, this.t, 0.08, { vol: 0.05, type: 'triangle' }); }
  thump(k) { if (!this.ctx) return; this.tone(70, this.t, 0.35, { vol: 0.25 * k, glide: 40 }); }
  hover(on) { if (!this.ctx) return; this.tone(on ? 300 : 900, this.t, 0.6, { vol: 0.08, glide: on ? 900 : 300, type: 'triangle' }); }

  bird(pan) {
    const t = this.t + 0.02;
    const base = 2200 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone(base * (1 + Math.random() * 0.15), t + i * (0.09 + Math.random() * 0.06), 0.09, { vol: 0.035, glide: base * (1.2 + Math.random() * 0.4), out: this.nature, pan });
  }

  cricket(pan) {
    const t = this.t;
    for (let i = 0; i < 4; i++) this.tone(4300 + Math.random() * 300, t + i * 0.045, 0.03, { vol: 0.012, out: this.nature, pan, type: 'triangle' });
  }

  music_() {
    const t = this.t;
    if (t < this.nextMusic) return;
    const st = this.station;
    if (st === 1) { // slow pads
      const root = [57, 53, 60, 55][this.musicStep++ % 4];
      for (const d of [0, 2, 4, 6]) this.tone(midi(scaleNote(root, d)), t + 0.1, 9, { type: 'triangle', vol: 0.035, attack: 2.5, out: this.music });
      this.tone(midi(root - 12), t + 0.1, 9, { vol: 0.05, attack: 2, out: this.music });
      this.nextMusic = t + 7;
    } else if (st === 2) { // drifting plucks
      const deg = Math.floor(Math.random() * 10);
      this.tone(midi(scaleNote(62, deg)), t + 0.05, 2.4, { vol: 0.06, out: this.music, pan: Math.random() - 0.5 });
      if (this.musicStep++ % 8 === 0) this.tone(midi(scaleNote(38, Math.floor(Math.random() * 3))), t + 0.05, 5, { vol: 0.08, attack: 0.4, out: this.music });
      this.nextMusic = t + 0.45 + Math.random() * 0.6;
    } else if (st === 3) { // music box random walk
      this.musicStep += Math.random() < 0.5 ? 1 : -1;
      this.musicStep = Math.max(0, Math.min(12, this.musicStep));
      const f = midi(scaleNote(72, this.musicStep));
      this.tone(f, t + 0.05, 2.2, { vol: 0.05, out: this.music }); this.tone(f * 2, t + 0.05, 1.1, { vol: 0.015, out: this.music });
      this.nextMusic = t + (Math.random() < 0.2 ? 0.9 : 0.45);
    } else this.nextMusic = t + 0.5;
  }

  // Sonar ping (the scanner while submerged).
  sonar() {
    if (!this.ctx) return;
    const t = this.t;
    this.tone(1250, t, 1.6, { vol: 0.09, out: this.sfx });
    this.tone(1250, t + 0.9, 1.2, { vol: 0.03, out: this.sfx });
  }

  // A hammer knock from someone building nearby (vol 0..1, pan -1..1).
  knock(vol, pan = 0) {
    if (!this.ctx || vol < 0.02) return;
    const t = this.t, ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; o.connect(g).connect(p).connect(this.sfx); } else o.connect(g).connect(this.sfx);
    o.start(t); o.stop(t + 0.15);
  }

  update(dt, s) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.t;
    this.under.frequency.setTargetAtTime(s.underwater ? 520 : 20000, t, 0.15);
    this.hov.type = s.sub ? 'triangle' : 'sine';
    const sp = Math.abs(s.speed);
    this.wind.g.gain.setTargetAtTime(0.05 + Math.min(0.3, sp * 0.008) + s.altitude * 0.0012 + (s.drone ? 0.05 : 0), t, 0.3);
    this.wind.f.frequency.setTargetAtTime(380 + sp * 18 + Math.sin(t * 0.3) * 120, t, 0.3);
    this.rain.g.gain.setTargetAtTime(s.rain * 0.22, t, 0.8);
    this.waves.g.gain.setTargetAtTime(s.water * (0.25 + 0.15 * Math.sin(t * 0.45)), t, 0.5);
    const hov = s.hover;
    this.eng.gain.setTargetAtTime(s.drone ? 0.02 : (0.05 + Math.min(0.09, sp * 0.004)) * (1 - hov), t, 0.15);
    this.o1.frequency.setTargetAtTime(36 + sp * 1.5, t, 0.2);
    this.o2.frequency.setTargetAtTime(72 + sp * 3, t, 0.2);
    this.hovG.gain.setTargetAtTime(Math.max(hov, s.sub ? 1 : 0) * (0.02 + sp * 0.0008) * (s.sub ? 1.6 : 1), t, 0.2);
    this.hov.frequency.setTargetAtTime(s.sub ? 90 + sp * 5 : 200 + sp * 6, t, 0.2);

    if (t > this.nextBird) {
      if (!s.underwater && Math.random() < s.birds * s.daylight) this.bird(Math.random() * 1.6 - 0.8);
      this.nextBird = t + 0.8 + Math.random() * 3.5;
    }
    if (t > this.nextCricket) {
      if (!s.underwater && Math.random() < s.crickets * (1 - s.daylight)) this.cricket(Math.random() * 1.6 - 0.8);
      this.nextCricket = t + 0.25 + Math.random() * 0.8;
    }
    this.music_();
  }
}

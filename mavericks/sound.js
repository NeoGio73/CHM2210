// The sound of the place, all made in the browser (Web Audio, no recordings):
// - the sea: a low wash that rises and falls slowly
// - each breaking wave: a deep roar and the hiss of whitewater, louder the nearer and bigger it is
// - the lip landing: a thump, felt more than heard, near or far
// - wind in your ears as you go fast, the rail hissing in a turn, paddling splashes
// - under water after a wipeout: everything muffled
// Browsers only let sound start after a click or a key, so start() is called on the first one.

export class Sound {
  constructor() { this.on = true; this.ctx = null; this.lastThump = 0; this.stroke = 0; }

  start() {
    if (this.ctx || !this.on) { this.ctx?.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    // two seconds of noise, looped: white, and a brown (deep) one made by summing it
    const len = 2 * c.sampleRate, white = c.createBuffer(1, len, c.sampleRate), brown = c.createBuffer(1, len, c.sampleRate);
    const w = white.getChannelData(0), b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { w[i] = Math.random() * 2 - 1; last = (last + 0.02 * w[i]) / 1.02; b[i] = last * 3.5; }
    this.white = white;
    const loop = (buf, rate = 1) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(); return s; };
    const filt = (type, f, q = 0.7) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
    const gain = v => { const g = c.createGain(); g.gain.value = v; return g; };
    // everything goes through a master gain and a lowpass that closes under water
    this.master = gain(0.9); this.under = filt('lowpass', 18000); this.under.connect(this.master); this.master.connect(c.destination);
    const chain = (src, ...nodes) => { let n = src; for (const x of nodes) { n.connect(x); n = x; } n.connect(this.under); return nodes[nodes.length - 1]; };
    this.sea = chain(loop(brown, 0.9), filt('lowpass', 500), gain(0));
    this.roar = chain(loop(brown, 0.6), filt('lowpass', 220), gain(0));
    this.hiss = chain(loop(white, 1), filt('bandpass', 1400, 0.5), gain(0));
    this.wind = chain(loop(white, 0.8), filt('bandpass', 700, 0.4), gain(0));
    this.rail = chain(loop(white, 1.2), filt('bandpass', 3200, 1.2), gain(0));
  }

  setOn(v) {
    this.on = v;
    if (!this.ctx) { if (v) this.start(); return; }
    this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  // a short burst of filtered noise (a splash, a thump's crack); `low` adds a falling sine for weight
  burst(level, f, dur, low = 0) {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.white; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.6;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.01); g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    s.connect(bp); bp.connect(g); g.connect(this.under); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    if (low > 0) {
      const o = c.createOscillator(), og = c.createGain();
      o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + dur * 1.5);
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(low, t + 0.02); og.gain.exponentialRampToValueAtTime(1e-4, t + dur * 1.5);
      o.connect(og); og.connect(this.under); o.start(t); o.stop(t + dur * 1.5 + 0.05);
    }
  }

  // s: { roar 0..1, hiss 0..1, speed m/s (the listener's own), steer 0..1, paddling, underwater,
  //      impacts: [loudness 0..1, ...] (lips that landed since the last frame), sea 0..1 }
  update(dt, s) {
    this.last = s;
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, k = 0.12;
    this.sea.gain.setTargetAtTime(0.18 * (s.sea ?? 1) * (0.75 + 0.25 * Math.sin(t * 0.37)), t, 0.5);
    this.roar.gain.setTargetAtTime(Math.min(1.2, 1.1 * s.roar), t, k);
    this.hiss.gain.setTargetAtTime(Math.min(0.5, 0.45 * s.hiss), t, k);
    const wv = Math.min(1, (s.speed / 22) ** 2);
    this.wind.gain.setTargetAtTime(0.35 * wv, t, 0.2);
    this.rail.gain.setTargetAtTime(0.25 * Math.min(1, s.steer * s.speed / 15), t, 0.06);
    this.under.frequency.setTargetAtTime(s.underwater ? 350 : 18000, t, s.underwater ? 0.05 : 0.6);
    // the lip landing: one thump at a time, for the loudest
    const imp = Math.max(0, ...(s.impacts || []));
    if (imp > 0.03 && t - this.lastThump > 0.35) { this.lastThump = t; this.burst(0.5 * imp, 300, 0.9, 0.9 * imp); }
    // paddling: a splash at each hand's entry
    if (s.paddling) { this.stroke += dt * 5.5 / Math.PI; if (this.stroke >= 1) { this.stroke -= 1; this.burst(0.12, 1800, 0.25); } }
    else this.stroke = 0.7;
  }
}

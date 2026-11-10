// All sound is synthesized with WebAudio; there are no audio files.
const NOTE = n => 261.63 * Math.pow(2, n / 12); // semitones from middle C

// A bouncy four-bar loop, eighth notes. null = rest.
const CHORDS = [0, 5, 7, 0];
const MELODY = [
  [4, 7, null, 4, 0, null, 2, 4],
  [5, 9, null, 5, 12, null, 9, 5],
  [7, 11, null, 7, 14, null, 11, 7],
  [4, 7, 12, null, 7, 4, 0, null],
];
const BASS = [0, null, 7, null, 0, null, 7, 12];

export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.step = 0; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // engine: two detuned oscillators through a lowpass
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 500;
    this.engA = ctx.createOscillator(); this.engA.type = 'sawtooth';
    this.engB = ctx.createOscillator(); this.engB.type = 'square'; this.engB.detune.value = -1195;
    this.engA.connect(this.engFilter); this.engB.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.engA.start(); this.engB.start();

    // tyre squeal: looping filtered noise
    this.skidGain = ctx.createGain(); this.skidGain.gain.value = 0;
    const sk = ctx.createBufferSource(); sk.buffer = nb; sk.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 6;
    sk.connect(bp); bp.connect(this.skidGain); this.skidGain.connect(this.master); sk.start();

    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
    this.nextNote = ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 100);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.7;
    return this.muted;
  }

  schedule() {
    const ctx = this.ctx, dur = 60 / 132 / 2;
    if (ctx.state !== 'running') { this.nextNote = ctx.currentTime + 0.1; return; }
    while (this.nextNote < ctx.currentTime + 0.3) {
      const bar = Math.floor(this.step / 8) % 4, i = this.step % 8, t = this.nextNote;
      const m = MELODY[bar][i], b = BASS[i];
      if (m !== null) this.tone(NOTE(m), dur * 0.9, 'triangle', 0.09, null, t, this.musicGain);
      if (b !== null) this.tone(NOTE(CHORDS[bar] + b - 24), dur * 0.8, 'square', 0.035, null, t, this.musicGain);
      if (i % 2 === 1) this.noise(0.03, 0.03, 6000, t, this.musicGain);
      this.step++;
      this.nextNote += dur;
    }
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, at = null, out = null) {
    const ctx = this.ctx; if (!ctx) return;
    const t = at ?? ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out || this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol, cutoff = 1000, at = null, out = null) {
    const ctx = this.ctx; if (!ctx) return;
    const t = at ?? ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(out || this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  engine(ratio, throttle) {
    const ctx = this.ctx; if (!ctx) return;
    const r = Math.max(0, Math.min(1.4, ratio));
    const gear = Math.min(3, Math.floor(r * 4)), frac = r * 4 - gear;
    const f = 52 + gear * 13 + frac * 62;
    const t = ctx.currentTime;
    this.engA.frequency.setTargetAtTime(f, t, 0.05);
    this.engB.frequency.setTargetAtTime(f, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(350 + r * 900 + throttle * 300, t, 0.1);
    this.engGain.gain.setTargetAtTime(0.05 + Math.abs(throttle) * 0.04, t, 0.1);
  }

  skid(amount) {
    if (!this.ctx) return;
    this.skidGain.gain.setTargetAtTime(Math.max(0, Math.min(0.12, (amount - 5) * 0.012)), this.ctx.currentTime, 0.05);
  }

  quiet() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(0, t, 0.1);
    this.skidGain.gain.setTargetAtTime(0, t, 0.05);
  }

  play(name, n = 1) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'splat': // squeaky toy + pop
        this.tone(700 + Math.random() * 300, 0.09, 'sine', 0.3, 1900);
        this.tone(1900, 0.14, 'sine', 0.22, 500, t + 0.09);
        this.noise(0.12, 0.3, 1400);
        break;
      case 'combo':
        this.tone(NOTE(Math.min(n, 12) * 2), 0.18, 'square', 0.12, null, t + 0.12);
        break;
      case 'crash': this.noise(0.35, Math.min(0.6, 0.2 + n * 0.02), 900); this.tone(90, 0.2, 'square', 0.15, 40); break;
      case 'thud': this.noise(0.12, 0.25, 500); break;
      case 'clank': this.noise(0.15, 0.25, 3500); this.tone(520, 0.2, 'triangle', 0.12, 260); break;
      case 'boing': this.tone(140, 0.4, 'sine', 0.35, 420); break;
      case 'cookie': this.tone(NOTE(12), 0.07, 'square', 0.1); this.tone(NOTE(19), 0.1, 'square', 0.1, null, t + 0.07); break;
      case 'power': [0, 4, 7, 12, 16].forEach((s, i) => this.tone(NOTE(s), 0.14, 'triangle', 0.2, null, t + i * 0.07)); break;
      case 'bad': [7, 3, 0, -5].forEach((s, i) => this.tone(NOTE(s - 12), 0.18, 'sawtooth', 0.12, null, t + i * 0.1)); break;
      case 'checkpoint': this.tone(NOTE(12), 0.15, 'triangle', 0.25); this.tone(NOTE(19), 0.3, 'triangle', 0.25, null, t + 0.12); break;
      case 'horn': this.tone(392, 0.4, 'square', 0.12); this.tone(494, 0.4, 'square', 0.12); break;
      case 'wreck': this.noise(1.2, 0.7, 500); this.tone(120, 0.9, 'sawtooth', 0.25, 30); break;
      case 'beep': this.tone(n ? 880 : 440, n ? 0.5 : 0.18, 'square', 0.15); break;
      case 'win': [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => this.tone(NOTE(s), 0.25, 'triangle', 0.25, null, t + i * 0.13)); break;
      case 'lose': [0, -1, -2, -3, -9].forEach((s, i) => this.tone(NOTE(s - 12), 0.35, 'sawtooth', 0.15, null, t + i * 0.22)); break;
      case 'repair': this.tone(300, 0.25, 'triangle', 0.2, 900); break;
    }
  }
}

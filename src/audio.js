// ── Web Audio: chiptune tracker + synthesized SFX (zero asset files) ─────

const NOTE = (() => {
  // name -> frequency map, C2..B6
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const map = {};
  for (let oct = 1; oct <= 7; oct++) {
    names.forEach((n, i) => {
      const midi = (oct + 1) * 12 + i;
      map[n + oct] = 440 * Math.pow(2, (midi - 69) / 12);
    });
  }
  return map;
})();

// ── Song data: [bass(square)], [melody(triangle-ish)], [drums] per 16th ──
// '.' = rest, '-' = sustain previous
const BATTLE = {
  bpm: 152,
  bass: ('C2.C2.G2.C2.C2.C2.A#1.G1.' + 'C2.C2.G2.C2.D#2.D#2.F2.G2.' +
         'A#1.A#1.F2.A#1.A#1.A#1.G#1.F1.' + 'G1.G1.D2.G1.F2.D#2.D2.B1.').split('.').filter(s => s.length),
  melody: ('C4-D#4-G4-C5-A#4-G4-D#4-' + 'F4-G4-G#4-G4-F4-D#4-D4-D#4-' +
           'A#3-D4-F4-A#4-G#4-F4-D4-' + 'G4-F4-D4-B3-D4-F4-G4-B4-').match(/([A-G]#?\d|-)/g),
  drums: 'K.h.S.h.K.K.S.h.K.h.S.h.K.h.S.S.'.repeat(2).split('.').filter(s => s.length),
};
const MENU = {
  bpm: 120,
  bass: ('C2.G2.E2.G2.F2.C3.A2.C3.' + 'D2.A2.F2.A2.G2.D3.B2.G2.').split('.').filter(s => s.length),
  melody: ('E4-G4-C5-G4-A4-C5-F4-A4-' + 'D4-F4-A4-F4-G4-B4-D5-B4-').match(/([A-G]#?\d|-)/g),
  drums: 'K...h...S...h...'.repeat(2).split('').filter(c => c !== ''),
};

class Tracker {
  constructor(ac, out) {
    this.ac = ac; this.out = out;
    this.song = null; this.step = 0; this.nextTime = 0;
    this.timer = null;
    this.beatCallback = null;
  }
  play(song) {
    this.stop();
    this.song = song;
    this.step = 0;
    this.nextTime = this.ac.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.song = null;
  }
  schedule() {
    if (!this.song) return;
    const stepDur = 60 / this.song.bpm / 4;     // 16th note
    while (this.nextTime < this.ac.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
  }
  playStep(step, t, dur) {
    const s = this.song, ac = this.ac;
    const b = s.bass[step % s.bass.length];
    if (b && b !== '.' && b !== '-' && NOTE[b]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square'; o.frequency.value = NOTE[b];
      g.gain.setValueAtTime(0.10, t);
      g.gain.exponentialRampToValueAtTime(0.02, t + dur * 0.9);
      o.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + dur * 0.95);
    }
    const m = s.melody[step % s.melody.length];
    if (m && m !== '-' && NOTE[m]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = NOTE[m] * 2;
      g.gain.setValueAtTime(0.085, t);
      g.gain.exponentialRampToValueAtTime(0.015, t + dur * 1.8);
      o.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + dur * 1.9);
    }
    const d = s.drums[step % s.drums.length];
    if (d === 'K') this.kick(t);
    else if (d === 'S') this.snare(t);
    else if (d === 'h') this.hat(t);
    if (step % 4 === 0 && this.beatCallback) {
      const delay = Math.max(0, (t - ac.currentTime) * 1000);
      setTimeout(() => this.beatCallback && this.beatCallback(), delay);
    }
  }
  kick(t) {
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.1);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + 0.13);
  }
  snare(t) {
    const ac = this.ac;
    const n = makeNoise(ac, 0.12), g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1400;
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    n.connect(f); f.connect(g); g.connect(this.out);
    n.start(t);
  }
  hat(t) {
    const ac = this.ac;
    const n = makeNoise(ac, 0.04), g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 6000;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.005, t + 0.03);
    n.connect(f); f.connect(g); g.connect(this.out);
    n.start(t);
  }
}

let noiseBuf = null;
function makeNoise(ac, dur) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const origStart = src.start.bind(src);
  src.start = (t) => origStart(t, Math.random() * 0.5, dur + 0.05);
  return src;
}

export class AudioEngine {
  constructor() {
    this.ac = null;
    this.master = null;
    this.tracker = null;
    this.muted = false;
  }
  ensure() {
    if (this.ac) {
      if (this.ac.state === 'suspended') this.ac.resume();
      return true;
    }
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.85;
      const comp = this.ac.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(this.ac.destination);
      this.tracker = new Tracker(this.ac, this.master);
      return true;
    } catch { return false; }
  }
  toggleMute() {
    if (!this.master) return;
    this.muted = !this.muted;
    this.master.gain.value = this.muted ? 0 : 0.85;
  }
  music(which) { // 'battle' | 'menu' | null
    if (!this.ensure()) return;
    if (which === 'battle') this.tracker.play(BATTLE);
    else if (which === 'menu') this.tracker.play(MENU);
    else this.tracker.stop();
  }
  onBeat(cb) { if (this.tracker) this.tracker.beatCallback = cb; }

  // ── SFX ────────────────────────────────────────────────────────────────
  sfx(name) {
    if (!this.ac || this.muted) return;
    const ac = this.ac, t = ac.currentTime, out = this.master;
    const env = (g, v0, dur) => {
      g.gain.setValueAtTime(v0, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    };
    switch (name) {
      case 'light': { // short high noise burst
        const n = makeNoise(ac, 0.06), g = ac.createGain(), f = ac.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 1.2;
        env(g, 0.5, 0.07);
        n.connect(f); f.connect(g); g.connect(out); n.start(t);
        break;
      }
      case 'heavy': { // deep noise + pitch-dropping square crunch
        const n = makeNoise(ac, 0.14), g = ac.createGain(), f = ac.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 1200;
        env(g, 0.7, 0.16);
        n.connect(f); f.connect(g); g.connect(out); n.start(t);
        const o = ac.createOscillator(), g2 = ac.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(420, t);
        o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
        env(g2, 0.35, 0.13);
        o.connect(g2); g2.connect(out); o.start(t); o.stop(t + 0.14);
        break;
      }
      case 'whiff': { // bandpassed noise sweep
        const n = makeNoise(ac, 0.1), g = ac.createGain(), f = ac.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 4;
        f.frequency.setValueAtTime(500, t);
        f.frequency.exponentialRampToValueAtTime(3200, t + 0.09);
        env(g, 0.22, 0.1);
        n.connect(f); f.connect(g); g.connect(out); n.start(t);
        break;
      }
      case 'block': {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(160, t + 0.06);
        env(g, 0.25, 0.08);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.09);
        break;
      }
      case 'special': { // sparkly shot
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(700, t);
        o.frequency.exponentialRampToValueAtTime(1500, t + 0.12);
        env(g, 0.22, 0.16);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.17);
        break;
      }
      case 'superGo': { // cinematic ascending laser sweep
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
        env(g, 0.4, 0.55);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.56);
        const o2 = ac.createOscillator(), g2 = ac.createGain();
        o2.type = 'square';
        o2.frequency.setValueAtTime(240, t + 0.05);
        o2.frequency.exponentialRampToValueAtTime(4800, t + 0.5);
        env(g2, 0.2, 0.5);
        o2.connect(g2); g2.connect(out); o2.start(t + 0.05); o2.stop(t + 0.56);
        break;
      }
      case 'superHit': {
        this.sfx('heavy');
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(900, t);
        o.frequency.exponentialRampToValueAtTime(80, t + 0.3);
        env(g, 0.4, 0.32);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.33);
        break;
      }
      case 'jump': {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(300, t);
        o.frequency.exponentialRampToValueAtTime(620, t + 0.1);
        env(g, 0.12, 0.11);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.12);
        break;
      }
      case 'land': {
        const n = makeNoise(ac, 0.05), g = ac.createGain(), f = ac.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 500;
        env(g, 0.15, 0.06);
        n.connect(f); f.connect(g); g.connect(out); n.start(t);
        break;
      }
      case 'thud': {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        env(g, 0.5, 0.18);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.19);
        break;
      }
      case 'ko': {
        this.sfx('heavy');
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(1200, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.6);
        env(g, 0.45, 0.62);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.63);
        break;
      }
      case 'round': { // announcer sting
        [440, 554, 659].forEach((f0, i) => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = 'square'; o.frequency.value = f0;
          const tt = t + i * 0.09;
          g.gain.setValueAtTime(0.16, tt);
          g.gain.exponentialRampToValueAtTime(0.01, tt + 0.18);
          o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.2);
        });
        break;
      }
      case 'win': {
        [523, 659, 784, 1047].forEach((f0, i) => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = 'triangle'; o.frequency.value = f0;
          const tt = t + i * 0.12;
          g.gain.setValueAtTime(0.2, tt);
          g.gain.exponentialRampToValueAtTime(0.01, tt + 0.3);
          o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.32);
        });
        break;
      }
      case 'move': {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square'; o.frequency.value = 880;
        env(g, 0.1, 0.05);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.06);
        break;
      }
      case 'select': {
        [660, 990].forEach((f0, i) => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = 'square'; o.frequency.value = f0;
          const tt = t + i * 0.06;
          g.gain.setValueAtTime(0.14, tt);
          g.gain.exponentialRampToValueAtTime(0.01, tt + 0.09);
          o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.1);
        });
        break;
      }
      case 'timer': {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square'; o.frequency.value = 1320;
        env(g, 0.12, 0.05);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.06);
        break;
      }
      default: break;
    }
  }
}

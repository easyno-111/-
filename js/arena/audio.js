// 칩튠 오디오 엔진: 효과음 + 4채널 시퀀서(펄스·펄스·삼각파 베이스·노이즈) + 심장박동
import { clamp } from "./util.js?v=8.5";

const NOTE_BASE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
export function noteFreq(name) {
  if (!name) return 0;
  const m = String(name).match(/^([A-G]#?)(-?\d)$/);
  if (!m) return 0;
  const midi = 12 * (Number(m[2]) + 1) + NOTE_BASE[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 패턴: 64스텝(16분음표 × 4마디). null은 쉼.
function bar(root, octave, pattern) {
  return pattern.map((p) => (p == null ? null : p === "r" ? `${root}${octave}` : p === "R" ? `${root}${octave + 1}` : p));
}
const RACE_BASS = [
  ...bar("A", 2, ["r", null, "r", "r", null, "r", null, "R", "r", null, "r", "r", null, "r", "R", null]),
  ...bar("F", 2, ["r", null, "r", "r", null, "r", null, "R", "r", null, "r", "r", null, "r", "R", null]),
  ...bar("G", 2, ["r", null, "r", "r", null, "r", null, "R", "r", null, "r", "r", null, "r", "R", null]),
  ...bar("E", 2, ["r", null, "r", "r", null, "r", null, "R", "r", null, "r", "r", null, "r", "R", "G2"])
];
const RACE_ARP = [
  "A4", "C5", "E5", "A5", "E5", "C5", "A4", "C5", "E5", "A5", "C6", "A5", "E5", "C5", "A4", "E4",
  "F4", "A4", "C5", "F5", "C5", "A4", "F4", "A4", "C5", "F5", "A5", "F5", "C5", "A4", "F4", "C4",
  "G4", "B4", "D5", "G5", "D5", "B4", "G4", "B4", "D5", "G5", "B5", "G5", "D5", "B4", "G4", "D4",
  "E4", "G#4", "B4", "E5", "B4", "G#4", "E4", "G#4", "B4", "E5", "G#5", "E5", "B4", "G#4", "E4", "B3"
];
const RACE_LEAD = [
  "A5", null, null, "C6", null, null, "E6", null, "D6", null, "C6", null, "B5", null, null, null,
  "C6", null, null, "A5", null, null, "F5", null, "A5", null, null, null, "C6", null, "D6", null,
  "B5", null, null, "D6", null, null, "G5", null, "B5", null, "D6", null, "G6", null, null, null,
  "E6", null, null, "B5", null, null, "G#5", null, "B5", null, "E6", null, null, null, "E5", null
];
const LOTTO_BASS = [
  "A2", null, null, null, null, null, null, null, "A2", null, null, null, "E2", null, null, null,
  "A2", null, null, null, null, null, null, null, "A2", null, null, null, "G2", null, null, null,
  "F2", null, null, null, null, null, null, null, "F2", null, null, null, "C3", null, null, null,
  "E2", null, null, null, null, null, null, null, "E2", null, "E2", null, "E2", null, "E2", null
];
const LOTTO_PULSE = [
  "A4", null, "C5", null, "A4", null, "C5", null, "A4", null, "C5", null, "E5", null, "C5", null,
  "A4", null, "C5", null, "A4", null, "C5", null, "A4", null, "D5", null, "C5", null, "B4", null,
  "F4", null, "A4", null, "F4", null, "A4", null, "F4", null, "A4", null, "C5", null, "A4", null,
  "E4", null, "G#4", null, "E4", null, "G#4", null, "B4", null, "G#4", null, "E5", null, "G#5", null
];

export class ArenaAudio {
  constructor() {
    this.enabled = true;
    this.musicEnabled = true;
    this.ctx = null;
    this.master = null; this.sfxGain = null; this.musicGain = null;
    this.track = null; this.bpm = 112; this.intensity = 0;
    this.step = 0; this.nextStepTime = 0; this.timer = 0;
    this.lastPeg = 0;
    this.heartNext = 0;
  }
  ensure() {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 1; this.sfxGain.connect(this.master);
        this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0; this.musicGain.connect(this.master);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    } catch { return null; }
  }
  // ---- 기본 합성 ----
  tone(freq, duration, type = "square", gain = 0.05, opts = {}) {
    const ac = this.ensure(); if (!ac || freq <= 0) return;
    const t0 = ac.currentTime + (opts.delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + (opts.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    o.connect(g); g.connect(opts.dest || this.sfxGain);
    o.start(t0); o.stop(t0 + duration + 0.02);
  }
  noise(duration, gain = 0.05, opts = {}) {
    const ac = this.ensure(); if (!ac) return;
    const t0 = ac.currentTime + (opts.delay || 0);
    const len = Math.max(1, Math.floor(ac.sampleRate * duration));
    const buffer = ac.createBuffer(1, len, ac.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buffer;
    const filter = ac.createBiquadFilter(); filter.type = opts.type || "highpass"; filter.frequency.setValueAtTime(opts.freq || 1200, t0);
    if (opts.sweepTo) filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + duration);
    const g = ac.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter); filter.connect(g); g.connect(opts.dest || this.sfxGain);
    src.start(t0); src.stop(t0 + duration + 0.02);
  }
  kick(delay = 0, gain = 0.16, dest) { this.tone(150, 0.16, "sine", gain, { slideTo: 42, delay, dest }); }
  snare(delay = 0, gain = 0.07, dest) { this.noise(0.12, gain, { freq: 1800, delay, dest }); this.tone(190, 0.08, "triangle", gain * 0.6, { slideTo: 120, delay, dest }); }
  hat(delay = 0, gain = 0.025, dest) { this.noise(0.035, gain, { freq: 7000, delay, dest }); }

  // ---- 효과음 ----
  sfx(name, arg = 0) {
    if (!this.enabled) return;
    switch (name) {
      case "ui": this.tone(640, 0.06, "square", 0.025); break;
      case "count": this.tone(420 + arg * 60, 0.12, "square", 0.05); this.kick(0, 0.2); break;
      case "go": this.tone(520, 0.24, "sawtooth", 0.07, { slideTo: 1040 }); this.noise(0.22, 0.06, { freq: 900, sweepTo: 6000 }); this.kick(0, 0.22); break;
      case "peg": {
        const now = performance.now(); if (now - this.lastPeg < 38) return; this.lastPeg = now;
        this.tone(1100 + Math.random() * 500, 0.035, "square", 0.012); break;
      }
      case "bumper": this.tone(240, 0.11, "square", 0.045, { slideTo: 110 }); this.noise(0.05, 0.03, { freq: 2500 }); break;
      case "booster": this.tone(300, 0.18, "sawtooth", 0.045, { slideTo: 900 }); break;
      case "gate": this.tone(180, 0.09, "triangle", 0.04, { slideTo: 90 }); break;
      case "eject": this.tone(330, 0.09, "square", 0.03, { slideTo: 220 }); break;
      case "teamFull": this.tone(430 + arg * 45, 0.14, "triangle", 0.05); this.tone(860 + arg * 45, 0.18, "square", 0.03, { delay: 0.08 }); break;
      case "assign": this.tone(700, 0.07, "square", 0.03); this.tone(1050, 0.09, "square", 0.025, { delay: 0.06 }); break;
      case "slowmo": this.tone(420, 0.35, "sine", 0.05, { slideTo: 110 }); break;
      case "shutter": this.noise(0.06, 0.08, { freq: 3000 }); this.tone(2200, 0.05, "square", 0.03); break;
      case "goal": {
        const place = arg || 1;
        this.noise(0.3, 0.09, { freq: 600, sweepTo: 4000 }); this.kick(0, 0.24);
        [0, 0.09, 0.18].forEach((d, i) => this.tone((520 + place * 60) * Math.pow(2, i / 12 * (i === 2 ? 7 : 4)), 0.22, "square", 0.05, { delay: d }));
        this.tone(980 + place * 70, 0.5, "triangle", 0.05, { delay: 0.27 });
        break;
      }
      case "suck": this.noise(0.6, 0.05, { type: "bandpass", freq: 300, sweepTo: 2600 }); this.tone(160, 0.6, "sine", 0.035, { slideTo: 640 }); break;
      case "tick": this.tone(1200 + arg * 40, 0.03, "square", 0.028); break;
      case "crack": this.noise(0.25, 0.12, { freq: 500, sweepTo: 5000 }); this.kick(0, 0.25); this.tone(1400, 0.12, "square", 0.05, { slideTo: 2600 }); break;
      case "reveal": [0, 0.1, 0.2, 0.3].forEach((d, i) => this.tone(660 * Math.pow(2, [0, 4, 7, 12][i] / 12), 0.3, "square", 0.045, { delay: d })); this.tone(1320, 0.7, "triangle", 0.05, { delay: 0.4 }); break;
      case "stamp": this.kick(0, 0.2); this.noise(0.08, 0.06, { freq: 1500 }); this.tone(220, 0.08, "square", 0.04, { slideTo: 110 }); break;
      case "rescue": this.tone(520, 0.08, "square", 0.025); this.tone(780, 0.08, "square", 0.025, { delay: 0.07 }); break;
      case "shuffle": for (let i = 0; i < 6; i++) this.tone(300 + Math.random() * 600, 0.05, "square", 0.02, { delay: i * 0.05 }); break;
      case "done": this.tone(660, 0.18, "triangle", 0.07); this.tone(880, 0.24, "sine", 0.07, { delay: 0.17 }); break;
      case "error": this.tone(200, 0.15, "square", 0.04, { slideTo: 120 }); break;
    }
  }
  // 심장박동: interval(ms) 간격으로 두 번 쿵쿵. 매 프레임 호출해도 됨.
  heartbeat(now, intervalMs, gain = 0.2) {
    if (!this.enabled) return;
    if (now < this.heartNext) return;
    this.heartNext = now + intervalMs;
    this.tone(62, 0.14, "sine", gain, { slideTo: 38 });
    this.tone(58, 0.12, "sine", gain * 0.7, { slideTo: 34, delay: 0.16 });
  }
  victory() {
    if (!this.enabled) return;
    const seq = [["C5", 0], ["E5", 0.11], ["G5", 0.22], ["C6", 0.33], ["G5", 0.5], ["C6", 0.62]];
    seq.forEach(([n, d]) => { this.tone(noteFreq(n), 0.22, "square", 0.05, { delay: d }); this.tone(noteFreq(n) / 2, 0.22, "triangle", 0.05, { delay: d }); });
    this.tone(noteFreq("E6"), 0.9, "triangle", 0.06, { delay: 0.78 });
    this.noise(0.5, 0.05, { freq: 2000, sweepTo: 200, delay: 0.78 });
  }

  // ---- 시퀀서 ----
  playTrack(name, intensity = 0) {
    if (!this.enabled || !this.musicEnabled) { this.track = name; return; }
    const ac = this.ensure(); if (!ac) return;
    this.track = name; this.intensity = intensity;
    this.bpm = name === "shuffle" ? 96 : 118;
    this.musicGain.gain.cancelScheduledValues(ac.currentTime);
    this.musicGain.gain.setTargetAtTime(0.5, ac.currentTime, 0.4);
    if (!this.timer) {
      this.step = 0; this.nextStepTime = ac.currentTime + 0.05;
      this.timer = setInterval(() => this._schedule(), 25);
    }
  }
  setIntensity(v) {
    this.intensity = clamp(v, 0, 1);
    const base = this.track === "shuffle" ? 96 : 118, span = this.track === "shuffle" ? 44 : 40;
    this.bpm = base + span * this.intensity;
  }
  duck(level = 0.12, time = 0.3) { if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(level, this.ctx.currentTime, time); }
  unduck() { if (this.musicGain && this.ctx && this.musicEnabled && this.track) this.musicGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.4); }
  stopTrack(fade = 0.6) {
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    const stopAt = performance.now() + fade * 1000 + 200;
    const check = () => { if (performance.now() >= stopAt && !this.track) { clearInterval(this.timer); this.timer = 0; } else if (!this.track) setTimeout(check, 120); };
    this.track = null; setTimeout(check, 120);
  }
  _schedule() {
    const ac = this.ctx; if (!ac || !this.track || !this.musicEnabled) return;
    while (this.nextStepTime < ac.currentTime + 0.12) {
      this._playStep(this.step % 64, this.nextStepTime - ac.currentTime);
      this.nextStepTime += 60 / this.bpm / 4;
      this.step++;
    }
  }
  _playStep(i, delay) {
    const inten = this.intensity, dest = this.musicGain, beat = i % 4, bar16 = i % 16;
    if (this.track === "race" || this.track === "teams") {
      const bass = RACE_BASS[i]; if (bass) this.tone(noteFreq(bass), 0.13, "triangle", 0.16, { delay, dest });
      if (bar16 % 4 === 0) this.kick(delay, 0.14, dest);
      if (bar16 === 4 || bar16 === 12) this.snare(delay, 0.05, dest);
      if (inten > 0.72 && (bar16 === 14 || bar16 === 15)) this.snare(delay, 0.035, dest);
      if (beat === 0 || (inten > 0.45 && beat === 2)) this.hat(delay, 0.018, dest);
      if (inten > 0.3) { const a = RACE_ARP[i]; if (a) this.tone(noteFreq(a), 0.1, "square", 0.03 * Math.min(1, (inten - 0.3) * 3), { delay, dest }); }
      if (inten > 0.6) { const l = RACE_LEAD[i]; if (l) this.tone(noteFreq(l), 0.26, "square", 0.045, { delay, dest }); }
    } else if (this.track === "shuffle") {
      const bass = LOTTO_BASS[i]; if (bass) this.tone(noteFreq(bass), 0.4, "triangle", 0.17, { delay, dest });
      if (inten > 0.35 && bar16 % 4 === 0) this.kick(delay, 0.1 + 0.08 * inten, dest);
      if (beat === 0) this.hat(delay, 0.012 + inten * 0.02, dest);
      if (inten > 0.55 && beat === 2) this.hat(delay, 0.015, dest);
      const p = LOTTO_PULSE[i];
      if (p && (inten > 0.15 || beat === 0)) this.tone(noteFreq(p), 0.12, "square", 0.022 + inten * 0.03, { delay, dest });
      if (inten > 0.8 && bar16 === 12) this.snare(delay, 0.045, dest);
    }
  }
}


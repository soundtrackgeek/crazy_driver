import type { AudioEngine } from './AudioEngine';

/** Synthesised one-shot sound effects. */
export class Sfx {
  constructor(private audio: AudioEngine) {}

  private get ctx() {
    return this.audio.ctx;
  }

  private env(gain: GainNode, t: number, peak: number, attack: number, decay: number) {
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.25) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    this.env(g, start, vol, 0.005, dur);
    osc.connect(g).connect(this.audio.sfx);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private noiseBurst(start: number, dur: number, filter: BiquadFilterType, freq: number, vol: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.audio.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    this.env(g, start, vol, 0.003, dur);
    src.connect(f).connect(g).connect(this.audio.sfx);
    src.start(start, Math.random());
    src.stop(start + dur + 0.05);
  }

  /** Menu cursor blip. */
  tick() {
    this.tone(990, this.ctx.currentTime, 0.04, 'square', 0.08);
  }

  /** Menu confirm. */
  select() {
    const t = this.ctx.currentTime;
    this.tone(660, t, 0.06, 'square', 0.12);
    this.tone(990, t + 0.06, 0.1, 'square', 0.12);
  }

  /** Countdown beep: low for 3-2-1, high for GO. */
  beep(go = false) {
    const t = this.ctx.currentTime;
    this.tone(go ? 880 : 440, t, go ? 0.6 : 0.25, 'square', 0.22);
  }

  checkpoint() {
    const t = this.ctx.currentTime;
    [659, 784, 988].forEach((f, i) => this.tone(f, t + i * 0.07, 0.18, 'square', 0.16));
  }

  lap(final = false) {
    const t = this.ctx.currentTime;
    const notes = final ? [523, 659, 784, 1047, 784, 1047] : [523, 784, 1047];
    notes.forEach((f, i) => this.tone(f, t + i * 0.09, 0.2, 'square', 0.16));
  }

  finish() {
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, t + i * 0.12, 0.35, 'square', 0.16));
    this.tone(1047, t + 0.7, 0.9, 'triangle', 0.2);
  }

  /** Metal crunch + thud, scaled by impact speed in m/s. */
  impact(speed: number) {
    const t = this.ctx.currentTime;
    const v = Math.min(1, speed / 15);
    this.noiseBurst(t, 0.12 + v * 0.25, 'bandpass', 1800 - v * 600, 0.35 + v * 0.6);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    this.env(g, t, 0.4 + v * 0.5, 0.002, 0.25);
    osc.connect(g).connect(this.audio.sfx);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** Suspension thump on landing. */
  landing(strength: number) {
    const t = this.ctx.currentTime;
    const v = Math.min(1, strength);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.15);
    this.env(g, t, 0.3 + v * 0.5, 0.002, 0.2);
    osc.connect(g).connect(this.audio.sfx);
    osc.start(t);
    osc.stop(t + 0.25);
    this.noiseBurst(t, 0.08, 'lowpass', 600, 0.2 + v * 0.3);
  }

  /** Gearbox "clunk". */
  shift() {
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.05, 'bandpass', 2500, 0.12);
    this.tone(120, t, 0.05, 'triangle', 0.12);
  }

  wrongWay() {
    const t = this.ctx.currentTime;
    this.tone(180, t, 0.25, 'sawtooth', 0.12);
    this.tone(150, t + 0.28, 0.35, 'sawtooth', 0.12);
  }
}

/** Race announcer via the browser's speech synthesis (optional, falls back to silence). */
export class Announcer {
  constructor(private audio: AudioEngine) {}

  say(text: string) {
    if (!this.audio.settings.announcer || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = 0.6;
    u.rate = 1.1;
    u.volume = Math.min(1, this.audio.settings.master * this.audio.settings.sfx * 1.2);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
}

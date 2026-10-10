import type { AudioEngine } from './AudioEngine';
import { midiToFreq, noteToMidi } from './Synth';

export type Instrument = 'bass' | 'lead' | 'arp' | 'pad' | 'kick' | 'snare' | 'hat';

/**
 * A pattern is a set of channels, each a list of step tokens (16 steps per bar):
 *   "A2"  play a note       "-"  hold the previous note       "."  rest
 *   "x"   hit (drums)       "X"  accented hit
 */
export interface Pattern {
  channels: Partial<Record<Instrument, string[]>>;
}

export interface Song {
  title: string;
  bpm: number;
  patterns: Record<string, Pattern>;
  order: string[];
}

/** Split a step string like "A2 . - E3" into tokens. */
export const steps = (s: string) => s.trim().split(/\s+/);

/** Number of steps in a pattern (its longest channel). */
export const patternLength = (p: Pattern) => Math.max(...Object.values(p.channels).map((c) => c?.length ?? 0));

/** Validate a song: every token must be a rest, hold, hit or parseable note. */
export function validateSong(song: Song) {
  const problems: string[] = [];
  for (const name of song.order) if (!song.patterns[name]) problems.push(`order refers to missing pattern ${name}`);
  for (const [name, p] of Object.entries(song.patterns)) {
    const len = patternLength(p);
    for (const [inst, tokens] of Object.entries(p.channels)) {
      if (!tokens) continue;
      if (tokens.length !== len) problems.push(`${name}.${inst}: ${tokens.length} steps, expected ${len}`);
      for (const t of tokens) {
        if (t === '.' || t === '-' || t === 'x' || t === 'X') continue;
        if (Number.isNaN(noteToMidi(t))) problems.push(`${name}.${inst}: bad token "${t}"`);
      }
    }
  }
  return problems;
}

/**
 * Minimal tracker-style sequencer with synthesised instruments. Notes are
 * scheduled slightly ahead of time on the audio clock for sample-accurate timing.
 */
export class TrackerPlayer {
  onEnded: (() => void) | null = null;
  private timer: number | null = null;
  private song: Song | null = null;
  private orderIndex = 0;
  private step = 0;
  private nextTime = 0;
  private out: GainNode;

  constructor(private audio: AudioEngine) {
    this.out = audio.ctx.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(audio.music);
  }

  get playing() {
    return this.timer !== null;
  }

  play(song: Song) {
    this.stop();
    this.song = song;
    this.orderIndex = 0;
    this.step = 0;
    this.nextTime = this.audio.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const song = this.song!;
    const stepDur = 60 / song.bpm / 4;
    while (this.nextTime < this.audio.ctx.currentTime + 0.15) {
      const pattern = song.patterns[song.order[this.orderIndex]];
      for (const [inst, tokens] of Object.entries(pattern.channels) as [Instrument, string[]][]) {
        const tok = tokens[this.step];
        if (!tok || tok === '.' || tok === '-') continue;
        // Note length = this step plus following holds.
        let len = 1;
        while (tokens[this.step + len] === '-') len++;
        this.trigger(inst, tok, this.nextTime, len * stepDur);
      }
      this.nextTime += stepDur;
      this.step++;
      if (this.step >= patternLength(pattern)) {
        this.step = 0;
        this.orderIndex++;
        if (this.orderIndex >= song.order.length) {
          this.stop();
          // Let the last notes ring before moving on.
          window.setTimeout(() => this.onEnded?.(), 600);
          return;
        }
      }
    }
  }

  private trigger(inst: Instrument, tok: string, t: number, dur: number) {
    const ctx = this.audio.ctx;
    const accent = tok === 'X' ? 1.4 : 1;
    const freq = midiToFreq(noteToMidi(tok));
    const gain = ctx.createGain();
    gain.connect(this.out);
    const env = (peak: number, attack: number, release: number, hold = 0) => {
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + attack);
      gain.gain.setValueAtTime(peak, t + attack + hold);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
      return t + attack + hold + release + 0.05;
    };
    const osc = (type: OscillatorType, f: number, end: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      o.start(t);
      o.stop(end);
      return o;
    };
    const noise = (end: number) => {
      const s = ctx.createBufferSource();
      s.buffer = this.audio.noise;
      s.start(t, Math.random());
      s.stop(end);
      return s;
    };

    switch (inst) {
      case 'bass': {
        const end = env(0.5, 0.005, 0.12, Math.max(0, dur - 0.08));
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.Q.value = 6;
        f.frequency.setValueAtTime(1600, t);
        f.frequency.exponentialRampToValueAtTime(280, t + 0.18);
        osc('sawtooth', freq, end).connect(f);
        osc('square', freq / 2, end).connect(f);
        f.connect(gain);
        break;
      }
      case 'lead': {
        const end = env(0.16, 0.01, 0.15, Math.max(0, dur - 0.05));
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 3200;
        const o1 = osc('square', freq, end, -7);
        const o2 = osc('sawtooth', freq, end, 7);
        o1.connect(f);
        o2.connect(f);
        // Vibrato fading in on held notes.
        if (dur > 0.3) {
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = 5.5;
          depth.gain.setValueAtTime(0, t);
          depth.gain.linearRampToValueAtTime(freq * 0.012, t + dur);
          lfo.connect(depth);
          depth.connect(o1.frequency);
          depth.connect(o2.frequency);
          lfo.start(t);
          lfo.stop(end);
        }
        f.connect(gain);
        break;
      }
      case 'arp': {
        const end = env(0.09, 0.003, 0.12);
        osc('square', freq, end).connect(gain);
        break;
      }
      case 'pad': {
        const end = env(0.06, 0.25, 0.4, Math.max(0, dur - 0.3));
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1200;
        osc('sawtooth', freq, end, -10).connect(f);
        osc('sawtooth', freq, end, 10).connect(f);
        f.connect(gain);
        break;
      }
      case 'kick': {
        const end = env(0.9 * accent, 0.002, 0.22);
        const o = osc('sine', 150, end);
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        o.connect(gain);
        break;
      }
      case 'snare': {
        const end = env(0.4 * accent, 0.002, 0.16);
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 1200;
        noise(end).connect(f).connect(gain);
        const body = ctx.createGain();
        body.gain.value = 0.5;
        osc('triangle', 190, t + 0.08).connect(body).connect(gain);
        break;
      }
      case 'hat': {
        const end = env(0.12 * accent, 0.001, tok === 'X' ? 0.12 : 0.035);
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 7500;
        noise(end).connect(f).connect(gain);
        break;
      }
    }
  }
}

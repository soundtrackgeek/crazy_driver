import { whiteNoise } from './Synth';

export type MusicMode = 'builtin' | 'custom' | 'all';

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  musicMode: MusicMode;
  announcer: boolean;
}

const STORAGE_KEY = 'crazy-driver.audio';
const DEFAULTS: AudioSettings = { master: 0.8, music: 0.5, sfx: 0.8, musicMode: 'all', announcer: true };

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Owns the AudioContext and the mix: music and sfx buses → master → limiter.
 * Browsers start audio suspended until a user gesture, so the context is
 * resumed on the first key press / touch.
 */
export class AudioEngine {
  readonly ctx = new AudioContext({ latencyHint: 'interactive' });
  readonly master = this.ctx.createGain();
  readonly music = this.ctx.createGain();
  readonly sfx = this.ctx.createGain();
  readonly noise: AudioBuffer;
  readonly settings = loadSettings();
  private unlockCallbacks: (() => void)[] = [];

  constructor() {
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 8;
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(limiter).connect(this.ctx.destination);
    this.applyVolumes();

    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    this.noise.copyToChannel(whiteNoise(len, 99), 0);

    const unlock = () => {
      void this.ctx.resume().then(() => {
        for (const cb of this.unlockCallbacks.splice(0)) cb();
      });
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  get unlocked() {
    return this.ctx.state === 'running';
  }

  /** Run once audio is allowed to play (immediately if it already is). */
  onUnlock(cb: () => void) {
    if (this.unlocked) cb();
    else this.unlockCallbacks.push(cb);
  }

  set<K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) {
    this.settings[key] = value;
    this.applyVolumes();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // storage unavailable (private mode): settings just won't persist
    }
  }

  private applyVolumes() {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.master, t, 0.02);
    this.music.gain.setTargetAtTime(this.settings.music, t, 0.02);
    this.sfx.gain.setTargetAtTime(this.settings.sfx, t, 0.02);
  }

  /** Looping white-noise source (shared buffer, random start so layers don't correlate). */
  noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(0, Math.random() * 2);
    return src;
  }
}

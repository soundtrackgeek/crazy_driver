/** Pure sample-generation helpers (no Web Audio), so they can be unit-tested. */

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" → 69, "C#3" → 49, "Bb2" → 46. Returns NaN for anything else. */
export function noteToMidi(note: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) return NaN;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + NOTE_INDEX[m[1]] + acc;
}

export const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function lcg(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function whiteNoise(length: number, seed = 1) {
  const rnd = lcg(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rnd() * 2 - 1;
  return out;
}

export interface EngineWaveOptions {
  firingHz: number; // firing frequency of the loop (rpm / 60 * cylinders / 2)
  cycles: number; // firing events in the loop; more = less obviously repetitive
  brightness: number; // 0..1, amount of upper harmonics (on-load growl)
  roughness: number; // 0..1, cycle-to-cycle amplitude jitter
  seed: number;
}

/**
 * A seamless loop of engine firing pulses. Each pulse is a decaying mix of
 * low harmonics; alternate cylinders differ slightly, which gives the lumpy
 * sub-harmonic "burble" of a real 4-cylinder. Played back with a variable
 * playbackRate, pitch follows rpm.
 */
export function engineWave(sampleRate: number, o: EngineWaveOptions) {
  const L = Math.round(sampleRate / o.firingHz);
  const out = new Float32Array(L * o.cycles);
  const rnd = lcg(o.seed);
  const noise = whiteNoise(out.length, o.seed + 7);
  for (let c = 0; c < o.cycles; c++) {
    const amp = (c % 2 ? 0.9 : 1) * (1 + (rnd() - 0.5) * o.roughness);
    for (let i = 0; i < L; i++) {
      const t = i / L;
      const decay = Math.exp(-t * 5);
      let v =
        Math.sin(2 * Math.PI * t) * 0.55 +
        Math.sin(2 * Math.PI * t * 2) * 0.35 * decay +
        Math.sin(2 * Math.PI * t * 3) * 0.3 * decay * (0.4 + o.brightness) +
        Math.sin(2 * Math.PI * t * 5) * 0.25 * decay * o.brightness +
        Math.sin(2 * Math.PI * t * 9) * 0.12 * decay * o.brightness;
      v += noise[c * L + i] * 0.12 * Math.exp(-t * 12) * (0.5 + o.brightness);
      out[c * L + i] = v * amp;
    }
  }
  // Remove DC and normalise.
  let mean = 0;
  for (const v of out) mean += v;
  mean /= out.length;
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] -= mean;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < out.length; i++) out[i] *= 0.8 / peak;
  return out;
}

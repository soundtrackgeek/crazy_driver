import { SURFACES } from '../physics/Ground';
import type { Track } from '../track/Track';

const G = 9.81;

/**
 * Precomputed AI guidance for a track: a lateral racing-line offset per sample
 * (towards the inside of corners, smoothed so cars turn in early and apex) and
 * a maximum cornering speed per sample.
 */
export class RacingLine {
  readonly offset: Float32Array; // + = right of centre line
  readonly maxSpeed: Float32Array; // m/s

  constructor(readonly track: Track) {
    const n = track.samples.length;
    const raw = new Float32Array(n);
    track.samples.forEach((s, i) => {
      const room = s.width / 2 - 1.8;
      raw[i] = Math.max(-1, Math.min(1, s.curvature * 150)) * room;
    });
    this.offset = smooth(smooth(raw, 14), 10);
    track.samples.forEach((s, i) => {
      const room = s.width / 2 - 1.6;
      this.offset[i] = Math.max(-room, Math.min(room, this.offset[i]));
    });

    // Corner speed from v² = μ g r, using smoothed curvature (the racing line straightens corners).
    const curv = smooth(Float32Array.from(track.samples, (s) => Math.abs(s.curvature)), 6);
    this.maxSpeed = new Float32Array(n);
    track.samples.forEach((s, i) => {
      const mu = 1.25 * SURFACES[s.surface].grip;
      const effective = Math.max(curv[i] * 0.8, 1e-4);
      this.maxSpeed[i] = Math.min(75, Math.sqrt((mu * G) / effective));
    });
  }

  private index(dist: number) {
    const L = this.track.length;
    const n = this.track.samples.length;
    return Math.round(((((dist % L) + L) % L) / L) * n) % n;
  }

  offsetAt(dist: number) {
    return this.offset[this.index(dist)];
  }

  maxSpeedAt(dist: number) {
    return this.maxSpeed[this.index(dist)];
  }
}

/** Circular moving average (the track is a loop). */
function smooth(src: Float32Array, radius: number) {
  const n = src.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[(i + k + n) % n];
    out[i] = sum / (radius * 2 + 1);
  }
  return out;
}

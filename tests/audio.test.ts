import { describe, expect, it } from 'vitest';
import { engineWave, midiToFreq, noteToMidi } from '../src/audio/Synth';
import { SONGS } from '../src/audio/songs';
import { patternLength, validateSong } from '../src/audio/Tracker';

describe('notes', () => {
  it('parses note names', () => {
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('C#3')).toBe(49);
    expect(noteToMidi('Bb1')).toBe(34);
    expect(noteToMidi('H2')).toBeNaN();
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });
});

describe('engineWave', () => {
  it('is a seamless, normalised loop of whole firing cycles', () => {
    const sr = 48000;
    const w = engineWave(sr, { firingHz: 100, cycles: 48, brightness: 0.8, roughness: 0.25, seed: 3 });
    expect(w.length).toBe(480 * 48);
    let peak = 0;
    let mean = 0;
    for (const v of w) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
      mean += v;
    }
    expect(peak).toBeCloseTo(0.8, 5);
    expect(Math.abs(mean / w.length)).toBeLessThan(0.01);
    // Loop seam: last and first samples are close (each cycle restarts its waveform).
    expect(Math.abs(w[w.length - 1] - w[0])).toBeLessThan(0.3);
  });
});

describe('songs', () => {
  for (const song of SONGS) {
    it(`"${song.title}" is valid and a sensible length`, () => {
      expect(validateSong(song)).toEqual([]);
      const totalSteps = song.order.reduce((a, name) => a + patternLength(song.patterns[name]), 0);
      const seconds = (totalSteps * 60) / song.bpm / 4;
      expect(seconds).toBeGreaterThan(60);
      expect(seconds).toBeLessThan(300);
    });
  }
});

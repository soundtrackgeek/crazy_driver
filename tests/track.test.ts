import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Track } from '../src/track/Track';
import { TrackGround } from '../src/track/TrackGround';
import { parseTrack, type TrackData } from '../src/track/TrackData';
import { Vehicle } from '../src/physics/Vehicle';
import type { Controls } from '../src/engine/Input';

const load = () => parseTrack(JSON.parse(readFileSync('public/assets/tracks/test-circuit.track.json', 'utf8')));

/** Clockwise oval, flat, width 12, with a straight along x = 0 (driving +Z). */
const square: TrackData = {
  version: 1,
  name: 'oval',
  theme: 'test',
  closed: true,
  laps: 1,
  controlPoints: [
    { p: [0, 0, 0] },
    { p: [0, 0, 50] },
    { p: [0, 0, 100] },
    { p: [-50, 0, 140] },
    { p: [-100, 0, 100] },
    { p: [-100, 0, 50] },
    { p: [-100, 0, 0] },
    { p: [-50, 0, -40] },
  ],
};

describe('parseTrack', () => {
  it('rejects bad input', () => {
    expect(() => parseTrack({ version: 2 })).toThrow();
    expect(() => parseTrack({ version: 1, controlPoints: [{ p: [0, 0, 0] }] })).toThrow();
  });
  it('fills defaults', () => {
    const t = parseTrack({ version: 1, controlPoints: square.controlPoints });
    expect(t.laps).toBe(3);
    expect(t.closed).toBe(true);
  });
});

describe('Track', () => {
  const track = new Track(square);

  it('samples the closed loop by arc length', () => {
    expect(track.length).toBeGreaterThan(400);
    expect(track.length).toBeLessThan(650);
    const gaps = track.samples.map((s, i) => s.pos.distanceTo(track.sample(i + 1).pos));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.2);
  });

  it('this clockwise loop turns right (positive curvature)', () => {
    const total = track.samples.reduce((a, s) => a + s.curvature * track.length / track.samples.length, 0);
    expect(total).toBeCloseTo(2 * Math.PI, 1);
  });

  it('locates points with signed lateral offset (+ = right)', () => {
    // At the start the car drives +Z, so its right is -X.
    const l = track.locate(-3, 50, null);
    expect(l.lateral).toBeCloseTo(3, 0);
    expect(track.locate(4, 50, null).lateral).toBeCloseTo(-4, 0);
    expect(l.dist).toBeGreaterThan(40);
    expect(l.dist).toBeLessThan(60);
  });

  it('hinted locate matches global locate', () => {
    const hint = { index: 0 };
    for (const s of track.samples.filter((_, i) => i % 7 === 0)) {
      const p = s.pos.clone().addScaledVector(s.right, 2.5);
      const a = { ...track.locate(p.x, p.z, hint) };
      const b = track.locate(p.x, p.z, null);
      expect(a.dist).toBeCloseTo(b.dist, 3);
      expect(a.lateral).toBeCloseTo(2.5, 1);
    }
  });
});

describe('TrackGround', () => {
  it('banks the road: right side lower for positive bank', () => {
    const t = new Track({ ...square, controlPoints: square.controlPoints.map((c) => ({ ...c, bank: 10 })) });
    const g = new TrackGround(t);
    const s = t.samples[5];
    const r = s.pos.clone().addScaledVector(s.right, 5);
    const l = s.pos.clone().addScaledVector(s.right, -5);
    expect(g.height(r.x, r.z)).toBeLessThan(g.height(l.x, l.z) - 1);
  });

  it('reports walls beyond the shoulder with a normal pointing back', () => {
    const g = new TrackGround(new Track(square));
    expect(g.wall(-5, 50)).toBeNull();
    const hit = g.wall(-12, 50)!; // right of the first straight
    expect(hit).not.toBeNull();
    expect(hit.nx).toBeGreaterThan(0.9);
  });

  it('keeps a car that steers into the wall inside the track', () => {
    const track = new Track(square);
    const g = new TrackGround(track);
    const v = new Vehicle(g);
    v.reset(new THREE.Vector3(0, 0, 30), 0);
    const c: Controls = { steer: 1, throttle: 1, brake: 0, handbrake: false, reset: false };
    let worst = 0;
    for (let i = 0; i < 6 * 120; i++) {
      v.step(1 / 120, c);
      const l = track.locate(v.pos.x, v.pos.z, null);
      worst = Math.max(worst, Math.abs(l.lateral) - TrackGround.wallOffset(l.width));
    }
    expect(worst).toBeLessThan(0.5);
  });
});

describe('test circuit', () => {
  it('loads and builds', () => {
    const track = new Track(load());
    expect(track.length).toBeGreaterThan(1500);
    expect(track.samples.some((s) => s.surface === 'gravel')).toBe(true);
  });
});

describe('Track.locate global search', () => {
  it('bucket search finds the same nearest point as a full scan', () => {
    const track = new Track(load());
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 300; k++) {
      const x = -500 + rnd() * 700;
      const z = -400 + rnd() * 800;
      const l = track.locate(x, z, null);
      const brute = Math.min(...track.samples.map((s) => (s.pos.x - x) ** 2 + (s.pos.z - z) ** 2));
      expect(l.distanceSq).toBeLessThanOrEqual(brute + 1e-6);
    }
  });
});

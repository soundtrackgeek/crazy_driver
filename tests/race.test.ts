import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Track } from '../src/track/Track';
import { RaceState, formatTime, type RaceEvent } from '../src/game/RaceState';
import type { TrackData } from '../src/track/TrackData';

const oval: TrackData = {
  version: 1,
  name: 'oval',
  theme: 'test',
  closed: true,
  laps: 2,
  controlPoints: [
    { p: [0, 0, 0] }, { p: [0, 0, 50] }, { p: [0, 0, 100] }, { p: [-50, 0, 140] },
    { p: [-100, 0, 100] }, { p: [-100, 0, 50] }, { p: [-100, 0, 0] }, { p: [-50, 0, -40] },
  ],
};
const track = new Track(oval);
const vel = new THREE.Vector3();

/** Drive the race state along the centre line from `from` to `to` metres. */
function drive(race: RaceState, from: number, to: number, step = 2) {
  const events: RaceEvent[] = [];
  for (let d = from; d <= to; d += step) {
    const s = track.sampleAtDist(d);
    vel.copy(s.tangent).multiplyScalar(30);
    events.push(...race.update(0.1, s.pos, vel));
  }
  return events;
}

describe('RaceState', () => {
  it('counts laps only after all checkpoints, then finishes', () => {
    const race = new RaceState(track);
    const L = track.length;
    const ev = drive(race, -20, 2 * L + 10);
    expect(ev.filter((e) => e === 'start')).toHaveLength(1);
    expect(ev.filter((e) => e === 'checkpoint')).toHaveLength(6);
    expect(ev).toContain('lap');
    expect(ev.at(-1)).toBe('finish');
    expect(race.finished).toBe(true);
    expect(race.bestLap).toBeGreaterThan(0);
  });

  it('does not count a lap when checkpoints are skipped (cutting back over the line)', () => {
    const race = new RaceState(track);
    drive(race, -20, 30); // start
    expect(race.lap).toBe(1);
    // Reverse back over the line and forward again: no checkpoints, no new lap.
    for (let d = 30; d >= -30; d -= 2) race.update(0.1, track.sampleAtDist(d).pos, vel.set(0, 0, 0));
    const ev = drive(race, -30, 20);
    expect(ev).not.toContain('lap');
    expect(race.lap).toBe(1);
  });

  it('flags wrong way after a second of driving backwards', () => {
    const race = new RaceState(track);
    for (let i = 0; i < 15; i++) {
      const s = track.sampleAtDist(100 - i);
      race.update(0.1, s.pos, vel.copy(s.tangent).multiplyScalar(-10));
    }
    expect(race.wrongWay).toBe(true);
  });

  it('formats times', () => {
    expect(formatTime(83.456)).toBe('01:23.46');
    expect(formatTime(null)).toBe('--:--.--');
  });
});

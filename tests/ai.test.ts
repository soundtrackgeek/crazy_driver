import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Track } from '../src/track/Track';
import { TrackGround } from '../src/track/TrackGround';
import { parseTrack } from '../src/track/TrackData';
import { Vehicle } from '../src/physics/Vehicle';
import { RacingLine } from '../src/game/RacingLine';
import { AIDriver } from '../src/game/AIDriver';
import { RaceState } from '../src/game/RaceState';
import { collideCars } from '../src/physics/CarCollisions';

const DT = 1 / 120;
const track = new Track(parseTrack(JSON.parse(readFileSync('public/assets/tracks/test-circuit.track.json', 'utf8'))));
const line = new RacingLine(track);

function spawn(dist: number, lateral = 0) {
  const v = new Vehicle(new TrackGround(track));
  const s = track.sampleAtDist(dist);
  v.reset(s.pos.clone().addScaledVector(s.right, lateral), Math.atan2(s.tangent.x, s.tangent.z));
  return v;
}

describe('RacingLine', () => {
  it('stays inside the road and is slower in the hairpin than on the straight', () => {
    track.samples.forEach((s, i) => expect(Math.abs(line.offset[i])).toBeLessThan(s.width / 2));
    expect(line.maxSpeedAt(60)).toBeGreaterThan(line.maxSpeedAt(track.length * 0.5) + 5);
  });
});

describe('AIDriver', () => {
  it('completes a lap of the test circuit without help', () => {
    const v = spawn(-20);
    const ai = new AIDriver(track, line, v, { skill: 1, lineOffset: 0, aggression: 0.5 });
    const race = new RaceState(track, 1);
    let respawns = 0;
    const origRespawn = v.respawn.bind(v);
    v.respawn = () => {
      respawns++;
      origRespawn();
    };
    let t = 0;
    while (!race.finished && t < 150) {
      v.step(DT, ai.update(DT));
      race.update(DT, v.pos, v.vel);
      t += DT;
    }
    expect(race.finished).toBe(true);
    expect(respawns).toBe(0);
    // A decent lap on a ~1.65 km circuit.
    expect(race.lastLap!).toBeLessThan(85);
    console.info(`AI lap: ${race.lastLap!.toFixed(2)} s`);
  });
});

describe('collideCars', () => {
  it('separates overlapping cars and bounces them apart', () => {
    const a = spawn(100, -1);
    const b = spawn(100, 1);
    // Lateral +1 is to the right (-X here), so B sits at lower x: move them towards each other.
    a.vel.set(-5, 0, 0);
    b.vel.set(5, 0, 0);
    collideCars([a, b]);
    const gap = a.pos.distanceTo(b.pos);
    expect(gap).toBeGreaterThan(1.9);
    expect(b.vel.clone().sub(a.vel).dot(new THREE.Vector3().subVectors(b.pos, a.pos))).toBeGreaterThanOrEqual(0);
    expect(a.wallHit).toBeGreaterThan(0);
  });
});

describe('AI pack race', () => {
  it('six cars from a grid with collisions all finish 2 laps', () => {
    const cars = Array.from({ length: 6 }, (_, k) => {
      const v = spawn(-14 - Math.floor(k / 2) * 9, k % 2 === 0 ? -3 : 3);
      const skill = 0.86 + k * 0.024;
      return { v, ai: new AIDriver(track, line, v, { skill, lineOffset: (k % 3) - 1, aggression: 0.5 }), race: new RaceState(track, 2), respawns: 0 };
    });
    for (const c of cars) {
      const orig = c.v.respawn.bind(c.v);
      c.v.respawn = () => {
        c.respawns++;
        orig();
      };
    }
    let t = 0;
    while (cars.some((c) => !c.race.finished) && t < 240) {
      for (const c of cars) c.v.step(DT, c.ai.update(DT));
      collideCars(cars.map((c) => c.v));
      for (const c of cars) c.race.update(DT, c.v.pos, c.v.vel);
      t += DT;
    }
    const summary = cars.map((c) => `${c.race.finished ? c.race.time.toFixed(1) : 'DNF'}s/${c.respawns}r`).join(' ');
    console.info(`pack: ${summary}`);
    expect(cars.every((c) => c.race.finished)).toBe(true);
    expect(cars.reduce((a, c) => a + c.respawns, 0)).toBeLessThanOrEqual(3);
  });
});

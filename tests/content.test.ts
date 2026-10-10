import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Track } from '../src/track/Track';
import { TrackGround } from '../src/track/TrackGround';
import { parseTrack } from '../src/track/TrackData';
import { validateTrack } from '../src/track/Validate';
import { Vehicle } from '../src/physics/Vehicle';
import { RacingLine } from '../src/game/RacingLine';
import { AIDriver } from '../src/game/AIDriver';
import { RaceState } from '../src/game/RaceState';
import { CARS, carParams, type CarSpec } from '../src/game/Cars';
import { THEMES } from '../src/world/Themes';

const DT = 1 / 120;
const manifest: { file: string; name: string }[] = JSON.parse(readFileSync('public/assets/tracks/index.json', 'utf8'));
const load = (file: string) => new Track(parseTrack(JSON.parse(readFileSync(`public/assets/tracks/${file}.track.json`, 'utf8'))));

/** One AI lap; returns lap time and respawn count. */
function aiLap(track: Track, car: CarSpec) {
  const v = new Vehicle(new TrackGround(track), carParams(car));
  const s = track.sampleAtDist(-20);
  v.reset(s.pos, Math.atan2(s.tangent.x, s.tangent.z));
  let respawns = 0;
  const orig = v.respawn.bind(v);
  v.respawn = () => {
    respawns++;
    orig();
  };
  const ai = new AIDriver(track, new RacingLine(track), v, { skill: 1, lineOffset: 0, aggression: 0.5 });
  const race = new RaceState(track, 1);
  let t = 0;
  while (!race.finished && t < 240) {
    v.step(DT, ai.update(DT));
    race.update(DT, v.pos, v.vel);
    t += DT;
  }
  return { lap: race.finished ? race.lastLap! : null, respawns };
}

describe('built-in tracks', () => {
  for (const entry of manifest) {
    it(`${entry.name}: valid, themed and lapped cleanly by the AI`, () => {
      const track = load(entry.file);
      expect(track.data.name).toBe(entry.name);
      expect(THEMES[track.data.theme]).toBeDefined();
      const errors = validateTrack(track).filter((i) => i.level === 'error');
      expect(errors).toEqual([]);
      const r = aiLap(track, CARS[0]);
      console.info(`${entry.name}: ${(track.length / 1000).toFixed(2)} km, AI lap ${r.lap?.toFixed(1) ?? 'DNF'} s, ${r.respawns} respawns, warnings: ${validateTrack(track).map((i) => i.message).join('; ') || 'none'}`);
      expect(r.lap).not.toBeNull();
      expect(r.respawns).toBe(0);
    });
  }
});

describe('cars', () => {
  for (const car of CARS) {
    it(`${car.name}: the AI laps the test circuit`, () => {
      const r = aiLap(load('test-circuit'), car);
      console.info(`${car.name}: ${r.lap?.toFixed(2) ?? 'DNF'} s, ${r.respawns} respawns`);
      expect(r.lap).not.toBeNull();
      expect(r.respawns).toBe(0);
    });
  }
});

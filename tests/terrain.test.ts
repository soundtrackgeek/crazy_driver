import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Track } from '../src/track/Track';
import { TrackGround } from '../src/track/TrackGround';
import { parseTrack } from '../src/track/TrackData';
import { Terrain } from '../src/world/Terrain';
import { getTheme, THEMES } from '../src/world/Themes';
import { makeNoise2D, fbm } from '../src/world/Noise';

const track = new Track(parseTrack(JSON.parse(readFileSync('public/assets/tracks/test-circuit.track.json', 'utf8'))));
const terrain = new Terrain(track, getTheme('alpine'), { cell: 8, margin: 200 });

describe('Noise', () => {
  it('is deterministic per seed and bounded', () => {
    const a = makeNoise2D(5);
    const b = makeNoise2D(5);
    const c = makeNoise2D(6);
    let diff = 0;
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37;
      const y = i * 0.11;
      expect(a(x, y)).toBe(b(x, y));
      diff += Math.abs(a(x, y) - c(x, y));
      expect(Math.abs(fbm(a, x, y))).toBeLessThanOrEqual(1);
    }
    expect(diff).toBeGreaterThan(1);
  });
});

describe('Terrain', () => {
  it('never pokes through the road or shoulders', () => {
    const ground = new TrackGround(track);
    let worst = -Infinity;
    for (const s of track.samples) {
      const wall = TrackGround.wallOffset(s.width);
      for (let d = -wall; d <= wall; d += 1.5) {
        const x = s.pos.x + s.right.x * d;
        const z = s.pos.z + s.right.z * d;
        worst = Math.max(worst, terrain.heightAt(x, z) - ground.height(x, z));
      }
    }
    expect(worst).toBeLessThan(0);
  });

  it('heightAt matches the grid vertices', () => {
    for (let k = 0; k < 50; k++) {
      const i = (k * 37) % terrain.nx;
      const j = (k * 53) % terrain.nz;
      const x = terrain.minX + i * terrain.cell;
      const z = terrain.minZ + j * terrain.cell;
      expect(terrain.heightAt(x, z)).toBeCloseTo(terrain.heights[j * terrain.nx + i], 5);
    }
  });

  it('is hilly away from the track', () => {
    const far: number[] = [];
    for (let k = 0; k < terrain.heights.length; k += 7) if (terrain.trackDistance[k] > 120) far.push(terrain.heights[k]);
    expect(Math.max(...far) - Math.min(...far)).toBeGreaterThan(15);
  });

  it('every theme has vegetation and a valid fog range', () => {
    for (const t of Object.values(THEMES)) {
      expect(Object.keys(t.vegetation).length).toBeGreaterThan(0);
      expect(t.fog.far).toBeGreaterThan(t.fog.near);
    }
  });
});

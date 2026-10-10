import * as THREE from 'three';
import { Track, newLocation } from '../track/Track';
import { TrackGround } from '../track/TrackGround';
import { fbm, hash2, makeNoise2D } from './Noise';
import type { Theme } from './Themes';

export interface TerrainOptions {
  cell?: number; // grid spacing in metres
  margin?: number; // how far the terrain extends beyond the track's bounding box
  seed?: number;
  amplitude?: number;
}

/** Flat zone beyond the wall before the landscape starts to rise or fall. */
const FLAT = 3;
/** Distance over which the landscape blends from road level to free noise. */
const BLEND = 60;
/** How far below the road edge the terrain sits near the track. */
const SINK = 0.4;
const CHUNK = 24; // cells per mesh chunk

/**
 * Heightfield landscape around a track. Far away it is fractal noise; near the
 * road it blends down to just below road level, carving cuttings and building
 * embankments so the track always sits correctly.
 */
export class Terrain {
  readonly cell: number;
  readonly minX: number;
  readonly minZ: number;
  readonly nx: number; // vertices along X
  readonly nz: number;
  readonly heights: Float32Array;
  readonly baseY: number;
  /** Lateral distance from the track for each vertex (for scatter rules). */
  readonly trackDistance: Float32Array;

  constructor(
    readonly track: Track,
    readonly theme: Theme,
    opts: TerrainOptions = {},
  ) {
    this.cell = opts.cell ?? 8;
    const margin = opts.margin ?? 450;
    const amplitude = opts.amplitude ?? track.data.terrain?.amplitude ?? theme.terrainAmplitude;
    const noise = makeNoise2D(opts.seed ?? track.data.terrain?.seed ?? 7);

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const ys: number[] = [];
    for (const s of track.samples) {
      minX = Math.min(minX, s.pos.x);
      maxX = Math.max(maxX, s.pos.x);
      minZ = Math.min(minZ, s.pos.z);
      maxZ = Math.max(maxZ, s.pos.z);
      ys.push(s.pos.y);
    }
    ys.sort((a, b) => a - b);
    this.baseY = ys[Math.floor(ys.length / 2)];
    this.minX = Math.floor((minX - margin) / this.cell) * this.cell;
    this.minZ = Math.floor((minZ - margin) / this.cell) * this.cell;
    this.nx = Math.ceil((maxX + margin - this.minX) / this.cell) + 1;
    this.nz = Math.ceil((maxZ + margin - this.minZ) / this.cell) + 1;
    this.heights = new Float32Array(this.nx * this.nz);
    this.trackDistance = new Float32Array(this.nx * this.nz);

    const loc = newLocation();
    const hint = { index: 0 };
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x = this.minX + i * this.cell;
        const z = this.minZ + j * this.cell;
        // Large rolling hills plus smaller bumps; valleys are flattened a little.
        let n = fbm(noise, x / 420, z / 420, 4);
        n = n < 0 ? n * 0.6 : n;
        const free = this.baseY + amplitude * n;

        const l = track.locate(x, z, hint, loc);
        const wall = TrackGround.wallOffset(l.width);
        const lat = Math.abs(l.lateral);
        const edge = Track.heightAt(l, THREE.MathUtils.clamp(l.lateral, -wall, wall)) - SINK;
        const t = THREE.MathUtils.smoothstep(lat - wall - FLAT, 0, BLEND);
        const k = j * this.nx + i;
        this.heights[k] = THREE.MathUtils.lerp(edge, free, t);
        this.trackDistance[k] = lat - wall;
      }
    }
  }

  private h(i: number, j: number) {
    i = THREE.MathUtils.clamp(i, 0, this.nx - 1);
    j = THREE.MathUtils.clamp(j, 0, this.nz - 1);
    return this.heights[j * this.nx + i];
  }

  /** Exact height of the rendered surface (same triangle split as the mesh). */
  heightAt(x: number, z: number) {
    const fx = (x - this.minX) / this.cell;
    const fz = (z - this.minZ) / this.cell;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const a = this.h(i, j);
    const b = this.h(i + 1, j);
    const c = this.h(i, j + 1);
    const d = this.h(i + 1, j + 1);
    if (u + v <= 1) return a + u * (b - a) + v * (c - a);
    return d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }

  /** Distance beyond the wall at (x, z), interpolated from the grid (cheap). */
  distanceFromTrack(x: number, z: number) {
    const i = THREE.MathUtils.clamp(Math.round((x - this.minX) / this.cell), 0, this.nx - 1);
    const j = THREE.MathUtils.clamp(Math.round((z - this.minZ) / this.cell), 0, this.nz - 1);
    return this.trackDistance[j * this.nx + i];
  }

  /** Flat-shaded, vertex-coloured mesh chunks. */
  buildMesh() {
    const group = new THREE.Group();
    group.name = 'terrain';
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const theme = this.theme;
    const ground = theme.ground.map((c) => new THREE.Color(c));
    const rock = new THREE.Color(theme.rock);
    const snow = theme.snow ? new THREE.Color(theme.snow.color) : null;
    const pa = new THREE.Vector3();
    const pb = new THREE.Vector3();
    const pc = new THREE.Vector3();
    const n = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const col = new THREE.Color();

    for (let cj = 0; cj < this.nz - 1; cj += CHUNK) {
      for (let ci = 0; ci < this.nx - 1; ci += CHUNK) {
        const pos: number[] = [];
        const cols: number[] = [];
        const tri = (ia: number, ja: number, ib: number, jb: number, ic: number, jc: number) => {
          pa.set(this.minX + ia * this.cell, this.h(ia, ja), this.minZ + ja * this.cell);
          pb.set(this.minX + ib * this.cell, this.h(ib, jb), this.minZ + jb * this.cell);
          pc.set(this.minX + ic * this.cell, this.h(ic, jc), this.minZ + jc * this.cell);
          n.crossVectors(e1.subVectors(pb, pa), e2.subVectors(pc, pa)).normalize();
          const y = (pa.y + pb.y + pc.y) / 3 - this.baseY;
          const r = hash2(pa.x + pc.x, pa.z + pb.z);
          if (n.y < 0.72) col.copy(rock);
          else if (snow && theme.snow && y > theme.snow.line + r * 6) col.copy(snow);
          else col.copy(ground[Math.floor(r * ground.length)]);
          // Slight per-face brightness jitter for that hand-painted 90s look.
          col.multiplyScalar(0.94 + r * 0.12);
          for (const p of [pa, pb, pc]) {
            pos.push(p.x, p.y, p.z);
            cols.push(col.r, col.g, col.b);
          }
        };
        for (let j = cj; j < Math.min(cj + CHUNK, this.nz - 1); j++) {
          for (let i = ci; i < Math.min(ci + CHUNK, this.nx - 1); i++) {
            // Same split as heightAt: (a, c, b) and (b, c, d).
            tri(i, j, i, j + 1, i + 1, j);
            tri(i + 1, j, i, j + 1, i + 1, j + 1);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        group.add(new THREE.Mesh(geo, material));
      }
    }
    return group;
  }
}

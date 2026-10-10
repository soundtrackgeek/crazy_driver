import * as THREE from 'three';
import type { Surface } from '../physics/Ground';
import { Track, type TrackSample } from './Track';
import { TrackGround } from './TrackGround';
import type { Theme } from '../world/Themes';

const C = (hex: number) => new THREE.Color(hex);
const PALETTE = {
  asphalt: [C(0x55555b), C(0x4f4f55)],
  gravel: [C(0xa89068), C(0x9a8360)],
  grass: [C(0x5a9638), C(0x4f8a32)],
  line: C(0xe8e8e8),
  kerbA: C(0xd02020),
  kerbB: C(0xf0f0f0),
  wallA: C(0xe0e0e0),
  wallB: C(0x2050c0),
  wallTop: C(0x909090),
} satisfies Record<string, THREE.Color | THREE.Color[]>;

const SURFACE_COLORS: Record<Surface, THREE.Color[]> = {
  asphalt: PALETTE.asphalt,
  gravel: PALETTE.gravel,
  grass: PALETTE.grass,
};

const WALL_HEIGHT = 1.1;
const WALL_THICK = 0.4;
const SKIRT = 1.6; // barrier outer face extends below the road to meet the terrain
const KERB = 1.2;
const KERB_CURVATURE = 1 / 120; // corners tighter than 120 m radius get kerbs
const CHUNK = 40; // samples per mesh chunk (for frustum culling)

/** One point of the road cross-section: lateral offset and height offset. */
interface ProfilePoint {
  d: number;
  h: number;
}

/**
 * Builds the visual track as chunked, flat-shaded, vertex-coloured meshes:
 * walls, shoulders, kerbs, road with edge lines and centre dashes.
 */
export function buildTrackMeshes(track: Track, theme: Theme) {
  const shoulder = theme.shoulder.map(C);
  const group = new THREE.Group();
  group.name = 'track';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const n = track.samples.length;

  for (let start = 0; start < n; start += CHUNK) {
    const end = Math.min(start + CHUNK, n); // segment [i, i+1] for i in [start, end)
    const pos: number[] = [];
    const col: number[] = [];

    for (let i = start; i < end; i++) {
      const a = track.sample(i);
      const b = track.sample(i + 1);
      const pa = profile(a);
      const pb = profile(b);
      const band = Math.floor(a.dist / 4) & 1; // alternate every 4 m for a sense of speed
      for (let k = 0; k < pa.length - 1; k++) {
        const color = bandColor(k, a, i, band, shoulder);
        quad(pos, col, point(a, pa[k]), point(a, pa[k + 1]), point(b, pb[k + 1]), point(b, pb[k]), color);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    group.add(new THREE.Mesh(geo, material));
  }

  group.add(buildStartGate(track), ...buildCheckpointGates(track));
  return group;
}

/** Cross-section from far left to far right. Indices are used by bandColor. */
function profile(s: TrackSample): ProfilePoint[] {
  const half = s.width / 2;
  const wall = TrackGround.wallOffset(s.width);
  const road = (d: number) => ({ d, h: d * s.slope });
  const wallY = (side: number) => side * wall * s.slope;
  return [
    { d: -wall - WALL_THICK, h: wallY(-1) - SKIRT }, // 0 barrier skirt
    { d: -wall - WALL_THICK, h: wallY(-1) }, // 1 wall outer face
    { d: -wall - WALL_THICK, h: wallY(-1) + WALL_HEIGHT }, // 2 wall top
    { d: -wall, h: wallY(-1) + WALL_HEIGHT }, // 3 wall inner face
    road(-wall), // 4 shoulder
    road(-half - KERB), // 5 kerb
    road(-half), // 6 edge line
    road(-half + 0.3), // 7 road
    road(-0.12), // 8 centre dash
    road(0.12), // 9 road
    road(half - 0.3), // 10 edge line
    road(half), // 11 kerb
    road(half + KERB), // 12 shoulder
    road(wall), // 13 wall inner face
    { d: wall, h: wallY(1) + WALL_HEIGHT }, // 14 wall top
    { d: wall + WALL_THICK, h: wallY(1) + WALL_HEIGHT }, // 15 wall outer face
    { d: wall + WALL_THICK, h: wallY(1) }, // 16 barrier skirt
    { d: wall + WALL_THICK, h: wallY(1) - SKIRT },
  ];
}

function bandColor(k: number, s: TrackSample, i: number, band: number, shoulder: THREE.Color[]): THREE.Color {
  const surf = SURFACE_COLORS[s.surface];
  const wallStripe = Math.floor(i / 2) & 1 ? PALETTE.wallA : PALETTE.wallB;
  const kerbStripe = i & 1 ? PALETTE.kerbA : PALETTE.kerbB;
  const leftKerb = s.curvature < -KERB_CURVATURE; // left turn: kerb on the inside (left)
  const rightKerb = s.curvature > KERB_CURVATURE;
  switch (k) {
    case 0:
    case 16:
    case 1:
    case 15:
      return wallStripe;
    case 2:
    case 14:
      return PALETTE.wallTop;
    case 3:
    case 13:
      return wallStripe;
    case 4:
    case 12:
      return shoulder[band];
    case 5:
      return leftKerb ? kerbStripe : shoulder[band];
    case 11:
      return rightKerb ? kerbStripe : shoulder[band];
    case 6:
    case 10:
      return s.surface === 'asphalt' ? PALETTE.line : surf[band];
    case 8:
      return s.surface === 'asphalt' && i % 6 < 3 ? PALETTE.line : surf[band];
    default:
      return surf[band];
  }
}

function point(s: TrackSample, p: ProfilePoint) {
  return new THREE.Vector3(s.pos.x + s.right.x * p.d, s.pos.y + p.h, s.pos.z + s.right.z * p.d);
}

/** Two triangles, wound so the face normal points up / towards the road. */
function quad(pos: number[], col: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.Color) {
  for (const v of [a, b, c, a, c, d]) {
    pos.push(v.x, v.y, v.z);
    col.push(color.r, color.g, color.b);
  }
}

function checkerTexture(cols: number, rows: number, a: number, b: number) {
  const data = new Uint8Array(cols * rows * 4);
  const ca = C(a);
  const cb = C(b);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = (x + y) & 1 ? ca : cb;
      data.set([c.r * 255, c.g * 255, c.b * 255, 255], (y * cols + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, cols, rows);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Posts + banner spanning the track at a sample, oriented across the road. */
function buildGate(s: TrackSample, bannerMat: THREE.Material, postColor: number) {
  const gate = new THREE.Group();
  const wall = TrackGround.wallOffset(s.width);
  const postMat = new THREE.MeshLambertMaterial({ color: postColor, flatShading: true });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), postMat);
    post.position.set(side * wall, 3.5 + side * wall * s.slope, 0);
    gate.add(post);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(wall * 2 + 0.6, 1.4, 0.3), bannerMat);
  banner.position.y = 6.5;
  gate.add(banner);
  gate.position.copy(s.pos);
  gate.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
  return gate;
}

function buildStartGate(track: Track) {
  const s = track.sample(0);
  const tex = checkerTexture(16, 2, 0x111111, 0xf0f0f0);
  const gate = buildGate(s, new THREE.MeshBasicMaterial({ map: tex }), 0xc02020);
  // Chequered line painted across the road.
  const lineTex = checkerTexture(Math.round(s.width), 2, 0x111111, 0xf0f0f0);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(s.width, 1.6), new THREE.MeshLambertMaterial({ map: lineTex }));
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.04;
  gate.add(line);
  return gate;
}

function buildCheckpointGates(track: Track) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffd020, flatShading: true });
  return checkpointDistances(track).map((d) => buildGate(track.sampleAtDist(d), mat, 0x303030));
}

/** Checkpoint distances along the lap, from data or 3 evenly spaced (excluding the start line). */
export function checkpointDistances(track: Track) {
  const fractions = track.data.checkpoints ?? [0.25, 0.5, 0.75];
  return fractions.map((f) => f * track.length);
}

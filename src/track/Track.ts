import * as THREE from 'three';
import type { Surface } from '../physics/Ground';
import { DEFAULT_WIDTH, type TrackData } from './TrackData';

export interface TrackSample {
  pos: THREE.Vector3;
  tangent: THREE.Vector3; // unit, direction of travel
  right: THREE.Vector3; // unit, horizontal, points to the driver's right
  slope: number; // height change per metre of lateral offset (from banking)
  width: number;
  surface: Surface;
  dist: number; // distance from the start line along the centre line
  curvature: number; // signed 1/radius, positive = right-hand turn
}

/** Result of projecting a world position onto the track. Reused between calls. */
export interface TrackLocation {
  index: number; // sample before the projection
  t: number; // 0..1 between sample index and index+1
  dist: number;
  lateral: number; // signed horizontal offset from the centre line, + = right
  centerY: number; // centre-line height at the projection
  slope: number;
  width: number;
  surface: Surface;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  distanceSq: number; // squared horizontal distance to the centre line
}

/** Distance from road edge to wall. */
export const SHOULDER = 3;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();

/**
 * A closed track built from control points: centripetal Catmull-Rom spline,
 * resampled by arc length. Every gameplay system (physics, laps, AI, minimap)
 * reads these samples.
 */
export class Track {
  readonly samples: TrackSample[] = [];
  readonly length: number;
  readonly curve: THREE.CatmullRomCurve3;

  constructor(
    readonly data: TrackData,
    readonly spacing = 2,
  ) {
    const cps = data.controlPoints;
    const n = cps.length;
    this.curve = new THREE.CatmullRomCurve3(
      cps.map((c) => new THREE.Vector3(...c.p)),
      true,
      'centripetal',
    );
    this.length = this.curve.getLength();
    const count = Math.max(8, Math.round(this.length / spacing));

    for (let i = 0; i < count; i++) {
      const u = i / count;
      const pos = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u).normalize();

      // Interpolate per-point attributes by curve parameter (smoothstep between control points).
      const tParam = this.curve.getUtoTmapping(u, 0) * n;
      const k = Math.floor(tParam) % n;
      const f = tParam - Math.floor(tParam);
      const s = f * f * (3 - 2 * f);
      const a = cps[k];
      const b = cps[(k + 1) % n];
      const width = THREE.MathUtils.lerp(a.width ?? DEFAULT_WIDTH, b.width ?? DEFAULT_WIDTH, s);
      const bank = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(a.bank ?? 0, b.bank ?? 0, s));
      const surface = (f < 0.5 ? a.surface : b.surface) ?? 'asphalt';

      const right = _a.crossVectors(tangent, WORLD_UP).normalize().clone();
      this.samples.push({ pos, tangent, right, slope: -Math.tan(bank), width, surface, dist: u * this.length, curvature: 0 });
    }

    // Signed curvature from neighbouring tangents.
    for (let i = 0; i < count; i++) {
      const prev = this.samples[(i - 1 + count) % count].tangent;
      const next = this.samples[(i + 1) % count].tangent;
      const angle = Math.atan2(prev.x * next.z - prev.z * next.x, prev.x * next.x + prev.z * next.z);
      // With +Z forward and -X right, a right turn makes this angle positive.
      this.samples[i].curvature = angle / (2 * spacing);
    }
  }

  sample(i: number) {
    const n = this.samples.length;
    return this.samples[((i % n) + n) % n];
  }

  private nearestIndex(x: number, z: number, from: number, to: number) {
    let best = -1;
    let bestD = Infinity;
    for (let i = from; i <= to; i++) {
      const p = this.sample(i).pos;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { index: ((best % this.samples.length) + this.samples.length) % this.samples.length, d: bestD };
  }

  /**
   * Project (x, z) onto the centre line. `hint` holds the last index for this
   * caller; a local search around it keeps per-frame queries cheap.
   */
  locate(x: number, z: number, hint: { index: number } | null, out: TrackLocation = newLocation()): TrackLocation {
    let near = hint ? this.nearestIndex(x, z, hint.index - 12, hint.index + 12) : null;
    if (!near || near.d > 25 * 25) near = this.nearestIndex(x, z, 0, this.samples.length - 1);
    if (hint) hint.index = near.index;

    // Project onto the segment before or after the nearest sample, whichever fits.
    let i = near.index;
    let t = this.segmentT(i, x, z);
    if (t < 0) {
      i = (i - 1 + this.samples.length) % this.samples.length;
      t = this.segmentT(i, x, z);
    }
    t = THREE.MathUtils.clamp(t, 0, 1);

    const a = this.sample(i);
    const b = this.sample(i + 1);
    const cx = a.pos.x + (b.pos.x - a.pos.x) * t;
    const cz = a.pos.z + (b.pos.z - a.pos.z) * t;
    out.index = i;
    out.t = t;
    out.dist = a.dist + t * this.spacingAt(i);
    out.centerY = a.pos.y + (b.pos.y - a.pos.y) * t;
    out.slope = a.slope + (b.slope - a.slope) * t;
    out.width = a.width + (b.width - a.width) * t;
    out.surface = t < 0.5 ? a.surface : b.surface;
    out.tangent.lerpVectors(a.tangent, b.tangent, t).normalize();
    out.right.lerpVectors(a.right, b.right, t).normalize();
    out.lateral = (x - cx) * out.right.x + (z - cz) * out.right.z;
    out.distanceSq = (x - cx) ** 2 + (z - cz) ** 2;
    return out;
  }

  /** Arc length between sample i and i+1 (the last segment wraps to the start). */
  private spacingAt(i: number) {
    return i === this.samples.length - 1 ? this.length - this.samples[i].dist : this.samples[i + 1].dist - this.samples[i].dist;
  }

  private segmentT(i: number, x: number, z: number) {
    const a = this.sample(i).pos;
    const b = this.sample(i + 1).pos;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz);
  }

  /** Height of the road surface at a lateral offset from the centre. */
  static heightAt(loc: TrackLocation, lateral: number) {
    return loc.centerY + lateral * loc.slope;
  }

  /** Sample nearest to a distance along the lap. */
  sampleAtDist(dist: number) {
    const d = ((dist % this.length) + this.length) % this.length;
    return this.sample(Math.round(d / (this.length / this.samples.length)));
  }
}

export const newLocation = (): TrackLocation => ({
  index: 0,
  t: 0,
  dist: 0,
  lateral: 0,
  centerY: 0,
  slope: 0,
  width: 0,
  surface: 'asphalt',
  tangent: new THREE.Vector3(),
  right: new THREE.Vector3(),
  distanceSq: 0,
});

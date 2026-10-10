import * as THREE from 'three';
import type { Ground, Surface, WallHit } from '../physics/Ground';
import { SHOULDER, Track, newLocation } from './Track';

/** Physics view of a track: road height with banking, surfaces, side walls and respawn. */
export class TrackGround implements Ground {
  private hint = { index: 0 };
  private loc = newLocation();
  private hit: WallHit = { nx: 0, nz: 0, penetration: 0 };

  constructor(readonly track: Track) {}

  private locate(x: number, z: number) {
    return this.track.locate(x, z, this.hint, this.loc);
  }

  static wallOffset(width: number) {
    return width / 2 + SHOULDER;
  }

  height(x: number, z: number) {
    const l = this.locate(x, z);
    const w = TrackGround.wallOffset(l.width);
    // Beyond the walls the surface simply continues flat at wall height.
    return Track.heightAt(l, THREE.MathUtils.clamp(l.lateral, -w, w));
  }

  surface(x: number, z: number): Surface {
    const l = this.locate(x, z);
    return Math.abs(l.lateral) <= l.width / 2 ? l.surface : 'grass';
  }

  wall(x: number, z: number) {
    const l = this.locate(x, z);
    const pen = Math.abs(l.lateral) - TrackGround.wallOffset(l.width);
    if (pen <= 0) return null;
    const side = Math.sign(l.lateral);
    this.hit.nx = -side * l.right.x;
    this.hit.nz = -side * l.right.z;
    this.hit.penetration = pen;
    return this.hit;
  }

  respawn(x: number, z: number) {
    const l = this.locate(x, z);
    const s = this.track.sample(l.index);
    return { pos: s.pos.clone(), yaw: Math.atan2(s.tangent.x, s.tangent.z) };
  }
}

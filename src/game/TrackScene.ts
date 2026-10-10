import * as THREE from 'three';
import type { Assets } from '../engine/Assets';
import { Track, type TrackSample } from '../track/Track';
import { TrackGround } from '../track/TrackGround';
import { buildTrackMeshes } from '../track/TrackMesh';
import { Sky } from '../world/Sky';
import { Terrain } from '../world/Terrain';
import type { Theme } from '../world/Themes';
import { qualityProfile } from './Settings';

/**
 * Everything around the road: themed light and fog, the terrain, the sky
 * backdrop, optional water and seeded props (the same track always looks the same).
 */
export function createTrackScene(track: Track, assets: Assets, theme: Theme, quality = qualityProfile('high')) {
  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(theme.fog.color);
  scene.background = fogColor;
  const fogFar = theme.fog.far * quality.fogScale;
  scene.fog = new THREE.Fog(fogColor, theme.fog.near * quality.fogScale, fogFar);

  scene.add(new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity));
  const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
  sun.position.set(...theme.sun.dir).multiplyScalar(100);
  scene.add(sun);

  // Everything beyond the fog is invisible, so the camera stops just past it and the sky fits inside.
  const farPlane = fogFar + 40;
  const sky = new Sky(theme, track.data.terrain?.seed ?? 3, farPlane * 0.95);
  scene.add(sky.group);

  const terrain = new Terrain(track, theme, { cell: quality.terrainCell });
  scene.add(terrain.buildMesh());

  if (theme.water) {
    const minY = Math.min(...track.samples.map((s) => s.pos.y));
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: theme.water.color }),
    );
    water.position.y = minY + theme.water.level;
    water.name = 'water';
    scene.add(water);
  }

  scene.add(buildTrackMeshes(track, theme));
  scene.add(new PropPlacer(track, assets, terrain, theme, quality.vegetation).build());
  return { scene, sky, terrain, farPlane };
}

class PropPlacer {
  private rnd: () => number;
  private group = new THREE.Group();
  private instances = new Map<string, THREE.Matrix4[]>();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private waterY: number;

  constructor(
    private track: Track,
    private assets: Assets,
    private terrain: Terrain,
    private theme: Theme,
    private vegetationScale = 1,
  ) {
    let seed = track.data.scenery?.seed ?? 1;
    this.rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const minY = Math.min(...track.samples.map((s) => s.pos.y));
    this.waterY = theme.water ? minY + theme.water.level + 0.3 : -Infinity;
  }

  build() {
    this.vegetation();
    this.cornerSigns();
    this.startArea();
    this.billboards();
    // One InstancedMesh per prop type per tile, so off-screen tiles are frustum-culled.
    const TILE = 250;
    const pos = new THREE.Vector3();
    for (const [name, mats] of this.instances) {
      const tiles = new Map<string, THREE.Matrix4[]>();
      for (const mat of mats) {
        pos.setFromMatrixPosition(mat);
        const key = `${Math.floor(pos.x / TILE)},${Math.floor(pos.z / TILE)}`;
        const list = tiles.get(key);
        if (list) list.push(mat);
        else tiles.set(key, [mat]);
      }
      for (const list of tiles.values()) {
        const im = new THREE.InstancedMesh(this.assets.geometry(name), this.assets.material, list.length);
        list.forEach((mat, i) => im.setMatrixAt(i, mat));
        im.computeBoundingSphere();
        this.group.add(im);
      }
    }
    this.group.name = 'props';
    return this.group;
  }

  /** Point `off` metres from the centre line (side -1 = left, +1 = right), on the terrain. */
  private spot(s: TrackSample, side: number, off: number) {
    const x = s.pos.x + s.right.x * off * side;
    const z = s.pos.z + s.right.z * off * side;
    return new THREE.Vector3(x, this.terrain.heightAt(x, z), z);
  }

  /** True if a prop of this radius doesn't overlap any part of the track. */
  private clear(p: THREE.Vector3, radius: number) {
    const l = this.track.locate(p.x, p.z, null);
    return Math.abs(l.lateral) > TrackGround.wallOffset(l.width) + 0.5 + radius;
  }

  private underWater(p: THREE.Vector3) {
    return p.y < this.waterY;
  }

  private instance(name: string, pos: THREE.Vector3, yaw: number, scale = 1) {
    this.q.setFromAxisAngle(this.up, yaw);
    const list = this.instances.get(name) ?? [];
    list.push(new THREE.Matrix4().compose(pos, this.q, new THREE.Vector3(scale, scale, scale)));
    this.instances.set(name, list);
  }

  /** Yaw that turns a prop's +Z towards a direction. */
  private static yawTo(dir: THREE.Vector3) {
    return Math.atan2(dir.x, dir.z);
  }

  /**
   * Jittered-grid scatter over the whole terrain. Dense near the track (where
   * it's seen at speed), sparse further out, none on steep slopes except rocks.
   */
  private vegetation() {
    const kinds = Object.entries(this.theme.vegetation);
    const total = kinds.reduce((a, [, w]) => a + w, 0);
    const density = (this.track.data.scenery?.density ?? 0.7) * this.theme.vegetationDensity * this.vegetationScale;
    const t = this.terrain;
    const step = 11;
    const x1 = t.minX + (t.nx - 1) * t.cell;
    const z1 = t.minZ + (t.nz - 1) * t.cell;
    for (let x = t.minX; x < x1; x += step) {
      for (let z = t.minZ; z < z1; z += step) {
        const px = x + this.rnd() * step;
        const pz = z + this.rnd() * step;
        const d = t.distanceFromTrack(px, pz);
        if (d < 4 || d > 260) continue;
        const p = d < 70 ? 0.42 : d < 140 ? 0.16 : 0.05;
        if (this.rnd() > p * density) continue;

        let pick = this.rnd() * total;
        const [name] = kinds.find(([, w]) => (pick -= w) < 0) ?? kinds[0];
        const pos = new THREE.Vector3(px, t.heightAt(px, pz), pz);
        // Slope from neighbouring heights: trees and bushes avoid cliffs.
        const slope = Math.abs(t.heightAt(px + 2, pz) - t.heightAt(px - 2, pz)) + Math.abs(t.heightAt(px, pz + 2) - t.heightAt(px, pz - 2));
        if (name !== 'rock' && slope > 2.4) continue;
        if (this.underWater(pos) || !this.clear(pos, 2.5)) continue;
        pos.y -= 0.15; // sink slightly so bases never float on slopes
        this.instance(name, pos, this.rnd() * Math.PI * 2, 0.7 + this.rnd() * 0.7);
      }
    }
  }

  /** Chevron boards on the outside of every tight bend, facing approaching cars. */
  private cornerSigns() {
    const n = this.track.samples.length;
    const tight = (i: number) => Math.abs(this.track.sample(i).curvature) > 1 / 70;
    const geo = this.assets.geometry('chevron_sign');
    for (let i = 0; i < n; i++) {
      if (!tight(i) || tight(i - 1)) continue; // start of a bend
      const s0 = this.track.sample(i);
      const right = s0.curvature > 0;
      const side = right ? -1 : 1; // outside of the bend
      for (let k = 0; k < 3; k++) {
        const s = this.track.sample(i + 4 + k * 5);
        const p = this.spot(s, side, TrackGround.wallOffset(s.width) + 1.2);
        // Separate meshes (not instances) so left bends can be mirrored safely.
        const sign = new THREE.Mesh(geo, this.assets.material);
        sign.position.copy(p);
        sign.rotation.y = PropPlacer.yawTo(s0.tangent.clone().negate());
        if (!right) sign.scale.x = -1;
        this.group.add(sign);
      }
      const apex = this.track.sample(i + 10);
      this.instance('tyre_stack', this.spot(apex, side, TrackGround.wallOffset(apex.width) + 0.8), 0);
      this.instance('tyre_stack', this.spot(apex, side, TrackGround.wallOffset(apex.width) + 1.6), 1);
    }
  }

  private startArea() {
    const g = this.track.sampleAtDist(-35);
    const gp = this.spot(g, -1, TrackGround.wallOffset(g.width) + 4.5);
    if (this.clear(gp, 6)) this.instance('grandstand', gp, PropPlacer.yawTo(g.right));
    for (let d = -120; d <= 120; d += 40) {
      const s = this.track.sampleAtDist(d);
      for (const side of [-1, 1]) {
        const p = this.spot(s, side, TrackGround.wallOffset(s.width) + 1);
        if (this.clear(p, 0.3)) this.instance('lamp_post', p, PropPlacer.yawTo(s.right.clone().multiplyScalar(-side)));
      }
    }
    for (let k = 0; k < 5; k++) {
      const s = this.track.sampleAtDist(20 + k * 3);
      this.instance('cone', this.spot(s, 1, TrackGround.wallOffset(s.width) + 2), this.rnd() * 6);
    }
    const h = this.track.sampleAtDist(60);
    const hp = this.spot(h, 1, TrackGround.wallOffset(h.width) + 18);
    if (this.clear(hp, 5)) this.instance('house', hp, PropPlacer.yawTo(h.right.clone().negate()));
  }

  private billboards() {
    let lastDist = -Infinity;
    let side = 1;
    for (const s of this.track.samples) {
      if (s.dist - lastDist < 280 || Math.abs(s.curvature) > 1 / 300 || s.dist < 150) continue;
      lastDist = s.dist;
      side = -side;
      const p = this.spot(s, side, TrackGround.wallOffset(s.width) + 6);
      if (!this.clear(p, 3.5)) continue;
      const facing = s.tangent.clone().negate().addScaledVector(s.right, -side * 0.8).normalize();
      this.instance('billboard', p, PropPlacer.yawTo(facing));
    }
    for (let k = 0; k < 6; k++) {
      const s = this.track.sample(Math.floor(this.rnd() * this.track.samples.length));
      const sd = this.rnd() < 0.5 ? -1 : 1;
      const p = this.spot(s, sd, TrackGround.wallOffset(s.width) + 22 + this.rnd() * 20);
      if (this.clear(p, 6) && !this.underWater(p)) this.instance('house', p, PropPlacer.yawTo(s.right.clone().multiplyScalar(-sd)));
    }
  }
}

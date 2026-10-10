import * as THREE from 'three';
import type { Assets } from '../engine/Assets';
import { Track, type TrackSample } from '../track/Track';
import { TrackGround } from '../track/TrackGround';
import { buildTrackMeshes } from '../track/TrackMesh';

const APRON = 40; // must match TrackMesh: grass beyond the walls drops 3 m over 40 m

/**
 * Environment around a track: sky, fog, lights, base ground, and Blender props
 * placed from the track data (seeded, so the same track always looks the same).
 * M4 replaces the flat base with real terrain.
 */
export function createTrackScene(track: Track, assets: Assets) {
  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0x9fc8f0);
  scene.background = skyColor;
  scene.fog = new THREE.Fog(skyColor, 90, 380);

  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a4a30, 1.2));
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.8);
  sun.position.set(50, 100, 30);
  scene.add(sun);

  const minY = Math.min(...track.samples.map((s) => s.pos.y));
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x467d2c }),
  );
  base.position.y = minY - 3.05;
  scene.add(base);

  scene.add(buildTrackMeshes(track));
  scene.add(new PropPlacer(track, assets).build());
  return scene;
}

class PropPlacer {
  private rnd: () => number;
  private group = new THREE.Group();
  private instances = new Map<string, THREE.Matrix4[]>();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    private track: Track,
    private assets: Assets,
  ) {
    let seed = track.data.scenery?.seed ?? 1;
    this.rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  }

  build() {
    this.vegetation();
    this.cornerSigns();
    this.startArea();
    this.billboards();
    for (const [name, mats] of this.instances) {
      const im = new THREE.InstancedMesh(this.assets.geometry(name), this.assets.material, mats.length);
      mats.forEach((mat, i) => im.setMatrixAt(i, mat));
      im.computeBoundingSphere();
      this.group.add(im);
    }
    this.group.name = 'props';
    return this.group;
  }

  /** World position `off` metres from the centre line (side -1 = left, +1 = right), on the apron. */
  private spot(s: TrackSample, side: number, off: number) {
    const wall = TrackGround.wallOffset(s.width);
    const beyond = Math.max(0, off - wall);
    const y = s.pos.y + side * wall * s.slope - 3 * Math.min(beyond, APRON) / APRON;
    return new THREE.Vector3(s.pos.x + s.right.x * off * side, y, s.pos.z + s.right.z * off * side);
  }

  /** True if a prop of this radius doesn't overlap any part of the track. */
  private clear(p: THREE.Vector3, radius: number) {
    const l = this.track.locate(p.x, p.z, null);
    return Math.abs(l.lateral) > TrackGround.wallOffset(l.width) + 0.5 + radius;
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

  private vegetation() {
    const density = this.track.data.scenery?.density ?? 0.7;
    const kinds: [string, number, number][] = [
      // name, weight, footprint radius
      ['tree_pine', 0.42, 2],
      ['tree_broadleaf', 0.28, 2.2],
      ['bush', 0.18, 1],
      ['rock', 0.12, 1.3],
    ];
    for (let i = 0; i < this.track.samples.length; i += 2) {
      if (this.rnd() > density) continue;
      const s = this.track.sample(i);
      const side = this.rnd() < 0.5 ? -1 : 1;
      const wall = TrackGround.wallOffset(s.width);
      let pick = this.rnd();
      const [name, , radius] = kinds.find(([, w]) => (pick -= w) < 0) ?? kinds[0];
      const p = this.spot(s, side, wall + 3 + radius + this.rnd() * 32);
      if (!this.clear(p, radius)) continue;
      this.instance(name, p, this.rnd() * Math.PI * 2, 0.7 + this.rnd() * 0.7);
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
      // Tyre stacks behind the barrier at the bend.
      const apex = this.track.sample(i + 10);
      this.instance('tyre_stack', this.spot(apex, side, TrackGround.wallOffset(apex.width) + 0.8), 0);
      this.instance('tyre_stack', this.spot(apex, side, TrackGround.wallOffset(apex.width) + 1.6), 1);
    }
  }

  private startArea() {
    // Grandstand on the left of the start straight, facing the track.
    const g = this.track.sampleAtDist(-35);
    const gp = this.spot(g, -1, TrackGround.wallOffset(g.width) + 4.5);
    if (this.clear(gp, 6)) this.instance('grandstand', gp, PropPlacer.yawTo(g.right));
    // Lamp posts down both sides of the straight, arms over the road.
    for (let d = -120; d <= 120; d += 40) {
      const s = this.track.sampleAtDist(d);
      for (const side of [-1, 1]) {
        const p = this.spot(s, side, TrackGround.wallOffset(s.width) + 1);
        if (this.clear(p, 0.3)) this.instance('lamp_post', p, PropPlacer.yawTo(s.right.clone().multiplyScalar(-side)));
      }
    }
    // A few cones and a house near the paddock.
    for (let k = 0; k < 5; k++) {
      const s = this.track.sampleAtDist(20 + k * 3);
      this.instance('cone', this.spot(s, 1, TrackGround.wallOffset(s.width) + 2), this.rnd() * 6);
    }
    const h = this.track.sampleAtDist(60);
    const hp = this.spot(h, 1, TrackGround.wallOffset(h.width) + 18);
    if (this.clear(hp, 5)) this.instance('house', hp, PropPlacer.yawTo(h.right.clone().negate()));
  }

  /** Billboards along straights, angled towards oncoming cars. */
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
    // A couple of houses further out.
    for (let k = 0; k < 4; k++) {
      const s = this.track.sample(Math.floor(this.rnd() * this.track.samples.length));
      const sd = this.rnd() < 0.5 ? -1 : 1;
      const p = this.spot(s, sd, TrackGround.wallOffset(s.width) + 22 + this.rnd() * 12);
      if (this.clear(p, 6)) this.instance('house', p, PropPlacer.yawTo(s.right.clone().multiplyScalar(-sd)));
    }
  }
}

import * as THREE from 'three';
import { Track } from '../track/Track';
import { TrackGround } from '../track/TrackGround';
import { buildTrackMeshes } from '../track/TrackMesh';

/**
 * M2 environment around a track: sky, fog, lights, a base ground plane and
 * seeded instanced trees beyond the walls. M4 replaces this with real terrain.
 */
export function createTrackScene(track: Track) {
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
  scene.add(buildTrees(track));
  return scene;
}

function buildTrees(track: Track) {
  const density = track.data.scenery?.density ?? 0.7;
  let seed = track.data.scenery?.seed ?? 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const geo = new THREE.ConeGeometry(1.8, 6, 5).translate(0, 3, 0);
  const max = Math.round((track.samples.length / 3) * density);
  const trees = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x2d6a2d, flatShading: true }), max);
  const m = new THREE.Matrix4();
  let count = 0;
  for (let i = 0; i < track.samples.length && count < max; i += 3) {
    if (rnd() > density) continue;
    const s = track.sample(i);
    const side = rnd() < 0.5 ? -1 : 1;
    const wall = TrackGround.wallOffset(s.width);
    const off = wall + 4 + rnd() * 30;
    const x = s.pos.x + s.right.x * off * side;
    const z = s.pos.z + s.right.z * off * side;
    // Skip spots that are close to another part of the track.
    const l = track.locate(x, z, null);
    if (Math.abs(l.lateral) < TrackGround.wallOffset(l.width) + 3) continue;
    // Apron slopes down 3 m over 40 m beyond the wall.
    const y = s.pos.y + side * wall * s.slope - 3 * ((off - wall) / 40);
    const sc = 0.7 + rnd() * 0.8;
    m.makeScale(sc, sc, sc).setPosition(x, y, z);
    trees.setMatrixAt(count++, m);
  }
  trees.count = count;
  return trees;
}

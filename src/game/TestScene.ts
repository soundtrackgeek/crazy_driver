import * as THREE from 'three';
import type { Ground, Surface } from '../physics/Ground';

const SURFACE_COLORS: Record<Surface, [THREE.Color, THREE.Color]> = {
  asphalt: [new THREE.Color(0x56565c), new THREE.Color(0x4c4c52)],
  gravel: [new THREE.Color(0xa08a62), new THREE.Color(0x917b55)],
  grass: [new THREE.Color(0x5a9638), new THREE.Color(0x4a7d30)],
};

/** M1 environment: a flat-shaded, vertex-coloured mesh built from the physics ground. */
export function createTestScene(ground: Ground) {
  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0x9fc8f0);
  scene.background = skyColor;
  scene.fog = new THREE.Fog(skyColor, 80, 350);

  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a4a30, 1.2));
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.8);
  sun.position.set(50, 100, 30);
  scene.add(sun);

  // Terrain: 2 m cells, colour per cell from the surface type in a checker pattern.
  const size = 600;
  const cell = 2;
  const segs = size / cell;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) pos.setY(i, ground.height(pos.getX(i), pos.getZ(i)));
  for (let tri = 0; tri < pos.count; tri += 3) {
    const cx = (pos.getX(tri) + pos.getX(tri + 1) + pos.getX(tri + 2)) / 3;
    const cz = (pos.getZ(tri) + pos.getZ(tri + 1) + pos.getZ(tri + 2)) / 3;
    const checker = (Math.floor(cx / 8) + Math.floor(cz / 8)) & 1;
    const col = SURFACE_COLORS[ground.surface(cx, cz)][checker];
    for (let k = 0; k < 3; k++) col.toArray(colors, (tri + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  // Road centre line.
  const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.25, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xeeeeee }), 100);
  const m = new THREE.Matrix4();
  for (let i = 0; i < dashes.count; i++) {
    const z = -300 + i * 6;
    dashes.setMatrixAt(i, m.makeTranslation(0, ground.height(0, z) + 0.03, z));
  }
  scene.add(dashes);

  // Instanced low-poly trees on the grass only.
  const treeGeo = new THREE.ConeGeometry(1.6, 5, 5).translate(0, 2.5, 0);
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ color: 0x2d6a2d, flatShading: true }), 300);
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < trees.count; ) {
    const x = (rnd() - 0.5) * 560;
    const z = (rnd() - 0.5) * 560;
    if (ground.surface(x, z) !== 'grass' || Math.abs(x) < 12) continue;
    const s = 0.7 + rnd() * 0.8;
    m.makeScale(s, s, s).setPosition(x, ground.height(x, z), z);
    trees.setMatrixAt(i++, m);
  }
  scene.add(trees);

  return scene;
}

import * as THREE from 'three';

/** Simple M0 environment: checker ground, sky colour, fog, a road strip and instanced trees. */
export function createTestScene() {
  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0x9fc8f0);
  scene.background = skyColor;
  scene.fog = new THREE.Fog(skyColor, 60, 300);

  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a4a30, 1.2));
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.8);
  sun.position.set(50, 100, 30);
  scene.add(sun);

  // Tiny 2x2-pixel checker texture, scaled up with nearest filtering.
  const data = new Uint8Array([90, 150, 60, 255, 70, 125, 50, 255, 70, 125, 50, 255, 90, 150, 60, 255]);
  const tex = new THREE.DataTexture(data, 2, 2);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(100, 100);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 1000), new THREE.MeshLambertMaterial({ color: 0x505055 }));
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  scene.add(road);

  // Instanced low-poly trees: one draw call for all of them.
  const treeGeo = new THREE.ConeGeometry(1.6, 5, 5).translate(0, 2.5, 0);
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ color: 0x2d6a2d, flatShading: true }), 400);
  const m = new THREE.Matrix4();
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < trees.count; ) {
    const x = (rnd() - 0.5) * 600;
    const z = (rnd() - 0.5) * 600;
    if (Math.abs(x) < 8) continue; // keep the road clear
    const s = 0.7 + rnd() * 0.8;
    m.makeScale(s, s, s).setPosition(x, 0, z);
    trees.setMatrixAt(i++, m);
  }
  scene.add(trees);

  return scene;
}

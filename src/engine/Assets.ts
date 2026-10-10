import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Loads the Blender-generated .glb files and exposes their meshes by name.
 * Every mesh gets one shared flat-shaded Lambert material driven by vertex
 * colours (the Blender material only exists so the exporter writes COLOR_0).
 */
export class Assets {
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private meshes = new Map<string, THREE.Mesh>();

  async load(files: string[]) {
    const loader = new GLTFLoader();
    const base = `${import.meta.env.BASE_URL}assets/models/`;
    const gltfs = await Promise.all(files.map((f) => loader.loadAsync(`${base}${f}.glb`)));
    for (const gltf of gltfs) {
      gltf.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        // Bake the node transform so geometry is in the asset's own space.
        o.updateWorldMatrix(true, false);
        const geo = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.name = o.name;
        this.meshes.set(o.name, mesh);
      });
    }
    return this;
  }

  /** A new Mesh sharing geometry and material. */
  mesh(name: string) {
    return new THREE.Mesh(this.geometry(name), this.material);
  }

  geometry(name: string) {
    const m = this.meshes.get(name);
    if (!m) throw new Error(`Asset mesh "${name}" not found`);
    return m.geometry;
  }
}

export interface Livery {
  primary: number; // sRGB hex
  secondary: number;
}

const KEY_PRIMARY = new THREE.Color(1, 0, 1); // magenta in the Blender palette
const KEY_SECONDARY = new THREE.Color(0, 1, 1); // cyan

/** Clone a geometry, replacing the livery key colours with real paint. */
export function applyLivery(geometry: THREE.BufferGeometry, livery: Livery) {
  const geo = geometry.clone();
  const src = geo.getAttribute('color') as THREE.BufferAttribute;
  const colors = new THREE.Float32BufferAttribute(new Float32Array(src.count * 3), 3);
  const primary = new THREE.Color(livery.primary);
  const secondary = new THREE.Color(livery.secondary);
  const c = new THREE.Color();
  const close = (a: THREE.Color, b: THREE.Color) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 0.05;
  for (let i = 0; i < src.count; i++) {
    c.setRGB(src.getX(i), src.getY(i), src.getZ(i));
    if (close(c, KEY_PRIMARY)) c.copy(primary);
    else if (close(c, KEY_SECONDARY)) c.copy(secondary);
    colors.setXYZ(i, c.r, c.g, c.b);
  }
  geo.setAttribute('color', colors);
  return geo;
}

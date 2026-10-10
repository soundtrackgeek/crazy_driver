import * as THREE from 'three';
import type { Vehicle } from '../physics/Vehicle';
import { applyLivery, type Assets, type Livery } from '../engine/Assets';

/**
 * Visual car: the Blender body (recoloured with a livery) plus four wheel
 * instances that spin, steer and follow the suspension.
 */
export class CarView {
  readonly root = new THREE.Group();
  private wheels: THREE.Object3D[] = [];

  constructor(
    private vehicle: Vehicle,
    assets: Assets,
    livery: Livery,
    model = 'car_rally',
  ) {
    const body = new THREE.Mesh(applyLivery(assets.geometry(`${model}_body`), livery), assets.material);
    this.root.add(body);

    const wheelGeo = assets.geometry(`${model}_wheel`);
    for (const w of vehicle.wheels) {
      const pivot = new THREE.Group(); // steering + suspension travel
      const spin = new THREE.Group(); // rolling
      const mesh = new THREE.Mesh(wheelGeo, assets.material);
      if (!w.left) mesh.rotation.y = Math.PI; // rim faces outwards on the right side
      spin.add(mesh);
      pivot.add(spin);
      pivot.position.copy(w.anchor);
      this.root.add(pivot);
      this.wheels.push(pivot);
    }
  }

  /** Interpolate between the last two physics states for smooth rendering. */
  sync(alpha: number) {
    const v = this.vehicle;
    this.root.position.lerpVectors(v.prevPos, v.pos, alpha);
    this.root.quaternion.slerpQuaternions(v.prevQuat, v.quat, alpha);
    const p = v.params;
    v.wheels.forEach((w, i) => {
      const pivot = this.wheels[i];
      const travel = w.contact ? p.restLength - w.compression : p.restLength;
      pivot.position.set(w.anchor.x, w.anchor.y - travel, w.anchor.z);
      pivot.rotation.y = -w.steer;
      pivot.children[0].rotation.x = w.spin;
    });
  }
}

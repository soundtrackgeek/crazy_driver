import * as THREE from 'three';
import type { Vehicle } from '../physics/Vehicle';

/**
 * Placeholder blocky car (replaced by the Blender .glb in M3). Wheels are
 * separate nodes so they can spin, steer and follow the suspension.
 */
export class CarView {
  readonly root = new THREE.Group();
  private wheels: THREE.Object3D[] = [];

  constructor(private vehicle: Vehicle) {
    const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 4.1), lambert(0xd02020));
    body.position.y = 0.05;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.9), lambert(0x203060));
    cabin.position.set(0, 0.55, -0.25);
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.35), lambert(0x202020));
    spoiler.position.set(0, 0.6, -1.9);
    const lights = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.15, 0.05), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
    lights.position.set(0, 0.15, -2.06);
    this.root.add(body, cabin, spoiler, lights);

    // Octagonal wheels with a light stripe so the spin is visible.
    const r = vehicle.params.wheelRadius;
    const tyreGeo = new THREE.CylinderGeometry(r, r, 0.3, 8).rotateZ(Math.PI / 2);
    const tyre = lambert(0x1a1a1a);
    const stripeGeo = new THREE.BoxGeometry(0.32, r * 1.6, 0.1);
    const stripe = lambert(0xc0c0c0);
    for (const w of vehicle.wheels) {
      const pivot = new THREE.Group(); // steering + suspension travel
      const spin = new THREE.Group(); // rolling
      spin.add(new THREE.Mesh(tyreGeo, tyre), new THREE.Mesh(stripeGeo, stripe));
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

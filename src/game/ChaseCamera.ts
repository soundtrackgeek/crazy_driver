import * as THREE from 'three';

/** Spring-damped chase camera with a speed-based FOV kick. */
export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.5, 600);
  private pos = new THREE.Vector3(0, 4, -10);
  private offset = new THREE.Vector3();

  update(target: THREE.Object3D, speed: number, dt: number) {
    this.offset.set(0, 2.6, -7).applyAxisAngle(THREE.Object3D.DEFAULT_UP, target.rotation.y).add(target.position);
    this.pos.lerp(this.offset, 1 - Math.exp(-8 * dt));
    this.camera.position.copy(this.pos);
    this.camera.lookAt(target.position.x, target.position.y + 1.2, target.position.z);
    const fov = 65 + Math.min(Math.abs(speed), 60) * 0.25;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}

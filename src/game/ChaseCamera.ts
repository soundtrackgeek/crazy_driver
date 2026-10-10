import * as THREE from 'three';

const _fwd = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();

/** Spring-damped chase camera with a speed-based FOV kick. */
export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.3, 600);
  distance = 7;
  height = 2.4;
  private pos = new THREE.Vector3(0, 4, -10);
  private heading = new THREE.Vector3(0, 0, 1);

  update(target: THREE.Object3D, speed: number, dt: number) {
    // Follow the car's flattened heading, smoothed so jumps and spins don't whip the camera.
    _fwd.set(0, 0, 1).applyQuaternion(target.quaternion).setY(0);
    if (_fwd.lengthSq() > 1e-4) this.heading.lerp(_fwd.normalize(), 1 - Math.exp(-6 * dt)).normalize();

    _desired.copy(target.position).addScaledVector(this.heading, -this.distance);
    _desired.y = target.position.y + this.height;
    this.pos.lerp(_desired, 1 - Math.exp(-10 * dt));
    this.camera.position.copy(this.pos);
    _look.copy(target.position).addScaledVector(this.heading, 2);
    _look.y += 1;
    this.camera.lookAt(_look);

    const fov = 65 + Math.min(Math.abs(speed), 60) * 0.25;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}

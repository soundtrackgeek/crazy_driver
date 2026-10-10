import * as THREE from 'three';
import type { Controls } from '../engine/Input';

/**
 * Placeholder car for M0: a box driven with trivial kinematics, just to prove
 * the loop, input and camera are wired up. Replaced by real physics in M1.
 */
export class TestCar {
  readonly mesh = new THREE.Group();
  readonly position = new THREE.Vector3();
  speed = 0;
  heading = 0;
  private prevPosition = new THREE.Vector3();
  private prevHeading = 0;

  constructor() {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4), new THREE.MeshLambertMaterial({ color: 0xd02020 }));
    body.position.y = 0.6;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.8), new THREE.MeshLambertMaterial({ color: 0x203060 }));
    cabin.position.set(0, 1.15, -0.2);
    this.mesh.add(body, cabin);
  }

  update(dt: number, c: Controls) {
    this.prevPosition.copy(this.position);
    this.prevHeading = this.heading;

    if (c.reset) {
      this.position.set(0, 0, 0);
      this.speed = 0;
      this.heading = 0;
    }
    const accel = c.throttle * 18 - c.brake * (this.speed > 0 ? 30 : 10);
    this.speed += accel * dt;
    this.speed *= 1 - 0.4 * dt; // drag
    this.speed = THREE.MathUtils.clamp(this.speed, -10, 60);
    const turn = c.steer * Math.min(1, Math.abs(this.speed) / 8) * 1.8;
    this.heading -= turn * dt * Math.sign(this.speed);
    this.position.x += Math.sin(this.heading) * this.speed * dt;
    this.position.z += Math.cos(this.heading) * this.speed * dt;
  }

  /** Interpolate between the last two simulation states for smooth rendering. */
  sync(alpha: number) {
    this.mesh.position.lerpVectors(this.prevPosition, this.position, alpha);
    this.mesh.rotation.y = this.prevHeading + (this.heading - this.prevHeading) * alpha;
  }
}

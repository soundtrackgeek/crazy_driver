import * as THREE from 'three';
import type { CameraMode } from './Settings';

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();

const MODES: Record<Exclude<CameraMode, 'bumper'>, { distance: number; height: number }> = {
  chase: { distance: 7, height: 2.4 },
  far: { distance: 11, height: 3.6 },
};
const BASE_FOV = 65;
const MAX_HFOV = THREE.MathUtils.degToRad(105); // keep ultra-wide screens from stretching the edges

/**
 * Race camera: spring-damped chase (near/far) or a rigid bumper view, with a
 * speed-based FOV kick and trauma-style shake for landings, impacts and rough ground.
 */
export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.3, 600);
  mode: CameraMode = 'chase';
  /** Optional overrides (debugging / editor). */
  distance: number | null = null;
  height: number | null = null;
  private pos = new THREE.Vector3(0, 4, -10);
  private heading = new THREE.Vector3(0, 0, 1);
  private trauma = 0;
  private time = 0;

  /** Add shake; 0..1, decays over about a second. */
  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Jump straight to the target (after respawns / new races). */
  snap() {
    this.pos.set(Infinity, 0, 0);
  }

  update(target: THREE.Object3D, speed: number, dt: number) {
    this.time += dt;
    const cam = this.camera;
    if (this.mode === 'bumper') {
      _fwd.set(0, 0, 1).applyQuaternion(target.quaternion);
      _up.set(0, 1, 0).applyQuaternion(target.quaternion);
      cam.position.copy(target.position).addScaledVector(_fwd, 1.0).addScaledVector(_up, 0.75);
      cam.up.copy(_up);
      cam.lookAt(_look.copy(cam.position).addScaledVector(_fwd, 10));
      this.pos.copy(cam.position);
    } else {
      const m = MODES[this.mode];
      const distance = this.distance ?? m.distance;
      const height = this.height ?? m.height;
      // Follow the car's flattened heading, smoothed so jumps and spins don't whip the camera.
      _fwd.set(0, 0, 1).applyQuaternion(target.quaternion).setY(0);
      if (_fwd.lengthSq() > 1e-4) this.heading.lerp(_fwd.normalize(), 1 - Math.exp(-6 * dt)).normalize();
      _desired.copy(target.position).addScaledVector(this.heading, -distance);
      _desired.y = target.position.y + height;
      if (!Number.isFinite(this.pos.x) || this.pos.distanceToSquared(_desired) > 60 * 60) this.pos.copy(_desired);
      else this.pos.lerp(_desired, 1 - Math.exp(-10 * dt));
      cam.position.copy(this.pos);
      cam.up.set(0, 1, 0);
      _look.copy(target.position).addScaledVector(this.heading, 2);
      _look.y += 1;
      cam.lookAt(_look);
    }

    // Shake: smooth pseudo-random wobble scaled by trauma².
    if (this.trauma > 0.001) {
      const s = this.trauma * this.trauma;
      const t = this.time * 30;
      cam.position.x += (Math.sin(t * 1.3) + Math.sin(t * 2.9)) * 0.12 * s;
      cam.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1)) * 0.1 * s;
      cam.rotation.z += Math.sin(t * 2.3) * 0.02 * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.4);
    }

    // FOV kick with speed, capped so very wide windows don't distort.
    let fov = BASE_FOV + Math.min(Math.abs(speed), 60) * (this.mode === 'bumper' ? 0.15 : 0.25);
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * cam.aspect);
    if (hfov > MAX_HFOV) fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(MAX_HFOV / 2) / cam.aspect));
    if (Math.abs(fov - cam.fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}

import * as THREE from 'three';
import type { Vehicle } from './Vehicle';

const RADIUS = 1.05;
const OFFSET = 1.15; // circle centres at ±OFFSET along the car
const RESTITUTION = 0.3;

const _fa = new THREE.Vector3();
const _fb = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();
const _j = new THREE.Vector3();

/**
 * Arcade car-vs-car contacts: each car is two circles in the ground plane.
 * Overlaps are pushed apart and the closing speed is removed with an impulse
 * applied at the contact point (so a nudge on the rear quarter spins a car).
 */
export function collideCars(cars: Vehicle[]) {
  for (let i = 0; i < cars.length; i++) {
    for (let k = i + 1; k < cars.length; k++) {
      const A = cars[i];
      const B = cars[k];
      // Cheap reject.
      if (Math.abs(A.pos.x - B.pos.x) > 6 || Math.abs(A.pos.z - B.pos.z) > 6 || Math.abs(A.pos.y - B.pos.y) > 3) continue;
      _fa.set(0, 0, 1).applyQuaternion(A.quat).setY(0).normalize();
      _fb.set(0, 0, 1).applyQuaternion(B.quat).setY(0).normalize();
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          _a.copy(A.pos).addScaledVector(_fa, sa * OFFSET);
          _b.copy(B.pos).addScaledVector(_fb, sb * OFFSET);
          _n.subVectors(_b, _a).setY(0);
          const d = _n.length();
          if (d >= RADIUS * 2 || d < 1e-4) continue;
          _n.divideScalar(d);
          const pen = RADIUS * 2 - d;
          A.pos.addScaledVector(_n, -pen / 2);
          B.pos.addScaledVector(_n, pen / 2);

          const contact = _a.addScaledVector(_n, RADIUS);
          const vrel = B.velocityAt(contact).sub(A.velocityAt(contact)).dot(_n);
          if (vrel >= 0) continue;
          const j = (-(1 + RESTITUTION) * vrel) / (1 / A.params.mass + 1 / B.params.mass);
          _j.copy(_n).multiplyScalar(j);
          B.applyImpulse(_j, contact);
          A.applyImpulse(_j.negate(), contact);
          A.wallHit = Math.max(A.wallHit, -vrel);
          B.wallHit = Math.max(B.wallHit, -vrel);
        }
      }
    }
  }
}

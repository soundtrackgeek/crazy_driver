import * as THREE from 'three';
import type { Controls } from '../engine/Input';
import { SURFACES, groundNormal, type Ground, type Surface } from './Ground';
import { defaultParams, type VehicleParams } from './VehicleParams';

export interface Wheel {
  anchor: THREE.Vector3; // local-space suspension mount
  front: boolean;
  left: boolean;
  compression: number;
  contact: boolean;
  steer: number;
  spin: number; // accumulated rotation angle for rendering
  slip: number; // excess force beyond grip, 0..1+
  surface: Surface;
  load: number;
}

// Scratch vectors (the sim is single-threaded, so sharing is safe).
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wf = new THREE.Vector3();
const _ws = new THREE.Vector3();
const _p = new THREE.Vector3();
const _r = new THREE.Vector3();
const _pv = new THREE.Vector3();
const _f = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _qInv = new THREE.Quaternion();
const _dq = new THREE.Quaternion();

/** Horizontal body corners (local) used for wall collisions. */
const WALL_CORNERS = [-1, 1].flatMap((x) => [-2.15, 2.15].map((z) => new THREE.Vector3(x * 0.95, 0.1, z)));

/** Body corners (local) used for body-vs-ground penalty collisions. */
const CORNERS = [-1, 1].flatMap((x) =>
  [-0.35, 0.65].flatMap((y) => [-2.1, 2.1].map((z) => new THREE.Vector3(x * 0.9, y, z))),
);

/**
 * Arcade rigid-body car: one body, four raycast suspension springs, a simple
 * grip-budget tyre model and an automatic gearbox. Car-local axes: +Z forward,
 * +Y up, -X right.
 */
export class Vehicle {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  readonly angVel = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly prevQuat = new THREE.Quaternion();

  readonly wheels: Wheel[];
  gear = 1; // -1 = reverse
  rpm = 0;
  steer = 0;
  speed = 0; // signed forward speed, m/s
  slip = 0; // 0..1 overall tyre slip, for sound/particles later
  grounded = 0; // wheels in contact
  wallHit = 0; // impact speed of the last wall hit this step (for sound/shake later)

  private force = new THREE.Vector3();
  private torque = new THREE.Vector3();
  private inertia = new THREE.Vector3();
  private shiftTimer = 0;
  private flipTimer = 0;
  private resetHeld = false;

  constructor(
    private ground: Ground,
    public params: VehicleParams = defaultParams(),
  ) {
    const p = params;
    this.wheels = [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ].map(([front, left]) => ({
      anchor: new THREE.Vector3(left ? p.halfTrack : -p.halfTrack, p.anchorHeight, front ? p.frontAxle : p.rearAxle),
      front,
      left,
      compression: 0,
      contact: false,
      steer: 0,
      spin: 0,
      slip: 0,
      surface: 'asphalt' as Surface,
      load: 0,
    }));
    this.updateInertia();
    this.reset(new THREE.Vector3(0, 0, 0), 0);
  }

  /** Box inertia for a 1.8 x 1.3 x 4.2 m body, scaled for arcade responsiveness. */
  updateInertia() {
    const m = (this.params.mass / 12) * this.params.inertiaScale;
    const [w, h, l] = [1.8, 1.3, 4.2];
    this.inertia.set(m * (h * h + l * l), m * (w * w + l * l), m * (w * w + h * h));
  }

  reset(at: THREE.Vector3, yaw: number) {
    this.pos.set(at.x, this.ground.height(at.x, at.z) + 0.9, at.z);
    this.quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.gear = 1;
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
  }

  /** Put the car back on the track centre (or upright in place on open ground). */
  respawn() {
    const r = this.ground.respawn?.(this.pos.x, this.pos.z);
    if (r) this.reset(r.pos, r.yaw);
    else this.reset(this.pos, this.yaw);
  }

  get yaw() {
    _fwd.set(0, 0, 1).applyQuaternion(this.quat);
    return Math.atan2(_fwd.x, _fwd.z);
  }

  private addForceAt(f: THREE.Vector3, point: THREE.Vector3) {
    this.force.add(f);
    this.torque.add(_t.subVectors(point, this.pos).cross(f));
  }

  step(dt: number, c: Controls) {
    const p = this.params;
    const g = this.ground;
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);

    // Manual reset (edge-triggered) and automatic flip recovery.
    if (c.reset && !this.resetHeld) this.respawn();
    this.resetHeld = c.reset;

    const up = _up.set(0, 1, 0).applyQuaternion(this.quat);
    const fwd = _fwd.set(0, 0, 1).applyQuaternion(this.quat);
    const right = _right.set(-1, 0, 0).applyQuaternion(this.quat);

    if (up.y < 0.3 && this.vel.length() < 3) {
      this.flipTimer += dt;
      if (this.flipTimer > 1.5) {
        this.flipTimer = 0;
        this.reset(this.pos, Math.atan2(fwd.x, fwd.z));
        return;
      }
    } else this.flipTimer = 0;

    this.force.set(0, -9.81 * p.mass, 0);
    this.torque.set(0, 0, 0);
    this.speed = this.vel.dot(fwd);
    const absSpeed = Math.abs(this.speed);

    // --- Steering: speed-sensitive, rate-limited.
    const steerLimit = p.maxSteer * THREE.MathUtils.lerp(1, p.highSpeedSteer, Math.min(absSpeed / 50, 1));
    const steerTarget = c.steer * steerLimit;
    const maxDelta = p.steerSpeed * steerLimit * dt;
    this.steer += THREE.MathUtils.clamp(steerTarget - this.steer, -maxDelta, maxDelta);

    // --- Gearbox and engine.
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (this.gear > 0 && c.brake > 0 && c.throttle === 0 && this.speed < 0.5) this.gear = -1;
    else if (this.gear < 0 && c.throttle > 0 && this.speed > -0.5) this.gear = 1;

    const ratio = (this.gear < 0 ? p.reverseRatio : p.gears[this.gear - 1]) * p.finalDrive;
    const wheelRpm = (absSpeed / p.wheelRadius) * (60 / (2 * Math.PI));
    this.rpm = Math.max(p.idleRpm, wheelRpm * ratio);
    if (this.gear > 0 && this.shiftTimer === 0) {
      if (this.rpm > p.shiftUp && this.gear < p.gears.length) {
        this.gear++;
        this.shiftTimer = 0.35;
      } else if (this.rpm < p.shiftDown && this.gear > 1) {
        this.gear--;
        this.shiftTimer = 0.35;
      }
    }
    const throttleIn = this.gear < 0 ? c.brake : c.throttle;
    const brakeIn = this.gear < 0 ? c.throttle : c.brake;
    const x = this.rpm / p.redline;
    const revLimited = this.gear < 0 && -this.speed > p.maxReverseSpeed;
    const torque = x >= 1 || revLimited ? 0 : p.maxTorque * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(x * 1.1, 1)));
    const driveTotal = throttleIn * torque * ratio / p.wheelRadius * (this.gear < 0 ? -1 : 1);

    // --- Wheels: suspension + tyres.
    this.grounded = 0;
    let slipSum = 0;
    for (const w of this.wheels) {
      const anchor = _p.copy(w.anchor).applyQuaternion(this.quat).add(this.pos);
      const gh = g.height(anchor.x, anchor.z);
      // Distance along -up from anchor to the ground plane (vertical-ray approximation).
      const dist = (anchor.y - gh) / Math.max(up.y, 0.2);
      const reach = p.restLength + p.wheelRadius;
      const prevComp = w.compression;
      w.steer = w.front ? this.steer : 0;

      if (dist > reach || up.y <= 0) {
        w.contact = false;
        w.compression = 0;
        w.load = 0;
        w.slip = 0;
        w.spin += (this.speed / p.wheelRadius) * dt;
        continue;
      }
      w.contact = true;
      this.grounded++;
      // Past full travel a stiff bump stop takes over so the body doesn't hit the ground.
      const bottomOut = Math.max(0, reach - dist - p.restLength);
      w.compression = Math.min(reach - dist, p.restLength);
      w.surface = g.surface(anchor.x, anchor.z);
      const surf = SURFACES[w.surface];

      // Spring + damper along body up.
      const compVel = (w.compression - prevComp) / dt;
      let load = p.springK * w.compression + p.damperK * compVel + bottomOut * p.springK * 20;
      // Anti-roll bar: transfer load between left and right of the same axle.
      const other = this.wheels.find((o) => o.front === w.front && o.left !== w.left)!;
      load += (w.compression - other.compression) * p.antiRollK;
      load = Math.max(0, load);
      w.load = load;
      this.addForceAt(_f.copy(up).multiplyScalar(load), anchor);

      // Tyre frame projected onto the ground plane.
      const n = groundNormal(g, anchor.x, anchor.z, _n);
      const cs = Math.cos(w.steer);
      const sn = Math.sin(w.steer);
      const wf = _wf.copy(fwd).multiplyScalar(cs).addScaledVector(right, sn);
      wf.addScaledVector(n, -wf.dot(n)).normalize();
      const ws = _ws.crossVectors(n, wf).negate(); // points to the car's right

      // Contact point and its velocity.
      const contact = anchor.addScaledVector(up, -dist);
      _r.subVectors(contact, this.pos);
      const pv = _pv.crossVectors(this.angVel, _r).add(this.vel);
      const vLong = pv.dot(wf);
      const vLat = pv.dot(ws);

      // Grip budget.
      const handbrake = c.handbrake && !w.front;
      let mu = (w.front ? p.frontGrip : p.rearGrip) * surf.grip;
      if (handbrake) mu *= p.handbrakeGrip;
      const maxF = mu * load;

      let fLat = -vLat * p.lateralStiffness;
      const share = w.front ? p.frontDrive / 2 : (1 - p.frontDrive) / 2;
      let fLong = driveTotal * share;
      // Braking, rolling resistance, handbrake lock: oppose vLong but never reverse it.
      const stopF = (Math.abs(vLong) * p.mass) / 4 / dt;
      let resist = brakeIn * p.brakeForce * (w.front ? p.frontBrakeBias : 1 - p.frontBrakeBias) / 2;
      resist += surf.rolling * load * Math.min(Math.abs(vLong), 10) + 0.02 * load * (throttleIn === 0 ? 1 : 0);
      if (handbrake) resist += maxF * 0.8;
      fLong -= Math.sign(vLong) * Math.min(resist, stopF);

      const total = Math.hypot(fLat, fLong);
      w.slip = 0;
      if (total > maxF && total > 0) {
        w.slip = Math.min(1, (total - maxF) / (maxF + 1));
        const k = maxF / total;
        fLat *= k;
        fLong *= k;
      }
      slipSum += w.slip;

      _f.copy(wf).multiplyScalar(fLong).addScaledVector(ws, fLat);
      this.addForceAt(_f, contact.addScaledVector(up, p.forceLift));
      // Visual wheel spin: wheels spin up when slipping under power.
      const spinBoost = w.slip > 0.1 && throttleIn > 0 && !handbrake ? 1 + w.slip * 2 : handbrake ? 0 : 1;
      w.spin += (vLong / p.wheelRadius) * spinBoost * dt;
    }
    this.slip = slipSum / 4;

    // --- Aerodynamics.
    const v2 = this.vel.lengthSq();
    this.force.addScaledVector(this.vel, -p.drag * Math.sqrt(v2));
    if (this.grounded > 0) this.force.addScaledVector(up, -p.downforce * v2);

    // --- Handling assists / air control.
    const yawRate = this.angVel.dot(up);
    if (this.grounded > 0) {
      const damp = p.yawDamping * (1 - Math.abs(c.steer)) * (c.handbrake ? 0 : 1);
      this.angVel.addScaledVector(up, -yawRate * Math.min(1, damp * dt));
    } else {
      // Arcade self-levelling: rotate "up" back towards world up and damp pitch/roll spin.
      this.angVel.addScaledVector(up, -c.steer * p.airControl * dt);
      _t.set(0, 1, 0).cross(up).negate(); // axis that turns up towards +Y
      this.angVel.addScaledVector(_t, p.airStabilize * dt);
      const tumble = _n.copy(this.angVel).addScaledVector(up, -yawRate);
      this.angVel.addScaledVector(tumble, -Math.min(1, p.airStabilize * 0.5 * dt));
    }

    // --- Body vs ground penalty contacts (roofs, noses, landings).
    for (const corner of CORNERS) {
      const pt = _p.copy(corner).applyQuaternion(this.quat).add(this.pos);
      const pen = g.height(pt.x, pt.z) - pt.y;
      if (pen <= 0) continue;
      const n = groundNormal(g, pt.x, pt.z, _n);
      _r.subVectors(pt, this.pos);
      const pv = _pv.crossVectors(this.angVel, _r).add(this.vel);
      const vn = pv.dot(n);
      const fn = Math.max(0, pen * p.mass * 300 - vn * p.mass * 12);
      _f.copy(n).multiplyScalar(fn);
      // Scrape friction on the body (Coulomb-limited so it can't trip the car over).
      const tangent = pv.addScaledVector(n, -vn);
      const tv = tangent.length();
      if (tv > 1e-3) _f.addScaledVector(tangent, -Math.min(p.mass * 1.5 * tv, fn * 0.3) / tv);
      this.addForceAt(_f, pt);
    }

    // --- Integrate (semi-implicit Euler).
    this.vel.addScaledVector(this.force, dt / p.mass);
    this.angVel.addScaledVector(this.applyInvInertia(this.torque), dt);
    this.angVel.multiplyScalar(1 - 0.5 * dt);

    this.pos.addScaledVector(this.vel, dt);
    _dq.set(this.angVel.x, this.angVel.y, this.angVel.z, 0).multiply(this.quat);
    this.quat.set(
      this.quat.x + _dq.x * 0.5 * dt,
      this.quat.y + _dq.y * 0.5 * dt,
      this.quat.z + _dq.z * 0.5 * dt,
      this.quat.w + _dq.w * 0.5 * dt,
    ).normalize();

    this.collideWalls();
  }

  /** Velocity of a world-space point on the body (new vector). */
  velocityAt(point: THREE.Vector3) {
    return new THREE.Vector3().subVectors(point, this.pos).cross(this.angVel).negate().add(this.vel);
  }

  /** Apply an instantaneous impulse (N·s) at a world-space point. */
  applyImpulse(impulse: THREE.Vector3, point: THREE.Vector3) {
    this.vel.addScaledVector(impulse, 1 / this.params.mass);
    this.angVel.add(this.applyInvInertia(new THREE.Vector3().subVectors(point, this.pos).cross(impulse)));
  }

  /** World-space inverse inertia applied to v (in place). */
  private applyInvInertia(v: THREE.Vector3) {
    _qInv.copy(this.quat).invert();
    v.applyQuaternion(_qInv);
    v.set(v.x / this.inertia.x, v.y / this.inertia.y, v.z / this.inertia.z);
    return v.applyQuaternion(this.quat);
  }

  /** Impulse-based collisions of the body's four horizontal corners with track walls. */
  private collideWalls() {
    const g = this.ground;
    if (!g.wall) return;
    const restitution = 0.15;
    const friction = 0.35;
    this.wallHit = 0;
    for (const corner of WALL_CORNERS) {
      const pt = _p.copy(corner).applyQuaternion(this.quat).add(this.pos);
      const hit = g.wall(pt.x, pt.z);
      if (!hit) continue;
      const n = _n.set(hit.nx, 0, hit.nz);
      this.pos.addScaledVector(n, hit.penetration);
      _r.subVectors(pt, this.pos);
      const pv = _pv.crossVectors(this.angVel, _r).add(this.vel);
      const vn = pv.dot(n);
      if (vn >= 0) continue;

      // Effective mass along the normal: 1/m + n · ((I⁻¹ (r × n)) × r)
      const rn = this.applyInvInertia(_t.crossVectors(_r, n));
      const k = 1 / this.params.mass + n.dot(rn.cross(_r));
      const j = (-(1 + restitution) * vn) / k;
      // Coulomb friction along the wall slows scraping.
      const tangent = pv.addScaledVector(n, -vn);
      const vt = tangent.length();
      const jt = vt > 1e-3 ? Math.min(friction * j, vt * this.params.mass * 0.25) / vt : 0;
      _f.copy(n).multiplyScalar(j).addScaledVector(tangent, -jt);

      this.vel.addScaledVector(_f, 1 / this.params.mass);
      this.angVel.add(this.applyInvInertia(_t.crossVectors(_r, _f)));
      this.wallHit = Math.max(this.wallHit, -vn);
    }
  }
}
